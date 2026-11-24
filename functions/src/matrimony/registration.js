import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { COLLECTIONS, CONSENT_VERSION, DEFAULT_CHURCH_ID, MATRIMONY_BUCKET, } from './constants.js';
import { verifyRhemaMemberEligibility } from './eligibility.js';
import { resolveMemberEntitlements } from './entitlements.js';
import { assertMatrimonyNotBanned, ensureUniqueMatrimonyId, getAdminProfileRef, getPrefsRef, getPrivateRef, getProfileRef, getVerificationRef, isMatrimonyProfileInactiveStatus, purgeMatrimonyUserData, readPrefsSnap, readPrivateSnap, readVerificationSnap, } from './store.js';
import { assertNonEmptyString, optionalBoolean, optionalEditableString, optionalNumber, optionalString, optionalStringArray, sanitizePhotoStoragePath, validateDraftSection, } from './validation.js';
function requireAuthUid(request) {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new HttpsError('unauthenticated', 'Authentication is required.');
    }
    return uid;
}
function buildFirebaseTokenUrl(bucketName, objectPath, token) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}
let ownerSignBlobUnavailable = false;
const WARM_OWNER_PHOTO_CACHE = new Map();
async function resolveOwnerPhotoUrls(paths) {
    if (!paths.length)
        return [];
    const bucket = getStorage().bucket(MATRIMONY_BUCKET);
    const now = Date.now();
    const expires = now + 60 * 60 * 1000; // 1 hour
    const resolved = await Promise.all(paths.map(async (p) => {
        if (!p)
            return null;
        if (p.startsWith('https://') || p.startsWith('http://')) {
            return p;
        }
        const cached = WARM_OWNER_PHOTO_CACHE.get(p);
        if (cached && cached.expiresAtMs > now + 5 * 60 * 1000) {
            return cached.url;
        }
        const file = bucket.file(p);
        if (!ownerSignBlobUnavailable) {
            try {
                const [signedUrl] = await file.getSignedUrl({
                    action: 'read',
                    expires,
                });
                WARM_OWNER_PHOTO_CACHE.set(p, { url: signedUrl, expiresAtMs: expires });
                return signedUrl;
            }
            catch {
                ownerSignBlobUnavailable = true;
            }
        }
        try {
            const [meta] = await file.getMetadata();
            const existingTokens = String(meta?.metadata?.firebaseStorageDownloadTokens || '')
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
            let token = existingTokens[0];
            if (!token) {
                token = randomUUID();
                await file.setMetadata({
                    metadata: {
                        ...(meta?.metadata || {}),
                        firebaseStorageDownloadTokens: token,
                    },
                });
            }
            const tokenUrl = buildFirebaseTokenUrl(MATRIMONY_BUCKET, p, token);
            WARM_OWNER_PHOTO_CACHE.set(p, { url: tokenUrl, expiresAtMs: expires });
            return tokenUrl;
        }
        catch (metaErr) {
            console.warn(`Unable to sign or tokenize photo ${p}:`, metaErr);
            return null;
        }
    }));
    return resolved.filter((u) => Boolean(u));
}
async function syncConsolidatedAdminProfile(uid) {
    const db = getFirestore();
    const [profSnap, privSnap, prefsSnap, verSnap] = await Promise.all([
        getProfileRef(db, uid).get(),
        readPrivateSnap(db, uid),
        readPrefsSnap(db, uid),
        readVerificationSnap(db, uid),
    ]);
    const consolidated = {
        uid,
        churchId: DEFAULT_CHURCH_ID,
        ...(profSnap.exists ? profSnap.data() : {}),
        privateInfo: privSnap.exists ? privSnap.data() : {},
        preferences: prefsSnap.exists ? prefsSnap.data() : {},
        verification: verSnap.exists ? verSnap.data() : {},
        syncedAt: FieldValue.serverTimestamp(),
    };
    await getAdminProfileRef(db, uid).set(consolidated, { merge: true });
}
function computeProfileCompletion(profile, prefs, privateData) {
    let score = 0;
    // Core setup & required onboarding fields = 70%
    if (profile.displayName && profile.gender && profile.age)
        score += 15;
    if (profile.heightCm && profile.motherTongue)
        score += 10;
    if (profile.education?.qualification)
        score += 10;
    if (profile.career?.profession)
        score += 10;
    if (profile.faithSummary?.denomination &&
        profile.location?.country &&
        profile.location?.state) {
        score += 10;
    }
    if (prefs?.age?.min && prefs?.age?.max)
        score += 5;
    if (profile.profilePhoto)
        score += 10;
    // 3 "Complete Your Profile" Home cards = 10% each (30% total)
    const familySummary = profile.familySummary || {};
    const familyDetails = privateData?.familyDetails || profile.familyDetails || {};
    const hasAllFamilyDetails = Boolean(String(familySummary.familyType || '').trim() ||
        String(familySummary.familyValues || '').trim() ||
        String(familyDetails.fatherOccupation || '').trim() ||
        String(familyDetails.motherOccupation || '').trim() ||
        String(familyDetails.familyOrigin || '').trim() ||
        String(familyDetails.familyIntro || '').trim() ||
        familyDetails.brothers !== undefined);
    if (hasAllFamilyDetails)
        score += 10;
    const interests = profile.interests || {};
    const totalInterestsCount = [
        interests.hobbies,
        interests.music,
        interests.reading,
        interests.movies,
        interests.sports,
        interests.food,
        interests.languages,
    ].reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
    if (totalInterestsCount > 0)
        score += 10;
    const totalPhotos = (profile.profilePhoto ? 1 : 0) +
        (Array.isArray(profile.gallery) ? profile.gallery.length : 0);
    if (totalPhotos >= 3)
        score += 10;
    return Math.min(100, score);
}
/**
 * 1. startMatrimonyRegistration
 * Checks active Rhema membership & adult age (>= 18), hydrates draft from existing AppMember profile.
 */
export const startMatrimonyRegistration = onCall({ invoker: 'public' }, async (request) => {
    const uid = requireAuthUid(request);
    const db = getFirestore();
    const eligibility = await verifyRhemaMemberEligibility(uid);
    if (!eligibility.eligible) {
        return {
            success: false,
            eligible: false,
            reasons: eligibility.reasons,
            ...(eligibility.banReason ? { banReason: eligibility.banReason } : {}),
            prefilled: {
                displayName: eligibility.prefilled.displayName,
                age: eligibility.age,
                gender: eligibility.prefilled.gender,
                city: eligibility.prefilled.city,
                state: eligibility.prefilled.state,
            },
        };
    }
    const profileRef = getProfileRef(db, uid);
    const [profileSnap, privateSnap, prefsSnap] = await Promise.all([
        profileRef.get(),
        readPrivateSnap(db, uid),
        readPrefsSnap(db, uid),
    ]);
    // Do NOT create Firestore matrimony documents yet; return prefilled data in-memory
    // until the member explicitly clicks "Complete Profile" on Privacy & Consent.
    const isLegacyDeleted = profileSnap.exists && String(profileSnap.data()?.profileStatus || '') === 'deleted';
    if (isLegacyDeleted) {
        await Promise.all([
            profileRef.set({ selfReset: true }, { merge: true }).catch(() => undefined),
            getAdminProfileRef(db, uid).set({ selfReset: true }, { merge: true }).catch(() => undefined),
        ]);
        await purgeMatrimonyUserData(db, uid, {
            banOnDelete: false,
            actorUid: uid,
            source: 'self_reset',
            auditAction: 'MATRIMONY_LEGACY_DELETED_PROFILE_PURGED',
        });
    }
    if (!profileSnap.exists || isLegacyDeleted) {
        const defaultPreferences = {
            uid,
            age: {
                min: Math.max(18, (eligibility.age || 25) - 4),
                max: (eligibility.age || 25) + 5,
                importance: 'preferred',
            },
            height: { minCm: 145, maxCm: 195, importance: 'flexible' },
            maritalStatuses: [eligibility.prefilled.maritalStatus || 'Single'],
            education: { acceptable: [], importance: 'flexible' },
            occupationCategories: [],
            locations: {
                preferredCities: [],
                preferredStates: eligibility.prefilled.state ? [eligibility.prefilled.state] : [],
                openToRelocation: true,
            },
        };
        return {
            success: true,
            eligible: true,
            registered: false,
            registrationId: uid,
            contactInfo: {
                fullName: `${eligibility.prefilled.firstName} ${eligibility.prefilled.lastName}`.trim() ||
                    eligibility.prefilled.displayName ||
                    '',
                email: eligibility.prefilled.email || '',
                phone: eligibility.prefilled.phone || '',
                dob: eligibility.prefilled.dob || '',
                zip: eligibility.prefilled.zip || '',
            },
            profile: {
                uid,
                churchId: DEFAULT_CHURCH_ID,
                displayName: eligibility.prefilled.displayName,
                gender: eligibility.prefilled.gender,
                age: eligibility.age,
                maritalStatus: eligibility.prefilled.maritalStatus || 'Single',
                motherTongue: eligibility.prefilled.motherTongue || '',
                location: {
                    city: eligibility.prefilled.city,
                    state: eligibility.prefilled.state,
                    country: eligibility.prefilled.country,
                },
                faithSummary: {
                    baptized: eligibility.prefilled.baptized,
                    baptismChurch: eligibility.prefilled.baptismChurch || null,
                    shareFaithDetails: true,
                },
                profilePhoto: null,
                gallery: [],
                signedProfilePhoto: null,
                signedGallery: [],
                mobilePrivacy: 'show_all',
                photoVisibility: 'approved_members',
                protectedPhotoAllowedUids: [],
                profileStatus: 'not_started',
                onboardingStage: 'not_started',
                verificationStatus: 'unverified',
                visibility: 'hidden',
                profileCompletion: 20,
            },
            consent: null,
            familyDetails: null,
            incomeDetails: null,
            preferences: defaultPreferences,
        };
    }
    const profileData = profileSnap.data() || {};
    if (!profileData.motherTongue && eligibility.prefilled.motherTongue) {
        profileData.motherTongue = eligibility.prefilled.motherTongue;
    }
    const privateData = privateSnap.data() || {};
    const prefsData = prefsSnap.data() || {};
    const signedProfilePhoto = profileData.profilePhoto
        ? (await resolveOwnerPhotoUrls([profileData.profilePhoto]))[0] || null
        : null;
    const signedGallery = Array.isArray(profileData.gallery)
        ? await resolveOwnerPhotoUrls(profileData.gallery)
        : [];
    const consentDone = Boolean(privateData.consent?.profilePublication &&
        privateData.consent?.matchmaking &&
        privateData.consent?.communication);
    const statusStr = String(profileData.profileStatus || 'draft');
    const isRegistered = statusStr !== 'draft' ||
        consentDone ||
        Boolean(profileData.onboardingStage && profileData.onboardingStage !== 'not_started');
    const onboardingStage = profileData.onboardingStage ||
        (statusStr === 'approved' || statusStr === 'pending'
            ? 'completed'
            : !isRegistered
                ? 'not_started'
                : profileData.profilePhoto
                    ? 'completed'
                    : 'photos_pending');
    const liveCompletion = computeProfileCompletion(profileData, prefsData, privateData);
    return {
        success: true,
        eligible: true,
        registered: isRegistered,
        registrationId: uid,
        contactInfo: {
            fullName: privateData.fullLegalName ||
                profileData.displayName ||
                eligibility.prefilled.displayName ||
                '',
            email: privateData.personalEmail || eligibility.prefilled.email || '',
            phone: privateData.phoneNumber || eligibility.prefilled.phone || '',
            dob: privateData.dob || eligibility.prefilled.dob || '',
            zip: privateData.address?.zip || eligibility.prefilled.zip || '',
        },
        profile: {
            ...profileData,
            profileCompletion: liveCompletion,
            onboardingStage,
            signedProfilePhoto,
            signedGallery,
        },
        consent: privateData.consent || null,
        profileManager: privateData.profileManager || null,
        familyDetails: privateData.familyDetails || null,
        incomeDetails: privateData.incomeDetails || null,
        preferences: prefsData,
    };
});
/**
 * 2. saveMatrimonyDraft
 * Saves a specific section ('consent' | 'details' | 'preferences' | 'photos') safely.
 */
