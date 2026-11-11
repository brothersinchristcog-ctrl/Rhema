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
  Shield
} from 'lucide-react-native';
import { useChurch } from '../../context/ChurchContext';
import { AdminTabContext } from '../../context/AdminTabContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../context/ThemeContext';

// ── Tab 3D Asset Icons (Matches Home Screen Quick Access 3D Style) ──
const TAB_3D_ASSETS: Record<string, { icon: any }> = {
  // Ministry & Word
  'Promises': { icon: require('../../../assets/3d_daily_verse.png') },
  'Daily Verses': { icon: require('../../../assets/3d_daily_verse.png') },
  'Sermons': { icon: require('../../../assets/retro_mic_3d.png') },
  'Songs': { icon: require('../../../assets/3d_sermons.png') },
  'Bible Quiz': { icon: require('../../../assets/3d_bible_quiz.png') },

  // People & Fellowship
  'Members': { icon: require('../../../assets/3d_members_family.png') },
  'Attendance': { icon: require('../../../assets/3d_attendance.png') },
  'Prayers': { icon: require('../../../assets/give_hand_heart.png') },
  'Testimonies': { icon: require('../../../assets/give_hand_heart.png') },
  'Care Cells': { icon: require('../../../assets/gallery_3d_family.png') },
  'Baptism': { icon: require('../../../assets/3d_give.png') },

  // Services & Events
  'Events': { icon: require('../../../assets/3d_events.png') },
  'Schedule': { icon: require('../../../assets/3d_sermon_notes.png') },
  'Service Roster': { icon: require('../../../assets/gallery_3d_stage.png') },
  'Pastor Event': { icon: require('../../../assets/gallery_3d_stage.png') },

  // Finance & Celebrations
  'Donations': { icon: require('../../../assets/3d_give.png') },
  'Expense': { icon: require('../../../assets/3d_give.png') },
  'Celebrations': { icon: require('../../../assets/3d_party_popper.png') },

  // Media & Communications
  'Notifications': { icon: require('../../../assets/3d_contact_us.png') },
  'WhatsApp': { icon: require('../../../assets/3d_contact_us.png') },
  'Gallery': { icon: require('../../../assets/3d_gallery.png') },
  'Online Meetings': { icon: require('../../../assets/3d_online_meetings.png') },

  // Church Management
  'Church Branches': { icon: require('../../../assets/gallery_3d_church.png') },
  'Church Settings': { icon: require('../../../assets/3d_about_us.png') },
  'Support Team': { icon: require('../../../assets/3d_contact_us.png') },
  'App Admin': { icon: require('../../../assets/3d_about_us.png') },
};

