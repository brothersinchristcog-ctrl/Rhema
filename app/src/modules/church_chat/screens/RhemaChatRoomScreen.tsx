import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { Audio, ResizeMode, Video } from 'expo-av';
import {
  ArrowLeft,
  BellOff,
  CheckSquare,
  Flag,
  Info,
  Lock,
  MoreVertical,
  Phone,
  Search,
  ShieldBan,
  Trash2,
  Users,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../../constants/ChurchConfig';
import { e2eeService, E2EEStateSnapshot } from '../../../services/e2eeService';
import ChatEncryptionModal, { ChatEncryptionModalMode } from '../../../components/ChatEncryptionModal';
import InAppDocumentViewerModal, {
  InAppDocumentViewerDoc,
} from '../../../components/InAppDocumentViewerModal';
import { useChatTheme } from '../constants/useChatTheme';
import { rhemaChatService } from '../services/rhemaChatService';
import { rhemaDirectoryService } from '../services/rhemaDirectoryService';
import { rhemaChatMediaService, PickedLocalAsset } from '../services/rhemaChatMediaService';
import {
  ChatBlockRecord,
  ChatMediaAttachment,
  ChatMessage,
  ChatMessageReply,
  ChatPresenceState,
  ChatRoomDetails,
  ChatTypingUser,
} from '../types/chat';
import AvatarWithStatus from '../components/AvatarWithStatus';
import MessageBubble, { formatTime12h } from '../components/MessageBubble';
import ChatComposerPill from '../components/ChatComposerPill';
import AttachmentSheet from '../components/AttachmentSheet';
import ReactionBarPopup from '../components/ReactionBarPopup';
import TypingIndicatorBubble from '../components/TypingIndicatorBubble';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function formatLastSeenSubtitle(presence: ChatPresenceState | null): string {
  if (!presence) return 'Rhema Member';
  if (presence.online) return 'Online';
  if (!presence.lastSeen) return 'Offline';
  const d = new Date(presence.lastSeen);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return `last seen today at ${formatTime12h(presence.lastSeen)}`;
  return `last seen ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
}

export default function RhemaChatRoomScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { palette, fontFamily, scaleFont } = useChatTheme();

  const churchId = activeChurch?.id || RHEMA_CHURCH_ID;
  const myUid = user?.uid || '';
  const myName =
    member?.name ||
    `${member?.firstName || ''} ${member?.lastName || ''}`.trim() ||
    user?.displayName ||
    'Rhema Member';
  const myPhoto = (member as any)?.profilePhoto || (member as any)?.photoUrl || null;

  const roomId: string = route?.params?.roomId || '';
  const initialRoomType: 'direct' | 'group' =
    route?.params?.roomType === 'group' ? 'group' : 'direct';
  const initialTitle: string = route?.params?.title || 'Chat';
  const initialAvatar: string | null = route?.params?.avatarUrl || null;
  const peerUid: string | undefined = route?.params?.peerUid;
  const [peerPhone, setPeerPhone] = useState<string>(route?.params?.peerPhone || '');

  const [roomDetails, setRoomDetails] = useState<ChatRoomDetails | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLimit, setMsgLimit] = useState(120);
  const [presence, setPresence] = useState<ChatPresenceState | null>(null);
  const [typingUsers, setTypingUsers] = useState<ChatTypingUser[]>([]);
  const [blockedMap, setBlockedMap] = useState<Record<string, ChatBlockRecord>>({});
  const [blockedByPeer, setBlockedByPeer] = useState(false);

  const [inputText, setInputText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessageReply | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<ChatMessage | null>(null);
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearch, setInChatSearch] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Recording state
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Media preview modals
  const [galleryModal, setGalleryModal] = useState<{
    items: ChatMediaAttachment[];
    index: number;
  } | null>(null);
  const [videoModal, setVideoModal] = useState<ChatMediaAttachment | null>(null);
  const [docModal, setDocModal] = useState<InAppDocumentViewerDoc | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Inappropriate content');
  const [reportDetails, setReportDetails] = useState('');
  const [e2eeState, setE2eeState] = useState<E2EEStateSnapshot>(() => e2eeService.getState());
  const [e2eeModalMode, setE2eeModalMode] = useState<ChatEncryptionModalMode | null>(null);

  useEffect(() => {
    setE2eeState(e2eeService.getState());
    const unsub = e2eeService.subscribeState(setE2eeState);
    return () => unsub();
  }, []);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);
  const isTypingActiveRef = useRef<boolean>(false);
  const syncedStaleInboxRef = useRef<boolean>(false);

  const roomType = roomDetails?.meta?.type || initialRoomType;
  const isGroup = roomType === 'group';
  const roomTitle = isGroup
    ? roomDetails?.meta?.name || initialTitle
    : initialTitle;
  const roomAvatar = isGroup
    ? roomDetails?.meta?.avatarUrl ?? initialAvatar
    : initialAvatar;
  const participantUids = useMemo(() => {
    const keys = Object.keys(roomDetails?.participants || {}).filter(
      (u) => roomDetails?.participants?.[u]
    );
    if (keys.length === 0 && !isGroup && peerUid) {
      return [myUid, peerUid];
    }
    return keys;
  }, [roomDetails?.participants, isGroup, peerUid, myUid]);

  const amGroupAdmin = Boolean(roomDetails?.admins?.[myUid]);
  const onlyAdminsCanSend = Boolean(isGroup && roomDetails?.meta?.onlyAdminsCanSend);
  const iBlockedPeer = Boolean(!isGroup && peerUid && blockedMap[peerUid]);

  useEffect(() => {
    if (!myUid || !roomId) return;

    rhemaChatService.startPresenceTracking(churchId, myUid, roomId);
    rhemaChatService.setActiveRoom(churchId, myUid, roomId);

    const unsubDetails = rhemaChatService.subscribeRoomDetails(churchId, roomId, setRoomDetails);
    const unsubTyping = rhemaChatService.subscribeTyping(churchId, roomId, myUid, setTypingUsers);
    const unsubBlocks = rhemaDirectoryService.subscribeBlockedUsers(
      churchId,
      myUid,
      setBlockedMap
    );

    let unsubPeerPresence: (() => void) | undefined;
    if (!isGroup && peerUid) {
      unsubPeerPresence = rhemaChatService.subscribePresence(churchId, peerUid, setPresence);
      rhemaDirectoryService.isBlockedByPeer(churchId, myUid, peerUid).then(setBlockedByPeer);
      if (!peerPhone) {
        rhemaDirectoryService.getMemberByUid(churchId, peerUid).then((m) => {
          if (m?.phone) setPeerPhone(m.phone);
        });
      }
    }

    return () => {
      unsubDetails();
      unsubTyping();
      unsubBlocks();
      if (unsubPeerPresence) unsubPeerPresence();
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      isTypingActiveRef.current = false;
      rhemaChatService.setTyping(churchId, roomId, myUid, myName, false);
      rhemaChatService.setActiveRoom(churchId, myUid, null);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [churchId, roomId, myUid, myName, isGroup, peerUid]);

  useEffect(() => {
    if (!myUid || !roomId) return;
    syncedStaleInboxRef.current = false;
    const unsubMsgs = rhemaChatService.subscribeRoomMessages(
      churchId,
      roomId,
      myUid,
      msgLimit,
      (list) => {
        setMessages(list);
        if (!syncedStaleInboxRef.current && list.length < msgLimit) {
          syncedStaleInboxRef.current = true;
          rhemaChatService.syncStaleInboxPreview(churchId, roomId, myUid, list).catch(() => {});
        }
        const unreadIncoming = list
          .filter((m) => m.senderUid !== myUid && m.type !== 'system' && !m.readBy?.[myUid])
          .map((m) => m.id);
        rhemaChatService.markRoomRead(
          churchId,
          roomId,
          myUid,
          !isGroup,
          peerUid,
          unreadIncoming
        );
      }
    );
    return () => unsubMsgs();
  }, [churchId, roomId, myUid, msgLimit, isGroup, peerUid]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120)
    );
    return () => showSub.remove();
  }, []);

  useEffect(() => {
    if (!inChatSearch && typingUsers.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [typingUsers.length, inChatSearch]);

  const displayedMessages = useMemo(() => {
    const q = inChatSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.text.toLowerCase().includes(q));
  }, [messages, inChatSearch]);

  const clearTypingState = () => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (isTypingActiveRef.current) {
      isTypingActiveRef.current = false;
      rhemaChatService.setTyping(churchId, roomId, myUid, myName, false);
    }
  };

  const handleTextChange = (val: string) => {
    setInputText(val);
    if (!myUid || !roomId) return;
    if (val.trim().length > 0) {
      const now = Date.now();
      if (!isTypingActiveRef.current || now - lastTypingSentAtRef.current > 1200) {
        isTypingActiveRef.current = true;
        lastTypingSentAtRef.current = now;
        rhemaChatService.setTyping(churchId, roomId, myUid, myName, true);
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        isTypingActiveRef.current = false;
        rhemaChatService.setTyping(churchId, roomId, myUid, myName, false);
      }, 2500);
    } else {
      clearTypingState();
    }
  };

  const guardCanSend = (): boolean => {
    if (iBlockedPeer) {
      Alert.alert('Blocked Contact', 'Unblock this member to send messages.');
      return false;
    }
    if (blockedByPeer) {
      Alert.alert('Unavailable', 'You cannot message this member right now.');
      return false;
    }
    if (onlyAdminsCanSend && !amGroupAdmin) {
      Alert.alert('Admins Only', 'Only Group Admins can send messages in this group.');
      return false;
    }
    return true;
  };

  const handleSendText = async () => {
    const clean = inputText.trim();
    if (!clean || !guardCanSend()) return;
    setInputText('');
    const currentReply = replyTo;
    setReplyTo(null);
    clearTypingState();

    try {
      await rhemaChatService.sendMessage({
        churchId,
        roomId,
        roomType,
        roomTitle,
        roomAvatar,
        category: roomDetails?.meta?.category || (isGroup ? 'group' : 'direct'),
        participantUids,
        senderUid: myUid,
        senderName: myName,
        senderAvatar: myPhoto,
        peerOnline: !isGroup && Boolean(presence?.online),
        type: 'text',
        text: clean,
        replyTo: currentReply,
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err: any) {
      if (err?.message === 'PIN_UNLOCK_REQUIRED') {
        setInputText(clean);
        setReplyTo(currentReply);
        setE2eeModalMode('unlock_backup');
        return;
      }
      Alert.alert('Send Failed', err?.message || 'Could not send message.');
    }
  };

  const sendMediaAssets = async (
    assets: PickedLocalAsset[],
    msgType: 'image' | 'image_group' | 'video' | 'audio' | 'document',
    caption = ''
  ) => {
    if (assets.length === 0 || !guardCanSend()) return;
    setUploading(true);
    const msgId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      const uploaded = await Promise.all(
        assets.map((a) => rhemaChatMediaService.uploadAttachment(churchId, roomId, msgId, a))
      );
      await rhemaChatService.sendMessage({
        churchId,
        roomId,
        roomType,
        roomTitle,
        roomAvatar,
        category: roomDetails?.meta?.category || (isGroup ? 'group' : 'direct'),
        participantUids,
        senderUid: myUid,
        senderName: myName,
        senderAvatar: myPhoto,
        peerOnline: !isGroup && Boolean(presence?.online),
        type: msgType,
        text: caption,
        media: uploaded,
        replyTo,
        msgId,
      });
      setReplyTo(null);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      if (err?.message === 'PIN_UNLOCK_REQUIRED') {
        setE2eeModalMode('unlock_backup');
        return;
      }
      Alert.alert('Upload Failed', err?.message || 'Unable to upload attachment.');
    } finally {
      setUploading(false);
    }
  };

  const handlePickPhotos = async () => {
    const assets = await rhemaChatMediaService.pickImages(true);
    if (assets.length === 0) return;
    await sendMediaAssets(assets, assets.length > 1 ? 'image_group' : 'image');
  };

  const handlePickVideo = async () => {
    const asset = await rhemaChatMediaService.pickVideo();
    if (!asset) return;
    await sendMediaAssets([asset], 'video');
  };

  const handleTakePhoto = async () => {
    const asset = await rhemaChatMediaService.capturePhotoOrVideo('photo');
    if (!asset) return;
    await sendMediaAssets([asset], 'image');
  };

  const handlePickDocument = async () => {
    const asset = await rhemaChatMediaService.pickDocument();
    if (!asset) return;
    await sendMediaAssets([asset], 'document');
  };

  const handleStartRecording = async () => {
    if (!guardCanSend() || isRecording) return;
    const rec = await rhemaChatMediaService.startVoiceRecording();
    if (!rec) return;
    recordingRef.current = rec;
    setRecordingSeconds(0);
    setIsRecording(true);
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
  };

  const handleStopAndSendRecording = async () => {
    if (!recordingRef.current) return;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    const res = await rhemaChatMediaService.stopVoiceRecording(recordingRef.current);
    recordingRef.current = null;
    if (!res || res.durationMs < 500) return;
    await sendMediaAssets(
      [
        {
          uri: res.uri,
          fileName: `voice_${Date.now()}.m4a`,
          mimeType: 'audio/mp4',
          durationMs: res.durationMs,
        },
      ],
      'audio'
    );
  };

  const handleCancelRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    if (recordingRef.current) {
      await rhemaChatMediaService.stopVoiceRecording(recordingRef.current);
      recordingRef.current = null;
    }
  };

  const handleReplyFromMessage = (m: ChatMessage) => {
    const snippet =
      m.text ||
      (m.type === 'image' || m.type === 'image_group'
        ? '📷 Photo'
        : m.type === 'video'
        ? '🎥 Video'
        : m.type === 'audio'
        ? '🎤 Voice message'
        : m.type === 'document'
        ? `📄 ${m.media?.[0]?.fileName || 'Document'}`
        : '');
    setReplyTo({
      msgId: m.id,
      senderUid: m.senderUid,
      senderName: m.senderUid === myUid ? 'You' : m.senderName,
      type: m.type,
      snippet,
    });
  };

  const openInfoScreen = () => {
    if (isGroup) {
      navigation.navigate('GroupInfo', { roomId });
    } else if (peerUid) {
      navigation.navigate('ContactInfo', {
        roomId,
        peerUid,
        peerName: roomTitle,
        peerAvatar: roomAvatar,
        peerPhone,
      });
    }
  };

  const handleDialPeer = () => {
    if (!peerPhone) {
      Alert.alert('No Phone Number', 'This member has not shared a phone number.');
      return;
    }
    Linking.openURL(`tel:${peerPhone}`).catch(() => {
      Alert.alert('Dialer Error', 'Could not open the phone dialer.');
    });
  };

  const headerSubtitle = useMemo(() => {
    if (typingUsers.length > 0) {
      return isGroup
        ? `${typingUsers[0].name.split(/\s+/)[0]} is typing...`
        : 'typing...';
    }
    if (isGroup) {
      return `${participantUids.length} participant${participantUids.length === 1 ? '' : 's'}`;
    }
    return formatLastSeenSubtitle(presence);
  }, [typingUsers, isGroup, participantUids.length, presence]);

  const selectableMessages = useMemo(
    () => displayedMessages.filter((m) => m.type !== 'system'),
    [displayedMessages]
  );

  const enterSelectionMode = (initialMsgId?: string) => {
    setSelectionMode(true);
    setSelectedIds(initialMsgId ? [initialMsgId] : []);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const toggleSelectMessage = (msg: ChatMessage) => {
    if (msg.type === 'system') return;
    setSelectedIds((prev) =>
      prev.includes(msg.id) ? prev.filter((id) => id !== msg.id) : [...prev, msg.id]
    );
  };

  const runBulkDelete = async (mode: 'me' | 'everyone', targets: ChatMessage[]) => {
    const ids = targets.map((m) => m.id);
    exitSelectionMode();
    try {
      if (mode === 'everyone') {
        const latestRoomMsgId = messages[messages.length - 1]?.id;
        await rhemaChatService.deleteMessagesForEveryone(
          churchId,
          roomId,
          ids,
          participantUids,
          latestRoomMsgId
        );
      } else {
        await rhemaChatService.deleteMessagesForMe(churchId, roomId, myUid, ids);
      }
    } catch (err: any) {
      Alert.alert('Delete Failed', err?.message || 'Could not delete selected messages.');
    }
  };

  const handleDeleteSelected = () => {
    const targets = messages.filter((m) => selectedIds.includes(m.id));
    if (targets.length === 0) return;
    const count = targets.length;
    const allCanDeleteForEveryone = targets.every(
      (m) => !m.deletedForEveryone && (m.senderUid === myUid || (isGroup && amGroupAdmin))
    );

    if (allCanDeleteForEveryone) {
      Alert.alert(
        `Delete ${count} message${count === 1 ? '' : 's'}?`,
        'Choose how to delete the selected messages.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete for Me', onPress: () => runBulkDelete('me', targets) },
          {
            text: 'Delete for Everyone',
            style: 'destructive',
            onPress: () => runBulkDelete('everyone', targets),
          },
        ]
      );
    } else {
      Alert.alert(
        `Delete ${count} message${count === 1 ? '' : 's'}?`,
        'Selected messages will be removed from your view.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete for Me',
            style: 'destructive',
            onPress: () => runBulkDelete('me', targets),
          },
        ]
      );
    }
  };

  const topPad = Math.max(insets.top + 6, Platform.OS === 'ios' ? 50 : 32);

  return (
    <LinearGradient colors={palette.bgGradient} style={styles.root}>
      <StatusBar
        barStyle={palette.isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Floating Glass Header */}
      <BlurView
        intensity={45}
        tint={palette.blurTint}
        style={[
          styles.header,
          {
            paddingTop: topPad,
            backgroundColor: palette.glassBg,
            borderBottomColor: palette.glassBorder,
          },
        ]}
      >
        {selectionMode ? (
          <>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={exitSelectionMode}
              activeOpacity={0.8}
            >
              <X size={20} color={palette.text} />
            </TouchableOpacity>

            <Text
              style={[
                styles.headerTitle,
                { flex: 1, marginLeft: 8, color: palette.text, fontFamily, fontSize: scaleFont(16.5) },
              ]}
              numberOfLines={1}
            >
              {selectedIds.length} selected
            </Text>

            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[
                  styles.selectAllPill,
                  { backgroundColor: palette.incomingBubbleBg, borderColor: palette.glassBorder },
                ]}
                onPress={() => {
                  const allIds = selectableMessages.map((m) => m.id);
                  if (allIds.length > 0 && selectedIds.length === allIds.length) {
                    setSelectedIds([]);
                  } else {
                    setSelectedIds(allIds);
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '700', fontFamily }}>
                  {selectableMessages.length > 0 &&
                  selectedIds.length === selectableMessages.length
                    ? 'Deselect All'
                    : 'Select All'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.circleAction,
                  {
                    backgroundColor:
                      selectedIds.length > 0 ? `${palette.danger}22` : palette.incomingBubbleBg,
                    borderColor: selectedIds.length > 0 ? palette.danger : palette.glassBorder,
                    opacity: selectedIds.length > 0 ? 1 : 0.45,
                  },
                ]}
                disabled={selectedIds.length === 0}
                onPress={handleDeleteSelected}
                activeOpacity={0.8}
              >
                <Trash2 size={16} color={selectedIds.length > 0 ? palette.danger : palette.text} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
            >
              <ArrowLeft size={20} color={palette.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.headerProfile} onPress={openInfoScreen} activeOpacity={0.8}>
              <AvatarWithStatus
                uri={roomAvatar}
                name={roomTitle}
                size={40}
                online={!isGroup && presence?.online === true}
                isGroup={isGroup}
                dotColor={palette.onlineDot}
                dotBorderColor={palette.bg}
              />
              <View style={styles.headerTextCol}>
                <Text
                  style={[
                    styles.headerTitle,
                    { color: palette.text, fontFamily, fontSize: scaleFont(16) },
                  ]}
                  numberOfLines={1}
                >
                  {roomTitle}
                </Text>
                <Text
                  style={[
                    styles.headerSub,
                    {
                      color:
                        typingUsers.length > 0 || presence?.online
                          ? palette.timestampGreen
                          : palette.textSecondary,
                      fontFamily,
                      fontSize: scaleFont(12),
                    },
                  ]}
                  numberOfLines={1}
                >
                  {headerSubtitle}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Right Header Actions:
                1-to-1: Phone (tel:) + Search + More
                Group:  Search + Participants + More */}
            <View style={styles.headerRight}>
              {!isGroup ? (
                <TouchableOpacity
                  style={[
                    styles.circleAction,
                    { backgroundColor: palette.incomingBubbleBg, borderColor: palette.glassBorder },
                  ]}
                  onPress={handleDialPeer}
                  activeOpacity={0.8}
                >
                  <Phone size={16} color={palette.text} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.circleAction,
                    { backgroundColor: palette.incomingBubbleBg, borderColor: palette.glassBorder },
                  ]}
                  onPress={openInfoScreen}
                  activeOpacity={0.8}
                >
                  <Users size={16} color={palette.text} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.circleAction,
                  {
                    backgroundColor: inChatSearchOpen ? palette.accent : palette.incomingBubbleBg,
                    borderColor: palette.glassBorder,
                  },
                ]}
                onPress={() => {
                  setInChatSearchOpen((v) => !v);
                  if (inChatSearchOpen) setInChatSearch('');
                }}
                activeOpacity={0.8}
              >
                <Search size={16} color={inChatSearchOpen ? '#FFFFFF' : palette.text} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.circleAction,
                  { backgroundColor: palette.incomingBubbleBg, borderColor: palette.glassBorder },
                ]}
                onPress={() => setHeaderMenuOpen(true)}
                activeOpacity={0.8}
              >
                <MoreVertical size={16} color={palette.text} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </BlurView>

      {inChatSearchOpen ? (
        <View
          style={[
            styles.inChatSearchBar,
            { backgroundColor: palette.surface, borderBottomColor: palette.glassBorder },
          ]}
        >
          <Search size={16} color={palette.textSecondary} />
          <TextInput
            style={[styles.inChatSearchInput, { color: palette.text, fontFamily }]}
            placeholder="Search messages in this chat..."
            placeholderTextColor={palette.inputPlaceholder}
            value={inChatSearch}
            onChangeText={setInChatSearch}
            autoFocus
          />
          <TouchableOpacity
            onPress={() => {
              setInChatSearch('');
              setInChatSearchOpen(false);
            }}
          >
            <X size={16} color={palette.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={displayedMessages}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => {
            if (!inChatSearch && messages.length > 0) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          ListHeaderComponent={
            <View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() =>
                  setE2eeModalMode(
                    e2eeState.status === 'needs_pin_unlock' ? 'unlock_backup' : 'manage'
                  )
                }
                style={{
                  alignSelf: 'center',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: palette.glassBg,
                  borderColor: palette.glassBorder,
                  borderWidth: 1,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 12,
                  marginBottom: 10,
                }}
              >
                <Lock size={12} color={palette.accent} />
                <Text
                  style={{
                    color: palette.textSecondary,
                    fontSize: scaleFont(11.5),
                    fontFamily,
                    textAlign: 'center',
                  }}
                >
                  {e2eeState.status === 'needs_pin_unlock'
                    ? 'Encrypted · Tap to unlock with Backup PIN'
                    : 'Messages are end-to-end encrypted'}
                </Text>
              </TouchableOpacity>
              {messages.length >= msgLimit ? (
                <TouchableOpacity
                  style={[styles.loadMoreBtn, { borderColor: palette.glassBorder }]}
                  onPress={() => setMsgLimit((n) => n + 80)}
                >
                  <Text style={[styles.loadMoreTxt, { color: palette.accent }]}>
                    Load earlier messages
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => {
            const prev = index > 0 ? displayedMessages[index - 1] : null;
            const next =
              index < displayedMessages.length - 1 ? displayedMessages[index + 1] : null;
            const isMine = item.senderUid === myUid;

            const samePrevSender =
              prev && prev.type !== 'system' && prev.senderUid === item.senderUid;
            const sameNextSender =
              next && next.type !== 'system' && next.senderUid === item.senderUid;

            const timeGapBig =
              !prev || Math.abs(item.createdAt - prev.createdAt) > 2 * 60 * 1000;

            return (
              <MessageBubble
                message={item}
                isMine={isMine}
                isGroup={isGroup}
                showSenderName={!samePrevSender || timeGapBig}
                showAvatar={!isMine && (!sameNextSender || index === displayedMessages.length - 1)}
                showTimestampHeader={!samePrevSender || timeGapBig}
                myUid={myUid}
                otherParticipantCount={Math.max(1, participantUids.length - 1)}
                palette={palette}
                fontFamily={fontFamily}
                scaleFont={scaleFont}
                selectionMode={selectionMode}
                isSelected={selectedIds.includes(item.id)}
                onToggleSelect={toggleSelectMessage}
                onLongPress={(msg) => {
                  if (selectionMode) {
                    toggleSelectMessage(msg);
                  } else {
                    setSelectedMsg(msg);
                  }
                }}
                onSwipeReply={handleReplyFromMessage}
                onPressReplyQuote={(targetId) => {
                  const idx = displayedMessages.findIndex((m) => m.id === targetId);
                  if (idx >= 0) {
                    listRef.current?.scrollToIndex({ index: idx, animated: true });
                  }
                }}
                onToggleReaction={(m, emoji, reacted) =>
                  rhemaChatService.toggleReaction(churchId, roomId, m.id, myUid, emoji, reacted)
                }
                onOpenGallery={(media, idx) => setGalleryModal({ items: media, index: idx })}
                onOpenVideo={setVideoModal}
                onOpenDocument={(doc) =>
                  setDocModal({
                    url: doc.url,
                    name: doc.fileName || 'Document',
                    mimeType: doc.mimeType,
                  })
                }
              />
            );
          }}
          ListFooterComponent={
            <TypingIndicatorBubble
              typingUsers={typingUsers}
              isGroup={isGroup}
              roomAvatar={roomAvatar}
              palette={palette}
              fontFamily={fontFamily}
              scaleFont={scaleFont}
            />
          }
        />

        {iBlockedPeer ? (
          <TouchableOpacity
            style={[
              styles.blockedBanner,
              { backgroundColor: palette.surface, borderColor: palette.glassBorder },
            ]}
            onPress={() =>
              peerUid && rhemaDirectoryService.unblockMember(churchId, myUid, peerUid)
            }
          >
            <Text style={{ color: palette.textSecondary, fontSize: 13 }}>
              You blocked {roomTitle}. Tap to unblock.
            </Text>
          </TouchableOpacity>
        ) : null}

        {selectionMode ? (
          <View
            style={[
              styles.selectBottomBar,
              {
                paddingBottom: Math.max(insets.bottom + 10, 14),
                backgroundColor: palette.glassStrong,
                borderTopColor: palette.glassBorder,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.selectCancelBtn, { borderColor: palette.glassBorder }]}
              onPress={exitSelectionMode}
              activeOpacity={0.8}
            >
              <Text style={{ color: palette.text, fontWeight: '700', fontFamily }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.selectDeleteBtn,
                {
                  backgroundColor: palette.danger,
                  opacity: selectedIds.length > 0 ? 1 : 0.45,
                },
              ]}
              disabled={selectedIds.length === 0}
              onPress={handleDeleteSelected}
              activeOpacity={0.85}
            >
              <Trash2 size={16} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontFamily }}>
                Delete ({selectedIds.length})
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ChatComposerPill
            text={inputText}
            onChangeText={handleTextChange}
            onSendText={handleSendText}
            onPressCamera={handleTakePhoto}
            onPressPlus={() => setAttachmentSheetOpen(true)}
            onStartRecording={handleStartRecording}
            onStopAndSendRecording={handleStopAndSendRecording}
            onCancelRecording={handleCancelRecording}
            isRecording={isRecording}
            recordingSeconds={recordingSeconds}
            uploading={uploading}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            disabled={onlyAdminsCanSend && !amGroupAdmin}
            disabledMessage="Only Group Admins can send messages in this group"
            bottomInset={insets.bottom}
            palette={palette}
            fontFamily={fontFamily}
            scaleFont={scaleFont}
          />
        )}
      </KeyboardAvoidingView>

      {/* Attachment Sheet */}
      <AttachmentSheet
        visible={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
        onPickPhotos={handlePickPhotos}
        onPickVideo={handlePickVideo}
        onTakePhoto={handleTakePhoto}
        onPickDocument={handlePickDocument}
        onRecordVoice={handleStartRecording}
        palette={palette}
        fontFamily={fontFamily}
      />

      {/* Message Long-Press Popup */}
      <ReactionBarPopup
        message={selectedMsg}
        myUid={myUid}
        canDeleteForEveryone={Boolean(
          selectedMsg && (selectedMsg.senderUid === myUid || (isGroup && amGroupAdmin))
        )}
        onClose={() => setSelectedMsg(null)}
        onReact={(emoji, reacted) => {
          if (selectedMsg) {
            rhemaChatService.toggleReaction(
              churchId,
              roomId,
              selectedMsg.id,
              myUid,
              emoji,
              reacted
            );
          }
        }}
        onReply={() => {
          if (selectedMsg) handleReplyFromMessage(selectedMsg);
        }}
        onForward={() => {
          if (selectedMsg) {
            navigation.navigate('ForwardMessage', { message: selectedMsg });
          }
        }}
        onCopy={async () => {
          if (selectedMsg?.text) {
            await Clipboard.setStringAsync(selectedMsg.text);
          }
        }}
        onSelectMultiple={() => {
          if (selectedMsg) {
            enterSelectionMode(selectedMsg.id);
          }
        }}
        onDeleteForMe={() => {
          if (selectedMsg) {
            rhemaChatService.deleteMessageForMe(churchId, roomId, selectedMsg.id, myUid);
          }
        }}
        onDeleteForEveryone={() => {
          if (selectedMsg) {
            const latestId = messages[messages.length - 1]?.id;
            rhemaChatService.deleteMessageForEveryone(
              churchId,
              roomId,
              selectedMsg.id,
              participantUids,
              latestId === selectedMsg.id
            );
          }
        }}
        palette={palette}
        fontFamily={fontFamily}
      />

      {/* Header Overflow Menu */}
      <Modal
        visible={headerMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHeaderMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setHeaderMenuOpen(false)}>
          <View
            style={[
              styles.menuCard,
              {
                backgroundColor: palette.surface,
                borderColor: palette.glassBorder,
                marginTop: topPad + 54,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setHeaderMenuOpen(false);
                openInfoScreen();
              }}
            >
              <Info size={18} color={palette.text} />
              <Text style={[styles.menuTxt, { color: palette.text, fontFamily }]}>
                {isGroup ? 'Group Info & Admins' : 'Member Info'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setHeaderMenuOpen(false);
                enterSelectionMode();
              }}
            >
              <CheckSquare size={18} color={palette.text} />
              <Text style={[styles.menuTxt, { color: palette.text, fontFamily }]}>
                Select Messages
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setHeaderMenuOpen(false);
                setE2eeModalMode(
                  e2eeState.status === 'needs_pin_unlock' ? 'unlock_backup' : 'manage'
                );
              }}
            >
              <Lock size={18} color={palette.accent} />
              <Text style={[styles.menuTxt, { color: palette.text, fontFamily }]}>
                Chat Encryption & PIN
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setHeaderMenuOpen(false);
                rhemaChatService.setInboxFlag(churchId, myUid, roomId, { isMuted: true });
                Alert.alert('Muted', 'Notifications muted for this chat.');
              }}
            >
              <BellOff size={18} color={palette.text} />
              <Text style={[styles.menuTxt, { color: palette.text, fontFamily }]}>
                Mute Chat
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setHeaderMenuOpen(false);
                Alert.alert('Clear Chat', 'Clear all messages from your view?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () =>
                      rhemaChatService.clearChatForMe(
                        churchId,
                        roomId,
                        myUid,
                        messages.map((m) => m.id)
                      ),
                  },
                ]);
              }}
            >
              <Trash2 size={18} color={palette.text} />
              <Text style={[styles.menuTxt, { color: palette.text, fontFamily }]}>
                Clear Chat
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setHeaderMenuOpen(false);
                Alert.alert(
                  'Delete Chat',
                  `Delete this conversation with ${roomTitle} from your Chats list?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete Chat',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await rhemaChatService.deleteChatForMe(
                            churchId,
                            roomId,
                            myUid,
                            messages.length < msgLimit ? messages.map((m) => m.id) : undefined
                          );
                          navigation.goBack();
                        } catch (err: any) {
                          Alert.alert('Delete Failed', err?.message || 'Could not delete chat.');
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Trash2 size={18} color={palette.danger} />
              <Text style={[styles.menuTxt, { color: palette.danger, fontFamily }]}>
                Delete Chat
              </Text>
            </TouchableOpacity>

            {!isGroup && peerUid ? (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setHeaderMenuOpen(false);
                  if (iBlockedPeer) {
                    rhemaDirectoryService.unblockMember(churchId, myUid, peerUid);
                  } else {
                    Alert.alert('Block Member', `Block ${roomTitle}?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Block',
                        style: 'destructive',
                        onPress: () =>
                          rhemaDirectoryService.blockMember(churchId, myUid, {
                            uid: peerUid,
                            name: roomTitle,
                            photoUrl: roomAvatar,
                          }),
                      },
                    ]);
                  }
                }}
              >
                <ShieldBan size={18} color={palette.danger} />
                <Text style={[styles.menuTxt, { color: palette.danger, fontFamily }]}>
                  {iBlockedPeer ? 'Unblock Member' : 'Block Member'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                setHeaderMenuOpen(false);
                setReportModalOpen(true);
              }}
            >
              <Flag size={18} color={palette.danger} />
              <Text style={[styles.menuTxt, { color: palette.danger, fontFamily }]}>
                Report
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Photo Lightbox */}
      <Modal
        visible={Boolean(galleryModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setGalleryModal(null)}
      >
        <View style={styles.lightbox}>
          <TouchableOpacity
            style={[styles.lightboxClose, { top: topPad }]}
            onPress={() => setGalleryModal(null)}
          >
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {galleryModal ? (
            <FlatList
              data={galleryModal.items}
              horizontal
              pagingEnabled
              initialScrollIndex={galleryModal.index}
              getItemLayout={(_, idx) => ({
                length: SCREEN_WIDTH,
                offset: SCREEN_WIDTH * idx,
                index: idx,
              })}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => (
                <View style={styles.lightboxSlide}>
                  <Image
                    source={{ uri: item.url }}
                    style={styles.lightboxImg}
                    resizeMode="contain"
                  />
                </View>
              )}
            />
          ) : null}
        </View>
      </Modal>

      {/* Video Player Modal */}
      <Modal
        visible={Boolean(videoModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setVideoModal(null)}
      >
        <View style={styles.lightbox}>
          <TouchableOpacity
            style={[styles.lightboxClose, { top: topPad }]}
            onPress={() => setVideoModal(null)}
          >
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {videoModal ? (
            <Video
              source={{ uri: videoModal.url }}
              style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.72 }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
          ) : null}
        </View>
      </Modal>

      {/* Reuse Existing Document Viewer */}
      <InAppDocumentViewerModal
        visible={Boolean(docModal)}
        doc={docModal}
        onClose={() => setDocModal(null)}
      />

      {/* Report Modal */}
      <Modal
        visible={reportModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalOpen(false)}
      >
        <Pressable style={styles.reportOverlay} onPress={() => setReportModalOpen(false)}>
          <Pressable
            style={[
              styles.reportCard,
              { backgroundColor: palette.surface, borderColor: palette.glassBorder },
            ]}
          >
            <Text style={[styles.reportTitle, { color: palette.text, fontFamily }]}>
              Report to Church Admins
            </Text>
            {['Inappropriate content', 'Harassment or spam', 'Impersonation', 'Other'].map(
              (r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reasonChip,
                    {
                      borderColor: reportReason === r ? palette.accent : palette.glassBorder,
                      backgroundColor:
                        reportReason === r ? `${palette.accent}20` : 'transparent',
                    },
                  ]}
                  onPress={() => setReportReason(r)}
                >
                  <Text style={{ color: palette.text, fontWeight: '600' }}>{r}</Text>
                </TouchableOpacity>
              )
            )}
            <TextInput
              style={[
                styles.reportInput,
                {
                  color: palette.text,
                  borderColor: palette.glassBorder,
                  backgroundColor: palette.inputBg,
                },
              ]}
              placeholder="Optional details..."
              placeholderTextColor={palette.inputPlaceholder}
              value={reportDetails}
              onChangeText={setReportDetails}
              multiline
            />
            <View style={styles.reportActions}>
              <TouchableOpacity
                style={styles.reportCancel}
                onPress={() => setReportModalOpen(false)}
              >
                <Text style={{ color: palette.textSecondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reportSubmit, { backgroundColor: palette.danger }]}
                onPress={async () => {
                  await rhemaDirectoryService.submitReport(churchId, myUid, myName, {
                    reportedUid: peerUid,
                    reportedName: roomTitle,
                    roomId,
                    reason: reportReason,
                    details: reportDetails,
                  });
                  setReportModalOpen(false);
                  setReportDetails('');
                  Alert.alert('Report Submitted', 'Church administrators will review this.');
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Submit Report</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ChatEncryptionModal
        visible={Boolean(e2eeModalMode)}
        uid={myUid}
        mode={e2eeModalMode || 'manage'}
        isDark={palette.isDark}
        accentColor={palette.accent}
        onClose={() => setE2eeModalMode(null)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    zIndex: 20,
  },
  backBtn: {
    padding: 6,
    marginRight: 2,
  },
  headerProfile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  headerTextCol: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    fontWeight: '700',
  },
  headerSub: {
    fontWeight: '500',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  circleAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectAllPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  selectCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectDeleteBtn: {
    flex: 1.4,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inChatSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 10,
  },
  inChatSearchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  listContent: {
    paddingTop: 10,
    paddingBottom: 16,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  loadMoreTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  blockedBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'flex-end',
    paddingRight: 12,
  },
  menuCard: {
    width: 220,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 6,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuTxt: {
    fontSize: 14,
    fontWeight: '600',
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    right: 20,
    zIndex: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxSlide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImg: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.82,
  },
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  reportCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    gap: 10,
  },
  reportTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  reasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  reportInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 74,
    textAlignVertical: 'top',
  },
  reportActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
  },
  reportCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reportSubmit: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