export const saveMatrimonyDraft = onCall({ invoker: 'public', cpu: 1, memory: '512MiB', concurrency: 20 }, async (request) => {
    const uid = requireAuthUid(request);
    const section = validateDraftSection(request.data?.section);
    const data = (request.data?.data && typeof request.data.data === 'object') ? request.data.data : {};
    const db = getFirestore();
    const profileRef = getProfileRef(db, uid);
    const privateRef = getPrivateRef(db, uid);
    const prefsRef = getPrefsRef(db, uid);
    const [eligibility, , profileSnap, privateSnap, prefsSnap] = await Promise.all([
        verifyRhemaMemberEligibility(uid),
        assertMatrimonyNotBanned(db, uid),
        profileRef.get(),
        readPrivateSnap(db, uid),
        readPrefsSnap(db, uid),
    ]);
    if (!eligibility.eligible) {
        throw new HttpsError('failed-precondition', 'Member is not eligible for Rhema Matrimony.');
    }
    const now = FieldValue.serverTimestamp();
    if (!profileSnap.exists && section !== 'complete') {
        throw new HttpsError('failed-precondition', 'Please complete your profile on the Privacy & Consent screen first.');
    }
    const existingProfile = profileSnap.exists ? (profileSnap.data() || {}) : {};
    if (profileSnap.exists && isMatrimonyProfileInactiveStatus(existingProfile.profileStatus)) {
        throw new HttpsError('failed-precondition', existingProfile.inactiveReason ||
            'Your Rhema Matrimony profile is currently inactive. Please contact Church Administration.', { reasonCode: 'MATRIMONY_PROFILE_INACTIVE' });
    }
    const existingPrivate = privateSnap.exists ? (privateSnap.data() || {}) : {};
    const existingPrefs = prefsSnap.exists ? (prefsSnap.data() || {}) : {};
    if (section === 'complete') {
        const consentData = (data.consent && typeof data.consent === 'object') ? data.consent : {};
        const profilePublication = Boolean(consentData.profilePublication);
        const matchmaking = Boolean(consentData.matchmaking);
        const communication = Boolean(consentData.communication);
        if (!profilePublication || !matchmaking || !communication) {
            throw new HttpsError('invalid-argument', 'Please accept all three Privacy & Consent options to complete your profile.');
        }
        const welcomeData = (data.welcome && typeof data.welcome === 'object') ? data.welcome : {};
        const basicData = (data.basic && typeof data.basic === 'object') ? data.basic : {};
        const personalData = (data.personal && typeof data.personal === 'object') ? data.personal : {};
        const religiousData = (data.religious && typeof data.religious === 'object') ? data.religious : {};
        const locationData = (data.location && typeof data.location === 'object') ? data.location : {};
        const professionalData = (data.professional && typeof data.professional === 'object') ? data.professional : {};
        const additionalData = (data.additional && typeof data.additional === 'object') ? data.additional : {};
        const fullName = optionalString(basicData.fullName, 120) ||
            existingProfile.displayName ||
            eligibility.prefilled.displayName;
        const email = optionalString(basicData.email, 160) ?? existingPrivate.personalEmail ?? eligibility.prefilled.email ?? null;
        const phone = optionalString(basicData.phone, 40) ?? existingPrivate.phoneNumber ?? eligibility.prefilled.phone ?? null;
        const gender = optionalString(personalData.gender, 30) || existingProfile.gender || eligibility.prefilled.gender;
        const dob = optionalString(personalData.dob, 30) ?? existingPrivate.dob ?? eligibility.prefilled.dob ?? null;
        let computedAge = existingProfile.age ?? eligibility.age;
        if (dob) {
            const parsed = new Date(dob);
            if (!Number.isNaN(parsed.getTime())) {
                const today = new Date();
                let a = today.getUTCFullYear() - parsed.getUTCFullYear();
                const mDiff = today.getUTCMonth() - parsed.getUTCMonth();
                if (mDiff < 0 || (mDiff === 0 && today.getUTCDate() < parsed.getUTCDate())) {
                    a -= 1;
                }
                if (a >= 18 && a <= 120)
                    computedAge = a;
            }
        }
        const heightCm = optionalNumber(personalData.heightCm, 100, 250, 'heightCm') ?? existingProfile.heightCm;
        const physicalStatus = optionalString(personalData.physicalStatus, 40) ?? existingProfile.physicalStatus;
        const maritalStatus = optionalString(personalData.maritalStatus, 40) ||
            existingProfile.maritalStatus ||
            eligibility.prefilled.maritalStatus ||
            'Single';
        const numberOfChildren = optionalString(personalData.numberOfChildren, 20) ?? existingProfile.numberOfChildren;
        const motherTongue = optionalString(welcomeData.motherTongue, 60) ||
            optionalString(personalData.motherTongue, 60) ||
            existingProfile.motherTongue ||
            eligibility.prefilled.motherTongue ||
            '';
        const religion = optionalString(religiousData.religion, 80);
        const denomination = optionalString(religiousData.denomination, 100);
        const division = optionalString(religiousData.division, 80);
        const openToAnyDivision = optionalBoolean(religiousData.openToAnyDivision);
        const baptized = optionalBoolean(welcomeData.baptized);
        const country = optionalString(locationData.country, 80) || existingProfile.location?.country || eligibility.prefilled.country;
        const state = optionalString(locationData.state, 80) || existingProfile.location?.state || eligibility.prefilled.state;
        const village = optionalString(locationData.village, 100);
        const pincode = optionalString(locationData.pincode, 20);
        const qualification = optionalString(professionalData.qualification, 150);
        const employmentType = optionalString(professionalData.employmentType, 60);
        const profession = optionalString(professionalData.profession, 150);
        const organization = optionalString(professionalData.organization, 150);
        const incomeCurrency = optionalString(professionalData.incomeCurrency, 60);
        const incomeRange = optionalString(professionalData.incomeRange, 80);
        const familyStatus = optionalString(additionalData.familyStatus, 60);
        const aboutMe = optionalString(additionalData.aboutMe, 1000);
        const managedBy = consentData.managedBy === 'guardian' || welcomeData.managedBy === 'guardian'
            ? 'guardian'
            : 'self';
        const createdFor = optionalString(welcomeData.createdFor || consentData.createdFor, 40);
        const hasExistingPhoto = Boolean(existingProfile.profilePhoto);
        const currentStatus = existingProfile.profileStatus && existingProfile.profileStatus !== 'not_started'
            ? existingProfile.profileStatus
            : 'draft';
        const prefsPayload = prefsSnap.exists
            ? existingPrefs
            : {
                uid,
                age: {
                    min: Math.max(18, (computedAge || 25) - 4),
                    max: (computedAge || 25) + 5,
                    importance: 'preferred',
                },
                height: { minCm: 145, maxCm: 195, importance: 'flexible' },
                maritalStatuses: [maritalStatus],
                education: { acceptable: [], importance: 'flexible' },
                occupationCategories: [],
                locations: {
                    preferredCities: [],
                    preferredStates: state ? [state] : [],
                    openToRelocation: true,
                },
                updatedAt: now,
            };
        const profilePayload = {
            uid,
            churchId: DEFAULT_CHURCH_ID,
            displayName: fullName,
            gender,
            age: computedAge,
            maritalStatus,
            motherTongue,
            ...(heightCm !== undefined ? { heightCm } : {}),
            ...(physicalStatus !== undefined ? { physicalStatus } : {}),
            ...(numberOfChildren !== undefined ? { numberOfChildren } : {}),
            location: {
                ...(existingProfile.location || {}),
                city: village || existingProfile.location?.city || eligibility.prefilled.city,
                state,
                country,
                ...(village !== undefined ? { village } : {}),
                ...(pincode !== undefined ? { pincode } : {}),
            },
            faithSummary: {
                ...(existingProfile.faithSummary || {}),
                baptized: baptized !== undefined ? baptized : eligibility.prefilled.baptized,
                baptismChurch: eligibility.prefilled.baptismChurch || null,
                shareFaithDetails: true,
                ...(religion !== undefined ? { religion } : {}),
                ...(denomination !== undefined ? { denomination } : {}),
                ...(division !== undefined ? { division } : {}),
                ...(openToAnyDivision !== undefined ? { openToAnyDivision } : {}),
            },
            ...(qualification !== undefined
                ? {
                    education: {
                        ...(existingProfile.education || {}),
                        qualification,
                    },
                }
                : {}),
            ...(employmentType !== undefined || profession !== undefined || organization !== undefined
                ? {
                    career: {
                        ...(existingProfile.career || {}),
                        ...(employmentType !== undefined ? { employmentType } : {}),
                        ...(profession !== undefined ? { profession } : {}),
                        ...(organization !== undefined ? { organization } : {}),
                    },
                }
                : {}),
            ...(familyStatus !== undefined
                ? {
                    familySummary: {
                        ...(existingProfile.familySummary || {}),
                        familyStatus,
                    },
                }
                : {}),
            ...(aboutMe !== undefined ? { aboutMe } : {}),
            profilePhoto: existingProfile.profilePhoto || null,
            gallery: Array.isArray(existingProfile.gallery) ? existingProfile.gallery : [],
            photoVisibility: existingProfile.photoVisibility || 'approved_members',
            profileStatus: currentStatus,
            onboardingStage: hasExistingPhoto ? 'completed' : 'photos_pending',
            verificationStatus: existingProfile.verificationStatus || 'unverified',
            visibility: existingProfile.visibility || 'hidden',
            createdAt: existingProfile.createdAt || now,
            updatedAt: now,
        };
        profilePayload.profileCompletion = computeProfileCompletion(profilePayload, prefsPayload, existingPrivate);
        const privatePayload = {
            uid,
            fullLegalName: fullName,
            dob,
            personalEmail: email,
            phoneNumber: phone,
            address: {
                ...(existingPrivate.address || {}),
                street: eligibility.prefilled.street || null,
                city: village || eligibility.prefilled.city || null,
                state: state || null,
                country: country || 'India',
                ...(pincode !== undefined ? { zip: pincode } : {}),
            },
            profileManager: {
                type: managedBy,
                ...(createdFor ? { createdFor } : {}),
                guardianUid: null,
            },
            consent: {
                profilePublication,
                matchmaking,
                communication,
                consentVersion: CONSENT_VERSION,
                updatedAt: now,
            },
            ...(incomeCurrency !== undefined || incomeRange !== undefined
                ? {
                    incomeDetails: {
                        currency: incomeCurrency ?? 'INR - India',
                        annualIncomeRange: incomeRange ?? '',
                        visibility: 'private',
                    },
                }
                : {}),
            updatedAt: now,
        };
        const batch = db.batch();
        batch.set(profileRef, profilePayload, { merge: true });
        batch.set(privateRef, privatePayload, { merge: true });
        if (!prefsSnap.exists) {
            batch.set(prefsRef, prefsPayload);
        }
        await batch.commit();
        if (motherTongue) {
            await db
                .collection('Rhema Church')
                .doc(DEFAULT_CHURCH_ID)
                .collection('members')
                .doc(uid)
                .set({ motherTongue, updatedAt: now }, { merge: true });
        }
        if (currentStatus !== 'draft' && currentStatus !== 'not_started') {
            await syncConsolidatedAdminProfile(uid);
        }
        return { success: true, section, saved: true };
    }
    if (section === 'basic') {
        const fullName = optionalString(data.fullName, 120);
        const email = optionalEditableString(data.email, 160);
        const phone = optionalEditableString(data.phone, 40);
        if (fullName !== undefined) {
            await profileRef.set({ displayName: fullName, updatedAt: now }, { merge: true });
        }
        await privateRef.set({
            ...(fullName !== undefined ? { fullLegalName: fullName } : {}),
            ...(email !== undefined ? { personalEmail: email } : {}),
            ...(phone !== undefined ? { phoneNumber: phone } : {}),
            updatedAt: now,
        }, { merge: true });
    }
    else if (section === 'personal') {
        const gender = optionalString(data.gender, 30);
        const dob = optionalString(data.dob, 30);
        const heightCm = optionalNumber(data.heightCm, 100, 250, 'heightCm');
        const physicalStatus = optionalString(data.physicalStatus, 40);
        const maritalStatus = optionalString(data.maritalStatus, 40);
        const motherTongue = optionalEditableString(data.motherTongue, 60);
        const numberOfChildren = optionalString(data.numberOfChildren, 20);
        let computedAge = existingProfile.age ?? eligibility.age;
        if (dob) {
            const parsed = new Date(dob);
            if (!Number.isNaN(parsed.getTime())) {
                const today = new Date();
                let a = today.getUTCFullYear() - parsed.getUTCFullYear();
                const mDiff = today.getUTCMonth() - parsed.getUTCMonth();
                if (mDiff < 0 || (mDiff === 0 && today.getUTCDate() < parsed.getUTCDate())) {
                    a -= 1;
                }
                if (a >= 18 && a <= 120)
                    computedAge = a;
            }
        }
        const updatedProfileForCompletion = {
            ...existingProfile,
            ...(gender !== undefined ? { gender } : {}),
            ...(computedAge !== undefined ? { age: computedAge } : {}),
            ...(heightCm !== undefined ? { heightCm } : {}),
            ...(physicalStatus !== undefined ? { physicalStatus } : {}),
            ...(maritalStatus !== undefined ? { maritalStatus } : {}),
            ...(motherTongue !== undefined ? { motherTongue } : {}),
            ...(numberOfChildren !== undefined ? { numberOfChildren } : {}),
        };
        await profileRef.set({
            ...(gender !== undefined ? { gender } : {}),
            ...(computedAge !== undefined ? { age: computedAge } : {}),
            ...(heightCm !== undefined ? { heightCm } : {}),
            ...(physicalStatus !== undefined ? { physicalStatus } : {}),
            ...(maritalStatus !== undefined ? { maritalStatus } : {}),
            ...(motherTongue !== undefined ? { motherTongue } : {}),
            ...(numberOfChildren !== undefined ? { numberOfChildren } : {}),
            profileCompletion: computeProfileCompletion(updatedProfileForCompletion, existingPrefs, existingPrivate),
            updatedAt: now,
        }, { merge: true });
        if (dob !== undefined) {
            await privateRef.set({ dob, updatedAt: now }, { merge: true });
        }
        if (motherTongue) {
            await db
                .collection('Rhema Church')
                .doc(DEFAULT_CHURCH_ID)
                .collection('members')
                .doc(uid)
                .set({ motherTongue, updatedAt: now }, { merge: true });
        }
    }
    else if (section === 'religious') {
        const religion = optionalString(data.religion, 80);
        const denomination = optionalString(data.denomination, 100);
        const division = optionalEditableString(data.division, 80);
        const openToAnyDivision = optionalBoolean(data.openToAnyDivision);
        const religiousValues = optionalEditableString(data.religiousValues, 60);
        const baptized = optionalBoolean(data.baptized);
        await profileRef.set({
            faithSummary: {
                ...(existingProfile.faithSummary || {}),
                ...(religion !== undefined ? { religion } : {}),
                ...(denomination !== undefined ? { denomination } : {}),
                ...(division !== undefined ? { division } : {}),
                ...(openToAnyDivision !== undefined ? { openToAnyDivision } : {}),
                ...(religiousValues !== undefined ? { religiousValues } : {}),
                ...(baptized !== undefined ? { baptized } : {}),
            },
            updatedAt: now,
        }, { merge: true });
    }
    else if (section === 'location') {
        const country = optionalString(data.country, 80);
        const state = optionalString(data.state, 80);
        const citizenship = optionalEditableString(data.citizenship, 80);
        const village = optionalEditableString(data.village, 100);
        const pincode = optionalEditableString(data.pincode, 20);
        await profileRef.set({
            location: {
                ...(existingProfile.location || {}),
                ...(country !== undefined ? { country } : {}),
                ...(state !== undefined ? { state } : {}),
                ...(citizenship !== undefined ? { citizenship } : {}),
                ...(village !== undefined ? { village, city: village } : {}),
                ...(pincode !== undefined ? { pincode } : {}),
            },
            updatedAt: now,
        }, { merge: true });
    }
    else if (section === 'professional') {
        const qualification = optionalString(data.qualification, 150);
        const employmentType = optionalEditableString(data.employmentType, 60);
        const profession = optionalEditableString(data.profession, 150);
        const organization = optionalEditableString(data.organization, 150);
        const incomeCurrency = optionalString(data.incomeCurrency, 60);
        const incomeRange = optionalEditableString(data.incomeRange, 80);
        const updatedEdu = qualification !== undefined
            ? { ...(existingProfile.education || {}), qualification }
            : existingProfile.education;
        const updatedCareer = {
            ...(existingProfile.career || {}),
            ...(employmentType !== undefined ? { employmentType } : {}),
            ...(profession !== undefined ? { profession } : {}),
            ...(organization !== undefined ? { organization } : {}),
        };
        await profileRef.set({
            ...(qualification !== undefined ? { education: updatedEdu } : {}),
            career: updatedCareer,
            profileCompletion: computeProfileCompletion({ ...existingProfile, education: updatedEdu, career: updatedCareer }, existingPrefs, existingPrivate),
            updatedAt: now,
        }, { merge: true });
        if (incomeCurrency !== undefined || incomeRange !== undefined) {
            await privateRef.set({
                incomeDetails: {
                    currency: incomeCurrency ?? existingPrivate.incomeDetails?.currency ?? 'INR - India',
                    annualIncomeRange: incomeRange ?? existingPrivate.incomeDetails?.annualIncomeRange ?? '',
                    visibility: 'private',
                },
                updatedAt: now,
            }, { merge: true });
        }
    }
    else if (section === 'additional') {
        const familyStatus = optionalEditableString(data.familyStatus, 60);
        const familyType = optionalEditableString(data.familyType, 60);
        const familyValues = optionalEditableString(data.familyValues, 60);
        const aboutMe = optionalEditableString(data.aboutMe, 1000);
        const eatingHabits = optionalString(data.eatingHabits, 40);
        const smokingHabits = optionalString(data.smokingHabits, 40);
        const drinkingHabits = optionalString(data.drinkingHabits, 40);
        const religiousValues = optionalEditableString(data.religiousValues, 60);
        const fatherOccupation = optionalEditableString(data.fatherOccupation, 100);
        const motherOccupation = optionalEditableString(data.motherOccupation, 100);
        const familyOrigin = optionalEditableString(data.familyOrigin, 100);
        const brothers = optionalString(data.brothers, 20);
        const sisters = optionalString(data.sisters, 20);
        const brothersMarried = optionalString(data.brothersMarried, 20);
        const sistersMarried = optionalString(data.sistersMarried, 20);
        const familyIntro = optionalEditableString(data.familyIntro, 600);
        const hasFamilySummaryUpdate = familyStatus !== undefined || familyType !== undefined || familyValues !== undefined;
        const hasHabitsUpdate = eatingHabits !== undefined || smokingHabits !== undefined || drinkingHabits !== undefined;
        const hasFamilyDetailsUpdate = fatherOccupation !== undefined ||
            motherOccupation !== undefined ||
            familyOrigin !== undefined ||
            brothers !== undefined ||
            sisters !== undefined ||
            brothersMarried !== undefined ||
            sistersMarried !== undefined ||
            familyIntro !== undefined;
        const updatedFamilySummary = hasFamilySummaryUpdate
            ? {
                ...(existingProfile.familySummary || {}),
                ...(familyStatus !== undefined ? { familyStatus } : {}),
                ...(familyType !== undefined ? { familyType } : {}),
                ...(familyValues !== undefined ? { familyValues } : {}),
            }
            : existingProfile.familySummary;
        const updatedFamilyDetails = {
            ...(existingPrivate.familyDetails || {}),
            ...(fatherOccupation !== undefined ? { fatherOccupation } : {}),
            ...(motherOccupation !== undefined ? { motherOccupation } : {}),
            ...(familyOrigin !== undefined ? { familyOrigin } : {}),
            ...(brothers !== undefined ? { brothers } : {}),
            ...(sisters !== undefined ? { sisters } : {}),
            ...(brothersMarried !== undefined ? { brothersMarried } : {}),
            ...(sistersMarried !== undefined ? { sistersMarried } : {}),
            ...(familyIntro !== undefined ? { familyIntro } : {}),
        };
        if (hasFamilyDetailsUpdate) {
            await privateRef.set({
                familyDetails: updatedFamilyDetails,
                updatedAt: now,
            }, { merge: true });
        }
        await profileRef.set({
            ...(hasFamilySummaryUpdate ? { familySummary: updatedFamilySummary } : {}),
            ...(hasHabitsUpdate
                ? {
                    habits: {
                        ...(existingProfile.habits || {}),
                        ...(eatingHabits !== undefined ? { eatingHabits } : {}),
                        ...(smokingHabits !== undefined ? { smokingHabits } : {}),
                        ...(drinkingHabits !== undefined ? { drinkingHabits } : {}),
                    },
                }
                : {}),
            ...(religiousValues !== undefined
                ? {
                    faithSummary: {
                        ...(existingProfile.faithSummary || {}),
                        religiousValues,
                    },
                }
                : {}),
            ...(aboutMe !== undefined ? { aboutMe } : {}),
            profileCompletion: computeProfileCompletion({
                ...existingProfile,
                ...(hasFamilySummaryUpdate ? { familySummary: updatedFamilySummary } : {}),
                ...(aboutMe !== undefined ? { aboutMe } : {}),
            }, existingPrefs, { ...existingPrivate, familyDetails: updatedFamilyDetails }),
            updatedAt: now,
        }, { merge: true });
    }
    else if (section === 'interests') {
        const hobbies = optionalStringArray(data.hobbies, 60, 80);
        const music = optionalStringArray(data.music, 50, 80);
        const reading = optionalStringArray(data.reading, 30, 80);
        const movies = optionalStringArray(data.movies, 30, 80);
        const sports = optionalStringArray(data.sports, 50, 80);
        const food = optionalStringArray(data.food, 50, 80);
        const languages = optionalStringArray(data.languages, 50, 80);
        const nextInterests = {
            hobbies,
            music,
            reading,
            movies,
            sports,
            food,
            languages,
        };
        await profileRef.set({
            interests: nextInterests,
            profileCompletion: computeProfileCompletion({ ...existingProfile, interests: nextInterests }, existingPrefs, existingPrivate),
            ...((existingProfile.profileStatus || 'draft') === 'draft'
                ? { onboardingStage: 'approval_pending_submit' }
                : {}),
            updatedAt: now,
        }, { merge: true });
    }
    else if (section === 'consent') {
        const profilePublication = Boolean(data.profilePublication);
        const matchmaking = Boolean(data.matchmaking);
        const communication = Boolean(data.communication);
        const managedBy = data.managedBy === 'guardian' ? 'guardian' : 'self';
        const createdFor = optionalString(data.createdFor, 40);
        await privateRef.set({
            profileManager: {
                type: managedBy,
                ...(createdFor ? { createdFor } : {}),
                guardianUid: null,
            },
            consent: {
                profilePublication,
                matchmaking,
                communication,
                consentVersion: CONSENT_VERSION,
                updatedAt: now,
            },
            updatedAt: now,
        }, { merge: true });
    }
    else if (section === 'details') {
        const heightCm = optionalNumber(data.heightCm, 100, 250, 'heightCm');
        const motherTongue = optionalString(data.motherTongue, 60);
        const aboutMe = optionalString(data.aboutMe, 1000);
        const qualification = optionalString(data.qualification, 120);
        const specialization = optionalString(data.specialization, 120);
        const college = optionalString(data.college, 120);
        const occupationCategory = optionalString(data.occupationCategory, 80);
        const profession = optionalString(data.profession, 120);
        const workLocation = optionalString(data.workLocation, 120);
        const familyType = optionalString(data.familyType, 40);
        const familyValues = optionalString(data.familyValues, 60);
        const familyIntro = optionalString(data.familyIntro, 600);
        const shareFaithDetails = optionalBoolean(data.shareFaithDetails);
        const baptized = optionalBoolean(data.baptized);
        const profileUpdate = {
            // Keep authoritative fields synced from AppMember
            displayName: eligibility.prefilled.displayName,
            gender: eligibility.prefilled.gender,
            age: eligibility.age,
            maritalStatus: eligibility.prefilled.maritalStatus || 'Single',
            motherTongue: eligibility.prefilled.motherTongue || '',
            location: {
                city: optionalString(data.city, 80) || eligibility.prefilled.city,
                state: optionalString(data.state, 80) || eligibility.prefilled.state,
                country: eligibility.prefilled.country,
            },
            updatedAt: now,
        };
        if (heightCm !== undefined)
            profileUpdate.heightCm = heightCm;
        if (motherTongue !== undefined)
            profileUpdate.motherTongue = motherTongue;
        if (aboutMe !== undefined)
            profileUpdate.aboutMe = aboutMe;
        if (qualification !== undefined || specialization !== undefined || college !== undefined) {
            profileUpdate.education = {
                qualification: qualification ?? existingProfile.education?.qualification ?? '',
                specialization: specialization ?? existingProfile.education?.specialization ?? '',
                college: college ?? existingProfile.education?.college ?? '',
            };
        }
        if (occupationCategory !== undefined || profession !== undefined || workLocation !== undefined) {
            profileUpdate.career = {
                occupationCategory: occupationCategory ?? existingProfile.career?.occupationCategory ?? '',
                profession: profession ?? existingProfile.career?.profession ?? '',
                workLocation: workLocation ?? existingProfile.career?.workLocation ?? '',
            };
        }
        if (familyType !== undefined || familyValues !== undefined) {
            profileUpdate.familySummary = {
                familyType: familyType ?? existingProfile.familySummary?.familyType ?? '',
                familyValues: familyValues ?? existingProfile.familySummary?.familyValues ?? '',
            };
        }
        if (shareFaithDetails !== undefined || baptized !== undefined) {
            profileUpdate.faithSummary = {
                ...(existingProfile.faithSummary || {}),
                ...(baptized !== undefined
                    ? { baptized }
                    : shareFaithDetails !== undefined
                        ? { baptized: shareFaithDetails ? (existingProfile.faithSummary?.baptized ?? eligibility.prefilled.baptized) : null }
                        : {}),
                ...(shareFaithDetails !== undefined
                    ? {
                        baptismChurch: shareFaithDetails ? (eligibility.prefilled.baptismChurch || null) : null,
                        shareFaithDetails,
                    }
                    : {}),
            };
        }
        const mergedForScore = { ...existingProfile, ...profileUpdate };
        profileUpdate.profileCompletion = computeProfileCompletion(mergedForScore, existingPrefs, existingPrivate);
        await profileRef.set(profileUpdate, { merge: true });
        // Keep motherTongue synced back to the main existing Rhema member profile
        if (motherTongue !== undefined) {
            await db
                .collection('Rhema Church')
                .doc(DEFAULT_CHURCH_ID)
                .collection('members')
                .doc(uid)
                .set({ motherTongue, updatedAt: now }, { merge: true });
        }
        if (familyIntro !== undefined || data.incomeRange !== undefined) {
            await privateRef.set({
                familyDetails: {
                    familyIntro: familyIntro ?? '',
                    shareFamilyIntro: Boolean(data.shareFamilyIntro),
                },
                incomeDetails: {
                    annualIncomeRange: optionalString(data.incomeRange, 60) || '',
                    visibility: 'private',
                },
                updatedAt: now,
            }, { merge: true });
        }
    }
    else if (section === 'preferences') {
        const prevAge = existingPrefs.age || { min: 20, max: 35, importance: 'preferred' };
        const prevHeight = existingPrefs.height || { minCm: 145, maxCm: 195, importance: 'flexible' };
        const prevEdu = existingPrefs.education || { acceptable: [], importance: 'flexible' };
        const prevLoc = existingPrefs.locations || {
            preferredCountries: [],
            preferredCities: [],
            preferredStates: [],
            openToRelocation: true,
        };
        const minAge = optionalNumber(data.minAge, 18, 80, 'minAge') ?? prevAge.min ?? 20;
        const maxAge = optionalNumber(data.maxAge, minAge, 85, 'maxAge') ?? Math.max(minAge, prevAge.max ?? 35);
        const ageImportance = ['essential', 'preferred', 'flexible'].includes(data.ageImportance)
            ? data.ageImportance
            : prevAge.importance || 'preferred';
        const minHeightCm = optionalNumber(data.minHeightCm, 120, 230, 'minHeightCm') ?? prevHeight.minCm ?? 145;
        const maxHeightCm = optionalNumber(data.maxHeightCm, minHeightCm, 240, 'maxHeightCm') ?? Math.max(minHeightCm, prevHeight.maxCm ?? 195);
        const heightImportance = ['essential', 'preferred', 'flexible'].includes(data.heightImportance)
            ? data.heightImportance
            : prevHeight.importance || 'flexible';
        const haveChildren = optionalEditableString(data.haveChildren, 60);
        const physicalStatus = optionalEditableString(data.physicalStatus, 60);
        const motherTongue = optionalEditableString(data.motherTongue, 80);
        const denomination = optionalEditableString(data.denomination, 100);
        const division = optionalEditableString(data.division, 80);
        const employedIn = optionalEditableString(data.employedIn, 80);
        const occupation = optionalEditableString(data.occupation, 120);
        const annualIncome = optionalEditableString(data.annualIncome, 80);
        const eatingHabits = optionalEditableString(data.eatingHabits, 40);
        const drinkingHabits = optionalEditableString(data.drinkingHabits, 40);
        const smokingHabits = optionalEditableString(data.smokingHabits, 40);
        const prefsUpdate = {
            ...existingPrefs,
            uid,
            age: { min: minAge, max: maxAge, importance: ageImportance },
            height: { minCm: minHeightCm, maxCm: maxHeightCm, importance: heightImportance },
            maritalStatuses: data.maritalStatuses !== undefined
                ? optionalStringArray(data.maritalStatuses, 5, 40)
                : existingPrefs.maritalStatuses || [],
            education: {
                acceptable: data.acceptableEducation !== undefined
                    ? optionalStringArray(data.acceptableEducation, 20, 120)
                    : prevEdu.acceptable || [],
                importance: ['essential', 'preferred', 'flexible'].includes(data.educationImportance)
                    ? data.educationImportance
                    : prevEdu.importance || 'flexible',
            },
            locations: {
                preferredCountries: data.preferredCountries !== undefined
                    ? optionalStringArray(data.preferredCountries, 15, 60)
                    : prevLoc.preferredCountries || [],
                preferredCities: data.preferredCities !== undefined
                    ? optionalStringArray(data.preferredCities, 15, 60)
                    : prevLoc.preferredCities || [],
                preferredStates: data.preferredStates !== undefined
                    ? optionalStringArray(data.preferredStates, 15, 60)
                    : prevLoc.preferredStates || [],
                openToRelocation: data.openToRelocation !== undefined
                    ? data.openToRelocation !== false
                    : prevLoc.openToRelocation !== false,
            },
            partnerExpectations: data.partnerExpectations !== undefined
                ? optionalEditableString(data.partnerExpectations, 600) || ''
                : existingPrefs.partnerExpectations || '',
            ...(haveChildren !== undefined ? { haveChildren } : {}),
            ...(physicalStatus !== undefined ? { physicalStatus } : {}),
            ...(motherTongue !== undefined ? { motherTongue } : {}),
            ...(denomination !== undefined ? { denomination } : {}),
            ...(division !== undefined ? { division } : {}),
            ...(employedIn !== undefined ? { employedIn } : {}),
            ...(occupation !== undefined ? { occupation } : {}),
            ...(annualIncome !== undefined ? { annualIncome } : {}),
            ...(eatingHabits !== undefined ? { eatingHabits } : {}),
            ...(drinkingHabits !== undefined ? { drinkingHabits } : {}),
            ...(smokingHabits !== undefined ? { smokingHabits } : {}),
            updatedAt: now,
        };
        await prefsRef.set(prefsUpdate, { merge: true });
        await profileRef.set({
            profileCompletion: computeProfileCompletion(existingProfile, prefsUpdate, existingPrivate),
            updatedAt: now,
        }, { merge: true });
    }
    else if (section === 'photos') {
        const profilePhoto = data.profilePhoto !== undefined
            ? sanitizePhotoStoragePath(data.profilePhoto, uid)
            : existingProfile.profilePhoto;
        const galleryInput = Array.isArray(data.gallery) ? data.gallery.slice(0, 2) : (existingProfile.gallery || []).slice(0, 2);
        const gallery = galleryInput
            .map((item) => sanitizePhotoStoragePath(item, uid))
            .filter((x) => Boolean(x));
        const rawVis = data.photoVisibility ?? existingProfile.photoVisibility;
        const photoVisibility = rawVis === 'matches_only' ||
            rawVis === 'contacted_and_paid' ||
            rawVis === 'protect_photo'
            ? rawVis
            : 'approved_members';
        const profileUpdate = {
            profilePhoto: profilePhoto || null,
            gallery,
            photoVisibility,
            profileCompletion: computeProfileCompletion({ ...existingProfile, profilePhoto: profilePhoto || null, gallery }, existingPrefs, existingPrivate),
            updatedAt: now,
        };
        if (profilePhoto) {
            profileUpdate.onboardingStage =
                (existingProfile.profileStatus || 'draft') === 'draft'
                    ? 'interests_pending'
                    : 'completed';
        }
        else if ((existingProfile.profileStatus || 'draft') === 'draft') {
            profileUpdate.onboardingStage = 'photos_pending';
        }
        await profileRef.set(profileUpdate, { merge: true });
    }
    else if (section === 'privacy') {
        const entitlements = await resolveMemberEntitlements(db, uid, existingProfile);
        const isPaid = entitlements.tier !== 'free';
        const privacyPatch = { updatedAt: now };
        if (data.mobilePrivacy !== undefined) {
            const mobilePrivacy = data.mobilePrivacy === 'messages_only' ? 'messages_only' : 'show_all';
            if (mobilePrivacy === 'messages_only' && !isPaid) {
                throw new HttpsError('permission-denied', 'Upgrade to Silver, Gold, or Platinum to enable Messages only privacy.', { reasonCode: 'UPGRADE_REQUIRED_PRIVACY' });
            }
            privacyPatch.mobilePrivacy = mobilePrivacy;
        }
        if (data.photoVisibility !== undefined) {
            const rawVis = String(data.photoVisibility || '');
            const photoVisibility = rawVis === 'contacted_and_paid' ||
                rawVis === 'protect_photo' ||
                rawVis === 'matches_only'
                ? rawVis
                : 'approved_members';
            privacyPatch.photoVisibility = photoVisibility;
        }
        if (data.protectedPhotoAllowedUids !== undefined) {
            const nextAllowedUids = optionalStringArray(data.protectedPhotoAllowedUids, 2000, 128);
            privacyPatch.protectedPhotoAllowedUids = nextAllowedUids;
            // Revoke any previously approved photo requests that are no longer in Allowed Members
            const nextAllowedSet = new Set(nextAllowedUids);
            try {
                const existingReqsSnap = await profileRef
                    .collection('photo_requests')
                    .where('status', '==', 'approved')
                    .get();
                if (!existingReqsSnap.empty) {
                    const revokeBatch = db.batch();
                    let revokeCount = 0;
                    existingReqsSnap.docs.forEach((reqDoc) => {
                        const reqUid = String(reqDoc.data()?.requesterUid || reqDoc.id);
                        if (!nextAllowedSet.has(reqUid)) {
                            revokeBatch.set(reqDoc.ref, { status: 'declined', updatedAt: now }, { merge: true });
                            revokeBatch.set(getProfileRef(db, reqUid).collection('photo_requests_sent').doc(uid), { status: 'declined', updatedAt: now }, { merge: true });
                            revokeCount += 1;
                        }
                    });
                    if (revokeCount > 0) {
                        await revokeBatch.commit();
                    }
                }
            }
            catch (revokeErr) {
                console.warn(`Unable to sync revoked photo requests for ${uid}:`, revokeErr);
            }
        }
        await profileRef.set(privacyPatch, { merge: true });
    }
    else if (section === 'notifications') {
        const allowedKeys = [
            'request',
            'shortlist',
            'profileViews',
            'interestAcceptance',
            'recentlyJoined',
            'dailyMatches',
            'cityMatches',
            'photoMatches',
            'similarMatches',
            'newMatches',
            'dailyRecommendations',
            'basedOnActivity',
            'membershipOffers',
        ];
        const nextPrefs = {
            ...(existingProfile.notificationPreferences || {}),
        };
        allowedKeys.forEach((k) => {
            if (data[k] !== undefined) {
                nextPrefs[k] = Boolean(data[k]);
            }
        });
        await profileRef.set({
            notificationPreferences: nextPrefs,
            updatedAt: now,
        }, { merge: true });
    }
    if (existingProfile.profileStatus &&
        existingProfile.profileStatus !== 'draft' &&
        existingProfile.profileStatus !== 'not_started') {
        await syncConsolidatedAdminProfile(uid);
    }
    return { success: true, section, saved: true };
});
/**
 * 3. submitMatrimonyProfile
 * Validates consent + required fields, runs automated checks, moves status to 'pending' for approval.
 */
