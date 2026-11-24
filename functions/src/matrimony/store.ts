import { FieldValue, Firestore, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  COLLECTIONS,
  DEFAULT_CHURCH_ID,
  MATRIMONY_BUCKET,
  SUBCOLLECTIONS,
  SUBDOC_IDS,
} from './constants.js';

export function getProfileRef(db: Firestore, uid: string) {
  return db.collection(COLLECTIONS.PROFILES).doc(uid);
}

export function getPrivateRef(db: Firestore, uid: string) {
  return getProfileRef(db, uid)
    .collection(SUBCOLLECTIONS.PRIVATE)
    .doc(SUBDOC_IDS.PRIVATE_INFO);
}

export function getPrefsRef(db: Firestore, uid: string) {
  return getProfileRef(db, uid)
    .collection(SUBCOLLECTIONS.PREFERENCES)
    .doc(SUBDOC_IDS.PARTNER_PREFS);
}

export function getVerificationRef(db: Firestore, uid: string) {
  return getProfileRef(db, uid)
    .collection(SUBCOLLECTIONS.VERIFICATION)
    .doc(SUBDOC_IDS.VERIFICATION_STATUS);
}

export function getShortlistsCol(db: Firestore, uid: string) {
  return getProfileRef(db, uid).collection(SUBCOLLECTIONS.SHORTLISTS);
}

export function getShortlistedByCol(db: Firestore, uid: string) {
  return getProfileRef(db, uid).collection(SUBCOLLECTIONS.SHORTLISTED_BY);
}

export function getViewsCol(db: Firestore, uid: string) {
  return getProfileRef(db, uid).collection(SUBCOLLECTIONS.VIEWS);
}

export function getViewedByCol(db: Firestore, uid: string) {
  return getProfileRef(db, uid).collection(SUBCOLLECTIONS.VIEWED_BY);
}

export function getBlocksCol(db: Firestore, uid: string) {
  return getProfileRef(db, uid).collection(SUBCOLLECTIONS.BLOCKS);
}

export function getUnlockedContactsCol(db: Firestore, uid: string) {
  return getProfileRef(db, uid).collection(SUBCOLLECTIONS.UNLOCKED_CONTACTS);
}

export function getPhotoRequestsCol(db: Firestore, uid: string) {
  return getProfileRef(db, uid).collection(SUBCOLLECTIONS.PHOTO_REQUESTS);
}

export function getSentPhotoRequestsCol(db: Firestore, uid: string) {
  return getProfileRef(db, uid).collection(SUBCOLLECTIONS.PHOTO_REQUESTS_SENT);
}

export function getSubscriptionRef(db: Firestore, uid: string) {
  return db.collection(COLLECTIONS.SUBSCRIPTIONS).doc(uid);
}

export function getEntitlementRef(db: Firestore, uid: string) {
  return db.collection(COLLECTIONS.ENTITLEMENTS).doc(uid);
}

export function getUsageRef(db: Firestore, uid: string) {
  return db.collection(COLLECTIONS.USAGE).doc(uid);
}

export function getAdminProfileRef(db: Firestore, uid: string) {
  return db.collection(COLLECTIONS.ADMIN_PROFILES).doc(uid);
}

export function getBanRef(db: Firestore, uid: string) {
  return db.collection(COLLECTIONS.BANS).doc(uid);
}

/**
 * Reads sensitive private info from matrimony_profiles/{uid}/private/info,
 * falling back to legacy matrimony_private/{uid} during migration.
 */
export async function readPrivateSnap(db: Firestore, uid: string): Promise<DocumentSnapshot> {
  const subSnap = await getPrivateRef(db, uid).get();
  if (subSnap.exists) return subSnap;
  return db.collection(COLLECTIONS.PRIVATE).doc(uid).get();
}

/**
 * Reads partner preferences from matrimony_profiles/{uid}/preferences/partner,
 * falling back to legacy matrimony_preferences/{uid} during migration.
 */
export async function readPrefsSnap(db: Firestore, uid: string): Promise<DocumentSnapshot> {
  const subSnap = await getPrefsRef(db, uid).get();
  if (subSnap.exists) return subSnap;
  return db.collection(COLLECTIONS.PREFERENCES).doc(uid).get();
}

