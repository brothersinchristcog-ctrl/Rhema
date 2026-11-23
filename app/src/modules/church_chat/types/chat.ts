export type ChatRoomType = 'direct' | 'group';
export type ChatCategory = 'direct' | 'team' | 'group';
export type ChatMessageType =
  | 'text'
  | 'image'
  | 'image_group'
  | 'video'
  | 'audio'
  | 'document'
  | 'system';

export interface ChurchMemberContact {
  uid: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  photoUrl: string | null;
  userType: string;
  memberCode?: string;
  city?: string;
  isAdmin: boolean;
}

export interface ChatPresenceState {
  online: boolean;
  lastSeen: number;
  activeRoomId: string | null;
}

export interface ChatMediaAttachment {
  url: string;
  thumbUrl?: string | null;
  mimeType: string;
  fileName?: string;
  sizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
}

export interface ChatMessageReply {
  msgId: string;
  senderUid: string;
  senderName: string;
  type: ChatMessageType;
  snippet: string;
}

export interface ChatSystemEvent {
  action:
    | 'group_created'
    | 'member_added'
    | 'member_removed'
    | 'member_left'
    | 'admin_promoted'
    | 'admin_demoted'
    | 'info_updated'
    | 'permissions_updated';
  actorUid: string;
  actorName: string;
  targetUid?: string;
  targetName?: string;
  detail?: string;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderAvatar?: string | null;
  type: ChatMessageType;
  text: string;
  encrypted?: boolean;
  media?: ChatMediaAttachment[];
  replyTo?: ChatMessageReply | null;
  forwarded?: boolean;
  reactions?: Record<string, Record<string, boolean>>;
  deliveredTo?: Record<string, number>;
  readBy?: Record<string, number>;
  deletedFor?: Record<string, boolean>;
  deletedForEveryone?: boolean;
  systemEvent?: ChatSystemEvent | null;
  createdAt: number;
}

export interface ChatRoomMeta {
  roomId: string;
  churchId: string;
  type: ChatRoomType;
  name: string;
  description?: string;
  avatarUrl?: string | null;
  category: ChatCategory;
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
  onlyAdminsCanSend: boolean;
  onlyAdminsCanEditInfo: boolean;
  onlyAdminsCanAddMembers: boolean;
}

export interface ChatRoomDetails {
  meta: ChatRoomMeta;
  participants: Record<string, boolean>;
  admins: Record<string, boolean>;
  readWatermarks?: Record<string, number>;
}

export interface ChatInboxItem {
  roomId: string;
  roomType: ChatRoomType;
  category: ChatCategory;
  peerUid?: string;
  title: string;
  avatarUrl?: string | null;
  lastMessageId?: string;
  lastMessageText: string;
  lastMessageType: ChatMessageType;
  lastMessageSenderUid?: string;
  lastMessageSenderName?: string;
  lastMessageAt: number;
  lastMessageDelivered?: boolean;
  lastMessageRead?: boolean;
  unreadCount: number;
  isMuted: boolean;
  mutedUntil?: number | null;
  isArchived: boolean;
  isFavorite: boolean;
  participantCount?: number;
  encrypted?: boolean;
}

export interface ChatTypingUser {
  uid: string;
  name: string;
  isTyping: boolean;
  updatedAt: number;
}

export interface ChatBlockRecord {
  blockedUid: string;
  blockedName: string;
  blockedPhoto?: string | null;
  createdAt: number;
}

export interface ChatReportPayload {
  reportedUid?: string;
  reportedName?: string;
  roomId: string;
  msgId?: string;
  reason: string;
  details?: string;
}

export interface UploadProgress {
  progress: number; // 0..1
}