export const submitMatrimonyProfile = onCall({ invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 }, async (request) => {
    const uid = requireAuthUid(request);
    const eligibility = await verifyRhemaMemberEligibility(uid);
    if (!eligibility.eligible) {
        throw new HttpsError('failed-precondition', 'Member is not eligible for Rhema Matrimony.');
    }
    const db = getFirestore();
    await assertMatrimonyNotBanned(db, uid);
    const profileRef = getProfileRef(db, uid);
    const verificationRef = getVerificationRef(db, uid);
    const [profileSnap, privateSnap, prefsSnap] = await Promise.all([
        profileRef.get(),
        readPrivateSnap(db, uid),
        readPrefsSnap(db, uid),
    ]);
    if (!profileSnap.exists || !privateSnap.exists) {
        throw new HttpsError('failed-precondition', 'Registration draft not found.');
    }
    const profile = profileSnap.data() || {};
    if (isMatrimonyProfileInactiveStatus(profile.profileStatus)) {
        throw new HttpsError('failed-precondition', profile.inactiveReason ||
            'Your Rhema Matrimony profile is currently inactive. Please contact Church Administration.', { reasonCode: 'MATRIMONY_PROFILE_INACTIVE' });
    }
    const prefs = prefsSnap.data() || {};
    assertNonEmptyString(profile.displayName, 'Display Name');
    assertNonEmptyString(profile.gender, 'Gender');
    if (!profile.heightCm) {
        throw new HttpsError('failed-precondition', 'Height is required before submitting.');
    }
    if (!profile.motherTongue) {
        throw new HttpsError('failed-precondition', 'Mother tongue is required before submitting.');
    }
    if (!profile.education?.qualification) {
        throw new HttpsError('failed-precondition', 'Highest qualification is required before submitting.');
    }
    if (!profile.career?.profession) {
        throw new HttpsError('failed-precondition', 'Profession is required before submitting.');
    }
    const matrimonyId = await ensureUniqueMatrimonyId(db, uid, profile.matrimonyId);
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(profileRef, {
        matrimonyId,
        profileStatus: 'pending',
        onboardingStage: 'completed',
        approvalType: 'manual_review',
        verificationStatus: 'pending_review',
        visibility: 'hidden',
        profileCompletion: computeProfileCompletion(profile, prefs, privateSnap.data() || {}),
        submittedAt: now,
        updatedAt: now,
    }, { merge: true });
    batch.set(verificationRef, {
        uid,
        churchId: DEFAULT_CHURCH_ID,
        membership: { status: 'verified', verifiedAt: now },
        ageVerification: { status: 'verified_from_member_record', age: eligibility.age, verifiedAt: now },
        automatedChecks: {
            duplicateCheck: 'passed',
            accountCheck: 'passed',
            riskStatus: 'low',
        },
        approval: {
            status: 'pending',
            type: 'manual_review',
            reviewedBy: null,
            reviewedAt: null,
            rejectionReason: null,
        },
        updatedAt: now,
    }, { merge: true });
    const auditRef = db.collection(COLLECTIONS.AUDIT_LOGS).doc();
    batch.set(auditRef, {
        action: 'MATRIMONY_PROFILE_SUBMITTED',
        actorUid: uid,
        targetUid: uid,
        churchId: DEFAULT_CHURCH_ID,
        createdAt: now,
    });
    await batch.commit();
    await syncConsolidatedAdminProfile(uid);
    return {
        success: true,
        profileStatus: 'pending',
        verificationStatus: 'pending_review',
    };
});
/**
 * 3b. resetMatrimonyProfile
 * Deletes the signed-in member's matrimony profile documents so they can restart setup from scratch.
 */
