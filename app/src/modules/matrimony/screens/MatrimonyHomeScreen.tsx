import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, G } from 'react-native-svg';
import CrackerFirework from '../components/CrackerFirework';
import MatrimonyMenuDrawer from '../components/MatrimonyMenuDrawer';
import {
  Bell,
  Menu,
  Search,
  Camera,
  HeartHandshake,
  Users,
  Home,
  Heart,
  MessageCircle,
  Crown,
  ChevronRight,
  ArrowLeft,
  Music,
  Plus,
  User,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import {
  computeMatrimonyProfileCompletion,
  hasCompletedMatrimonyFamilyDetails,
  matrimonyApi,
  resolveMatrimonyEntryRoute,
} from '../services/matrimonyApi';
import { matrimonyChatService } from '../services/matrimonyChatService';
import {
  GetMatrimonyMatchesResponse,
  MatrimonyMatchCandidate,
  MatrimonyMatchTab,
  MatrimonyStatusResponse,
  StartRegistrationResponse,
} from '../types/matrimony';

const ORANGE = '#EA580C';
const VIEW_ALL_MEN_IMG = require('../../../../assets/matrimony_viewall_men.jpg');
const VIEW_ALL_WOMEN_IMG = require('../../../../assets/matrimony_viewall_women.jpg');
const HOME_MATCHES_PARAMS = {
  tab: 'all' as const,
  matchBasis: 'partner_preferences' as const,
  sortBy: 'best_match' as const,
  filters: {},
  limit: 10,
};
const HOME_NEW_MATCHES_PARAMS = {
  tab: 'newly_joined' as const,
  matchBasis: 'partner_preferences' as const,
  sortBy: 'best_match' as const,
  filters: {},
  limit: 6,
};
const HOME_VIEWED_YOU_PARAMS = {
  tab: 'viewed_you' as const,
  matchBasis: 'all_filters' as const,
  sortBy: 'last_active' as const,
  filters: {},
  limit: 5,
};
const HOME_VIEWED_BY_YOU_PARAMS = {
  tab: 'viewed_by_you' as const,
  matchBasis: 'all_filters' as const,
  sortBy: 'last_active' as const,
  filters: {},
  limit: 5,
};

function formatCompactHeight(cm?: number | null): string | null {
  if (!cm || cm <= 0) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function formatViewedOnDate(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function dedupeCandidates(list: MatrimonyMatchCandidate[]): MatrimonyMatchCandidate[] {
  const seen = new Set<string>();
  const out: MatrimonyMatchCandidate[] = [];
  for (const item of list) {
    if (!item?.uid || seen.has(item.uid)) continue;
    seen.add(item.uid);
    out.push(item);
  }
  return out;
}

export default function MatrimonyHomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { member, user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [statusData, setStatusData] = useState<MatrimonyStatusResponse | null>(() =>
    matrimonyApi.getCachedStatus()
  );
  const [regData, setRegData] = useState<StartRegistrationResponse | null>(() =>
    matrimonyApi.getCachedRegistration()
  );
  const [matchesData, setMatchesData] = useState<GetMatrimonyMatchesResponse | null>(
    () => matrimonyApi.getCachedMatches(HOME_MATCHES_PARAMS)
  );
  const [newMatchesData, setNewMatchesData] = useState<GetMatrimonyMatchesResponse | null>(() =>
    matrimonyApi.getCachedMatches(HOME_NEW_MATCHES_PARAMS)
  );
  const [viewedYouData, setViewedYouData] = useState<GetMatrimonyMatchesResponse | null>(() =>
    matrimonyApi.getCachedMatches(HOME_VIEWED_YOU_PARAMS)
  );
  const [viewedByYouData, setViewedByYouData] = useState<GetMatrimonyMatchesResponse | null>(() =>
    matrimonyApi.getCachedMatches(HOME_VIEWED_BY_YOU_PARAMS)
  );
  const [loadedOnce, setLoadedOnce] = useState(() =>
    Boolean(matrimonyApi.getCachedStatus() || matrimonyApi.getCachedRegistration())
  );
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'Home' | 'Matches' | 'Interests' | 'Messages' | 'Upgrade'>('Home');
  const [menuOpen, setMenuOpen] = useState(false);
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

  const loadHomeData = useCallback(
    async (force = false) => {
      try {
        await matrimonyApi.hydrateCacheFromStorage();
        const [statusRes, regRes, matchesRes, newMatchesRes, viewedYouRes, viewedByYouRes] =
          await Promise.all([
            matrimonyApi.getStatus({ force }).catch(() => null),
            matrimonyApi.startRegistration({ force }).catch(() => null),
            matrimonyApi
              .getMatches(HOME_MATCHES_PARAMS, { force, maxAgeMs: 25_000 })
              .catch(() => null),
            matrimonyApi
              .getMatches(HOME_NEW_MATCHES_PARAMS, { force, maxAgeMs: 25_000 })
              .catch(() => null),
            matrimonyApi
              .getMatches(HOME_VIEWED_YOU_PARAMS, { force, maxAgeMs: 25_000 })
              .catch(() => null),
            matrimonyApi
              .getMatches(HOME_VIEWED_BY_YOU_PARAMS, { force, maxAgeMs: 25_000 })
              .catch(() => null),
          ]);
        if (regRes) {
          const nextRoute = resolveMatrimonyEntryRoute(regRes);
          if (nextRoute.screen !== 'MatrimonyHome') {
            navigation.reset({
              index: 0,
              routes: [{ name: nextRoute.screen, params: nextRoute.params }],
            });
            return;
          }
        }
        const liveStatus = statusRes?.profileStatus;
        if (liveStatus && liveStatus !== 'approved') {
          navigation.reset({
            index: 0,
            routes: [{ name: 'MatrimonyStatus' }],
          });
          return;
        }
        if (statusRes) setStatusData(statusRes);
        if (regRes) setRegData(regRes);
        if (matchesRes) setMatchesData(matchesRes);
        if (newMatchesRes) setNewMatchesData(newMatchesRes);
        if (viewedYouRes) setViewedYouData(viewedYouRes);
        if (viewedByYouRes) setViewedByYouData(viewedByYouRes);
      } catch (err) {
        console.warn('MatrimonyHome loadStatus error:', err);
      } finally {
        setLoadedOnce(true);
        setRefreshing(false);
      }
    },
    [navigation]
  );

  useEffect(() => {
    loadHomeData(true);
    matrimonyApi.prefetchMatrimonyWorkspace().catch(() => undefined);
    const unsub = navigation.addListener('focus', () => {
      const cachedStatus = matrimonyApi.getCachedStatus();
      const cachedReg = matrimonyApi.getCachedRegistration();
      const cachedMatches = matrimonyApi.getCachedMatches(HOME_MATCHES_PARAMS);
      const cachedNewMatches = matrimonyApi.getCachedMatches(HOME_NEW_MATCHES_PARAMS);
      const cachedViewedYou = matrimonyApi.getCachedMatches(HOME_VIEWED_YOU_PARAMS);
      const cachedViewedByYou = matrimonyApi.getCachedMatches(HOME_VIEWED_BY_YOU_PARAMS);
      if (cachedStatus) setStatusData(cachedStatus);
      if (cachedReg) setRegData(cachedReg);
      if (cachedMatches) setMatchesData(cachedMatches);
      if (cachedNewMatches) setNewMatchesData(cachedNewMatches);
      if (cachedViewedYou) setViewedYouData(cachedViewedYou);
      if (cachedViewedByYou) setViewedByYouData(cachedViewedByYou);
      loadHomeData(true);
    });
    return unsub;
  }, [loadHomeData, navigation]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHomeData(true);
  };

  const activeProfile = statusData?.profile || regData?.profile;
  const displayName =
    activeProfile?.displayName ||
    member?.displayName ||
    member?.name ||
    'Rhema Member';

  const avatarUri =
    statusData?.signedProfilePhoto ||
    regData?.profile?.signedProfilePhoto ||
    (member as any)?.photoURL ||
    null;
  const familySummary = activeProfile?.familySummary;
  const familyDetails = regData?.familyDetails;
  const completeness = regData?.profile
    ? computeMatrimonyProfileCompletion(
        activeProfile || regData.profile,
        regData.preferences,
        familyDetails
      )
    : (statusData?.profileCompletion ?? activeProfile?.profileCompletion ?? 70);
  const rawUid = activeProfile?.uid || (member as any)?.uid || '';
  const profileCode =
    (activeProfile as any)?.matrimonyId ||
    (activeProfile as any)?.profileCode ||
    (member as any)?.memberId ||
    (rawUid ? `RM${rawUid.slice(0, 8).toUpperCase()}` : 'RM-MEMBER');

  const hasAllFamilyDetails = hasCompletedMatrimonyFamilyDetails(familySummary, familyDetails);

  const interestsObj = activeProfile?.interests || {};
  const totalInterestsCount = [
    interestsObj.hobbies,
    interestsObj.music,
    interestsObj.reading,
    interestsObj.movies,
    interestsObj.sports,
    interestsObj.food,
    interestsObj.languages,
  ].reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
  const hasInterests = totalInterestsCount > 0;

  const totalPhotos =
    (activeProfile?.profilePhoto ? 1 : 0) +
    (Array.isArray(activeProfile?.gallery) ? activeProfile.gallery.length : 0);
  const hasThreeOrMorePhotos = totalPhotos >= 3;

  const activeMembership = activeProfile?.membership;
  const hasActiveMembership =
    activeMembership?.status === 'active' &&
    activeMembership.tier !== 'free' &&
    (!activeMembership.validUntilMs || activeMembership.validUntilMs > Date.now());
  const membershipLabel = hasActiveMembership
    ? `${activeMembership!.tier.charAt(0).toUpperCase()}${activeMembership!.tier.slice(1)} Member`
    : 'Free Member';

  const showFamilyCard = loadedOnce && !hasAllFamilyDetails;
  const showInterestsCard = loadedOnce && !hasInterests;
  const showPhotosCard = loadedOnce && !hasThreeOrMorePhotos;
  const hasVisibleActionCards = showFamilyCard || showInterestsCard || showPhotosCard;

  const handleComingSoon = (feature: string) => {
    Alert.alert(feature, `${feature} is coming in the next phase of Rhema Matrimony!`);
  };

  const handleBackToChurchApp = () => {
    const parentNav = navigation.getParent();
    if (parentNav) {
      parentNav.goBack();
    } else {
      navigation.navigate('Home');
    }
  };

  const topBgColors: readonly [string, string, string] = isDark
    ? ['rgba(22, 101, 52, 0.34)', 'rgba(22, 101, 52, 0.14)', colors.bg]
    : ['#E4F5E7', '#EEF9F0', colors.bg];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ORANGE} />
        }
      >
        {/* Full-bleed Top Pastel Section (Status bar + Member Profile + Celebration) */}
        <LinearGradient
          colors={topBgColors}
          locations={[0, 0.72, 1]}
          style={[styles.topGradientSection, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.topActionsRow}>
            <TouchableOpacity
              style={[styles.pillSwitchBtn, { backgroundColor: colors.surface, borderColor: ORANGE }]}
              onPress={handleBackToChurchApp}
              activeOpacity={0.85}
            >
              <ArrowLeft size={14} color={ORANGE} />
              <Text style={[styles.pillSwitchText, { fontFamily }]}>Rhema App</Text>
            </TouchableOpacity>

            <View style={styles.topRightIcons}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => handleComingSoon('Search Profiles')}
              >
                <Search size={21} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => handleComingSoon('Notifications')}
              >
                <Bell size={21} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setMenuOpen(true)}
              >
                <Menu size={21} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Profile Identity Row */}
          <View style={styles.profileRow}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={() => navigation.navigate('MatrimonyMyPhotos')}
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
              <View style={[styles.cameraBadge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Camera size={12} color={colors.text} />
              </View>
            </TouchableOpacity>

            <View style={{ flex: 1, justifyContent: 'center', gap: 5 }}>
              <Text
                style={[styles.userName, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <View style={styles.statusRow}>
                <Text style={[styles.memberTier, { color: colors.textSecondary, fontFamily }]}>
                  {membershipLabel}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.upgradeChip,
                    {
                      borderColor: '#C28E3A',
                      backgroundColor: isDark ? 'rgba(194, 142, 58, 0.16)' : '#FFFBEB',
                    },
                  ]}
                  onPress={() => navigation.navigate('MatrimonyUpgrade')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.upgradeChipText, { fontFamily }]}>
                    {hasActiveMembership ? 'Plans' : 'Upgrade'}
                  </Text>
                </TouchableOpacity>
              </View>
              {matchesData?.viewerEntitlements ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('MatrimonyUpgrade')}
                  style={{ marginTop: 2 }}
                >
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 11,
                      fontWeight: '600',
                      fontFamily,
                    }}
                    numberOfLines={1}
                  >
                    {`Interests: ${
                      matchesData.viewerEntitlements.interestsRemaining < 0
                        ? 'Unlimited'
                        : `${matchesData.viewerEntitlements.interestsRemaining}/${matchesData.viewerEntitlements.monthlyInterestLimit}`
                    } · Contacts: ${
                      matchesData.viewerEntitlements.contactNumberLimit === 0
                        ? 'Locked'
                        : matchesData.viewerEntitlements.contactNumberLimit < 0
                        ? 'Unlimited'
                        : `${matchesData.viewerEntitlements.contactNumbersRemaining}/${matchesData.viewerEntitlements.contactNumberLimit}`
                    }`}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Subtle horizontal border line below member profile row (not full screen) */}
          <View
            style={[
              styles.profileDivider,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(15, 23, 42, 0.08)',
              },
            ]}
          />

          {/* Seamless Celebration Section with Flag Thread & Real Cracker Animation */}
          <View style={styles.celebrationWrap}>
            {/* Left Corner Flag Thread */}
            <Svg width={76} height={40} viewBox="0 0 76 40" style={styles.buntingLeftSvg}>
              <Path d="M0 32 Q 32 22 64 0" stroke="#94A3B8" strokeWidth="0.9" fill="none" />
              <Path d="M5.1 30.3 L14.1 27.0 L12.7 37.2 Z" fill="#EC4899" />
              <Path d="M19.8 24.6 L28.8 20.6 L27.9 30.8 Z" fill="#10B981" />
              <Path d="M34.6 17.7 L43.5 12.9 L43.3 23.1 Z" fill="#F59E0B" />
              <Path d="M49.3 9.5 L57.0 4.7 L57.5 14.0 Z" fill="#4C1D95" />
            </Svg>

            {/* Right Corner Flag Thread */}
            <Svg width={76} height={40} viewBox="0 0 76 40" style={styles.buntingRightSvg}>
              <G transform="translate(76, 0) scale(-1, 1)">
                <Path d="M0 32 Q 32 22 64 0" stroke="#94A3B8" strokeWidth="0.9" fill="none" />
                <Path d="M5.1 30.3 L14.1 27.0 L12.7 37.2 Z" fill="#14B8A6" />
                <Path d="M19.8 24.6 L28.8 20.6 L27.9 30.8 Z" fill="#F59E0B" />
                <Path d="M34.6 17.7 L43.5 12.9 L43.3 23.1 Z" fill="#EC4899" />
                <Path d="M49.3 9.5 L57.0 4.7 L57.5 14.0 Z" fill="#4C1D95" />
              </G>
            </Svg>

            <CrackerFirework side="left" delayMs={0} top={0} />
            <CrackerFirework side="right" delayMs={950} top={0} />

            <View style={styles.celebratingRow}>
              <View style={[styles.celebratingLine, { backgroundColor: isDark ? '#64748B' : '#94A3B8' }]} />
              <Text style={[styles.celebratingScript, { color: isDark ? '#CBD5E1' : '#334155' }]}>
                Celebrating
              </Text>
              <View style={[styles.celebratingLine, { backgroundColor: isDark ? '#64748B' : '#94A3B8' }]} />
            </View>

            <View style={styles.celebrateMainRow}>
              <Text style={[styles.celebrateHighlight, { color: isDark ? '#A78BFA' : '#2E1A47' }]}>
                Rhema
              </Text>
              <View style={{ flexShrink: 1 }}>
                <Text style={[styles.celebrateSubTitle, { color: isDark ? '#F1F5F9' : '#1E293B', fontFamily }]}>
                  Blessed Unions{'\n'}in Christ
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.celebrateCta}
              onPress={() => navigation.navigate('MatrimonyMatches')}
              activeOpacity={0.9}
            >
              <Text style={[styles.celebrateCtaText, { fontFamily }]}>Explore Matches</Text>
              <ChevronRight size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Complete Your Profile */}
        {hasVisibleActionCards && (
          <View
            style={[
              styles.completeSection,
              {
                backgroundColor: isDark ? '#111827' : '#F4F6FA',
                borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB',
                borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB',
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(17) }]}>
              Complete Your Profile
            </Text>
            <View style={styles.completenessRow}>
              <Text style={[styles.completenessText, { color: colors.textSecondary, fontFamily }]}>
                Profile completeness score{' '}
                <Text style={{ color: colors.text, fontWeight: '800' }}>{completeness}%</Text>
              </Text>
              <View style={[styles.miniBarBg, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
                <View style={[styles.miniBarFill, { width: `${completeness}%` }]} />
              </View>
            </View>

            <View style={styles.actionCardsRow}>
              {showFamilyCard && (
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    {
                      backgroundColor: isDark ? colors.surface : '#FFFFFF',
                      borderColor: isDark ? colors.border : '#F1F5F9',
                    },
                  ]}
                  activeOpacity={0.86}
                  onPress={() => navigation.navigate('MatrimonyEditProfile', { focusSection: 'family' })}
                >
                  <View
                    style={[
                      styles.actionIconHalo,
                      { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FFF3D6' },
                    ]}
                  >
                    <View
                      style={[
                        styles.actionIconInnerFrame,
                        {
                          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                          borderColor: isDark ? '#94A3B8' : '#334155',
                        },
                      ]}
                    >
                      <Home size={18} color="#EA580C" />
                    </View>
                    <View style={styles.actionPlusBadge}>
                      <Plus size={11} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  </View>
                  <Text style={[styles.actionCardTitle, { color: colors.text, fontFamily }]}>
                    Family{'\n'}Details
                  </Text>
                </TouchableOpacity>
              )}

              {showInterestsCard && (
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    {
                      backgroundColor: isDark ? colors.surface : '#FFFFFF',
                      borderColor: isDark ? colors.border : '#F1F5F9',
                    },
                  ]}
                  activeOpacity={0.86}
                  onPress={() =>
                    navigation.navigate('MatrimonyInterests', {
                      fromEditProfile: true,
                      initialInterests: activeProfile?.interests || {},
                    })
                  }
                >
                  <View
                    style={[
                      styles.actionIconHalo,
                      { backgroundColor: isDark ? 'rgba(236, 72, 153, 0.16)' : '#FCE7F3' },
                    ]}
                  >
                    <View
                      style={[
                        styles.actionIconInnerFrame,
                        {
                          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                          borderColor: isDark ? '#94A3B8' : '#334155',
                        },
                      ]}
                    >
                      <Music size={18} color="#E11D48" />
                    </View>
                    <View style={styles.actionPlusBadge}>
                      <Plus size={11} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  </View>
                  <Text style={[styles.actionCardTitle, { color: colors.text, fontFamily }]}>
                    Hobbies &{'\n'}Interests
                  </Text>
                </TouchableOpacity>
              )}

              {showPhotosCard && (
                <TouchableOpacity
                  style={[
                    styles.actionCard,
                    {
                      backgroundColor: isDark ? colors.surface : '#FFFFFF',
                      borderColor: isDark ? colors.border : '#F1F5F9',
                    },
                  ]}
                  activeOpacity={0.86}
                  onPress={() => navigation.navigate('MatrimonyMyPhotos')}
                >
                  <View
                    style={[
                      styles.actionIconHalo,
                      { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.18)' : '#EDE9FE' },
                    ]}
                  >
                    <View
                      style={[
                        styles.actionIconInnerFrame,
                        {
                          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                          borderColor: isDark ? '#94A3B8' : '#334155',
                        },
                      ]}
                    >
                      <Camera size={18} color="#7C3AED" />
                    </View>
                    <View style={styles.actionPlusBadge}>
                      <Plus size={11} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  </View>
                  <Text style={[styles.actionCardTitle, { color: colors.text, fontFamily }]}>
                    Upload{'\n'}Photos
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Advanced Non-Duplicate Match Sections: All Matches, New Matches, Who Viewed You, Profiles You Viewed */}
        {(() => {
          const allPool = dedupeCandidates(matchesData?.matches || []);
          const newPool = dedupeCandidates(newMatchesData?.matches || []);
          const viewedYouPool = dedupeCandidates(viewedYouData?.matches || []);
          const viewedByYouPool = dedupeCandidates(viewedByYouData?.matches || []);

          const usedUids = new Set<string>();
          const newUidSet = new Set(newPool.map((m) => m.uid));
          const viewedYouUidSet = new Set(viewedYouPool.map((m) => m.uid));
          const viewedByYouUidSet = new Set(viewedByYouPool.map((m) => m.uid));

          const pickUniquePreview = (
            pool: MatrimonyMatchCandidate[],
            avoidSet: Set<string>
          ): MatrimonyMatchCandidate[] => {
            const picked: MatrimonyMatchCandidate[] = [];
            for (const c of pool) {
              if (picked.length >= 3) break;
              if (!usedUids.has(c.uid) && !avoidSet.has(c.uid)) {
                picked.push(c);
                usedUids.add(c.uid);
              }
            }
            if (picked.length < 3) {
              for (const c of pool) {
                if (picked.length >= 3) break;
                if (!usedUids.has(c.uid)) {
                  picked.push(c);
                  usedUids.add(c.uid);
                }
              }
            }
            return picked;
          };

          const allPreview = pickUniquePreview(
            allPool,
            new Set([...newUidSet, ...viewedYouUidSet, ...viewedByYouUidSet])
          );
          const newPreview = pickUniquePreview(
            newPool,
            new Set([...viewedYouUidSet, ...viewedByYouUidSet])
          );
          const viewedYouPreview = pickUniquePreview(viewedYouPool, viewedByYouUidSet);
          const viewedByYouPreview = pickUniquePreview(viewedByYouPool, new Set());

          const viewerGenderNorm = String(
            activeProfile?.gender || matchesData?.viewerGender || ''
          ).toLowerCase();
          const targetGenderNorm = String(matchesData?.targetGender || '').toLowerCase();
          const showMenBlur =
            viewerGenderNorm === 'female' ||
            viewerGenderNorm === 'woman' ||
            targetGenderNorm === 'male';
          const viewAllBlurSource = showMenBlur ? VIEW_ALL_MEN_IMG : VIEW_ALL_WOMEN_IMG;

          const sections: {
            key: MatrimonyMatchTab;
            title: string;
            subtitle: string;
            tabTitle: string;
            pool: MatrimonyMatchCandidate[];
            preview: MatrimonyMatchCandidate[];
            totalCount: number;
            showViewedDate?: boolean;
          }[] = [
            {
              key: 'all',
              title: 'All Matches',
              subtitle: 'Members who match your partner preferences',
              tabTitle: 'All matches',
              pool: allPool,
              preview: allPreview,
              totalCount: matchesData?.totalCount ?? allPool.length,
            },
            {
              key: 'newly_joined',
              title: 'New Matches',
              subtitle: 'Members who match your preferences and have joined in the last 30 days',
              tabTitle: 'Newly joined',
              pool: newPool,
              preview: newPreview,
              totalCount: newMatchesData?.totalCount ?? newPool.length,
            },
            {
              key: 'viewed_you',
              title: 'Who Viewed You',
              subtitle: 'Members who have viewed your profile',
              tabTitle: 'Viewed you',
              pool: viewedYouPool,
              preview: viewedYouPreview,
              totalCount: viewedYouData?.totalCount ?? viewedYouPool.length,
              showViewedDate: true,
            },
            {
              key: 'viewed_by_you',
              title: 'Profiles You Viewed',
              subtitle: 'Members that you have viewed',
              tabTitle: 'Viewed by you',
              pool: viewedByYouPool,
              preview: viewedByYouPreview,
              totalCount: viewedByYouData?.totalCount ?? viewedByYouPool.length,
              showViewedDate: true,
            },
          ];

          return sections.map((sec, secIdx) => {
            if (sec.preview.length === 0) return null;
            const showViewAllBlurCard = sec.totalCount > 3 && sec.totalCount > sec.preview.length;

            return (
              <View
                key={sec.key}
                style={[
                  styles.matchesSection,
                  secIdx > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
                  },
                  { backgroundColor: colors.bg },
                ]}
              >
                <View style={styles.matchesHeader}>
                  <Text
                    style={[
                      styles.matchesHeading,
                      { color: colors.text, fontFamily, fontSize: scaleFont(17.5) },
                    ]}
                  >
                    {sec.title} ({sec.totalCount.toLocaleString()})
                  </Text>
                  <Text
                    style={[
                      styles.matchesSubheading,
                      { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13) },
                    ]}
                  >
                    {sec.subtitle}
                  </Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.matchesScrollRow}
                >
                  {sec.preview.map((candidate: MatrimonyMatchCandidate) => {
                    const ageStr = candidate.age ? `${candidate.age} Yrs` : null;
                    const heightStr = formatCompactHeight(candidate.heightCm);
                    const metaLine = [ageStr, heightStr].filter(Boolean).join(', ');
                    const viewedDateLabel = sec.showViewedDate
                      ? formatViewedOnDate(candidate.viewedAtMs)
                      : null;
                    const detailIdx = Math.max(
                      0,
                      sec.pool.findIndex((p) => p.uid === candidate.uid)
                    );

                    return (
                      <TouchableOpacity
                        key={candidate.uid}
                        style={styles.matchPreviewCard}
                        activeOpacity={0.88}
                        onPress={() =>
                          navigation.navigate('MatrimonyMatchDetail', {
                            matches: sec.pool,
                            initialIndex: detailIdx,
                            viewerPhoto: avatarUri,
                            tabTitle: sec.tabTitle,
                          })
                        }
                      >
                        <View
                          style={[
                            styles.matchPreviewImgWrap,
                            {
                              backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
                            },
                          ]}
                        >
                          {candidate.signedProfilePhoto ? (
                            <Image
                              source={{ uri: candidate.signedProfilePhoto }}
                              style={styles.matchPreviewImg}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.matchPreviewPlaceholder}>
                              <User size={40} color={isDark ? '#64748B' : '#94A3B8'} />
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.matchPreviewName,
                            { color: colors.text, fontFamily, fontSize: scaleFont(13.5) },
                          ]}
                          numberOfLines={1}
                        >
                          {candidate.displayName || 'Member'}
                        </Text>
                        {metaLine ? (
                          <Text
                            style={[
                              styles.matchPreviewMeta,
                              { color: colors.textSecondary, fontFamily, fontSize: scaleFont(12) },
                            ]}
                            numberOfLines={1}
                          >
                            {metaLine}
                          </Text>
                        ) : null}
                        {viewedDateLabel ? (
                          <Text
                            style={[
                              styles.matchViewedOnText,
                              { color: colors.textSecondary, fontFamily, fontSize: scaleFont(11.5) },
                            ]}
                            numberOfLines={2}
                          >
                            {`Viewed on:\n${viewedDateLabel}`}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}

                  {/* 4th Card: Opposite-Gender Blurred Image + View All */}
                  {showViewAllBlurCard ? (
                    <TouchableOpacity
                      style={styles.matchPreviewCard}
                      activeOpacity={0.88}
                      onPress={() =>
                        navigation.navigate('MatrimonyMatches', { initialTab: sec.key })
                      }
                    >
                      <View
                        style={[
                          styles.matchPreviewImgWrap,
                          styles.viewAllCardBox,
                          {
                            backgroundColor: isDark ? '#334155' : '#94A3B8',
                          },
                        ]}
                      >
                        <Image
                          source={viewAllBlurSource}
                          style={styles.matchPreviewImg}
                          resizeMode="cover"
                          blurRadius={16}
                        />
                        <View
                          style={[
                            styles.viewAllBlurTint,
                            {
                              backgroundColor: isDark
                                ? 'rgba(15, 23, 42, 0.22)'
                                : 'rgba(15, 23, 42, 0.12)',
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.viewAllCardLabelRow}>
                        <Text
                          style={[styles.viewAllCardText, { fontFamily, fontSize: scaleFont(13.5) }]}
                        >
                          View all
                        </Text>
                        <ChevronRight size={15} color={ORANGE} strokeWidth={2.5} />
                      </View>
                    </TouchableOpacity>
                  ) : null}
                </ScrollView>

                <TouchableOpacity
                  style={[
                    styles.matchesViewAllBtn,
                    {
                      backgroundColor: isDark ? 'rgba(234, 88, 12, 0.08)' : '#FFFFFF',
                      borderColor: isDark ? 'rgba(234, 88, 12, 0.55)' : '#FCA5A5',
                    },
                  ]}
                  activeOpacity={0.86}
                  onPress={() =>
                    navigation.navigate('MatrimonyMatches', { initialTab: sec.key })
                  }
                >
                  <Text style={[styles.matchesViewAllBtnText, { fontFamily }]}>View all</Text>
                  <ChevronRight size={16} color={ORANGE} strokeWidth={2.3} />
                </TouchableOpacity>
              </View>
            );
          });
        })()}
      </ScrollView>

      {/* Bottom Tab Bar */}
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
        {[
          { key: 'Home' as const, label: 'Home', Icon: Home, onPress: () => setActiveTab('Home') },
          {
            key: 'Matches' as const,
            label: 'Matches',
            Icon: Users,
            onPress: () => navigation.navigate('MatrimonyMatches'),
          },
          {
            key: 'Interests' as const,
            label: 'Interests',
            Icon: Heart,
            onPress: () => navigation.navigate('MatrimonyInterestsHub'),
          },
          {
            key: 'Messages' as const,
            label: 'Messages',
            Icon: MessageCircle,
            onPress: () => navigation.navigate('MatrimonyMessages'),
          },
          {
            key: 'Upgrade' as const,
            label: 'Upgrade',
            Icon: Crown,
            onPress: () => navigation.navigate('MatrimonyUpgrade'),
          },
        ].map(({ key, label, Icon, onPress }) => {
          const isActive = activeTab === key;
          const badge = key === 'Messages' ? unreadChatCount : 0;
          return (
            <TouchableOpacity key={key} style={styles.navItem} onPress={onPress} activeOpacity={0.8}>
              <View style={{ position: 'relative' }}>
                <Icon size={20} color={isActive ? ORANGE : colors.textSecondary} />
                {badge > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -5,
                      right: -9,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      paddingHorizontal: 3,
                      backgroundColor: '#00A884',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 9.5, fontWeight: '800' }}>
                      {badge > 9 ? '9+' : badge}
                    </Text>
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

      <MatrimonyMenuDrawer
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        displayName={displayName}
        profileCode={profileCode}
        membershipLabel={membershipLabel}
        avatarUri={avatarUri}
        isDark={isDark}
        colors={colors}
        fontFamily={fontFamily}
        onUpgrade={() => navigation.navigate('MatrimonyUpgrade')}
        onEditProfile={() => navigation.navigate('MatrimonyEditProfile')}
        onEditPreferences={() =>
          navigation.navigate('MatrimonyEditProfile', { focusSection: 'partnerPreference' })
        }
        onVerifyProfile={() => navigation.navigate('MatrimonyStatus')}
        onUploadPhotos={() => navigation.navigate('MatrimonyMyPhotos')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  topGradientSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 14,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pillSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1.2,
  },
  pillSwitchText: {
    color: ORANGE,
    fontSize: 12.5,
    fontWeight: '700',
  },
  topRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBtn: { padding: 4 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  avatarFallback: {
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: { fontWeight: '800' },
  brandBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  brandSub: { fontSize: 12.5, fontWeight: '600' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberTier: { fontSize: 12.5, fontWeight: '600' },
  upgradeChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 3,
  },
  upgradeChipText: { color: '#9A6B16', fontSize: 12, fontWeight: '700' },
  profileDivider: {
    height: 0.9,
    marginHorizontal: 4,
    marginTop: 2,
  },
  celebrationWrap: {
    marginHorizontal: -16,
    marginTop: -14,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  buntingLeftSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  buntingRightSvg: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  celebratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  celebratingLine: {
    width: 34,
    height: 1,
    opacity: 0.5,
  },
  celebratingScript: {
    fontSize: 18,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  celebrateMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  celebrateHighlight: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  celebrateSubTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  celebrateCta: {
    marginTop: 4,
    backgroundColor: '#2E1A47',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  celebrateCtaText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  completeSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  sectionTitle: { fontWeight: '800' },
  completenessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  completenessText: { fontSize: 13 },
  miniBarBg: {
    width: 68,
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: 7,
    backgroundColor: ORANGE,
    borderRadius: 4,
  },
  actionCardsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 10,
    marginTop: 6,
  },
  actionCard: {
    width: '31.5%',
    maxWidth: 110,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  actionIconHalo: {
    width: 54,
    height: 54,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  actionIconInnerFrame: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPlusBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#22B8CF',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
  },
  matchesSection: {
    paddingTop: 18,
    paddingBottom: 16,
  },
  matchesHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 2,
  },
  matchesHeading: {
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  matchesSubheading: {
    fontWeight: '500',
  },
  matchesScrollRow: {
    paddingHorizontal: 16,
    gap: 12,
  },
  matchPreviewCard: {
    width: 142,
  },
  matchPreviewImgWrap: {
    width: 142,
    height: 142,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
  },
  matchPreviewImg: {
    width: '100%',
    height: '100%',
  },
  matchPreviewPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchPreviewName: {
    fontWeight: '700',
  },
  matchPreviewMeta: {
    marginTop: 2,
    fontWeight: '500',
  },
  matchViewedOnText: {
    marginTop: 6,
    fontWeight: '500',
    lineHeight: 16,
  },
  viewAllCardBox: {
    position: 'relative',
  },
  viewAllBlurTint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAllCardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginTop: 4,
  },
  viewAllCardText: {
    color: ORANGE,
    fontWeight: '700',
  },
  matchesViewAllBtn: {
    marginHorizontal: 16,
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 24,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  matchesViewAllBtnText: {
    color: ORANGE,
    fontSize: 14,
    fontWeight: '700',
  },
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
  navLabel: { fontSize: 11 },
});
