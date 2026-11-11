import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  RefreshControl,
  Modal,
  ActivityIndicator,
  TextInput,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Crown,
  Sparkles,
  Calendar,
  ChevronUp,
  MoreVertical,
  BookOpen,
} from 'lucide-react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Path,
  G,
  Text as SvgText,
  Circle,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAdminTheme } from '../../utils/adminThemeHelper';
import { useChurch } from '../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../constants/ChurchConfig';
import { useAuth } from '../../context/AuthContext';
import { QuizService } from '../../services/QuizService';
import { LeaderboardEntry } from '../../types/Quiz';

type LeaderboardCategory = 'daily' | 'church';
type PeriodFilter = 'today' | 'week' | 'month' | 'year' | 'custom';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function BibleQuizLeaderboardScreen() {
  const { isDark: _adminIsDark, primaryText, secondaryText } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isDark } = useTheme();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const churchId = activeChurch?.id || RHEMA_CHURCH_ID;

  // Selected Category: 'daily' (Daily Bible Quiz) or 'church' (Church Quizzes)
  const [selectedCategory, setSelectedCategory] = useState<LeaderboardCategory>('daily');
  const [tempCategory, setTempCategory] = useState<LeaderboardCategory>('daily');

  // Filter: 'today' | 'week' | 'month' | 'year' | 'custom'
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('month');
  const [tempPeriod, setTempPeriod] = useState<PeriodFilter>('month');

  // Options Sheet Modal (opened by three-dots button in top-right corner)
  const [optionsModalVisible, setOptionsModalVisible] = useState<boolean>(false);

  // Custom Range state
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [tempStartDate, setTempStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [tempEndDate, setTempEndDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Leaderboard data
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadLeaderboardData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const currentUserPhoto =
        (member as any)?.profilePhoto ||
        (member as any)?.photoURL ||
        (member as any)?.photoUrl ||
        (member as any)?.profileImageUrl ||
        (member as any)?.PhotoUrl ||
        (member as any)?.Photo ||
        (member as any)?.avatar ||
        user?.photoURL ||
        undefined;

      const currentUserName =
        (member as any)?.name ||
        (member as any)?.Name ||
        user?.displayName ||
        undefined;

      const list = await QuizService.getCategorizedLeaderboard({
        churchId,
        category: selectedCategory,
        period: selectedPeriod,
        customStartDate: selectedPeriod === 'custom' ? customStartDate : undefined,
        customEndDate: selectedPeriod === 'custom' ? customEndDate : undefined,
        currentUserId: user?.uid,
        currentUserAvatar: currentUserPhoto,
        currentUserName: currentUserName,
      });

      setEntries(list);
    } catch (err) {
      console.warn('[BibleQuizLeaderboard] Error loading leaderboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [churchId, selectedCategory, selectedPeriod, customStartDate, customEndDate, user?.uid, user?.photoURL, user?.displayName, member]);

  useEffect(() => {
    loadLeaderboardData();
  }, [loadLeaderboardData]);

  const handleRefresh = () => {
    loadLeaderboardData(true);
  };

  // Open Options Modal
  const handleOpenOptions = () => {
    setTempCategory(selectedCategory);
    setTempPeriod(selectedPeriod);
    setTempStartDate(customStartDate);
    setTempEndDate(customEndDate);
    setOptionsModalVisible(true);
  };

  // Apply Options from Modal
  const handleApplyOptions = () => {
    setSelectedCategory(tempCategory);
    setSelectedPeriod(tempPeriod);
    setCustomStartDate(tempStartDate);
    setCustomEndDate(tempEndDate);
    setOptionsModalVisible(false);
  };

  // Top 3 entries
  const top1 = entries[0];
  const top2 = entries[1];
  const top3 = entries[2];
  const remainingEntries = entries.slice(3);

  // Subtitle matching reference image (e.g. "Daily Bible Quiz · February 2026")
  const periodSubtitle = useMemo(() => {
    const now = new Date();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const categoryLabel = selectedCategory === 'church' ? 'Church Quizzes' : 'Daily Bible Quiz';
    if (selectedPeriod === 'today') return `${categoryLabel} · Today`;
    if (selectedPeriod === 'week') return `${categoryLabel} · This Week`;
    if (selectedPeriod === 'month') return `${categoryLabel} · ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    if (selectedPeriod === 'year') return `${categoryLabel} · Year ${now.getFullYear()}`;
    if (selectedPeriod === 'custom') return `${categoryLabel} · ${customStartDate} – ${customEndDate}`;
    return `${categoryLabel} · ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  }, [selectedCategory, selectedPeriod, customStartDate, customEndDate]);

  // Safe bottom padding: generous margin + explicit spacer so the 50th member is never hidden behind Android navigation bar
  const safeBottomPadding =
    Platform.OS === 'android'
      ? Math.max(insets.bottom, 48) + 90
      : Math.max(insets.bottom, 24) + 60;

  const filterTabs: Array<{ key: PeriodFilter; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year', label: 'This Year' },
    { key: 'custom', label: 'Custom Range' },
  ];

  const getAvatarInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getFirstName = (fullName?: string) => {
    if (!fullName) return '';
    const trimmed = fullName.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1 && /^(pastor|bro|brother|sis|sister|dr|mr|mrs|rev|elder)\.?$/i.test(parts[0])) {
      return parts[1];
    }
    return parts[0] || trimmed;
  };

  const getAvatarUri = (entry?: LeaderboardEntry) => {
    if (!entry) return undefined;
    if (entry.memberAvatar) return entry.memberAvatar;
    if (entry.isCurrentUser) {
      return (
        (member as any)?.profilePhoto ||
        (member as any)?.photoURL ||
        (member as any)?.photoUrl ||
        (member as any)?.profileImageUrl ||
        (member as any)?.PhotoUrl ||
        (member as any)?.Photo ||
        (member as any)?.avatar ||
        user?.photoURL ||
        undefined
      );
    }
    return undefined;
  };

  return (
    <LinearGradient
      colors={['#dcd8f5', '#eceaf8', '#f7f6fb', '#fbfbfd']}
      locations={[0, 0.38, 0.62, 1]}
      style={styles.container}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#dcd8f5"
      />

      {/* ── Screen Header: Circular 'X' Back, Centered Title, Circular 3-Dots Button ── */}
      <View
        style={[
          styles.headerRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 6,
          },
        ]}
      >
        {/* Left: Circular 'X' Button (Clean White Circle with Dark Icon) */}
        <TouchableOpacity
          style={[
            styles.circularNavBtn,
            {
              backgroundColor: '#FFFFFF',
              borderColor: 'rgba(0, 0, 0, 0.08)',
            },
          ]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <X size={18} color="#0F172A" strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Center: "Leaderboard" Title & Subtitle */}
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitleTxt}>
            Leaderboard
          </Text>
          <Text style={styles.headerSubtitleTxt}>
            {periodSubtitle}
          </Text>
        </View>

        {/* Right: Circular Three-Dots Button (Clean White Circle with Dark Icon) */}
        <TouchableOpacity
          style={[
            styles.circularNavBtn,
            {
              backgroundColor: '#FFFFFF',
              borderColor: 'rgba(0, 0, 0, 0.08)',
            },
          ]}
          onPress={handleOpenOptions}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <MoreVertical size={18} color="#0F172A" strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      {/* ── Main Body (Podium at Top, 50 Members Inside Scrollable Below) ── */}
      <View style={styles.mainContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={[styles.loadingTxt, { color: secondaryText }]}>Loading leaderboard...</Text>
          </View>
        ) : (
          <>
            {/* ── UNIFIED 3D ISOMETRIC PODIUM SECTION (Avatars resting directly ON the cards) ── */}
            <View style={styles.unifiedPodiumContainer}>
              {/* Stand 2 (Left - Top 2) */}
              <View style={styles.standColumnLeft}>
                {top2 && (
                  <View style={styles.personOnCardContainer}>
                    <View style={[styles.avatarCircle, { borderColor: '#93C5FD', backgroundColor: '#DBEAFE' }]}>
                      {getAvatarUri(top2) ? (
                        <Image source={{ uri: getAvatarUri(top2) }} style={styles.avatarImg} />
                      ) : (
                        <Text style={[styles.initialsTxt, { color: '#2563EB' }]}>
                          {getAvatarInitials(top2.memberName)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.personNameTxt} numberOfLines={1}>
                      {getFirstName(top2.memberName)}
                    </Text>
                    <View style={styles.coinsPill}>
                      <Text style={styles.coinsPillTxt}>
                        {top2.totalPoints.toLocaleString()} points
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Stand 1 (Center - Top 1 with Gold Crown) */}
              <View style={styles.standColumnCenter}>
                {top1 && (
                  <View style={styles.personOnCardContainerCenter}>
                    {/* Clean Floating Gold Crown (No stars) */}
                    <View style={styles.crownContainer}>
                      <Crown size={28} color="#FBBF24" fill="#FBBF24" />
                    </View>

                    <View style={[styles.avatarCircleCenter, { borderColor: '#FBBF24', backgroundColor: '#FEF3C7' }]}>
                      {getAvatarUri(top1) ? (
                        <Image source={{ uri: getAvatarUri(top1) }} style={styles.avatarImg} />
                      ) : (
                        <Text style={[styles.initialsTxtCenter, { color: '#D97706' }]}>
                          {getAvatarInitials(top1.memberName)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.personNameTxtCenter} numberOfLines={1}>
                      {getFirstName(top1.memberName)}
                    </Text>
                    <View style={styles.coinsPillCenter}>
                      <Text style={styles.coinsPillTxtCenter}>
                        {top1.totalPoints.toLocaleString()} points
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Stand 3 (Right - Top 3) */}
              <View style={styles.standColumnRight}>
                {top3 && (
                  <View style={styles.personOnCardContainer}>
                    <View style={[styles.avatarCircle, { borderColor: '#86EFAC', backgroundColor: '#D1FAE5' }]}>
                      {getAvatarUri(top3) ? (
                        <Image source={{ uri: getAvatarUri(top3) }} style={styles.avatarImg} />
                      ) : (
                        <Text style={[styles.initialsTxt, { color: '#059669' }]}>
                          {getAvatarInitials(top3.memberName)}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.personNameTxt} numberOfLines={1}>
                      {getFirstName(top3.memberName)}
                    </Text>
                    <View style={styles.coinsPill}>
                      <Text style={styles.coinsPillTxt}>
                        {top3.totalPoints.toLocaleString()} points
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* ── Exact 3D Isometric Stand Geometry With Connecting Perspective Lines ── */}
              <View style={styles.svgStandsUnderlay} pointerEvents="none">
                <Svg width="100%" height={340} viewBox="0 0 360 340">
                  <Defs>
                    {/* Stand 2 (Blue) Front Gradient */}
                    <SvgLinearGradient id="blueFront" x1="0%" y1="0%" x2="0%" y2="100%">
                      <Stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.95" />
                      <Stop offset="30%" stopColor="#38BDF8" stopOpacity="0.92" />
                      <Stop offset="100%" stopColor="#0284C7" stopOpacity="0.8" />
                    </SvgLinearGradient>

                    {/* Stand 2 (Blue) 3D Isometric Top Face */}
                    <SvgLinearGradient id="blueTop" x1="0%" y1="0%" x2="100%" y2="100%">
                      <Stop offset="0%" stopColor="#F0F9FF" />
                      <Stop offset="100%" stopColor="#BAE6FD" />
                    </SvgLinearGradient>

                    {/* Stand 1 (Purple) Front Gradient */}
                    <SvgLinearGradient id="purpleFront" x1="0%" y1="0%" x2="0%" y2="100%">
                      <Stop offset="0%" stopColor="#C084FC" stopOpacity="0.98" />
                      <Stop offset="35%" stopColor="#A855F7" stopOpacity="0.94" />
                      <Stop offset="100%" stopColor="#7C3AED" stopOpacity="0.82" />
                    </SvgLinearGradient>

                    {/* Stand 1 (Purple) 3D Isometric Top Face */}
                    <SvgLinearGradient id="purpleTop" x1="0%" y1="0%" x2="100%" y2="100%">
                      <Stop offset="0%" stopColor="#FAF5FF" />
                      <Stop offset="100%" stopColor="#DDD6FE" />
                    </SvgLinearGradient>

                    {/* Stand 3 (Mint Green) Front Gradient */}
                    <SvgLinearGradient id="mintFront" x1="0%" y1="0%" x2="0%" y2="100%">
                      <Stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.95" />
                      <Stop offset="30%" stopColor="#34D399" stopOpacity="0.92" />
                      <Stop offset="100%" stopColor="#059669" stopOpacity="0.8" />
                    </SvgLinearGradient>

                    {/* Stand 3 (Mint Green) 3D Isometric Top Face */}
                    <SvgLinearGradient id="mintTop" x1="0%" y1="0%" x2="100%" y2="100%">
                      <Stop offset="0%" stopColor="#ECFDF5" />
                      <Stop offset="100%" stopColor="#A7F3D0" />
                    </SvgLinearGradient>
                  </Defs>

                  {/* ── 1. STAND 2 (LEFT - BLUE) ── */}
                  <G id="Stand2">
                    {/* 3D Isometric Top Surface (lines angling up and into 3D) */}
                    <Path
                      d="M 24 208 L 38 188 L 130 188 L 118 208 Z"
                      fill="url(#blueTop)"
                      stroke="rgba(255, 255, 255, 0.7)"
                      strokeWidth="1.2"
                    />
                    {/* Front Face */}
                    <Path
                      d="M 24 208 L 118 208 L 118 340 L 24 340 Z"
                      fill="url(#blueFront)"
                      stroke="rgba(255, 255, 255, 0.25)"
                      strokeWidth="1"
                    />
                    {/* Laurel Wreath Arc & Number 2 */}
                    <Path
                      d="M 57 244 C 53 256 63 264 71 264 C 79 264 89 256 85 244"
                      stroke="rgba(255, 255, 255, 0.85)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <Circle cx="56" cy="244" r="2.2" fill="rgba(255,255,255,0.9)" />
                    <Circle cx="86" cy="244" r="2.2" fill="rgba(255,255,255,0.9)" />
                    <SvgText
                      x="71"
                      y="252"
                      fontSize="22"
                      fontWeight="900"
                      fill="#FFFFFF"
                      textAnchor="middle"
                    >
                      2
                    </SvgText>
                  </G>

                  {/* ── 2. STAND 3 (RIGHT - MINT GREEN) ── */}
                  <G id="Stand3">
                    {/* 3D Isometric Top Surface */}
                    <Path
                      d="M 242 208 L 230 188 L 322 188 L 336 208 Z"
                      fill="url(#mintTop)"
                      stroke="rgba(255, 255, 255, 0.7)"
                      strokeWidth="1.2"
                    />
                    {/* Front Face */}
                    <Path
                      d="M 242 208 L 336 208 L 336 340 L 242 340 Z"
                      fill="url(#mintFront)"
                      stroke="rgba(255, 255, 255, 0.25)"
                      strokeWidth="1"
                    />
                    {/* Laurel Wreath Arc & Number 3 */}
                    <Path
                      d="M 275 244 C 271 256 281 264 289 264 C 297 264 307 256 303 244"
                      stroke="rgba(255, 255, 255, 0.85)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <Circle cx="274" cy="244" r="2.2" fill="rgba(255,255,255,0.9)" />
                    <Circle cx="304" cy="244" r="2.2" fill="rgba(255,255,255,0.9)" />
                    <SvgText
                      x="289"
                      y="252"
                      fontSize="22"
                      fontWeight="900"
                      fill="#FFFFFF"
                      textAnchor="middle"
                    >
                      3
                    </SvgText>
                  </G>

                  {/* ── 3. STAND 1 (CENTER - PURPLE, TALLEST & FOREGROUND) ── */}
                  <G id="Stand1">
                    {/* 3D Left Vertical Depth Wall (connects Blue top at Y=208/188 up to Purple top at Y=168/148) */}
                    <Path
                      d="M 118 168 L 130 148 L 130 188 L 118 208 Z"
                      fill="#6B21A8"
                      opacity="0.45"
                      stroke="rgba(255, 255, 255, 0.3)"
                      strokeWidth="0.8"
                    />
                    {/* 3D Right Vertical Depth Wall (connects Green top at Y=208/188 up to Purple top at Y=168/148) */}
                    <Path
                      d="M 242 168 L 230 148 L 230 188 L 242 208 Z"
                      fill="#6B21A8"
                      opacity="0.4"
                      stroke="rgba(255, 255, 255, 0.3)"
                      strokeWidth="0.8"
                    />

                    {/* 3D Isometric Top Surface (Lilac sheen diamond) */}
                    <Path
                      d="M 118 168 L 130 148 L 230 148 L 242 168 Z"
                      fill="url(#purpleTop)"
                      stroke="rgba(255, 255, 255, 0.85)"
                      strokeWidth="1.5"
                    />

                    {/* Front Face: The vertical lines dividing the cards */}
                    <Path
                      d="M 118 168 L 242 168 L 242 340 L 118 340 Z"
                      fill="url(#purpleFront)"
                      stroke="rgba(255, 255, 255, 0.4)"
                      strokeWidth="1.2"
                    />

                    {/* Laurel Wreath Arc & Number 1 */}
                    <Path
                      d="M 164 214 C 158 230 170 240 180 240 C 190 240 202 230 196 214"
                      stroke="rgba(255, 255, 255, 0.9)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <Circle cx="163" cy="214" r="2.5" fill="rgba(255,255,255,0.95)" />
                    <Circle cx="197" cy="214" r="2.5" fill="rgba(255,255,255,0.95)" />
                    <SvgText
                      x="180"
                      y="224"
                      fontSize="28"
                      fontWeight="900"
                      fill="#FFFFFF"
                      textAnchor="middle"
                    >
                      1
                    </SvgText>
                  </G>
                </Svg>
              </View>
            </View>

            {/* ── EXACT BOTTOM SHEET CONTAINER (Up to 50 Members, Inside Scrollable) ── */}
            <View
              style={[
                styles.bottomSheetCard,
                {
                  backgroundColor: '#FFFFFF',
                  borderColor: 'rgba(0, 0, 0, 0.04)',
                },
              ]}
            >
              {/* Drag Chevron indicator handle */}
              <View style={styles.sheetHandleWrap}>
                <ChevronUp size={20} color="#9CA3AF" strokeWidth={2.4} />
              </View>

              {/* Inside Scrollable List for remaining 47 members */}
              <ScrollView
                style={styles.sheetScrollView}
                contentContainerStyle={[styles.sheetScrollContent, { paddingBottom: safeBottomPadding }]}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
              >
                {remainingEntries.length === 0 ? (
                  <View style={styles.emptyListWrap}>
                    <Text style={[styles.emptyListTxt, { color: '#64748B', textAlign: 'center', lineHeight: 20 }]}>
                      {entries.length === 0
                        ? 'No quiz completions in this period yet.\nComplete a quiz to take the #1 spot!'
                        : 'No other rankings in this period yet.'}
                    </Text>
                  </View>
                ) : (
                  remainingEntries.map((entry, idx) => {
                    const avatarUri = getAvatarUri(entry);
                    return (
                      <View
                        key={entry.userId || idx}
                        style={[
                          styles.entryRowCard,
                          {
                            backgroundColor: '#F8FAFC',
                          },
                        ]}
                      >
                        {/* Avatar */}
                        <View style={styles.listAvatarWrap}>
                          {avatarUri ? (
                            <Image source={{ uri: avatarUri }} style={styles.listAvatarImg} />
                          ) : (
                            <View
                              style={[
                                styles.listAvatarFallback,
                                {
                                  backgroundColor: '#E2E8F0',
                                },
                              ]}
                            >
                              <Text style={[styles.listAvatarInitials, { color: '#0F172A' }]}>
                                {getAvatarInitials(entry.memberName)}
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Name & Coins in clean vertical stack */}
                        <View style={styles.entryInfoWrap}>
                          <Text style={[styles.entryNameTxt, { color: '#0F172A' }]} numberOfLines={1}>
                            {entry.memberName}
                          </Text>
                          <Text style={[styles.entryCoinsTxt, { color: '#000000' }]}>
                            {entry.totalPoints.toLocaleString()} points
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
                {/* Generous navigation safe spacer guaranteeing 50th card is never hidden behind device navigation buttons */}
                <View style={{ height: Platform.OS === 'android' ? 70 : 35 }} />
              </ScrollView>
            </View>
          </>
        )}
      </View>

      {/* ── Three-Dots Options & Filter Badges Modal ── */}
      <Modal
        visible={optionsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setOptionsModalVisible(false)}
        >
          <View
            style={[
              styles.optionsModalCard,
              {
                backgroundColor: isDark ? '#141A29' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            {/* Modal Header */}
            <View style={styles.optionsModalHeader}>
              <Text style={[styles.optionsModalTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>
                Leaderboard Filters
              </Text>
              <TouchableOpacity
                onPress={() => setOptionsModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>

            {/* 1. Category Switch */}
            <Text style={[styles.filterSectionTitle, { color: isDark ? '#CBD5E1' : '#475569' }]}>
              LEADERBOARD CATEGORY
            </Text>
            <View style={styles.categoryButtonGroup}>
              <TouchableOpacity
                style={[
                  styles.categorySelectBtn,
                  tempCategory === 'daily'
                    ? [styles.categorySelectBtnActive, { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }]
                    : [styles.categorySelectBtnInactive, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9' }],
                ]}
                onPress={() => setTempCategory('daily')}
                activeOpacity={0.8}
              >
                <Sparkles size={16} color={tempCategory === 'daily' ? (isDark ? '#000000' : '#FFFFFF') : '#D97706'} />
                <Text
                  style={[
                    styles.categorySelectBtnTxt,
                    { color: tempCategory === 'daily' ? (isDark ? '#000000' : '#FFFFFF') : (isDark ? '#E2E8F0' : '#334155') },
                  ]}
                >
                  Daily Bible Quiz
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.categorySelectBtn,
                  tempCategory === 'church'
                    ? [styles.categorySelectBtnActive, { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }]
                    : [styles.categorySelectBtnInactive, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9' }],
                ]}
                onPress={() => setTempCategory('church')}
                activeOpacity={0.8}
              >
                <BookOpen size={16} color={tempCategory === 'church' ? (isDark ? '#000000' : '#FFFFFF') : '#2563EB'} />
                <Text
                  style={[
                    styles.categorySelectBtnTxt,
                    { color: tempCategory === 'church' ? (isDark ? '#000000' : '#FFFFFF') : (isDark ? '#E2E8F0' : '#334155') },
                  ]}
                >
                  Church Quizzes
                </Text>
              </TouchableOpacity>
            </View>

            {/* 2. Time Filter Badges */}
            <Text style={[styles.filterSectionTitle, { color: isDark ? '#CBD5E1' : '#475569', marginTop: 16 }]}>
              TIME PERIOD BADGES
            </Text>
            <View style={styles.periodBadgesGrid}>
              {filterTabs.map(tab => {
                const isSelected = tempPeriod === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.periodBadgePill,
                      isSelected
                        ? [styles.periodBadgePillActive, { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }]
                        : [styles.periodBadgePillInactive, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9' }],
                    ]}
                    onPress={() => setTempPeriod(tab.key)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.periodBadgeTxt,
                        { color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : (isDark ? '#94A3B8' : '#475569') },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 3. Custom Range Inputs (Shown when 'custom' is selected) */}
            {tempPeriod === 'custom' && (
              <View style={styles.customDateContainer}>
                <View style={styles.dateInputsRow}>
                  <View style={styles.dateInputCol}>
                    <Text style={[styles.dateInputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>FROM</Text>
                    <TextInput
                      style={[
                        styles.dateField,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F8FAFC',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                          color: isDark ? '#FFFFFF' : '#111827',
                        },
                      ]}
                      value={tempStartDate}
                      onChangeText={setTempStartDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    />
                  </View>
                  <View style={styles.dateInputCol}>
                    <Text style={[styles.dateInputLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>TO</Text>
                    <TextInput
                      style={[
                        styles.dateField,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F8FAFC',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                          color: isDark ? '#FFFFFF' : '#111827',
                        },
                      ]}
                      value={tempEndDate}
                      onChangeText={setTempEndDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    />
                  </View>
                </View>

                {/* Quick Presets */}
                <View style={styles.quickPresetsRow}>
                  <TouchableOpacity
                    style={[styles.presetChip, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}
                    onPress={() => {
                      const now = new Date();
                      const past = new Date(now);
                      past.setDate(past.getDate() - 7);
                      setTempStartDate(`${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`);
                      setTempEndDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
                    }}
                  >
                    <Text style={[styles.presetChipTxt, { color: isDark ? '#CBD5E1' : '#334155' }]}>Last 7d</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetChip, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}
                    onPress={() => {
                      const now = new Date();
                      const past = new Date(now);
                      past.setDate(past.getDate() - 30);
                      setTempStartDate(`${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`);
                      setTempEndDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
                    }}
                  >
                    <Text style={[styles.presetChipTxt, { color: isDark ? '#CBD5E1' : '#334155' }]}>Last 30d</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.presetChip, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' }]}
                    onPress={() => {
                      const now = new Date();
                      const past = new Date(now);
                      past.setDate(past.getDate() - 90);
                      setTempStartDate(`${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`);
                      setTempEndDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
                    }}
                  >
                    <Text style={[styles.presetChipTxt, { color: isDark ? '#CBD5E1' : '#334155' }]}>Last 90d</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Apply Button */}
            <TouchableOpacity
              style={[
                styles.applyBtn,
                {
                  backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
                },
              ]}
              onPress={handleApplyOptions}
              activeOpacity={0.88}
            >
              <Text style={[styles.applyBtnTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Apply Filter
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },

  // Header Row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    zIndex: 10,
  },
  circularNavBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleTxt: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
    color: '#0F172A',
  },
  headerSubtitleTxt: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
    color: '#64748B',
  },

  // Loading
  loadingContainer: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingTxt: {
    fontSize: 14,
    fontWeight: '600',
  },

  mainContainer: {
    flex: 1,
  },

  // ── Unified 3D Isometric Podium Container ──
  unifiedPodiumContainer: {
    width: '100%',
    height: 340,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 0,
    marginTop: 14,
  },

  // Left Column (Stand 2 - Maya Chen)
  standColumnLeft: {
    width: '31%',
    alignItems: 'center',
    paddingTop: 98,
    zIndex: 10,
  },

  // Center Column (Stand 1 - Noah Parker)
  standColumnCenter: {
    width: '38%',
    alignItems: 'center',
    paddingTop: 14,
    zIndex: 20,
  },

  // Right Column (Stand 3 - Liam Ortiz)
  standColumnRight: {
    width: '31%',
    alignItems: 'center',
    paddingTop: 98,
    zIndex: 10,
  },

  // Person Resting Directly On Card
  personOnCardContainer: {
    alignItems: 'center',
    width: '100%',
  },
  personOnCardContainerCenter: {
    alignItems: 'center',
    width: '100%',
  },

  crownContainer: {
    position: 'relative',
    marginBottom: 4,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  avatarCircleCenter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 38,
  },
  initialsTxt: {
    fontSize: 18,
    fontWeight: '800',
  },
  initialsTxtCenter: {
    fontSize: 22,
    fontWeight: '900',
  },
  personNameTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
  },
  personNameTxtCenter: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 4,
    textAlign: 'center',
    width: '100%',
  },
  coinsPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    marginTop: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinsPillCenter: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
    marginTop: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinsPillTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  coinsPillTxtCenter: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#000000',
    textAlign: 'center',
  },

  // Vector 3D Stands Underlay
  svgStandsUnderlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    height: 340,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 1,
  },

  // ── Exact Bottom Sheet Card (Inside Scrollable) ──
  bottomSheetCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    borderBottomWidth: 0,
    marginTop: -26,
    paddingTop: 8,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 30,
    overflow: 'hidden',
  },
  sheetScrollView: {
    flex: 1,
  },
  sheetScrollContent: {
    gap: 10,
    paddingTop: 4,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 8,
  },
  entriesList: {
    gap: 10,
  },
  emptyListWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyListTxt: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // Individual Row Card
  entryRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
  },
  listAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    marginRight: 14,
  },
  listAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  listAvatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },
  listAvatarInitials: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  entryInfoWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  entryNameTxt: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  entryCoinsTxt: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#000000',
    marginTop: 2,
  },

  // ── Options & Badges Modal (Three Dots) ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  optionsModalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  optionsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  optionsModalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  categoryButtonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  categorySelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
  },
  categorySelectBtnActive: {},
  categorySelectBtnInactive: {},
  categorySelectBtnTxt: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  periodBadgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodBadgePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  periodBadgePillActive: {},
  periodBadgePillInactive: {},
  periodBadgeTxt: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Custom Date
  customDateContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dateInputCol: {
    flex: 1,
  },
  dateInputLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  dateField: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '700',
  },
  quickPresetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  presetChipTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  applyBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  applyBtnTxt: {
    fontSize: 15,
    fontWeight: '800',
  },
});
