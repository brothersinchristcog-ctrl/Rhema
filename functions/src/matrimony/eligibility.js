import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_CHURCH_ID, MIN_MATRIMONY_AGE } from './constants.js';
import { isMatrimonyBanned } from './store.js';
export function computeAgeFromDob(dobRaw) {
    if (typeof dobRaw !== 'string' || !dobRaw.trim())
        return null;
    const parsed = new Date(dobRaw.trim());
    if (Number.isNaN(parsed.getTime()))
        return null;
    const now = new Date();
    let age = now.getUTCFullYear() - parsed.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - parsed.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < parsed.getUTCDate())) {
        age -= 1;
    }
    return age >= 0 && age <= 120 ? age : null;
}
export async function verifyRhemaMemberEligibility(uid) {
    const db = getFirestore();
    const memberRef = db
        .collection('Rhema Church')
        .doc(DEFAULT_CHURCH_ID)
        .collection('members')
        .doc(uid);
    const [memberSnap, banInfo] = await Promise.all([
        memberRef.get(),
        isMatrimonyBanned(db, uid),
    ]);
    if (banInfo.banned) {
        return {
            eligible: false,
            reasons: ['MATRIMONY_ACCESS_REVOKED'],
            ...(banInfo.reason ? { banReason: banInfo.reason } : {}),
            uid,
            churchId: DEFAULT_CHURCH_ID,
            age: null,
            prefilled: {
                displayName: '',
                firstName: '',
                lastName: '',
                gender: '',
                maritalStatus: '',
                city: '',
                state: '',
                country: 'India',
                baptized: false,
            },
        };
    }
    if (!memberSnap.exists) {
        return {
            eligible: false,
            reasons: ['NOT_A_RHEMA_MEMBER'],
            uid,
            churchId: DEFAULT_CHURCH_ID,
            age: null,
            prefilled: {
                displayName: '',
                firstName: '',
                lastName: '',
                gender: '',
                maritalStatus: '',
                city: '',
                state: '',
                country: 'India',
                baptized: false,
            },
        };
    }
    const m = memberSnap.data() || {};
    const reasons = [];
    if (m.isGuest === true) {
        reasons.push('GUEST_NOT_ELIGIBLE');
    }
    const status = String(m.status || 'active').toLowerCase();
    if (status === 'inactive' || status === 'suspended' || status === 'rejected' || status === 'deleted') {
        reasons.push('MEMBERSHIP_INACTIVE');
    }
    const churchId = String(m.churchId || m.primaryChurchId || DEFAULT_CHURCH_ID);
    if (churchId !== DEFAULT_CHURCH_ID) {
        reasons.push('OUTSIDE_RHEMA_SCOPE');
    }
    const age = computeAgeFromDob(m.dob);
    if (age === null) {
        reasons.push('DOB_MISSING_OR_INVALID');
    }
    else if (age < MIN_MATRIMONY_AGE) {
        reasons.push('UNDER_MINIMUM_AGE');
    }
    const firstName = String(m.firstName || '').trim();
    const lastName = String(m.lastName || '').trim();
    const displayName = String(m.displayName || m.name || m.fullName || `${firstName} ${lastName}`.trim() || 'Rhema Member').trim();
    return {
        eligible: reasons.length === 0,
        reasons,
        uid,
        churchId: DEFAULT_CHURCH_ID,
        age,
        prefilled: {
            displayName,
            firstName,
            lastName,
            gender: String(m.gender || '').trim(),
            maritalStatus: String(m.maritalStatus || 'Single').trim(),
            motherTongue: m.motherTongue ? String(m.motherTongue).trim() : undefined,
            city: String(m.city || m.village || m.mailingCity || '').trim(),
            state: String(m.state || m.mailingState || '').trim(),
            country: String(m.nationality || 'India').trim() || 'India',
            zip: m.zip ? String(m.zip).trim() : undefined,
            baptized: String(m.baptized || '').toLowerCase() === 'yes' || Boolean(m.baptismDate),
            baptismDate: m.baptismDate ? String(m.baptismDate) : undefined,
            baptismChurch: m.baptismChurch ? String(m.baptismChurch) : undefined,
            existingPhotoUrl: m.photoURL ? String(m.photoURL) : undefined,
            dob: m.dob ? String(m.dob) : undefined,
            phone: m.phone ? String(m.phone) : undefined,
            email: m.email ? String(m.email) : undefined,
            street: m.mailingStreet || m.street ? String(m.mailingStreet || m.street) : undefined,
        },
    };
}
//# sourceMappingURL=eligibility.js.map