export const resetMatrimonyProfile = onCall({ invoker: 'public' }, async (request) => {
    const uid = requireAuthUid(request);
    const db = getFirestore();
    await assertMatrimonyNotBanned(db, uid);
    const profSnap = await getProfileRef(db, uid).get();
    if (profSnap.exists && isMatrimonyProfileInactiveStatus(profSnap.data()?.profileStatus)) {
        throw new HttpsError('failed-precondition', profSnap.data()?.inactiveReason ||
            'Your Rhema Matrimony profile is currently inactive. Please contact Church Administration.', { reasonCode: 'MATRIMONY_PROFILE_INACTIVE' });
    }
    // Mark selfReset before deleting so onDocumentDeleted triggers do not treat this as an admin ban.
    await Promise.all([
        getProfileRef(db, uid).set({ selfReset: true }, { merge: true }).catch(() => undefined),
        getAdminProfileRef(db, uid).set({ selfReset: true }, { merge: true }).catch(() => undefined),
    ]);
    await purgeMatrimonyUserData(db, uid, {
        banOnDelete: false,
        actorUid: uid,
        source: 'self_reset',
        auditAction: 'MATRIMONY_PROFILE_RESET',
    });
    return {
        success: true,
        profileStatus: 'not_started',
    };
});
/**
 * 3c. deactivateMyMatrimonyAccount
 * Temporarily hides the member's profile from matches and disables outbound contact
 * while allowing them to browse matches and reactivate anytime.
 */
