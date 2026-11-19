import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApp } from 'firebase-admin/app';
import { getDatabaseWithUrl, ServerValue } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { COLLECTIONS, DEFAULT_CHURCH_ID, MATRIMONY_BUCKET } from './constants.js';
import { assertMatrimonyProfileActive, getProfileRef, readBlockDocs, readPrivateSnap } from './store.js';
import { assertNonEmptyString, optionalString } from './validation.js';

export const MATRIMONY_RTDB_URL = 'https://rhema-global-ministries-default-rtdb.firebaseio.com';

function getRtdb() {
  return getDatabaseWithUrl(MATRIMONY_RTDB_URL, getApp());
}

function getRoomId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

function requireAuthUid(request: { auth?: { uid?: string } }): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  return uid;
}

async function resolveSinglePhotoUrl(pathOrUrl?: string | null): Promise<string | null> {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return null;
  const clean = pathOrUrl.trim();
  if (!clean) return null;
  if (clean.startsWith('https://') || clean.startsWith('http://')) {
    return clean;
  }
  const bucket = getStorage().bucket(MATRIMONY_BUCKET);
  try {
    const [signedUrl] = await bucket.file(clean).getSignedUrl({
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });
    return signedUrl;
  } catch {
    try {
      const file = bucket.file(clean);
      const [meta] = await file.getMetadata();
      const existing = String(meta?.metadata?.firebaseStorageDownloadTokens || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      let token = existing[0];
      if (!token) {
        token = randomUUID();
        await file.setMetadata({
          metadata: {
            ...(meta?.metadata || {}),
            firebaseStorageDownloadTokens: token,
          },
        });
      }
      return `https://firebasestorage.googleapis.com/v0/b/${MATRIMONY_BUCKET}/o/${encodeURIComponent(clean)}?alt=media&token=${encodeURIComponent(token)}`;
    } catch {
      return null;
    }
  }
}

async function verifyMutualChatEligibility(
  db: FirebaseFirestore.Firestore,
  uid: string,
  targetUid: string
): Promise<{
  viewerData: Record<string, any>;
  targetData: Record<string, any>;
  targetPrivate: Record<string, any>;
}> {
  if (uid === targetUid) {
    throw new HttpsError('invalid-argument', 'Cannot open a chat with yourself.');
  }
  await Promise.all([assertMatrimonyProfileActive(db, uid), assertMatrimonyProfileActive(db, targetUid)]);

  const pair = [uid, targetUid].sort();
  const [
    viewerProfSnap,
    targetProfSnap,
    targetPrivSnap,
    viewerBlocks,
    targetBlocks,
    matchSnap,
    sentSnap,
    receivedSnap,
  ] = await Promise.all([
    getProfileRef(db, uid).get(),
    getProfileRef(db, targetUid).get(),
    readPrivateSnap(db, targetUid),
    readBlockDocs(db, uid),
    readBlockDocs(db, targetUid),
    db.collection(COLLECTIONS.MATCHES).doc(`${pair[0]}_${pair[1]}`).get(),
    db.collection(COLLECTIONS.INTERESTS).doc(`${uid}_${targetUid}`).get(),
    db.collection(COLLECTIONS.INTERESTS).doc(`${targetUid}_${uid}`).get(),
  ]);

  if (!viewerProfSnap.exists || !targetProfSnap.exists) {
    throw new HttpsError('not-found', 'Matrimony profile not found.');
  }

  const viewerData = viewerProfSnap.data() || {};
  const targetData = targetProfSnap.data() || {};
  if (viewerData.profileStatus !== 'approved' || targetData.profileStatus !== 'approved') {
    throw new HttpsError('failed-precondition', 'Both profiles must be verified to chat.');
  }

  const viewerBlocked = viewerBlocks.some((d) => d.id === targetUid);
  const targetBlocked = targetBlocks.some((d) => d.id === uid);
  if (viewerBlocked || targetBlocked) {
    throw new HttpsError('permission-denied', 'Chat is unavailable for this profile.');
  }

  const isMutualMatch =
    matchSnap.exists ||
    sentSnap.data()?.status === 'accepted' ||
    receivedSnap.data()?.status === 'accepted';
  if (!isMutualMatch) {
    throw new HttpsError(
      'failed-precondition',
      'Direct messaging opens once mutual interest is accepted.'
    );
  }

  return {
    viewerData,
    targetData,
    targetPrivate: targetPrivSnap.exists ? targetPrivSnap.data() || {} : {},
  };
}

async function seedChatParticipantsInRtdb(params: {
  roomId: string;
  uid: string;
  targetUid: string;
  viewerName: string;
  viewerPhoto: string | null;
  viewerCode: string;
  targetName: string;
  targetPhoto: string | null;
  targetCode: string;
  targetAge: number | null;
  targetCity: string;
  targetPhone: string | null;
}) {
  const rtdb = getRtdb();
  const updates: Record<string, any> = {
    [`matrimony_chats/${params.roomId}/participants/${params.uid}`]: true,
    [`matrimony_chats/${params.roomId}/participants/${params.targetUid}`]: true,
    [`matrimony_inbox/${params.uid}/${params.roomId}/roomId`]: params.roomId,
    [`matrimony_inbox/${params.uid}/${params.roomId}/peerUid`]: params.targetUid,
    [`matrimony_inbox/${params.uid}/${params.roomId}/peerName`]: params.targetName,
    [`matrimony_inbox/${params.uid}/${params.roomId}/peerPhoto`]: params.targetPhoto || null,
    [`matrimony_inbox/${params.uid}/${params.roomId}/peerCode`]: params.targetCode,
    [`matrimony_inbox/${params.uid}/${params.roomId}/peerAge`]: params.targetAge ?? null,
    [`matrimony_inbox/${params.uid}/${params.roomId}/peerCity`]: params.targetCity || null,
    [`matrimony_inbox/${params.uid}/${params.roomId}/contactPhone`]: params.targetPhone || null,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/roomId`]: params.roomId,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerUid`]: params.uid,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerName`]: params.viewerName,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerPhoto`]: params.viewerPhoto || null,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerCode`]: params.viewerCode,
  };
  await rtdb.ref().update(updates);
}

/**
 * 1. ensureMatrimonyChatRoom
 * Verifies mutual-match eligibility and provisions participants & inbox metadata in RTDB.
 */
export const ensureMatrimonyChatRoom = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const db = getFirestore();

  const { viewerData, targetData, targetPrivate } = await verifyMutualChatEligibility(
    db,
    uid,
    targetUid
  );
  const [viewerPhoto, targetPhoto] = await Promise.all([
    resolveSinglePhotoUrl(viewerData.profilePhoto),
    resolveSinglePhotoUrl(targetData.profilePhoto),
  ]);

  const roomId = getRoomId(uid, targetUid);
  const targetCity =
    targetData.location?.village || targetData.location?.city || targetData.location?.state || '';
  const targetCode = targetData.matrimonyId || `RM${targetUid.slice(0, 7).toUpperCase()}`;
  const viewerCode = viewerData.matrimonyId || `RM${uid.slice(0, 7).toUpperCase()}`;

  await seedChatParticipantsInRtdb({
    roomId,
    uid,
    targetUid,
    viewerName: viewerData.displayName || 'Rhema Member',
    viewerPhoto,
    viewerCode,
    targetName: targetData.displayName || 'Rhema Member',
    targetPhoto,
    targetCode,
    targetAge: typeof targetData.age === 'number' ? targetData.age : null,
    targetCity,
    targetPhone: targetPrivate.phoneNumber || null,
  });

  return {
    success: true,
    roomId,
    peer: {
      uid: targetUid,
      displayName: targetData.displayName || 'Rhema Member',
      profileCode: targetCode,
      signedProfilePhoto: targetPhoto,
      age: typeof targetData.age === 'number' ? targetData.age : null,
      city: targetCity,
      contactPhone: targetPrivate.phoneNumber || null,
    },
    self: {
      uid,
      displayName: viewerData.displayName || 'Rhema Member',
      signedProfilePhoto: viewerPhoto,
    },
  };
});

/**
 * 2. getMatrimonyChatContacts
 * Ensures RTDB chat rooms & inbox entries exist for all Mutual Matches of the viewer.
 */
export const getMatrimonyChatContacts = onCall(
  { invoker: 'public', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 10 },
  async (request) => {
  const uid = requireAuthUid(request);
  const db = getFirestore();
  await assertMatrimonyProfileActive(db, uid);

  const [viewerProfSnap, matchesSnap, sentAccSnap, recvAccSnap, blocks] = await Promise.all([
    getProfileRef(db, uid).get(),
    db.collection(COLLECTIONS.MATCHES).where('participantIds', 'array-contains', uid).get(),
    db
      .collection(COLLECTIONS.INTERESTS)
      .where('senderUid', '==', uid)
      .where('status', '==', 'accepted')
      .get(),
    db
      .collection(COLLECTIONS.INTERESTS)
      .where('receiverUid', '==', uid)
      .where('status', '==', 'accepted')
      .get(),
    readBlockDocs(db, uid),
  ]);

  if (!viewerProfSnap.exists) {
    return { success: true, contacts: [], self: { uid, displayName: 'Rhema Member', signedProfilePhoto: null } };
  }

  const viewerData = viewerProfSnap.data() || {};
  const viewerPhoto = await resolveSinglePhotoUrl(viewerData.profilePhoto);
  const viewerCode = viewerData.matrimonyId || `RM${uid.slice(0, 7).toUpperCase()}`;
  const blockedSet = new Set(blocks.map((d) => d.id));

  const peerUids = new Set<string>();
  matchesSnap.docs.forEach((d) => {
    const arr = Array.isArray(d.data()?.participantIds) ? d.data().participantIds : [];
    arr.forEach((p: unknown) => {
      const s = String(p || '');
      if (s && s !== uid && !blockedSet.has(s)) peerUids.add(s);
    });
  });
  sentAccSnap.docs.forEach((d) => {
    const s = String(d.data()?.receiverUid || '');
    if (s && s !== uid && !blockedSet.has(s)) peerUids.add(s);
  });
  recvAccSnap.docs.forEach((d) => {
    const s = String(d.data()?.senderUid || '');
    if (s && s !== uid && !blockedSet.has(s)) peerUids.add(s);
  });

  const contacts: {
    roomId: string;
    uid: string;
    displayName: string;
    profileCode: string;
    signedProfilePhoto: string | null;
    age: number | null;
    city: string;
    contactPhone: string | null;
    matchTierEligible: boolean;
  }[] = [];

  await Promise.all(
    Array.from(peerUids).map(async (targetUid) => {
      const [tSnap, tPrivSnap, tBlocks] = await Promise.all([
        getProfileRef(db, targetUid).get(),
        readPrivateSnap(db, targetUid),
        readBlockDocs(db, targetUid),
      ]);
      if (!tSnap.exists) return;
      if (tBlocks.some((d) => d.id === uid)) return;
      const tData = tSnap.data() || {};
      if (tData.profileStatus !== 'approved') return;

      const tPriv = tPrivSnap.exists ? tPrivSnap.data() || {} : {};
      const tPhoto = await resolveSinglePhotoUrl(tData.profilePhoto);
      const tCode = tData.matrimonyId || `RM${targetUid.slice(0, 7).toUpperCase()}`;
      const tCity = tData.location?.village || tData.location?.city || tData.location?.state || '';
      const tAge = typeof tData.age === 'number' ? tData.age : null;
      const roomId = getRoomId(uid, targetUid);

      await seedChatParticipantsInRtdb({
        roomId,
        uid,
        targetUid,
        viewerName: viewerData.displayName || 'Rhema Member',
        viewerPhoto,
        viewerCode,
        targetName: tData.displayName || 'Rhema Member',
        targetPhoto: tPhoto,
        targetCode: tCode,
        targetAge: tAge,
        targetCity: tCity,
        targetPhone: tPriv.phoneNumber || null,
      }).catch(() => undefined);

      contacts.push({
        roomId,
        uid: targetUid,
        displayName: tData.displayName || 'Rhema Member',
        profileCode: tCode,
        signedProfilePhoto: tPhoto,
        age: tAge,
        city: tCity,
        contactPhone: tPriv.phoneNumber || null,
        matchTierEligible: Boolean(tPhoto),
      });
    })
  );

  return {
    success: true,
    contacts,
    self: {
      uid,
      displayName: viewerData.displayName || 'Rhema Member',
      signedProfilePhoto: viewerPhoto,
    },
  };
});

/**
 * 3. notifyMatrimonyChatMessage
 * Sends a push notification to the recipient when a real-time chat message is sent.
 */
export const notifyMatrimonyChatMessage = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const previewText = optionalString(request.data?.previewText, 180) || 'Sent you a message';
  const db = getFirestore();

  await assertMatrimonyProfileActive(db, uid);
  const [senderSnap, memberSnap, userSnap] = await Promise.all([
    getProfileRef(db, uid).get(),
    db
      .collection('Rhema Church')
      .doc(DEFAULT_CHURCH_ID)
      .collection('members')
      .doc(targetUid)
      .get(),
    db.collection('users').doc(targetUid).get(),
  ]);

  const senderName = senderSnap.data()?.displayName || 'Matrimony Match';
  const fcmToken = memberSnap.data()?.fcmToken || userSnap.data()?.fcmToken;
  if (!fcmToken) {
    return { success: true, sent: false };
  }

  // Only push if recipient isn't actively viewing this exact chat room
  const rtdb = getRtdb();
  const roomId = getRoomId(uid, targetUid);
  const presenceSnap = await rtdb.ref(`matrimony_presence/${targetUid}`).get().catch(() => null);
  const presence = presenceSnap?.val();
  if (presence?.online === true && presence?.activeChatId === roomId) {
    return { success: true, sent: false };
  }

  try {
    await getMessaging().send({
      token: fcmToken,
      notification: {
        title: senderName,
        body: previewText,
      },
      data: {
        type: 'MATRIMONY_CHAT',
        module: 'matrimony',
        roomId,
        peerUid: uid,
      },
    });
    return { success: true, sent: true };
  } catch {
    return { success: true, sent: false };
  }
});

export async function seedMutualMatchChatOnAccept(
  db: FirebaseFirestore.Firestore,
  uidA: string,
  uidB: string
): Promise<void> {
  try {
    const [aSnap, bSnap, aPrivSnap, bPrivSnap] = await Promise.all([
      getProfileRef(db, uidA).get(),
      getProfileRef(db, uidB).get(),
      readPrivateSnap(db, uidA),
      readPrivateSnap(db, uidB),
    ]);
    if (!aSnap.exists || !bSnap.exists) return;
    const a = aSnap.data() || {};
    const b = bSnap.data() || {};
    const aPriv = aPrivSnap.exists ? aPrivSnap.data() || {} : {};
    const bPriv = bPrivSnap.exists ? bPrivSnap.data() || {} : {};
    const [aPhoto, bPhoto] = await Promise.all([
      resolveSinglePhotoUrl(a.profilePhoto),
      resolveSinglePhotoUrl(b.profilePhoto),
    ]);
    const roomId = getRoomId(uidA, uidB);
    const rtdb = getRtdb();
    await rtdb.ref().update({
      [`matrimony_chats/${roomId}/participants/${uidA}`]: true,
      [`matrimony_chats/${roomId}/participants/${uidB}`]: true,
      [`matrimony_chats/${roomId}/createdAt`]: ServerValue.TIMESTAMP,
      [`matrimony_inbox/${uidA}/${roomId}/roomId`]: roomId,
      [`matrimony_inbox/${uidA}/${roomId}/peerUid`]: uidB,
      [`matrimony_inbox/${uidA}/${roomId}/peerName`]: b.displayName || 'Rhema Member',
      [`matrimony_inbox/${uidA}/${roomId}/peerPhoto`]: bPhoto || null,
      [`matrimony_inbox/${uidA}/${roomId}/peerCode`]: b.matrimonyId || `RM${uidB.slice(0, 7).toUpperCase()}`,
      [`matrimony_inbox/${uidA}/${roomId}/peerAge`]: typeof b.age === 'number' ? b.age : null,
      [`matrimony_inbox/${uidA}/${roomId}/peerCity`]: b.location?.village || b.location?.city || b.location?.state || null,
      [`matrimony_inbox/${uidA}/${roomId}/contactPhone`]: bPriv.phoneNumber || null,
      [`matrimony_inbox/${uidB}/${roomId}/roomId`]: roomId,
      [`matrimony_inbox/${uidB}/${roomId}/peerUid`]: uidA,
      [`matrimony_inbox/${uidB}/${roomId}/peerName`]: a.displayName || 'Rhema Member',
      [`matrimony_inbox/${uidB}/${roomId}/peerPhoto`]: aPhoto || null,
      [`matrimony_inbox/${uidB}/${roomId}/peerCode`]: a.matrimonyId || `RM${uidA.slice(0, 7).toUpperCase()}`,
      [`matrimony_inbox/${uidB}/${roomId}/peerAge`]: typeof a.age === 'number' ? a.age : null,
      [`matrimony_inbox/${uidB}/${roomId}/peerCity`]: a.location?.village || a.location?.city || a.location?.state || null,
      [`matrimony_inbox/${uidB}/${roomId}/contactPhone`]: aPriv.phoneNumber || null,
    });
  } catch (err) {
    console.warn('seedMutualMatchChatOnAccept warning:', err);
  }
}
