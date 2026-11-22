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
    return onValue(ref(db, `rhema_chat/${cid}/inbox/${uid}`), (snap) => {
      const raw = snap.val() || {};
      const items: ChatInboxItem[] = Object.keys(raw)
        .map((roomId) => {
          const r = raw[roomId] || {};
          return {
            roomId: String(r.roomId || roomId),
            roomType: (r.roomType === 'group' ? 'group' : 'direct') as 'direct' | 'group',
            category: (r.category || (r.roomType === 'group' ? 'group' : 'direct')) as any,
            peerUid: r.peerUid || undefined,
            title: String(r.title || 'Rhema Member'),
            avatarUrl: r.avatarUrl || null,
            lastMessageId: r.lastMessageId || undefined,
            lastMessageText: String(r.lastMessageText || ''),
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
            participantCount: typeof r.participantCount === 'number' ? r.participantCount : undefined,
          };
        })
        .filter((it) => Boolean(it.roomId));

      // Mark incoming messages delivered as soon as recipient client receives inbox snapshot
      const now = Date.now();
      const deliveryUpdates: Record<string, any> = {};
      items.forEach((it) => {
        if (
          it.lastMessageSenderUid &&
          it.lastMessageSenderUid !== uid &&
          it.lastMessageId &&
          !it.lastMessageDelivered
        ) {
          deliveryUpdates[
            `rhema_chat/${cid}/rooms/${it.roomId}/messages/${it.lastMessageId}/deliveredTo/${uid}`
          ] = now;
          deliveryUpdates[`rhema_chat/${cid}/inbox/${uid}/${it.roomId}/lastMessageDelivered`] = true;
          if (it.roomType === 'direct' && it.peerUid) {
            deliveryUpdates[
              `rhema_chat/${cid}/inbox/${it.peerUid}/${it.roomId}/lastMessageDelivered`
            ] = true;
          }
        }
      });
      if (Object.keys(deliveryUpdates).length > 0) {
        update(ref(db), deliveryUpdates).catch(() => {});
      }

      items.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
      const totalUnread = items
        .filter((it) => !it.isArchived)
        .reduce((acc, it) => acc + it.unreadCount, 0);
      onChange(items, totalUnread);
    });
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
      // Ensure my participant key & inbox metadata stay up to date
      await update(ref(db), {
        [`rhema_chat/${cid}/rooms/${roomId}/participants/${me.uid}`]: true,
        [`rhema_chat/${cid}/rooms/${roomId}/participants/${peer.uid}`]: true,
      }).catch(() => {});
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
    const msgsQuery = query(
      ref(db, `rhema_chat/${cid}/rooms/${roomId}/messages`),
      orderByChild('createdAt'),
      limitToLast(limitCount)
    );
    return onValue(msgsQuery, (snap) => {
      const val = snap.val() || {};
      const list: ChatMessage[] = Object.keys(val)
        .map((key) => {
          const m = val[key] || {};
          return {
            id: String(m.id || key),
            senderUid: String(m.senderUid || ''),
            senderName: String(m.senderName || 'Member'),
            senderAvatar: m.senderAvatar || null,
            type: (m.type || 'text') as ChatMessageType,
            text: String(m.text || ''),
            media: Array.isArray(m.media) ? m.media : undefined,
            replyTo: m.replyTo || null,
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
        .filter((m) => !m.deletedFor?.[myUid])
        .sort((a, b) => a.createdAt - b.createdAt);

      onChange(list);
    });
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
    return onValue(ref(db, `rhema_chat/${cid}/rooms/${roomId}/typing`), (snap) => {
      const val = snap.val() || {};
      const now = Date.now();
      const active: ChatTypingUser[] = Object.keys(val)
        .filter((uid) => uid !== myUid && val[uid]?.isTyping === true)
        .filter((uid) => !val[uid]?.updatedAt || now - Number(val[uid].updatedAt) < 8000)
        .map((uid) => ({
          uid,
          name: String(val[uid]?.name || 'Someone'),
          isTyping: true,
          updatedAt: Number(val[uid]?.updatedAt || now),
        }));
      onChange(active);
    });
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
      set(tRef, { isTyping: true, name: myName, updatedAt: Date.now() }).catch(() => {});
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
    const now = Date.now();
    const updates: Record<string, any> = {
      [`rhema_chat/${cid}/inbox/${myUid}/${roomId}/unreadCount`]: 0,
      [`rhema_chat/${cid}/rooms/${roomId}/readWatermarks/${myUid}`]: now,
    };
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
        text: cleanText,
        media: params.media && params.media.length > 0 ? params.media : null,
        replyTo: params.replyTo || null,
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
      updates[`${basePath}/lastMessageText`] = preview;
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
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    await set(
      ref(db, `rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/deletedFor/${myUid}`),
      true
    );
  },

  async deleteMessageForEveryone(
    churchId: string = RHEMA_CHURCH_ID,
    roomId: string,
    msgId: string,
    participantUids: string[],
    isLatestInboxMessage: boolean
  ): Promise<void> {
    const cid = churchId || RHEMA_CHURCH_ID;
    const db = getChatRtdb();
    const updates: Record<string, any> = {
      [`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/deletedForEveryone`]: true,
      [`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/text`]: '',
      [`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/media`]: null,
      [`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/replyTo`]: null,
      [`rhema_chat/${cid}/rooms/${roomId}/messages/${msgId}/reactions`]: null,
    };
    if (isLatestInboxMessage) {
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
    const updates: Record<string, any> = {
      [`rhema_chat/${cid}/inbox/${myUid}/${roomId}/lastMessageText`]: '',
      [`rhema_chat/${cid}/inbox/${myUid}/${roomId}/unreadCount`]: 0,
    };
    messageIds.forEach((id) => {
      updates[`rhema_chat/${cid}/rooms/${roomId}/messages/${id}/deletedFor/${myUid}`] = true;
    });
    await update(ref(db), updates);
  },
};
