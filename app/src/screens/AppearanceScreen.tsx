import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Check, Building2 } from 'lucide-react-native';
import { useTheme, THEME_OPTIONS, ACCENT_PALETTE, FONT_SIZE_OPTIONS, FONT_SIZE_CONFIG, ThemeAppearance, NavBarStyle, FontSizeOption } from '../context/ThemeContext';

export default function AppearanceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { appearance, setAppearance, accentColor, setAccentColor, quickActionsStyle, setQuickActionsStyle, navBarStyle, setNavBarStyle, fontSize, setFontSize, colors, isDark } = useTheme();

  const screenWidth = Dimensions.get('window').width;
  const cardWidth = (screenWidth - 36 - 14) / 2;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* ── Screen Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'ios' ? 8 : 14) }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
        >
          <ArrowLeft size={20} color={isDark ? '#F4F4F5' : '#1E293B'} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Appearance</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Subtitle Description ── */}
        <Text style={[styles.subtitle, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
          Choose how the app looks on this phone. It is your personal preference — it changes nothing for anyone else.
        </Text>

        {/* ── 2x2 Theme Selection Cards Grid ── */}
        <View style={styles.grid}>
          {THEME_OPTIONS.map((opt) => {
            const isSelected = appearance === opt.id;
            const activeBorderColor = accentColor || '#881337';

            return (
              <TouchableOpacity
                key={opt.id}
                activeOpacity={0.85}
                style={[
                  styles.card,
                  {
                    width: cardWidth,
                    borderColor: isSelected ? activeBorderColor : isDark ? '#27272A' : '#E2E8F0',
                    borderWidth: isSelected ? 2.5 : 1.5,
                    backgroundColor: isDark ? '#121212' : '#FFFFFF',
                  },
                ]}
                onPress={() => setAppearance(opt.id as ThemeAppearance)}
              >
                {/* ── Mockup UI Preview Container ── */}
                <View style={[styles.mockupContainer, { backgroundColor: opt.bg }]}>
                  {/* Outer mockup panel */}
                  <View
                    style={[
                      styles.mockupPanel,
                      {
                        backgroundColor: opt.surface,
                        borderColor: opt.border,
                      },
                    ]}
                  >
                    {/* Simulated header title bar */}
                    <View
                      style={[
                        styles.mockupTitleBar,
                        {
                          backgroundColor:
                            opt.id === 'warm_white'
                              ? '#1E293B'
                              : opt.id === 'pure_white'
                              ? '#0F172A'
                              : opt.id === 'sage_ecru'
                              ? '#15261F'
                              : '#F1F5F9',
                        },
                      ]}
                    />
                    {/* Simulated subtle text line */}
                    <View
                      style={[
                        styles.mockupSubBar,
                        {
                          backgroundColor:
                            opt.id === 'warm_white'
                              ? '#94A3B8'
                              : opt.id === 'pure_white'
                              ? '#94A3B8'
                              : opt.id === 'sage_ecru'
                              ? '#6B7E72'
                              : '#475569',
                        },
                      ]}
                    />
                  </View>

                  {/* Simulated button pill in theme accent color */}
                  <View
                    style={[
                      styles.mockupPill,
                      {
                        backgroundColor: opt.accent,
                      },
                    ]}
                  />
                </View>

                {/* ── Bottom Label & Selection Checkmark ── */}
                <View
                  style={[
                    styles.cardBottomRow,
                    {
                      backgroundColor: isDark ? '#121212' : '#FFFFFF',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.cardName,
                      {
                        color: isDark ? '#F4F4F5' : '#1E293B',
                        fontWeight: isSelected ? '800' : '600',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {opt.name}
                  </Text>

                  {isSelected && (
                    <View style={[styles.checkCircle, { backgroundColor: activeBorderColor }]}>
                      <Check size={12} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Instant Apply Note ── */}
        <Text style={[styles.caption, { color: isDark ? '#64748B' : '#94A3B8' }]}>
          Changes apply instantly, and only on this phone.
        </Text>

        {/* ── Divider ── */}
        <View style={[styles.divider, { backgroundColor: isDark ? '#27272A' : 'rgba(0,0,0,0.06)' }]} />

        {/* ── Font Size Settings Section ── */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Font size</Text>
          <Text style={[styles.sectionDesc, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
            Adjust reading comfort across all screens, tabs, menus, Bible content, and songs. Medium is the default.
          </Text>

          {/* 3-Column Font Size Option Cards */}
          <View style={styles.fontSizeRow}>
            {FONT_SIZE_OPTIONS.map((item) => {
              const isSelected = fontSize === item.id;
              const activeBorderColor = accentColor || '#881337';

              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  style={[
                    styles.fontSizeCard,
                    {
                      borderColor: isSelected ? activeBorderColor : isDark ? '#27272A' : '#E2E8F0',
                      borderWidth: isSelected ? 2.5 : 1.5,
                      backgroundColor: isDark ? '#121212' : '#FFFFFF',
                    },
                  ]}
                  onPress={() => setFontSize(item.id)}
                >
                  {/* Top Preview Badge with unscaled 'Aa' */}
                  <View
                    style={[
                      styles.fontSizeAaBox,
                      {
                        backgroundColor: isSelected
                          ? (isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(37, 99, 235, 0.08)')
                          : isDark ? '#18181B' : '#F8FAFC',
                      },
                    ]}
                  >
                    {/* @ts-ignore */}
                    <Text skipFontScaling
                      style={[
                        styles.fontSizeAaTxt,
                        {
                          fontSize: item.px,
                          color: isSelected ? activeBorderColor : isDark ? '#F4F4F5' : '#1E293B',
                          fontWeight: isSelected ? '800' : '600',
                        },
                      ]}
                    >
                      Aa
                    </Text>
                  </View>

                  {/* Title & Sub */}
                  <View style={styles.fontSizeCardInfo}>
                    <Text
                      style={[
                        styles.fontSizeCardTitle,
                        {
                          color: isDark ? '#F4F4F5' : '#1E293B',
                          fontWeight: isSelected ? '800' : '600',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.fontSizeCardSub,
                        { color: isDark ? '#A1A1AA' : '#64748B' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.displaySub}
                    </Text>
                  </View>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <View style={[styles.fontSizeCheckCircle, { backgroundColor: activeBorderColor }]}>
                      <Check size={11} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Live Preview Card */}
          <View
            style={[
              styles.livePreviewCard,
              {
                backgroundColor: isDark ? '#18181B' : '#F1F5F9',
                borderColor: isDark ? '#27272A' : '#E2E8F0',
              },
            ]}
          >
            <View style={styles.livePreviewHeader}>
              <Text style={[styles.livePreviewBadge, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                LIVE PREVIEW ({(FONT_SIZE_CONFIG[fontSize] || FONT_SIZE_CONFIG.medium).px} PX)
              </Text>
            </View>
            <Text style={[styles.livePreviewScripture, { color: colors.text }]}>
              "Your word is a lamp to my feet and a light to my path."
            </Text>
            <Text style={[styles.livePreviewRef, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
              Psalm 119:105
            </Text>
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={[styles.divider, { backgroundColor: isDark ? '#27272A' : 'rgba(0,0,0,0.06)' }]} />

        {/* ── Quick Actions Layout Section ── */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick actions layout</Text>
          <Text style={[styles.sectionDesc, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
            Choose how quick action buttons appear on your Home screen.
          </Text>

          <View style={styles.grid}>
            {/* Bento Grid Option */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  borderColor: quickActionsStyle === 'bento' ? (accentColor || '#881337') : isDark ? '#27272A' : '#E2E8F0',
                  borderWidth: quickActionsStyle === 'bento' ? 2.5 : 1.5,
                  backgroundColor: isDark ? '#121212' : '#FFFFFF',
                },
              ]}
              onPress={() => setQuickActionsStyle('bento')}
            >
              <View style={[styles.qaMockupContainer, { backgroundColor: isDark ? '#09090B' : '#FAF7F2' }]}>
                <View style={styles.bentoMockTop}>
                  <View style={[styles.bentoMockTall, { backgroundColor: accentColor || '#881337' }]} />
                  <View style={styles.bentoMockCol}>
                    <View style={[styles.bentoMockSmall, { backgroundColor: '#38BDF8' }]} />
                    <View style={[styles.bentoMockSmall, { backgroundColor: '#A855F7' }]} />
                  </View>
                </View>
                <View style={[styles.bentoMockWide, { backgroundColor: '#F59E0B' }]} />
              </View>

              <View style={[styles.cardBottomRow, { backgroundColor: isDark ? '#121212' : '#FFFFFF', height: 52 }]}>
                <View style={{ flex: 1, marginRight: 4 }}>
                  <Text
                    style={[
                      styles.cardName,
                      {
                        color: isDark ? '#F4F4F5' : '#1E293B',
                        fontWeight: quickActionsStyle === 'bento' ? '800' : '600',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    Bento Cards
                  </Text>
                  <Text style={[styles.qaCardSub, { color: isDark ? '#A1A1AA' : '#64748B' }]} numberOfLines={1}>
                    Modern asymmetric
                  </Text>
                </View>

                {quickActionsStyle === 'bento' && (
                  <View style={[styles.checkCircle, { backgroundColor: accentColor || '#881337' }]}>
                    <Check size={12} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* 4-in-a-Row Icons Option */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  borderColor: quickActionsStyle === 'grid' ? (accentColor || '#881337') : isDark ? '#27272A' : '#E2E8F0',
                  borderWidth: quickActionsStyle === 'grid' ? 2.5 : 1.5,
                  backgroundColor: isDark ? '#121212' : '#FFFFFF',
                },
              ]}
              onPress={() => setQuickActionsStyle('grid')}
            >
              <View style={[styles.qaMockupContainer, { backgroundColor: isDark ? '#09090B' : '#FAF7F2' }]}>
                <View style={styles.grid4MockRow}>
                  {[accentColor || '#881337', '#38BDF8', '#A855F7', '#F59E0B'].map((c, i) => (
                    <View key={i} style={styles.grid4MockCol}>
                      <View style={[styles.grid4MockTile, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
                        <View style={[styles.grid4MockDot, { backgroundColor: c }]} />
                      </View>
                      <View style={[styles.grid4MockLine, { backgroundColor: isDark ? '#3F3F46' : '#94A3B8' }]} />
                    </View>
                  ))}
                </View>
                <View style={[styles.grid4MockRow, { marginTop: 6 }]}>
                  {['#10B981', '#EC4899', '#6366F1', '#14B8A6'].map((c, i) => (
                    <View key={i} style={styles.grid4MockCol}>
                      <View style={[styles.grid4MockTile, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
                        <View style={[styles.grid4MockDot, { backgroundColor: c }]} />
                      </View>
                      <View style={[styles.grid4MockLine, { backgroundColor: isDark ? '#3F3F46' : '#94A3B8' }]} />
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.cardBottomRow, { backgroundColor: isDark ? '#121212' : '#FFFFFF', height: 52 }]}>
                <View style={{ flex: 1, marginRight: 4 }}>
                  <Text
                    style={[
                      styles.cardName,
                      {
                        color: isDark ? '#F4F4F5' : '#1E293B',
                        fontWeight: quickActionsStyle === 'grid' ? '800' : '600',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    4-in-a-Row
                  </Text>
                  <Text style={[styles.qaCardSub, { color: isDark ? '#A1A1AA' : '#64748B' }]} numberOfLines={1}>
                    Clean 3D icon tiles
                  </Text>
                </View>

                {quickActionsStyle === 'grid' && (
                  <View style={[styles.checkCircle, { backgroundColor: accentColor || '#881337' }]}>
                    <Check size={12} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={[styles.divider, { backgroundColor: isDark ? '#27272A' : 'rgba(0,0,0,0.06)' }]} />

        {/* ── Navigation Buttons Style Section ── */}
        <View style={styles.sectionWrap}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Navigation buttons</Text>
          <Text style={[styles.sectionDesc, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
            Choose your preferred bottom navigation bar style.
          </Text>

          <View style={styles.grid}>
            {/* Minimal Capsule Option */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  borderColor: navBarStyle === 'capsule' ? (accentColor || '#881337') : isDark ? '#27272A' : '#E2E8F0',
                  borderWidth: navBarStyle === 'capsule' ? 2.5 : 1.5,
                  backgroundColor: isDark ? '#121212' : '#FFFFFF',
                },
              ]}
              onPress={() => setNavBarStyle('capsule')}
            >
              <View style={[styles.qaMockupContainer, { backgroundColor: isDark ? '#09090B' : '#FAF7F2', justifyContent: 'flex-end', paddingBottom: 10 }]}>
                {/* Simulated edge-to-edge capsule bar */}
                <View style={[styles.navMockCapsuleBar, { backgroundColor: isDark ? '#12141A' : '#FFFFFF', borderColor: isDark ? '#272B35' : '#E2E8F0' }]}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.navMockCapsuleActive, { backgroundColor: isDark ? '#232936' : (accentColor ? `${accentColor}20` : '#F1F5F9'), height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' }]}>
                      <View style={[styles.navMockHomeShape, { backgroundColor: isDark ? '#FFFFFF' : (accentColor || '#2563EB') }]} />
                      <View style={[styles.navMockLabelLine, { backgroundColor: isDark ? '#FFFFFF' : (accentColor || '#2563EB'), marginTop: 2 }]} />
                    </View>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.navMockIconDot, { borderColor: isDark ? '#71717A' : '#94A3B8' }]} />
                    <View style={[styles.navMockLabelLine, { backgroundColor: isDark ? '#71717A' : '#94A3B8' }]} />
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.navMockIconDot, { borderColor: isDark ? '#71717A' : '#94A3B8' }]} />
                    <View style={[styles.navMockLabelLine, { backgroundColor: isDark ? '#71717A' : '#94A3B8' }]} />
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ position: 'relative' }}>
                      <View style={[styles.navMockIconDot, { borderColor: isDark ? '#71717A' : '#94A3B8' }]} />
                      <View style={styles.navMockRedDot} />
                    </View>
                    <View style={[styles.navMockLabelLine, { backgroundColor: isDark ? '#71717A' : '#94A3B8' }]} />
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <View style={[styles.navMockIconDot, { borderColor: isDark ? '#71717A' : '#94A3B8' }]} />
                    <View style={[styles.navMockLabelLine, { backgroundColor: isDark ? '#71717A' : '#94A3B8' }]} />
                  </View>
                </View>
              </View>

              <View style={[styles.cardBottomRow, { backgroundColor: isDark ? '#121212' : '#FFFFFF', height: 52 }]}>
                <View style={{ flex: 1, marginRight: 4 }}>
                  <Text
                    style={[
                      styles.cardName,
                      {
                        color: isDark ? '#F4F4F5' : '#1E293B',
                        fontWeight: navBarStyle === 'capsule' ? '800' : '600',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    Minimal Capsule
                  </Text>
                  <Text style={[styles.qaCardSub, { color: isDark ? '#A1A1AA' : '#64748B' }]} numberOfLines={1}>
                    Edge-to-edge with labels
                  </Text>
                </View>

                {navBarStyle === 'capsule' && (
                  <View style={[styles.checkCircle, { backgroundColor: accentColor || '#881337' }]}>
                    <Check size={12} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>
            </TouchableOpacity>

            {/* Floating Pill Option */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  borderColor: navBarStyle === 'pill' ? (accentColor || '#881337') : isDark ? '#27272A' : '#E2E8F0',
                  borderWidth: navBarStyle === 'pill' ? 2.5 : 1.5,
                  backgroundColor: isDark ? '#121212' : '#FFFFFF',
                },
              ]}
              onPress={() => setNavBarStyle('pill')}
            >
              <View style={[styles.qaMockupContainer, { backgroundColor: isDark ? '#09090B' : '#FAF7F2', justifyContent: 'flex-end', paddingBottom: 14 }]}>
                {/* Simulated floating pill bar */}
                <View style={[styles.navMockFloatingPill, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? '#27272A' : '#E2E8F0' }]}>
                  {/* Active circular pill */}
                  <View style={[styles.navMockPillActiveCircle, { backgroundColor: accentColor || '#059669' }]}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#FFFFFF' }} />
                  </View>
                  <View style={[styles.navMockIconDot, { borderColor: isDark ? '#71717A' : '#94A3B8' }]} />
                  <View style={[styles.navMockIconDot, { borderColor: isDark ? '#71717A' : '#94A3B8' }]} />
                  <View style={[styles.navMockIconDot, { borderColor: isDark ? '#71717A' : '#94A3B8' }]} />
                </View>
              </View>

              <View style={[styles.cardBottomRow, { backgroundColor: isDark ? '#121212' : '#FFFFFF', height: 52 }]}>
                <View style={{ flex: 1, marginRight: 4 }}>
                  <Text
                    style={[
                      styles.cardName,
                      {
                        color: isDark ? '#F4F4F5' : '#1E293B',
                        fontWeight: navBarStyle === 'pill' ? '800' : '600',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    Floating Pill
                  </Text>
                  <Text style={[styles.qaCardSub, { color: isDark ? '#A1A1AA' : '#64748B' }]} numberOfLines={1}>
                    Classic floating bar
                  </Text>
                </View>

                {navBarStyle === 'pill' && (
                  <View style={[styles.checkCircle, { backgroundColor: accentColor || '#881337' }]}>
                    <Check size={12} color="#FFFFFF" strokeWidth={3} />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={[styles.divider, { backgroundColor: isDark ? '#27272A' : 'rgba(0,0,0,0.06)' }]} />

        {/* ── Accent Color Section ── */}
        <View style={styles.accentSection}>
          <Text style={[styles.accentTitle, { color: colors.text }]}>Accent color</Text>
          <Text style={[styles.accentDesc, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
            Your own accent, on this phone. The first dot is your space's color — tap any other to wear it everywhere in the app, instantly.
          </Text>

          <View style={styles.paletteRow}>
            {ACCENT_PALETTE.map((item, idx) => {
              const isSelected = accentColor === item.color;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.colorDot,
                    {
                      backgroundColor: item.color,
                      transform: [{ scale: isSelected ? 1.08 : 1 }],
                    },
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setAccentColor(item.color)}
                >
                  {idx === 0 && !isSelected && (
                    <Building2 size={16} color="#FFFFFF" strokeWidth={2.2} />
                  )}
                  {isSelected && (
                    <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerRightSpacer: {
    width: 42,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 22,
    marginBottom: 20,
    fontWeight: '400',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  mockupContainer: {
    height: 104,
    padding: 12,
    justifyContent: 'space-between',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  mockupPanel: {
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 10,
    justifyContent: 'center',
    gap: 4,
  },
  mockupTitleBar: {
    width: '68%',
    height: 6,
    borderRadius: 3,
  },
  mockupSubBar: {
    width: '42%',
    height: 5,
    borderRadius: 2.5,
  },
  mockupPill: {
    width: '62%',
    height: 16,
    borderRadius: 8,
    marginTop: 6,
  },
  cardBottomRow: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  cardName: {
    fontSize: 14,
    letterSpacing: -0.2,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 22,
    fontWeight: '400',
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 22,
  },
  accentSection: {
    marginTop: 4,
  },
  accentTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  accentDesc: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 4,
  },
  colorDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionWrap: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  qaMockupContainer: {
    height: 104,
    padding: 10,
    justifyContent: 'center',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  qaCardSub: {
    fontSize: 11,
    marginTop: 1,
    fontWeight: '500',
  },
  bentoMockTop: {
    flexDirection: 'row',
    gap: 6,
    height: 52,
    marginBottom: 5,
  },
  bentoMockTall: {
    flex: 1.2,
    borderRadius: 6,
    opacity: 0.9,
  },
  bentoMockCol: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 4,
  },
  bentoMockSmall: {
    flex: 1,
    borderRadius: 5,
    opacity: 0.85,
  },
  bentoMockWide: {
    height: 18,
    borderRadius: 5,
    opacity: 0.85,
  },
  grid4MockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  grid4MockCol: {
    width: '22%',
    alignItems: 'center',
  },
  grid4MockTile: {
    width: '100%',
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid4MockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  grid4MockLine: {
    width: 14,
    height: 3,
    borderRadius: 1.5,
    marginTop: 3,
  },

  fontSizeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  fontSizeCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  fontSizeAaBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  fontSizeAaTxt: {
    textAlign: 'center',
  },
  fontSizeCardInfo: {
    alignItems: 'center',
  },
  fontSizeCardTitle: {
    fontSize: 13,
    textAlign: 'center',
  },
  fontSizeCardSub: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  fontSizeCheckCircle: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePreviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 14,
  },
  livePreviewHeader: {
    marginBottom: 6,
  },
  livePreviewBadge: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  livePreviewScripture: {
    fontSize: 15.5,
    fontStyle: 'italic',
    lineHeight: 23,
  },
  livePreviewRef: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 6,
  },

  navMockCapsuleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 8,
    width: '100%',
  },
  navMockCapsuleActive: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  navMockHomeShape: {
    width: 12,
    height: 8,
    borderRadius: 2,
  },
  navMockLabelLine: {
    width: 14,
    height: 3,
    borderRadius: 1.5,
  },
  navMockIconDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  navMockRedDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EF4444',
  },
  navMockFloatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 10,
    width: '85%',
    alignSelf: 'center',
  },
  navMockPillActiveCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

});

