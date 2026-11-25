import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, Heart, Home, MessageCircle, Users } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { matrimonyApi } from '../services/matrimonyApi';
import { matrimonyChatService } from '../services/matrimonyChatService';
import { MatrimonyPlanSpec } from '../types/matrimony';

const ORANGE = '#EA580C';
const WHATSAPP_GREEN = '#00A884';
const UPGRADE_BADGE_GRADIENT: readonly [string, string] = ['#221F8A', '#6D0F49'];

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
  const [plans, setPlans] = useState<MatrimonyPlanSpec[]>(
    () => matrimonyApi.getCachedPlans() || []
  );

  useEffect(() => {
    const unsubPlans = matrimonyApi.subscribePlansUpdated((updated) => {
      setPlans(updated);
    });
    if (!matrimonyApi.getCachedPlans()) {
      matrimonyApi
        .getPlans({ force: false })
        .then((list) => {
          if (Array.isArray(list)) setPlans(list);
        })
        .catch(() => undefined);
    }
    return unsubPlans;
  }, []);

  const platinumDiscountPercent = useMemo(
    () => matrimonyApi.getPlatinumDiscountPercent(plans),
    [plans]
  );

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

        const showUpgradeOffer = key === 'Upgrade' && platinumDiscountPercent > 0;

        return (
          <TouchableOpacity
            key={key}
            style={styles.navItem}
            onPress={handlePress}
            activeOpacity={0.8}
          >
            <View style={showUpgradeOffer ? styles.upgradeIconStack : styles.iconWrap}>
              <Icon size={20} color={isActive ? ORANGE : colors.textSecondary} />
              {badge > 0 && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
              {showUpgradeOffer ? (
                <LinearGradient
                  colors={UPGRADE_BADGE_GRADIENT}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.upgradeOffBadge}
                >
                  <Text style={[styles.upgradeOffBadgeText, { fontFamily }]}>
                    {`${platinumDiscountPercent}% OFF`}
                  </Text>
                </LinearGradient>
              ) : null}
            </View>
            <Text
              style={[
                styles.navLabel,
                {
                  color: isActive ? ORANGE : colors.textSecondary,
                  fontWeight: isActive ? '800' : '600',
                  fontFamily,
                },
                showUpgradeOffer && styles.upgradeNavLabelTight,
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
    justifyContent: 'flex-end',
    gap: 3,
    paddingTop: 2,
  },
  navLabel: {
    fontSize: 11,
    includeFontPadding: false,
  },
  upgradeNavLabelTight: {
    marginTop: -2,
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
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeIconStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeOffBadge: {
    marginTop: -4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeOffBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.2,
    lineHeight: 11,
    includeFontPadding: false,
  },
});
