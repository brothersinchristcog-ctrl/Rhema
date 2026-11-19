import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  Crown,
  Heart,
  HeartHandshake,
  Home,
  Image as ImageIcon,
  MessageCircle,
  MoreVertical,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyTierToggle from '../components/MatrimonyTierToggle';
import VerifiedRibbonBadge from '../components/VerifiedRibbonBadge';
import MatrimonyMatchesFilterModal, {
  countActiveMatrimonyFilters,
} from '../components/MatrimonyMatchesFilterModal';
import MatrimonyMatchesMoreModal, { MORE_TAB_TITLES } from '../components/MatrimonyMatchesMoreModal';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';
import { matrimonyChatService } from '../services/matrimonyChatService';
import {
  MatrimonyMatchCandidate,
  MatrimonyMatchesFilter,
  MatrimonyMatchTab,
} from '../types/matrimony';

const CORAL_RED = '#E04B5A';
const GREEN = '#16A34A';
const ORANGE = '#EA580C';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type MatchTab = MatrimonyMatchTab;
type MatchFilterMode = 'preferences' | 'custom' | 'cleared';
type SortOption =
  | 'best_match'
  | 'last_active'
  | 'date_created'
  | 'distance'
  | 'latest_photos';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const TAB_COUNT_SUBTITLE_SUFFIX: Partial<Record<MatchTab, string>> = {
  newly_joined: 'who joined in the last 30 days',
  shortlisted: 'you have shortlisted',
  shortlisted_by_you: 'you have shortlisted',
  viewed_you: 'who have viewed your profile',
  shortlisted_you: 'who have shortlisted your profile',
  viewed_by_you: 'you have viewed',
  nearby: 'near your location',
  photo_matches: 'that have added photos',
  mutual_matches: 'whose profile match your preferences and vice versa',
  looking_for_you: 'whose preferences match your profile',
  education_pref: 'based on your preferred education',
  professional_pref: 'based on your preferred profession',
  location_pref: 'based on your preferred city/location',
  nri_matches: 'from outside India',
  shared_interests: 'with mutual interests',
};

const SORT_LABELS: Record<SortOption, string> = {
  best_match: 'Sort by',
  last_active: 'Last active',
  date_created: 'Date created',
  distance: 'Distance',
  latest_photos: 'Latest photos',
};

const SORT_OPTIONS: { key: SortOption; title: string; subtitle: string }[] = [
  {
    key: 'last_active',
    title: 'Last active',
    subtitle: 'Members who recently logged-in will be shown first',
  },
  {
    key: 'date_created',
    title: 'Date created',
    subtitle: 'Profiles created recently will be shown first',
  },
  {
    key: 'distance',
    title: 'Distance',
    subtitle: 'Profiles nearby will be shown first',
  },
  {
    key: 'latest_photos',
    title: 'Latest photos',
    subtitle: 'Members who have recently added photos will be shown first',
  },
];

