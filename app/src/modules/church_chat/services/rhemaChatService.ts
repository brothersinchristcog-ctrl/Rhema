import {
  get,
  increment,
  limitToLast,
  onDisconnect,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  serverTimestamp,
} from 'firebase/database';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import { e2eeService } from '../../../services/e2eeService';
import { roomKeyManager } from '../../../services/roomKeyManager';
import {
  ChatInboxItem,
  ChatMediaAttachment,
  ChatMessage,
  ChatMessageReply,
  ChatMessageType,
  ChatPresenceState,
  ChatRoomDetails,
  ChatTypingUser,
  ChurchMemberContact,
} from '../types/chat';
import { getChatRtdb, setRtdb as set, updateRtdb as update } from './rtdbClient';

let _presenceCleanup: (() => void) | null = null;
let _presenceKey: string | null = null;
const _inFlightDeliveryKeys = new Set<string>();
const _ensuredParticipantsCache = new Set<string>();

function ackChurchInboxDeliveries(
  cid: string,
  db: ReturnType<typeof getChatRtdb>,
  uid: string,
  rawEntries: Array<{ roomId: string; r: Record<string, any> }>
) {
  const now = Date.now();
  rawEntries.forEach(({ roomId: rKey, r }) => {
    const resolvedId = String(r.roomId || rKey);
    const msgId = String(r.lastMessageId || '');
    if (
      !r.lastMessageSenderUid ||
      r.lastMessageSenderUid === uid ||
      !msgId ||
      r.lastMessageDelivered
    ) {
      return;
    }

    const dedupeKey = `${cid}:${uid}:${resolvedId}:${msgId}`;
    if (_inFlightDeliveryKeys.has(dedupeKey)) return;
    _inFlightDeliveryKeys.add(dedupeKey);

    void (async () => {
      try {
        const [partSnap, msgSnap] = await Promise.all([
          get(ref(db, `rhema_chat/${cid}/rooms/${resolvedId}/participants/${uid}`)).catch(
            () => null
          ),
          get(ref(db, `rhema_chat/${cid}/rooms/${resolvedId}/messages/${msgId}/senderUid`)).catch(
            () => null
          ),
        ]);

        if (partSnap?.val() === true && msgSnap?.exists()) {
          const perRoomUpdates: Record<string, any> = {
            [`rhema_chat/${cid}/rooms/${resolvedId}/messages/${msgId}/deliveredTo/${uid}`]: now,
            [`rhema_chat/${cid}/inbox/${uid}/${resolvedId}/lastMessageDelivered`]: true,
          };
          if (r.roomType === 'direct' && r.peerUid) {
            perRoomUpdates[
              `rhema_chat/${cid}/inbox/${r.peerUid}/${resolvedId}/lastMessageDelivered`
            ] = true;
          }
          await update(ref(db), perRoomUpdates);
          return;
        }

        // Room/message missing or user removed from group: clear locally on user's own inbox row
        // so this stale entry never retries a multi-path root update that fails rules.
        await update(ref(db, `rhema_chat/${cid}/inbox/${uid}/${resolvedId}`), {
          lastMessageDelivered: true,
        }).catch(() => {});
      } catch {
        await update(ref(db, `rhema_chat/${cid}/inbox/${uid}/${resolvedId}`), {
          lastMessageDelivered: true,
        }).catch(() => {});
      } finally {
        _inFlightDeliveryKeys.delete(dedupeKey);
      }
    })();
  });
}

export function getDirectRoomId(uidA: string, uidB: string): string {
  return `dm_${[uidA, uidB].sort().join('_')}`;
}

export function buildMessagePreview(
  type: ChatMessageType,
  text: string,
  mediaCount = 0
): string {
  const clean = text.trim();
  switch (type) {
    case 'image':
      return clean ? `📷 ${clean}` : '📷 Photo';
    case 'image_group':
      return clean ? `📷 ${clean}` : `📷 ${mediaCount || 2} Photos`;
    case 'video':
      return clean ? `🎥 ${clean}` : '🎥 Video';
    case 'audio':
      return '🎤 Voice message';
    case 'document':
      return clean ? `📄 ${clean}` : '📄 Document';
    case 'system':
      return clean || 'Group update';
    default:
      return clean;
  }
}

async function ensureDirectParticipants(
  db: ReturnType<typeof getChatRtdb>,
  cid: string,
  roomId: string,
  participantUids: string[]
): Promise<void> {
  const sorted = [...participantUids].filter(Boolean).sort();
  const cacheKey = `${cid}:${roomId}:${sorted.join(',')}`;
  if (_ensuredParticipantsCache.has(cacheKey)) return;

  const partSnap = await get(
    ref(db, `rhema_chat/${cid}/rooms/${roomId}/participants`)
  ).catch(() => null);
  const partVal = (partSnap?.val() || {}) as Record<string, any>;
  const missingParts: Record<string, any> = {};
  sorted.forEach((u) => {
    if (u && partVal[u] !== true) missingParts[u] = true;
  });
  if (Object.keys(missingParts).length > 0) {
    await update(ref(db, `rhema_chat/${cid}/rooms/${roomId}/participants`), missingParts).catch(
      () => {}
    );
  }
  _ensuredParticipantsCache.add(cacheKey);
}

