import nativeAuth from '@react-native-firebase/auth';
import type { Database } from 'firebase/database';
import {
  endAt,
  equalTo,
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
  set,
  update,
} from 'firebase/database';
import { webApp } from '../../../services/firebaseWebConfig';
import {
  MatrimonyChatMessage,
  MatrimonyChatMessageReply,
  MatrimonyInboxItem,
  MatrimonyPresenceState,
} from '../types/matrimony';
import { matrimonyApi } from './matrimonyApi';

const RTDB_URL = 'https://rhema-global-ministries-default-rtdb.firebaseio.com';

let _rtdbInstance: Database | null = null;
let _presenceCleanup: (() => void) | null = null;
let _presenceUid: string | null = null;

function getMatrimonyRtdb(): Database {
  if (_rtdbInstance) return _rtdbInstance;

  const rtdbSdk = require('firebase/database') as typeof import('firebase/database') & {
    _initStandalone?: (opts: any) => Database;
  };
  try {
    rtdbSdk.forceWebSockets();
  } catch {
    // Ignore if already initialized
  }

  const tokenListeners = new Map<(token: string | null) => void, () => void>();
  const customAuthImpl = {
    getUid: () => nativeAuth().currentUser?.uid || null,
    getToken: async (forceRefresh?: boolean) => {
      const user = nativeAuth().currentUser;
      if (!user) return null;
      const accessToken = await user.getIdToken(Boolean(forceRefresh));
      return { accessToken };
    },
    addAuthTokenListener: (listener: (token: string | null) => void) => {
      const unsub = nativeAuth().onIdTokenChanged(async (user) => {
        if (!user) {
          listener(null);
          return;
        }
        try {
          const token = await user.getIdToken(false);
          listener(token);
        } catch {
          listener(null);
        }
      });
      tokenListeners.set(listener, unsub);
    },
    removeAuthTokenListener: (listener: (token: string | null) => void) => {
      const unsub = tokenListeners.get(listener);
      if (unsub) {
        unsub();
        tokenListeners.delete(listener);
      }
    },
  };

  if (typeof rtdbSdk._initStandalone === 'function') {
    _rtdbInstance = rtdbSdk._initStandalone({
      app: webApp,
      url: RTDB_URL,
      version: '12.18.0',
      customAuthImpl,
      nodeAdmin: false,
    });
  } else {
    _rtdbInstance = rtdbSdk.getDatabase(webApp, RTDB_URL);
  }

  return _rtdbInstance;
}

export function getMatrimonyRoomId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('_');
}

function parseChatMessagesSnapshot(
  val: Record<string, any> | null | undefined,
  myUid: string
): MatrimonyChatMessage[] {
  if (!val) return [];
  return Object.keys(val)
    .map((key) => {
      const m = val[key] || {};
      return {
        id: String(m.id || key),
        senderUid: String(m.senderUid || ''),
        text: String(m.text || ''),
        type: (m.type === 'image' ? 'image' : 'text') as 'text' | 'image',
        imageUrl: m.imageUrl || null,
        replyTo: m.replyTo || null,
        createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
        deliveredBy: m.deliveredBy || {},
        readBy: m.readBy || {},
        deletedForEveryone: Boolean(m.deletedForEveryone),
        deletedFor: m.deletedFor || {},
      };
    })
    .filter((m) => !m.deletedFor?.[myUid])
    .sort((a, b) => a.createdAt - b.createdAt);
}