/**
 * Reads verification status from matrimony_profiles/{uid}/verification/status,
 * falling back to legacy matrimony_verifications/{uid} during migration.
 */
export async function readVerificationSnap(db: Firestore, uid: string): Promise<DocumentSnapshot> {
  const subSnap = await getVerificationRef(db, uid).get();
  if (subSnap.exists) return subSnap;
  return db.collection(COLLECTIONS.VERIFICATIONS).doc(uid).get();
}

export async function readShortlistDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]> {
  const subSnap = await getShortlistsCol(db, uid).get();
  if (!subSnap.empty) return subSnap.docs;
  const legacySnap = await db.collection(COLLECTIONS.SHORTLISTS).doc(uid).collection('saved').get();
  return legacySnap.docs;
}

export async function readShortlistedByDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]> {
  const subSnap = await getShortlistedByCol(db, uid).get();
  return subSnap.docs;
}

export async function readViewDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]> {
  const subSnap = await getViewsCol(db, uid).get();
  return subSnap.docs;
}

export async function readViewedByDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]> {
  const subSnap = await getViewedByCol(db, uid).get();
  return subSnap.docs;
}

export async function readBlockDocs(db: Firestore, uid: string): Promise<QueryDocumentSnapshot[]> {
  const subSnap = await getBlocksCol(db, uid).get();
  if (!subSnap.empty) return subSnap.docs;
  const legacySnap = await db.collection(COLLECTIONS.BLOCKS).doc(uid).collection('blocked').get();
  return legacySnap.docs;
}

export function isMatrimonyProfileInactiveStatus(status: unknown): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'inactive' || s === 'suspended';
}

export async function isMatrimonyBanned(
  db: Firestore,
  uid: string
): Promise<{ banned: boolean; reason?: string }> {
  const banSnap = await getBanRef(db, uid).get();
  if (!banSnap.exists) return { banned: false };
  const data = banSnap.data() || {};
  if (data.active === false || data.source === 'console_delete') {
    return { banned: false };
  }
  return {
    banned: true,
    reason: typeof data.reason === 'string' && data.reason.trim()
      ? data.reason.trim()
      : 'Your Rhema Matrimony profile is currently inactive. Please contact Church Administration.',
  };
}

export async function assertMatrimonyNotBanned(db: Firestore, uid: string): Promise<void> {
  const ban = await isMatrimonyBanned(db, uid);
  if (ban.banned) {
    throw new HttpsError(
      'permission-denied',
      ban.reason || 'Your Rhema Matrimony profile is currently inactive. Please contact Church Administration.',
      { reasonCode: 'MATRIMONY_ACCESS_REVOKED' }
    );
  }
}

export async function assertMatrimonyProfileActive(
  db: Firestore,
  uid: string
): Promise<Record<string, any>> {
  await assertMatrimonyNotBanned(db, uid);
  const profSnap = await getProfileRef(db, uid).get();
  if (!profSnap.exists) {
    throw new HttpsError(
      'failed-precondition',
      'Matrimony profile not found.',
      { reasonCode: 'MATRIMONY_PROFILE_NOT_FOUND' }
    );
  }
  const data = profSnap.data() || {};
  if (isMatrimonyProfileInactiveStatus(data.profileStatus)) {
    throw new HttpsError(
      'failed-precondition',
      typeof data.inactiveReason === 'string' && data.inactiveReason.trim()
        ? data.inactiveReason.trim()
        : 'Your Rhema Matrimony profile is currently inactive. Please contact Church Administration.',
      { reasonCode: 'MATRIMONY_PROFILE_INACTIVE' }
    );
  }
  if (data.profileStatus !== 'approved') {
    throw new HttpsError(
      'failed-precondition',
      'Your Rhema Matrimony profile is awaiting Church Administration approval.',
      { reasonCode: 'MATRIMONY_PROFILE_PENDING' }
    );
  }
  return data;
}

