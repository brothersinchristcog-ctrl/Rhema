import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Ban,
  Check,
  CheckCheck,
  CornerUpRight,
  FileText,
  Play,
  Video as VideoIcon,
} from 'lucide-react-native';
import { ChatThemePalette } from '../constants/chatTheme';
import { ChatMediaAttachment, ChatMessage } from '../types/chat';
import AvatarWithStatus from './AvatarWithStatus';
import FannedPhotoStack from './FannedPhotoStack';
import VoiceMessagePlayer from './VoiceMessagePlayer';

export function formatTime12h(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const h24 = d.getHours();
  const min = String(d.getMinutes()).padStart(2, '0');
  const period = h24 >= 12 ? 'PM' : 'AM';
  return `${h24 % 12 || 12}:${min}${period}`;
}

interface MessageBubbleProps {
  message: ChatMessage;
  isMine: boolean;
  isGroup: boolean;
  showSenderName: boolean;
  showAvatar: boolean;
  showTimestampHeader: boolean;
  myUid: string;
  otherParticipantCount: number;
  palette: ChatThemePalette;
  fontFamily?: string;
  scaleFont: (s: number) => number;
  onLongPress: (msg: ChatMessage) => void;
  onSwipeReply: (msg: ChatMessage) => void;
  onPressReplyQuote: (msgId: string) => void;
  onToggleReaction: (msg: ChatMessage, emoji: string, reacted: boolean) => void;
  onOpenGallery: (media: ChatMediaAttachment[], index: number) => void;
  onOpenVideo: (attachment: ChatMediaAttachment) => void;
  onOpenDocument: (attachment: ChatMediaAttachment) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (msg: ChatMessage) => void;
}

