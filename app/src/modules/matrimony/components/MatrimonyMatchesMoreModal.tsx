import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Briefcase,
  ChevronRight,
  Eye,
  Globe,
  GraduationCap,
  HeartHandshake,
  Image as ImageIcon,
  MapPin,
  RotateCcw,
  ScanEye,
  SlidersHorizontal,
  Star,
  UserPlus,
  X,
} from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { MatrimonyMatchTab } from '../types/matrimony';

interface MoreMenuItem {
  key: MatrimonyMatchTab;
  title: string;
  subtitle: string;
  renderIcon: () => React.ReactNode;
}

interface MoreMenuSection {
  sectionTitle: string;
  items: MoreMenuItem[];
}

interface Props {
  visible: boolean;
  selectedTab: MatrimonyMatchTab;
  hiddenCount?: number;
  onSelectTab: (tab: MatrimonyMatchTab) => void;
  onRestoreHidden?: () => void;
  onClose: () => void;
}

export const MORE_TAB_TITLES: Partial<Record<MatrimonyMatchTab, string>> = {
  shortlisted: 'Shortlisted by you',
  shortlisted_by_you: 'Shortlisted by you',
  viewed_you: 'Viewed you',
  shortlisted_you: 'Shortlisted you',
  viewed_by_you: 'Viewed by you',
  newly_joined: 'Newly joined',
  nearby: 'Nearby matches',
  photo_matches: 'Photo matches',
  mutual_matches: 'Mutual matches',
  looking_for_you: 'Looking for you',
  education_pref: 'Education preference',
  professional_pref: 'Professional preference',
  location_pref: 'City/location preference',
  nri_matches: 'NRI matches',
  shared_interests: 'Mutual Interests',
};

const SECTIONS: MoreMenuSection[] = [
  {
    sectionTitle: 'Based on activity',
    items: [
      {
        key: 'shortlisted',
        title: 'Shortlisted by you',
        subtitle: 'Matches you have shortlisted',
        renderIcon: () => <Star size={20} color="#EA580C" fill="#EA580C" />,
      },
      {
        key: 'viewed_you',
        title: 'Viewed you',
        subtitle: 'Matches who have viewed your profile',
        renderIcon: () => <Eye size={20} color="#0284C7" strokeWidth={2} />,
      },
      {
        key: 'shortlisted_you',
        title: 'Shortlisted you',
        subtitle: 'Matches who have shortlisted your profile',
        renderIcon: () => <Star size={20} color="#CA8A04" strokeWidth={2} />,
      },
      {
        key: 'viewed_by_you',
        title: 'Viewed by you',
        subtitle: 'Matches you have viewed',
        renderIcon: () => <ScanEye size={20} color="#0D9488" strokeWidth={2} />,
      },
    ],
  },
  {
    sectionTitle: 'Recently joined & nearby matches',
    items: [
      {
        key: 'newly_joined',
        title: 'Newly joined',
        subtitle: 'Matches who joined within the last 30 days',
        renderIcon: () => <UserPlus size={20} color="#8B5CF6" strokeWidth={2} />,
      },
      {
        key: 'nearby',
        title: 'Nearby matches',
        subtitle: 'Matches near your location',
        renderIcon: () => <MapPin size={20} color="#D97706" strokeWidth={2} />,
      },
    ],
  },
  {
    sectionTitle: 'Based on profile details',
    items: [
      {
        key: 'photo_matches',
        title: 'Photo matches',
        subtitle: 'Matches that have added photos',
        renderIcon: () => <ImageIcon size={20} color="#DB2777" strokeWidth={2} />,
      },
    ],
  },
  {
    sectionTitle: 'Members who are looking for someone like you',
    items: [
      {
        key: 'mutual_matches',
        title: 'Mutual matches',
        subtitle: 'Matches whose profile match your preferences and vice versa',
        renderIcon: () => <HeartHandshake size={20} color="#65A30D" strokeWidth={2} />,
      },
      {
        key: 'looking_for_you',
        title: 'Looking for you',
        subtitle: 'Matches whose preferences match your profile',
        renderIcon: () => <SlidersHorizontal size={20} color="#7C3AED" strokeWidth={2} />,
      },
    ],
  },
  {
    sectionTitle: 'Matches based on preferences',
    items: [
      {
        key: 'education_pref',
        title: 'Education preference',
        subtitle: 'Matches based on your preferred education',
        renderIcon: () => <GraduationCap size={20} color="#65A30D" strokeWidth={2} />,
      },
      {
        key: 'professional_pref',
        title: 'Professional preference',
        subtitle: 'Matches based on your preferred profession',
        renderIcon: () => <Briefcase size={20} color="#BE185D" strokeWidth={2} />,
      },
      {
        key: 'location_pref',
        title: 'City/location preference',
        subtitle: 'Matches based on your preferred city/location',
        renderIcon: () => <MapPin size={20} color="#0D9488" strokeWidth={2} />,
      },
      {
        key: 'nri_matches',
        title: 'NRI matches',
        subtitle: 'Matches from outside India',
        renderIcon: () => <Globe size={20} color="#DC2626" strokeWidth={2} />,
      },
    ],
  },
];

