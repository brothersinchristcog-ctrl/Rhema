import nativeAuth from '@react-native-firebase/auth';
import { AppState } from 'react-native';
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
import { e2eeService } from '../../../services/e2eeService';
import { roomKeyManager } from '../../../services/roomKeyManager';
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
const _inFlightMatrimonyDeliveryKeys = new Set<string>();

function ackMatrimonyInboxDeliveries(
  db: Database,
  uid: string,
  entries: Array<{ roomId: string; r: Record<string, any> }>
) {
  const now = Date.now();
  entries.forEach(({ roomId: rKey, r }) => {
    const resolvedRoomId = String(r.roomId || rKey);
    const peerUid = String(r.peerUid || '');
    const msgId = String(r.lastMessageId || '');
    if (
      !r.lastMessageSenderUid ||
      r.lastMessageSenderUid === uid ||
      !msgId ||
      r.lastMessageDeliveredToPeer
    ) {
      return;
    }

    const dedupeKey = `${uid}:${resolvedRoomId}:${msgId}`;
    if (_inFlightMatrimonyDeliveryKeys.has(dedupeKey)) return;
    _inFlightMatrimonyDeliveryKeys.add(dedupeKey);

    void (async () => {
      try {
        const [partSnap, msgSnap] = await Promise.all([
          get(ref(db, `matrimony_chats/${resolvedRoomId}/participants/${uid}`)).catch(() => null),
          get(ref(db, `matrimony_chats/${resolvedRoomId}/messages/${msgId}/senderUid`)).catch(
            () => null
          ),
        ]);

        if (partSnap?.val() === true && msgSnap?.exists()) {
          const perRoomUpdates: Record<string, any> = {
            [`matrimony_chats/${resolvedRoomId}/messages/${msgId}/deliveredBy/${uid}`]: now,
            [`matrimony_inbox/${uid}/${resolvedRoomId}/lastMessageDeliveredToPeer`]: true,
          };
          if (peerUid) {
            perRoomUpdates[
              `matrimony_inbox/${peerUid}/${resolvedRoomId}/lastMessageDeliveredToPeer`
            ] = true;
          }
          await update(ref(db), perRoomUpdates);
          return;
        }

        await update(ref(db, `matrimony_inbox/${uid}/${resolvedRoomId}`), {
          lastMessageDeliveredToPeer: true,
        }).catch(() => {});
      } catch {
        await update(ref(db, `matrimony_inbox/${uid}/${resolvedRoomId}`), {
          lastMessageDeliveredToPeer: true,
        }).catch(() => {});
      } finally {
        _inFlightMatrimonyDeliveryKeys.delete(dedupeKey);
      }
    })();
  });
}

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

