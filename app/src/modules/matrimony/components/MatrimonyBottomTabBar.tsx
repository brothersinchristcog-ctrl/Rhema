import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crown, Heart, Home, MessageCircle, Users } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { matrimonyChatService } from '../services/matrimonyChatService';

const ORANGE = '#EA580C';
const WHATSAPP_GREEN = '#00A884';

const TAB_ITEMS = [
  { key: 'Home', routeName: 'MatrimonyHome', label: 'Home', Icon: Home },
  { key: 'Matches', routeName: 'MatrimonyMatches', label: 'Matches', Icon: Users },
  { key: 'Interests', routeName: 'MatrimonyInterestsHub', label: 'Interests', Icon: Heart },
  { key: 'Messages', routeName: 'MatrimonyMessages', label: 'Messages', Icon: MessageCircle },
  { key: 'Upgrade', routeName: 'MatrimonyUpgrade', label: 'Upgrade', Icon: Crown },
] as const;

export default function MatrimonyBottomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, fontStyle } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    const stopPresence = matrimonyChatService.startPresenceTracking(uid, null);
    const unsubInbox = matrimonyChatService.subscribeInbox(uid, (_, totalUnread) => {
      setUnreadChatCount(totalUnread);
    });
    return () => {
      unsubInbox();
      stopPresence();
    };
  }, [user?.uid]);

  const activeRouteName = state.routes[state.index]?.name;

  return (
    <View
      style={[
        styles.bottomNav,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, 10),
        },
      ]}
    >
      {TAB_ITEMS.map(({ key, routeName, label, Icon }) => {
        const isActive = activeRouteName === routeName;
        const badge = key === 'Messages' ? unreadChatCount : 0;

        const handlePress = () => {
          if (routeName === 'MatrimonyUpgrade') {
            navigation.getParent()?.navigate('MatrimonyUpgrade');
            return;
          }
          if (!isActive) {
            navigation.navigate(routeName);
          }
        };

        return (
          <TouchableOpacity
            key={key}
            style={styles.navItem}
            onPress={handlePress}
            activeOpacity={0.8}
          >
            <View style={{ position: 'relative' }}>
              <Icon size={20} color={isActive ? ORANGE : colors.textSecondary} />
              {badge > 0 && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.navLabel,
                {
                  color: isActive ? ORANGE : colors.textSecondary,
                  fontWeight: isActive ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  navLabel: {
    fontSize: 11,
  },
  navBadge: {
    position: 'absolute',
    top: -5,
    right: -9,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3.5,
    backgroundColor: WHATSAPP_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
});