export default function MatrimonyMatchesMoreModal({
  visible,
  selectedTab,
  hiddenCount = 0,
  onSelectTab,
  onRestoreHidden,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const sheetBg = isDark ? '#0F172A' : '#F3F5F8';
  const cardSurface = isDark ? colors.surface : '#FFFFFF';
  const dividerColor = isDark ? colors.border : '#F1F5F9';

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { backgroundColor: sheetBg }]}>
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: Math.max(insets.top + 12, 24),
            paddingHorizontal: 14,
            paddingBottom: Math.max(insets.bottom + 96, 110),
          }}
        >
          {SECTIONS.map((sec) => (
            <View
              key={sec.sectionTitle}
              style={[
                styles.card,
                {
                  backgroundColor: cardSurface,
                  borderColor: isDark ? colors.border : '#EBEEF2',
                },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.text, fontFamily }]}>
                {sec.sectionTitle}
              </Text>

              {sec.items.map((item, idx) => {
                const isLast = idx === sec.items.length - 1;
                const isActive =
                  selectedTab === item.key ||
                  (item.key === 'shortlisted' && selectedTab === 'shortlisted_by_you');
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.itemRow,
                      {
                        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                        borderBottomColor: dividerColor,
                        backgroundColor: isActive
                          ? isDark
                            ? 'rgba(234,88,12,0.14)'
                            : '#FFF7ED'
                          : 'transparent',
                        borderRadius: isActive ? 10 : 0,
                        paddingHorizontal: isActive ? 8 : 2,
                        marginHorizontal: isActive ? -6 : 0,
                      },
                    ]}
                    activeOpacity={0.72}
                    onPress={() => {
                      onSelectTab(item.key);
                      onClose();
                    }}
                  >
                    <View style={styles.iconWrap}>{item.renderIcon()}</View>
                    <View style={styles.textCol}>
                      <Text
                        style={[
                          styles.itemTitle,
                          {
                            color: isActive ? '#EA580C' : colors.text,
                            fontFamily,
                          },
                        ]}
                      >
                        {item.title}
                      </Text>
                      <Text style={[styles.itemSubtitle, { color: colors.textSecondary, fontFamily }]}>
                        {item.subtitle}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={isActive ? '#EA580C' : colors.text} strokeWidth={2} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {hiddenCount > 0 && onRestoreHidden ? (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: cardSurface,
                  borderColor: isDark ? colors.border : '#EBEEF2',
                },
              ]}
            >
              <TouchableOpacity
                style={styles.itemRow}
                activeOpacity={0.72}
                onPress={() => {
                  onRestoreHidden();
                  onClose();
                }}
              >
                <View style={styles.iconWrap}>
                  <RotateCcw size={20} color="#E0535F" strokeWidth={2} />
                </View>
                <View style={styles.textCol}>
                  <Text style={[styles.itemTitle, { color: '#E0535F', fontFamily }]}>
                    Restore hidden profiles ({hiddenCount})
                  </Text>
                  <Text style={[styles.itemSubtitle, { color: colors.textSecondary, fontFamily }]}>
                    Bring back profiles you previously hid with Don't Show
                  </Text>
                </View>
                <ChevronRight size={18} color="#E0535F" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>

        <LinearGradient
          pointerEvents="box-none"
          colors={[
            isDark ? 'rgba(15,23,42,0)' : 'rgba(0,0,0,0)',
            isDark ? 'rgba(15,23,42,0.75)' : 'rgba(0,0,0,0.45)',
            isDark ? 'rgba(15,23,42,0.96)' : 'rgba(0,0,0,0.85)',
          ]}
          style={[
            styles.bottomFadeOverlay,
            { paddingBottom: Math.max(insets.bottom + 18, 28) },
          ]}
        >
          <TouchableOpacity
            style={styles.closeCircleBtn}
            activeOpacity={0.8}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={24} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 6,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  iconWrap: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },
  itemTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  itemSubtitle: {
    fontSize: 12.5,
    marginTop: 2,
    lineHeight: 17,
  },
  bottomFadeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 42,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  closeCircleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: 'rgba(100,116,139,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
