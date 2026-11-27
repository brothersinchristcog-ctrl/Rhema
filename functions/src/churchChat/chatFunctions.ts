import { randomUUID } from 'node:crypto';
import { getApp } from 'firebase-admin/app';
import { getDatabaseWithUrl, ServerValue } from 'firebase-admin/database';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onValueCreated } from 'firebase-functions/v2/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const RHEMA_ROOT_COLLECTION = 'Rhema Church';
const DEFAULT_CHURCH_ID = 'rhema';
const RTDB_INSTANCE = 'rhema-global-ministries-default-rtdb';
const RTDB_URL = `https://${RTDB_INSTANCE}.firebaseio.com`;

function getRtdb() {
  return getDatabaseWithUrl(RTDB_URL, getApp());
}

function isAdminRoleString(roleRaw: unknown): boolean {
  const s = String(roleRaw || '').toUpperCase();
  return s.includes('ADMIN') || s.includes('PASTOR') || s.includes('SUPER');
}

function formatMessagePreview(
  type: string,
  text: string,
  mediaLen: number,
  encrypted = false
): string {
  const clean = text.trim();
  const isCipher = encrypted || /^e2ee:v\d+:/i.test(clean);
  switch (type) {
    case 'image':
      return !isCipher && clean ? `📷 ${clean}` : '📷 Photo';
    case 'image_group':
      return !isCipher && clean ? `📷 ${clean}` : `📷 ${mediaLen || 2} Photos`;
    case 'video':
      return !isCipher && clean ? `🎥 ${clean}` : '🎥 Video';
    case 'audio':
      return '🎤 Voice message';
    case 'document':
      return !isCipher && clean ? `📄 ${clean}` : '📄 Document';
    default:
      if (isCipher) return '🔒 New encrypted message';
      return clean || 'New message';
  }
}

/**
 * Admin-only callable to create a Rhema Church Group Chat.
 * Enforces Church Admin / Pastor role against Firestore and sets initial RTDB + Firestore state.
 */
