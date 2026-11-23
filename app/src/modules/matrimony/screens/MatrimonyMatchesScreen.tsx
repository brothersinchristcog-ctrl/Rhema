import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
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
  Mail,
  MessageCircle,
  MoreVertical,
  Phone,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyTierToggle from '../components/MatrimonyTierToggle';
import MatrimonyMatchCard from '../components/MatrimonyMatchCard';
import ProtectedPhotoPlaceholder from '../components/ProtectedPhotoPlaceholder';
import VerifiedRibbonBadge from '../components/VerifiedRibbonBadge';
import MatrimonyMatchesFilterModal, {
  countActiveMatrimonyFilters,
} from '../components/MatrimonyMatchesFilterModal';
import MatrimonyMatchesMoreModal, { MORE_TAB_TITLES } from '../components/MatrimonyMatchesMoreModal';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';
import { matrimonyChatService } from '../services/matrimonyChatService';
import { matrimonyPerf } from '../services/matrimonyPerf';
import {
  MatrimonyMatchCandidate,
  MatrimonyMatchesFilter,
  MatrimonyMatchTab,
  MemberEntitlements,
} from '../types/matrimony';

const CORAL_RED = '#E04B5A';
const GREEN = '#16A34A';
const ORANGE = '#EA580C';
const MATCHES_PAGE_SIZE = 12;
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
  const incomingFilterNonce = route?.params?.filterNonce as number | undefined;
  const lastHandledSearchNonceRef = useRef<number>(0);
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
  const [filters, setFiltersState] = useState<MatrimonyMatchesFilter>(() =>
    incomingFilterNonce ? route?.params?.applySearchFilters || {} : {}
  );
  const [filterMode, setFilterModeState] = useState<MatchFilterMode>(() =>
    incomingFilterNonce
      ? route?.params?.applySearchMode ||
        (Object.keys(route?.params?.applySearchFilters || {}).length > 0 ? 'custom' : 'cleared')
      : 'preferences'
  );
  const initialMatchesSnapshot = matrimonyApi.getCachedMatches({
    tab: requestedInitialTab || 'all',
    matchBasis: 'partner_preferences',
    matchTier: 'regular',
    sortBy: 'best_match',
    filters: {},
  });
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

  const [matches, setMatches] = useState<MatrimonyMatchCandidate[]>(
    () => initialMatchesSnapshot?.matches || []
  );
  const [hiddenCount, setHiddenCount] = useState<number>(
    () => initialMatchesSnapshot?.hiddenCount ?? 0
  );
  const [undoHidden, setUndoHidden] = useState<{
    uid: string;
    name: string;
    candidate?: MatrimonyMatchCandidate;
    index?: number;
  } | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(
    () => initialMatchesSnapshot?.viewerPhoto || null
  );
  const [loading, setLoading] = useState(() => !initialMatchesSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionBusyUid, setActionBusyUid] = useState<string | null>(null);
  const [shortlistBusyMap, setShortlistBusyMap] = useState<Record<string, boolean>>({});
  const [photoReqBusyMap, setPhotoReqBusyMap] = useState<Record<string, boolean>>({});
  const shortlistInFlightRef = useRef<Set<string>>(new Set());
  const photoReqInFlightRef = useRef<Set<string>>(new Set());
  const dismissInFlightRef = useRef<Set<string>>(new Set());
  const unlockInFlightRef = useRef<Set<string>>(new Set());
  const matchesRef = useRef<MatrimonyMatchCandidate[]>(matches);
  matchesRef.current = matches;

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
        if (!lastHandledSearchNonceRef.current && savedFiltersRaw) {
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
          !lastHandledSearchNonceRef.current &&
          (savedTab === 'all' ||
            savedTab === 'newly_joined' ||
            (savedTab && Object.prototype.hasOwnProperty.call(MORE_TAB_TITLES, savedTab)))
        ) {
          setTabState(savedTab);
        }
        const savedMode = map[modeStorageKey];
        if (
          !lastHandledSearchNonceRef.current &&
          (savedMode === 'preferences' || savedMode === 'custom' || savedMode === 'cleared')
        ) {
          setFilterModeState(savedMode);
        }
        const savedPrefTs = Number(map[prefTsStorageKey] || '0');
        if (Number.isFinite(savedPrefTs) && savedPrefTs > 0) {
          setSyncedPrefUpdatedAtMs(savedPrefTs);
          syncedPrefUpdatedAtRef.current = savedPrefTs;
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

  useEffect(() => {
    if (!incomingFilterNonce || incomingFilterNonce === lastHandledSearchNonceRef.current) return;
    lastHandledSearchNonceRef.current = incomingFilterNonce;
    const nextFilters: MatrimonyMatchesFilter = route?.params?.applySearchFilters || {};
    const nextMode: MatchFilterMode =
      route?.params?.applySearchMode ||
      (Object.keys(nextFilters).length > 0 ? 'custom' : 'cleared');
    setTab('all');
    setMatchTier('regular');
    setFilterMode(nextMode);
    setFilters(nextFilters);
  }, [
    incomingFilterNonce,
    route?.params?.applySearchFilters,
    route?.params?.applySearchMode,
    setTab,
    setFilterMode,
    setFilters,
  ]);

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
  const [entitlements, setEntitlements] = useState<MemberEntitlements | null>(() =>
    matrimonyApi.getCachedEntitlements()
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState<boolean>(() => Boolean(initialMatchesSnapshot?.hasMore));
  const [totalMatchedCount, setTotalMatchedCount] = useState<number>(
    () => initialMatchesSnapshot?.totalCount ?? initialMatchesSnapshot?.matches?.length ?? 0
  );
  const loadSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const lastLoadTriggerAtRef = useRef(0);
  const nextOffsetRef = useRef<number>(
    initialMatchesSnapshot?.nextOffset ?? initialMatchesSnapshot?.matches?.length ?? 0
  );
  const loadingMoreRef = useRef(false);
  const shuffleSeedRef = useRef<number>(Math.floor(Math.random() * 900_000_000) + 1);
  const syncedPrefUpdatedAtRef = useRef<number>(
    initialMatchesSnapshot?.preferencesUpdatedAtMs || 0
  );
  const pendingSendMapRef = useRef<Map<string, Promise<any>>>(new Map());
  const interestToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [interestToast, setInterestToast] = useState<{
    kind: 'sent' | 'cancelled';
    uid: string;
    name: string;
    isMutual?: boolean;
  } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadSeqRef.current += 1;
      if (interestToastTimerRef.current) clearTimeout(interestToastTimerRef.current);
    };
  }, []);

  const [galleryPreviewPhotos, setGalleryPreviewPhotos] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const loadNextPage = useCallback(async () => {
    if (!prefsHydrated || loading || loadingMoreRef.current || !hasMore) return;
    const seq = loadSeqRef.current;
    const cursor = nextOffsetRef.current;
    if (cursor <= 0) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const trace = matrimonyPerf.startTrace('matches_next_page', { offset: cursor, tab });

    try {
      const nextPage = await matrimonyApi.getMatches(
        {
          tab,
          matchBasis,
          matchTier,
          sortBy,
          filters,
          offset: cursor,
          limit: MATCHES_PAGE_SIZE,
          shuffleSeed: shuffleSeedRef.current,
        },
        { force: true }
      );
      if (loadSeqRef.current !== seq || !mountedRef.current) {
        trace.stop(true, { cancelled: true });
        return;
      }

      const incoming = nextPage.matches || [];
      if (incoming.length > 0) {
        setMatches((prev) => {
          const existingMap = new Map(prev.map((m) => [m.uid, m]));
          const merged = [...prev];
          for (const item of incoming) {
            if (item?.uid && !existingMap.has(item.uid)) {
              merged.push(item);
            }
          }
          return merged;
        });
      }

      if (typeof nextPage.totalCount === 'number') {
        setTotalMatchedCount(nextPage.totalCount);
      }
      const nextHasMore = Boolean(nextPage.hasMore && incoming.length > 0);
      setHasMore(nextHasMore);
      nextOffsetRef.current =
        typeof nextPage.nextOffset === 'number'
          ? nextPage.nextOffset
          : cursor + incoming.length;
      trace.stop(true, { loaded: incoming.length, hasMore: nextHasMore });
    } catch (err) {
      trace.stop(false);
      console.warn('loadNextPage error:', err);
    } finally {
      loadingMoreRef.current = false;
      if (loadSeqRef.current === seq && mountedRef.current) {
        setLoadingMore(false);
      }
    }
  }, [prefsHydrated, loading, hasMore, tab, matchBasis, matchTier, sortBy, filters]);

  const loadMatches = useCallback(
    async (silent = false, force = false) => {
      if (!prefsHydrated) return;
      lastLoadTriggerAtRef.current = Date.now();
      const seq = ++loadSeqRef.current;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      const cached = matrimonyApi.getCachedMatches({ tab, matchBasis, matchTier, sortBy, filters });
      if (cached) {
        const cachedList = cached.matches || [];
        setMatches(cachedList);
        setTotalMatchedCount(cached.totalCount ?? cachedList.length);
        setHiddenCount(cached.hiddenCount ?? 0);
        setTotalAvailableCount(cached.totalAvailableCount ?? cachedList.length);
        setHasMore(Boolean(cached.hasMore));
        nextOffsetRef.current = cached.nextOffset ?? cachedList.length;
        if (cached.viewerPhoto !== undefined) setViewerPhoto(cached.viewerPhoto || null);
        if (cached.viewerPreferencesFilter) setPartnerPreferencesFilter(cached.viewerPreferencesFilter);
        if (cached.viewerEntitlements) setEntitlements(cached.viewerEntitlements);
        setLoading(false);
      } else if (!silent) {
        setMatches([]);
        setTotalMatchedCount(0);
        setHasMore(false);
        nextOffsetRef.current = 0;
        setLoading(true);
      }
      setErrorMsg(null);
      const trace = matrimonyPerf.startTrace('matches_initial_load', { tab, force, hasCache: Boolean(cached) });
      const shouldShuffleOnLoad = force || !cached;
      const seedForRequest = shouldShuffleOnLoad ? shuffleSeedRef.current : 0;
      try {
        const res = await matrimonyApi.getMatches(
          {
            tab,
            matchBasis,
            matchTier,
            sortBy,
            filters,
            offset: 0,
            limit: MATCHES_PAGE_SIZE,
            shuffleSeed: seedForRequest,
          },
          { force }
        );
        if (loadSeqRef.current !== seq || !mountedRef.current) {
          trace.stop(true, { cancelled: true });
          return;
        }

        const firstBatch = res.matches || [];
        // Preserve already-paginated items if this was a non-forced cache hit with more pages
        if (!force && cached && (cached.matches?.length || 0) > firstBatch.length) {
          setMatches(cached.matches);
          nextOffsetRef.current = cached.nextOffset ?? cached.matches.length;
          setHasMore(Boolean(cached.hasMore));
        } else {
          setMatches(firstBatch);
          nextOffsetRef.current =
            typeof res.nextOffset === 'number' ? res.nextOffset : firstBatch.length;
          setHasMore(Boolean(res.hasMore));
        }

        setTotalMatchedCount(res.totalCount ?? firstBatch.length);
        setHiddenCount(res.hiddenCount ?? 0);
        setTotalAvailableCount(res.totalAvailableCount ?? res.totalCount ?? firstBatch.length);
        if (res.viewerPhoto !== undefined) {
          setViewerPhoto(res.viewerPhoto || null);
        }
        if (res.viewerEntitlements) {
          setEntitlements(res.viewerEntitlements);
        }

        const remotePrefFilter = res.viewerPreferencesFilter || {};
        const remotePrefTs = res.preferencesUpdatedAtMs || 0;
        setPartnerPreferencesFilter(remotePrefFilter);

        const prevSyncedTs = syncedPrefUpdatedAtRef.current;
        const prefsChangedRemotely =
          remotePrefTs > 0 && prevSyncedTs > 0 && remotePrefTs > prevSyncedTs;

        if (remotePrefTs > prevSyncedTs) {
          syncedPrefUpdatedAtRef.current = remotePrefTs;
          setSyncedPrefUpdatedAtMs(remotePrefTs);
          AsyncStorage.setItem(prefTsStorageKey, String(remotePrefTs)).catch(() => {});
        }

        if (prefsChangedRemotely) {
          setFilterMode('preferences');
          if (Object.keys(filters).length > 0) {
            setFilters({});
          }
        }

        setLoading(false);
        setRefreshing(false);
        trace.stop(true, { count: firstBatch.length, total: res.totalCount ?? firstBatch.length });
      } catch (err: any) {
        trace.stop(false);
        if (loadSeqRef.current !== seq || !mountedRef.current) return;
        if (isMatrimonyInactiveError(err)) {
          navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
          return;
        }
        console.warn('getMatrimonyMatches error:', err);
        if (!cached && matches.length === 0) {
          setErrorMsg(err?.message || 'Unable to load matches right now.');
        }
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [
      prefsHydrated,
      tab,
      matchBasis,
      matchTier,
      sortBy,
      filters,
      prefTsStorageKey,
      setFilterMode,
      setFilters,
      navigation,
    ]
  );

  useEffect(() => {
    if (prefsHydrated) {
      loadMatches(false, false);
    }
  }, [prefsHydrated, loadMatches]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      if (!prefsHydrated) return;
      // Immediately reflect any cache patches made on MatchDetailScreen without forcing a network fetch
      const cached = matrimonyApi.getCachedMatches({ tab, matchBasis, matchTier, sortBy, filters });
      if (cached?.matches) {
        setMatches(cached.matches);
        if (typeof cached.totalCount === 'number') setTotalMatchedCount(cached.totalCount);
      }
      if (Date.now() - lastLoadTriggerAtRef.current < 1500) return;
      loadMatches(true, false);
    });
    return unsub;
  }, [navigation, prefsHydrated, loadMatches, tab, matchBasis, matchTier, sortBy, filters]);

  const displayedMatches = useMemo(
    () =>
      matchTier === 'prime'
        ? matches.filter(
            (m) =>
              m.candidateTier === 'silver' ||
              m.candidateTier === 'gold' ||
              m.candidateTier === 'platinum'
          )
        : matches,
    [matches, matchTier]
  );

  const openMatchDetail = useCallback(
    (index: number, initialPhotoIndex = 0) => {
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
    },
    [navigation, displayedMatches, viewerPhoto, matchTier, tab]
  );

  const handleToggleShortlist = useCallback(
    async (targetUid: string) => {
      if (shortlistInFlightRef.current.has(targetUid)) return;
      shortlistInFlightRef.current.add(targetUid);
      setShortlistBusyMap((prev) => ({ ...prev, [targetUid]: true }));
      const prevFlag = matchesRef.current.find((m) => m.uid === targetUid)?.isShortlisted;
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
        setMatches((prev) =>
          prev.map((m) =>
            m.uid === targetUid && prevFlag !== undefined ? { ...m, isShortlisted: prevFlag } : m
          )
        );
        if (
          err?.details?.reasonCode === 'SHORTLIST_LIMIT_REACHED' ||
          String(err?.message || '').toLowerCase().includes('shortlist')
        ) {
          Alert.alert(
            'Shortlist Limit Reached',
            err?.message || 'Upgrade your membership to shortlist more profiles.',
            [
              { text: 'Not Now', style: 'cancel' },
              { text: 'Upgrade', onPress: () => navigation.navigate('MatrimonyUpgrade') },
            ]
          );
        } else {
          Alert.alert('Error', err?.message || 'Could not update shortlist.');
        }
      } finally {
        shortlistInFlightRef.current.delete(targetUid);
        setShortlistBusyMap((prev) => {
          if (!prev[targetUid]) return prev;
          const next = { ...prev };
          delete next[targetUid];
          return next;
        });
      }
    },
    [navigation, tab]
  );

  useEffect(() => {
    if (!undoHidden) return;
    const t = setTimeout(() => setUndoHidden(null), 6000);
    return () => clearTimeout(t);
  }, [undoHidden]);

  const handleDismiss = useCallback((targetUid: string) => {
    if (dismissInFlightRef.current.has(targetUid)) return;
    dismissInFlightRef.current.add(targetUid);
    const prevMatches = matchesRef.current;
    const targetIdx = prevMatches.findIndex((m) => m.uid === targetUid);
    const targetCandidate = targetIdx >= 0 ? prevMatches[targetIdx] : undefined;
    setMatches((prev) => prev.filter((m) => m.uid !== targetUid));
    setHiddenCount((c) => c + 1);
    setInterestToast(null);
    setUndoHidden({
      uid: targetUid,
      name: targetCandidate?.displayName || 'Profile',
      candidate: targetCandidate,
      index: targetIdx >= 0 ? targetIdx : 0,
    });
    const preview = targetCandidate
      ? {
          uid: targetUid,
          displayName: targetCandidate.displayName,
          profileCode: targetCandidate.profileCode,
          age: targetCandidate.age ?? null,
          heightCm: targetCandidate.heightCm ?? null,
          occupation: String(
            targetCandidate.career?.profession ||
              targetCandidate.career?.occupationCategory ||
              targetCandidate.education?.qualification ||
              ''
          ).trim(),
          city: String(
            targetCandidate.location?.village ||
              targetCandidate.location?.city ||
              targetCandidate.location?.state ||
              ''
          ).trim(),
          signedProfilePhoto: targetCandidate.signedProfilePhoto || null,
        }
      : undefined;
    matrimonyApi
      .dismissMatch(targetUid, 'dont_show', preview)
      .catch((err: any) => {
        setMatches(prevMatches);
        setHiddenCount((c) => Math.max(0, c - 1));
        setUndoHidden(null);
        Alert.alert('Error', err?.message || 'Could not hide this profile.');
      })
      .finally(() => {
        dismissInFlightRef.current.delete(targetUid);
      });
  }, []);

  const handleRestoreHidden = async (targetUid?: string) => {
    const restoredMeta =
      targetUid && undoHidden?.uid === targetUid ? undoHidden : null;
    setUndoHidden(null);
    setMoreMenuOpen(false);
    if (restoredMeta?.candidate) {
      const cand = restoredMeta.candidate;
      const insertAt = restoredMeta.index ?? 0;
      setMatches((prev) => {
        if (prev.some((m) => m.uid === cand.uid)) return prev;
        const next = [...prev];
        next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, cand);
        return next;
      });
      setHiddenCount((c) => Math.max(0, c - 1));
    }
    try {
      await matrimonyApi.restoreDismissedMatches(targetUid);
      if (!restoredMeta?.candidate) {
        await loadMatches(true);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not restore hidden profile.');
    }
  };

  const handleRequestPhotoAccess = useCallback(async (targetUid: string) => {
    if (photoReqInFlightRef.current.has(targetUid)) return;
    photoReqInFlightRef.current.add(targetUid);
    setPhotoReqBusyMap((prev) => ({ ...prev, [targetUid]: true }));
    setMatches((prev) =>
      prev.map((m) =>
        m.uid === targetUid ? { ...m, photoRequestStatus: 'pending' } : m
      )
    );
    try {
      const res = await matrimonyApi.requestPhotoAccess(targetUid);
      setMatches((prev) =>
        prev.map((m) =>
          m.uid === targetUid
            ? {
                ...m,
                photoRequestStatus: res?.status === 'approved' ? 'approved' : 'pending',
              }
            : m
        )
      );
    } catch (err: any) {
      setMatches((prev) =>
        prev.map((m) => (m.uid === targetUid ? { ...m, photoRequestStatus: null } : m))
      );
      Alert.alert('Request Failed', err?.message || 'Unable to send photo request.');
    } finally {
      photoReqInFlightRef.current.delete(targetUid);
      setPhotoReqBusyMap((prev) => {
        if (!prev[targetUid]) return prev;
        const next = { ...prev };
        delete next[targetUid];
        return next;
      });
    }
  }, []);

  const showInterestToast = useCallback(
    (
      next: { kind: 'sent' | 'cancelled'; uid: string; name: string; isMutual?: boolean },
      durationMs: number
    ) => {
      if (interestToastTimerRef.current) clearTimeout(interestToastTimerRef.current);
      setInterestToast(next);
      interestToastTimerRef.current = setTimeout(() => {
        setInterestToast((prev) => (prev?.uid === next.uid && prev?.kind === next.kind ? null : prev));
      }, durationMs);
    },
    []
  );

  const handleUndoSendInterest = useCallback(
    async (targetUid: string, targetName: string) => {
      setMatches((prev) =>
        prev.map((m) =>
          m.uid === targetUid ? { ...m, interestStatus: null, interestSentAtMs: undefined } : m
        )
      );
      showInterestToast({ kind: 'cancelled', uid: targetUid, name: targetName }, 3000);
      try {
        const pendingReq = pendingSendMapRef.current.get(targetUid);
        if (pendingReq) {
          await pendingReq.catch(() => undefined);
        }
        await matrimonyApi.respondInterest(targetUid, 'withdraw');
      } catch (err: any) {
        console.warn('handleUndoSendInterest warning:', err);
      }
    },
    [showInterestToast]
  );

  const handleSendInterest = useCallback(
    async (candidate: MatrimonyMatchCandidate) => {
      if (candidate.interestStatus || pendingSendMapRef.current.has(candidate.uid)) return;
      const optimisticSentAt = Date.now();
      // Instant optimistic transition: immediately show Call Now + Send Message & Undo toast
      setMatches((prev) =>
        prev.map((m) =>
          m.uid === candidate.uid
            ? { ...m, interestStatus: 'pending', interestSentAtMs: optimisticSentAt }
            : m
        )
      );
      showInterestToast({ kind: 'sent', uid: candidate.uid, name: candidate.displayName }, 5500);

      const sendPromise = matrimonyApi.sendInterest(candidate.uid);
      pendingSendMapRef.current.set(candidate.uid, sendPromise);

      try {
        const res = await sendPromise;
        setMatches((prev) =>
          prev.map((m) =>
            m.uid === candidate.uid && m.interestSentAtMs === optimisticSentAt
              ? { ...m, interestStatus: res.interestStatus, interestSentAtMs: optimisticSentAt }
              : m
          )
        );
        if (res.isMutual) {
          setInterestToast((prev) => (prev?.uid === candidate.uid ? null : prev));
          Alert.alert(
            'Mutual Match!',
            `${candidate.displayName} also expressed interest in you.`
          );
        }
        if (typeof (res as any).interestsSentThisMonth === 'number') {
          setEntitlements((prev) =>
            prev
              ? {
                  ...prev,
                  interestsSentThisMonth: (res as any).interestsSentThisMonth,
                  interestsRemaining:
                    typeof (res as any).interestsRemaining === 'number'
                      ? (res as any).interestsRemaining
                      : prev.interestsRemaining,
                }
              : prev
          );
        }
      } catch (err: any) {
        // Revert optimistic interest state on failure
        setMatches((prev) =>
          prev.map((m) =>
            m.uid === candidate.uid && m.interestSentAtMs === optimisticSentAt
              ? { ...m, interestStatus: null, interestSentAtMs: undefined }
              : m
          )
        );
        setInterestToast((prev) => (prev?.uid === candidate.uid ? null : prev));
        if (
          err?.details?.reasonCode === 'MONTHLY_INTEREST_LIMIT_REACHED' ||
          String(err?.message || '').toLowerCase().includes('month')
        ) {
          Alert.alert(
            'Monthly Interest Limit Reached',
            err?.message ||
              'Free members can send up to 20 interests per month. Upgrade to Silver, Gold, or Platinum for unlimited interests.',
            [
              { text: 'Not Now', style: 'cancel' },
              { text: 'Upgrade Plan', onPress: () => navigation.navigate('MatrimonyUpgrade') },
            ]
          );
        } else {
          Alert.alert('Error', err?.message || 'Unable to send interest.');
        }
      } finally {
        if (pendingSendMapRef.current.get(candidate.uid) === sendPromise) {
          pendingSendMapRef.current.delete(candidate.uid);
        }
      }
    },
    [navigation, showInterestToast]
  );

  const handleCallCard = useCallback(
    (candidate: MatrimonyMatchCandidate) => {
      if (candidate.mobilePrivacy === 'messages_only') {
        Alert.alert(
          'Messages Only',
          `${candidate.displayName} has restricted phone calls to Messages only.`
        );
        return;
      }
      if (!entitlements || entitlements.tier === 'free' || !entitlements.callAccess) {
        Alert.alert(
          'Upgrade to Call',
          'Calling members directly is unlocked for Silver, Gold, and Platinum members.',
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Upgrade Plan', onPress: () => navigation.navigate('MatrimonyUpgrade') },
          ]
        );
        return;
      }
      if (candidate.contactPhone) {
        Linking.openURL(`tel:${candidate.contactPhone}`).catch(() => {
          Alert.alert('Call Failed', 'Could not open phone dialer.');
        });
        return;
      }
      Alert.alert(
        'Unlock Contact Number',
        `Unlock ${candidate.displayName}'s contact number (${
          entitlements.contactNumberLimit < 0
            ? 'Unlimited'
            : `${entitlements.contactNumbersRemaining}/${entitlements.contactNumberLimit} left`
        }) to call?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unlock & Call',
            onPress: async () => {
              if (unlockInFlightRef.current.has(candidate.uid)) return;
              unlockInFlightRef.current.add(candidate.uid);
              try {
                const res = await matrimonyApi.unlockContact(candidate.uid);
                if (res.contactPhone) {
                  setMatches((prev) =>
                    prev.map((m) =>
                      m.uid === candidate.uid
                        ? {
                            ...m,
                            contactPhone: res.contactPhone ?? m.contactPhone,
                            dob: res.dob ?? m.dob,
                            isContactUnlocked: true,
                          }
                        : m
                    )
                  );
                  Linking.openURL(`tel:${res.contactPhone}`).catch(() => undefined);
                } else {
                  Alert.alert('Unavailable', 'Contact number is not added for this profile.');
                }
              } catch (err: any) {
                if (err?.details?.reasonCode === 'CONTACT_UNLOCK_LIMIT_REACHED') {
                  Alert.alert(
                    'Contact Limit Reached',
                    err?.message || 'Upgrade to Platinum for unlimited contacts.',
                    [
                      { text: 'Not Now', style: 'cancel' },
                      { text: 'Upgrade', onPress: () => navigation.navigate('MatrimonyUpgrade') },
                    ]
                  );
                } else {
                  Alert.alert('Unlock Failed', err?.message || 'Unable to unlock contact.');
                }
              } finally {
                unlockInFlightRef.current.delete(candidate.uid);
              }
            },
          },
        ]
      );
    },
    [entitlements, navigation]
  );

  const handleSendMessageCard = useCallback(
    (candidate: MatrimonyMatchCandidate) => {
      if (candidate.interestStatus !== 'accepted') {
        Alert.alert(
          'Send Message',
          `Direct messaging opens once ${candidate.displayName} accepts your interest.`
        );
        return;
      }
      const openChat = () => {
        navigation.navigate('MatrimonyChat', {
          targetUid: candidate.uid,
          peer: {
            uid: candidate.uid,
            displayName: candidate.displayName,
            profileCode: candidate.profileCode,
            signedProfilePhoto: candidate.signedProfilePhoto || null,
            age: candidate.age ?? null,
            heightCm: candidate.heightCm ?? null,
            occupation:
              candidate.career?.profession ||
              candidate.career?.occupationCategory ||
              candidate.career?.employmentType ||
              candidate.education?.qualification ||
              null,
            gender: candidate.gender || null,
            isVerified: true,
            city:
              candidate.location?.village ||
              candidate.location?.city ||
              candidate.location?.state ||
              '',
            contactPhone: candidate.contactPhone || null,
          },
        });
      };
      if (entitlements && !entitlements.messageAccess) {
        Alert.alert(
          'Upgrade to Send Messages',
          'Sending personalised messages requires an active Silver, Gold, or Platinum membership.',
          [
            { text: 'View History', style: 'cancel', onPress: openChat },
            { text: 'Upgrade Plan', onPress: () => navigation.navigate('MatrimonyUpgrade') },
          ]
        );
        return;
      }
      openChat();
    },
    [entitlements, navigation]
  );

  const openPhotoViewer = useCallback(
    (item: MatrimonyMatchCandidate, idx: number, photoIdx = 0) => {
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
    },
    [openMatchDetail]
  );

  const activeFilterCount = useMemo(() => countActiveMatrimonyFilters(filters), [filters]);

  const cardSurface = isDark ? colors.surface : '#FFFFFF';
  const softBg = isDark ? colors.bg : '#F6F7F9';
  const cardBorderColor = isDark ? colors.border : '#E5E7EB';

  const renderMatchCard = useCallback(
    ({ item, index }: { item: MatrimonyMatchCandidate; index: number }) => (
      <MatrimonyMatchCard
        item={item}
        index={index}
        displayLayout={displayLayout}
        matchTier={matchTier}
        isActionBusy={actionBusyUid === item.uid}
        isShortlistBusy={Boolean(shortlistBusyMap[item.uid])}
        isPhotoReqBusy={Boolean(photoReqBusyMap[item.uid])}
        isDark={isDark}
        cardSurface={cardSurface}
        borderColor={cardBorderColor}
        textColor={colors.text}
        textSecondaryColor={colors.textSecondary}
        fontFamily={fontFamily}
        scaleFont={scaleFont}
        onOpenDetail={openMatchDetail}
        onOpenPhotoViewer={openPhotoViewer}
        onToggleShortlist={handleToggleShortlist}
        onRequestPhotoAccess={handleRequestPhotoAccess}
        onDismiss={handleDismiss}
        onSendInterest={handleSendInterest}
        onCall={handleCallCard}
        onSendMessage={handleSendMessageCard}
      />
    ),
    [
      displayLayout,
      matchTier,
      actionBusyUid,
      shortlistBusyMap,
      photoReqBusyMap,
      isDark,
      cardSurface,
      cardBorderColor,
      colors.text,
      colors.textSecondary,
      fontFamily,
      scaleFont,
      openMatchDetail,
      openPhotoViewer,
      handleToggleShortlist,
      handleRequestPhotoAccess,
      handleDismiss,
      handleSendInterest,
      handleCallCard,
      handleSendMessageCard,
    ]
  );

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
          {loading && displayedMatches.length === 0 ? (
            <Text style={[styles.countText, { color: colors.textSecondary, fontFamily, fontSize: scaleFont(14.5) }]}>
              {tab === 'all' ? 'Finding matches based on your preferences...' : 'Finding your matches...'}
            </Text>
          ) : tab === 'all' ? (
            <Text style={[styles.countText, { color: colors.text, fontFamily, fontSize: scaleFont(14.5) }]}>
              {matchTier === 'prime'
                ? displayedMatches.length
                : Math.max(displayedMatches.length, totalMatchedCount)}{' '}
              {(matchTier === 'prime'
                ? displayedMatches.length
                : Math.max(displayedMatches.length, totalMatchedCount)) === 1
                ? 'Match'
                : 'Matches'}{' '}
              based on your{' '}
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
              {matchTier === 'prime'
                ? displayedMatches.length
                : Math.max(displayedMatches.length, totalMatchedCount)}{' '}
              {(matchTier === 'prime'
                ? displayedMatches.length
                : Math.max(displayedMatches.length, totalMatchedCount)) === 1
                ? 'Match'
                : 'Matches'}{' '}
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

        {entitlements ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('MatrimonyUpgrade')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 14,
              paddingVertical: 5,
              marginBottom: 4,
              backgroundColor: isDark ? 'rgba(217,119,6,0.12)' : '#FFFBEB',
              borderRadius: 8,
              marginHorizontal: 12,
            }}
          >
            <Text
              style={{
                fontSize: 11.5,
                fontWeight: '700',
                color: isDark ? '#FDE68A' : '#92400E',
                fontFamily,
              }}
              numberOfLines={1}
            >
              {entitlements.tier === 'free'
                ? `Free Plan · ${entitlements.interestsRemaining}/${entitlements.monthlyInterestLimit} interests left this month`
                : `${entitlements.planName} · Unlimited Interests · ${
                    entitlements.contactNumberLimit < 0
                      ? 'Unlimited Contacts'
                      : `${entitlements.contactNumbersRemaining}/${entitlements.contactNumberLimit} Contacts left`
                  }`}
            </Text>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                color: '#D97706',
                fontFamily,
              }}
            >
              {entitlements.tier === 'free' ? 'Upgrade' : 'Plan'}
            </Text>
          </TouchableOpacity>
        ) : null}

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
        <ScrollView
          contentContainerStyle={[styles.listContent, { gap: 14 }]}
          showsVerticalScrollIndicator={false}
        >
          {[0, 1, 2].map((idx) => (
            <View
              key={idx}
              style={[
                styles.matchCard,
                {
                  backgroundColor: cardSurface,
                  borderColor: isDark ? colors.border : '#E5E7EB',
                  padding: 12,
                  gap: 10,
                },
              ]}
            >
              <View
                style={{
                  height: 220,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
                }}
              />
              <View
                style={{
                  height: 18,
                  width: '55%',
                  borderRadius: 6,
                  backgroundColor: isDark ? '#334155' : '#E2E8F0',
                }}
              />
              <View
                style={{
                  height: 13,
                  width: '80%',
                  borderRadius: 6,
                  backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                }}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <View
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 20,
                    backgroundColor: isDark ? '#1E293B' : '#F1F5F9',
                  }}
                />
                <View
                  style={{
                    flex: 1,
                    height: 38,
                    borderRadius: 20,
                    backgroundColor: isDark ? '#334155' : '#FEE2E2',
                  }}
                />
              </View>
            </View>
          ))}
        </ScrollView>
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
          initialNumToRender={6}
          maxToRenderPerBatch={5}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.7}
          ListFooterComponent={
            loadingMore && displayedMatches.length > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 16,
                }}
              >
                <ActivityIndicator size="small" color={CORAL_RED} />
                <Text style={{ fontSize: 12.5, color: colors.textSecondary, fontFamily }}>
                  Loading more matches ({displayedMatches.length} of{' '}
                  {Math.max(displayedMatches.length, totalMatchedCount)})...
                </Text>
              </View>
            ) : !hasMore && displayedMatches.length > 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 18 }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily }}>
                  You&apos;ve reached the end of your matches
                </Text>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                shuffleSeedRef.current = Math.floor(Math.random() * 900_000_000) + 1;
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
                  ? 'No Paid Members Found Right Now'
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
                  ? 'PRIME shows members with an active Silver, Gold, or Platinum plan. Switch to Regular to see all matching paid and free members.'
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
        <View style={styles.interestUndoToast}>
          <Text style={[styles.interestToastText, { fontFamily }]} numberOfLines={1}>
            {undoHidden.name} hidden from matches
          </Text>
          <View style={styles.interestToastDivider} />
          <TouchableOpacity
            style={styles.interestToastUndoBtn}
            onPress={() => handleRestoreHidden(undoHidden.uid)}
            activeOpacity={0.8}
          >
            <Undo2 size={15} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={[styles.interestToastUndoText, { fontFamily }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {interestToast ? (
        interestToast.kind === 'sent' ? (
          <View style={styles.interestUndoToast}>
            <Text style={[styles.interestToastText, { fontFamily }]} numberOfLines={1}>
              Interest sent to {interestToast.name}
            </Text>
            <View style={styles.interestToastDivider} />
            <TouchableOpacity
              style={styles.interestToastUndoBtn}
              onPress={() => handleUndoSendInterest(interestToast.uid, interestToast.name)}
              activeOpacity={0.8}
            >
              <Undo2 size={15} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={[styles.interestToastUndoText, { fontFamily }]}>Undo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.interestCancelledToastWrap} pointerEvents="none">
            <View style={styles.interestCancelledToast}>
              <Text style={[styles.interestCancelledText, { fontFamily }]}>
                Your interest has been cancelled
              </Text>
            </View>
          </View>
        )
      ) : null}
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
        canUseAdvancedFilters={entitlements ? entitlements.advancedFilters : false}
        onPressUpgrade={() => navigation.navigate('MatrimonyUpgrade')}
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
  callOutlineBtn: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1.2,
  },
  callOutlineText: {
    color: CORAL_RED,
    fontWeight: '700',
  },
  sendMessageSolidBtn: {
    flex: 1.45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: CORAL_RED,
  },
  sendMessageSolidText: {
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
  sentStatusHint: {
    fontWeight: '700',
  },
  interestUndoToast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 14,
    backgroundColor: '#3F3F46',
    borderRadius: 12,
    paddingLeft: 18,
    paddingRight: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 7,
  },
  interestToastText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  interestToastDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginRight: 14,
  },
  interestToastUndoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  interestToastUndoText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  interestCancelledToastWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 14,
    alignItems: 'center',
  },
  interestCancelledToast: {
    backgroundColor: '#3F3F46',
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 7,
  },
  interestCancelledText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
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