async function decryptChatMessagesSnapshot(
  ctx: { scope: 'matrimony'; rtdb: ReturnType<typeof getMatrimonyRtdb>; roomId: string },
  val: Record<string, any> | null | undefined,
  myUid: string
): Promise<{ list: MatrimonyChatMessage[]; hasLockedMessages: boolean }> {
  const obj = val || {};
  let hasLockedMessages = false;

  const list: MatrimonyChatMessage[] = (
    await Promise.all(
      Object.keys(obj)
        .filter((key) => !obj[key]?.deletedFor?.[myUid])
        .map(async (key) => {
          const m = obj[key] || {};
          const decText = m.deletedForEveryone
            ? { text: '', encrypted: false }
            : await roomKeyManager.decryptString(ctx, myUid, String(m.text || ''));
          if (decText.lockedReason) hasLockedMessages = true;

          let replyTo = m.replyTo || null;
          if (
            replyTo &&
            typeof replyTo.text === 'string' &&
            e2eeService.isEncryptedPayload(replyTo.text)
          ) {
            const decReply = await roomKeyManager.decryptString(ctx, myUid, replyTo.text);
            replyTo = { ...replyTo, text: decReply.text };
          }

          return {
            id: String(m.id || key),
            senderUid: String(m.senderUid || ''),
            text: decText.text,
            type: (m.type === 'image' ? 'image' : 'text') as 'text' | 'image',
            imageUrl: m.imageUrl || null,
            replyTo,
            createdAt: typeof m.createdAt === 'number' ? m.createdAt : Date.now(),
            deliveredBy: m.deliveredBy || {},
            readBy: m.readBy || {},
            deletedForEveryone: Boolean(m.deletedForEveryone),
            deletedFor: m.deletedFor || {},
          };
        })
    )
  ).sort((a, b) => a.createdAt - b.createdAt);

  return { list, hasLockedMessages };
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
      if (_presenceCleanup === cleanup) {
        _presenceUid = null;
        _presenceCleanup = null;
      }
      set(presenceRef, {
        online: false,
        lastSeen: serverTimestamp(),
        activeChatId: null,
      }).catch(() => {});
    };
    _presenceCleanup = cleanup;
    return cleanup;
  },

  startRootPresenceSession(uid: string): () => void {
    if (!uid) return () => {};
    const db = getMatrimonyRtdb();
    const presenceRef = ref(db, `matrimony_presence/${uid}`);
    const stopBase = this.startPresenceTracking(uid, null);

    const markOffline = () => {
      set(presenceRef, {
        online: false,
        lastSeen: serverTimestamp(),
        activeChatId: null,
      }).catch(() => {});
    };

    const markOnline = () => {
      onDisconnect(presenceRef)
        .set({
          online: false,
          lastSeen: serverTimestamp(),
          activeChatId: null,
        })
        .catch(() => {});
      update(presenceRef, {
        online: true,
        lastSeen: serverTimestamp(),
      }).catch(() => {});
    };

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        markOnline();
      } else {
        markOffline();
      }
    });

    return () => {
      appStateSub.remove();
      stopBase();
      markOffline();
    };
  },

  setOffline(uid: string) {
    if (!uid) return;
    const db = getMatrimonyRtdb();
    set(ref(db, `matrimony_presence/${uid}`), {
      online: false,
      lastSeen: serverTimestamp(),
      activeChatId: null,
    }).catch(() => {});
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
    let disposed = false;
    let seq = 0;
    let latestRaw: Record<string, any> | null = null;

    const processSnapshot = async (rawObj: Record<string, any> | null) => {
      const currentSeq = ++seq;
      const raw = rawObj || {};
      const entries = Object.keys(raw)
        .map((roomId) => ({ roomId, r: raw[roomId] || {} }))
        .filter(({ r }) => Boolean(r.peerUid));

      // Mark incoming messages delivered safely per room without tripping root multi-path denials
      ackMatrimonyInboxDeliveries(db, uid, entries);

      const items: MatrimonyInboxItem[] = await Promise.all(
        entries.map(async ({ roomId: rKey, r }) => {
          const resolvedRoomId = String(r.roomId || rKey);
          const dec = await roomKeyManager.decryptString(
            { scope: 'matrimony', rtdb: db, roomId: resolvedRoomId },
            uid,
            String(r.lastMessageText || '')
          );
          return {
            roomId: resolvedRoomId,
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
            lastMessageText: dec.text,
            lastMessageType: (r.lastMessageType === 'image' ? 'image' : 'text') as 'text' | 'image',
            lastMessageSenderUid: r.lastMessageSenderUid || undefined,
            lastMessageId: r.lastMessageId || undefined,
            lastMessageDeliveredToPeer: Boolean(r.lastMessageDeliveredToPeer),
            lastMessageReadByPeer: Boolean(r.lastMessageReadByPeer),
            lastMessageAt: typeof r.lastMessageAt === 'number' ? r.lastMessageAt : 0,
            unreadCount: typeof r.unreadCount === 'number' && r.unreadCount > 0 ? r.unreadCount : 0,
          };
        })
      );

      if (disposed || currentSeq !== seq) return;
      items.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
      const totalUnread = items.reduce((acc, it) => acc + it.unreadCount, 0);
      onChange(items, totalUnread);
    };

    const unsubRtdb = onValue(ref(db, `matrimony_inbox/${uid}`), (snap) => {
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

  subscribeRoomMessages(
    roomId: string,
    myUid: string,
    onChange: (messages: MatrimonyChatMessage[]) => void,
    pageLimit = 50
  ): () => void {
    if (!roomId || !myUid) return () => {};
    const db = getMatrimonyRtdb();
    const ctx = { scope: 'matrimony' as const, rtdb: db, roomId };
    const msgsQuery = query(
      ref(db, `matrimony_chats/${roomId}/messages`),
      orderByChild('createdAt'),
      limitToLast(pageLimit)
    );
    let disposed = false;
    let seq = 0;
    let latestRaw: Record<string, any> | null = null;
    let hasLockedMessages = false;

    const processSnapshot = async (val: Record<string, any> | null) => {
      const currentSeq = ++seq;
      const { list, hasLockedMessages: foundLocked } = await decryptChatMessagesSnapshot(
        ctx,
        val,
        myUid
      );

      if (disposed || currentSeq !== seq) return;
      hasLockedMessages = foundLocked;
      onChange(list);
    };

    const unsubMsgs = onValue(msgsQuery, (snap) => {
      latestRaw = snap.val() || {};
      processSnapshot(latestRaw);
    });

    const unsubKeys = onValue(ref(db, `matrimony_chats/${roomId}/e2ee/keys`), () => {
      if (hasLockedMessages && latestRaw !== null) {
        processSnapshot(latestRaw);
      }
    });

    const unsubReqs = onValue(ref(db, `matrimony_chats/${roomId}/e2ee/requests`), (snap) => {
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
    const ctx = { scope: 'matrimony' as const, rtdb: db, roomId };
    const msgsQuery = query(
      ref(db, `matrimony_chats/${roomId}/messages`),
      orderByChild('createdAt'),
      endAt(beforeCreatedAt - 1),
      limitToLast(pageLimit + 1)
    );
    const snap = await get(msgsQuery);
    const raw = snap.val() || {};
    const rawCount = Object.keys(raw).length;
    const { list: allSorted } = await decryptChatMessagesSnapshot(ctx, raw, myUid);
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
    const [partSnap, inboxSnap] = await Promise.all([
      get(ref(db, `matrimony_chats/${roomId}/participants/${myUid}`)).catch(() => null),
      get(ref(db, `matrimony_inbox/${myUid}/${roomId}/unreadCount`)).catch(() => null),
    ]);
    const hasInboxUnread = inboxSnap?.exists() && Number(inboxSnap.val() || 0) > 0;

    if (partSnap?.val() !== true) {
      if (hasInboxUnread) {
        await update(ref(db, `matrimony_inbox/${myUid}/${roomId}`), {
          unreadCount: 0,
        }).catch(() => {});
      }
      return;
    }

    const now = Date.now();
    const updates: Record<string, any> = {
      [`matrimony_chats/${roomId}/readReceipts/${myUid}`]: now,
    };
    if (hasInboxUnread) {
      updates[`matrimony_inbox/${myUid}/${roomId}/unreadCount`] = 0;
    }
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

    const ctx = { scope: 'matrimony' as const, rtdb: db, roomId: params.roomId };
    const partSnap = await get(
      ref(db, `matrimony_chats/${params.roomId}/participants`)
    ).catch(() => null);
    const partVal = (partSnap?.val() || {}) as Record<string, any>;
    const missingParts: Record<string, any> = {};
    if (partVal[params.myUid] !== true) missingParts[params.myUid] = true;
    if (partVal[params.peerUid] !== true) missingParts[params.peerUid] = true;
    if (Object.keys(missingParts).length > 0) {
      await update(
        ref(db, `matrimony_chats/${params.roomId}/participants`),
        missingParts
      ).catch(() => {});
    }

    const participants = [params.myUid, params.peerUid];
    const roomKey = await roomKeyManager.getOrCreateRoomSendKey(ctx, params.myUid, participants);
    const storedText = cleanText
      ? (await roomKeyManager.encryptString(ctx, params.myUid, participants, cleanText, roomKey))
          .cipherText
      : '';
    const storedPreview = (
      await roomKeyManager.encryptString(ctx, params.myUid, participants, previewLabel, roomKey)
    ).cipherText;

    let finalReplyTo = params.replyTo || null;
    if (finalReplyTo && finalReplyTo.text) {
      const encReply = await roomKeyManager.encryptString(
        ctx,
        params.myUid,
        participants,
        finalReplyTo.text,
        roomKey
      );
      finalReplyTo = { ...finalReplyTo, text: encReply.cipherText };
    }

    const updates: Record<string, any> = {
      [`matrimony_chats/${params.roomId}/participants/${params.myUid}`]: true,
      [`matrimony_chats/${params.roomId}/participants/${params.peerUid}`]: true,
      [`matrimony_chats/${params.roomId}/typing/${params.myUid}`]: false,
      [`matrimony_chats/${params.roomId}/messages/${msgId}`]: {
        id: msgId,
        senderUid: params.myUid,
        text: storedText,
        encrypted: true,
        keyId: roomKey.keyId,
        type,
        imageUrl: params.imageUrl || null,
        replyTo: finalReplyTo,
        createdAt: serverTimestamp(),
        ...(deliveredImmediately
          ? { deliveredBy: { [params.peerUid]: serverTimestamp() } }
          : {}),
      },
      [`matrimony_inbox/${params.myUid}/${params.roomId}/roomId`]: params.roomId,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/peerUid`]: params.peerUid,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/peerName`]: params.peerName,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/peerPhoto`]: params.peerPhoto || null,
      [`matrimony_inbox/${params.myUid}/${params.roomId}/lastMessageText`]: storedPreview,
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
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageText`]: storedPreview,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageType`]: type,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageSenderUid`]: params.myUid,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageId`]: msgId,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageDeliveredToPeer`]: deliveredImmediately,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageReadByPeer`]: false,
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/lastMessageAt`]: serverTimestamp(),
      [`matrimony_inbox/${params.peerUid}/${params.roomId}/unreadCount`]: increment(1),
    };

    await update(ref(db), updates);
    const pushPreview = type === 'image' ? '📷 Sent you a photo' : '🔒 New encrypted message';
    matrimonyApi.notifyChatMessage(params.peerUid, pushPreview).catch(() => {});
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
    const partSnap =
      messageIds.length > 0
        ? await get(ref(db, `matrimony_chats/${roomId}/participants/${myUid}`)).catch(() => null)
        : null;

    if (partSnap?.val() !== true) {
      await update(ref(db, `matrimony_inbox/${myUid}/${roomId}`), {
        lastMessageText: '',
        unreadCount: 0,
      });
      return;
    }

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
