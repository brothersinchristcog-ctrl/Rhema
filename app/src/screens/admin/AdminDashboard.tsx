import React, { useContext, useMemo, useRef, useLayoutEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  useWindowDimensions, 
  StatusBar, 
  Platform, 
  Image 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  LogOut, 
  Smartphone, 
  BookOpen,
  Sparkles,
  Mic,
  Music,
  Award,
  Users,
  ClipboardCheck,
  Heart,
  Flame,
  HeartHandshake,
  Droplets,
  UserCheck,
  CalendarDays,
  CalendarClock,
  CalendarCheck,
  Briefcase,
  Coins,
  Wallet,
  Gift,
  Bell,
  MessageCircle,
  Image as ImageIcon,
  Video,
  Building2,
  Sliders,
  Headset,
  Shield,
  HelpCircle
} from 'lucide-react-native';
import { useChurch } from '../../context/ChurchContext';
import { AdminTabContext } from '../../context/AdminTabContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../context/ThemeContext';

// ── Modern Vector Icon Configuration for Each Tab ──
const TAB_ICONS: Record<string, { icon: any; color: string }> = {
  // Ministry & Word
  'Promises': { icon: BookOpen, color: '#0D9488' },
  'Daily Verses': { icon: Sparkles, color: '#D97706' },
  'Sermons': { icon: Mic, color: '#4F46E5' },
  'Songs': { icon: Music, color: '#E11D48' },
  'Bible Quiz': { icon: Award, color: '#CA8A04' },

  // People & Fellowship
  'Members': { icon: Users, color: '#0284C7' },
  'Attendance': { icon: ClipboardCheck, color: '#059669' },
  'Prayers': { icon: Heart, color: '#E11D48' },
  'Testimonies': { icon: Flame, color: '#9333EA' },
  'Care Cells': { icon: HeartHandshake, color: '#EA580C' },
  'Baptism': { icon: Droplets, color: '#06B6D4' },
  'Volunteer Management': { icon: UserCheck, color: '#6366F1' },
  'Approvals': { icon: UserCheck, color: '#10B981' },

  // Services & Events
  'Events': { icon: CalendarDays, color: '#EA580C' },
  'Schedule': { icon: CalendarClock, color: '#D97706' },
  'Service Roster': { icon: CalendarCheck, color: '#0F766E' },
  'Pastor Event': { icon: Briefcase, color: '#7C3AED' },

  // Finance & Celebrations
  'Donations': { icon: Coins, color: '#10B981' },
  'Expense': { icon: Wallet, color: '#F43F5E' },
  'Celebrations': { icon: Gift, color: '#D946EF' },

  // Media & Communications
  'Notifications': { icon: Bell, color: '#F59E0B' },
  'WhatsApp': { icon: MessageCircle, color: '#25D366' },
  'Gallery': { icon: ImageIcon, color: '#0EA5E9' },
  'Online Meetings': { icon: Video, color: '#3B82F6' },

  // Church Management
  'Church Branches': { icon: Building2, color: '#475569' },
  'Church Settings': { icon: Sliders, color: '#64748B' },
  'Support Team': { icon: Headset, color: '#0284C7' },
  'App Admin': { icon: Shield, color: '#F59E0B' },
};

// ── Categorized Sections (Grouped Cleanly) ──
const SECTIONS = [
  {
    id: 'ministry',
    title: 'Ministry & Word',
    tabNames: ['Promises', 'Daily Verses', 'Sermons', 'Songs', 'Bible Quiz'],
  },
  {
    id: 'people',
    title: 'People & Fellowship',
    tabNames: ['Members', 'Attendance', 'Prayers', 'Testimonies', 'Care Cells', 'Baptism', 'Volunteer Management', 'Approvals'],
  },
  {
    id: 'events',
    title: 'Services & Events',
    tabNames: ['Events', 'Schedule', 'Service Roster', 'Pastor Event'],
  },
  {
    id: 'finance',
    title: 'Finance & Celebrations',
    tabNames: ['Donations', 'Expense', 'Celebrations'],
  },
  {
    id: 'media',
    title: 'Media & Communications',
    tabNames: ['Notifications', 'WhatsApp', 'Gallery', 'Online Meetings'],
  },
  {
    id: 'system',
    title: 'Church Management',
    tabNames: ['Church Branches', 'Church Settings', 'Support Team', 'App Admin'],
  },
];

// Omit duplicate creation screens per user request
const EXCLUDED_TAB_NAMES = [
  'Dashboard', 
  'New Promise', 
  'New Sermon', 
  'New Event', 
  'New Online Meeting'
];