export const rhemaChatService = {
  startPresenceTracking(
    churchId: string = RHEMA_CHURCH_ID,
    uid: string,
    activeRoomId: string | null = null
  ): () => void {
    if (!uid) return () => {};
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const presenceRef = ref(db, `rhema_chat/${cid}/presence/${uid}`);
    const connectedRef = ref(db, '.info/connected');
    const key = `${cid}:${uid}`;

    if (_presenceKey === key && _presenceCleanup) {
      update(presenceRef, {
        online: true,
        activeRoomId,
        lastSeen: serverTimestamp(),
      }).catch(() => {});
      return () => {
        if (activeRoomId) {
          update(presenceRef, { activeRoomId: null, lastSeen: serverTimestamp() }).catch(() => {});
        }
      };
    }

    if (_presenceCleanup) {
      _presenceCleanup();
      _presenceCleanup = null;
    }

    _presenceKey = key;
    const unsub = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return;
      onDisconnect(presenceRef)
        .set({
          online: false,
          lastSeen: serverTimestamp(),
          activeRoomId: null,
        })
        .catch(() => {});
      set(presenceRef, {
        online: true,
        lastSeen: serverTimestamp(),
        activeRoomId,
      }).catch(() => {});
    });

    const cleanup = () => {
      unsub();
      _presenceKey = null;
      _presenceCleanup = null;
    };
    _presenceCleanup = cleanup;
    return cleanup;
  },

  setActiveRoom(churchId: string = RHEMA_CHURCH_ID, uid: string, roomId: string | null) {
    if (!uid) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    update(ref(db, `rhema_chat/${cid}/presence/${uid}`), {
      online: true,
      activeRoomId: roomId,
      lastSeen: serverTimestamp(),
    }).catch(() => {});
  },

  subscribePresence(
    churchId: string = RHEMA_CHURCH_ID,
    peerUid: string,
    onChange: (state: ChatPresenceState) => void
  ): () => void {
    if (!peerUid) return () => {};
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    return onValue(ref(db, `rhema_chat/${cid}/presence/${peerUid}`), (snap) => {
      const val = snap.val();
      onChange({
        online: val?.online === true,
        lastSeen: typeof val?.lastSeen === 'number' ? val.lastSeen : 0,
        activeRoomId: val?.activeRoomId || null,
      });
    });
  },

  subscribeInbox(
    churchId: string = RHEMA_CHURCH_ID,
    uid: string,
    onChange: (items: ChatInboxItem[], totalUnread: number) => void
  ): () => void {
    if (!uid) return () => {};
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    let disposed = false;
    let seq = 0;
    let latestRaw: Record<string, any> | null = null;

    const processSnapshot = async (rawObj: Record<string, any> | null) => {
      const currentSeq = ++seq;
      const raw = rawObj || {};
      const rawEntries = Object.keys(raw)
        .map((roomId) => ({ roomId, r: raw[roomId] || {} }))
        .filter(({ roomId, r }) => Boolean(r.roomId || roomId));

      // Mark incoming messages delivered safely per room without tripping root multi-path denials
      ackChurchInboxDeliveries(cid, db, uid, rawEntries);

      const items: ChatInboxItem[] = await Promise.all(
        rawEntries.map(async ({ roomId: rKey, r }) => {
          const resolvedRoomId = String(r.roomId || rKey);
          const rawLast = String(r.lastMessageText || '');
          const dec = await roomKeyManager.decryptString(
            { scope: 'church', rtdb: db, churchId: cid, roomId: resolvedRoomId },
            uid,
            rawLast
          );
          return {
            roomId: resolvedRoomId,
            roomType: (r.roomType === 'group' ? 'group' : 'direct') as 'direct' | 'group',
            category: (r.category || (r.roomType === 'group' ? 'group' : 'direct')) as any,
            peerUid: r.peerUid || undefined,
            title: String(r.title || 'Rhema Member'),
            avatarUrl: r.avatarUrl || null,
            lastMessageId: r.lastMessageId || undefined,
            lastMessageText: dec.text,
            lastMessageType: (r.lastMessageType || 'text') as ChatMessageType,
            lastMessageSenderUid: r.lastMessageSenderUid || undefined,
            lastMessageSenderName: r.lastMessageSenderName || undefined,
            lastMessageAt: typeof r.lastMessageAt === 'number' ? r.lastMessageAt : 0,
            lastMessageDelivered: Boolean(r.lastMessageDelivered),
            lastMessageRead: Boolean(r.lastMessageRead),
            unreadCount: typeof r.unreadCount === 'number' && r.unreadCount > 0 ? r.unreadCount : 0,
            isMuted: Boolean(r.isMuted) && (!r.mutedUntil || r.mutedUntil > Date.now()),
            mutedUntil: typeof r.mutedUntil === 'number' ? r.mutedUntil : null,
            isArchived: Boolean(r.isArchived),
            isFavorite: Boolean(r.isFavorite),
            participantCount:
              typeof r.participantCount === 'number' ? r.participantCount : undefined,
            encrypted: dec.encrypted || e2eeService.isEncryptedPayload(rawLast),
          };
        })
      );

      if (disposed || currentSeq !== seq) return;
      items.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
      const totalUnread = items
        .filter((it) => !it.isArchived)
        .reduce((acc, it) => acc + it.unreadCount, 0);
      onChange(items, totalUnread);
    };

    const unsubRtdb = onValue(ref(db, `rhema_chat/${cid}/inbox/${uid}`), (snap) => {
      latestRaw = snap.val() || {};
      processSnapshot(latestRaw);
    });

    let prevStatus = e2eeService.getState().status;
    const unsubState = e2eeService.subscribeState((snap) => {
      if (snap.status !== prevStatus) {
        prevStatus = snap.status;
        if (snap.status === 'ready' && latestRaw !== null) {
          processSnapshot(latestRaw);
        }
      }
    });

    return () => {
      disposed = true;
      unsubRtdb();
      unsubState();
    };
  },

  async ensureDirectRoom(
    churchId: string = RHEMA_CHURCH_ID,
    me: { uid: string; name: string; photoUrl: string | null },
    peer: ChurchMemberContact
  ): Promise<string> {
    const cid = churchId || RHEMA_CHURCH_ID;
    const roomId = getDirectRoomId(me.uid, peer.uid);
    const db = getChatRtdb();

    const metaSnap = await get(ref(db, `rhema_chat/${cid}/rooms/${roomId}/meta`)).catch(() => null);
    if (!metaSnap || !metaSnap.exists()) {
      await update(ref(db), {
        [`rhema_chat/${cid}/rooms/${roomId}/meta`]: {
          roomId,
          churchId: cid,
          type: 'direct',
          name: peer.name,
          category: 'direct',
          createdBy: me.uid,
          createdAt: serverTimestamp(),
          onlyAdminsCanSend: false,
          onlyAdminsCanEditInfo: false,
          onlyAdminsCanAddMembers: false,
        },
        [`rhema_chat/${cid}/rooms/${roomId}/participants/${me.uid}`]: true,
        [`rhema_chat/${cid}/rooms/${roomId}/participants/${peer.uid}`]: true,
      });
    } else {
      // Only write missing DM participant keys so existing rooms never hit rule denials
      await ensureDirectParticipants(db, cid, roomId, [me.uid, peer.uid]);
    }

    await update(ref(db), {
      [`rhema_chat/${cid}/inbox/${me.uid}/${roomId}/roomId`]: roomId,
      [`rhema_chat/${cid}/inbox/${me.uid}/${roomId}/roomType`]: 'direct',
      [`rhema_chat/${cid}/inbox/${me.uid}/${roomId}/category`]: 'direct',
      [`rhema_chat/${cid}/inbox/${me.uid}/${roomId}/peerUid`]: peer.uid,
      [`rhema_chat/${cid}/inbox/${me.uid}/${roomId}/title`]: peer.name,
      [`rhema_chat/${cid}/inbox/${me.uid}/${roomId}/avatarUrl`]: peer.photoUrl || null,
      [`rhema_chat/${cid}/inbox/${peer.uid}/${roomId}/roomId`]: roomId,
      [`rhema_chat/${cid}/inbox/${peer.uid}/${roomId}/roomType`]: 'direct',
      [`rhema_chat/${cid}/inbox/${peer.uid}/${roomId}/category`]: 'direct',
      [`rhema_chat/${cid}/inbox/${peer.uid}/${roomId}/peerUid`]: me.uid,
      [`rhema_chat/${cid}/inbox/${peer.uid}/${roomId}/title`]: me.name,
      [`rhema_chat/${cid}/inbox/${peer.uid}/${roomId}/avatarUrl`]: me.photoUrl || null,
    }).catch(() => {});

    return roomId;
  },

  subscribeRoomDetails(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    onChange: (details: ChatRoomDetails | null) => void
  ): () => void {
    if (!roomId) return () => {};
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    return onValue(ref(db, `rhema_chat/${cid}/rooms/${roomId}`), (snap) => {
      const val = snap.val();
      if (!val || !val.meta) {
        onChange(null);
        return;
      }
      onChange({
        meta: {
          roomId,
          churchId: cid,
          type: val.meta.type === 'group' ? 'group' : 'direct',
          name: val.meta.name || 'Chat',
          description: val.meta.description || '',
          avatarUrl: val.meta.avatarUrl || null,
          category: val.meta.category || (val.meta.type === 'group' ? 'group' : 'direct'),
          createdBy: val.meta.createdBy || '',
          createdAt: typeof val.meta.createdAt === 'number' ? val.meta.createdAt : 0,
          updatedAt: typeof val.meta.updatedAt === 'number' ? val.meta.updatedAt : undefined,
          onlyAdminsCanSend: Boolean(val.meta.onlyAdminsCanSend),
          onlyAdminsCanEditInfo: val.meta.onlyAdminsCanEditInfo !== false,
          onlyAdminsCanAddMembers: val.meta.onlyAdminsCanAddMembers !== false,
        },
        participants: val.participants || {},
        admins: val.admins || {},
        readWatermarks: val.readWatermarks || {},
      });
    });
  },

  subscribeRoomMessages(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    myUid: string,
    limitCount = 150,
    onChange: (messages: ChatMessage[]) => void
  ): () => void {
    if (!roomId || !myUid) return () => {};
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const ctx = { scope: 'church' as const, rtdb: db, churchId: cid, roomId };
    const msgsQuery = query(
      ref(db, `rhema_chat/${cid}/rooms/${roomId}/messages`),
      orderByChild('createdAt'),
      limitToLast(limitCount)
    );

    let disposed = false;
    let seq = 0;
    let latestRaw: Record<string, any> | null = null;
    let hasLockedMessages = false;

    const processSnapshot = async (val: Record<string, any> | null) => {
      const currentSeq = ++seq;
      const obj = val || {};
      let foundLocked = false;

      const list: ChatMessage[] = (
        await Promise.all(
          Object.keys(obj)
            .filter((key) => !obj[key]?.deletedFor?.[myUid])
            .map(async (key) => {
              const m = obj[key] || {};
              const rawText = String(m.text || '');
              const decText = m.deletedForEveryone
                ? { text: '', encrypted: false }
                : await roomKeyManager.decryptString(ctx, myUid, rawText);
              if (decText.lockedReason) foundLocked = true;

              let replyTo = m.replyTo || null;
              if (
                replyTo &&
                typeof replyTo.snippet === 'string' &&
                e2eeService.isEncryptedPayload(replyTo.snippet)
              ) {
                const decReply = await roomKeyManager.decryptString(ctx, myUid, replyTo.snippet);
                replyTo = { ...replyTo, snippet: decReply.text };
              }

              return {
                id: String(m.id || key),
                senderUid: String(m.senderUid || ''),
                senderName: String(m.senderName || 'Member'),
                senderAvatar: m.senderAvatar || null,
                type: (m.type || 'text') as ChatMessageType,
                text: decText.text,
                encrypted: decText.encrypted || Boolean(m.encrypted),
                media: Array.isArray(m.media) ? m.media : undefined,
                replyTo,
                forwarded: Boolean(m.forwarded),
                reactions: m.reactions || {},
                deliveredTo: m.deliveredTo || {},
                readBy: m.readBy || {},
                deletedFor: m.deletedFor || {},
                deletedForEveryone: Boolean(m.deletedForEveryone),
                systemEvent: m.systemEvent || null,
                createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
              };
            })
        )
      ).sort((a, b) => a.createdAt - b.createdAt);

      if (disposed || currentSeq !== seq) return;
      hasLockedMessages = foundLocked;
      onChange(list);
    };

    const unsubMsgs = onValue(msgsQuery, (snap) => {
      latestRaw = snap.val() || {};
      processSnapshot(latestRaw);
    });

    const unsubKeys = onValue(ref(db, `rhema_chat/${cid}/rooms/${roomId}/e2ee/keys`), () => {
      if (hasLockedMessages && latestRaw !== null) {
        processSnapshot(latestRaw);
      }
    });

    const unsubReqs = onValue(ref(db, `rhema_chat/${cid}/rooms/${roomId}/e2ee/requests`), (snap) => {
      if (snap.exists() && e2eeService.getState().status === 'ready') {
        roomKeyManager.fulfillPendingRtdbRoomKeys(ctx, myUid, []).catch(() => {});
      }
    });

    let prevStatus = e2eeService.getState().status;
    const unsubState = e2eeService.subscribeState((snap) => {
      if (snap.status !== prevStatus) {
        prevStatus = snap.status;
        if (snap.status === 'ready' && latestRaw !== null) {
          processSnapshot(latestRaw);
          roomKeyManager.fulfillPendingRtdbRoomKeys(ctx, myUid, []).catch(() => {});
        }
      }
    });

    return () => {
      disposed = true;
      unsubMsgs();
      unsubKeys();
      unsubReqs();
      unsubState();
    };
  },

  subscribeTyping(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    myUid: string,
    onChange: (typingUsers: ChatTypingUser[]) => void
  ): () => void {
    if (!roomId) return () => {};
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const seenMap = new Map<string, { marker: number; seenAt: number }>();
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let latestRaw: Record<string, any> = {};
    let isInitialSnapshot = true;

    const emitActive = () => {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      const now = Date.now();
      let minRemaining = Infinity;
      const active: ChatTypingUser[] = [];

      Object.keys(latestRaw).forEach((uid) => {
        if (uid === myUid || latestRaw[uid]?.isTyping !== true) {
          seenMap.delete(uid);
          return;
        }
        const entry = seenMap.get(uid);
        if (!entry) return;
        const elapsed = now - entry.seenAt;
        if (elapsed >= 8000) return;

        minRemaining = Math.min(minRemaining, 8000 - elapsed);
        active.push({
          uid,
          name: String(latestRaw[uid]?.name || 'Someone'),
          isTyping: true,
          updatedAt:
            typeof latestRaw[uid]?.updatedAt === 'number'
              ? latestRaw[uid].updatedAt
              : entry.seenAt,
        });
      });

      onChange(active);

      if (minRemaining < Infinity) {
        expiryTimer = setTimeout(emitActive, Math.max(150, minRemaining + 40));
      }
    };

    const unsub = onValue(ref(db, `rhema_chat/${cid}/rooms/${roomId}/typing`), (snap) => {
      const val = snap.val() || {};
      const now = Date.now();
      latestRaw = val;

      Object.keys(val).forEach((uid) => {
        if (uid === myUid || val[uid]?.isTyping !== true) {
          seenMap.delete(uid);
          return;
        }
        const remoteMarker = typeof val[uid]?.updatedAt === 'number' ? val[uid].updatedAt : 0;
        const prev = seenMap.get(uid);
        if (!prev) {
          if (isInitialSnapshot && remoteMarker > 0 && now - remoteMarker > 60000) {
            return;
          }
          seenMap.set(uid, { marker: remoteMarker, seenAt: now });
        } else if (remoteMarker !== prev.marker) {
          seenMap.set(uid, { marker: remoteMarker, seenAt: now });
        }
      });

      for (const uid of Array.from(seenMap.keys())) {
        if (!val[uid] || val[uid]?.isTyping !== true) {
          seenMap.delete(uid);
        }
      }

      isInitialSnapshot = false;
      emitActive();
    });

    return () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      unsub();
    };
  },

  setTyping(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    myUid: string,
    myName: string,
    isTyping: boolean
  ) {
    if (!roomId || !myUid) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const tRef = ref(db, `rhema_chat/${cid}/rooms/${roomId}/typing/${myUid}`);
    if (isTyping) {
      onDisconnect(tRef).remove().catch(() => {});
      set(tRef, {
        isTyping: true,
        name: myName || 'Member',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    } else {
      set(tRef, null).catch(() => {});
    }
  },

  async markRoomRead(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    myUid: string,
    isDirect: boolean,
    peerUid: string | undefined,
    unreadIncomingMsgIds: string[]
  ): Promise<void> {
    if (!roomId || !myUid) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const [partSnap, inboxSnap] = await Promise.all([
      get(ref(db, `rhema_chat/${cid}/rooms/${roomId}/participants/${myUid}`)).catch(() => null),
      get(ref(db, `rhema_chat/${cid}/inbox/${myUid}/${roomId}/unreadCount`)).catch(() => null),
    ]);
    const hasInboxUnread = inboxSnap?.exists() && Number(inboxSnap.val() || 0) > 0;

    if (partSnap?.val() !== true) {
      if (hasInboxUnread) {
        await update(ref(db, `rhema_chat/${cid}/inbox/${myUid}/${roomId}`), {
          unreadCount: 0,
        }).catch(() => {});
      }
      return;
    }

    const now = Date.now();
    const updates: Record<string, any> = {
      [`rhema_chat/${cid}/rooms/${roomId}/readWatermarks/${myUid}`]: now,
    };
    if (hasInboxUnread) {
      updates[`rhema_chat/${cid}/inbox/${myUid}/${roomId}/unreadCount`] = 0;
    }
    unreadIncomingMsgIds.forEach((msgId) => {
      updates[`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/deliveredTo/${myUid}`] = now;
      updates[`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/readBy/${myUid}`] = now;
    });
    if (isDirect && peerUid && unreadIncomingMsgIds.length > 0) {
      updates[`rhema_chat/${cid}/inbox/${peerUid}/${roomId}/lastMessageDelivered`] = true;
      updates[`rhema_chat/${cid}/inbox/${peerUid}/${roomId}/lastMessageRead`] = true;
    }
    await update(ref(db), updates).catch(() => {});
  },

  async sendMessage(params: {
    churchId?: string;
    roomId: string;
    roomType: 'direct' | 'group';
    roomTitle: string;
    roomAvatar?: string | null;
    category?: 'direct' | 'team' | 'group';
    participantUids: string[];
    senderUid: string;
    senderName: string;
    senderAvatar?: string | null;
    peerOnline?: boolean;
    type?: ChatMessageType;
    text: string;
    media?: ChatMediaAttachment[];
    replyTo?: ChatMessageReply | null;
    forwarded?: boolean;
    msgId?: string;
  }): Promise<string> {
    const cid = params.churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const msgRef = params.msgId
      ? ref(db, `rhema_chat/${cid}/rooms/${params.roomId}/messages/${params.msgId}`)
      : push(ref(db, `rhema_chat/${cid}/rooms/${params.roomId}/messages`));
    const msgId = params.msgId || msgRef.key || `${Date.now()}`;
    const type: ChatMessageType = params.type || 'text';
    const cleanText = params.text.trim();
    const preview = buildMessagePreview(type, cleanText, params.media?.length || 0);
    const participants = Array.from(new Set([params.senderUid, ...params.participantUids].filter(Boolean)));
    const deliveredImmediately = params.roomType === 'direct' && Boolean(params.peerOnline);

    const ctx = { scope: 'church' as const, rtdb: db, churchId: cid, roomId: params.roomId };
    if (params.roomType === 'direct') {
      await ensureDirectParticipants(db, cid, params.roomId, participants);
    }

    const roomKey = await roomKeyManager.getOrCreateRoomSendKey(ctx, params.senderUid, participants);
    const storedText = cleanText
      ? (await roomKeyManager.encryptString(ctx, params.senderUid, participants, cleanText, roomKey))
          .cipherText
      : '';
    const storedPreview = (
      await roomKeyManager.encryptString(ctx, params.senderUid, participants, preview, roomKey)
    ).cipherText;

    let finalReplyTo = params.replyTo || null;
    if (finalReplyTo && finalReplyTo.snippet) {
      const encSnippet = await roomKeyManager.encryptString(
        ctx,
        params.senderUid,
        participants,
        finalReplyTo.snippet,
        roomKey
      );
      finalReplyTo = { ...finalReplyTo, snippet: encSnippet.cipherText };
    }

    const peerUid =
      params.roomType === 'direct'
        ? participants.find((u) => u !== params.senderUid)
        : undefined;

    const updates: Record<string, any> = {
      [`rhema_chat/${cid}/rooms/${params.roomId}/typing/${params.senderUid}`]: null,
      [`rhema_chat/${cid}/rooms/${params.roomId}/messages/${msgId}`]: {
        id: msgId,
        senderUid: params.senderUid,
        senderName: params.senderName,
        senderAvatar: params.senderAvatar || null,
        type,
        text: storedText,
        encrypted: true,
        keyId: roomKey.keyId,
        media: params.media && params.media.length > 0 ? params.media : null,
        replyTo: finalReplyTo,
        forwarded: Boolean(params.forwarded),
        createdAt: serverTimestamp(),
        ...(deliveredImmediately && peerUid
          ? { deliveredTo: { [peerUid]: serverTimestamp() } }
          : {}),
      },
    };

    participants.forEach((uid) => {
      const isSender = uid === params.senderUid;
      const basePath = `rhema_chat/${cid}/inbox/${uid}/${params.roomId}`;
      updates[`${basePath}/roomId`] = params.roomId;
      updates[`${basePath}/roomType`] = params.roomType;
      updates[`${basePath}/category`] =
        params.category || (params.roomType === 'group' ? 'group' : 'direct');
      if (params.roomType === 'direct') {
        const otherUid = participants.find((p) => p !== uid) || params.senderUid;
        updates[`${basePath}/peerUid`] = otherUid;
        if (isSender) {
          updates[`${basePath}/title`] = params.roomTitle;
          updates[`${basePath}/avatarUrl`] = params.roomAvatar || null;
        } else {
          updates[`${basePath}/title`] = params.senderName;
          updates[`${basePath}/avatarUrl`] = params.senderAvatar || null;
        }
      } else {
        updates[`${basePath}/title`] = params.roomTitle;
        updates[`${basePath}/avatarUrl`] = params.roomAvatar || null;
        updates[`${basePath}/participantCount`] = participants.length;
      }

      updates[`${basePath}/lastMessageId`] = msgId;
      updates[`${basePath}/lastMessageText`] = storedPreview;
      updates[`${basePath}/lastMessageType`] = type;
      updates[`${basePath}/lastMessageSenderUid`] = params.senderUid;
      updates[`${basePath}/lastMessageSenderName`] = params.senderName;
      updates[`${basePath}/lastMessageAt`] = serverTimestamp();
      updates[`${basePath}/lastMessageDelivered`] = deliveredImmediately;
      updates[`${basePath}/lastMessageRead`] = false;
      updates[`${basePath}/unreadCount`] = isSender ? 0 : increment(1);
    });

    await update(ref(db), updates);
    return msgId;
  },

  async toggleReaction(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    msgId: string,
    myUid: string,
    emoji: string,
    currentlyReacted: boolean
  ): Promise<void> {
    if (!roomId || !msgId || !myUid || !emoji) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    await set(
      ref(db, `rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/reactions/${emoji}/${myUid}`),
      currentlyReacted ? null : true
    );
  },

  async deleteMessageForMe(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    msgId: string,
    myUid: string
  ): Promise<void> {
    await this.deleteMessagesForMe(churchId, roomId, myUid, [msgId]);
  },

  async deleteMessagesForMe(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    myUid: string,
    msgIds: string[]
  ): Promise<void> {
    const cleanIds = Array.from(new Set(msgIds.filter(Boolean)));
    if (!roomId || !myUid || cleanIds.length === 0) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();

    const updates: Record<string, any> = {};
    addDeletedForUpdates(updates, cid, roomId, myUid, cleanIds);

    try {
      const inboxSnap = await get(ref(db, `rhema_chat/${cid}/inbox/${myUid}/${roomId}`));
      const inboxVal = inboxSnap.val();
      const currentLastId: string | undefined = inboxVal?.lastMessageId;

      if (inboxVal && (!currentLastId || cleanIds.includes(currentLastId))) {
        const msgsSnap = await get(
          query(
            ref(db, `rhema_chat/${cid}/rooms/${roomId}/messages`),
            orderByChild('createdAt'),
            limitToLast(120)
          )
        );
        const deletedSet = new Set(cleanIds);
        const raw = msgsSnap.val() || {};
        const remaining = Object.keys(raw)
          .filter((id) => !deletedSet.has(id) && !raw[id]?.deletedFor?.[myUid])
          .map((id) => ({ id, ...(raw[id] || {}) }))
          .sort(
            (a, b) =>
              (typeof a.createdAt === 'number' ? a.createdAt : 0) -
              (typeof b.createdAt === 'number' ? b.createdAt : 0)
          );

        const latest = remaining[remaining.length - 1];
        await applyInboxPreviewFromLatest(updates, cid, myUid, roomId, db, latest);
      }
    } catch {
      // Non-fatal: message deletedFor flags still commit cleanly.
    }

    await update(ref(db), updates);
  },

  async syncStaleInboxPreview(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    myUid: string,
    visibleMessages: ChatMessage[]
  ): Promise<void> {
    if (!roomId || !myUid) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();

    const inboxSnap = await get(ref(db, `rhema_chat/${cid}/inbox/${myUid}/${roomId}`));
    if (!inboxSnap.exists()) return;
    const inboxVal = inboxSnap.val() || {};
    const lastId: string | undefined = inboxVal.lastMessageId;
    if (!lastId || visibleMessages.some((m) => m.id === lastId)) return;

    const deletedSnap = await get(
      ref(db, `rhema_chat/${cid}/rooms/${roomId}/messages/${lastId}/deletedFor/${myUid}`)
    );
    const msgSnap = deletedSnap.val() === true
      ? null
      : await get(ref(db, `rhema_chat/${cid}/rooms/${roomId}/messages/${lastId}`));

    if (deletedSnap.val() !== true && msgSnap && msgSnap.exists()) {
      return;
    }

    const latest = visibleMessages[visibleMessages.length - 1];
    const updates: Record<string, any> = {};
    await applyInboxPreviewFromLatest(
      updates,
      cid,
      myUid,
      roomId,
      db,
      latest ? { ...latest, isPlaintextAlready: true } : undefined
    );
    await update(ref(db), updates);
  },

  async deleteMessageForEveryone(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    msgId: string,
    participantUids: string[],
    isLatestInboxMessage: boolean
  ): Promise<void> {
    await this.deleteMessagesForEveryone(
      churchId,
      roomId,
      [msgId],
      participantUids,
      isLatestInboxMessage ? msgId : undefined
    );
  },

  async deleteMessagesForEveryone(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    msgIds: string[],
    participantUids: string[],
    latestRoomMsgId?: string
  ): Promise<void> {
    const cleanIds = Array.from(new Set(msgIds.filter(Boolean)));
    if (!roomId || cleanIds.length === 0) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const updates: Record<string, any> = {};

    cleanIds.forEach((msgId) => {
      updates[`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/deletedForEveryone`] = true;
      updates[`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/text`] = '';
      updates[`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/media`] = null;
      updates[`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/replyTo`] = null;
      updates[`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/reactions`] = null;
    });

    if (latestRoomMsgId && cleanIds.includes(latestRoomMsgId)) {
      participantUids.forEach((uid) => {
        updates[`rhema_chat/${cid}/inbox/${uid}/${roomId}/lastMessageText`] =
          '🚫 This message was deleted';
      });
    }
    await update(ref(db), updates);
  },

  async setInboxFlag(
    churchId: string = RHEMA_CHURCH_ID,
    myUid: string,
    roomId: string,
    flags: Partial<{
      isMuted: boolean;
      mutedUntil: number | null;
      isArchived: boolean;
      isFavorite: boolean;
    }>
  ): Promise<void> {
    if (!myUid || !roomId) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    await update(ref(db, `rhema_chat/${cid}/inbox/${myUid}/${roomId}`), flags);
  },

  async clearChatForMe(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    myUid: string,
    messageIds: string[]
  ): Promise<void> {
    if (!roomId || !myUid) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const partSnap =
      messageIds.length > 0
        ? await get(ref(db, `rhema_chat/${cid}/rooms/${roomId}/participants/${myUid}`)).catch(
            () => null
          )
        : null;

    if (partSnap?.val() !== true) {
      await update(ref(db, `rhema_chat/${cid}/inbox/${myUid}/${roomId}`), {
        lastMessageText: '',
        unreadCount: 0,
      });
      return;
    }

    const updates: Record<string, any> = {
      [`rhema_chat/${cid}/inbox/${myUid}/${roomId}/lastMessageText`]: '',
      [`rhema_chat/${cid}/inbox/${myUid}/${roomId}/unreadCount`]: 0,
    };
    addDeletedForUpdates(updates, cid, roomId, myUid, messageIds);
    await update(ref(db), updates);
  },

  async deleteChatForMe(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    myUid: string,
    knownMessageIds?: string[]
  ): Promise<void> {
    if (!roomId || !myUid) return;
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();

    await set(ref(db, `rhema_chat/${cid}/inbox/${myUid}/${roomId}`), null);

    try {
      const partSnap = await get(
        ref(db, `rhema_chat/${cid}/rooms/${roomId}/participants/${myUid}`)
      ).catch(() => null);
      if (partSnap?.val() !== true) return;

      let msgIds = knownMessageIds;
      if (!msgIds) {
        const snap = await get(
          query(
            ref(db, `rhema_chat/${cid}/rooms/${roomId}/messages`),
            orderByChild('createdAt'),
            limitToLast(400)
          )
        );
        const raw = snap.val() || {};
        msgIds = Object.keys(raw).filter((id) => !raw[id]?.deletedFor?.[myUid]);
      }

      const roomUpdates: Record<string, any> = {
        [`rhema_chat/${cid}/rooms/${roomId}/typing/${myUid}`]: null,
      };
      addDeletedForUpdates(roomUpdates, cid, roomId, myUid, msgIds);
      await update(ref(db), roomUpdates);
    } catch {
      // Room may not exist yet or user may no longer be a group participant.
    }
  },
};

function addDeletedForUpdates(
  updates: Record<string, any>,
  churchId: string,
  roomId: string,
  myUid: string,
  messageIds: string[]
) {
  messageIds.forEach((id) => {
    if (id) {
      updates[`rhema_chat/${churchId}/rooms/${roomId}/messages/${id}/deletedFor/${myUid}`] = true;
    }
  });
}

async function applyInboxPreviewFromLatest(
  updates: Record<string, any>,
  churchId: string,
  myUid: string,
  roomId: string,
  db: ReturnType<typeof getChatRtdb>,
  latest?: {
    id: string;
    type?: ChatMessageType;
    text?: string;
    media?: any[];
    senderUid?: string;
    senderName?: string;
    createdAt?: number;
    deletedForEveryone?: boolean;
    isPlaintextAlready?: boolean;
  }
) {
  const basePath = `rhema_chat/${churchId}/inbox/${myUid}/${roomId}`;
  if (!latest) {
    updates[`${basePath}/lastMessageId`] = null;
    updates[`${basePath}/lastMessageText`] = '';
    updates[`${basePath}/lastMessageType`] = 'text';
    updates[`${basePath}/lastMessageSenderUid`] = null;
    updates[`${basePath}/lastMessageSenderName`] = null;
    updates[`${basePath}/lastMessageDelivered`] = false;
    updates[`${basePath}/lastMessageRead`] = false;
    updates[`${basePath}/unreadCount`] = 0;
    return;
  }

  const msgType: ChatMessageType = (latest.type || 'text') as ChatMessageType;
  let storedPreviewText = '🚫 This message was deleted';

  if (!latest.deletedForEveryone) {
    const rawText = String(latest.text || '');
    const ctx = { scope: 'church' as const, rtdb: db, churchId, roomId };
    let plainText = rawText;

    if (!latest.isPlaintextAlready && e2eeService.isEncryptedPayload(rawText)) {
      const dec = await roomKeyManager.decryptString(ctx, myUid, rawText);
      if (dec.lockedReason) {
        plainText = '';
        storedPreviewText = rawText;
      } else {
        plainText = dec.text;
      }
    }

    if (storedPreviewText !== rawText) {
      const previewPlain = buildMessagePreview(
        msgType,
        plainText,
        Array.isArray(latest.media) ? latest.media.length : 0
      );
      if (e2eeService.getState().status === 'ready') {
        try {
          const enc = await roomKeyManager.encryptString(ctx, myUid, [myUid], previewPlain);
          storedPreviewText = enc.cipherText;
        } catch {
          storedPreviewText = previewPlain;
        }
      } else {
        storedPreviewText = previewPlain;
      }
    }
  }

  updates[`${basePath}/lastMessageId`] = latest.id;
  updates[`${basePath}/lastMessageText`] = storedPreviewText;
  updates[`${basePath}/lastMessageType`] = msgType;
  updates[`${basePath}/lastMessageSenderUid`] = latest.senderUid || null;
  updates[`${basePath}/lastMessageSenderName`] = latest.senderName || null;
  if (typeof latest.createdAt === 'number') {
    updates[`${basePath}/lastMessageAt`] = latest.createdAt;
  }
}