async function deleteCollectionQueries(
  db: Firestore,
  queries: FirebaseFirestore.Query[]
): Promise<void> {
  for (const q of queries) {
    const snap = await q.get();
    if (snap.empty) continue;
    const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
    for (let i = 0; i < snap.docs.length; i += 400) {
      chunks.push(snap.docs.slice(i, i + 400));
    }
    for (const chunk of chunks) {
      const batch = db.batch();
      chunk.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
}

export interface PurgeUserOptions {
  banOnDelete?: boolean;
  banReason?: string;
  actorUid?: string;
  source?: 'admin_action' | 'console_delete' | 'self_reset';
  auditAction?: string;
}

/**
 * Purges a user's Matrimony profile, all subcollections, consolidated admin doc,
 * legacy root docs, Storage photos, and cross-user interests/matches.
 * Leaves their main Rhema Church membership record untouched.
 */
export async function purgeMatrimonyUserData(
  db: Firestore,
  targetUid: string,
  options: PurgeUserOptions = {}
): Promise<void> {
  const now = FieldValue.serverTimestamp();

  // 1. Write ban record first (if abuse removal or console deletion) so re-registration is blocked immediately
  if (options.banOnDelete) {
    const banRef = getBanRef(db, targetUid);
    const existingBan = await banRef.get();
    if (!existingBan.exists || existingBan.data()?.active === false) {
      await banRef.set({
        uid: targetUid,
        churchId: DEFAULT_CHURCH_ID,
        active: true,
        reason: options.banReason || 'Removed by Church Administration.',
        source: options.source || 'admin_action',
        bannedBy: options.actorUid || 'system',
        bannedAt: now,
        updatedAt: now,
      });
    }
  }

  // 2. Recursively delete matrimony_profiles/{uid} & all subcollections, plus admin doc & legacy docs
  const profileRef = getProfileRef(db, targetUid);
  const adminProfileRef = getAdminProfileRef(db, targetUid);
  await Promise.all([
    db.recursiveDelete(profileRef).catch((err) => console.warn(`recursiveDelete(profile ${targetUid}) warning:`, err)),
    db.recursiveDelete(adminProfileRef).catch((err) => console.warn(`recursiveDelete(admin ${targetUid}) warning:`, err)),
    db.collection(COLLECTIONS.PRIVATE).doc(targetUid).delete().catch(() => undefined),
    db.collection(COLLECTIONS.PREFERENCES).doc(targetUid).delete().catch(() => undefined),
    db.collection(COLLECTIONS.VERIFICATIONS).doc(targetUid).delete().catch(() => undefined),
    db.recursiveDelete(db.collection(COLLECTIONS.SHORTLISTS).doc(targetUid)).catch(() => undefined),
    db.recursiveDelete(db.collection(COLLECTIONS.BLOCKS).doc(targetUid)).catch(() => undefined),
  ]);

  // 3. Delete uploaded matrimony photos in Storage
  try {
    const bucket = getStorage().bucket(MATRIMONY_BUCKET);
    await bucket.deleteFiles({ prefix: `photos/${targetUid}/` });
  } catch (err) {
    console.warn(`Storage cleanup for photos/${targetUid}/ warning:`, err);
  }

  // 4. Clean up interests, mutual matches, and matrimony notifications involving this user
  await deleteCollectionQueries(db, [
    db.collection(COLLECTIONS.INTERESTS).where('senderUid', '==', targetUid),
    db.collection(COLLECTIONS.INTERESTS).where('receiverUid', '==', targetUid),
    db.collection(COLLECTIONS.MATCHES).where('participantIds', 'array-contains', targetUid),
    db.collection(COLLECTIONS.NOTIFICATIONS).where('recipientUid', '==', targetUid),
    db.collection(COLLECTIONS.NOTIFICATIONS).where('senderUid', '==', targetUid),
  ]);

  // 5. Write audit log entry
  if (options.auditAction) {
    await db.collection(COLLECTIONS.AUDIT_LOGS).add({
      action: options.auditAction,
      actorUid: options.actorUid || 'system',
      targetUid,
      reason: options.banReason || null,
      source: options.source || null,
      churchId: DEFAULT_CHURCH_ID,
      createdAt: now,
    });
  }
}