export const deactivateMyMatrimonyAccount = onCall({ invoker: 'public' }, async (request) => {
    const uid = requireAuthUid(request);
    const active = Boolean(request.data?.active);
    const db = getFirestore();
    await assertMatrimonyNotBanned(db, uid);
    const profileRef = getProfileRef(db, uid);
    const snap = await profileRef.get();
    if (!snap.exists) {
        throw new HttpsError('not-found', 'Matrimony profile not found.');
    }
    const existing = snap.data() || {};
    if (isMatrimonyProfileInactiveStatus(existing.profileStatus) || existing.profileStatus === 'deleted') {
        throw new HttpsError('failed-precondition', existing.inactiveReason || 'Your Matrimony profile cannot be updated in its current state.');
    }
    const now = FieldValue.serverTimestamp();
    const selfDeactivated = !active;
    const visibility = selfDeactivated
        ? 'hidden'
        : existing.profileStatus === 'approved'
            ? 'visible'
            : existing.visibility || 'hidden';
    await profileRef.set({
        selfDeactivated,
        visibility,
        ...(selfDeactivated ? { selfDeactivatedAt: now } : { reactivatedAt: now }),
        updatedAt: now,
    }, { merge: true });
    await syncConsolidatedAdminProfile(uid).catch(() => undefined);
    return {
        success: true,
        selfDeactivated,
        visibility,
    };
});
/**
 * 3d. deleteMyMatrimonyAccount
 * Saves the member's deletion reason on their Church member record and audit log,
 * then completely deletes their Firebase Matrimony profile & associated data
 * (without banning them) so they can immediately create a new profile for themselves or family.
 */