export const createRhemaChatGroup = onCall({ invoker: 'public' }, async (request) => {
  const uid = request.auth?.uid;
  const provider = request.auth?.token?.firebase?.sign_in_provider;
  if (!uid || provider === 'anonymous') {
    throw new HttpsError('unauthenticated', 'Active Rhema member authentication is required.');
  }

  const data = (request.data || {}) as Record<string, unknown>;
  const churchId = String(data.churchId || DEFAULT_CHURCH_ID).trim() || DEFAULT_CHURCH_ID;
  const name = String(data.name || '').trim();
  const description = String(data.description || '').trim().slice(0, 300);
  const avatarUrl = typeof data.avatarUrl === 'string' && data.avatarUrl.trim() ? data.avatarUrl.trim() : null;
  const category = data.category === 'group' ? 'group' : 'team';
  const onlyAdminsCanSend = Boolean(data.onlyAdminsCanSend);
  const rawMemberUids = Array.isArray(data.memberUids)
    ? data.memberUids.map((v) => String(v || '').trim()).filter(Boolean)
    : [];

  if (!name || name.length > 80) {
    throw new HttpsError('invalid-argument', 'Group name must be between 1 and 80 characters.');
  }

  const db = getFirestore();
  const churchRef = db.collection(RHEMA_ROOT_COLLECTION).doc(churchId);
  const [memberSnap, platformAdminSnap] = await Promise.all([
    churchRef.collection('members').doc(uid).get(),
    db.collection('platform_admins').doc(uid).get(),
  ]);

  const memberData = memberSnap.exists ? memberSnap.data() || {} : {};
  const isPlatformAdmin =
    platformAdminSnap.exists &&
    (platformAdminSnap.data()?.superadmin === true ||
      isAdminRoleString(platformAdminSnap.data()?.role));
  const isChurchAdmin =
    isPlatformAdmin ||
    Boolean(memberData.isSuperAdmin) ||
    Boolean(memberData.superadmin) ||
    isAdminRoleString(memberData.userType) ||
    isAdminRoleString(memberData.role);

  if (!isChurchAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only Rhema Church Administrators can create new groups.'
    );
  }

  const creatorName =
    String(memberData.name || '').trim() ||
    `${memberData.firstName || ''} ${memberData.lastName || ''}`.trim() ||
    'Church Admin';

  // Verify initial member UIDs exist as non-Left members of the same church
  const candidateUids = Array.from(new Set(rawMemberUids.filter((id) => id !== uid))).slice(0, 250);
  const memberDocs = await Promise.all(
    candidateUids.map((id) => churchRef.collection('members').doc(id).get())
  );
  const validParticipants = [uid];
  memberDocs.forEach((docSnap, index) => {
    const candidateId = candidateUids[index];
    if (!candidateId || !docSnap.exists) return;
    const m = docSnap.data() || {};
    if (m.status === 'Left' || m.status === 'Rejected' || m.status === 'Inactive') return;
    validParticipants.push(candidateId);
  });

  const rtdb = getRtdb();
  const newRoomRef = rtdb.ref(`rhema_chat/${churchId}/rooms`).push();
  const roomId = `grp_${newRoomRef.key || randomUUID().slice(0, 12)}`;
  const sysMsgId = `sys_${Date.now()}`;
  const systemText = `${creatorName} created group "${name}"`;

  const participantsMap: Record<string, boolean> = {};
  validParticipants.forEach((pUid) => {
    participantsMap[pUid] = true;
  });

  const updates: Record<string, unknown> = {
    [`rhema_chat/${churchId}/rooms/${roomId}/meta`]: {
      roomId,
      churchId,
      type: 'group',
      name,
      description,
      avatarUrl,
      category,
      createdBy: uid,
      createdAt: ServerValue.TIMESTAMP,
      onlyAdminsCanSend,
      onlyAdminsCanEditInfo: true,
      onlyAdminsCanAddMembers: true,
    },
    [`rhema_chat/${churchId}/rooms/${roomId}/participants`]: participantsMap,
    [`rhema_chat/${churchId}/rooms/${roomId}/admins`]: { [uid]: true },
    [`rhema_chat/${churchId}/rooms/${roomId}/messages/${sysMsgId}`]: {
      id: sysMsgId,
      senderUid: uid,
      senderName: creatorName,
      type: 'system',
      text: systemText,
      systemEvent: {
        action: 'group_created',
        actorUid: uid,
        actorName: creatorName,
      },
      createdAt: ServerValue.TIMESTAMP,
    },
  };

  validParticipants.forEach((pUid) => {
    updates[`rhema_chat/${churchId}/inbox/${pUid}/${roomId}`] = {
      roomId,
      roomType: 'group',
      category,
      title: name,
      avatarUrl,
      participantCount: validParticipants.length,
      lastMessageId: sysMsgId,
      lastMessageText: systemText,
      lastMessageType: 'system',
      lastMessageSenderUid: uid,
      lastMessageSenderName: creatorName,
      lastMessageAt: ServerValue.TIMESTAMP,
      lastMessageDelivered: false,
      lastMessageRead: false,
      unreadCount: pUid === uid ? 0 : 1,
      isMuted: false,
      isArchived: false,
      isFavorite: false,
    };
  });

  await Promise.all([
    rtdb.ref().update(updates),
    churchRef.collection('chat_groups').doc(roomId).set({
      id: roomId,
      churchId,
      name,
      description,
      avatarUrl,
      category,
      participantIds: validParticipants,
      adminIds: [uid],
      permissions: {
        onlyAdminsCanSend,
        onlyAdminsCanEditInfo: true,
        onlyAdminsCanAddMembers: true,
      },
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  ]);

  return { success: true, roomId };
});

/**
 * Push notification fan-out when a new message is written in Rhema Chat RTDB.
 * Respects mute flags, user-to-user blocks, and active room presence.
 */
export const onRhemaChatMessageCreated = onValueCreated(
  {
    ref: '/rhema_chat/{churchId}/rooms/{roomId}/messages/{msgId}',
    instance: RTDB_INSTANCE,
    region: 'us-central1',
  },
  async (event) => {
    const msg = event.data.val() as Record<string, unknown> | null;
    if (!msg) return;

    const type = String(msg.type || 'text');
    if (type === 'system') return;

    const churchId = String(event.params.churchId || DEFAULT_CHURCH_ID);
    const roomId = String(event.params.roomId || '');
    const senderUid = String(msg.senderUid || '');
    const senderName = String(msg.senderName || 'Rhema Member');
    const text = String(msg.text || '');
    const media = Array.isArray(msg.media) ? msg.media : [];
    if (!roomId || !senderUid) return;

    const rtdb = getRtdb();
    const [metaSnap, participantsSnap] = await Promise.all([
      rtdb.ref(`rhema_chat/${churchId}/rooms/${roomId}/meta`).get(),
      rtdb.ref(`rhema_chat/${churchId}/rooms/${roomId}/participants`).get(),
    ]);

    const meta = (metaSnap.val() || {}) as Record<string, unknown>;
    const participantsObj = (participantsSnap.val() || {}) as Record<string, unknown>;
    const recipientUids = Object.keys(participantsObj).filter(
      (u) => participantsObj[u] === true && u !== senderUid
    );
    if (recipientUids.length === 0) return;

    const roomType = meta.type === 'group' ? 'group' : 'direct';
    const roomTitle = String(meta.name || senderName);
    const roomAvatar = typeof meta.avatarUrl === 'string' ? meta.avatarUrl : '';
    const preview = formatMessagePreview(type, text, media.length, Boolean(msg.encrypted));
    const notifTitle = roomType === 'group' ? `${roomTitle}` : senderName;
    const notifBody = roomType === 'group' ? `${senderName}: ${preview}` : preview;

    const db = getFirestore();
    const now = Date.now();
    const tokens = new Set<string>();

    await Promise.all(
      recipientUids.map(async (uid) => {
        try {
          const [inboxSnap, presenceSnap, blockSnap, memberSnap, userSnap] = await Promise.all([
            rtdb.ref(`rhema_chat/${churchId}/inbox/${uid}/${roomId}`).get(),
            rtdb.ref(`rhema_chat/${churchId}/presence/${uid}`).get(),
            db
              .collection(RHEMA_ROOT_COLLECTION)
              .doc(churchId)
              .collection('chat_blocks')
              .doc(uid)
              .collection('blocked')
              .doc(senderUid)
              .get(),
            db
              .collection(RHEMA_ROOT_COLLECTION)
              .doc(churchId)
              .collection('members')
              .doc(uid)
              .get(),
            db.collection('users').doc(uid).get(),
          ]);

          if (blockSnap.exists) return;

          const inboxVal = (inboxSnap.val() || {}) as Record<string, unknown>;
          const mutedUntil = typeof inboxVal.mutedUntil === 'number' ? inboxVal.mutedUntil : null;
          if (inboxVal.isMuted === true && (!mutedUntil || mutedUntil > now)) {
            return;
          }

          const presenceVal = (presenceSnap.val() || {}) as Record<string, unknown>;
          if (presenceVal.online === true && presenceVal.activeRoomId === roomId) {
            return;
          }

          const mData = memberSnap.exists ? memberSnap.data() || {} : {};
          const uData = userSnap.exists ? userSnap.data() || {} : {};
          const singleTokens = [mData.fcmToken, uData.fcmToken];
          singleTokens.forEach((t) => {
            if (typeof t === 'string' && t.trim().length > 10) {
              tokens.add(t.trim());
            }
          });
          if (Array.isArray(mData.fcmTokens)) {
            mData.fcmTokens.forEach((t: unknown) => {
              if (typeof t === 'string' && t.trim().length > 10) {
                tokens.add(t.trim());
              }
            });
          }
        } catch {
          // Ignore single-recipient lookup failures
        }
      })
    );

    const tokenList = Array.from(tokens);
    if (tokenList.length === 0) return;

    const payloadData: Record<string, string> = {
      type: 'CHURCH_CHAT',
      churchId,
      roomId,
      roomType,
      roomTitle,
      senderUid,
      senderName,
      avatarUrl: roomAvatar,
      ...(roomType === 'direct' ? { peerUid: senderUid } : {}),
    };

    const chunkSize = 500;
    for (let i = 0; i < tokenList.length; i += chunkSize) {
      const chunk = tokenList.slice(i, i + chunkSize);
      await getMessaging()
        .sendEachForMulticast({
          tokens: chunk,
          notification: {
            title: notifTitle,
            body: notifBody,
          },
          data: payloadData,
          android: {
            priority: 'high',
            collapseKey: roomId,
            notification: {
              channelId: 'church_chat',
              sound: 'default',
            },
          },
          apns: {
            headers: {
              'apns-collapse-id': roomId,
            },
            payload: {
              aps: {
                sound: 'default',
                'thread-id': roomId,
              },
            },
          },
        })
        .catch(() => {});
    }
  }
);
