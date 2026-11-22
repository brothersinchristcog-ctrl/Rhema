import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle } from 'lucide-react-native';
import { useTheme } from '../../../context/ThemeContext';
import { getChatThemePalette } from '../constants/chatTheme';
import { rhemaChatService } from '../services/rhemaChatService';

interface FloatingChatFabProps {
  churchId: string;
  userId?: string;
  isGuest?: boolean;
  onPress: () => void;
}

export default function FloatingChatFab({
  churchId,
  userId,
  isGuest = false,
  onPress,
}: FloatingChatFabProps) {
  const insets = useSafeAreaInsets();
  const { appearance, accentColor, isDark, navBarStyle } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId || isGuest) {
      setUnreadCount(0);
      return;
    }
    const unsub = rhemaChatService.subscribeInbox(churchId, userId, (_, total) => {
      setUnreadCount(total);
    });
    return () => unsub();
  }, [churchId, userId, isGuest]);

  const palette = getChatThemePalette(appearance, accentColor, isDark);

  const bottomSafe = insets?.bottom || 0;
  const deviceBottomInset = bottomSafe > 0 ? bottomSafe : Platform.OS === 'ios' ? 10 : 4;
  const capsuleClearance = 52 + deviceBottomInset;
  const pillClearance =
    54 +
    Math.max(
      bottomSafe + (Platform.OS === 'ios' ? 14 : 10),
      Platform.OS === 'android' ? 16 : 24
    );
  const bottomOffset = (navBarStyle === 'pill' ? pillClearance : capsuleClearance) + 12;

  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Open Church Chats"
        style={[
          styles.fab,
          {
            backgroundColor: palette.isDark ? 'rgba(24, 28, 34, 0.85)' : palette.surface,
            borderColor: palette.isDark ? 'rgba(255,255,255,0.18)' : palette.glassBorder,
          },
        ]}
      >
        <BlurView intensity={45} tint={palette.blurTint} style={styles.blurFill}>
          <MessageCircle
            size={24}
            color={palette.isDark ? '#FFFFFF' : palette.accent}
            strokeWidth={2.2}
          />
        </BlurView>
      </TouchableOpacity>

      {unreadCount > 0 ? (
        <View style={[styles.badge, { borderColor: palette.bg }]}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    zIndex: 998,
    elevation: 16,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 10,
  },
  blurFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 21,
    height: 21,
    borderRadius: 10.5,
    backgroundColor: '#EF4444',
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
});