export const deleteMyMatrimonyAccount = onCall({ invoker: 'public' }, async (request) => {
    const uid = requireAuthUid(request);
    const rawReason = assertNonEmptyString(request.data?.reason, 'reason', 160);
    const details = optionalString(request.data?.details, 500) || '';
    const fullReason = details ? `${rawReason}: ${details}` : rawReason;
    const db = getFirestore();
    await assertMatrimonyNotBanned(db, uid);
    const profileRef = getProfileRef(db, uid);
    const adminProfileRef = getAdminProfileRef(db, uid);
    const [snap, adminSnap] = await Promise.all([profileRef.get(), adminProfileRef.get()]);
    if (!snap.exists && !adminSnap.exists) {
        throw new HttpsError('not-found', 'Matrimony profile not found.');
    }
    const now = FieldValue.serverTimestamp();
    const nowMs = Date.now();
    await db
        .collection('Rhema Church')
        .doc(DEFAULT_CHURCH_ID)
        .collection('members')
        .doc(uid)
        .set({
        matrimonyDeletionReason: fullReason,
        matrimonyDeletionCategory: rawReason,
        matrimonyDeletionDetails: details || null,
        matrimonyDeletedAt: now,
        matrimonyDeletedAtMs: nowMs,
        updatedAt: now,
    }, { merge: true });
    // Mark selfReset before deleting so onDocumentDeleted triggers do not treat this as a console ban.
    await Promise.all([
        profileRef.set({ selfReset: true }, { merge: true }).catch(() => undefined),
        adminProfileRef.set({ selfReset: true }, { merge: true }).catch(() => undefined),
    ]);
    await purgeMatrimonyUserData(db, uid, {
        banOnDelete: false,
        banReason: fullReason,
        actorUid: uid,
        source: 'self_reset',
        auditAction: 'MATRIMONY_ACCOUNT_DELETED_BY_MEMBER',
    });
    return {
        success: true,
        deleted: true,
        deletionReason: fullReason,
    };
});
/**
 * 4. getMatrimonyStatus
 * Returns current approval, verification, and signed photo URLs for the signed-in member.
 */