export default function AdminDashboard({ navigation, allTabs = [] }: any) {
  const { setActiveTab, dashboardScrollY, setDashboardScrollY } = useContext(AdminTabContext);
  const { member, user, signOut, setViewMode } = useAuth();
  const { activeChurch } = useChurch();
  const { isDark, colors, fontStyle, scaleFont } = useTheme();

  const appFontFamily = FONT_STYLE_OPTIONS.find(o => o.id === fontStyle)?.family || (Platform.OS === 'ios' ? 'System' : 'sans-serif');
  const screenBg = isDark ? '#09090B' : (colors.background || '#FAF7F2');
  const cardBg = isDark ? '#18181B' : '#FFFFFF';
  const cardBorder = isDark ? '#27272A' : '#E2E8F0';
  const primaryText = isDark ? '#FFFFFF' : (colors.text || '#0F172A');
  const secondaryText = isDark ? '#A1A1AA' : '#64748B';

  const scrollRef = useRef<ScrollView>(null);

  useLayoutEffect(() => {
    if (dashboardScrollY && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: dashboardScrollY, animated: false });
      }, 0);
    }
  }, []);

  const handleScroll = (event: any) => {
    const y = event.nativeEvent.contentOffset.y;
    if (setDashboardScrollY) setDashboardScrollY(y);
  };

  // Map every active tab by name
  const validTabsMap = useMemo(() => {
    const map = new Map<string, any>();
    allTabs.forEach((tab: any, index: number) => {
      if (!EXCLUDED_TAB_NAMES.includes(tab.name)) {
        map.set(tab.name, { ...tab, index });
      }
    });
    return map;
  }, [allTabs]);

  const { width: windowWidth } = useWindowDimensions();
  const isSmallDevice = windowWidth < 375;
  const isMediumDevice = windowWidth >= 375 && windowWidth < 415;
  const horizontalPadding = isSmallDevice ? 14 : isMediumDevice ? 16 : 18;

  // Responsive 3-column card dimensions
  const contentWidth = windowWidth - (horizontalPadding * 2);
  const gridGap = isSmallDevice ? 10 : 12;
  const cardWidth = Math.floor((contentWidth - (gridGap * 2)) / 3);

  const fullName = member?.name || user?.displayName || 'Administrator';

  // Track all rendered tab names so no tab is EVER missed
  const renderedTabNames = new Set<string>();

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar 
        barStyle={isDark ? 'light-content' : 'dark-content'} 
        backgroundColor={isDark ? '#2D180C' : '#FFC59E'} 
      />

      <ScrollView 
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scroll}
        bounces={true}
      >
        {/* Over-scroll cover above 0 */}
        <View 
          pointerEvents="none" 
          style={{ 
            position: 'absolute', 
            top: -800, 
            left: 0, 
            right: 0, 
            height: 800, 
            backgroundColor: isDark ? '#2D180C' : '#FFC59E' 
          }} 
        />

        {/* ── Top Hero Section: Preserved Previous Card ── */}
        <LinearGradient
          colors={isDark ? ['#2D180C', '#1A1008', '#09090B'] : ['#FFC59E', '#FFD1AF', '#FFDEC4', '#FFE9D7', '#FFF2E8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.heroGradientSection, { paddingHorizontal: horizontalPadding }]}
        >
          {/* Top Row: Church Logo + Church Name + Member View Switcher */}
          <View style={styles.heroTopRow}>
            {/* Elevated Church Logo Ring */}
            <View style={[
              styles.heroLogoRing, 
              { 
                borderColor: isDark ? '#52525B' : '#FFFFFF',
                backgroundColor: isDark ? '#27272A' : '#FFFFFF',
              }
            ]}>
              {activeChurch?.theme?.logoUrl ? (
                <Image 
                  source={{ uri: activeChurch.theme.logoUrl }} 
                  style={styles.heroLogoImg} 
                  resizeMode="cover" 
                />
              ) : (
                <Image 
                  source={require('../../../assets/logo.png')} 
                  style={styles.heroLogoImg} 
                  resizeMode="cover" 
                />
              )}
            </View>

            {/* Church Name & Tagline */}
            <View style={styles.heroTextCol}>
              <Text 
                style={[
                  styles.heroChurchName, 
                  { 
                    color: isDark ? '#FFFFFF' : '#0F172A', 
                    fontSize: scaleFont(isSmallDevice ? 16 : 18),
                    fontFamily: appFontFamily,
                  }
                ]} 
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {activeChurch?.name || 'Your Church'}
              </Text>
              <Text 
                style={[
                  styles.heroTagline, 
                  { 
                    color: isDark ? '#A1A1AA' : '#64748B', 
                    fontSize: scaleFont(11.5),
                    fontFamily: appFontFamily,
                  }
                ]}
                numberOfLines={1}
              >
                {activeChurch?.tagline || 'Together in Christ'}
              </Text>
            </View>

            {/* Quick Switch to Member View */}
            <TouchableOpacity
              style={[
                styles.quickSwitchBtn,
                { 
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.08)',
                }
              ]}
              onPress={() => {
                setViewMode('member');
                try {
                  if (navigation?.navigate) {
                    navigation.navigate('Tabs');
                  }
                } catch (_) {}
              }}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Smartphone size={18} color={isDark ? '#FCD34D' : '#0F172A'} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* ── Centered Admin Dashboard Headline ── */}
          <View style={styles.adminCenterHeaderBlock}>
            <Text 
              style={[
                styles.adminCenterTitle, 
                { 
                  color: isDark ? '#FFFFFF' : '#0F172A', 
                  fontFamily: appFontFamily,
                  fontSize: scaleFont(isSmallDevice ? 22 : 25),
                }
              ]}
            >
              Admin Dashboard
            </Text>

            {/* Centered Welcome Line */}
            <Text style={[styles.welcomeCenterText, { color: isDark ? '#D4D4D8' : '#334155', fontFamily: appFontFamily }]}>
              Welcome back, <Text style={[styles.welcomeCenterName, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>{fullName}</Text>
            </Text>
          </View>
        </LinearGradient>

        {/* ── Main Structured Sections: Modern Vector Icon Tab Cards ── */}
        <View style={[styles.sectionsContainer, { paddingHorizontal: horizontalPadding }]}>
          {SECTIONS.map((section) => {
            const sectionTabs = section.tabNames
              .map(name => {
                const tab = validTabsMap.get(name);
                if (tab) renderedTabNames.add(name);
                return tab;
              })
              .filter(Boolean);

            if (sectionTabs.length === 0) return null;

            return (
              <View key={`sec_${section.id}`} style={styles.sectionBlock}>
                {/* Section Header Row */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitleTxt, { color: primaryText, fontFamily: appFontFamily }]}>
                    {section.title}
                  </Text>
                  <Text style={[styles.sectionSubtitleTxt, { color: secondaryText }]}>
                    {sectionTabs.length} items
                  </Text>
                </View>

                {/* 3-in-a-Row Modern Tab Cards Grid */}
                <View style={styles.tabGrid}>
                  {Array.from({ length: Math.ceil(sectionTabs.length / 3) }).map((_, rowIndex) => {
                    const rowItems = sectionTabs.slice(rowIndex * 3, rowIndex * 3 + 3);
                    if (rowItems.length === 0) return null;

                    return (
                      <View key={`row_${section.id}_${rowIndex}`} style={styles.tabRow}>
                        {rowItems.map((tab: any) => {
                          const tabConfig = TAB_ICONS[tab.name] || { icon: HelpCircle, color: '#64748B' };
                          const IconComponent = tabConfig.icon;
                          const iconColor = tabConfig.color;

                          return (
                            <TouchableOpacity
                              key={`tab_${tab.name}_${tab.index}`}
                              style={[
                                styles.tabCard,
                                {
                                  width: cardWidth,
                                  backgroundColor: cardBg,
                                  borderColor: cardBorder,
                                  shadowColor: isDark ? '#000' : '#64748B',
                                  shadowOpacity: isDark ? 0.35 : 0.05,
                                }
                              ]}
                              activeOpacity={0.72}
                              onPress={() => setActiveTab(tab.index)}
                            >
                              {/* Clean Icon Display without surrounding borders or containers */}
                              <View style={styles.tabIconWrap}>
                                <IconComponent
                                  size={isSmallDevice ? 26 : 28}
                                  color={iconColor}
                                  strokeWidth={2.2}
                                />
                              </View>

                              {/* Tab Label (Two-line clear text, never truncated) */}
                              <Text
                                style={[
                                  styles.tabLabel,
                                  { 
                                    color: primaryText, 
                                    fontFamily: appFontFamily,
                                    fontSize: scaleFont(isSmallDevice ? 11.5 : 12.5),
                                  }
                                ]}
                                numberOfLines={2}
                                adjustsFontSizeToFit
                                minimumFontScale={0.82}
                              >
                                {tab.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}

                        {/* Spacer elements to maintain column alignment for rows with 1 or 2 items */}
                        {Array.from({ length: 3 - rowItems.length }).map((_, spacerIdx) => (
                          <View key={`spacer_${spacerIdx}`} style={{ width: cardWidth }} />
                        ))}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Fallback Section: Guarantees NO active tab from allTabs is missed */}
          {(() => {
            const unrenderedTabs: any[] = [];
            validTabsMap.forEach((tab, name) => {
              if (!renderedTabNames.has(name)) {
                unrenderedTabs.push(tab);
              }
            });

            if (unrenderedTabs.length === 0) return null;

            return (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitleTxt, { color: primaryText, fontFamily: appFontFamily }]}>
                    Additional Modules
                  </Text>
                  <Text style={[styles.sectionSubtitleTxt, { color: secondaryText }]}>
                    {unrenderedTabs.length} items
                  </Text>
                </View>

                <View style={styles.tabGrid}>
                  {Array.from({ length: Math.ceil(unrenderedTabs.length / 3) }).map((_, rowIndex) => {
                    const rowItems = unrenderedTabs.slice(rowIndex * 3, rowIndex * 3 + 3);
                    if (rowItems.length === 0) return null;

                    return (
                      <View key={`row_fallback_${rowIndex}`} style={styles.tabRow}>
                        {rowItems.map((tab: any) => {
                          const tabConfig = TAB_ICONS[tab.name] || { icon: HelpCircle, color: '#64748B' };
                          const IconComponent = tabConfig.icon;
                          const iconColor = tabConfig.color;

                          return (
                            <TouchableOpacity
                              key={`tab_fallback_${tab.name}_${tab.index}`}
                              style={[
                                styles.tabCard,
                                {
                                  width: cardWidth,
                                  backgroundColor: cardBg,
                                  borderColor: cardBorder,
                                  shadowColor: isDark ? '#000' : '#64748B',
                                  shadowOpacity: isDark ? 0.35 : 0.05,
                                }
                              ]}
                              activeOpacity={0.72}
                              onPress={() => setActiveTab(tab.index)}
                            >
                              {/* Clean Icon Display without surrounding borders or containers */}
                              <View style={styles.tabIconWrap}>
                                <IconComponent
                                  size={isSmallDevice ? 26 : 28}
                                  color={iconColor}
                                  strokeWidth={2.2}
                                />
                              </View>
                              <Text
                                style={[
                                  styles.tabLabel,
                                  { 
                                    color: primaryText, 
                                    fontFamily: appFontFamily,
                                    fontSize: scaleFont(isSmallDevice ? 11.5 : 12.5),
                                  }
                                ]}
                                numberOfLines={2}
                                adjustsFontSizeToFit
                                minimumFontScale={0.82}
                              >
                                {tab.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}

                        {Array.from({ length: 3 - rowItems.length }).map((_, spacerIdx) => (
                          <View key={`spacer_fb_${spacerIdx}`} style={{ width: cardWidth }} />
                        ))}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })()}
        </View>

        {/* ── Bottom Action Buttons: Sign Out & Member View ── */}
        <View style={[styles.bottomActions, { paddingHorizontal: horizontalPadding }]}>
          <TouchableOpacity
            onPress={signOut}
            style={[styles.actionBtn, styles.signOutActionBtn]}
            activeOpacity={0.8}
          >
            <LogOut size={isSmallDevice ? 15 : 17} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.actionBtnTxt}>
              Sign Out
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setViewMode('member');
              try {
                if (navigation?.navigate) {
                  navigation.navigate('Tabs');
                }
              } catch (_) {}
            }}
            style={[styles.actionBtn, styles.memberViewActionBtn]}
            activeOpacity={0.8}
          >
            <Smartphone size={isSmallDevice ? 15 : 17} color="#FCD34D" strokeWidth={2.2} />
            <Text style={[styles.actionBtnTxt, { color: '#FFFFFF' }]}>
              Member View
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingBottom: 36,
  },

  // ── Hero Section (Self-contained LinearGradient) ──
  heroGradientSection: {
    paddingTop: Platform.OS === 'ios' ? 12 : 14,
    paddingBottom: 22,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroLogoRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  heroLogoImg: {
    width: '100%',
    height: '100%',
  },
  heroTextCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    justifyContent: 'center',
  },
  heroChurchName: {
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  heroTagline: {
    marginTop: 2,
    fontWeight: '500',
  },
  quickSwitchBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },

  // ── Centered Admin Header Block ──
  adminCenterHeaderBlock: {
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCenterTitle: {
    fontWeight: '900',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  welcomeCenterText: {
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  welcomeCenterName: {
    fontWeight: '800',
  },

  // ── Sections Container: Positioned Below the Orange Gradient ──
  sectionsContainer: {
    marginTop: 18,
    gap: 18,
  },
  sectionBlock: {
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitleTxt: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  sectionSubtitleTxt: {
    fontSize: 12,
    fontWeight: '500',
  },

  // ── 3-in-a-Row Modern Tab Cards Grid ──
  tabGrid: {
    width: '100%',
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  tabCard: {
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    minHeight: 104,
    overflow: 'hidden',
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  tabIconWrap: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  tabLabel: {
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.1,
    lineHeight: 15,
  },

  // ── Bottom Action Buttons ──
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    paddingBottom: 28,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 24,
    gap: 7,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  signOutActionBtn: {
    backgroundColor: '#9C4325',
  },
  memberViewActionBtn: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(252, 211, 77, 0.4)',
  },
  actionBtnTxt: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