function formatCompactHeight(cm?: number | null): string | null {
  if (!cm || cm <= 0) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function areMatrimonyFiltersEqual(a: MatrimonyMatchesFilter, b: MatrimonyMatchesFilter): boolean {
  const norm = (f: MatrimonyMatchesFilter) => ({
    minAge: f.minAge ?? null,
    maxAge: f.maxAge ?? null,
    minHeightCm: f.minHeightCm ?? null,
    maxHeightCm: f.maxHeightCm ?? null,
    profileCreatedBy: (f.profileCreatedBy || '').trim(),
    maritalStatus: (f.maritalStatus || '').trim(),
    motherTongue: (f.motherTongue || '').trim(),
    physicalStatus: (f.physicalStatus || '').trim(),
    baptized: f.baptized || (f.baptizedOnly ? 'Yes' : ''),
    denomination: (f.denomination || '').trim(),
    division: (f.division || '').trim(),
    occupation: (f.occupation || '').trim(),
    annualIncome: (f.annualIncome || '').trim(),
    employmentType: (f.employmentType || '').trim(),
    education: [...(f.education || [])].sort(),
    country: (f.country || '').trim(),
    state: (f.state || '').trim(),
    city: (f.city || '').trim(),
    eatingHabits: (f.eatingHabits || '').trim(),
    drinkingHabits: (f.drinkingHabits || '').trim(),
    smokingHabits: (f.smokingHabits || '').trim(),
    familyStatus: (f.familyStatus || '').trim(),
    familyType: (f.familyType || '').trim(),
    familyValues: (f.familyValues || '').trim(),
    createdWithin: f.createdWithin && f.createdWithin !== 'all' ? f.createdWithin : '',
    mutualMatchesOnly: Boolean(f.mutualMatchesOnly),
    withPhotoOnly: Boolean(f.withPhotoOnly),
    sharedInterestsOnly: Boolean(f.sharedInterestsOnly),
    sameCity: Boolean(f.sameCity),
    sameState: Boolean(f.sameState),
  });
  return JSON.stringify(norm(a || {})) === JSON.stringify(norm(b || {}));
}

function formatRecencyLabel(joinedAtMs: number): string {
  if (!joinedAtMs) return 'Verified Member';
  const diffHours = Math.max(0, Math.floor((Date.now() - joinedAtMs) / (1000 * 60 * 60)));
  if (diffHours < 24) return 'Joined today';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `Joined ${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks <= 4) return `Joined ${diffWeeks}w ago`;
  return 'Verified Member';
}

export default function MatrimonyMatchesScreen({ navigation, route }: any) {
  const requestedInitialTab = route?.params?.initialTab as MatchTab | undefined;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const filtersStorageKey = `@rhema_matrimony_matches_filters_v3_${user?.uid || 'anon'}`;
  const sortStorageKey = `@rhema_matrimony_matches_sort_${user?.uid || 'anon'}`;
  const tabStorageKey = `@rhema_matrimony_matches_tab_${user?.uid || 'anon'}`;
  const modeStorageKey = `@rhema_matrimony_matches_mode_v3_${user?.uid || 'anon'}`;
  const prefTsStorageKey = `@rhema_matrimony_matches_prefts_v3_${user?.uid || 'anon'}`;

  const [tab, setTabState] = useState<MatchTab>(requestedInitialTab || 'all');
  const [matchTier, setMatchTier] = useState<'regular' | 'prime'>('regular');
  const [sortBy, setSortByState] = useState<SortOption>('best_match');
  const [filters, setFiltersState] = useState<MatrimonyMatchesFilter>({});
  const [filterMode, setFilterModeState] = useState<MatchFilterMode>('preferences');
  const initialMatchesSnapshot =
    matrimonyApi.getCachedMatches({
      tab: requestedInitialTab || 'all',
      matchBasis: 'partner_preferences',
      sortBy: 'best_match',
      filters: {},
    }) || matrimonyApi.getCachedMatches();
  const [partnerPreferencesFilter, setPartnerPreferencesFilter] = useState<MatrimonyMatchesFilter>(
    () => initialMatchesSnapshot?.viewerPreferencesFilter || {}
  );
  const [syncedPrefUpdatedAtMs, setSyncedPrefUpdatedAtMs] = useState<number>(
    () => initialMatchesSnapshot?.preferencesUpdatedAtMs || 0
  );
  const [totalAvailableCount, setTotalAvailableCount] = useState<number>(
    () => initialMatchesSnapshot?.totalAvailableCount ?? initialMatchesSnapshot?.matches?.length ?? 0
  );
  const [prefsHydrated, setPrefsHydrated] = useState(false);
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

  const [matches, setMatches] = useState<MatrimonyMatchCandidate[]>(
    () => initialMatchesSnapshot?.matches || []
  );
  const [hiddenCount, setHiddenCount] = useState<number>(
    () => initialMatchesSnapshot?.hiddenCount ?? 0
  );
  const [undoHidden, setUndoHidden] = useState<{ uid: string; name: string } | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(
    () => initialMatchesSnapshot?.viewerPhoto || null
  );
  const [loading, setLoading] = useState(() => !initialMatchesSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionBusyUid, setActionBusyUid] = useState<string | null>(null);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [displayLayout, setDisplayLayout] = useState<'photo' | 'list'>('photo');
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.multiGet([
      '@rhema_matrimony_matches_layout',
      filtersStorageKey,
      sortStorageKey,
      tabStorageKey,
      modeStorageKey,
      prefTsStorageKey,
    ])
      .then((entries) => {
        if (!active) return;
        const map = Object.fromEntries(entries);
        const savedLayout = map['@rhema_matrimony_matches_layout'];
        if (savedLayout === 'list' || savedLayout === 'photo') {
          setDisplayLayout(savedLayout);
        }
        const savedFiltersRaw = map[filtersStorageKey];
        if (savedFiltersRaw) {
          try {
            const parsed = JSON.parse(savedFiltersRaw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              setFiltersState(parsed);
            }
          } catch {
            // Ignore corrupt filter JSON
          }
        }
        const savedSort = map[sortStorageKey];
        if (
          savedSort === 'best_match' ||
          savedSort === 'last_active' ||
          savedSort === 'date_created' ||
          savedSort === 'distance' ||
          savedSort === 'latest_photos'
        ) {
          setSortByState(savedSort);
        }
        const savedTab = map[tabStorageKey] as MatchTab | undefined;
        if (requestedInitialTab) {
          setTabState(requestedInitialTab);
          AsyncStorage.setItem(tabStorageKey, requestedInitialTab).catch(() => {});
        } else if (
          savedTab === 'all' ||
          savedTab === 'newly_joined' ||
          (savedTab && Object.prototype.hasOwnProperty.call(MORE_TAB_TITLES, savedTab))
        ) {
          setTabState(savedTab);
        }
        const savedMode = map[modeStorageKey];
        if (savedMode === 'preferences' || savedMode === 'custom' || savedMode === 'cleared') {
          setFilterModeState(savedMode);
        }
        const savedPrefTs = Number(map[prefTsStorageKey] || '0');
        if (Number.isFinite(savedPrefTs) && savedPrefTs > 0) {
          setSyncedPrefUpdatedAtMs(savedPrefTs);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setPrefsHydrated(true);
      });

    return () => {
      active = false;
    };
  }, [filtersStorageKey, sortStorageKey, tabStorageKey, modeStorageKey, prefTsStorageKey, requestedInitialTab]);

  useEffect(() => {
    if (requestedInitialTab) {
      setTabState(requestedInitialTab);
      AsyncStorage.setItem(tabStorageKey, requestedInitialTab).catch(() => {});
    }
  }, [requestedInitialTab, tabStorageKey]);

  const setTab = useCallback(
    (updater: React.SetStateAction<MatchTab>) => {
      setTabState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        AsyncStorage.setItem(tabStorageKey, next).catch(() => {});
        return next;
      });
    },
    [tabStorageKey]
  );

  const setFilterMode = useCallback(
    (next: MatchFilterMode) => {
      setFilterModeState(next);
      AsyncStorage.setItem(modeStorageKey, next).catch(() => {});
    },
    [modeStorageKey]
  );

  const matchBasis: 'partner_preferences' | 'all_filters' =
    filterMode === 'preferences' ? 'partner_preferences' : 'all_filters';

  const setFilters = useCallback(
    (updater: React.SetStateAction<MatrimonyMatchesFilter>) => {
      setFiltersState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        AsyncStorage.setItem(filtersStorageKey, JSON.stringify(next || {})).catch(() => {});
        return next;
      });
    },
    [filtersStorageKey]
  );

  const setSortBy = useCallback(
    (next: SortOption) => {
      setSortByState(next);
      AsyncStorage.setItem(sortStorageKey, next).catch(() => {});
    },
    [sortStorageKey]
  );

  const selectDisplayLayout = (next: 'photo' | 'list') => {
    setDisplayLayout(next);
    setLayoutModalOpen(false);
    AsyncStorage.setItem('@rhema_matrimony_matches_layout', next).catch(() => {});
  };
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [draftSortBy, setDraftSortBy] = useState<SortOption>('last_active');
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [draftSameCity, setDraftSameCity] = useState(false);
  const [draftSameState, setDraftSameState] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  const [galleryPreviewPhotos, setGalleryPreviewPhotos] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const loadMatches = useCallback(
    async (silent = false, force = false) => {
      if (!prefsHydrated) return;
      const cached = matrimonyApi.getCachedMatches({ tab, matchBasis, sortBy, filters });
      if (cached && !force) {
        setMatches(cached.matches || []);
        setHiddenCount(cached.hiddenCount ?? 0);
        setTotalAvailableCount(cached.totalAvailableCount ?? cached.matches?.length ?? 0);
        if (cached.viewerPhoto !== undefined) setViewerPhoto(cached.viewerPhoto || null);
        if (cached.viewerPreferencesFilter) setPartnerPreferencesFilter(cached.viewerPreferencesFilter);
        setLoading(false);
      } else if (!silent && matches.length === 0) {
        setLoading(true);
      }
      setErrorMsg(null);
      try {
        const res = await matrimonyApi.getMatches(
          { tab, matchBasis, sortBy, filters },
          { force }
        );
        setMatches(res.matches || []);
        setHiddenCount(res.hiddenCount ?? 0);
        setTotalAvailableCount(res.totalAvailableCount ?? res.matches?.length ?? 0);
        if (res.viewerPhoto !== undefined) {
          setViewerPhoto(res.viewerPhoto || null);
        }

        const remotePrefFilter = res.viewerPreferencesFilter || {};
        const remotePrefTs = res.preferencesUpdatedAtMs || 0;
        setPartnerPreferencesFilter(remotePrefFilter);

        const prefsChangedRemotely =
          remotePrefTs > 0 && syncedPrefUpdatedAtMs > 0 && remotePrefTs > syncedPrefUpdatedAtMs;

        if (remotePrefTs > syncedPrefUpdatedAtMs) {
          setSyncedPrefUpdatedAtMs(remotePrefTs);
          AsyncStorage.setItem(prefTsStorageKey, String(remotePrefTs)).catch(() => {});
        }

        if (prefsChangedRemotely) {
          setFilterMode('preferences');
          if (Object.keys(filters).length > 0) {
            setFilters({});
          }
        }
      } catch (err: any) {
        if (isMatrimonyInactiveError(err)) {
          navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
          return;
        }
        console.warn('getMatrimonyMatches error:', err);
        if (!cached && matches.length === 0) {
          setErrorMsg(err?.message || 'Unable to load matches right now.');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      prefsHydrated,
      tab,
      matchBasis,
      sortBy,
      filters,
      filterMode,
      syncedPrefUpdatedAtMs,
      prefTsStorageKey,
      setFilterMode,
      setFilters,
    ]
  );

  useEffect(() => {
    if (prefsHydrated) {
      loadMatches(false, false);
    }
  }, [prefsHydrated, loadMatches]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (prefsHydrated) {
        loadMatches(true, false);
      }
    });
    return unsub;
  }, [navigation, prefsHydrated, loadMatches]);

  const displayedMatches = useMemo(
    () =>
      matchTier === 'prime'
        ? matches.filter(
            (m) =>
              Boolean(m.signedProfilePhoto) &&
              (m.matchScore >= 65 || m.faithSummary?.baptized === true)
          )
        : matches,
    [matches, matchTier]
  );

  const openMatchDetail = (index: number, initialPhotoIndex = 0) => {
    navigation.navigate('MatrimonyMatchDetail', {
      matches: displayedMatches,
      initialIndex: index,
      initialPhotoIndex,
      viewerPhoto,
      tabTitle:
        matchTier === 'prime'
          ? 'Prime matches'
          : tab === 'newly_joined'
          ? 'Newly joined'
          : tab === 'shortlisted'
          ? 'Shortlisted'
          : tab === 'shared_interests'
          ? 'Shared interests'
          : 'All matches',
    });
  };

  const handleToggleShortlist = async (targetUid: string) => {
    setMatches((prev) =>
      prev.map((m) => (m.uid === targetUid ? { ...m, isShortlisted: !m.isShortlisted } : m))
    );
    try {
      const res = await matrimonyApi.toggleShortlist(targetUid);
      setMatches((prev) =>
        prev.map((m) => (m.uid === targetUid ? { ...m, isShortlisted: res.shortlisted } : m))
      );
      if (tab === 'shortlisted' && !res.shortlisted) {
        setMatches((prev) => prev.filter((m) => m.uid !== targetUid));
      }
    } catch (err: any) {
      loadMatches(true);
      Alert.alert('Error', err?.message || 'Could not update shortlist.');
    }
  };

  useEffect(() => {
    if (!undoHidden) return;
    const t = setTimeout(() => setUndoHidden(null), 6000);
    return () => clearTimeout(t);
  }, [undoHidden]);

  const handleDismiss = async (targetUid: string) => {
    const targetCandidate = matches.find((m) => m.uid === targetUid);
    setActionBusyUid(targetUid);
    try {
      await matrimonyApi.dismissMatch(targetUid);
      setMatches((prev) => prev.filter((m) => m.uid !== targetUid));
      setHiddenCount((c) => c + 1);
      setUndoHidden({
        uid: targetUid,
        name: targetCandidate?.displayName || 'Profile',
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not hide this profile.');
    } finally {
      setActionBusyUid(null);
    }
  };

  const handleRestoreHidden = async (targetUid?: string) => {
    setUndoHidden(null);
    setMoreMenuOpen(false);
    try {
      await matrimonyApi.restoreDismissedMatches(targetUid);
      await loadMatches(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not restore hidden profile.');
    }
  };

  const handleSendInterest = async (candidate: MatrimonyMatchCandidate) => {
    if (candidate.interestStatus) return;
    setActionBusyUid(candidate.uid);
    try {
      const res = await matrimonyApi.sendInterest(candidate.uid);
      setMatches((prev) =>
        prev.map((m) =>
          m.uid === candidate.uid
            ? { ...m, interestStatus: res.interestStatus, interestSentAtMs: Date.now() }
            : m
        )
      );
      if (res.isMutual) {
        Alert.alert(
          'Mutual Match!',
          `${candidate.displayName} also expressed interest in you.`
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Unable to send interest.');
    } finally {
      setActionBusyUid(null);
    }
  };

  const openPhotoViewer = (item: MatrimonyMatchCandidate, idx: number, photoIdx = 0) => {
    const imgs: string[] = [];
    if (item.signedProfilePhoto) imgs.push(item.signedProfilePhoto);
    for (const g of item.signedGallery || []) {
      if (g && !imgs.includes(g)) imgs.push(g);
    }
    if (imgs.length === 0) {
      openMatchDetail(idx);
      return;
    }
    setGalleryPreviewPhotos(imgs);
    setGalleryIndex(Math.max(0, Math.min(photoIdx, imgs.length - 1)));
  };

  const activeFilterCount = useMemo(() => countActiveMatrimonyFilters(filters), [filters]);

  const cardSurface = isDark ? colors.surface : '#FFFFFF';
  const softBg = isDark ? colors.bg : '#F6F7F9';

  const renderMatchCard = ({ item, index }: { item: MatrimonyMatchCandidate; index: number }) => {
    const detailsParts = [
      item.age ? `${item.age} Yrs` : null,
      formatCompactHeight(item.heightCm),
      item.education?.qualification,
      item.career?.profession,
      item.location?.village || item.location?.city || item.location?.state,
      item.faithSummary?.baptized === true ? 'Baptized' : null,
    ].filter(Boolean);

    const hasSentInterest = Boolean(item.interestStatus);
    const isMutual = item.interestStatus === 'accepted';
    const isNewlyJoinedProfile = Boolean(
      item.joinedAtMs && Date.now() - item.joinedAtMs <= THIRTY_DAYS_MS
    );

    const renderCardActions = () => (
      <View style={styles.cardActionsRow}>
        <TouchableOpacity
          style={[
            styles.dontShowBtn,
            { borderColor: isDark ? '#475569' : '#CBD5E1' },
          ]}
          disabled={actionBusyUid === item.uid}
          onPress={() => handleDismiss(item.uid)}
          activeOpacity={0.8}
        >
          <X size={16} color={colors.textSecondary} />
          <Text
            style={[
              styles.dontShowText,
              { color: colors.textSecondary, fontFamily, fontSize: scaleFont(14) },
            ]}
          >
            Don&apos;t Show
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.sendInterestBtn,
            hasSentInterest && {
              backgroundColor: isMutual ? GREEN : '#15803D',
            },
          ]}
          disabled={hasSentInterest || actionBusyUid === item.uid}
          onPress={() => handleSendInterest(item)}
          activeOpacity={0.88}
        >
          {actionBusyUid === item.uid ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : hasSentInterest ? (
            <>
              <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={[styles.sendInterestText, { fontFamily, fontSize: scaleFont(14) }]}>
                {isMutual ? 'Mutual Match' : 'Interest Sent'}
              </Text>
            </>
          ) : (
            <>
              <Heart size={16} color="#FFFFFF" />
              <Text style={[styles.sendInterestText, { fontFamily, fontSize: scaleFont(14) }]}>
                Send Interest
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );

    if (displayLayout === 'list') {
      return (
        <View
          style={[
            styles.matchCard,
            {
              backgroundColor: cardSurface,
              borderColor: isDark ? colors.border : '#E5E7EB',
            },
          ]}
        >
          <View style={styles.listTopRow}>
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => openMatchDetail(index)}
              style={styles.listThumbBox}
            >
              {item.signedProfilePhoto ? (
                <Image
                  source={{ uri: item.signedProfilePhoto }}
                  style={styles.cardPhoto}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.photoPlaceholder,
                    { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' },
                  ]}
                >
                  <User size={44} color={isDark ? '#64748B' : '#94A3B8'} />
                </View>
              )}

              {isNewlyJoinedProfile && (
                <LinearGradient
                  colors={['#8B5CF6', '#6D28D9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.newlyJoinedRibbonCompact}
                  pointerEvents="none"
                >
                  <Text style={styles.newlyJoinedRibbonTextCompact} numberOfLines={1}>
                    NEWLY
                  </Text>
                  <Text style={styles.newlyJoinedRibbonTextCompact} numberOfLines={1}>
                    JOINED
                  </Text>
                </LinearGradient>
              )}

              <TouchableOpacity
                style={[
                  styles.listShortlistBox,
                  item.isShortlisted && { backgroundColor: CORAL_RED, borderColor: CORAL_RED },
                ]}
                activeOpacity={0.85}
                onPress={() => handleToggleShortlist(item.uid)}
              >
                <Bookmark
                  size={13}
                  color={item.isShortlisted ? '#FFFFFF' : '#475569'}
                  fill={item.isShortlisted ? '#FFFFFF' : 'transparent'}
                />
              </TouchableOpacity>

              {item.photoCount > 0 && (
                <TouchableOpacity
                  style={styles.photoCountBadgeCompact}
                  activeOpacity={0.85}
                  onPress={() => openPhotoViewer(item, index)}
                >
                  <Text style={styles.photoCountText}>{item.photoCount}</Text>
                  <ImageIcon size={12} color="#334155" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => openMatchDetail(index)}
              style={styles.listRightCol}
            >
              <VerifiedRibbonBadge fontFamily={fontFamily} />

              <Text
                style={[
                  styles.candidateName,
                  { color: colors.text, fontFamily, fontSize: scaleFont(17.5), marginTop: 4 },
                ]}
                numberOfLines={1}
              >
                {item.displayName}
              </Text>

              <Text
                style={[
                  styles.candidateSubMeta,
                  { color: colors.textSecondary, fontFamily, fontSize: scaleFont(12.5) },
                ]}
                numberOfLines={1}
              >
                {item.profileCode} | {formatRecencyLabel(item.joinedAtMs)}
              </Text>

              <Text
                style={[
                  styles.detailsSummary,
                  { color: colors.text, fontFamily, fontSize: scaleFont(13.5), marginTop: 4 },
                ]}
              >
                {detailsParts.join('  •  ')}
              </Text>
            </TouchableOpacity>
          </View>

          {renderCardActions()}
        </View>
      );
    }

    return (
      <View
        style={[
          styles.matchCard,
          {
            backgroundColor: cardSurface,
            borderColor: isDark ? colors.border : '#E5E7EB',
          },
        ]}
      >
        {/* Static Photo Container on main card (scrollable inside detail view) */}
        <TouchableOpacity
          activeOpacity={0.94}
          onPress={() => openMatchDetail(index)}
          style={styles.photoBox}
        >
          {item.signedProfilePhoto ? (
            <Image
              source={{ uri: item.signedProfilePhoto }}
              style={styles.cardPhoto}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[
                styles.photoPlaceholder,
                { backgroundColor: isDark ? '#1E293B' : '#EEF2F6' },
              ]}
            >
              <User size={68} color={isDark ? '#64748B' : '#94A3B8'} />
              <Text style={[styles.noPhotoText, { color: colors.textSecondary, fontFamily }]}>
                No Photo Uploaded
              </Text>
            </View>
          )}

          {isNewlyJoinedProfile && (
            <LinearGradient
              colors={['#8B5CF6', '#6D28D9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.newlyJoinedRibbon}
              pointerEvents="none"
            >
              <Text style={styles.newlyJoinedRibbonText} numberOfLines={1}>
                NEWLY
              </Text>
              <Text style={styles.newlyJoinedRibbonTextBottom} numberOfLines={1}>
                JOINED
              </Text>
            </LinearGradient>
          )}

          {/* Top Right: Shortlist Pill matching screenshot */}
          <TouchableOpacity
            style={[
              styles.shortlistPill,
              item.isShortlisted && { backgroundColor: CORAL_RED },
            ]}
            activeOpacity={0.85}
            onPress={() => handleToggleShortlist(item.uid)}
          >
            <Bookmark
              size={14}
              color="#FFFFFF"
              fill={item.isShortlisted ? '#FFFFFF' : 'transparent'}
            />
            <Text style={styles.shortlistPillText}>
              {item.isShortlisted ? 'Shortlisted' : 'Shortlist'}
            </Text>
          </TouchableOpacity>

          {/* Bottom Right: Photo Count Pill */}
          {item.photoCount > 0 && (
            <TouchableOpacity
              style={styles.photoCountBadge}
              activeOpacity={0.85}
              onPress={() => openPhotoViewer(item, index)}
            >
              <Text style={styles.photoCountText}>{item.photoCount}</Text>
              <ImageIcon size={13} color="#334155" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* Body Content below Photo */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openMatchDetail(index)}
          style={styles.cardBody}
        >
          <View style={styles.verifiedRow}>
            <VerifiedRibbonBadge fontFamily={fontFamily} />
          </View>

          <Text
            style={[
              styles.candidateName,
              { color: colors.text, fontFamily, fontSize: scaleFont(19) },
            ]}
            numberOfLines={1}
          >
            {item.displayName}
          </Text>

          <Text
            style={[
              styles.candidateSubMeta,
              { color: colors.textSecondary, fontFamily, fontSize: scaleFont(12.5) },
            ]}
            numberOfLines={1}
          >
            {item.profileCode} | {formatRecencyLabel(item.joinedAtMs)}
          </Text>

          <Text
            style={[
              styles.detailsSummary,
              { color: colors.text, fontFamily, fontSize: scaleFont(14.5) },
            ]}
          >
            {detailsParts.join('  •  ')}
          </Text>

          {item.sharedInterests.length > 0 && (
            <View style={styles.sharedRow}>
              <Text style={[styles.sharedLabel, { fontFamily }]}>
                Shared: {item.sharedInterests.slice(0, 3).join(', ')}
                {item.sharedInterests.length > 3 ? ` +${item.sharedInterests.length - 3}` : ''}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Bottom Dual Action Row: Don't Show & Send Interest matching screenshot */}
        {renderCardActions()}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: cardSurface }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={cardSurface} />

      {/* Top Regular / PRIME Toggle & Tabs Strip (Uniform White Header) */}
      <View
        style={[
          styles.topHeaderContainer,
          {
            backgroundColor: cardSurface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.tierBarRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.topBackBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>

          <MatrimonyTierToggle
            value={matchTier}
            onChange={setMatchTier}
            fontFamily={fontFamily}
          />

          <View style={styles.tierBarRightSpacer} />
        </View>

        <View style={styles.topTabsRow}>
          <TouchableOpacity
            style={[styles.topTabItem, tab === 'all' && styles.topTabItemActive]}
            onPress={() => setTab('all')}
          >
            <Text
              style={[
                styles.topTabText,
                {
                  color: tab === 'all' ? ORANGE : colors.text,
                  fontWeight: tab === 'all' ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              All matches
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.topTabItem, tab !== 'all' && styles.topTabItemActive]}
            onPress={() => {
              if (tab === 'all') {
                setTab('newly_joined');
              } else if (tab !== 'newly_joined') {
                setMoreMenuOpen(true);
              }
            }}
          >
            <Text
              style={[
                styles.topTabText,
                {
                  color: tab !== 'all' ? ORANGE : colors.text,
                  fontWeight: tab !== 'all' ? '800' : '600',
                  fontFamily,
                },
              ]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {tab !== 'all' ? MORE_TAB_TITLES[tab] || 'Newly joined' : 'Newly joined'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.topTabItem}
            onPress={() => setMoreMenuOpen(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text
                style={[
                  styles.topTabText,
                  {
                    color: colors.text,
                    fontWeight: '600',
                    fontFamily,
                  },
                ]}
              >
                More
              </Text>
              <ChevronDown size={15} color={colors.textSecondary} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Body wrapper below white top bar */}
      <View style={{ flex: 1, backgroundColor: softBg }}>
      {/* Subheader: Count & Preferences + Filter/Sort Pills */}
      <View style={[styles.subHeaderWrap, { backgroundColor: softBg }]}>
        <View style={styles.countRow}>
          {tab === 'all' ? (
            <Text style={[styles.countText, { color: colors.text, fontFamily, fontSize: scaleFont(14.5) }]}>
              {displayedMatches.length} {displayedMatches.length === 1 ? 'Match' : 'Matches'} based on your{' '}
              <Text
                style={styles.prefLink}
                onPress={() =>
                  navigation.navigate('MatrimonyEditProfile', {
                    focusSection: 'partnerPreference',
                  })
                }
              >
                preferences
              </Text>
            </Text>
          ) : (
            <Text style={[styles.countText, { color: colors.text, fontFamily, fontSize: scaleFont(14.5), flex: 1, paddingRight: 8 }]}>
              {displayedMatches.length} {displayedMatches.length === 1 ? 'Match' : 'Matches'}{' '}
              {TAB_COUNT_SUBTITLE_SUFFIX[tab] || 'in this view'}
            </Text>
          )}

          <TouchableOpacity
            onPress={() => setLayoutModalOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreVertical size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsScroll}
        >
          <TouchableOpacity
            style={[
              styles.pillBtn,
              {
                backgroundColor: cardSurface,
                borderColor: activeFilterCount > 0 ? colors.text : isDark ? colors.border : '#CBD5E1',
              },
            ]}
            onPress={() => setFilterModalOpen(true)}
          >
            <SlidersHorizontal size={14} color={colors.text} />
            <Text
              style={[
                styles.pillBtnText,
                {
                  color: colors.text,
                  fontWeight: activeFilterCount > 0 ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pillBtn,
              {
                backgroundColor: cardSurface,
                borderColor: sortBy !== 'best_match' ? colors.text : isDark ? colors.border : '#CBD5E1',
              },
            ]}
            onPress={() => {
              setDraftSortBy(sortBy === 'best_match' ? 'last_active' : sortBy);
              setSortModalOpen(true);
            }}
          >
            <Text
              style={[
                styles.pillBtnText,
                {
                  color: colors.text,
                  fontWeight: sortBy !== 'best_match' ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              {sortBy === 'best_match' ? 'Sort by' : SORT_LABELS[sortBy]}
            </Text>
            <ChevronDown size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pillBtn,
              {
                backgroundColor: cardSurface,
                borderColor: tab === 'newly_joined' ? colors.text : isDark ? colors.border : '#CBD5E1',
              },
            ]}
            onPress={() => setTab((prev) => (prev === 'newly_joined' ? 'all' : 'newly_joined'))}
          >
            <Text
              style={[
                styles.pillBtnText,
                {
                  color: colors.text,
                  fontWeight: tab === 'newly_joined' ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              Newly joined
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pillBtn,
              {
                backgroundColor: cardSurface,
                borderColor: filters.withPhotoOnly
                  ? colors.text
                  : isDark
                  ? colors.border
                  : '#CBD5E1',
              },
            ]}
            onPress={() =>
              setFilters((p) => ({ ...p, withPhotoOnly: !p.withPhotoOnly }))
            }
          >
            <Text
              style={[
                styles.pillBtnText,
                {
                  color: colors.text,
                  fontWeight: filters.withPhotoOnly ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              Profiles with photos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pillBtn,
              {
                backgroundColor: cardSurface,
                borderColor:
                  filters.sameCity || filters.sameState
                    ? colors.text
                    : isDark
                    ? colors.border
                    : '#CBD5E1',
              },
            ]}
            onPress={() => {
              setDraftSameCity(Boolean(filters.sameCity));
              setDraftSameState(Boolean(filters.sameState));
              setLocationModalOpen(true);
            }}
          >
            <Text
              style={[
                styles.pillBtnText,
                {
                  color: colors.text,
                  fontWeight: filters.sameCity || filters.sameState ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              Location
            </Text>
            <ChevronDown size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Matches Feed */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={CORAL_RED} />
          <Text style={[styles.loadingText, { color: colors.textSecondary, fontFamily }]}>
            Loading your matches...
          </Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.centerBox}>
          <Text style={[styles.emptyTitle, { color: colors.text, fontFamily }]}>
            Could Not Load Matches
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary, fontFamily }]}>
            {errorMsg}
          </Text>
          <TouchableOpacity style={styles.primaryCtaBtn} onPress={() => loadMatches()}>
            <Text style={styles.primaryCtaText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayedMatches}
          keyExtractor={(item) => item.uid}
          renderItem={renderMatchCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadMatches(true, true);
              }}
              colors={[CORAL_RED]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? '#1E293B' : '#FEE2E2' }]}>
                <HeartHandshake size={34} color={CORAL_RED} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text, fontFamily }]}>
                {matchTier === 'prime'
                  ? 'No Prime Matches Found Right Now'
                  : tab === 'shortlisted' || tab === 'shortlisted_by_you'
                  ? 'No Shortlisted Profiles Yet'
                  : tab === 'shortlisted_you'
                  ? 'No One Shortlisted You Yet'
                  : tab === 'viewed_you'
                  ? 'No Profile Views Yet'
                  : tab === 'viewed_by_you'
                  ? 'No Profiles Viewed Yet'
                  : tab !== 'all' && tab !== 'newly_joined' && MORE_TAB_TITLES[tab]
                  ? `No ${MORE_TAB_TITLES[tab]} Found`
                  : 'No Matches Found Right Now'}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary, fontFamily }]}>
                {matchTier === 'prime'
                  ? 'PRIME highlights verified members with uploaded photos and high compatibility or baptism verification. Switch to Regular to see all matches.'
                  : tab === 'shortlisted' || tab === 'shortlisted_by_you'
                  ? 'Tap Shortlist on any match card to save profiles here.'
                  : tab === 'shortlisted_you'
                  ? 'Members who shortlist your profile will appear here.'
                  : tab === 'viewed_you'
                  ? 'Verified members who view your profile will appear here.'
                  : tab === 'viewed_by_you'
                  ? 'Profiles you open and view will appear here.'
                  : totalAvailableCount > 0 && (activeFilterCount > 0 || tab !== 'all')
                  ? `${totalAvailableCount} other verified ${totalAvailableCount === 1 ? 'profile is' : 'profiles are'} available outside this view. Tap Reset Filters to view all.`
                  : 'Only verified Rhema members matching your gender, age, partner preferences, and interests appear here.'}
              </Text>
              <View style={styles.emptyActionsRow}>
                {matchTier === 'prime' && (
                  <TouchableOpacity
                    style={[styles.secondaryCtaBtn, { borderColor: colors.border }]}
                    onPress={() => setMatchTier('regular')}
                  >
                    <Text style={[styles.secondaryCtaText, { color: colors.text, fontFamily }]}>
                      Switch to Regular
                    </Text>
                  </TouchableOpacity>
                )}
                {(activeFilterCount > 0 || tab !== 'all') && (
                  <TouchableOpacity
                    style={[styles.secondaryCtaBtn, { borderColor: colors.border }]}
                    onPress={() => {
                      setTab('all');
                      setFilterMode('preferences');
                      setFilters({});
                    }}
                  >
                    <Text style={[styles.secondaryCtaText, { color: colors.text, fontFamily }]}>
                      Reset Filters
                    </Text>
                  </TouchableOpacity>
                )}
                {hiddenCount > 0 && (
                  <TouchableOpacity
                    style={[styles.secondaryCtaBtn, { borderColor: colors.border }]}
                    onPress={() => handleRestoreHidden()}
                  >
                    <Text style={[styles.secondaryCtaText, { color: colors.text, fontFamily }]}>
                      Restore Hidden ({hiddenCount})
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.primaryCtaBtn}
                  onPress={() =>
                    navigation.navigate('MatrimonyEditProfile', {
                      focusSection: 'partnerPreference',
                    })
                  }
                >
                  <Text style={styles.primaryCtaText}>Adjust Preferences</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      )}

      {undoHidden ? (
        <View style={styles.undoToast}>
          <Text style={[styles.undoToastText, { fontFamily }]} numberOfLines={1}>
            {undoHidden.name} hidden from matches
          </Text>
          <TouchableOpacity onPress={() => handleRestoreHidden(undoHidden.uid)} activeOpacity={0.8}>
            <Text style={[styles.undoToastAction, { fontFamily }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </View>

      {/* Bottom Navigation Bar matching Home Screen */}
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
          {
            key: 'Home',
            label: 'Home',
            Icon: Home,
            active: false,
            onPress: () => navigation.navigate('MatrimonyHome'),
          },
          {
            key: 'Matches',
            label: 'Matches',
            Icon: Users,
            active: true,
            onPress: () => {},
          },
          {
            key: 'Interests',
            label: 'Interests',
            Icon: Heart,
            active: false,
            onPress: () => navigation.navigate('MatrimonyInterestsHub'),
          },
          {
            key: 'Messages',
            label: 'Messages',
            Icon: MessageCircle,
            active: false,
            onPress: () => navigation.navigate('MatrimonyMessages'),
          },
          {
            key: 'Upgrade',
            label: 'Upgrade',
            Icon: Crown,
            active: false,
            onPress: () => navigation.navigate('MatrimonyUpgrade'),
          },
        ].map(({ key, label, Icon, active, onPress }) => (
          <TouchableOpacity key={key} style={styles.navItem} onPress={onPress} activeOpacity={0.8}>
            <View style={{ position: 'relative' }}>
              <Icon size={20} color={active ? ORANGE : colors.textSecondary} />
              {key === 'Messages' && unreadChatCount > 0 && (
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
                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.navLabel,
                {
                  color: active ? ORANGE : colors.textSecondary,
                  fontWeight: active ? '800' : '600',
                  fontFamily,
                },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Matches Display Layout Sheet */}
      <Modal
        visible={layoutModalOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setLayoutModalOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setLayoutModalOpen(false)}
          />
          <View
            style={[
              styles.sheetCard,
              { backgroundColor: cardSurface, paddingBottom: Math.max(insets.bottom + 18, 26) },
            ]}
          >
            <View style={{ alignItems: 'flex-end', marginBottom: 4 }}>
              <TouchableOpacity
                onPress={() => setLayoutModalOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.layoutSheetHeading, { color: colors.text, fontFamily }]}>
              Matches Display Layout
            </Text>

            <TouchableOpacity
              style={styles.layoutOptionRow}
              activeOpacity={0.75}
              onPress={() => selectDisplayLayout('photo')}
            >
              <View style={[styles.layoutThumbIconBox, { borderColor: colors.border }]}>
                <View style={styles.miniPhotoTop} />
                <View style={styles.miniLine} />
                <View style={[styles.miniLine, { width: 14 }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.layoutOptionTitle, { color: colors.text, fontFamily }]}>
                  Photo View{' '}
                  <Text style={[styles.layoutDefaultNote, { color: colors.textSecondary }]}>
                    (Default view)
                  </Text>
                </Text>
                <Text style={[styles.sortRadioSub, { color: colors.textSecondary, fontFamily }]}>
                  View matches with bigger photos
                </Text>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  { borderColor: displayLayout === 'photo' ? GREEN : '#94A3B8' },
                ]}
              >
                {displayLayout === 'photo' ? (
                  <View style={[styles.radioInner, { backgroundColor: GREEN }]} />
                ) : null}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.layoutOptionRow}
              activeOpacity={0.75}
              onPress={() => selectDisplayLayout('list')}
            >
              <View style={[styles.layoutThumbIconBox, { borderColor: colors.border }]}>
                <View style={styles.miniListPair}>
                  <View style={styles.miniSq} />
                  <View style={{ gap: 2 }}>
                    <View style={[styles.miniLine, { width: 10 }]} />
                    <View style={[styles.miniLine, { width: 7 }]} />
                  </View>
                </View>
                <View style={styles.miniListPair}>
                  <View style={styles.miniSq} />
                  <View style={{ gap: 2 }}>
                    <View style={[styles.miniLine, { width: 10 }]} />
                    <View style={[styles.miniLine, { width: 7 }]} />
                  </View>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.layoutOptionTitle, { color: colors.text, fontFamily }]}>
                  List View
                </Text>
                <Text style={[styles.sortRadioSub, { color: colors.textSecondary, fontFamily }]}>
                  View your matches in a list
                </Text>
              </View>
              <View
                style={[
                  styles.radioOuter,
                  { borderColor: displayLayout === 'list' ? GREEN : '#94A3B8' },
                ]}
              >
                {displayLayout === 'list' ? (
                  <View style={[styles.radioInner, { backgroundColor: GREEN }]} />
                ) : null}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* More Options Modal matching reference screenshots */}
      <MatrimonyMatchesMoreModal
        visible={moreMenuOpen}
        selectedTab={tab}
        hiddenCount={hiddenCount}
        onSelectTab={(nextTab) => setTab(nextTab)}
        onRestoreHidden={() => handleRestoreHidden()}
        onClose={() => setMoreMenuOpen(false)}
      />

      {/* Sort Matches By Modal matching reference screenshot */}
      <Modal
        visible={sortModalOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setSortModalOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setSortModalOpen(false)}
          />
          <View
            style={[
              styles.sheetCard,
              { backgroundColor: cardSurface, paddingBottom: Math.max(insets.bottom + 16, 22) },
            ]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: 'transparent', paddingBottom: 8 }]}>
              <Text style={[styles.sheetTitle, { color: colors.text, fontFamily, fontSize: 18 }]}>
                Sort matches by:
              </Text>
              <TouchableOpacity
                onPress={() => setSortModalOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ paddingVertical: 6, gap: 4 }}>
              {SORT_OPTIONS.map((opt) => {
                const selected = draftSortBy === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={styles.sortRadioRow}
                    activeOpacity={0.75}
                    onPress={() => setDraftSortBy(opt.key)}
                  >
                    <View style={styles.sortRadioTextWrap}>
                      <Text
                        style={[
                          styles.sortRadioTitle,
                          { color: colors.text, fontFamily },
                        ]}
                      >
                        {opt.title}
                      </Text>
                      <Text
                        style={[
                          styles.sortRadioSub,
                          { color: colors.textSecondary, fontFamily },
                        ]}
                      >
                        {opt.subtitle}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.radioOuter,
                        { borderColor: selected ? CORAL_RED : '#64748B' },
                      ]}
                    >
                      {selected ? <View style={styles.radioInner} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.sheetActionsRow}>
              <TouchableOpacity
                style={[styles.resetOutlineBtn, { borderColor: CORAL_RED }]}
                onPress={() => {
                  setSortBy('best_match');
                  setSortModalOpen(false);
                }}
              >
                <Text style={[styles.resetOutlineText, { fontFamily }]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyCoralBtn}
                onPress={() => {
                  setSortBy(draftSortBy);
                  setSortModalOpen(false);
                }}
              >
                <Text style={[styles.applyCoralText, { fontFamily }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Location Quick Filter Modal */}
      <Modal
        visible={locationModalOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setLocationModalOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setLocationModalOpen(false)}
          />
          <View
            style={[
              styles.sheetCard,
              { backgroundColor: cardSurface, paddingBottom: Math.max(insets.bottom + 16, 22) },
            ]}
          >
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.text, fontFamily, fontSize: 18 }]}>
                Location
              </Text>
              <TouchableOpacity
                onPress={() => setLocationModalOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ paddingVertical: 10 }}>
              <TouchableOpacity
                style={[styles.locationCheckRow, { borderBottomColor: colors.border }]}
                activeOpacity={0.75}
                onPress={() => setDraftSameCity((v) => !v)}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.sortRadioTitle, { color: colors.text, fontFamily }]}>
                    Same city
                  </Text>
                  <Text style={[styles.sortRadioSub, { color: colors.textSecondary, fontFamily }]}>
                    Show matches located in your city
                  </Text>
                </View>
                <View
                  style={[
                    styles.squareCheckbox,
                    {
                      borderColor: draftSameCity ? CORAL_RED : '#64748B',
                      backgroundColor: draftSameCity ? CORAL_RED : 'transparent',
                    },
                  ]}
                >
                  {draftSameCity ? <Check size={14} color="#FFFFFF" strokeWidth={2.8} /> : null}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.locationCheckRow, { borderBottomColor: 'transparent' }]}
                activeOpacity={0.75}
                onPress={() => setDraftSameState((v) => !v)}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.sortRadioTitle, { color: colors.text, fontFamily }]}>
                    Same state
                  </Text>
                  <Text style={[styles.sortRadioSub, { color: colors.textSecondary, fontFamily }]}>
                    Show matches located in your state
                  </Text>
                </View>
                <View
                  style={[
                    styles.squareCheckbox,
                    {
                      borderColor: draftSameState ? CORAL_RED : '#64748B',
                      backgroundColor: draftSameState ? CORAL_RED : 'transparent',
                    },
                  ]}
                >
                  {draftSameState ? <Check size={14} color="#FFFFFF" strokeWidth={2.8} /> : null}
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.sheetActionsRow}>
              <TouchableOpacity
                style={[styles.resetOutlineBtn, { borderColor: CORAL_RED }]}
                onPress={() => {
                  setDraftSameCity(false);
                  setDraftSameState(false);
                  setFilters((p) => ({
                    ...p,
                    sameCity: undefined,
                    sameState: undefined,
                  }));
                  setLocationModalOpen(false);
                }}
              >
                <Text style={[styles.resetOutlineText, { fontFamily }]}>Clear filter</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyCoralBtn}
                onPress={() => {
                  setFilters((p) => ({
                    ...p,
                    sameCity: draftSameCity ? true : undefined,
                    sameState: draftSameState ? true : undefined,
                  }));
                  setLocationModalOpen(false);
                }}
              >
                <Text style={[styles.applyCoralText, { fontFamily }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-Screen Filter Modal matching reference screenshots */}
      <MatrimonyMatchesFilterModal
        visible={filterModalOpen}
        initialFilters={filters}
        partnerPreferencesFilter={partnerPreferencesFilter}
        initialMatchCount={matches.length}
        tab={tab}
        matchBasis={matchBasis}
        sortBy={sortBy}
        onClose={() => setFilterModalOpen(false)}
        onReset={() => {
          setFilterMode('preferences');
          setFilters({});
        }}
        onApply={(nextFilters) => {
          setFilterModalOpen(false);
          const hasOverrides = Object.keys(nextFilters || {}).length > 0;
          setFilterMode(hasOverrides ? 'custom' : 'preferences');
          setFilters(nextFilters || {});
        }}
      />

      {/* Fullscreen Photo Gallery Lightbox */}
      <Modal
        visible={galleryPreviewPhotos.length > 0}
        transparent
        animationType="fade"
        onRequestClose={() => setGalleryPreviewPhotos([])}
      >
        <View style={styles.lightboxBackdrop}>
          <View style={[styles.lightboxHeader, { paddingTop: insets.top + 10 }]}>
            <Text style={styles.lightboxCounter}>
              {galleryIndex + 1} / {galleryPreviewPhotos.length}
            </Text>
            <TouchableOpacity onPress={() => setGalleryPreviewPhotos([])} style={{ padding: 6 }}>
              <X size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={galleryPreviewPhotos}
            horizontal
            pagingEnabled
            initialScrollIndex={galleryIndex}
            getItemLayout={(_, idx) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * idx,
              index: idx,
            })}
            keyExtractor={(item, idx) => `${item}-${idx}`}
            onMomentumScrollEnd={(e) => {
              setGalleryIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
            }}
            renderItem={({ item }) => (
              <View style={styles.lightboxSlide}>
                <Image source={{ uri: item }} style={styles.lightboxImage} resizeMode="contain" />
              </View>
            )}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topHeaderContainer: {
    borderBottomWidth: 1,
    paddingTop: 8,
  },
  tierBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  topBackBtn: {
    width: 36,
    paddingVertical: 6,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  tierBarRightSpacer: {
    width: 36,
  },
  tierPillTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    padding: 3,
    borderWidth: 1,
  },
  tierSegmentBtn: {
    paddingHorizontal: 22,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tierSegmentActive: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tierSegmentText: {
    fontSize: 13.5,
  },
  topTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
  },
  topTabItem: {
    paddingVertical: 13,
    paddingHorizontal: 5,
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  topTabItemActive: {
    borderBottomColor: ORANGE,
  },
  topTabText: {
    fontSize: 13.5,
  },
  subHeaderWrap: {
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  countText: {
    fontWeight: '700',
  },
  prefLink: {
    color: ORANGE,
    fontWeight: '800',
  },
  filterPillsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 16,
  },
  matchCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  photoBox: {
    width: '100%',
    height: 360,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  cardPhoto: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  newlyJoinedRibbon: {
    position: 'absolute',
    top: -10,
    left: -44,
    width: 120,
    height: 52,
    paddingBottom: 5,
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 4,
    zIndex: 4,
  },
  newlyJoinedRibbonText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
    lineHeight: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  newlyJoinedRibbonTextBottom: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  newlyJoinedRibbonCompact: {
    position: 'absolute',
    top: -9,
    left: -37,
    width: 100,
    height: 44,
    paddingBottom: 4,
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'flex-end',
    elevation: 4,
    zIndex: 4,
  },
  newlyJoinedRibbonTextCompact: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '800',
    lineHeight: 8.5,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  noPhotoText: {
    fontSize: 13,
    fontWeight: '600',
  },
  matchScoreBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  matchScoreText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  shortlistPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  shortlistPillText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  photoCountBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  photoCountText: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  cardBody: {
    paddingTop: 12,
    gap: 4,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  verifiedBadgeDot: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedLabel: {
    color: '#0284C7',
    fontSize: 13,
    fontWeight: '700',
  },
  baptizedTag: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  candidateName: {
    fontWeight: '800',
  },
  candidateSubMeta: {
    fontWeight: '500',
  },
  detailsSummary: {
    marginTop: 6,
    lineHeight: 21,
    fontWeight: '500',
  },
  sharedRow: {
    marginTop: 4,
  },
  sharedLabel: {
    color: ORANGE,
    fontSize: 12.5,
    fontWeight: '700',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  dontShowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1.2,
  },
  dontShowText: {
    fontWeight: '700',
  },
  sendInterestBtn: {
    flex: 1.25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: CORAL_RED,
  },
  sendInterestText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  primaryCtaBtn: {
    backgroundColor: CORAL_RED,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryCtaBtn: {
    borderWidth: 1.2,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaText: {
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  sheetOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetOptionText: {
    fontSize: 15,
  },
  layoutSheetHeading: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 14,
  },
  layoutOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  layoutThumbIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    padding: 6,
    justifyContent: 'center',
    gap: 3,
  },
  miniPhotoTop: {
    width: '100%',
    height: 16,
    borderRadius: 2,
    backgroundColor: '#1E293B',
  },
  miniLine: {
    width: '100%',
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#64748B',
  },
  miniListPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniSq: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#1E293B',
  },
  layoutOptionTitle: {
    fontSize: 15.5,
    fontWeight: '700',
  },
  layoutDefaultNote: {
    fontSize: 13,
    fontWeight: '500',
  },
  listTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  listThumbBox: {
    width: 118,
    height: 145,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  listRightCol: {
    flex: 1,
  },
  listShortlistBox: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCountBadgeCompact: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  sortRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 14,
  },
  sortRadioTextWrap: {
    flex: 1,
    gap: 2,
  },
  sortRadioTitle: {
    fontSize: 15.5,
    fontWeight: '700',
  },
  sortRadioSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: CORAL_RED,
  },
  locationCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  squareCheckbox: {
    width: 21,
    height: 21,
    borderRadius: 4,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  resetOutlineBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetOutlineText: {
    color: CORAL_RED,
    fontSize: 15,
    fontWeight: '700',
  },
  applyCoralBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: CORAL_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyCoralText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  undoToast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  undoToastText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  undoToastAction: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '800',
  },
  filterHeading: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  filterChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChoiceChip: {
    borderWidth: 1.2,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  filterChoiceText: {
    fontSize: 13,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  detailHeaderTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  detailMatchBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  detailMatchBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  detailHero: {
    width: '100%',
    height: 320,
    position: 'relative',
  },
  detailBody: {
    padding: 18,
    gap: 20,
  },
  compatCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  compatTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  reasonChipText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  detailSection: {
    gap: 8,
  },
  detailSectionTitle: {
    fontSize: 16.5,
    fontWeight: '800',
  },
  detailParagraph: {
    fontSize: 14.5,
    lineHeight: 22,
  },
  detailKvRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  detailKvLabel: {
    width: '42%',
    fontSize: 14,
  },
  detailKvVal: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  detailFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  lightboxCounter: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  lightboxSlide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
});