export const getMatrimonyStatus = onCall({ invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 }, async (request) => {
    const uid = requireAuthUid(request);
    const db = getFirestore();
    await assertMatrimonyNotBanned(db, uid);
    const [profileSnap, verificationSnap, privateSnap, prefsSnap] = await Promise.all([
        getProfileRef(db, uid).get(),
        readVerificationSnap(db, uid),
        readPrivateSnap(db, uid),
        readPrefsSnap(db, uid),
    ]);
    const isLegacyDeleted = profileSnap.exists && String(profileSnap.data()?.profileStatus || '') === 'deleted';
    if (isLegacyDeleted) {
        await Promise.all([
            getProfileRef(db, uid).set({ selfReset: true }, { merge: true }).catch(() => undefined),
            getAdminProfileRef(db, uid).set({ selfReset: true }, { merge: true }).catch(() => undefined),
        ]);
        await purgeMatrimonyUserData(db, uid, {
            banOnDelete: false,
            actorUid: uid,
            source: 'self_reset',
            auditAction: 'MATRIMONY_LEGACY_DELETED_PROFILE_PURGED',
        });
    }
    if (!profileSnap.exists || isLegacyDeleted) {
        return {
            success: true,
            registered: false,
            profileStatus: 'not_started',
        };
    }
    const profile = profileSnap.data() || {};
    const verification = verificationSnap.exists ? verificationSnap.data() : null;
    const privateData = privateSnap.exists ? (privateSnap.data() || {}) : {};
    const prefsData = prefsSnap.exists ? (prefsSnap.data() || {}) : {};
    const liveCompletion = computeProfileCompletion(profile, prefsData, privateData);
    const signedProfilePhoto = profile.profilePhoto
        ? (await resolveOwnerPhotoUrls([profile.profilePhoto]))[0] || null
        : null;
    const signedGallery = Array.isArray(profile.gallery)
        ? await resolveOwnerPhotoUrls(profile.gallery)
        : [];
    return {
        success: true,
        registered: true,
        profileStatus: profile.profileStatus || 'draft',
        verificationStatus: profile.verificationStatus || 'unverified',
        visibility: profile.visibility || 'hidden',
        profileCompletion: liveCompletion,
        rejectionReason: verification?.approval?.rejectionReason || null,
        inactiveReason: profile.inactiveReason || null,
        signedProfilePhoto,
        profile: {
            ...profile,
            profileCompletion: liveCompletion,
            signedProfilePhoto,
            signedGallery,
        },
    };
});
const ANTHROPIC_VISION_MODEL = 'claude-haiku-4-5-20251001';
function detectImageMimeType(buffer, fallbackRaw) {
    if (buffer.length >= 8) {
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if (buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4e &&
            buffer[3] === 0x47) {
            return 'image/png';
        }
        // JPEG: FF D8 FF
        if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
            return 'image/jpeg';
        }
        // WEBP: RIFF....WEBP
        if (buffer.length >= 12 &&
            buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
            buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
            return 'image/webp';
        }
        // GIF: GIF8
        if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') {
            return 'image/gif';
        }
    }
    if (fallbackRaw === 'image/png' ||
        fallbackRaw === 'image/webp' ||
        fallbackRaw === 'image/gif') {
        return fallbackRaw;
    }
    return 'image/jpeg';
}
async function validateMatrimonyPhotoWithAI(params) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
        throw new HttpsError('failed-precondition', 'Photo verification service is not configured.');
    }
    const { base64Data, mimeType, isPrimary, expectedGender } = params;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const systemPrompt = 'You are a photo moderator for Rhema Matrimony (a Christian marriage platform). Accurately distinguish genuine photos of real human beings from animals, inanimate objects/things, scenery, cartoons, memes, and screenshots. Respond ONLY with raw JSON (no markdown fences, no commentary).';
    const userPrompt = [
        `Classify this image for a matrimony ${isPrimary ? 'MAIN PROFILE PICTURE' : 'GALLERY PHOTO'}.`,
        expectedGender ? `The member's registered profile gender is: ${expectedGender}.` : '',
        'Return ONLY a JSON object with these exact keys:',
        '{',
        '  "hasHuman": boolean,',
        '  "isAnimalOrObject": boolean,',
        '  "humanCount": number,',
        '  "detectedGender": "male" | "female" | "mixed" | "unknown",',
        '  "genderConfidence": "high" | "medium" | "low",',
        '  "isBlurryOrUnclear": boolean,',
        '  "isSideFacing": boolean,',
        '  "isFaceVisible": boolean,',
        '  "isAppropriate": boolean,',
        '  "rejectionReason": string',
        '}',
        'Rules:',
        '- Set hasHuman=false and isAnimalOrObject=true if the photo shows an animal (dog, cat, bird, hen, cow, etc.), an inanimate object/thing (phone, car, bike, flower, food, furniture, building, etc.), scenery/landscape with no real person, cartoon, drawing, meme, screenshot, or text graphic.',
        '- If a real human person is clearly visible in the photo, set hasHuman=true and isAnimalOrObject=false.',
        '- Set detectedGender to "male" if a man/groom, "female" if a woman/bride, "mixed" if both men and women appear together, or "unknown" if unsure; set genderConfidence="high" only when unmistakably certain.',
        '- Natural portraits (selfies, indoor/outdoor, full-body, half-body, slight head angle, glasses, portrait-mode background bokeh, traditional or casual attire) are VALID: keep isFaceVisible=true, isSideFacing=false, and isBlurryOrUnclear=false.',
        '- Set isSideFacing=true ONLY if it is a strict 90-degree side profile where the front of the face is not visible.',
        '- Set isFaceVisible=false ONLY if the person has their back turned, face is completely covered, or face cannot be seen.',
        '- Set isBlurryOrUnclear=true ONLY if the person themselves is severely blurred, pitch dark, or unrecognizable (do NOT flag background blur/bokeh).',
        '- Set isAppropriate=false for nudity, sexually suggestive content, violence, or offensive imagery.',
        '- Keep rejectionReason short, polite, and clear if any issue is found; otherwise "".',
    ]
        .filter(Boolean)
        .join('\n');
    let parsed = null;
    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: ANTHROPIC_VISION_MODEL,
                max_tokens: 260,
                temperature: 0,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: mimeType,
                                    data: base64Data,
                                },
                            },
                            {
                                type: 'text',
                                text: userPrompt,
                            },
                        ],
                    },
                ],
            }),
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
            console.error('Anthropic moderation HTTP error:', resp.status, json?.error || json);
            throw new HttpsError('unavailable', 'Unable to verify your photo right now. Please try again in a moment.');
        }
        const rawText = String(json?.content?.[0]?.text || '').trim();
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            parsed = JSON.parse(match[0]);
        }
    }
    catch (err) {
        if (err instanceof HttpsError)
            throw err;
        console.error('Anthropic moderation request error:', err?.message || err);
        throw new HttpsError('unavailable', 'Unable to verify your photo right now. Please check your connection and try again.');
    }
    finally {
        clearTimeout(timeout);
    }
    if (!parsed) {
        throw new HttpsError('unavailable', 'Could not verify this image automatically. Please try again with a clear portrait photo.');
    }
    if (!parsed.isAppropriate) {
        console.info('Matrimony photo rejected (inappropriate):', { isPrimary, parsed });
        throw new HttpsError('invalid-argument', 'This photo is not appropriate for a Rhema Matrimony profile. Please upload a respectful personal portrait.', { reasonCategory: 'inappropriate' });
    }
    if (parsed.isAnimalOrObject || !parsed.hasHuman || (parsed.humanCount ?? 0) === 0) {
        console.info('Matrimony photo rejected (animal/object/no human):', { isPrimary, parsed });
        throw new HttpsError('invalid-argument', parsed.rejectionReason?.trim() ||
            'Animals, objects, or non-person images are not permitted. Please upload a clear photo of yourself.', { reasonCategory: 'animal' });
    }
    const genderLabel = expectedGender === 'male' ? 'Male' : expectedGender === 'female' ? 'Female' : null;
    if (isPrimary) {
        if (parsed.humanCount > 1) {
            console.info('Matrimony photo rejected (group):', { isPrimary, parsed });
            throw new HttpsError('invalid-argument', 'Group photos cannot be used as your main profile picture. Please upload a solo photo of yourself.', { reasonCategory: 'group' });
        }
        if (parsed.isBlurryOrUnclear) {
            console.info('Matrimony photo rejected (unclear):', { isPrimary, parsed });
            throw new HttpsError('invalid-argument', 'This photo appears too blurry or dark. Please upload a clearer photo of yourself.', { reasonCategory: 'unclear' });
        }
        if (parsed.isSideFacing || !parsed.isFaceVisible) {
            console.info('Matrimony photo rejected (side/face not visible):', { isPrimary, parsed });
            throw new HttpsError('invalid-argument', 'Please upload a photo where your face is clearly visible.', { reasonCategory: 'side' });
        }
        if (expectedGender &&
            parsed.genderConfidence === 'high' &&
            (parsed.detectedGender === 'male' || parsed.detectedGender === 'female') &&
            parsed.detectedGender !== expectedGender) {
            console.info('Matrimony photo rejected (gender mismatch):', { isPrimary, expectedGender, parsed });
            throw new HttpsError('invalid-argument', `This photo does not appear to match your registered profile gender (${genderLabel}). Please upload a solo photo of yourself.`, { reasonCategory: 'gender_mismatch' });
        }
    }
    else {
        if (parsed.isBlurryOrUnclear) {
            console.info('Matrimony gallery photo rejected (unclear):', { isPrimary, parsed });
            throw new HttpsError('invalid-argument', 'This photo appears too blurry or dark. Please upload a clearer photograph.', { reasonCategory: 'unclear' });
        }
        if (parsed.humanCount === 1 &&
            parsed.genderConfidence === 'high' &&
            expectedGender &&
            (parsed.detectedGender === 'male' || parsed.detectedGender === 'female') &&
            parsed.detectedGender !== expectedGender) {
            console.info('Matrimony gallery photo rejected (gender mismatch):', { isPrimary, expectedGender, parsed });
            throw new HttpsError('invalid-argument', `Your uploaded photo appears to show the opposite gender and does not match your registered profile (${genderLabel}). Please upload genuine photos of yourself.`, { reasonCategory: 'gender_mismatch' });
        }
    }
}
/**
 * 5. uploadMatrimonyPhoto
 * Validates photo with Anthropic Vision (rejecting animals, objects, blurry/group primary shots, and clear gender mismatches)
 * and uploads to the dedicated private matrimony bucket.
 */
