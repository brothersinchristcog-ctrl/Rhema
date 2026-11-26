export interface MinimalUnreadMessage {
  id: string;
  senderUid?: string;
  userId?: string;
  type?: string;
  deletedForEveryone?: boolean;
  readBy?: Record<string, unknown>;
  createdAt?: unknown;
}

/**
 * Normalizes Firestore Timestamp, RTDB epoch number, or Date-like values into epoch ms.
 */
export function getChatMessageTimeMs(createdAt: unknown): number {
  if (typeof createdAt === 'number') {
    return Number.isFinite(createdAt) ? createdAt : 0;
  }
  if (!createdAt || typeof createdAt !== 'object') {
    return 0;
  }
  const ts = createdAt as { toMillis?: () => number; seconds?: number; _seconds?: number };
  if (typeof ts.toMillis === 'function') {
    const ms = ts.toMillis();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof ts.seconds === 'number') {
    return ts.seconds * 1000;
  }
  if (typeof ts._seconds === 'number') {
    return ts._seconds * 1000;
  }
  return 0;
}

/**
 * Returns the first unread incoming message ID from an ascending RTDB message list.
 * Works for both brand-new conversations (where no message has readBy[myUid]) and existing ones.
 */
export function findFirstUnreadRtdbMessageId<T extends MinimalUnreadMessage>(
  messages: T[],
  myUid: string
): string | null {
  if (!myUid || !Array.isArray(messages) || messages.length === 0) return null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || !m.id) continue;
    if (m.type === 'system' || m.deletedForEveryone) continue;
    if (m.senderUid === myUid) continue;
    if (!m.readBy?.[myUid]) {
      return m.id;
    }
  }
  return null;
}

/**
 * Returns the index of the first unread incoming message for timestamp-watermarked chats
 * (e.g. LiveCelebrationsChat). Supports both new conversations (lastReadTimeMs === 0 once loaded)
 * and existing conversations (lastReadTimeMs > 0).
 */
export function findFirstUnreadTimestampedMessageIndex<T extends MinimalUnreadMessage>(
  messages: T[],
  myUid: string,
  lastReadTimeMs: number,
  lastReadLoaded: boolean
): number {
  if (!lastReadLoaded || !Array.isArray(messages) || messages.length === 0) return -1;

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    const authorId = m.userId ?? m.senderUid;
    if (myUid && authorId === myUid) continue;

    const msgTime = getChatMessageTimeMs(m.createdAt);
    if (lastReadTimeMs <= 0) {
      // Brand-new visit/conversation: any incoming message is unread.
      // Treat pending serverTimestamp (0) as unread only if no timestamped messages precede it,
      // or generally any incoming message when watermark is 0.
      return i;
    }
    if (msgTime > lastReadTimeMs) {
      return i;
    }
  }
  return -1;
}

export interface UnreadAnchorSnapshotInput<T extends MinimalUnreadMessage> {
  currentAnchorId: string | null;
  messages: T[];
  myUid: string;
  userInteracted: boolean;
  isNearBottom: boolean;
}

/**
 * Preserves the initial unread divider ID across immediate markRoomRead updates,
 * captures late-arriving initial unread snapshots before user interaction,
 * and starts an unread anchor when new messages arrive while scrolled up.
 */
export function resolveRtdbUnreadAnchor<T extends MinimalUnreadMessage>({
  currentAnchorId,
  messages,
  myUid,
  userInteracted,
  isNearBottom,
}: UnreadAnchorSnapshotInput<T>): string | null {
  if (currentAnchorId) {
    // Keep anchor sticky while that message is still in the visible list.
    if (messages.some((m) => m.id === currentAnchorId)) {
      return currentAnchorId;
    }
  }

  const firstUnreadId = findFirstUnreadRtdbMessageId(messages, myUid);
  if (!firstUnreadId) return null;

  // Capture unread anchor on initial open (before user scrolls) OR when scrolled up.
  if (!userInteracted || !isNearBottom) {
    return firstUnreadId;
  }

  return null;
}
