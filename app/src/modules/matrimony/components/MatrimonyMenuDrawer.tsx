import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import {
  ArrowLeft,
  Bell,
  Camera,
  FilePenLine,
  IdCard,
  Settings,
  ShieldCheck,
  UserPen,
} from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyCachedImage from './MatrimonyCachedImage';

export interface MatrimonyDrawerMeta {
  displayName: string;
  profileCode: string;
  membershipLabel?: string;
  avatarUri: string | null;
}

interface MatrimonyMenuDrawerHostProps {
  stackNavigation: any;
}

const ORANGE = '#E25B12';

type DrawerListener = {
  open: (meta?: Partial<MatrimonyDrawerMeta>) => void;
  close: () => void;
};

let activeDrawerHost: DrawerListener | null = null;

export function openMatrimonyMenuDrawer(meta?: Partial<MatrimonyDrawerMeta>) {
  activeDrawerHost?.open(meta);
}

export function closeMatrimonyMenuDrawer() {
  activeDrawerHost?.close();
}

const DrawerLatticePattern = React.memo(({ patternStroke }: { patternStroke: string }) => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Svg width="100%" height="100%">
      <Defs>
        <Pattern
          id="drawerDiamondGrid"
          width="24"
          height="36"
          patternUnits="userSpaceOnUse"
        >
          <Path
            d="M12 2 L22 18 L12 34 L2 18 Z"
            fill="none"
            stroke={patternStroke}
            strokeWidth="1"
          />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#drawerDiamondGrid)" />
    </Svg>
  </View>
));

