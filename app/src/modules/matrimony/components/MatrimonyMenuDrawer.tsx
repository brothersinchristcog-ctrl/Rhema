import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import {
  ArrowLeft,
  Camera,
  FilePenLine,
  IdCard,
  UserPen,
} from 'lucide-react-native';

interface MatrimonyMenuDrawerProps {
  visible: boolean;
  onClose: () => void;
  displayName: string;
  profileCode: string;
  membershipLabel?: string;
  avatarUri: string | null;
  isDark: boolean;
  colors: {
    bg: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
  };
  fontFamily?: string;
  onUpgrade: () => void;
  onEditProfile: () => void;
  onEditPreferences: () => void;
  onVerifyProfile: () => void;
  onUploadPhotos: () => void;
}

const ORANGE = '#E25B12';

export default function MatrimonyMenuDrawer({
  visible,
  onClose,
  displayName,
  profileCode,
  membershipLabel = 'Free Member',
  avatarUri,
  isDark,
  colors,
  fontFamily,
  onUpgrade,
  onEditProfile,
  onEditPreferences,
  onVerifyProfile,
  onUploadPhotos,
}: MatrimonyMenuDrawerProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = Math.min(Math.round(screenWidth * 0.84), 340);

  const [modalVisible, setModalVisible] = useState(visible);
  const slideAnim = useRef(new Animated.Value(-drawerWidth)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      slideAnim.setValue(-drawerWidth);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (modalVisible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -drawerWidth,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setModalVisible(false);
        }
      });
    }
  }, [visible, drawerWidth, modalVisible, slideAnim, backdropAnim]);

  const handleAction = (action: () => void) => {
    onClose();
    setTimeout(action, 120);
  };

  const drawerBg = isDark ? colors.surface : '#FFFFFF';
  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#E5E7EB';
  const upgradeBg = isDark ? 'rgba(226, 91, 18, 0.16)' : '#FFF3EB';
  const patternStroke = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(148, 163, 184, 0.14)';

  const menuItems = [
    {
      key: 'edit-profile',
      label: 'Edit profile',
      Icon: UserPen,
      onPress: () => handleAction(onEditProfile),
    },
    {
      key: 'edit-preferences',
      label: 'Edit partner preferences',
      Icon: FilePenLine,
      onPress: () => handleAction(onEditPreferences),
    },
    {
      key: 'verify-profile',
      label: 'Verify your profile',
      Icon: IdCard,
      onPress: () => handleAction(onVerifyProfile),
    },
  ];

  return (
    <Modal
      visible={modalVisible}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Right-side dim backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Left Slide-Over Drawer */}
        <Animated.View
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              backgroundColor: drawerBg,
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 32) }}
          >
            {/* Top Profile Header with faint geometric lattice pattern */}
            <View style={[styles.headerSection, { paddingTop: insets.top + 12 }]}>
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

              <TouchableOpacity
                style={styles.backBtn}
                onPress={onClose}
                activeOpacity={0.75}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <ArrowLeft size={22} color={colors.text} />
              </TouchableOpacity>

              <View style={styles.profileRow}>
                <TouchableOpacity
                  style={styles.avatarWrap}
                  onPress={() => handleAction(onUploadPhotos)}
                  activeOpacity={0.85}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>
                        {displayName.charAt(0).toUpperCase()}
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
                    {displayName}
                  </Text>
                  <Text style={[styles.profileId, { color: colors.textSecondary, fontFamily }]}>
                    {profileCode}
                  </Text>
                  <Text style={[styles.membershipTier, { color: colors.textSecondary, fontFamily }]}>
                    {membershipLabel}
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
                onPress={() => handleAction(onUpgrade)}
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
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
    elevation: 12,
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
