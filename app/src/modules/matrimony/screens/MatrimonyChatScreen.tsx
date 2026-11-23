import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  Copy,
  Flag,
  Lock,
  MoreVertical,
  Phone,
  Reply,
  Send,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { e2eeService, E2EEStateSnapshot } from '../../../services/e2eeService';
import ChatEncryptionModal, { ChatEncryptionModalMode } from '../../../components/ChatEncryptionModal';
import MatrimonyReportModal from '../components/MatrimonyReportModal';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';
import { getMatrimonyRoomId, matrimonyChatService } from '../services/matrimonyChatService';
import {
  MatrimonyChatMessage,
  MatrimonyChatMessageReply,
  MatrimonyChatPeer,
  MatrimonyPresenceState,
} from '../types/matrimony';

const WHATSAPP_GREEN = '#00A884';
const TICK_BLUE = '#38BDF8';

function formatTime12h(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const hours24 = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

function formatMessageTime(ms: number): string {
  return formatTime12h(ms);
}

function formatDateHeader(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatLastSeen(presence: MatrimonyPresenceState | null): string {
  if (!presence) return 'Mutual Match';
  if (presence.online) return 'online';
  if (!presence.lastSeen) return 'Mutual Match';
  const d = new Date(presence.lastSeen);
  const now = new Date();
  const timeStr = formatTime12h(presence.lastSeen);
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return `last seen today at ${timeStr}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return `last seen yesterday at ${timeStr}`;
  return `last seen ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} at ${timeStr}`;
}

type TimelineItem =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'msg'; id: string; msg: MatrimonyChatMessage };

export default function MatrimonyChatScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const myUid = user?.uid || '';
  const initialPeer: MatrimonyChatPeer | undefined = route?.params?.peer;
  const targetUid: string = initialPeer?.uid || route?.params?.targetUid || '';
  const initialRoomId: string =
    route?.params?.roomId || (myUid && targetUid ? getMatrimonyRoomId(myUid, targetUid) : '');

  const [roomId, setRoomId] = useState(initialRoomId);
  const [peer, setPeer] = useState<MatrimonyChatPeer | null>(initialPeer || null);
  const [selfInfo, setSelfInfo] = useState<{
    uid: string;
    displayName: string;
    signedProfilePhoto: string | null;
  }>(
    route?.params?.self || {
      uid: myUid,
      displayName: 'Me',
      signedProfilePhoto: null,
    }
  );

  const [roomReady, setRoomReady] = useState(Boolean(initialRoomId && initialPeer));
  const [canMessage, setCanMessage] = useState<boolean>(() => {
    const cachedMem =
      matrimonyApi.getCachedRegistration()?.profile?.membership ||
      matrimonyApi.getCachedStatus()?.profile?.membership;
    if (!cachedMem) return false;
    return (
      cachedMem.status === 'active' &&
      cachedMem.tier !== 'free' &&
      (!cachedMem.validUntilMs || cachedMem.validUntilMs > Date.now())
    );
  });
  const [roomError, setRoomError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MatrimonyChatMessage[]>([]);
  const [presence, setPresence] = useState<MatrimonyPresenceState | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [replyTo, setReplyTo] = useState<MatrimonyChatMessageReply | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<MatrimonyChatMessage | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [e2eeState, setE2eeState] = useState<E2EEStateSnapshot>(() => e2eeService.getState());
  const [e2eeModalMode, setE2eeModalMode] = useState<ChatEncryptionModalMode | null>(null);
  const [iosKbVisible, setIosKbVisible] = useState(false);
  const [composerHeight, setComposerHeight] = useState(() => Math.max(insets.bottom + 8, 12) + 54);

  useEffect(() => {
    setE2eeState(e2eeService.getState());
    const unsub = e2eeService.subscribeState(setE2eeState);
    return () => unsub();
  }, []);

  const listRef = useRef<FlatList<TimelineItem>>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatedKeyboard = useAnimatedKeyboard();

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      if (Platform.OS === 'ios') setIosKbVisible(true);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      if (Platform.OS === 'ios') setIosKbVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!myUid || !targetUid) return;
    let mounted = true;
    matrimonyApi
      .ensureChatRoom(targetUid)
      .then((res) => {
        if (!mounted) return;
        setRoomId(res.roomId);
        setPeer(res.peer);
        if (res.self) setSelfInfo(res.self);
        setCanMessage(res.canMessage !== false);
        setRoomReady(true);
        setRoomError(null);
      })
      .catch((err: any) => {
        if (!mounted) return;
        if (isMatrimonyInactiveError(err)) {
          navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
          return;
        }
        setRoomError(err?.message || 'Unable to open chat room.');
      });
    return () => {
      mounted = false;
    };
  }, [myUid, targetUid]);

  useEffect(() => {
    if (!myUid || !roomId || !targetUid || !roomReady) return;
    matrimonyChatService.startPresenceTracking(myUid, roomId);
    matrimonyChatService.setActiveChatRoom(myUid, roomId);

    const unsubMsgs = matrimonyChatService.subscribeRoomMessages(roomId, myUid, (list) => {
      setMessages(list);
      const unreadIds = list
        .filter((m) => m.senderUid === targetUid && !m.readBy?.[myUid])
        .map((m) => m.id);
      matrimonyChatService.markRoomRead(roomId, myUid, targetUid, unreadIds);
    });
    const unsubPresence = matrimonyChatService.subscribePresence(targetUid, setPresence);
    const unsubTyping = matrimonyChatService.subscribeTyping(roomId, targetUid, setPeerTyping);

    return () => {
      unsubMsgs();
      unsubPresence();
      unsubTyping();
      matrimonyChatService.setTyping(roomId, myUid, false);
      matrimonyChatService.setActiveChatRoom(myUid, null);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [myUid, roomId, targetUid, roomReady]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    let lastDate = '';
    messages.forEach((m) => {
      const label = formatDateHeader(m.createdAt);
      if (label !== lastDate) {
        items.push({ kind: 'date', id: `date-${label}-${m.createdAt}`, label });
        lastDate = label;
      }
      items.push({ kind: 'msg', id: m.id, msg: m });
    });
    return items;
  }, [messages]);

  useEffect(() => {
    if (timeline.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [timeline.length]);

  const handleTextChange = (txt: string) => {
    setInputText(txt);
    if (!roomId || !myUid) return;
    const active = txt.trim().length > 0;
    matrimonyChatService.setTyping(roomId, myUid, active);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (active) {
      typingTimerRef.current = setTimeout(() => {
        matrimonyChatService.setTyping(roomId, myUid, false);
      }, 2400);
    }
  };

  const handleSendText = async (overrideText?: string) => {
    if (!canMessage) {
      navigation.navigate('MatrimonyUpgrade');
      return;
    }
    const textToSend = (overrideText ?? inputText).trim();
    if (!textToSend || !roomId || !myUid || !peer || sending) return;
    if (!overrideText) setInputText('');
    const activeReply = replyTo;
    setReplyTo(null);
    setSending(true);
    try {
      await matrimonyChatService.sendMessage({
        roomId,
        myUid,
        peerUid: peer.uid,
        myName: selfInfo.displayName,
        myPhoto: selfInfo.signedProfilePhoto,
        peerName: peer.displayName,
        peerPhoto: peer.signedProfilePhoto,
        text: textToSend,
        type: 'text',
        replyTo: activeReply,
        peerOnline: presence?.online === true,
      });
    } catch (err: any) {
      if (err?.message === 'PIN_UNLOCK_REQUIRED') {
        if (!overrideText) setInputText(textToSend);
        setReplyTo(activeReply);
        setE2eeModalMode('unlock_backup');
        return;
      }
      Alert.alert('Message Not Sent', err?.message || 'Unable to deliver message right now.');
    } finally {
      setSending(false);
    }
  };

  const handlePickAndSendImage = async () => {
    if (!canMessage) {
      navigation.navigate('MatrimonyUpgrade');
      return;
    }
    if (!roomId || !myUid || !peer || uploadingImage) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Needed', 'Please allow photo library access to share images.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      const asset = res.assets[0];
      setUploadingImage(true);
      const imageUrl = await matrimonyApi.uploadChatImage(
        asset.uri,
        asset.mimeType || 'image/jpeg'
      );
      await matrimonyChatService.sendMessage({
        roomId,
        myUid,
        peerUid: peer.uid,
        myName: selfInfo.displayName,
        myPhoto: selfInfo.signedProfilePhoto,
        peerName: peer.displayName,
        peerPhoto: peer.signedProfilePhoto,
        text: inputText.trim(),
        type: 'image',
        imageUrl,
        replyTo,
        peerOnline: presence?.online === true,
      });
      setInputText('');
      setReplyTo(null);
    } catch (err: any) {
      if (err?.message === 'PIN_UNLOCK_REQUIRED') {
        setE2eeModalMode('unlock_backup');
        return;
      }
      Alert.alert('Upload Failed', err?.message || 'Unable to send image right now.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleOpenPeerProfile = async () => {
    if (!peer) return;
    setHeaderMenuOpen(false);
    try {
      const res = await matrimonyApi.getMatches({ tab: 'all', matchBasis: 'all_filters' });
      const foundIdx = (res.matches || []).findIndex((m) => m.uid === peer.uid);
      if (foundIdx >= 0) {
        navigation.navigate('MatrimonyMatchDetail', {
          matches: res.matches,
          initialIndex: foundIdx,
          tabTitle: 'Mutual Match',
        });
        return;
      }
    } catch {
      // Fallback via interests hub accepted list
    }
    try {
      const hub = await matrimonyApi.getInterestsHub();
      const combined = [...(hub.received || []), ...(hub.sent || [])].map((e) => e.candidate);
      const idx = combined.findIndex((c) => c.uid === peer.uid);
      if (idx >= 0) {
        navigation.navigate('MatrimonyMatchDetail', {
          matches: combined,
          initialIndex: idx,
          tabTitle: 'Mutual Match',
        });
      }
    } catch {
      Alert.alert('Profile', `${peer.displayName} (${peer.profileCode})`);
    }
  };

  const handleCallPeer = () => {
    if (peer?.contactPhone) {
      Linking.openURL(`tel:${peer.contactPhone}`).catch(() => {
        Alert.alert('Call Failed', 'Could not open phone dialer.');
      });
      return;
    }
    Alert.alert('Phone Unavailable', 'Phone number is not listed on this profile.');
  };

  const canvasBg = isDark ? '#0B141A' : '#EFEAE2';
  const myBubbleBg = isDark ? '#005C4B' : '#DCF8C6';
  const peerBubbleBg = isDark ? '#202C33' : '#FFFFFF';
  const headerSurface = isDark ? '#1F2C34' : '#FFFFFF';
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  const statusSubtitle = peerTyping ? 'typing...' : formatLastSeen(presence);
  const closedBottomPadding = Math.max(insets.bottom + 8, 12);
  const androidComposerStyle = useAnimatedStyle(() => {
    const lift = Math.max(0, animatedKeyboard.height.value + 8 - closedBottomPadding);
    return {
      transform: [{ translateY: -lift }],
    };
  }, [closedBottomPadding]);
  const androidListWrapStyle = useAnimatedStyle(() => {
    const lift = Math.max(0, animatedKeyboard.height.value + 8 - closedBottomPadding);
    return {
      marginBottom: composerHeight + lift,
    };
  }, [closedBottomPadding, composerHeight]);

  const renderTimelineItem = ({ item }: { item: TimelineItem }) => {
    if (item.kind === 'date') {
      return (
        <View style={styles.datePillWrap}>
          <View
            style={[
              styles.datePill,
              { backgroundColor: isDark ? '#182229' : 'rgba(255,255,255,0.92)' },
            ]}
          >
            <Text style={[styles.datePillText, { color: colors.textSecondary, fontFamily }]}>
              {item.label}
            </Text>
          </View>
        </View>
      );
    }

    const m = item.msg;
    const isMe = m.senderUid === myUid;
    const isRead = Boolean(peer && m.readBy?.[peer.uid]);
    const isDelivered = Boolean(isRead || (peer && m.deliveredBy?.[peer.uid]));

    return (
      <View style={[styles.bubbleRow, isMe ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => setSelectedMsg(m)}
          delayLongPress={260}
          style={[
            styles.bubble,
            isMe ? styles.bubbleMine : styles.bubblePeer,
            { backgroundColor: isMe ? myBubbleBg : peerBubbleBg },
          ]}
        >
          {m.deletedForEveryone ? (
            <Text
              style={[
                styles.deletedText,
                { color: isDark ? '#94A3B8' : '#64748B', fontFamily },
              ]}
            >
              🚫 This message was deleted
            </Text>
          ) : (
            <>
              {m.replyTo ? (
                <View
                  style={[
                    styles.replyQuoteBox,
                    {
                      backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.05)',
                      borderLeftColor: m.replyTo.senderUid === myUid ? WHATSAPP_GREEN : '#8B5CF6',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.replyQuoteName,
                      {
                        color: m.replyTo.senderUid === myUid ? WHATSAPP_GREEN : '#8B5CF6',
                        fontFamily,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {m.replyTo.senderUid === myUid ? 'You' : peer?.displayName || 'Match'}
                  </Text>
                  <Text
                    style={[
                      styles.replyQuoteText,
                      { color: isDark ? '#CBD5E1' : '#475569', fontFamily },
                    ]}
                    numberOfLines={2}
                  >
                    {m.replyTo.text || '📷 Photo'}
                  </Text>
                </View>
              ) : null}

              {m.type === 'image' && m.imageUrl ? (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => setPreviewImageUrl(m.imageUrl || null)}
                  style={styles.bubbleImageWrap}
                >
                  <Image
                    source={{ uri: m.imageUrl }}
                    style={styles.bubbleImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ) : null}

              {m.text ? (
                <Text
                  style={[
                    styles.msgText,
                    {
                      color: isDark ? '#F1F5F9' : '#111B21',
                      fontFamily,
                      fontSize: scaleFont(15),
                    },
                  ]}
                >
                  {m.text}
                </Text>
              ) : null}
            </>
          )}

          <View style={styles.msgMetaRow}>
            <Text
              style={[
                styles.msgTime,
                { color: isDark ? 'rgba(255,255,255,0.65)' : '#667781', fontFamily },
              ]}
            >
              {formatMessageTime(m.createdAt)}
            </Text>
            {isMe && !m.deletedForEveryone && (
              isRead ? (
                <CheckCheck size={15} color={TICK_BLUE} strokeWidth={2.3} />
              ) : isDelivered ? (
                <CheckCheck
                  size={15}
                  color={isDark ? 'rgba(255,255,255,0.65)' : '#667781'}
                  strokeWidth={2.1}
                />
              ) : (
                <Check
                  size={14}
                  color={isDark ? 'rgba(255,255,255,0.65)' : '#667781'}
                  strokeWidth={2.1}
                />
              )
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: headerSurface }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={headerSurface} />

      {/* WhatsApp-Style Chat Header */}
      <View
        style={[
          styles.chatHeader,
          { backgroundColor: headerSurface, borderBottomColor: dividerColor },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.peerHeaderBtn}
          activeOpacity={0.8}
          onPress={handleOpenPeerProfile}
        >
          <View style={styles.headerAvatarBox}>
            {peer?.signedProfilePhoto ? (
              <Image
                source={{ uri: peer.signedProfilePhoto }}
                style={styles.headerAvatarImg}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.headerAvatarPlaceholder,
                  { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                ]}
              >
                <User size={19} color="#94A3B8" />
              </View>
            )}
            {presence?.online && <View style={[styles.headerOnlineDot, { borderColor: headerSurface }]} />}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.headerName, { color: colors.text, fontFamily }]} numberOfLines={1}>
              {peer?.displayName || 'Matrimony Chat'}
            </Text>
            <Text
              style={[
                styles.headerStatus,
                {
                  color:
                    peerTyping || presence?.online ? WHATSAPP_GREEN : colors.textSecondary,
                  fontWeight: peerTyping ? '700' : '500',
                  fontFamily,
                },
              ]}
              numberOfLines={1}
            >
              {statusSubtitle}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleCallPeer}
            style={styles.headerIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Phone size={19} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setHeaderMenuOpen(true)}
            style={styles.headerIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreVertical size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Chat Canvas & Responsive Keyboard Layout */}
      <View style={[styles.canvas, { backgroundColor: canvasBg, overflow: 'hidden' }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          enabled={Platform.OS === 'ios'}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <Animated.View style={[{ flex: 1 }, Platform.OS === 'android' && androidListWrapStyle]}>
        {roomError ? (
          <View style={styles.centerBox}>
            <Text style={[styles.errorText, { color: colors.text, fontFamily }]}>{roomError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.retryBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : !roomReady ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={WHATSAPP_GREEN} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={timeline}
            keyExtractor={(item) => item.id}
            renderItem={renderTimelineItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.privacyBannerWrap}>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() =>
                    setE2eeModalMode(
                      e2eeState.status === 'needs_pin_unlock' ? 'unlock_backup' : 'manage'
                    )
                  }
                  style={[
                    styles.privacyBanner,
                    { backgroundColor: isDark ? '#182229' : '#FFF3CD' },
                  ]}
                >
                  <Lock size={12} color={isDark ? '#FBBF24' : '#856404'} />
                  <Text
                    style={[
                      styles.privacyBannerText,
                      { color: isDark ? '#FDE68A' : '#856404', fontFamily },
                    ]}
                  >
                    {e2eeState.status === 'needs_pin_unlock'
                      ? 'End-to-end encrypted chat is locked. Tap here to enter Backup PIN.'
                      : 'Messages in this Rhema Matrimony mutual match chat are end-to-end encrypted.'}
                  </Text>
                </TouchableOpacity>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.emptyChatBox}>
                <Text style={[styles.emptyChatTitle, { color: colors.text, fontFamily }]}>
                  Start a respectful conversation 🙏
                </Text>
                <Text style={[styles.emptyChatSub, { color: colors.textSecondary, fontFamily }]}>
                  Tap a greeting below or type your own message.
                </Text>
                <View style={styles.starterChipsWrap}>
                  {[
                    'Praise the Lord! 🙏',
                    'Hi! Happy to connect with you 😊',
                    'Would love to know more about your family & faith.',
                  ].map((phrase) => (
                    <TouchableOpacity
                      key={phrase}
                      style={[
                        styles.starterChip,
                        { backgroundColor: isDark ? '#202C33' : '#FFFFFF' },
                      ]}
                      onPress={() => handleSendText(phrase)}
                    >
                      <Text style={[styles.starterChipText, { color: colors.text, fontFamily }]}>
                        {phrase}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            }
          />
        )}
        </Animated.View>

        {/* GPU-Translated Composer Dock (prevents layout flicker/blinking on Android IME transition) */}
        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - composerHeight) > 1) {
              setComposerHeight(h);
            }
          }}
          style={[
            Platform.OS === 'android' ? styles.composerDockAndroid : undefined,
            { backgroundColor: canvasBg },
            Platform.OS === 'android' && androidComposerStyle,
          ]}
        >
        {/* Quoted Reply Preview Bar */}
        {replyTo && (
          <View
            style={[
              styles.replyPreviewBar,
              {
                backgroundColor: isDark ? '#1F2C34' : '#FFFFFF',
                borderTopColor: dividerColor,
              },
            ]}
          >
            <View
              style={[
                styles.replyBarAccent,
                { backgroundColor: replyTo.senderUid === myUid ? WHATSAPP_GREEN : '#8B5CF6' },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.replyQuoteName,
                  {
                    color: replyTo.senderUid === myUid ? WHATSAPP_GREEN : '#8B5CF6',
                    fontFamily,
                  },
                ]}
              >
                {replyTo.senderUid === myUid ? 'You' : peer?.displayName || 'Match'}
              </Text>
              <Text
                style={[styles.replyQuoteText, { color: colors.textSecondary, fontFamily }]}
                numberOfLines={1}
              >
                {replyTo.text || '📷 Photo'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 4 }}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Sticky WhatsApp Input Composer (or Read-Only Lock Banner for Free / Expired members) */}
        {!canMessage && roomReady ? (
          <View
            style={[
              styles.composerRow,
              {
                paddingBottom: closedBottomPadding,
                backgroundColor: isDark ? '#182229' : '#FFF7ED',
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : '#FDBA74',
                paddingHorizontal: 14,
                paddingTop: 10,
                gap: 10,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: isDark ? '#FDE68A' : '#9A3412',
                  fontSize: 12.5,
                  fontWeight: '700',
                  fontFamily,
                }}
              >
                Read-only chat history
              </Text>
              <Text
                style={{
                  color: isDark ? '#CBD5E1' : '#7C2D12',
                  fontSize: 11.5,
                  fontFamily,
                }}
              >
                Upgrade to Silver, Gold, or Platinum to send personalised messages.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('MatrimonyUpgrade')}
              activeOpacity={0.85}
              style={{
                backgroundColor: '#D97706',
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 20,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 12.5, fontFamily }}>
                Upgrade
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View
          style={[
            styles.composerRow,
            {
              paddingBottom:
                Platform.OS === 'ios'
                  ? iosKbVisible
                    ? 8
                    : closedBottomPadding
                  : closedBottomPadding,
            },
          ]}
        >
          <View
            style={[
              styles.inputPill,
              { backgroundColor: isDark ? '#1F2C34' : '#FFFFFF' },
            ]}
          >
            <TextInput
              value={inputText}
              onChangeText={handleTextChange}
              placeholder="Message"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={1500}
              style={[styles.textInput, { color: colors.text, fontFamily }]}
            />
            <TouchableOpacity
              onPress={handlePickAndSendImage}
              disabled={uploadingImage}
              style={styles.attachBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {uploadingImage ? (
                <ActivityIndicator size="small" color={WHATSAPP_GREEN} />
              ) : (
                <Camera size={20} color={colors.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.sendCircleBtn,
              {
                backgroundColor:
                  inputText.trim().length > 0 ? WHATSAPP_GREEN : isDark ? '#334155' : '#94A3B8',
              },
            ]}
            disabled={!inputText.trim() || sending || !roomReady}
            activeOpacity={0.85}
            onPress={() => handleSendText()}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Send size={19} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
        )}
        </Animated.View>
        </KeyboardAvoidingView>
      </View>

      {/* Message Long-Press Action Modal */}
      <Modal
        visible={selectedMsg !== null}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setSelectedMsg(null)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setSelectedMsg(null)}
          />
          {selectedMsg ? (
            <View
              style={[
                styles.msgSheetCard,
                {
                  backgroundColor: headerSurface,
                  paddingBottom: Math.max(insets.bottom + 14, 22),
                },
              ]}
            >
              {!selectedMsg.deletedForEveryone && (
                <TouchableOpacity
                  style={styles.msgSheetBtn}
                  onPress={() => {
                    setReplyTo({
                      id: selectedMsg.id,
                      senderUid: selectedMsg.senderUid,
                      text: selectedMsg.text || (selectedMsg.type === 'image' ? '📷 Photo' : ''),
                    });
                    setSelectedMsg(null);
                  }}
                >
                  <Reply size={19} color={colors.text} />
                  <Text style={[styles.msgSheetBtnText, { color: colors.text, fontFamily }]}>
                    Reply
                  </Text>
                </TouchableOpacity>
              )}

              {Boolean(selectedMsg.text) && !selectedMsg.deletedForEveryone && (
                <TouchableOpacity
                  style={styles.msgSheetBtn}
                  onPress={async () => {
                    await Clipboard.setStringAsync(selectedMsg.text);
                    setSelectedMsg(null);
                  }}
                >
                  <Copy size={19} color={colors.text} />
                  <Text style={[styles.msgSheetBtnText, { color: colors.text, fontFamily }]}>
                    Copy Text
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.msgSheetBtn}
                onPress={() => {
                  const msg = selectedMsg;
                  setSelectedMsg(null);
                  matrimonyChatService.deleteMessageForMe(roomId, msg.id, myUid).catch(() => {});
                }}
              >
                <Trash2 size={19} color={colors.textSecondary} />
                <Text style={[styles.msgSheetBtnText, { color: colors.text, fontFamily }]}>
                  Delete for me
                </Text>
              </TouchableOpacity>

              {selectedMsg.senderUid === myUid && !selectedMsg.deletedForEveryone && (
                <TouchableOpacity
                  style={styles.msgSheetBtn}
                  onPress={() => {
                    const msg = selectedMsg;
                    setSelectedMsg(null);
                    const isLatest = messages[messages.length - 1]?.id === msg.id;
                    matrimonyChatService
                      .deleteMessageForEveryone(roomId, myUid, targetUid, msg.id, isLatest)
                      .catch(() => {});
                  }}
                >
                  <Trash2 size={19} color="#DC2626" />
                  <Text style={[styles.msgSheetBtnText, { color: '#DC2626', fontFamily }]}>
                    Delete for everyone
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Header Overflow Menu */}
      <Modal
        visible={headerMenuOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setHeaderMenuOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setHeaderMenuOpen(false)}
          />
          <View
            style={[
              styles.msgSheetCard,
              {
                backgroundColor: headerSurface,
                paddingBottom: Math.max(insets.bottom + 14, 22),
              },
            ]}
          >
            <TouchableOpacity style={styles.msgSheetBtn} onPress={handleOpenPeerProfile}>
              <User size={19} color={colors.text} />
              <Text style={[styles.msgSheetBtnText, { color: colors.text, fontFamily }]}>
                View Profile
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.msgSheetBtn}
              onPress={() => {
                setHeaderMenuOpen(false);
                setTimeout(
                  () =>
                    setE2eeModalMode(
                      e2eeState.status === 'needs_pin_unlock' ? 'unlock_backup' : 'manage'
                    ),
                  120
                );
              }}
            >
              <Lock size={19} color={WHATSAPP_GREEN} />
              <Text style={[styles.msgSheetBtnText, { color: colors.text, fontFamily }]}>
                Chat Encryption & PIN
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.msgSheetBtn}
              onPress={() => {
                setHeaderMenuOpen(false);
                setTimeout(() => setReportModalOpen(true), 120);
              }}
            >
              <Flag size={19} color="#D97706" />
              <Text style={[styles.msgSheetBtnText, { color: '#D97706', fontFamily }]}>
                Report Profile
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.msgSheetBtn}
              onPress={() => {
                setHeaderMenuOpen(false);
                Alert.alert('Clear Chat', 'Clear messages in this chat for your device?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      matrimonyChatService
                        .clearChatForMe(
                          roomId,
                          myUid,
                          messages.map((m) => m.id)
                        )
                        .catch(() => {});
                    },
                  },
                ]);
              }}
            >
              <Trash2 size={19} color="#DC2626" />
              <Text style={[styles.msgSheetBtnText, { color: '#DC2626', fontFamily }]}>
                Clear Chat
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Fullscreen Image Preview */}
      <Modal
        visible={previewImageUrl !== null}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setPreviewImageUrl(null)}
      >
        <View style={styles.imgLightbox}>
          <TouchableOpacity
            onPress={() => setPreviewImageUrl(null)}
            style={[styles.imgCloseBtn, { top: Math.max(insets.top + 12, 24) }]}
          >
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {previewImageUrl ? (
            <Image
              source={{ uri: previewImageUrl }}
              style={styles.imgFull}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      {peer ? (
        <MatrimonyReportModal
          visible={reportModalOpen}
          targetUid={peer.uid}
          targetName={peer.displayName}
          targetCode={peer.profileCode}
          source="chat"
          onClose={() => setReportModalOpen(false)}
          onReported={(hidden) => {
            if (hidden) {
              navigation.goBack();
            }
          }}
        />
      ) : null}

      <ChatEncryptionModal
        visible={Boolean(e2eeModalMode)}
        uid={myUid}
        mode={e2eeModalMode || 'manage'}
        isDark={isDark}
        accentColor={WHATSAPP_GREEN}
        onClose={() => setE2eeModalMode(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { padding: 4 },
  peerHeaderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatarBox: {
    width: 40,
    height: 40,
    position: 'relative',
  },
  headerAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerOnlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#22C55E',
    borderWidth: 1.5,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerStatus: {
    fontSize: 12,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconBtn: {
    padding: 6,
  },
  canvas: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexGrow: 1,
  },
  privacyBannerWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    maxWidth: '92%',
  },
  privacyBannerText: {
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
  },
  datePillWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  datePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  datePillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  bubbleRow: {
    marginVertical: 3,
    flexDirection: 'row',
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    minWidth: 82,
    paddingHorizontal: 11,
    paddingTop: 7,
    paddingBottom: 6,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMine: {
    borderTopRightRadius: 4,
  },
  bubblePeer: {
    borderTopLeftRadius: 4,
  },
  replyQuoteBox: {
    borderLeftWidth: 3.5,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 5,
  },
  replyQuoteName: {
    fontSize: 12,
    fontWeight: '800',
  },
  replyQuoteText: {
    fontSize: 12.5,
    marginTop: 1,
  },
  bubbleImageWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
  },
  bubbleImage: {
    width: 220,
    height: 220,
    borderRadius: 10,
  },
  msgText: {
    lineHeight: 21,
  },
  deletedText: {
    fontSize: 13.5,
    fontStyle: 'italic',
  },
  msgMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  msgTime: {
    fontSize: 10.5,
  },
  emptyChatBox: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyChatTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  emptyChatSub: {
    fontSize: 13,
    textAlign: 'center',
  },
  starterChipsWrap: {
    marginTop: 10,
    gap: 8,
    alignItems: 'center',
  },
  starterChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  starterChipText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  replyBarAccent: {
    width: 4,
    height: '100%',
    minHeight: 32,
    borderRadius: 2,
  },
  composerDockAndroid: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 8,
  },
  inputPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 46,
    maxHeight: 120,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 15.5,
    lineHeight: 20,
    paddingTop: 2,
    paddingBottom: 2,
    textAlignVertical: 'center',
    maxHeight: 96,
  },
  attachBtn: {
    paddingLeft: 10,
    paddingVertical: 2,
  },
  sendCircleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 3,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: WHATSAPP_GREEN,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  msgSheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 4,
  },
  msgSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  msgSheetBtnText: {
    fontSize: 15.5,
    fontWeight: '700',
  },
  imgLightbox: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgCloseBtn: {
    position: 'absolute',
    right: 18,
    zIndex: 10,
    padding: 8,
  },
  imgFull: {
    width: '100%',
    height: '85%',
  },
});