export const matrimonyChatService = {
  startPresenceTracking(uid: string, activeChatId: string | null = null): () => void {
    if (!uid) return () => {};
    const db = getMatrimonyRtdb();
    const presenceRef = ref(db, `matrimony_presence/${uid}`);
    const connectedRef = ref(db, '.info/connected');

    if (_presenceUid === uid && _presenceCleanup) {
      update(presenceRef, {
        online: true,
        activeChatId,
        lastSeen: serverTimestamp(),
      }).catch(() => {});
      return () => {
        if (activeChatId) {
          update(presenceRef, { activeChatId: null, lastSeen: serverTimestamp() }).catch(() => {});
        }
      };
    }

    if (_presenceCleanup) {
      _presenceCleanup();
      _presenceCleanup = null;
    }

    _presenceUid = uid;
    const unsub = onValue(connectedRef, (snap) => {
      if (snap.val() !== true) return;
      onDisconnect(presenceRef)
        .set({
          online: false,
          lastSeen: serverTimestamp(),
          activeChatId: null,
        })
        .catch(() => {});
      set(presenceRef, {
        online: true,
        lastSeen: serverTimestamp(),
        activeChatId,
      }).catch(() => {});
    });

    const cleanup = () => {
      unsub();
      _presenceUid = null;
      _presenceCleanup = null;
    };
    _presenceCleanup = cleanup;
    return cleanup;
  },

  setActiveChatRoom(uid: string, roomId: string | null) {
    if (!uid) return;
    const db = getMatrimonyRtdb();
    update(ref(db, `matrimony_presence/${uid}`), {
      online: true,
      activeChatId: roomId,
      lastSeen: serverTimestamp(),
    }).catch(() => {});
  },

  subscribePresence(peerUid: string, onChange: (state: MatrimonyPresenceState) => void): () => void {
    if (!peerUid) return () => {};
    const db = getMatrimonyRtdb();
    return onValue(ref(db, `matrimony_presence/${peerUid}`), (snap) => {
      const val = snap.val();
      onChange({
        online: val?.online === true,
        lastSeen: typeof val?.lastSeen === 'number' ? val.lastSeen : 0,
        activeChatId: val?.activeChatId || null,
      });
    });
  },

  subscribeInbox(
    uid: string,
    onChange: (items: MatrimonyInboxItem[], totalUnread: number) => void
  ): () => void {
    if (!uid) return () => {};
    const db = getMatrimonyRtdb();
    return onValue(ref(db, `matrimony_inbox/${uid}`), (snap) => {
      const raw = snap.val() || {};
      const items: MatrimonyInboxItem[] = Object.keys(raw)
        .map((roomId) => {
          const r = raw[roomId] || {};
          return {
            roomId: String(r.roomId || roomId),
            peerUid: String(r.peerUid || ''),
            peerName: String(r.peerName || 'Rhema Member'),
            peerPhoto: r.peerPhoto || null,
            peerCode: String(r.peerCode || ''),
            peerAge: typeof r.peerAge === 'number' ? r.peerAge : null,
            peerHeightCm: typeof r.peerHeightCm === 'number' ? r.peerHeightCm : null,
            peerOccupation: r.peerOccupation || null,
            peerGender: r.peerGender || null,
            peerCity: r.peerCity || null,
            contactPhone: r.contactPhone || null,
            lastMessageText: String(r.lastMessageText || ''),
            lastMessageType: (r.lastMessageType === 'image' ? 'image' : 'text') as 'text' | 'image',
            lastMessageSenderUid: r.lastMessageSenderUid || undefined,
            lastMessageId: r.lastMessageId || undefined,
            lastMessageDeliveredToPeer: Boolean(r.lastMessageDeliveredToPeer),
            lastMessageReadByPeer: Boolean(r.lastMessageReadByPeer),
            lastMessageAt: typeof r.lastMessageAt === 'number' ? r.lastMessageAt : 0,
            unreadCount: typeof r.unreadCount === 'number' && r.unreadCount > 0 ? r.unreadCount : 0,
          };
        })
        .filter((it) => Boolean(it.peerUid));

      // Mark any incoming messages delivered now that this user's client is online and receiving updates
      items.forEach((it) => {
        if (
          it.lastMessageSenderUid &&
          it.lastMessageSenderUid !== uid &&
          it.lastMessageId &&
          !it.lastMessageDeliveredToPeer
        ) {
          const now = Date.now();
          update(ref(db), {
            [`matrimony_chats/${it.roomId}/messages/${it.lastMessageId}/deliveredBy/${uid}`]: now,
            [`matrimony_inbox/${it.peerUid}/${it.roomId}/lastMessageDeliveredToPeer`]: true,
            [`matrimony_inbox/${uid}/${it.roomId}/lastMessageDeliveredToPeer`]: true,
          }).catch(() => {});
        }
      });

      items.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
      const totalUnread = items.reduce((acc, it) => acc + it.unreadCount, 0);
      onChange(items, totalUnread);
    });
  },

  subscribeRoomMessages(
    roomId: string,
    myUid: string,
    onChange: (messages: MatrimonyChatMessage[]) => void,
    pageLimit = 50
  ): () => void {
    if (!roomId || !myUid) return () => {};
    const db = getMatrimonyRtdb();
    const msgsQuery = query(
      ref(db, `matrimony_chats/${roomId}/messages`),
      orderByChild('createdAt'),
      limitToLast(pageLimit)
    );
    return onValue(msgsQuery, (snap) => {
      const list = parseChatMessagesSnapshot(snap.val(), myUid);
      onChange(list);
    });
  },

  async fetchOlderRoomMessages(
    roomId: string,
    myUid: string,
    beforeCreatedAt: number,
    pageLimit = 40
  ): Promise<{ messages: MatrimonyChatMessage[]; hasMore: boolean }> {
    if (!roomId || !myUid || !beforeCreatedAt) {
      return { messages: [], hasMore: false };
    }
    const db = getMatrimonyRtdb();
    const msgsQuery = query(
      ref(db, `matrimony_chats/${roomId}/messages`),
      orderByChild('createdAt'),
      endAt(beforeCreatedAt - 1),
      limitToLast(pageLimit + 1)
    );
    const snap = await get(msgsQuery);
    const raw = snap.val() || {};
    const rawCount = Object.keys(raw).length;
    const allSorted = parseChatMessagesSnapshot(raw, myUid);
    const hasMore = rawCount > pageLimit;
    const messages =
      hasMore && allSorted.length > pageLimit
        ? allSorted.slice(allSorted.length - pageLimit)
        : allSorted;
    return { messages, hasMore };
  },

  subscribeTyping(
    roomId: string,
    peerUid: string,
    onChange: (isTyping: boolean) => void
  ): () => void {
    if (!roomId || !peerUid) return () => {};
    const db = getMatrimonyRtdb();
    return onValue(ref(db, `matrimony_chats/${roomId}/typing/${peerUid}`), (snap) => {
      onChange(snap.val() === true);
    });
  },

  setTyping(roomId: string, myUid: string, isTyping: boolean) {
    if (!roomId || !myUid) return;
    const db = getMatrimonyRtdb();
    const tRef = ref(db, `matrimony_chats/${roomId}/typing/${myUid}`);
    if (isTyping) {
      onDisconnect(tRef).set(false).catch(() => {});
    }
    set(tRef, isTyping).catch(() => {});
  },

  async markRoomRead(
    roomId: string,
    myUid: string,
    peerUid: string,
    unreadIncomingMsgIds: string[]
  ): Promise<void> {
    if (!roomId || !myUid) return;
    const db = getMatrimonyRtdb();
    const now = Date.now();
    const updates: Record<string, any> = {
      [`matrimony_inbox/${myUid}/${roomId}/unreadCount`]: 0,
      [`matrimony_chats/${roomId}/readReceipts/${myUid}`]: now,
    };
    unreadIncomingMsgIds.forEach((msgId) => {
      updates[`matrimony_chats/${roomId}/messages/${msgId}/deliveredBy/${myUid}`] = now;
      updates[`matrimony_chats/${roomId}/messages/${msgId}/readBy/${myUid}`] = now;
    });
    if (peerUid && unreadIncomingMsgIds.length > 0) {
      updates[`matrimony_inbox/${peerUid}/${roomId}/lastMessageDeliveredToPeer`] = true;
      updates[`matrimony_inbox/${peerUid}/${roomId}/lastMessageReadByPeer`] = true;
    }
    await update(ref(db), updates).catch(() => {});
  },

  async sendMessage(params: {
    roomId: string;
    myUid: string;
    peerUid: string;
    myName: string;
    myPhoto: string | null;
    peerName: string;
    peerPhoto: string | null;
    peerOnline?: boolean;
    text: string;
    type?: 'text' | 'image';
    imageUrl?: string | null;
    replyTo?: MatrimonyChatMessageReply | null;
  }): Promise<void> {
    const db = getMatrimonyRtdb();
    const msgRef = push(ref(db, `matrimony_chats/${params.roomId}/messages`));
    const msgId = msgRef.key || `${Date.now()}`;
    const cleanText = params.text.trim();
    const type = params.type || 'text';
    const previewLabel = type === 'image' ? (cleanText ? `📷 ${cleanText}` : '📷 Photo') : cleanText;
    const deliveredImmediately = Boolean(params.peerOnline);

    const updates: Record<string, any> = {
      [`matrimony_chats/${params.roomId}/participants/${params.myUid}`]: true,
      [`matrimony_chats/${params.roomId}/participants/${params.peerUid}`]: true,
      [`matrimony_chats/${params.roomId}/typing/${params.myUid}`]: false,
      [`matrimony_chats/${params.roomId}/messages/${msgId}`]: {
        id: msgId,
        senderUid: params.myUid,
        text: cleanText,
        type,
        imageUrl: params.imageUrl || null,
        replyTo: params.replyTo || null,
        createdAt: serverTimestamp(),
        ...(deliveredImmediately
          ? { deliveredBy: { [params.peerUid]: serverTimestamp() } }
          : {}),
      },
      [`matrimony_inbox/${params.myUid}/${params.roomId}/roomId`]: params.roomId,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/peerUid`]: params.peerUid,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/peerName`]: params.peerName,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/peerPhoto`]: params.peerPhoto || null,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/lastMessageText`]: previewLabel,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/lastMessageType`]: type,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/lastMessageSenderUid`]: params.myUid,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/lastMessageId`]: msgId,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/lastMessageDeliveredToPeer`]: deliveredImmediately,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/lastMessageReadByPeer`]: false,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/lastMessageAt`]: serverTimestamp(),
      [`matrimony_inbox/${params.myUid}/${params.roomId}/unreadCount`]: 0,

      [`matrimony_inbox/${params.peerUid}/${params.roomId}/roomId`]: params.roomId,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/peerUid`]: params.myUid,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/peerName`]: params.myName,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/peerPhoto`]: params.myPhoto || null,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageText`]: previewLabel,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageType`]: type,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageSenderUid`]: params.myUid,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageId`]: msgId,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageDeliveredToPeer`]: deliveredImmediately,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageReadByPeer`]: false,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageAt`]: serverTimestamp(),
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/unreadCount`]: increment(1),
    };

    await update(ref(db), updates);
    matrimonyApi.notifyChatMessage(params.peerUid, previewLabel).catch(() => {});
  },

  async deleteMessageForMe(roomId: string, msgId: string, myUid: string): Promise<void> {
    const db = getMatrimonyRtdb();
    await set(
      ref(db, `matrimony_chats/${roomId}/messages/${msgId}/deletedFor/${myUid}`),
      true
    );
  },

  async deleteMessageForEveryone(
    roomId: string,
    myUid: string,
    peerUid: string,
    msgId: string,
    isLatestInboxMessage: boolean
  ): Promise<void> {
    const db = getMatrimonyRtdb();
    const updates: Record<string, any> = {
      [`matrimony_chats/${roomId}/messages/${msgId}/deletedForEveryone`]: true,
      [`matrimony_chats/${roomId}/messages/${msgId}/text`]: '',
      [`matrimony_chats/${roomId}/messages/${msgId}/imageUrl`]: null,
      [`matrimony_chats/${roomId}/messages/${msgId}/replyTo`]: null,
    };
    if (isLatestInboxMessage) {
      updates[`matrimony_inbox/${myUid}/${roomId}/lastMessageText`] = '🚫 This message was deleted';
      updates[`matrimony_inbox/${peerUid}/${roomId}/lastMessageText`] = '🚫 This message was deleted';
    }
    await update(ref(db), updates);
  },

  async clearChatForMe(
    roomId: string,
    myUid: string,
    messageIds: string[]
  ): Promise<void> {
    if (!roomId || !myUid) return;
    const db = getMatrimonyRtdb();
    const updates: Record<string, any> = {
      [`matrimony_inbox/${myUid}/${roomId}/lastMessageText`]: '',
      [`matrimony_inbox/${myUid}/${roomId}/unreadCount`]: 0,
    };
    messageIds.forEach((id) => {
      updates[`matrimony_chats/${roomId}/messages/${id}/deletedFor/${myUid}`] = true;
    });
    await update(ref(db), updates);
  },
};

export { endAt, equalTo };