// ── Categorized Sections (Grouped Cleanly like Home Screen Quick Access) ──
const SECTIONS = [
  {
    id: 'ministry',
    title: 'Ministry & Word',
    tabNames: ['Promises', 'Daily Verses', 'Sermons', 'Songs', 'Bible Quiz'],
  },
  {
    id: 'people',
    title: 'People & Fellowship',
    tabNames: ['Members', 'Attendance', 'Prayers', 'Testimonies', 'Care Cells', 'Baptism'],
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
  const cardBg = isDark ? '#1C1C22' : '#FFFFFF';
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
        <View pointerEvents="none" style={{ position: 'absolute', top: -800, left: 0, right: 0, height: 800, backgroundColor: isDark ? '#2D180C' : '#FFC59E' }} />

        {/* ── Top Hero Section: Gradient is self-contained so ALL cards start BELOW it ── */}
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

          {/* ── Centered Admin Dashboard Headline (NO icon, perfectly centered) ── */}
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

        {/* ── Main Structured Sections: Completely BELOW the Orange Gradient (Home Screen Quick Access 3D Grid Style) ── */}
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
              <View key={`sec_3d_${section.id}`} style={styles.sectionBlock}>
                {/* Section Header Row */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitleTxt, { color: primaryText, fontFamily: appFontFamily }]}>
                    {section.title}
                  </Text>
                  <Text style={[styles.sectionSubtitleTxt, { color: secondaryText }]}>
                    {sectionTabs.length} items
                  </Text>
                </View>

                {/* 4-in-a-Row 3D Icon Grid (Exact Home Screen Quick Access Pattern) */}
                <View style={styles.grid4Container}>
                  {Array.from({ length: Math.ceil(sectionTabs.length / 4) }).map((_, rowIndex) => {
                    const rowItems = sectionTabs.slice(rowIndex * 4, rowIndex * 4 + 4);
                    if (rowItems.length === 0) return null;

                    return (
                      <View 
                        key={rowIndex} 
                        style={[
                          styles.grid4Row, 
                          rowItems.length < 4 && { justifyContent: 'flex-start', gap: '2.93%' }
                        ]}
                      >
                        {rowItems.map((tab: any) => {
                          const asset = TAB_3D_ASSETS[tab.name] || { icon: require('../../../assets/3d_about_us.png') };

                          return (
                            <TouchableOpacity
                              key={`tab_3d_${tab.name}_${tab.index}`}
                              style={styles.grid4Item}
                              activeOpacity={0.85}
                              onPress={() => setActiveTab(tab.index)}
                            >
                              <View
                                style={[
                                  styles.grid4Card,
                                  {
                                    backgroundColor: cardBg,
                                    borderColor: cardBorder,
                                    shadowColor: '#000',
                                    shadowOpacity: isDark ? 0.25 : 0.05,
                                  }
                                ]}
                              >
                                <Image
                                  source={asset.icon}
                                  style={styles.grid4Icon}
                                  resizeMode="contain"
                                />
                              </View>
                              <Text
                                style={[
                                  styles.grid4Label,
                                  { color: primaryText, fontFamily: appFontFamily }
                                ]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.78}
                              >
                                {tab.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
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

                <View style={styles.grid4Container}>
                  {Array.from({ length: Math.ceil(unrenderedTabs.length / 4) }).map((_, rowIndex) => {
                    const rowItems = unrenderedTabs.slice(rowIndex * 4, rowIndex * 4 + 4);
                    if (rowItems.length === 0) return null;

                    return (
                      <View 
                        key={rowIndex} 
                        style={[
                          styles.grid4Row, 
                          rowItems.length < 4 && { justifyContent: 'flex-start', gap: '2.93%' }
                        ]}
                      >
                        {rowItems.map((tab: any) => {
                          const asset = TAB_3D_ASSETS[tab.name] || { icon: require('../../../assets/3d_about_us.png') };

                          return (
                            <TouchableOpacity
                              key={`tab_fallback_${tab.name}_${tab.index}`}
                              style={styles.grid4Item}
                              activeOpacity={0.85}
                              onPress={() => setActiveTab(tab.index)}
                            >
                              <View
                                style={[
                                  styles.grid4Card,
                                  {
                                    backgroundColor: cardBg,
                                    borderColor: cardBorder,
                                    shadowColor: '#000',
                                    shadowOpacity: isDark ? 0.25 : 0.05,
                                  }
                                ]}
                              >
                                <Image
                                  source={asset.icon}
                                  style={styles.grid4Icon}
                                  resizeMode="contain"
                                />
                              </View>
                              <Text
                                style={[
                                  styles.grid4Label,
                                  { color: primaryText, fontFamily: appFontFamily }
                                ]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.78}
                              >
                                {tab.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
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
    gap: 16,
  },
  sectionBlock: {
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
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

  // ── 4-in-a-Row 3D Icon Grid (Exact Home Screen Pattern) ──
  grid4Container: {
    marginTop: 2,
  },
  grid4Row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  grid4Item: {
    width: '22.8%',
    alignItems: 'center',
  },
  grid4Card: {
    width: '100%',
    aspectRatio: 1.48,
    minHeight: 46,
    maxHeight: 54,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  grid4Icon: {
    width: 38,
    height: 38,
  },
  grid4Label: {
    marginTop: 6,
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.1,
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