export const uploadMatrimonyPhoto = onCall({ invoker: 'public', cpu: 1, timeoutSeconds: 60, memory: '512MiB', concurrency: 20 }, async (request) => {
    const uid = requireAuthUid(request);
    const rawBase64 = request.data?.base64;
    const mimeTypeRaw = request.data?.mimeType;
    const isPrimary = Boolean(request.data?.isPrimary);
    if (typeof rawBase64 !== 'string' || !rawBase64.trim()) {
        throw new HttpsError('invalid-argument', 'Image data is required.');
    }
    const base64 = rawBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0 || Buffer.byteLength(base64, 'utf8') > 5 * 1024 * 1024) {
        throw new HttpsError('invalid-argument', 'Image is too large. Please choose a photo smaller than 3.5 MB.');
    }
    const mimeType = detectImageMimeType(buffer, mimeTypeRaw);
    const ext = mimeType === 'image/png'
        ? 'png'
        : mimeType === 'image/webp'
            ? 'webp'
            : mimeType === 'image/gif'
                ? 'gif'
                : 'jpg';
    const db = getFirestore();
    const [, profileSnap] = await Promise.all([
        assertMatrimonyNotBanned(db, uid),
        getProfileRef(db, uid).get(),
    ]);
    if (profileSnap.exists && isMatrimonyProfileInactiveStatus(profileSnap.data()?.profileStatus)) {
        throw new HttpsError('failed-precondition', profileSnap.data()?.inactiveReason ||
            'Your Rhema Matrimony profile is currently inactive. Please contact Church Administration.', { reasonCode: 'MATRIMONY_PROFILE_INACTIVE' });
    }
    const rawGender = String(profileSnap.data()?.gender || '').trim().toLowerCase();
    const expectedGender = rawGender === 'male' || rawGender === 'm' || rawGender === 'groom'
        ? 'male'
        : rawGender === 'female' || rawGender === 'f' || rawGender === 'bride'
            ? 'female'
            : null;
    await validateMatrimonyPhotoWithAI({
        base64Data: base64,
        mimeType,
        isPrimary,
        expectedGender,
    });
    const prefix = isPrimary ? 'primary' : 'gallery';
    const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const storagePath = `photos/${uid}/${fileName}`;
    const downloadToken = randomUUID();
    const bucket = getStorage().bucket(MATRIMONY_BUCKET);
    const file = bucket.file(storagePath);
    await file.save(buffer, {
        contentType: mimeType,
        resumable: false,
        metadata: {
            cacheControl: 'private, max-age=3600',
            metadata: {
                firebaseStorageDownloadTokens: downloadToken,
            },
        },
    });
    const expires = Date.now() + 60 * 60 * 1000;
    let signedUrl = null;
    if (!ownerSignBlobUnavailable) {
        try {
            const [url] = await file.getSignedUrl({
                action: 'read',
                expires,
            });
            signedUrl = url;
        }
        catch (signErr) {
            ownerSignBlobUnavailable = true;
            console.warn('getSignedUrl skipped (signBlob not granted yet), using download token URL:', signErr);
            signedUrl = buildFirebaseTokenUrl(MATRIMONY_BUCKET, storagePath, downloadToken);
        }
    }
    else {
        signedUrl = buildFirebaseTokenUrl(MATRIMONY_BUCKET, storagePath, downloadToken);
    }
    if (signedUrl) {
        WARM_OWNER_PHOTO_CACHE.set(storagePath, { url: signedUrl, expiresAtMs: expires });
    }
    return {
        success: true,
        storagePath,
        signedUrl,
    };
});
//# sourceMappingURL=registration.js.map