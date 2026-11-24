import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApp } from 'firebase-admin/app';
import { getDatabaseWithUrl, ServerValue } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { COLLECTIONS, DEFAULT_CHURCH_ID, MATRIMONY_BUCKET } from './constants.js';
import { resolveMemberEntitlements, syncEntitlementsToRtdb } from './entitlements.js';
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

let chatSignBlobUnavailable = false;
const WARM_CHAT_PHOTO_CACHE = new Map<string, { url: string; expiresAtMs: number }>();

async function resolveSinglePhotoUrl(pathOrUrl?: string | null): Promise<string | null> {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return null;
  const clean = pathOrUrl.trim();
  if (!clean) return null;
  if (clean.startsWith('https://') || clean.startsWith('http://')) {
    return clean;
  }
  const now = Date.now();
  const cached = WARM_CHAT_PHOTO_CACHE.get(clean);
  if (cached && cached.expiresAtMs > now + 5 * 60 * 1000) {
    return cached.url;
  }

  const bucket = getStorage().bucket(MATRIMONY_BUCKET);
  const expires = now + 24 * 60 * 60 * 1000;
  if (!chatSignBlobUnavailable) {
    try {
      const [signedUrl] = await bucket.file(clean).getSignedUrl({
        action: 'read',
        expires,
      });
      WARM_CHAT_PHOTO_CACHE.set(clean, { url: signedUrl, expiresAtMs: expires });
      return signedUrl;
    } catch {
      chatSignBlobUnavailable = true;
    }
  }

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
    const tokenUrl = `https://firebasestorage.googleapis.com/v0/b/${MATRIMONY_BUCKET}/o/${encodeURIComponent(clean)}?alt=media&token=${encodeURIComponent(token)}`;
    WARM_CHAT_PHOTO_CACHE.set(clean, { url: tokenUrl, expiresAtMs: expires });
    return tokenUrl;
  } catch {
    return null;
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
  if (viewerData.selfDeactivated === true) {
    throw new HttpsError(
      'failed-precondition',
      'Your profile is currently deactivated. Reactivate it in Account Settings to message members.'
    );
  }
  if (targetData.selfDeactivated === true) {
    throw new HttpsError('failed-precondition', 'This profile is currently deactivated.');
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

function resolveOccupationLabel(data: Record<string, any>): string {
  return String(
    data?.career?.profession ||
      data?.career?.occupationCategory ||
      data?.career?.employmentType ||
      data?.education?.qualification ||
      ''
  ).trim();
}

async function seedChatParticipantsInRtdb(params: {
  roomId: string;
  uid: string;
  targetUid: string;
  viewerName: string;
  viewerPhoto: string | null;
  viewerCode: string;
  viewerHeightCm?: number | null;
  viewerOccupation?: string;
  viewerGender?: string;
  targetName: string;
  targetPhoto: string | null;
  targetCode: string;
  targetAge: number | null;
  targetCity: string;
  targetPhone: string | null;
  targetHeightCm?: number | null;
  targetOccupation?: string;
  targetGender?: string;
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
    [`matrimony_inbox/${params.uid}/${params.roomId}/peerHeightCm`]: params.targetHeightCm ?? null,
    [`matrimony_inbox/${params.uid}/${params.roomId}/peerOccupation`]: params.targetOccupation || null,
    [`matrimony_inbox/${params.uid}/${params.roomId}/peerGender`]: params.targetGender || null,
    [`matrimony_inbox/${params.uid}/${params.roomId}/contactPhone`]: params.targetPhone || null,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/roomId`]: params.roomId,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerUid`]: params.uid,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerName`]: params.viewerName,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerPhoto`]: params.viewerPhoto || null,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerCode`]: params.viewerCode,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerHeightCm`]: params.viewerHeightCm ?? null,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerOccupation`]: params.viewerOccupation || null,
    [`matrimony_inbox/${params.targetUid}/${params.roomId}/peerGender`]: params.viewerGender || null,
  };
  await rtdb.ref().update(updates);
}

/**
 * 1. ensureMatrimonyChatRoom
 * Verifies mutual-match eligibility, resolves viewer's messageAccess entitlement,
 * exposes contactPhone ONLY if Platinum or explicitly unlocked, and provisions RTDB room.
 * Free/expired members keep read access to existing chat history with canMessage=false.
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
  const entitlements = await resolveMemberEntitlements(db, uid, viewerData);
  await syncEntitlementsToRtdb(uid, {
    tier: entitlements.tier,
    canMessage: entitlements.messageAccess,
    validUntilMs: entitlements.expiryDateMs,
  });

  const canSeePhone =
    targetData.mobilePrivacy !== 'messages_only' &&
    entitlements.tier !== 'free' &&
    (entitlements.contactNumberLimit < 0 || entitlements.unlockedContactUids.includes(targetUid));

  const targetPhotoAllowed =
    targetData.photoVisibility !== 'protect_photo' ||
    (Array.isArray(targetData.protectedPhotoAllowedUids) &&
      targetData.protectedPhotoAllowedUids.includes(uid));

  const [viewerPhoto, targetPhoto] = await Promise.all([
    resolveSinglePhotoUrl(viewerData.profilePhoto),
    targetPhotoAllowed ? resolveSinglePhotoUrl(targetData.profilePhoto) : Promise.resolve(null),
  ]);

  const roomId = getRoomId(uid, targetUid);
  const targetCity =
    targetData.location?.village || targetData.location?.city || targetData.location?.state || '';
  const targetCode = targetData.matrimonyId || `RM${targetUid.slice(0, 7).toUpperCase()}`;
  const viewerCode = viewerData.matrimonyId || `RM${uid.slice(0, 7).toUpperCase()}`;
  const exposedPhone = canSeePhone ? targetPrivate.phoneNumber || null : null;
  const targetHeightCm = typeof targetData.heightCm === 'number' ? targetData.heightCm : null;
  const targetOccupation = resolveOccupationLabel(targetData);
  const targetGender = String(targetData.gender || '').trim();
  const viewerHeightCm = typeof viewerData.heightCm === 'number' ? viewerData.heightCm : null;
  const viewerOccupation = resolveOccupationLabel(viewerData);
  const viewerGender = String(viewerData.gender || '').trim();

  await seedChatParticipantsInRtdb({
    roomId,
    uid,
    targetUid,
    viewerName: viewerData.displayName || 'Rhema Member',
    viewerPhoto,
    viewerCode,
    viewerHeightCm,
    viewerOccupation,
    viewerGender,
    targetName: targetData.displayName || 'Rhema Member',
    targetPhoto,
    targetCode,
    targetAge: typeof targetData.age === 'number' ? targetData.age : null,
    targetCity,
    targetPhone: exposedPhone,
    targetHeightCm,
    targetOccupation,
    targetGender,
  });

  return {
    success: true,
    roomId,
    canMessage: entitlements.messageAccess,
    viewerTier: entitlements.tier,
    peer: {
      uid: targetUid,
      displayName: targetData.displayName || 'Rhema Member',
      profileCode: targetCode,
      signedProfilePhoto: targetPhoto,
      age: typeof targetData.age === 'number' ? targetData.age : null,
      heightCm: targetHeightCm,
      occupation: targetOccupation,
      gender: targetGender,
      isVerified: targetData.profileStatus === 'approved',
      city: targetCity,
      contactPhone: exposedPhone,
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
 * Respects viewer's contact unlock entitlement and exposes messageAccess status.
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
      return {
        success: true,
        canMessage: false,
        viewerTier: 'free',
        contacts: [],
        self: { uid, displayName: 'Rhema Member', signedProfilePhoto: null },
      };
    }

    const viewerData = viewerProfSnap.data() || {};
    const entitlements = await resolveMemberEntitlements(db, uid, viewerData);
    const unlockedSet = new Set(entitlements.unlockedContactUids);
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
      heightCm: number | null;
      occupation: string;
      gender: string;
      isVerified: boolean;
      city: string;
      contactPhone: string | null;
      matchTierEligible: boolean;
    }[] = [];

    const viewerHeightCm = typeof viewerData.heightCm === 'number' ? viewerData.heightCm : null;
    const viewerOccupation = resolveOccupationLabel(viewerData);
    const viewerGender = String(viewerData.gender || '').trim();

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
        const tPhotoAllowed =
          tData.photoVisibility !== 'protect_photo' ||
          (Array.isArray(tData.protectedPhotoAllowedUids) &&
            tData.protectedPhotoAllowedUids.includes(uid));
        const tPhoto = tPhotoAllowed ? await resolveSinglePhotoUrl(tData.profilePhoto) : null;
        const tCode = tData.matrimonyId || `RM${targetUid.slice(0, 7).toUpperCase()}`;
        const tCity = tData.location?.village || tData.location?.city || tData.location?.state || '';
        const tAge = typeof tData.age === 'number' ? tData.age : null;
        const tHeightCm = typeof tData.heightCm === 'number' ? tData.heightCm : null;
        const tOccupation = resolveOccupationLabel(tData);
        const tGender = String(tData.gender || '').trim();
        const roomId = getRoomId(uid, targetUid);

        const canSeePhone =
          tData.mobilePrivacy !== 'messages_only' &&
          entitlements.tier !== 'free' &&
          (entitlements.contactNumberLimit < 0 || unlockedSet.has(targetUid));
        const exposedPhone = canSeePhone ? tPriv.phoneNumber || null : null;

        await seedChatParticipantsInRtdb({
          roomId,
          uid,
          targetUid,
          viewerName: viewerData.displayName || 'Rhema Member',
          viewerPhoto,
          viewerCode,
          viewerHeightCm,
          viewerOccupation,
          viewerGender,
          targetName: tData.displayName || 'Rhema Member',
          targetPhoto: tPhoto,
          targetCode: tCode,
          targetAge: tAge,
          targetCity: tCity,
          targetPhone: exposedPhone,
          targetHeightCm: tHeightCm,
          targetOccupation: tOccupation,
          targetGender: tGender,
        }).catch(() => undefined);

        contacts.push({
          roomId,
          uid: targetUid,
          displayName: tData.displayName || 'Rhema Member',
          profileCode: tCode,
          signedProfilePhoto: tPhoto,
          age: tAge,
          heightCm: tHeightCm,
          occupation: tOccupation,
          gender: tGender,
          isVerified: tData.profileStatus === 'approved',
          city: tCity,
          contactPhone: exposedPhone,
          matchTierEligible: Boolean(tPhoto),
        });
      })
    );

    return {
      success: true,
      canMessage: entitlements.messageAccess,
      viewerTier: entitlements.tier,
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
 * Verifies messageAccess entitlement and sends a push notification to the recipient.
 */
export const notifyMatrimonyChatMessage = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const rawPreview = optionalString(request.data?.previewText, 180) || 'Sent you a message';
  const previewText = rawPreview.startsWith('e2ee:v1:')
    ? '🔒 New encrypted message'
    : rawPreview;
  const db = getFirestore();

  await assertMatrimonyProfileActive(db, uid);
  const entitlements = await resolveMemberEntitlements(db, uid);
  if (!entitlements.messageAccess) {
    throw new HttpsError(
      'permission-denied',
      'Upgrade to Silver, Gold, or Platinum to send personalised messages.',
      { reasonCode: 'UPGRADE_REQUIRED_MESSAGING' }
    );
  }

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

/**
 * 4. sendMatrimonyMessage
 * Server-validated personalised message action (checks active paid plan + mutual match + block status).
 */
export const sendMatrimonyMessage = onCall({ invoker: 'public' }, async (request) => {
  const uid = requireAuthUid(request);
  const targetUid = assertNonEmptyString(request.data?.targetUid, 'targetUid', 128);
  const text = optionalString(request.data?.text, 2000) || '';
  const imageUrl = optionalString(request.data?.imageUrl, 1000) || null;
  if (!text && !imageUrl) {
    throw new HttpsError('invalid-argument', 'Message text or image is required.');
  }

  const db = getFirestore();
  const { viewerData, targetData } = await verifyMutualChatEligibility(db, uid, targetUid);
  const entitlements = await resolveMemberEntitlements(db, uid, viewerData);
  if (!entitlements.messageAccess) {
    throw new HttpsError(
      'permission-denied',
      'Upgrade to Silver, Gold, or Platinum to send personalised messages.',
      { reasonCode: 'UPGRADE_REQUIRED_MESSAGING' }
    );
  }

  const roomId = getRoomId(uid, targetUid);
  const rtdb = getRtdb();
  const msgRef = rtdb.ref(`matrimony_chats/${roomId}/messages`).push();
  const msgId = msgRef.key || randomUUID();
  const createdAt = ServerValue.TIMESTAMP;
  const isCipher = text.startsWith('e2ee:v1:');
  const preview = imageUrl && !text ? '📷 Photo' : isCipher ? text : text.slice(0, 120);

  await rtdb.ref().update({
    [`matrimony_chats/${roomId}/participants/${uid}`]: true,
    [`matrimony_chats/${roomId}/participants/${targetUid}`]: true,
    [`matrimony_chats/${roomId}/messages/${msgId}`]: {
      id: msgId,
      senderUid: uid,
      text,
      type: imageUrl ? 'image' : 'text',
      imageUrl,
      createdAt,
    },
    [`matrimony_inbox/${uid}/${roomId}/lastMessageText`]: preview,
    [`matrimony_inbox/${uid}/${roomId}/lastMessageSenderUid`]: uid,
    [`matrimony_inbox/${uid}/${roomId}/lastMessageId`]: msgId,
    [`matrimony_inbox/${uid}/${roomId}/lastMessageAt`]: createdAt,
    [`matrimony_inbox/${targetUid}/${roomId}/lastMessageText`]: preview,
    [`matrimony_inbox/${targetUid}/${roomId}/lastMessageSenderUid`]: uid,
    [`matrimony_inbox/${targetUid}/${roomId}/lastMessageId`]: msgId,
    [`matrimony_inbox/${targetUid}/${roomId}/lastMessageAt`]: createdAt,
    [`matrimony_inbox/${targetUid}/${roomId}/unreadCount`]: ServerValue.increment(1),
    [`matrimony_inbox/${targetUid}/${roomId}/peerName`]: viewerData.displayName || 'Rhema Member',
    [`matrimony_inbox/${uid}/${roomId}/peerName`]: targetData.displayName || 'Rhema Member',
  });

  return { success: true, roomId, messageId: msgId };
});

export async function seedMutualMatchChatOnAccept(
  db: FirebaseFirestore.Firestore,
  uidA: string,
  uidB: string
): Promise<void> {
  try {
    const [aSnap, bSnap] = await Promise.all([
      getProfileRef(db, uidA).get(),
      getProfileRef(db, uidB).get(),
    ]);
    if (!aSnap.exists || !bSnap.exists) return;
    const a = aSnap.data() || {};
    const b = bSnap.data() || {};
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
      [`matrimony_inbox/${uidA}/${roomId}/peerHeightCm`]: typeof b.heightCm === 'number' ? b.heightCm : null,
      [`matrimony_inbox/${uidA}/${roomId}/peerOccupation`]: resolveOccupationLabel(b) || null,
      [`matrimony_inbox/${uidA}/${roomId}/peerGender`]: b.gender || null,
      [`matrimony_inbox/${uidA}/${roomId}/peerCity`]: b.location?.village || b.location?.city || b.location?.state || null,
      [`matrimony_inbox/${uidB}/${roomId}/roomId`]: roomId,
      [`matrimony_inbox/${uidB}/${roomId}/peerUid`]: uidA,
      [`matrimony_inbox/${uidB}/${roomId}/peerName`]: a.displayName || 'Rhema Member',
      [`matrimony_inbox/${uidB}/${roomId}/peerPhoto`]: aPhoto || null,
      [`matrimony_inbox/${uidB}/${roomId}/peerCode`]: a.matrimonyId || `RM${uidA.slice(0, 7).toUpperCase()}`,
      [`matrimony_inbox/${uidB}/${roomId}/peerAge`]: typeof a.age === 'number' ? a.age : null,
      [`matrimony_inbox/${uidB}/${roomId}/peerHeightCm`]: typeof a.heightCm === 'number' ? a.heightCm : null,
      [`matrimony_inbox/${uidB}/${roomId}/peerOccupation`]: resolveOccupationLabel(a) || null,
      [`matrimony_inbox/${uidB}/${roomId}/peerGender`]: a.gender || null,
      [`matrimony_inbox/${uidB}/${roomId}/peerCity`]: a.location?.village || a.location?.city || a.location?.state || null,
    });
  } catch (err) {
    console.warn('seedMutualMatchChatOnAccept warning:', err);
  }
}
