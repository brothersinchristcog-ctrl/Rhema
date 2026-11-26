import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, DocumentReference, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { COLLECTIONS, DEFAULT_CHURCH_ID } from './constants.js';
import { getAdminProfileRef, getPrefsRef, getPrivateRef, getProfileRef, getVerificationRef, } from './store.js';
import { buildTestUserBatch } from './testSeedData.js';
function isAdminRoleRecord(record) {
    if (!record)
        return false;
    const roleStr = String(record.role || '').toLowerCase();
    const userTypeStr = String(record.userType || '').toLowerCase();
    return (record.superadmin === true ||
        record.isSuperAdmin === true ||
        roleStr === 'admin' ||
        roleStr === 'superadmin' ||
        roleStr === 'pastor' ||
        userTypeStr.includes('admin') ||
        userTypeStr.includes('pastor') ||
        userTypeStr.includes('super'));
}
async function requireTestSeedAdmin(request) {
    const { assertSuperAdminCaller } = await import('../adminPermissions.js');
    const result = await assertSuperAdminCaller(getFirestore(), request.auth, DEFAULT_CHURCH_ID);
    return result.uid;
}
async function commitBatchedWrites(db, writes) {
    for (let i = 0; i < writes.length; i += 400) {
        const chunk = writes.slice(i, i + 400);
        const batch = db.batch();
        for (const item of chunk) {
            batch.set(item.ref, item.data, { merge: true });
        }
        await batch.commit();
    }
}
async function commitBatchedDeletes(db, refs) {
    const uniqueMap = new Map();
    for (const r of refs) {
        uniqueMap.set(r.path, r);
    }
    const uniqueRefs = Array.from(uniqueMap.values());
    for (let i = 0; i < uniqueRefs.length; i += 400) {
        const chunk = uniqueRefs.slice(i, i + 400);
        const batch = db.batch();
        for (const ref of chunk) {
            batch.delete(ref);
        }
        await batch.commit();
    }
}
export const seedMatrimonyTestUsers = onCall({ invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 5, timeoutSeconds: 120, memory: '512MiB' }, async (request) => {
    await requireTestSeedAdmin(request);
    const db = getFirestore();
    const churchRef = db.collection('Rhema Church').doc(DEFAULT_CHURCH_ID);
    // Find highest existing testSequence so repeated clicks never collide
    const [existingProfilesSnap, existingMembersSnap] = await Promise.all([
        db.collection(COLLECTIONS.PROFILES).where('isTestUser', '==', true).get(),
        churchRef.collection('members').where('isTestUser', '==', true).get(),
    ]);
    let maxSeq = 0;
    const scanMax = (doc) => {
        const seqVal = Number(doc.data()?.testSequence || 0);
        if (Number.isFinite(seqVal) && seqVal > maxSeq)
            maxSeq = seqVal;
        const m = doc.id.match(/^test_rhema_(\d+)$/);
        if (m && m[1]) {
            const parsed = parseInt(m[1], 10);
            if (Number.isFinite(parsed) && parsed > maxSeq)
                maxSeq = parsed;
        }
    };
    existingProfilesSnap.docs.forEach(scanMax);
    existingMembersSnap.docs.forEach(scanMax);
    const startSequence = maxSeq + 1;
    const batchLabel = `admin_30_${Date.now()}`;
    const bundle = buildTestUserBatch({
        count: 30,
        startSequence,
        batchLabel,
    });
    const writes = [];
    for (const user of bundle) {
        writes.push({ ref: churchRef.collection('members').doc(user.uid), data: user.memberDoc }, { ref: churchRef.collection('memberPhoneIndex').doc(user.last10Phone), data: user.phoneIndexDoc }, { ref: churchRef.collection('registration_requests').doc(user.last10Phone), data: user.registrationRequestDoc }, { ref: db.collection('users').doc(user.uid), data: user.globalUserDoc }, { ref: getProfileRef(db, user.uid), data: user.matrimonyProfileDoc }, { ref: getPrivateRef(db, user.uid), data: user.matrimonyPrivateDoc }, { ref: getPrefsRef(db, user.uid), data: user.matrimonyPrefsDoc }, { ref: getVerificationRef(db, user.uid), data: user.matrimonyVerificationDoc }, { ref: getAdminProfileRef(db, user.uid), data: user.matrimonyAdminProfileDoc });
    }
    await commitBatchedWrites(db, writes);
    return {
        success: true,
        createdCount: bundle.length,
        maleCount: bundle.filter((u) => u.memberDoc.gender === 'Male').length,
        femaleCount: bundle.filter((u) => u.memberDoc.gender === 'Female').length,
    };
});
export const deleteMatrimonyTestUsers = onCall({ invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 5, timeoutSeconds: 180, memory: '512MiB' }, async (request) => {
    await requireTestSeedAdmin(request);
    const db = getFirestore();
    const churchRef = db.collection('Rhema Church').doc(DEFAULT_CHURCH_ID);
    const [profilesSnap, adminProfilesSnap, membersSnap, phoneIdxSnap, regReqSnap, usersSnap,] = await Promise.all([
        db.collection(COLLECTIONS.PROFILES).where('isTestUser', '==', true).get(),
        db.collection(COLLECTIONS.ADMIN_PROFILES).where('isTestUser', '==', true).get(),
        churchRef.collection('members').where('isTestUser', '==', true).get(),
        churchRef.collection('memberPhoneIndex').where('isTestUser', '==', true).get(),
        churchRef.collection('registration_requests').where('isTestUser', '==', true).get(),
        db.collection('users').where('isTestUser', '==', true).get(),
    ]);
    const testUidSet = new Set();
    profilesSnap.docs.forEach((d) => testUidSet.add(d.id));
    adminProfilesSnap.docs.forEach((d) => testUidSet.add(d.id));
    membersSnap.docs.forEach((d) => testUidSet.add(d.id));
    usersSnap.docs.forEach((d) => testUidSet.add(d.id));
    const testUids = Array.from(testUidSet);
    // Recursively delete matrimony_profiles/{uid} & matrimony_admin_profiles/{uid} (including all subcollections)
    await Promise.all(testUids.map((uid) => Promise.all([
        db.recursiveDelete(getProfileRef(db, uid)).catch(() => undefined),
        db.recursiveDelete(getAdminProfileRef(db, uid)).catch(() => undefined),
    ])));
    const directDeletes = [
        ...membersSnap.docs.map((d) => d.ref),
        ...phoneIdxSnap.docs.map((d) => d.ref),
        ...regReqSnap.docs.map((d) => d.ref),
        ...usersSnap.docs.map((d) => d.ref),
    ];
    // Clean up any cross-user interests, mutual matches, notifications, or chats involving test UIDs
    for (let i = 0; i < testUids.length; i += 30) {
        const uidChunk = testUids.slice(i, i + 30);
        if (uidChunk.length === 0)
            continue;
        const [sentInt, recvInt, matchesSnap, notifRecv, notifSend, chatsSnap] = await Promise.all([
            db.collection(COLLECTIONS.INTERESTS).where('senderUid', 'in', uidChunk).get(),
            db.collection(COLLECTIONS.INTERESTS).where('receiverUid', 'in', uidChunk).get(),
            db.collection(COLLECTIONS.MATCHES).where('participantIds', 'array-contains-any', uidChunk).get(),
            db.collection(COLLECTIONS.NOTIFICATIONS).where('recipientUid', 'in', uidChunk).get(),
            db.collection(COLLECTIONS.NOTIFICATIONS).where('senderUid', 'in', uidChunk).get(),
            db.collection(COLLECTIONS.CHATS).where('participantIds', 'array-contains-any', uidChunk).get(),
        ]);
        sentInt.docs.forEach((d) => directDeletes.push(d.ref));
        recvInt.docs.forEach((d) => directDeletes.push(d.ref));
        matchesSnap.docs.forEach((d) => directDeletes.push(d.ref));
        notifRecv.docs.forEach((d) => directDeletes.push(d.ref));
        notifSend.docs.forEach((d) => directDeletes.push(d.ref));
        await Promise.all(chatsSnap.docs.map((chatDoc) => db.recursiveDelete(chatDoc.ref).catch(() => undefined)));
    }
    await commitBatchedDeletes(db, directDeletes);
    return {
        success: true,
        deletedCount: testUids.length,
    };
});
//# sourceMappingURL=testSeed.js.map