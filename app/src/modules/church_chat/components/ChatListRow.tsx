import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BellOff, Check, CheckCheck, Star } from 'lucide-react-native';
import { ChatThemePalette } from '../constants/chatTheme';
import { ChatInboxItem } from '../types/chat';
import AvatarWithStatus from './AvatarWithStatus';

export function formatRelativeInboxTime(ms: number): string {
  if (!ms) return '';
  const now = Date.now();
  const diffMin = Math.floor((now - ms) / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'}`;

  const date = new Date(ms);
  const today = new Date(now);
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  if (isToday) {
    const h24 = date.getHours();
    const m = String(date.getMinutes()).padStart(2, '0');
    const p = h24 >= 12 ? 'PM' : 'AM';
    return `${h24 % 12 || 12}:${m} ${p}`;
  }

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

interface ChatListRowProps {
  item: ChatInboxItem;
  myUid: string;
  isOnline?: boolean;
  isTyping?: boolean;
  typingLabel?: string;
  palette: ChatThemePalette;
  fontFamily?: string;
  scaleFont: (s: number) => number;
  onPress: () => void;
  onLongPress: () => void;
}

const ChatListRow = React.memo(function ChatListRow({
  item,
  myUid,
  isOnline = false,
  isTyping = false,
  typingLabel,
  palette,
  fontFamily,
  scaleFont,
  onPress,
  onLongPress,
}: ChatListRowProps) {
  const isMineLast = item.lastMessageSenderUid === myUid && item.lastMessageType !== 'system';
  const senderPrefix =
    item.roomType === 'group' &&
    item.lastMessageType !== 'system' &&
    item.lastMessageSenderName &&
    item.lastMessageSenderUid !== myUid
      ? `${item.lastMessageSenderName.split(/\s+/)[0]}: `
      : '';

  const previewText = item.lastMessageText || (item.roomType === 'group' ? 'Group created' : 'Tap to message');

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.78}
    >
      <AvatarWithStatus
        uri={item.avatarUrl}
        name={item.title}
        size={52}
        online={item.roomType === 'direct' && isOnline}
        isGroup={item.roomType === 'group'}
        dotColor={palette.onlineDot}
        dotBorderColor={palette.bg}
      />

      <View style={styles.center}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              { color: palette.text, fontFamily, fontSize: scaleFont(15.5) },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {item.isFavorite ? (
            <Star size={12} color="#FBBF24" fill="#FBBF24" style={{ marginLeft: 5 }} />
          ) : null}
          {item.isMuted ? (
            <BellOff size={12} color={palette.textMuted} style={{ marginLeft: 5 }} />
          ) : null}
        </View>

        <View style={styles.previewRow}>
          {isTyping ? (
            <Text
              style={[
                styles.typingText,
                { color: palette.timestampGreen, fontFamily, fontSize: scaleFont(13) },
              ]}
              numberOfLines={1}
            >
              {typingLabel || 'typing...'}
            </Text>
          ) : (
            <>
              {isMineLast ? (
                <View style={styles.tickWrap}>
                  {item.lastMessageRead ? (
                    <CheckCheck size={14} color={palette.tickRead} strokeWidth={2.4} />
                  ) : item.lastMessageDelivered ? (
                    <CheckCheck size={14} color={palette.textSecondary} strokeWidth={2.2} />
                  ) : (
                    <Check size={14} color={palette.textSecondary} strokeWidth={2.2} />
                  )}
                </View>
              ) : null}
              <Text
                style={[
                  styles.previewText,
                  {
                    color: item.unreadCount > 0 ? palette.text : palette.textSecondary,
                    fontWeight: item.unreadCount > 0 ? '500' : '400',
                    fontFamily,
                    fontSize: scaleFont(13.2),
                  },
                ]}
                numberOfLines={1}
              >
                {senderPrefix}
                {previewText}
              </Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.right}>
        <Text
          style={[
            styles.time,
            { color: palette.textSecondary, fontFamily, fontSize: scaleFont(11.5) },
          ]}
        >
          {formatRelativeInboxTime(item.lastMessageAt)}
        </Text>
        {item.unreadCount > 0 ? (
          <View
            style={[
              styles.unreadBadge,
              {
                backgroundColor: item.isMuted ? palette.textMuted : palette.unreadBadgeBg,
              },
            ]}
          >
            <Text style={[styles.unreadText, { color: palette.unreadBadgeText }]}>
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </Text>
          </View>
        ) : (
          <View style={styles.badgeSpacer} />
        )}
      </View>
    </TouchableOpacity>
  );
});

export default ChatListRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  center: {
    flex: 1,
    marginLeft: 13,
    marginRight: 10,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontWeight: '700',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  tickWrap: {
    marginRight: 4,
  },
  previewText: {
    flex: 1,
  },
  typingText: {
    fontWeight: '600',
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 52,
  },
  time: {
    fontWeight: '500',
  },
  unreadBadge: {
    marginTop: 5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '800',
  },
  badgeSpacer: {
    height: 25,
  },
});