function MatrimonyMenuDrawerComponent({ stackNavigation }: MatrimonyMenuDrawerHostProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.min(Math.round(screenWidth * 0.84), 340);
  const { colors, isDark, fontStyle } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [isOpen, setIsOpen] = useState(false);
  const [meta, setMeta] = useState<MatrimonyDrawerMeta>({
    displayName: 'Member',
    profileCode: '',
    membershipLabel: 'Free Member',
    avatarUri: null,
  });

  const isOpenRef = useRef(false);
  const progress = useSharedValue(0);

  const finishClose = useCallback(() => {
    isOpenRef.current = false;
    setIsOpen(false);
  }, []);

  const openDrawer = useCallback(
    (nextMeta?: Partial<MatrimonyDrawerMeta>) => {
      if (nextMeta) {
        setMeta((prev) => {
          const displayName = nextMeta.displayName ?? prev.displayName;
          const profileCode = nextMeta.profileCode ?? prev.profileCode;
          const membershipLabel = nextMeta.membershipLabel ?? prev.membershipLabel;
          const avatarUri = nextMeta.avatarUri !== undefined ? nextMeta.avatarUri : prev.avatarUri;
          if (
            prev.displayName === displayName &&
            prev.profileCode === profileCode &&
            prev.membershipLabel === membershipLabel &&
            prev.avatarUri === avatarUri
          ) {
            return prev;
          }
          return { displayName, profileCode, membershipLabel, avatarUri };
        });
      }
      isOpenRef.current = true;
      setIsOpen(true);
      progress.value = withTiming(1, {
        duration: 185,
        easing: Easing.out(Easing.cubic),
      });
    },
    [progress]
  );

  const closeDrawer = useCallback(() => {
    if (!isOpenRef.current) return;
    isOpenRef.current = false;
    progress.value = withTiming(
      0,
      {
        duration: 150,
        easing: Easing.in(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(finishClose)();
        }
      }
    );
  }, [progress, finishClose]);

  useEffect(() => {
    activeDrawerHost = { open: openDrawer, close: closeDrawer };
    return () => {
      if (activeDrawerHost?.open === openDrawer) {
        activeDrawerHost = null;
      }
    };
  }, [openDrawer, closeDrawer]);

  useEffect(() => {
    if (!isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDrawer();
      return true;
    });
    return () => sub.remove();
  }, [isOpen, closeDrawer]);

  const navigateAction = useCallback(
    (routeName: string, params?: Record<string, any>) => {
      closeDrawer();
      stackNavigation?.navigate(routeName, params);
    },
    [closeDrawer, stackNavigation]
  );

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const drawerSlideStyle = useAnimatedStyle(() => {
    const offscreenX = -(drawerWidth + 24);
    return {
      transform: [{ translateX: interpolate(progress.value, [0, 1], [offscreenX, 0]) }],
    };
  }, [drawerWidth]);

  const drawerBg = isDark ? colors.surface : '#FFFFFF';
  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#E5E7EB';
  const upgradeBg = isDark ? 'rgba(226, 91, 18, 0.16)' : '#FFF3EB';
  const patternStroke = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(148, 163, 184, 0.14)';

  const menuItems = useMemo(
    () => [
      {
        key: 'edit-profile',
        label: 'Edit profile',
        Icon: UserPen,
        onPress: () => navigateAction('MatrimonyEditProfile'),
      },
      {
        key: 'edit-preferences',
        label: 'Edit partner preferences',
        Icon: FilePenLine,
        onPress: () => navigateAction('MatrimonyEditProfile', { focusSection: 'partnerPreference' }),
      },
      {
        key: 'verify-profile',
        label: 'Verify your profile',
        Icon: IdCard,
        onPress: () => navigateAction('MatrimonyStatus'),
      },
      {
        key: 'privacy-settings',
        label: 'Privacy settings',
        Icon: ShieldCheck,
        onPress: () => navigateAction('MatrimonyPrivacySettings'),
      },
      {
        key: 'account-settings',
        label: 'Account settings',
        Icon: Settings,
        onPress: () => navigateAction('MatrimonyAccountSettings'),
      },
      {
        key: 'notifications',
        label: 'Notifications',
        Icon: Bell,
        onPress: () => navigateAction('MatrimonyNotifications'),
      },
    ],
    [navigateAction]
  );

  return (
    <View
      style={styles.rootOverlay}
      pointerEvents={isOpen ? 'auto' : 'none'}
      collapsable={false}
    >
      {/* Right-side dim backdrop */}
      <Reanimated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Reanimated.View>

      {/* Pre-mounted GPU Slide-Over Drawer */}
      <Reanimated.View
        style={[
          styles.drawer,
          {
            width: drawerWidth,
            backgroundColor: drawerBg,
          },
          drawerSlideStyle,
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 32) }}
        >
          {/* Top Profile Header with faint geometric lattice pattern */}
          <View style={[styles.headerSection, { paddingTop: insets.top + 12 }]}>
            <DrawerLatticePattern patternStroke={patternStroke} />

            <TouchableOpacity
              style={styles.backBtn}
              onPress={closeDrawer}
              activeOpacity={0.75}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft size={22} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.profileRow}>
              <TouchableOpacity
                style={styles.avatarWrap}
                onPress={() => navigateAction('MatrimonyMyPhotos')}
                activeOpacity={0.85}
              >
                {meta.avatarUri ? (
                  <MatrimonyCachedImage
                    uri={meta.avatarUri}
                    recyclingKey={meta.profileCode}
                    style={styles.avatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>
                      {(meta.displayName || 'M').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View
                  style={[
                    styles.cameraBadge,
                    {
                      backgroundColor: isDark ? colors.bg : '#FFFFFF',
                      borderColor: dividerColor,
                    },
                  ]}
                >
                  <Camera size={12} color={colors.text} />
                </View>
              </TouchableOpacity>

              <View style={styles.profileTextCol}>
                <Text
                  style={[styles.profileName, { color: colors.text, fontFamily }]}
                  numberOfLines={2}
                >
                  {meta.displayName}
                </Text>
                <Text style={[styles.profileId, { color: colors.textSecondary, fontFamily }]}>
                  {meta.profileCode}
                </Text>
                <Text style={[styles.membershipTier, { color: colors.textSecondary, fontFamily }]}>
                  {meta.membershipLabel || 'Free Member'}
                </Text>
              </View>
            </View>
          </View>

          {/* Warm Peach Upgrade Strip */}
          <View style={[styles.upgradeStrip, { backgroundColor: upgradeBg }]}>
            <Text
              style={[styles.upgradeText, { color: colors.text, fontFamily }]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              Upgrade membership to call{'\n'}or message with matches
            </Text>
            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={() => navigateAction('MatrimonyUpgrade')}
              activeOpacity={0.88}
            >
              <Text style={[styles.upgradeBtnText, { fontFamily }]}>Upgrade now</Text>
            </TouchableOpacity>
          </View>

          {/* Menu List Items */}
          <View style={styles.menuList}>
            {menuItems.map(({ key, label, Icon, onPress }, index) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.menuRow,
                  index < menuItems.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: dividerColor,
                  },
                ]}
                onPress={onPress}
                activeOpacity={0.7}
              >
                <Icon size={20} color={colors.textSecondary} strokeWidth={1.7} />
                <Text style={[styles.menuLabel, { color: colors.text, fontFamily }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </Reanimated.View>
    </View>
  );
}

const MatrimonyMenuDrawer = React.memo(MatrimonyMenuDrawerComponent);
export default MatrimonyMenuDrawer;

const styles = StyleSheet.create({
  rootOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.36)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingRight: 10,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 14,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  avatarFallback: {
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTextCol: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    fontSize: 17.5,
    fontWeight: '800',
    lineHeight: 22,
  },
  profileId: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  membershipTier: {
    fontSize: 13.5,
    fontWeight: '500',
    marginTop: 2,
  },
  upgradeStrip: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  upgradeText: {
    flex: 1,
    fontSize: 11.2,
    fontWeight: '600',
    lineHeight: 15.5,
  },
  upgradeBtn: {
    flexShrink: 0,
    backgroundColor: ORANGE,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  menuList: {
    paddingTop: 8,
    paddingHorizontal: 20,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
  },
  menuLabel: {
    fontSize: 15.5,
    fontWeight: '500',
  },
});
