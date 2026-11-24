import { randomUUID } from 'node:crypto';
import { DocumentReference, FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { COLLECTIONS, DEFAULT_CHURCH_ID, MATRIMONY_BUCKET } from './constants.js';
import { getBlocksCol, getProfileRef, isMatrimonyBanned } from './store.js';
const INVALID_TOKEN_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
]);
function buildFirebaseTokenUrl(bucketName, objectPath, token) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}
export async function resolveNotificationPhotoUrl(pathOrUrl) {
    if (!pathOrUrl || typeof pathOrUrl !== 'string')
        return null;
    const clean = pathOrUrl.trim();
    if (!clean)
        return null;
    if (clean.startsWith('https://') || clean.startsWith('http://')) {
        return clean;
    }
    const bucket = getStorage().bucket(MATRIMONY_BUCKET);
    const expires = Date.now() + 24 * 60 * 60 * 1000;
    try {
        const [signedUrl] = await bucket.file(clean).getSignedUrl({ action: 'read', expires });
        return signedUrl;
    }
    catch {
        try {
            const file = bucket.file(clean);
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
            return buildFirebaseTokenUrl(MATRIMONY_BUCKET, clean, token);
        }
        catch {
            return null;
        }
    }
}
export function extractTokensFromDoc(data) {
    if (!data)
        return [];
    const out = [];
    if (typeof data.fcmToken === 'string' && data.fcmToken.trim()) {
        out.push(data.fcmToken.trim());
    }
    if (Array.isArray(data.fcmTokens)) {
        for (const t of data.fcmTokens) {
            if (typeof t === 'string' && t.trim()) {
                out.push(t.trim());
            }
        }
    }
    return out;
}
export async function collectMemberFcmTokens(db, uid) {
    const memberRef = db
        .collection('Rhema Church')
        .doc(DEFAULT_CHURCH_ID)
        .collection('members')
        .doc(uid);
    const userRef = db.collection('users').doc(uid);
    const [memberSnap, userSnap] = await Promise.all([memberRef.get(), userRef.get()]);
    const tokenSet = new Set();
    const refs = [];
    if (memberSnap.exists) {
        refs.push(memberRef);
        extractTokensFromDoc(memberSnap.data()).forEach((t) => tokenSet.add(t));
    }
    if (userSnap.exists) {
        refs.push(userRef);
        extractTokensFromDoc(userSnap.data()).forEach((t) => tokenSet.add(t));
    }
    return { tokens: Array.from(tokenSet), refs };
}
export function isNotificationPrefEnabled(profile, prefKey) {
    if (!prefKey)
        return true;
    const prefs = profile?.notificationPreferences;
    if (!prefs || typeof prefs !== 'object')
        return true;
    return prefs[prefKey] !== false;
}
export function getObjectPronoun(genderRaw) {
    const s = String(genderRaw || '').trim().toLowerCase();
    if (s === 'female' || s === 'f' || s === 'woman' || s === 'bride' || s === 'girl')
        return 'her';
    if (s === 'male' || s === 'm' || s === 'man' || s === 'groom' || s === 'boy')
        return 'him';
    return 'them';
}
function buildStringDataPayload(type, prefKey, senderUid, extra) {
    const out = {
        type,
        module: 'matrimony',
    };
    if (prefKey)
        out.prefKey = prefKey;
    if (senderUid)
        out.senderUid = senderUid;
    if (extra) {
        for (const [k, v] of Object.entries(extra)) {
            if (v !== undefined && v !== null) {
                out[k] = String(v);
            }
        }
    }
    return out;
}
export async function sendMatrimonyNotification(params) {
    const db = params.db || getFirestore();
    const { recipientUid, senderUid = null, prefKey, type, title, body, imageUrl = null, tag, data, writeInAppDoc = true, allowNonApprovedRecipient = false, } = params;
    if (!recipientUid)
        return { sent: false, reason: 'missing_recipient' };
    try {
        let profile = params.recipientProfile;
        if (!profile) {
            const snap = await getProfileRef(db, recipientUid).get();
            profile = snap.exists ? (snap.data() || null) : null;
        }
        if (!allowNonApprovedRecipient) {
            if (!profile)
                return { sent: false, reason: 'no_profile' };
            if (profile.selfDeactivated === true || profile.profileStatus !== 'approved') {
                return { sent: false, reason: 'recipient_inactive' };
            }
            const ban = await isMatrimonyBanned(db, recipientUid);
            if (ban.banned)
                return { sent: false, reason: 'recipient_banned' };
        }
        if (!isNotificationPrefEnabled(profile, prefKey)) {
            return { sent: false, reason: 'pref_disabled' };
        }
        if (senderUid) {
            const [blockSnap, blockedBySenderSnap] = await Promise.all([
                getBlocksCol(db, recipientUid).doc(senderUid).get(),
                getBlocksCol(db, senderUid).doc(recipientUid).get(),
            ]);
            if (blockSnap.exists || blockedBySenderSnap.exists) {
                return { sent: false, reason: 'blocked' };
            }
        }
        const tasks = [];
        if (writeInAppDoc) {
            tasks.push(db.collection(COLLECTIONS.NOTIFICATIONS).add({
                recipientUid,
                ...(senderUid ? { senderUid } : {}),
                ...(prefKey ? { prefKey } : {}),
                ...(imageUrl ? { imageUrl } : {}),
                type,
                title,
                body,
                read: false,
                createdAt: FieldValue.serverTimestamp(),
            }));
        }
        const { tokens, refs } = await collectMemberFcmTokens(db, recipientUid);
        if (tokens.length === 0) {
            await Promise.allSettled(tasks);
            return { sent: false, reason: 'no_tokens', successCount: 0 };
        }
        const cleanImageUrl = typeof imageUrl === 'string' && imageUrl.startsWith('https://') ? imageUrl : undefined;
        const multicastPromise = getMessaging().sendEachForMulticast({
            tokens,
            notification: {
                title,
                body,
                ...(cleanImageUrl ? { imageUrl: cleanImageUrl } : {}),
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'church_alerts',
                    sound: 'default',
                    color: '#E04B5A',
                    ...(tag ? { tag } : {}),
                    ...(cleanImageUrl ? { imageUrl: cleanImageUrl } : {}),
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        ...(cleanImageUrl ? { 'mutable-content': 1 } : {}),
                    },
                },
                ...(cleanImageUrl ? { fcmOptions: { imageUrl: cleanImageUrl } } : {}),
            },
            data: buildStringDataPayload(type, prefKey, senderUid, data),
        });
        const [, fcmRes] = await Promise.all([Promise.allSettled(tasks), multicastPromise]);
        // Best-effort cleanup of unregistered/invalid tokens
        const badTokens = [];
        fcmRes.responses.forEach((resp, idx) => {
            const token = tokens[idx];
            if (token && !resp.success && resp.error?.code && INVALID_TOKEN_CODES.has(resp.error.code)) {
                badTokens.push(token);
            }
        });
        if (badTokens.length > 0 && refs.length > 0) {
            await Promise.allSettled(refs.map((ref) => ref.set({ fcmTokens: FieldValue.arrayRemove(...badTokens) }, { merge: true })));
        }
        return { sent: fcmRes.successCount > 0, successCount: fcmRes.successCount };
    }
    catch (err) {
        console.warn(`sendMatrimonyNotification warning [${type} -> ${recipientUid}]:`, err);
        return { sent: false, reason: 'error' };
    }
}
//# sourceMappingURL=notifications.js.map