export default function MessageBubble({
  message,
  isMine,
  isGroup,
  showSenderName,
  showAvatar,
  showTimestampHeader,
  myUid,
  otherParticipantCount,
  palette,
  fontFamily,
  scaleFont,
  onLongPress,
  onSwipeReply,
  onPressReplyQuote,
  onToggleReaction,
  onOpenGallery,
  onOpenVideo,
  onOpenDocument,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: MessageBubbleProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const triggeredReply = useRef(false);
  const selectionModeRef = useRef(selectionMode);
  selectionModeRef.current = selectionMode;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !selectionModeRef.current &&
        message.type !== 'system' &&
        !message.deletedForEveryone &&
        Math.abs(g.dx) > 14 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) {
          const clamped = Math.min(g.dx, 64);
          translateX.setValue(clamped);
          if (clamped >= 48 && !triggeredReply.current) {
            triggeredReply.current = true;
          }
        }
      },
      onPanResponderRelease: () => {
        if (triggeredReply.current) {
          triggeredReply.current = false;
          onSwipeReply(message);
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
        }).start();
      },
      onPanResponderTerminate: () => {
        triggeredReply.current = false;
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // System event pill
  if (message.type === 'system') {
    return (
      <View style={styles.systemWrap}>
        <View style={[styles.systemPill, { backgroundColor: palette.systemPillBg }]}>
          <Text
            style={[
              styles.systemText,
              { color: palette.systemPillText, fontFamily, fontSize: scaleFont(11.5) },
            ]}
          >
            {message.text}
          </Text>
        </View>
      </View>
    );
  }

  const deliveredCount = Object.keys(message.deliveredTo || {}).filter((u) => u !== myUid).length;
  const readCount = Object.keys(message.readBy || {}).filter((u) => u !== myUid).length;
  const isRead = otherParticipantCount > 0 && readCount >= (isGroup ? 1 : otherParticipantCount);
  const isDelivered = isRead || deliveredCount > 0;

  const reactionEntries = Object.entries(message.reactions || {})
    .map(([emoji, users]) => {
      const uids = Object.keys(users || {}).filter((u) => users[u]);
      return { emoji, count: uids.length, reactedByMe: Boolean(users?.[myUid]) };
    })
    .filter((r) => r.count > 0);

  const isMultiPhoto =
    (message.type === 'image' || message.type === 'image_group') &&
    (message.media?.length || 0) >= 2;
  const isSinglePhoto =
    (message.type === 'image' || message.type === 'image_group') &&
    (message.media?.length || 0) === 1;
  const videoMedia = message.type === 'video' ? message.media?.[0] : undefined;
  const audioMedia = message.type === 'audio' ? message.media?.[0] : undefined;
  const docMedia = message.type === 'document' ? message.media?.[0] : undefined;

  const bubbleBg = isMine ? palette.outgoingBubbleBg : palette.incomingBubbleBg;
  const bubbleBorder = isMine ? palette.outgoingBubbleBorder : palette.incomingBubbleBorder;
  const textColor = isMine ? palette.outgoingText : palette.incomingText;
  const secondaryOnBubble = isMine
    ? 'rgba(255, 255, 255, 0.72)'
    : palette.textSecondary;

  const rowHighlightBg =
    selectionMode && isSelected
      ? palette.isDark
        ? 'rgba(56, 189, 248, 0.14)'
        : 'rgba(37, 99, 235, 0.08)'
      : 'transparent';

  const rowInner = (
    <Animated.View
      {...panResponder.panHandlers}
      pointerEvents={selectionMode ? 'none' : 'auto'}
      style={[
        styles.row,
        isMine ? styles.rowMine : styles.rowTheirs,
        selectionMode && { flex: 1 },
        { transform: [{ translateX }] },
      ]}
    >
      {/* Incoming left avatar column (shown beside the last message of a burst, matching mockup) */}
      {!isMine ? (
        <View style={styles.avatarCol}>
          {showAvatar ? (
            <AvatarWithStatus
              uri={message.senderAvatar}
              name={message.senderName}
              size={28}
              dotBorderColor={palette.bg}
            />
          ) : null}
        </View>
      ) : null}

      <View style={[styles.bubbleCol, isMine ? styles.alignEnd : styles.alignStart]}>
          {/* Multi-photo fanned card sits directly on canvas like the mockup */}
          {isMultiPhoto && !message.deletedForEveryone && message.media ? (
            <TouchableOpacity
              onLongPress={() => onLongPress(message)}
              activeOpacity={0.95}
              style={styles.fannedContainer}
            >
              {isGroup && showSenderName && !isMine ? (
                <Text
                  style={[
                    styles.senderLabel,
                    { color: palette.textSecondary, fontFamily, fontSize: scaleFont(11.5), marginBottom: 4 },
                  ]}
                >
                  {message.senderName}
                </Text>
              ) : null}
              <FannedPhotoStack
                media={message.media}
                borderColor={palette.glassBorder}
                onPressPhoto={(idx) => onOpenGallery(message.media!, idx)}
              />
              {message.text ? (
                <View
                  style={[
                    styles.captionBubble,
                    { backgroundColor: bubbleBg, borderColor: bubbleBorder },
                  ]}
                >
                  <Text style={[styles.msgText, { color: textColor, fontFamily, fontSize: scaleFont(14) }]}>
                    {message.text}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.86}
              onLongPress={() => onLongPress(message)}
              style={[
                styles.bubble,
                {
                  backgroundColor: bubbleBg,
                  borderColor: bubbleBorder,
                  borderBottomRightRadius: isMine ? 8 : 20,
                  borderBottomLeftRadius: !isMine ? 8 : 20,
                },
              ]}
            >
              {message.forwarded && !message.deletedForEveryone ? (
                <View style={styles.forwardedRow}>
                  <CornerUpRight size={11} color={secondaryOnBubble} />
                  <Text style={[styles.forwardedText, { color: secondaryOnBubble, fontFamily }]}>
                    Forwarded
                  </Text>
                </View>
              ) : null}

              {isGroup && showSenderName && !isMine && !message.deletedForEveryone ? (
                <Text
                  style={[
                    styles.senderLabel,
                    { color: secondaryOnBubble, fontFamily, fontSize: scaleFont(11.5) },
                  ]}
                  numberOfLines={1}
                >
                  {message.senderName}
                </Text>
              ) : null}

              {/* Reply Preview Quote */}
              {message.replyTo && !message.deletedForEveryone ? (
                <TouchableOpacity
                  style={[
                    styles.replyBox,
                    {
                      borderLeftColor: palette.accent,
                      backgroundColor: isMine
                        ? 'rgba(0,0,0,0.22)'
                        : palette.isDark
                        ? 'rgba(0,0,0,0.28)'
                        : 'rgba(15,23,42,0.06)',
                    },
                  ]}
                  onPress={() => onPressReplyQuote(message.replyTo!.msgId)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.replySender, { color: palette.accent }]} numberOfLines={1}>
                    {message.replyTo.senderName}
                  </Text>
                  <Text style={[styles.replySnippet, { color: secondaryOnBubble }]} numberOfLines={1}>
                    {message.replyTo.snippet}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {message.deletedForEveryone ? (
                <View style={styles.deletedRow}>
                  <Ban size={13} color={secondaryOnBubble} style={{ marginRight: 6 }} />
                  <Text
                    style={[
                      styles.deletedText,
                      { color: secondaryOnBubble, fontFamily, fontSize: scaleFont(13.5) },
                    ]}
                  >
                    This message was deleted
                  </Text>
                </View>
              ) : (
                <>
                  {isSinglePhoto && message.media ? (
                    <View style={{ marginBottom: message.text ? 6 : 2 }}>
                      <FannedPhotoStack
                        media={message.media}
                        borderColor={palette.glassBorder}
                        onPressPhoto={(idx) => onOpenGallery(message.media!, idx)}
                      />
                    </View>
                  ) : null}

                  {videoMedia ? (
                    <TouchableOpacity
                      style={[styles.videoCard, { borderColor: palette.glassBorder }]}
                      onPress={() => onOpenVideo(videoMedia)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.videoPlayOverlay}>
                        <Play size={22} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 2 }} />
                      </View>
                      <View style={styles.videoMeta}>
                        <VideoIcon size={13} color="#FFFFFF" />
                        <Text style={styles.videoLabel} numberOfLines={1}>
                          {videoMedia.fileName || 'Video clip'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : null}

                  {audioMedia ? (
                    <VoiceMessagePlayer
                      uri={audioMedia.url}
                      durationMs={audioMedia.durationMs}
                      textColor={textColor}
                      accentColor={palette.accent}
                      mutedColor={secondaryOnBubble}
                    />
                  ) : null}

                  {docMedia ? (
                    <TouchableOpacity
                      style={[
                        styles.docCard,
                        {
                          backgroundColor: isMine
                            ? 'rgba(0,0,0,0.22)'
                            : palette.isDark
                            ? 'rgba(0,0,0,0.26)'
                            : 'rgba(15,23,42,0.06)',
                        },
                      ]}
                      onPress={() => onOpenDocument(docMedia)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.docIconWrap, { backgroundColor: palette.accent }]}>
                        <FileText size={16} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.docTitle, { color: textColor, fontFamily }]}
                          numberOfLines={1}
                        >
                          {docMedia.fileName || 'Document'}
                        </Text>
                        <Text style={[styles.docSub, { color: secondaryOnBubble }]}>
                          Tap to view document
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : null}

                  {message.text ? (
                    <Text
                      style={[
                        styles.msgText,
                        { color: textColor, fontFamily, fontSize: scaleFont(14.5) },
                      ]}
                    >
                      {message.text}
                    </Text>
                  ) : null}
                </>
              )}

              {/* Meta Row: timestamp + delivery/read ticks */}
              <View style={styles.metaRow}>
                <Text style={[styles.metaTime, { color: secondaryOnBubble }]}>
                  {formatTime12h(message.createdAt)}
                </Text>
                {isMine && !message.deletedForEveryone ? (
                  <View style={{ marginLeft: 4 }}>
                    {isRead ? (
                      <CheckCheck size={13} color={palette.tickRead} strokeWidth={2.5} />
                    ) : isDelivered ? (
                      <CheckCheck size={13} color={palette.tickMuted} strokeWidth={2.2} />
                    ) : (
                      <Check size={13} color={palette.tickMuted} strokeWidth={2.2} />
                    )}
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          )}

          {/* Reaction Pills Below Bubble (matching 🔥 06 ❤️ 09 in mockup) */}
          {reactionEntries.length > 0 && !message.deletedForEveryone ? (
            <View style={styles.reactionsRow}>
              {reactionEntries.map((r) => (
                <TouchableOpacity
                  key={r.emoji}
                  style={[
                    styles.reactionPill,
                    {
                      backgroundColor: r.reactedByMe
                        ? palette.isDark
                          ? 'rgba(255,255,255,0.2)'
                          : `${palette.accent}22`
                        : palette.incomingBubbleBg,
                      borderColor: r.reactedByMe ? palette.accent : palette.glassBorder,
                    },
                  ]}
                  onPress={() => onToggleReaction(message, r.emoji, r.reactedByMe)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  <Text
                    style={[
                      styles.reactionCount,
                      { color: palette.text, fontFamily },
                    ]}
                  >
                    {String(r.count).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </Animated.View>
  );

  return (
    <View style={[styles.block, { backgroundColor: rowHighlightBg }]}>
      {showTimestampHeader && !isMine ? (
        <Text
          style={[
            styles.greenTimestamp,
            { color: palette.timestampGreen, fontFamily, fontSize: scaleFont(11.5) },
          ]}
        >
          {formatTime12h(message.createdAt)}
        </Text>
      ) : null}

      {selectionMode ? (
        <TouchableOpacity
          style={styles.selectRow}
          onPress={() => onToggleSelect?.(message)}
          onLongPress={() => onToggleSelect?.(message)}
          activeOpacity={0.75}
        >
          <View
            style={[
              styles.selectCircle,
              {
                borderColor: isSelected ? palette.accent : palette.textSecondary,
                backgroundColor: isSelected ? palette.accent : 'transparent',
              },
            ]}
          >
            {isSelected ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
          </View>
          {rowInner}
        </TouchableOpacity>
      ) : (
        rowInner
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginVertical: 2,
    paddingHorizontal: 12,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  greenTimestamp: {
    fontWeight: '600',
    marginLeft: 38,
    marginTop: 10,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  avatarCol: {
    width: 32,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bubbleCol: {
    maxWidth: '79%',
  },
  alignEnd: {
    alignItems: 'flex-end',
  },
  alignStart: {
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 7,
  },
  fannedContainer: {
    alignItems: 'center',
  },
  captionBubble: {
    marginTop: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  senderLabel: {
    fontWeight: '600',
    marginBottom: 3,
  },
  forwardedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  forwardedText: {
    fontSize: 10.5,
    fontStyle: 'italic',
  },
  replyBox: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
  },
  replySender: {
    fontSize: 11,
    fontWeight: '700',
  },
  replySnippet: {
    fontSize: 12,
    marginTop: 1,
  },
  msgText: {
    lineHeight: 20,
  },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deletedText: {
    fontStyle: 'italic',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  metaTime: {
    fontSize: 10,
    fontWeight: '500',
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  videoCard: {
    width: 214,
    height: 126,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    overflow: 'hidden',
  },
  videoPlayOverlay: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoMeta: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  videoLabel: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    gap: 10,
    minWidth: 204,
    marginBottom: 4,
  },
  docIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  docSub: {
    fontSize: 11,
    marginTop: 1,
  },
  systemWrap: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 20,
  },
  systemPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  systemText: {
    textAlign: 'center',
    fontWeight: '500',
  },
});
