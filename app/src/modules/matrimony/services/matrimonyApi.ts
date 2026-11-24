import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import storage from '@react-native-firebase/storage';
import { Image } from 'react-native';
import { matrimonyPerf } from './matrimonyPerf';
import {
  AdminMatrimonyCounts,
  AdminMatrimonyPlansAndSubsResponse,
  AdminMatrimonyProfileDetail,
  AdminMatrimonyProfileSummary,
  GetMatrimonyInterestsHubResponse,
  GetMatrimonyMatchesResponse,
  MatrimonyChatContact,
  MatrimonyChatPeer,
  MatrimonyHiddenProfileItem,
  MatrimonyMatchTab,
  MatrimonyMatchesFilter,
  MatrimonyMembershipInfo,
  MatrimonyNotificationFeedItem,
  MatrimonyNotificationPreferences,
  MatrimonyPhotoRequestItem,
  MatrimonyPlanSpec,
  MatrimonyStatusResponse,
  MemberEntitlements,
  SearchMatrimonyByIdResponse,
  StartRegistrationResponse,
} from '../types/matrimony';

export const MATRIMONY_BUCKET_URL = 'gs://rhema-global-ministries-matrimony';
const MATRIMONY_FUNCTIONS_REGION = 'us-central1';
const DEFAULT_PROJECT_ID = 'rhema-global-ministries';
const DEFAULT_CACHE_TTL_MS = 60_000;
const PLANS_CACHE_TTL_MS = 10 * 60_000;
const STORAGE_CACHE_PREFIX = '@rhema_matrimony_swr_v1_';

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

interface GetMatchesParams {
  tab?: MatrimonyMatchTab;
  matchBasis?: 'partner_preferences' | 'all_filters';
  matchTier?: 'regular' | 'prime';
  sortBy?:
    | 'best_match'
    | 'last_active'
    | 'date_created'
    | 'distance'
    | 'latest_photos'
    | 'newest'
    | 'age_asc'
    | 'age_desc'
    | 'most_shared_interests';
  filters?: MatrimonyMatchesFilter;
  offset?: number;
  limit?: number;
  shuffleSeed?: number;
}

interface FetchCacheOptions {
  force?: boolean;
  maxAgeMs?: number;
}

interface ChatContactsResponse {
  success: boolean;
  contacts: MatrimonyChatContact[];
  self: { uid: string; displayName: string; signedProfilePhoto: string | null };
}

interface MatrimonyMemoryStore {
  uid: string;
  hydratedFromDisk: boolean;
  cacheVersion: number;
  lastPrefetchAt: number;
  registration: CacheEntry<StartRegistrationResponse> | null;
  status: CacheEntry<MatrimonyStatusResponse> | null;
  matchesByKey: Map<string, CacheEntry<GetMatrimonyMatchesResponse>>;
  lastMatchesKey: string | null;
  interestsHub: CacheEntry<GetMatrimonyInterestsHubResponse> | null;
  chatContacts: CacheEntry<ChatContactsResponse> | null;
  plans: CacheEntry<MatrimonyPlanSpec[]> | null;
  entitlements: CacheEntry<MemberEntitlements> | null;
  hiddenProfiles: Record<'dont_show' | 'blocked', CacheEntry<MatrimonyHiddenProfileItem[]> | null>;
  photoRequests: CacheEntry<MatrimonyPhotoRequestItem[]> | null;
  notificationsFeed: CacheEntry<{ notifications: MatrimonyNotificationFeedItem[]; unreadCount: number }> | null;
  searchByIdCache: Map<string, CacheEntry<SearchMatrimonyByIdResponse>>;
  inflight: Map<string, Promise<any>>;
  resolvedUrls: Map<string, string>;
  pendingDraftWrites: number;
  lastLocalPatchAt: number;
}

let store: MatrimonyMemoryStore | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function getStore(): MatrimonyMemoryStore {
  const currentUid = auth().currentUser?.uid || 'anon';
  if (!store || store.uid !== currentUid) {
    store = {
      uid: currentUid,
      hydratedFromDisk: false,
      cacheVersion: 0,
      lastPrefetchAt: 0,
      registration: null,
      status: null,
      matchesByKey: new Map(),
      lastMatchesKey: null,
      interestsHub: null,
      chatContacts: null,
      plans: null,
      entitlements: null,
      hiddenProfiles: { dont_show: null, blocked: null },
      photoRequests: null,
      notificationsFeed: null,
      searchByIdCache: new Map(),
      inflight: new Map(),
      resolvedUrls: new Map(),
      pendingDraftWrites: 0,
      lastLocalPatchAt: 0,
    };
  }
  return store;
}

export function hasCompletedMatrimonyFamilyDetails(
  familySummary?: Record<string, any> | null,
  familyDetails?: Record<string, any> | null
): boolean {
  return Boolean(
    String(familySummary?.familyType || '').trim() ||
      String(familySummary?.familyValues || '').trim() ||
      String(familyDetails?.fatherOccupation || '').trim() ||
      String(familyDetails?.motherOccupation || '').trim() ||
      String(familyDetails?.familyOrigin || '').trim() ||
      String(familyDetails?.familyIntro || '').trim() ||
      familyDetails?.brothers !== undefined
  );
}

export function computeMatrimonyProfileCompletion(
  profile?: Record<string, any> | null,
  prefs?: Record<string, any> | null,
  familyDetails?: Record<string, any> | null
): number {
  if (!profile) return 0;
  let score = 0;

  if (profile.displayName && profile.gender && profile.age) score += 15;
  if (profile.heightCm && profile.motherTongue) score += 10;
  if (profile.education?.qualification) score += 10;
  if (profile.career?.profession) score += 10;
  if (
    profile.faithSummary?.denomination &&
    profile.location?.country &&
    profile.location?.state
  ) {
    score += 10;
  }
  if (prefs?.age?.min && prefs?.age?.max) score += 5;
  if (profile.profilePhoto) score += 10;

  const familySummary = profile.familySummary || {};
  const details = familyDetails || profile.familyDetails || {};
  if (hasCompletedMatrimonyFamilyDetails(familySummary, details)) score += 10;

  const interests = profile.interests || {};
  const totalInterestsCount = [
    interests.hobbies,
    interests.music,
    interests.reading,
    interests.movies,
    interests.sports,
    interests.food,
    interests.languages,
  ].reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
  if (totalInterestsCount > 0) score += 10;

  const totalPhotos =
    (profile.profilePhoto ? 1 : 0) +
    (Array.isArray(profile.gallery) ? profile.gallery.length : 0);
  if (totalPhotos >= 3) score += 10;

  return Math.min(100, score);
}

function stableMatchesKey(params: GetMatchesParams = {}): string {
  const rawFilters = params.filters || {};
  const sortedFilterKeys = Object.keys(rawFilters).sort();
  const normalizedFilters: Record<string, any> = {};
  for (const k of sortedFilterKeys) {
    const val = (rawFilters as Record<string, any>)[k];
    if (val === undefined || val === null || val === '') continue;
    if (Array.isArray(val)) {
      if (val.length > 0) normalizedFilters[k] = [...val].sort();
    } else {
      normalizedFilters[k] = val;
    }
  }
  return JSON.stringify({
    tab: params.tab || 'all',
    matchBasis: params.matchBasis || 'partner_preferences',
    matchTier: params.matchTier || 'regular',
    sortBy: params.sortBy || 'best_match',
    filters: normalizedFilters,
  });
}

function isEntryFresh<T>(entry: CacheEntry<T> | null | undefined, maxAgeMs: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < maxAgeMs;
}

function writeSnapshotToDiskNow(): void {
  const s = getStore();
  if (!s.uid || s.uid === 'anon') return;
  const lastMatchesEntry = s.lastMatchesKey ? s.matchesByKey.get(s.lastMatchesKey) : null;
  const payload = {
    savedAt: Date.now(),
    registration: s.registration?.data || null,
    status: s.status?.data || null,
    lastMatchesKey: s.lastMatchesKey,
    lastMatches: lastMatchesEntry?.data || null,
    interestsHub: s.interestsHub?.data || null,
    chatContacts: s.chatContacts?.data || null,
    plans: s.plans?.data || null,
    entitlements: s.entitlements?.data || null,
    notificationsFeed: s.notificationsFeed?.data || null,
    hiddenProfiles: {
      dont_show: s.hiddenProfiles.dont_show?.data || null,
      blocked: s.hiddenProfiles.blocked?.data || null,
    },
  };
  AsyncStorage.setItem(`${STORAGE_CACHE_PREFIX}${s.uid}`, JSON.stringify(payload)).catch(() => {});
}

function persistSnapshotToDisk(): void {
  const s = getStore();
  if (!s.uid || s.uid === 'anon') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeSnapshotToDiskNow();
  }, 400);
}

function prefetchImageUrls(urls: (string | null | undefined)[]): void {
  const unique = Array.from(
    new Set(urls.filter((u): u is string => Boolean(u && u.startsWith('http'))))
  ).slice(0, 12);
  unique.forEach((uri) => {
    Image.prefetch(uri).catch(() => {});
  });
}

function invalidateCache(targets: {
  registration?: boolean;
  status?: boolean;
  matches?: boolean;
  matchesTabs?: MatrimonyMatchTab[];
  interestsHub?: boolean;
  chatContacts?: boolean;
  plans?: boolean;
  entitlements?: boolean;
}): void {
  const s = getStore();
  s.cacheVersion += 1;
  if (targets.registration) {
    if (s.registration) s.registration.fetchedAt = 0;
    s.inflight.delete('startRegistration');
  }
  if (targets.status) {
    if (s.status) s.status.fetchedAt = 0;
    s.inflight.delete('getStatus');
  }
  if (targets.matches) {
    s.searchByIdCache.clear();
    s.matchesByKey.forEach((entry) => {
      entry.fetchedAt = 0;
    });
    for (const key of Array.from(s.inflight.keys())) {
      if (key.startsWith('getMatches:') || key.startsWith('matches:')) s.inflight.delete(key);
    }
  } else if (targets.matchesTabs && targets.matchesTabs.length > 0) {
    const tabSet = new Set(targets.matchesTabs);
    s.matchesByKey.forEach((entry, k) => {
      try {
        const parsed = JSON.parse(k);
        if (parsed?.tab && tabSet.has(parsed.tab)) {
          entry.fetchedAt = 0;
        }
      } catch {
        // Ignore unparseable key
      }
    });
  }
  if (targets.interestsHub) {
    if (s.interestsHub) s.interestsHub.fetchedAt = 0;
    s.inflight.delete('getInterestsHub');
    s.inflight.delete('interestsHub');
  }
  if (targets.chatContacts) {
    if (s.chatContacts) s.chatContacts.fetchedAt = 0;
    s.inflight.delete('getChatContacts');
    s.inflight.delete('chatContacts');
  }
  if (targets.plans) {
    if (s.plans) s.plans.fetchedAt = 0;
    s.inflight.delete('getPlans');
  }
  if (targets.entitlements) {
    if (s.entitlements) s.entitlements.fetchedAt = 0;
    s.inflight.delete('getMemberEntitlements');
  }
  persistSnapshotToDisk();
}

function clearAllCaches(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  cachedTokenValue = null;
  cachedTokenPromise = null;
  const s = getStore();
  const uid = s.uid;
  s.cacheVersion += 1;
  s.lastPrefetchAt = 0;
  s.registration = null;
  s.status = null;
  s.matchesByKey.clear();
  s.lastMatchesKey = null;
  s.interestsHub = null;
  s.chatContacts = null;
  s.plans = null;
  s.entitlements = null;
  s.hiddenProfiles = { dont_show: null, blocked: null };
  s.photoRequests = null;
  s.notificationsFeed = null;
  s.searchByIdCache.clear();
  s.inflight.clear();
  s.resolvedUrls.clear();
  if (uid && uid !== 'anon') {
    AsyncStorage.removeItem(`${STORAGE_CACHE_PREFIX}${uid}`).catch(() => {});
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getErrorCode(err: any): string {
  const raw = String(err?.code || '').toLowerCase();
  return raw.startsWith('functions/') ? raw.slice('functions/'.length) : raw;
}

function isTransientCallableError(err: any): boolean {
  const code = getErrorCode(err);
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'internal' ||
    code === 'unknown' ||
    msg === 'unavailable' ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch')
  );
}

let cachedTokenPromise: Promise<string | null> | null = null;
let cachedTokenValue: { uid: string; token: string; fetchedAt: number } | null = null;

async function getAuthIdToken(forceRefresh = false): Promise<string | null> {
  const currentUser = auth().currentUser;
  if (!currentUser) return null;
  if (
    !forceRefresh &&
    cachedTokenValue &&
    cachedTokenValue.uid === currentUser.uid &&
    Date.now() - cachedTokenValue.fetchedAt < 30_000
  ) {
    return cachedTokenValue.token;
  }
  if (!forceRefresh && cachedTokenPromise) return cachedTokenPromise;
  const tokenReq = currentUser
    .getIdToken(forceRefresh)
    .then((token) => {
      if (token) {
        cachedTokenValue = { uid: currentUser.uid, token, fetchedAt: Date.now() };
      }
      return token || null;
    })
    .finally(() => {
      if (!forceRefresh) cachedTokenPromise = null;
    });
  if (!forceRefresh) {
    cachedTokenPromise = tokenReq;
  }
  return tokenReq;
}

async function callViaHttpsFallback<T>(
  functionName: string,
  payload: Record<string, any>,
  timeoutMs: number,
  forceRefreshToken = false
): Promise<T> {
  const projectId = functions().app?.options?.projectId || DEFAULT_PROJECT_ID;
  const url = `https://${MATRIMONY_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${functionName}`;
  const idToken = await getAuthIdToken(forceRefreshToken);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ data: payload }),
      signal: controller.signal,
    });

    const json: any = await response.json().catch(() => null);
    if (!response.ok || json?.error) {
      const status = String(json?.error?.status || '').toLowerCase().replace(/_/g, '-');
      const message =
        json?.error?.message ||
        (response.status === 503 ? 'unavailable' : `Request failed with status ${response.status}`);
      const error: any = new Error(message);
      error.code =
        status ||
        (response.status === 401
          ? 'unauthenticated'
          : response.status === 404
          ? 'not-found'
          : response.status === 503
          ? 'unavailable'
          : 'unknown');
      error.details = json?.error?.details;
      throw error;
    }

    return (json?.result ?? json?.data) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invokes a Matrimony Cloud Function using non-blocking parallel HTTPS fetch first.
 * React Native Firebase's native Android `httpsCallable` queues calls onto a single-threaded
 * TaskExecutorService (`maximumPoolSize = 1`), which serialized parallel screen loads.
 */
async function callMatrimonyFunction<T>(
  functionName: string,
  payload: Record<string, any> = {},
  timeoutMs = 20000
): Promise<T> {
  const trace = matrimonyPerf.startTrace(`rpc_${functionName}`);
  try {
    const res = await callViaHttpsFallback<T>(functionName, payload, timeoutMs);
    trace.stop(true, { transport: 'https_parallel' });
    return res;
  } catch (err: any) {
    const code = getErrorCode(err);
    const shouldRefreshAuth = code === 'unauthenticated';
    if (!shouldRefreshAuth && !isTransientCallableError(err)) {
      trace.stop(false, { transport: 'https_parallel', code });
      throw err;
    }

    console.warn(`[matrimonyApi] ${functionName} fetch failed (${err?.code || err?.message}), retrying...`);
    if (!shouldRefreshAuth) {
      await sleep(300);
    }

    try {
      const res = await callViaHttpsFallback<T>(
        functionName,
        payload,
        timeoutMs,
        shouldRefreshAuth
      );
      trace.stop(true, { transport: shouldRefreshAuth ? 'https_token_refresh' : 'https_retry' });
      return res;
    } catch (retryErr: any) {
      const retryCode = getErrorCode(retryErr);
      if (retryCode !== 'unauthenticated' && !isTransientCallableError(retryErr)) {
        trace.stop(false, { transport: 'https_retry', code: retryCode });
        throw retryErr;
      }
      try {
        const callable = functions()
          .app.functions(MATRIMONY_FUNCTIONS_REGION)
          .httpsCallable(functionName, { timeout: timeoutMs });
        const res = await callable(payload);
        trace.stop(true, { transport: 'native_callable_fallback' });
        return res.data as T;
      } catch (finalErr: any) {
        trace.stop(false, { transport: 'native_callable_fallback', code: getErrorCode(finalErr) });
        throw finalErr;
      }
    }
  }
}

async function resolveStoragePhotoUrl(pathOrUrl?: string | null): Promise<string | null> {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return null;
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }
  const s = getStore();
  const cached = s.resolvedUrls.get(trimmed);
  if (cached) return cached;
  try {
    const url = await storage().refFromURL(`${MATRIMONY_BUCKET_URL}/${trimmed}`).getDownloadURL();
    if (url) s.resolvedUrls.set(trimmed, url);
    return url;
  } catch {
    try {
      const url = await storage().ref(trimmed).getDownloadURL();
      if (url) s.resolvedUrls.set(trimmed, url);
      return url;
    } catch {
      return null;
    }
  }
}

async function uploadDirectToStorage(
  localUri: string,
  mimeType: string,
  isPrimary: boolean
): Promise<{ storagePath: string; signedUrl: string }> {
  const uid = auth().currentUser?.uid;
  if (!uid) {
    throw new Error('Authentication required to upload photo.');
  }
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const prefix = isPrimary ? 'primary' : 'gallery';
  const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const relativePath = `photos/${uid}/${fileName}`;

  try {
    const ref = storage().refFromURL(`${MATRIMONY_BUCKET_URL}/${relativePath}`);
    await ref.putFile(localUri, { contentType: mimeType });
    const downloadUrl = await ref.getDownloadURL();
    return { storagePath: relativePath, signedUrl: downloadUrl };
  } catch {
    const defaultRef = storage().ref(`matrimony_photos/${uid}/${fileName}`);
    await defaultRef.putFile(localUri, { contentType: mimeType });
    const downloadUrl = await defaultRef.getDownloadURL();
    return { storagePath: downloadUrl, signedUrl: downloadUrl };
  }
}

export function isMatrimonyInactiveError(err: any): boolean {
  const reasonCode = String(err?.details?.reasonCode || '').toUpperCase();
  if (reasonCode === 'MATRIMONY_PROFILE_INACTIVE' || reasonCode === 'MATRIMONY_ACCESS_REVOKED') {
    return true;
  }
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('currently inactive') || msg.includes('access to rhema matrimony');
}

export function resolveMatrimonyEntryRoute(res: StartRegistrationResponse): {
  screen:
    | 'MatrimonyHome'
    | 'MatrimonyPhotoUpload'
    | 'MatrimonyInterests'
    | 'MatrimonySubmitApproval'
    | 'MatrimonyStatus'
    | 'MatrimonyWelcome';
  params?: Record<string, any>;
} {
  if (!res.eligible) {
    return { screen: 'MatrimonyWelcome', params: { preloadedData: res } };
  }
  const status = res.profile?.profileStatus;
  const stage = res.profile?.onboardingStage;
  const isRegistered =
    res.registered !== false &&
    Boolean(res.profile) &&
    Boolean(status) &&
    status !== 'not_started' &&
    status !== 'deleted' &&
    stage !== 'not_started';

  if (!isRegistered) {
    return { screen: 'MatrimonyWelcome', params: { preloadedData: res } };
  }

  if (
    status === 'pending' ||
    status === 'rejected' ||
    status === 'correction_requested' ||
    status === 'suspended' ||
    status === 'inactive'
  ) {
    return { screen: 'MatrimonyStatus' };
  }

  const hasPrimaryPhoto = Boolean(res.profile?.profilePhoto);
  if (!hasPrimaryPhoto || stage === 'photos_pending') {
    return { screen: 'MatrimonyPhotoUpload', params: { initialData: res } };
  }

  if (status === 'draft') {
    if (stage === 'approval_pending_submit') {
      return { screen: 'MatrimonySubmitApproval', params: { initialData: res } };
    }
    return { screen: 'MatrimonyInterests', params: { initialData: res } };
  }

  if (status !== 'approved') {
    return { screen: 'MatrimonyStatus' };
  }

  return { screen: 'MatrimonyHome' };
}

export const matrimonyApi = {
  resolvePhotoUrl: resolveStoragePhotoUrl,

  clearAllCaches(): void {
    clearAllCaches();
  },

  async hydrateCacheFromStorage(): Promise<void> {
    const s = getStore();
    if (s.hydratedFromDisk || !s.uid || s.uid === 'anon') return;
    const inflightKey = 'hydrateCacheFromStorage';
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      s.hydratedFromDisk = true;
      const trace = matrimonyPerf.startTrace('cache_hydrate');
      try {
        const raw = await AsyncStorage.getItem(`${STORAGE_CACHE_PREFIX}${s.uid}`);
        if (!raw) {
          trace.stop(true, { hit: false });
          return;
        }
        const parsed = JSON.parse(raw);
        // Mark disk-hydrated entries with fetchedAt=0 so screens render immediately AND silently revalidate
        if (parsed?.registration && !s.registration) {
          s.registration = { data: parsed.registration, fetchedAt: 0 };
        }
        if (parsed?.status && !s.status) {
          s.status = { data: parsed.status, fetchedAt: 0 };
        }
        if (parsed?.lastMatchesKey && parsed?.lastMatches && !s.matchesByKey.has(parsed.lastMatchesKey)) {
          s.matchesByKey.set(parsed.lastMatchesKey, { data: parsed.lastMatches, fetchedAt: 0 });
          if (!s.lastMatchesKey) s.lastMatchesKey = parsed.lastMatchesKey;
        }
        if (parsed?.interestsHub && !s.interestsHub) {
          s.interestsHub = { data: parsed.interestsHub, fetchedAt: 0 };
        }
        if (parsed?.chatContacts && !s.chatContacts) {
          s.chatContacts = { data: parsed.chatContacts, fetchedAt: 0 };
        }
        if (Array.isArray(parsed?.plans) && !s.plans) {
          s.plans = { data: parsed.plans, fetchedAt: 0 };
        }
        if (parsed?.entitlements && !s.entitlements) {
          s.entitlements = { data: parsed.entitlements, fetchedAt: 0 };
        }
        if (parsed?.notificationsFeed && !s.notificationsFeed) {
          s.notificationsFeed = { data: parsed.notificationsFeed, fetchedAt: 0 };
        }
        if (parsed?.hiddenProfiles?.dont_show && !s.hiddenProfiles.dont_show) {
          s.hiddenProfiles.dont_show = { data: parsed.hiddenProfiles.dont_show, fetchedAt: 0 };
        }
        if (parsed?.hiddenProfiles?.blocked && !s.hiddenProfiles.blocked) {
          s.hiddenProfiles.blocked = { data: parsed.hiddenProfiles.blocked, fetchedAt: 0 };
        }
        trace.stop(true, { hit: true });
      } catch {
        trace.stop(false, { hit: false });
      } finally {
        s.inflight.delete(inflightKey);
      }
    })();

    s.inflight.set(inflightKey, req);
    return req;
  },

  getCachedRegistration(): StartRegistrationResponse | null {
    return getStore().registration?.data || null;
  },

  getCachedStatus(): MatrimonyStatusResponse | null {
    return getStore().status?.data || null;
  },

  getCachedMatches(params?: GetMatchesParams): GetMatrimonyMatchesResponse | null {
    const s = getStore();
    if (params) {
      return s.matchesByKey.get(stableMatchesKey(params))?.data || null;
    }
    if (s.lastMatchesKey) {
      return s.matchesByKey.get(s.lastMatchesKey)?.data || null;
    }
    const first = s.matchesByKey.values().next().value;
    return first?.data || null;
  },

  getCachedInterestsHub(): GetMatrimonyInterestsHubResponse | null {
    return getStore().interestsHub?.data || null;
  },

  getCachedChatContacts(): ChatContactsResponse | null {
    return getStore().chatContacts?.data || null;
  },

  getCachedPlans(): MatrimonyPlanSpec[] | null {
    return getStore().plans?.data || null;
  },

  getCachedEntitlements(): MemberEntitlements | null {
    return getStore().entitlements?.data || null;
  },

  async prefetchMatrimonyWorkspace(): Promise<void> {
    const s = getStore();
    if (!s.uid || s.uid === 'anon') return;
    const inflightKey = 'prefetchMatrimonyWorkspace';
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;
    if (Date.now() - s.lastPrefetchAt < 25_000) return;

    const req = (async () => {
      s.lastPrefetchAt = Date.now();
      await matrimonyApi.hydrateCacheFromStorage().catch(() => undefined);

      // Read user's saved Matches screen preferences so prefetch hits the exact default query
      let savedTab: MatrimonyMatchTab = 'all';
      let savedMode: 'partner_preferences' | 'all_filters' = 'partner_preferences';
      let savedSort: GetMatchesParams['sortBy'] = 'best_match';
      let savedFilters: MatrimonyMatchesFilter = {};
      try {
        const entries = await AsyncStorage.multiGet([
          `@rhema_matrimony_matches_tab_${s.uid}`,
          `@rhema_matrimony_matches_mode_v3_${s.uid}`,
          `@rhema_matrimony_matches_sort_${s.uid}`,
          `@rhema_matrimony_matches_filters_v3_${s.uid}`,
        ]);
        const map = Object.fromEntries(entries);
        if (map[`@rhema_matrimony_matches_tab_${s.uid}`]) {
          savedTab = map[`@rhema_matrimony_matches_tab_${s.uid}`] as MatrimonyMatchTab;
        }
        if (
          map[`@rhema_matrimony_matches_mode_v3_${s.uid}`] === 'custom' ||
          map[`@rhema_matrimony_matches_mode_v3_${s.uid}`] === 'cleared'
        ) {
          savedMode = 'all_filters';
        }
        if (map[`@rhema_matrimony_matches_sort_${s.uid}`]) {
          savedSort = map[`@rhema_matrimony_matches_sort_${s.uid}`] as GetMatchesParams['sortBy'];
        }
        if (map[`@rhema_matrimony_matches_filters_v3_${s.uid}`]) {
          const parsed = JSON.parse(map[`@rhema_matrimony_matches_filters_v3_${s.uid}`] as string);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            savedFilters = parsed;
          }
        }
      } catch {
        // Fall back to default matches params
      }

      await Promise.allSettled([
        matrimonyApi.getStatus({ maxAgeMs: DEFAULT_CACHE_TTL_MS }),
        matrimonyApi.getMatches(
          { tab: savedTab, matchBasis: savedMode, sortBy: savedSort, filters: savedFilters, offset: 0, limit: 12 },
          { maxAgeMs: DEFAULT_CACHE_TTL_MS }
        ),
        matrimonyApi.getInterestsHub({ maxAgeMs: DEFAULT_CACHE_TTL_MS }),
        matrimonyApi.getChatContacts({ maxAgeMs: DEFAULT_CACHE_TTL_MS }),
        matrimonyApi.getMemberEntitlements({ maxAgeMs: DEFAULT_CACHE_TTL_MS }),
      ]);
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  patchCachedRegistration(
    updater: (prev: StartRegistrationResponse) => StartRegistrationResponse
  ): void {
    const s = getStore();
    if (!s.registration?.data) return;
    const rawNext = updater(s.registration.data);
    const liveCompletion = rawNext.profile
      ? computeMatrimonyProfileCompletion(
          rawNext.profile,
          rawNext.preferences,
          rawNext.familyDetails
        )
      : undefined;
    const next: StartRegistrationResponse =
      rawNext.profile && liveCompletion !== undefined
        ? {
            ...rawNext,
            profile: { ...rawNext.profile, profileCompletion: liveCompletion },
          }
        : rawNext;
    s.cacheVersion += 1;
    s.lastLocalPatchAt = Date.now();
    s.registration = { data: next, fetchedAt: 0 };
    if (s.status?.data) {
      s.status = {
        data: {
          ...s.status.data,
          profile: next.profile ? { ...(s.status.data.profile || {}), ...next.profile } : s.status.data.profile,
          profileCompletion: liveCompletion ?? next.profile?.profileCompletion ?? s.status.data.profileCompletion,
        },
        fetchedAt: 0,
      };
    }
    persistSnapshotToDisk();
  },

  async startRegistration(options: FetchCacheOptions = {}): Promise<StartRegistrationResponse> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    if (!options.force && isEntryFresh(s.registration, maxAge) && s.registration) {
      return s.registration.data;
    }
    const inflightKey = 'startRegistration';
    if (!options.force) {
      const existing = s.inflight.get(inflightKey);
      if (existing) return existing;
    }

    const reqVersion = s.cacheVersion;
    const req = (async () => {
      const res = await callMatrimonyFunction<StartRegistrationResponse>('startMatrimonyRegistration', {});
      if (res.profile) {
        if (!res.profile.signedProfilePhoto && res.profile.profilePhoto) {
          res.profile.signedProfilePhoto = await resolveStoragePhotoUrl(res.profile.profilePhoto);
        }
        const rawGallery = Array.isArray(res.profile.gallery) ? res.profile.gallery : [];
        const currentSigned = Array.isArray(res.profile.signedGallery) ? res.profile.signedGallery : [];
        if (rawGallery.length > 0 && currentSigned.length < rawGallery.length) {
          const resolved = await Promise.all(rawGallery.map((p) => resolveStoragePhotoUrl(p)));
          res.profile.signedGallery = resolved.filter((u): u is string => Boolean(u));
        }
      }
      if (reqVersion === s.cacheVersion) {
        s.registration = { data: res, fetchedAt: Date.now() };
        prefetchImageUrls([res.profile?.signedProfilePhoto]);
        persistSnapshotToDisk();
        return res;
      }
      return s.registration?.data || res;
    })().finally(() => {
      if (s.inflight.get(inflightKey) === req) {
        s.inflight.delete(inflightKey);
      }
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  hasPendingDraftSync(withinMs = 4000): boolean {
    const s = getStore();
    return s.pendingDraftWrites > 0 || Date.now() - s.lastLocalPatchAt < withinMs;
  },

  async saveDraft(
    section: 'basic' | 'personal' | 'religious' | 'location' | 'professional' | 'additional' | 'interests' | 'consent' | 'details' | 'preferences' | 'photos' | 'privacy' | 'notifications' | 'complete',
    data: Record<string, any>
  ): Promise<{ success: boolean; section: string; saved: boolean }> {
    const s = getStore();
    s.pendingDraftWrites += 1;
    try {
      const res = await callMatrimonyFunction<{ success: boolean; section: string; saved: boolean }>(
        'saveMatrimonyDraft',
        { section, data }
      );
      invalidateCache({ registration: true, status: true, matches: true, interestsHub: true, chatContacts: true });
      return res;
    } finally {
      s.pendingDraftWrites = Math.max(0, s.pendingDraftWrites - 1);
    }
  },

  async savePrivacySettings(data: {
    mobilePrivacy?: 'show_all' | 'messages_only';
    photoVisibility?: 'approved_members' | 'contacted_and_paid' | 'protect_photo' | 'matches_only';
    protectedPhotoAllowedUids?: string[];
  }): Promise<{ success: boolean; section: string; saved: boolean }> {
    this.patchCachedRegistration((prev) => ({
      ...prev,
      profile: prev.profile
        ? {
            ...prev.profile,
            ...(data.mobilePrivacy !== undefined ? { mobilePrivacy: data.mobilePrivacy } : {}),
            ...(data.photoVisibility !== undefined ? { photoVisibility: data.photoVisibility } : {}),
            ...(data.protectedPhotoAllowedUids !== undefined
              ? { protectedPhotoAllowedUids: data.protectedPhotoAllowedUids }
              : {}),
          }
        : prev.profile,
    }));
    const res = await this.saveDraft('privacy', data);
    return res;
  },

  patchCandidatePhotosInCache(
    targetUid: string,
    patch: {
      signedProfilePhoto?: string | null;
      signedGallery?: string[];
      photoCount?: number;
      isPhotoProtected?: boolean;
      photoVisibility?: string;
      photoRequestStatus?: 'pending' | 'approved' | 'declined' | null;
    }
  ): void {
    const s = getStore();
    const applyPatch = (c: any) =>
      c && c.uid === targetUid ? { ...c, ...patch } : c;

    s.matchesByKey.forEach((entry) => {
      if (entry.data?.matches) {
        entry.data = {
          ...entry.data,
          matches: entry.data.matches.map(applyPatch),
        };
      }
    });
    if (s.interestsHub?.data) {
      const patchEntry = (e: any) =>
        e?.candidate?.uid === targetUid
          ? { ...e, candidate: applyPatch(e.candidate) }
          : e;
      s.interestsHub = {
        ...s.interestsHub,
        data: {
          ...s.interestsHub.data,
          received: (s.interestsHub.data.received || []).map(patchEntry),
          sent: (s.interestsHub.data.sent || []).map(patchEntry),
        },
      };
    }
    if (s.notificationsFeed?.data) {
      s.notificationsFeed = {
        ...s.notificationsFeed,
        data: {
          ...s.notificationsFeed.data,
          notifications: (s.notificationsFeed.data.notifications || []).map((n) =>
            n.senderUid === targetUid
              ? {
                  ...n,
                  senderPhoto:
                    patch.signedProfilePhoto !== undefined
                      ? patch.signedProfilePhoto
                      : n.senderPhoto,
                  candidate: n.candidate ? applyPatch(n.candidate) : n.candidate,
                }
              : n
          ),
        },
      };
    }
  },

  async getCandidatePhotos(targetUid: string): Promise<{
    success: boolean;
    canSeePhotos: boolean;
    signedProfilePhoto: string | null;
    signedGallery: string[];
  }> {
    const s = getStore();
    const inflightKey = `getCandidatePhotos:${targetUid}`;
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      const res = await callMatrimonyFunction<{
        success: boolean;
        canSeePhotos: boolean;
        signedProfilePhoto: string | null;
        signedGallery: string[];
      }>('getMatrimonyCandidatePhotos', { targetUid });
      if (res?.canSeePhotos && res.signedProfilePhoto) {
        this.patchCandidatePhotosInCache(targetUid, {
          signedProfilePhoto: res.signedProfilePhoto,
          signedGallery: Array.isArray(res.signedGallery) ? res.signedGallery : [],
          photoCount:
            (res.signedProfilePhoto ? 1 : 0) +
            (Array.isArray(res.signedGallery) ? res.signedGallery.length : 0),
          isPhotoProtected: false,
          photoRequestStatus: 'approved',
        });
      }
      return res;
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });
    s.inflight.set(inflightKey, req);
    return req;
  },

  async requestPhotoAccess(
    targetUid: string
  ): Promise<{ success: boolean; status: 'pending' | 'approved'; alreadyAllowed?: boolean }> {
    const s = getStore();
    const prevSnapshot = new Map<string, 'pending' | 'approved' | 'declined' | null | undefined>();
    s.matchesByKey.forEach((entry, k) => {
      const hit = entry.data?.matches?.find((m) => m.uid === targetUid);
      if (hit) prevSnapshot.set(k, hit.photoRequestStatus);
    });

    this.patchCandidatePhotosInCache(targetUid, { photoRequestStatus: 'pending' });

    try {
      const res = await callMatrimonyFunction<{
        success: boolean;
        status: 'pending' | 'approved';
        alreadyAllowed?: boolean;
      }>('requestMatrimonyPhotoAccess', { targetUid });
      const nextStatus = res?.status === 'approved' ? 'approved' : 'pending';
      this.patchCandidatePhotosInCache(targetUid, { photoRequestStatus: nextStatus });
      if (nextStatus === 'approved') {
        this.getCandidatePhotos(targetUid).catch(() => undefined);
      }
      invalidateCache({ matches: nextStatus === 'approved', interestsHub: nextStatus === 'approved' });
      return res;
    } catch (err) {
      s.matchesByKey.forEach((entry, k) => {
        if (entry.data?.matches && prevSnapshot.has(k)) {
          entry.data = {
            ...entry.data,
            matches: entry.data.matches.map((m) =>
              m.uid === targetUid ? { ...m, photoRequestStatus: prevSnapshot.get(k) ?? null } : m
            ),
          };
        }
      });
      throw err;
    }
  },

  getCachedPhotoRequests(): MatrimonyPhotoRequestItem[] | null {
    return getStore().photoRequests?.data || null;
  },

  async getPhotoRequests(options: FetchCacheOptions = {}): Promise<{
    success: boolean;
    requests: MatrimonyPhotoRequestItem[];
  }> {
    const s = getStore();
    if (!options.force && s.photoRequests) {
      return { success: true, requests: s.photoRequests.data };
    }
    const inflightKey = 'getPhotoRequests';
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      const res = await callMatrimonyFunction<{
        success: boolean;
        requests: MatrimonyPhotoRequestItem[];
      }>('getMatrimonyPhotoRequests', {});
      if (Array.isArray(res?.requests)) {
        s.photoRequests = { data: res.requests, fetchedAt: Date.now() };
      }
      return res;
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });
    s.inflight.set(inflightKey, req);
    return req;
  },

  async respondToPhotoRequest(
    requesterUid: string,
    action: 'approve' | 'decline'
  ): Promise<{ success: boolean; status: 'approved' | 'declined' }> {
    const optimisticStatus: 'approved' | 'declined' =
      action === 'approve' ? 'approved' : 'declined';
    const s = getStore();
    if (s.photoRequests?.data) {
      s.photoRequests = {
        data: s.photoRequests.data.map((r) =>
          r.uid === requesterUid ? { ...r, status: optimisticStatus } : r
        ),
        fetchedAt: Date.now(),
      };
    }
    if (s.notificationsFeed?.data) {
      s.notificationsFeed = {
        ...s.notificationsFeed,
        data: {
          ...s.notificationsFeed.data,
          notifications: (s.notificationsFeed.data.notifications || []).map((n) =>
            n.type === 'PHOTO_REQUEST_RECEIVED' && n.senderUid === requesterUid
              ? { ...n, incomingPhotoRequestStatus: optimisticStatus }
              : n
          ),
        },
        fetchedAt: Date.now(),
      };
    }
    this.patchCachedRegistration((prev) => {
      const existingAllowed = Array.isArray(prev.profile?.protectedPhotoAllowedUids)
        ? prev.profile!.protectedPhotoAllowedUids
        : [];
      const nextAllowed =
        action === 'approve'
          ? existingAllowed.includes(requesterUid)
            ? existingAllowed
            : [...existingAllowed, requesterUid]
          : existingAllowed.filter((id) => id !== requesterUid);
      return {
        ...prev,
        profile: prev.profile
          ? { ...prev.profile, protectedPhotoAllowedUids: nextAllowed }
          : prev.profile,
      };
    });

    const res = await callMatrimonyFunction<{
      success: boolean;
      status: 'approved' | 'declined';
    }>('respondMatrimonyPhotoRequest', { requesterUid, action });
    invalidateCache({ registration: true, matches: true, chatContacts: true });
    return res;
  },

  getCachedNotificationsFeed(): {
    notifications: MatrimonyNotificationFeedItem[];
    unreadCount: number;
  } | null {
    return getStore().notificationsFeed?.data || null;
  },

  async getNotificationsFeed(options: FetchCacheOptions = {}): Promise<{
    success: boolean;
    notifications: MatrimonyNotificationFeedItem[];
    unreadCount: number;
  }> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    if (!options.force && isEntryFresh(s.notificationsFeed, maxAge) && s.notificationsFeed) {
      return { success: true, ...s.notificationsFeed.data };
    }
    const inflightKey = 'getNotificationsFeed';
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      const res = await callMatrimonyFunction<{
        success: boolean;
        notifications: MatrimonyNotificationFeedItem[];
        unreadCount: number;
      }>('getMatrimonyNotificationsFeed', {});
      if (Array.isArray(res?.notifications)) {
        const unreadCount =
          typeof res.unreadCount === 'number'
            ? res.unreadCount
            : res.notifications.filter((n) => !n.read).length;
        s.notificationsFeed = {
          data: { notifications: res.notifications, unreadCount },
          fetchedAt: Date.now(),
        };
        prefetchImageUrls(res.notifications.slice(0, 12).map((n) => n.senderPhoto));
        persistSnapshotToDisk();
      }
      return res;
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });
    s.inflight.set(inflightKey, req);
    return req;
  },

  async manageNotification(
    action: 'mark_read' | 'mark_all_read' | 'delete',
    notificationId?: string
  ): Promise<{ success: boolean }> {
    const s = getStore();
    if (s.notificationsFeed?.data) {
      let nextList = s.notificationsFeed.data.notifications;
      if (action === 'mark_all_read') {
        nextList = nextList.map((n) => ({ ...n, read: true }));
      } else if (action === 'mark_read' && notificationId) {
        nextList = nextList.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
      } else if (action === 'delete' && notificationId) {
        nextList = nextList.filter((n) => n.id !== notificationId);
      }
      s.notificationsFeed = {
        data: {
          notifications: nextList,
          unreadCount: nextList.filter((n) => !n.read).length,
        },
        fetchedAt: Date.now(),
      };
    }
    return callMatrimonyFunction('manageMatrimonyNotification', {
      action,
      ...(notificationId ? { notificationId } : {}),
    });
  },

  async saveNotificationPreferences(
    prefs: Partial<MatrimonyNotificationPreferences>
  ): Promise<{ success: boolean; section: string; saved: boolean }> {
    return this.saveDraft('notifications', prefs);
  },

  async deactivateMyAccount(
    active: boolean
  ): Promise<{ success: boolean; selfDeactivated: boolean; visibility: string }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      selfDeactivated: boolean;
      visibility: string;
    }>('deactivateMyMatrimonyAccount', { active });
    invalidateCache({ registration: true, status: true, matches: true });
    return res;
  },

  async deleteMyAccount(
    reason: string,
    details?: string
  ): Promise<{ success: boolean; deleted: boolean; deletionReason: string }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      deleted: boolean;
      deletionReason: string;
    }>('deleteMyMatrimonyAccount', { reason, ...(details ? { details } : {}) });
    clearAllCaches();
    return res;
  },

  async completeRegistration(
    data: Record<string, any>
  ): Promise<{ success: boolean; section: string; saved: boolean }> {
    const res = await callMatrimonyFunction<{ success: boolean; section: string; saved: boolean }>(
      'saveMatrimonyDraft',
      { section: 'complete', data }
    );
    invalidateCache({ registration: true, status: true, matches: true });
    return res;
  },

  async submitProfile(): Promise<{
    success: boolean;
    profileStatus: string;
    verificationStatus: string;
  }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      profileStatus: string;
      verificationStatus: string;
    }>('submitMatrimonyProfile', {});
    invalidateCache({ registration: true, status: true });
    return res;
  },

  async getStatus(options: FetchCacheOptions = {}): Promise<MatrimonyStatusResponse> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    if (!options.force && isEntryFresh(s.status, maxAge) && s.status) {
      return s.status.data;
    }
    const inflightKey = 'getStatus';
    if (!options.force) {
      const existing = s.inflight.get(inflightKey);
      if (existing) return existing;
    }

    const reqVersion = s.cacheVersion;
    const req = (async () => {
      const res = await callMatrimonyFunction<MatrimonyStatusResponse>('getMatrimonyStatus', {});
      if (!res.signedProfilePhoto && res.profile?.profilePhoto) {
        res.signedProfilePhoto = await resolveStoragePhotoUrl(res.profile.profilePhoto);
      }
      if (res.profile && !res.profile.signedProfilePhoto && res.signedProfilePhoto) {
        res.profile.signedProfilePhoto = res.signedProfilePhoto;
      }
      if (reqVersion === s.cacheVersion) {
        s.status = { data: res, fetchedAt: Date.now() };
        prefetchImageUrls([res.signedProfilePhoto]);
        persistSnapshotToDisk();
        return res;
      }
      return s.status?.data || res;
    })().finally(() => {
      if (s.inflight.get(inflightKey) === req) {
        s.inflight.delete(inflightKey);
      }
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  /**
   * Uploads a matrimony photo to the dedicated private matrimony bucket via Cloud Function,
   * falling back cleanly to Firebase Storage download URLs if signed URLs cannot be generated.
   */
  async uploadMatrimonyPhoto(
    base64: string,
    mimeType = 'image/jpeg',
    isPrimary = false,
    localUri?: string
  ): Promise<{ storagePath: string; signedUrl: string | null }> {
    if (base64) {
      try {
        const data = await callMatrimonyFunction<{
          success: boolean;
          storagePath: string;
          signedUrl: string | null;
        }>('uploadMatrimonyPhoto', {
          base64,
          mimeType,
          isPrimary,
        }, 45000);

        if (data.signedUrl) {
          invalidateCache({ registration: true, status: true, matches: true });
          return {
            storagePath: data.storagePath,
            signedUrl: data.signedUrl,
          };
        }

        const resolved = await resolveStoragePhotoUrl(data.storagePath);
        if (resolved) {
          invalidateCache({ registration: true, status: true, matches: true });
          return {
            storagePath: data.storagePath,
            signedUrl: resolved,
          };
        }

        if (localUri) {
          const uploaded = await uploadDirectToStorage(localUri, mimeType, isPrimary);
          invalidateCache({ registration: true, status: true, matches: true });
          return uploaded;
        }

        invalidateCache({ registration: true, status: true, matches: true });
        return {
          storagePath: data.storagePath,
          signedUrl: null,
        };
      } catch (err) {
        if (localUri && isTransientCallableError(err)) {
          const uploaded = await uploadDirectToStorage(localUri, mimeType, isPrimary);
          invalidateCache({ registration: true, status: true, matches: true });
          return uploaded;
        }
        throw err;
      }
    }

    if (localUri) {
      const uploaded = await uploadDirectToStorage(localUri, mimeType, isPrimary);
      invalidateCache({ registration: true, status: true, matches: true });
      return uploaded;
    }

    throw new Error('No image data available to upload.');
  },

  async resetProfile(): Promise<{ success: boolean; profileStatus: string }> {
    const res = await callMatrimonyFunction<{ success: boolean; profileStatus: string }>(
      'resetMatrimonyProfile',
      {}
    );
    clearAllCaches();
    return res;
  },

  async getAdminDashboard(): Promise<{ success: boolean; counts: AdminMatrimonyCounts }> {
    return callMatrimonyFunction<{ success: boolean; counts: AdminMatrimonyCounts }>(
      'getMatrimonyAdminDashboard',
      {}
    );
  },

  async getAdminProfiles(
    status: 'pending' | 'approved' | 'rejected' | 'inactive' | 'reported' | 'draft' | 'all' = 'pending',
    search?: string
  ): Promise<{
    success: boolean;
    profiles: AdminMatrimonyProfileSummary[];
    counts?: AdminMatrimonyCounts;
  }> {
    const trimmedSearch = search?.trim();
    const res = await callMatrimonyFunction<{
      success: boolean;
      profiles: AdminMatrimonyProfileSummary[];
      counts?: AdminMatrimonyCounts;
    }>(
      'getMatrimonyPendingProfiles',
      {
        status,
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
      },
      30_000
    );

    if (Array.isArray(res.profiles)) {
      res.profiles = await Promise.all(
        res.profiles.map(async (p) => {
          const resolvedPhoto =
            p.signedProfilePhoto ||
            p.signedPhoto ||
            (p.profilePhoto ? await resolveStoragePhotoUrl(p.profilePhoto) : null);
          return {
            ...p,
            signedPhoto: resolvedPhoto,
            signedProfilePhoto: resolvedPhoto,
          };
        })
      );
    }
    return res;
  },

  async getAdminProfileDetail(targetUid: string): Promise<AdminMatrimonyProfileDetail> {
    const res = await callMatrimonyFunction<AdminMatrimonyProfileDetail>(
      'getMatrimonyAdminProfileDetail',
      { targetUid }
    );
    if (res.profile) {
      if (!res.profile.signedProfilePhoto && res.profile.profilePhoto) {
        res.profile.signedProfilePhoto = await resolveStoragePhotoUrl(res.profile.profilePhoto);
      }
      const rawGallery = Array.isArray(res.profile.gallery) ? res.profile.gallery : [];
      const currentSigned = Array.isArray(res.profile.signedGallery) ? res.profile.signedGallery : [];
      if (rawGallery.length > 0 && currentSigned.length < rawGallery.length) {
        const resolved = await Promise.all(rawGallery.map((p) => resolveStoragePhotoUrl(p)));
        res.profile.signedGallery = resolved.filter((u): u is string => Boolean(u));
      }
    }
    return res;
  },

  async approveAdminProfile(targetUid: string): Promise<{ success: boolean; profileStatus: string }> {
    return callMatrimonyFunction<{ success: boolean; profileStatus: string }>(
      'approveMatrimonyProfile',
      { targetUid }
    );
  },

  async rejectAdminProfile(
    targetUid: string,
    reason?: string
  ): Promise<{ success: boolean; profileStatus: string }> {
    return callMatrimonyFunction<{ success: boolean; profileStatus: string }>(
      'rejectMatrimonyProfile',
      { targetUid, reason: reason?.trim() || 'Profile requires updates before approval.' }
    );
  },

  async removeAdminProfileForAbuse(
    targetUid: string,
    reason?: string
  ): Promise<{ success: boolean; removed: boolean; bannedFromMatrimony: boolean }> {
    return callMatrimonyFunction<{
      success: boolean;
      removed: boolean;
      bannedFromMatrimony: boolean;
    }>('removeMatrimonyProfileForAbuse', {
      targetUid,
      reason: reason?.trim() || 'Removed by Church Administration due to abuse or policy violation.',
    });
  },

  async deleteAdminProfile(
    targetUid: string,
    reason?: string
  ): Promise<{ success: boolean; deleted: boolean; canReRegister: boolean }> {
    return callMatrimonyFunction<{
      success: boolean;
      deleted: boolean;
      canReRegister: boolean;
    }>(
      'deleteMatrimonyProfile',
      {
        targetUid,
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      },
      30_000
    );
  },

  async inactivateAdminProfile(
    targetUid: string,
    reason?: string
  ): Promise<{ success: boolean; profileStatus: string }> {
    return callMatrimonyFunction<{ success: boolean; profileStatus: string }>(
      'inactivateMatrimonyProfile',
      {
        targetUid,
        reason:
          reason?.trim() ||
          'Your Rhema Matrimony profile is currently inactive under Church Administration review.',
      }
    );
  },

  async activateAdminProfile(
    targetUid: string
  ): Promise<{ success: boolean; profileStatus: string; wasLegacyBan?: boolean }> {
    return callMatrimonyFunction<{
      success: boolean;
      profileStatus: string;
      wasLegacyBan?: boolean;
    }>('activateMatrimonyProfile', { targetUid });
  },

  async resolveAdminReport(
    reportId: string,
    resolutionStatus: 'resolved' | 'dismissed',
    resolutionNote?: string
  ): Promise<{ success: boolean; reportId: string; status: string }> {
    return callMatrimonyFunction<{ success: boolean; reportId: string; status: string }>(
      'resolveMatrimonyReport',
      {
        reportId,
        resolutionStatus,
        ...(resolutionNote?.trim() ? { resolutionNote: resolutionNote.trim() } : {}),
      }
    );
  },

  async reportProfile(params: {
    targetUid: string;
    category: string;
    reason?: string;
    source?: 'profile' | 'chat';
    alsoHide?: boolean;
  }): Promise<{ success: boolean; reportId: string; hidden: boolean }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      reportId: string;
      hidden: boolean;
    }>('reportMatrimonyProfile', {
      targetUid: params.targetUid,
      category: params.category,
      reason: params.reason?.trim() || params.category,
      source: params.source || 'profile',
      alsoHide: Boolean(params.alsoHide),
    });
    if (params.alsoHide) {
      invalidateCache({ matches: true, interestsHub: true, chatContacts: true });
    }
    return res;
  },

  async getHomeSummary(options: FetchCacheOptions = {}): Promise<{
    success: boolean;
    registered?: boolean;
    profileStatus?: string;
    unreadNotificationsCount?: number;
    viewerEntitlements?: MemberEntitlements;
    status?: MatrimonyStatusResponse;
    registration?: StartRegistrationResponse;
    allMatches?: GetMatrimonyMatchesResponse;
    newMatches?: GetMatrimonyMatchesResponse;
    viewedYou?: GetMatrimonyMatchesResponse;
    viewedByYou?: GetMatrimonyMatchesResponse;
  }> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    const allKey = stableMatchesKey({
      tab: 'all',
      matchBasis: 'partner_preferences',
      sortBy: 'best_match',
      filters: {},
    });
    const newKey = stableMatchesKey({
      tab: 'newly_joined',
      matchBasis: 'partner_preferences',
      sortBy: 'best_match',
      filters: {},
    });
    const viewedYouKey = stableMatchesKey({
      tab: 'viewed_you',
      matchBasis: 'all_filters',
      sortBy: 'last_active',
      filters: {},
    });
    const viewedByYouKey = stableMatchesKey({
      tab: 'viewed_by_you',
      matchBasis: 'all_filters',
      sortBy: 'last_active',
      filters: {},
    });

    if (
      !options.force &&
      isEntryFresh(s.status, maxAge) &&
      isEntryFresh(s.registration, maxAge) &&
      isEntryFresh(s.matchesByKey.get(allKey), maxAge) &&
      isEntryFresh(s.matchesByKey.get(newKey), maxAge) &&
      isEntryFresh(s.matchesByKey.get(viewedYouKey), maxAge) &&
      isEntryFresh(s.matchesByKey.get(viewedByYouKey), maxAge)
    ) {
      return {
        success: true,
        registered: true,
        profileStatus: s.status?.data?.profileStatus,
        unreadNotificationsCount: s.notificationsFeed?.data?.unreadCount,
        viewerEntitlements: s.entitlements?.data,
        status: s.status?.data,
        registration: s.registration?.data,
        allMatches: s.matchesByKey.get(allKey)?.data,
        newMatches: s.matchesByKey.get(newKey)?.data,
        viewedYou: s.matchesByKey.get(viewedYouKey)?.data,
        viewedByYou: s.matchesByKey.get(viewedByYouKey)?.data,
      };
    }

    const inflightKey = 'getHomeSummary';
    if (!options.force) {
      const existing = s.inflight.get(inflightKey);
      if (existing) return existing;
    }

    const reqVersion = s.cacheVersion;
    const req = (async () => {
      const res = await callMatrimonyFunction<any>('getMatrimonyHomeSummary', {});
      const now = Date.now();
      if (reqVersion === s.cacheVersion && res?.success) {
        if (res.status) s.status = { data: res.status, fetchedAt: now };
        if (res.registration) s.registration = { data: res.registration, fetchedAt: now };
        if (res.viewerEntitlements) {
          s.entitlements = { data: res.viewerEntitlements, fetchedAt: now };
        }
        if (res.allMatches) {
          s.matchesByKey.set(allKey, { data: res.allMatches, fetchedAt: now });
          s.lastMatchesKey = allKey;
        }
        if (res.newMatches) s.matchesByKey.set(newKey, { data: res.newMatches, fetchedAt: now });
        if (res.viewedYou) s.matchesByKey.set(viewedYouKey, { data: res.viewedYou, fetchedAt: now });
        if (res.viewedByYou) {
          s.matchesByKey.set(viewedByYouKey, { data: res.viewedByYou, fetchedAt: now });
        }
        if (typeof res.unreadNotificationsCount === 'number' && s.notificationsFeed?.data) {
          s.notificationsFeed = {
            ...s.notificationsFeed,
            data: {
              ...s.notificationsFeed.data,
              unreadCount: res.unreadNotificationsCount,
            },
          };
        }
        prefetchImageUrls([
          res.status?.signedProfilePhoto,
          ...(res.allMatches?.matches || []).slice(0, 6).map((m: any) => m?.signedProfilePhoto),
          ...(res.newMatches?.matches || []).slice(0, 4).map((m: any) => m?.signedProfilePhoto),
        ]);
        persistSnapshotToDisk();
      }
      return res;
    })().finally(() => {
      if (s.inflight.get(inflightKey) === req) {
        s.inflight.delete(inflightKey);
      }
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  async getMatches(
    params: GetMatchesParams = {},
    options: FetchCacheOptions = {}
  ): Promise<GetMatrimonyMatchesResponse> {
    const s = getStore();
    const cacheKey = stableMatchesKey(params);
    const offset = Math.max(0, Math.round(params.offset ?? 0));
    const isCountPreviewOnly = params.limit === 1 && offset === 0;
    const isAppendPage = offset > 0;

    if (!isAppendPage && !isCountPreviewOnly) {
      const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
      const cached = s.matchesByKey.get(cacheKey);
      if (!options.force && isEntryFresh(cached, maxAge) && cached) {
        s.lastMatchesKey = cacheKey;
        return cached.data;
      }
    }

    const inflightKey = isCountPreviewOnly
      ? `getMatchesPreview:${cacheKey}`
      : isAppendPage
      ? `getMatches:${cacheKey}:off=${offset}:lim=${params.limit ?? 'all'}`
      : `getMatches:${cacheKey}`;
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      const res = await callMatrimonyFunction<GetMatrimonyMatchesResponse>('getMatrimonyMatches', params);
      if (!isCountPreviewOnly) {
        if (isAppendPage) {
          const prevEntry = s.matchesByKey.get(cacheKey)?.data;
          if (prevEntry) {
            const seen = new Set((prevEntry.matches || []).map((m) => m.uid));
            const merged = [...(prevEntry.matches || [])];
            for (const m of res.matches || []) {
              if (m?.uid && !seen.has(m.uid)) {
                seen.add(m.uid);
                merged.push(m);
              }
            }
            s.matchesByKey.set(cacheKey, {
              data: {
                ...prevEntry,
                ...res,
                matches: merged,
              },
              fetchedAt: Date.now(),
            });
          }
        } else {
          s.matchesByKey.set(cacheKey, { data: res, fetchedAt: Date.now() });
          s.lastMatchesKey = cacheKey;
        }
        prefetchImageUrls([
          res.viewerPhoto,
          ...(res.matches || []).slice(0, 12).map((m) => m.signedProfilePhoto),
        ]);
        persistSnapshotToDisk();
      }
      return res;
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  async recordProfileView(targetUid: string): Promise<{ success: boolean; recorded: boolean }> {
    const res = await callMatrimonyFunction<{ success: boolean; recorded: boolean }>(
      'recordMatrimonyProfileView',
      { targetUid }
    );
    if (res?.success) {
      invalidateCache({ matchesTabs: ['viewed_by_you'] });
    }
    return res;
  },

  async toggleShortlist(
    targetUid: string,
    shortlist?: boolean
  ): Promise<{ success: boolean; shortlisted: boolean }> {
    const res = await callMatrimonyFunction<{ success: boolean; shortlisted: boolean }>(
      'toggleMatrimonyShortlist',
      shortlist !== undefined ? { targetUid, shortlist } : { targetUid }
    );
    const s = getStore();
    s.matchesByKey.forEach((entry, k) => {
      if (!entry.data?.matches) return;
      let isShortlistTab = false;
      try {
        const parsed = JSON.parse(k);
        isShortlistTab =
          parsed?.tab === 'shortlisted' || parsed?.tab === 'shortlisted_by_you';
      } catch {
        // ignore
      }
      entry.data = {
        ...entry.data,
        matches:
          isShortlistTab && !res.shortlisted
            ? entry.data.matches.filter((m) => m.uid !== targetUid)
            : entry.data.matches.map((m) =>
                m.uid === targetUid ? { ...m, isShortlisted: res.shortlisted } : m
              ),
      };
    });
    if (s.interestsHub?.data) {
      const patchEntry = (e: any) =>
        e?.candidate?.uid === targetUid
          ? { ...e, candidate: { ...e.candidate, isShortlisted: res.shortlisted } }
          : e;
      s.interestsHub = {
        ...s.interestsHub,
        data: {
          ...s.interestsHub.data,
          received: (s.interestsHub.data.received || []).map(patchEntry),
          sent: (s.interestsHub.data.sent || []).map(patchEntry),
        },
      };
    }
    invalidateCache({ matchesTabs: ['shortlisted', 'shortlisted_by_you'] });
    return res;
  },

  async dismissMatch(
    targetUid: string,
    type: 'dont_show' | 'blocked' = 'dont_show',
    preview?: Partial<MatrimonyHiddenProfileItem>
  ): Promise<{ success: boolean; dismissed: boolean }> {
    const s = getStore();
    let matchedCand: any = null;
    s.matchesByKey.forEach((entry) => {
      if (entry.data?.matches) {
        if (!matchedCand) {
          matchedCand = entry.data.matches.find((m) => m.uid === targetUid) || null;
        }
        entry.data = {
          ...entry.data,
          matches: entry.data.matches.filter((m) => m.uid !== targetUid),
        };
      }
    });

    const optimisticItem: MatrimonyHiddenProfileItem = {
      uid: targetUid,
      displayName: String(preview?.displayName || matchedCand?.displayName || 'Rhema Member'),
      profileCode: String(
        preview?.profileCode ||
          matchedCand?.profileCode ||
          `RM${targetUid.slice(0, 7).toUpperCase()}`
      ),
      age: preview?.age ?? matchedCand?.age ?? null,
      heightCm: preview?.heightCm ?? matchedCand?.heightCm ?? null,
      occupation: String(
        preview?.occupation ||
          matchedCand?.career?.profession ||
          matchedCand?.career?.occupationCategory ||
          matchedCand?.education?.qualification ||
          ''
      ).trim(),
      city: String(
        preview?.city ||
          matchedCand?.location?.village ||
          matchedCand?.location?.city ||
          matchedCand?.location?.state ||
          ''
      ).trim(),
      signedProfilePhoto:
        preview?.signedProfilePhoto ?? matchedCand?.signedProfilePhoto ?? null,
      hiddenAtMs: Date.now(),
    };

    const existingList = s.hiddenProfiles[type]?.data || [];
    s.hiddenProfiles[type] = {
      data: [optimisticItem, ...existingList.filter((p) => p.uid !== targetUid)],
      fetchedAt: 0,
    };
    s.inflight.delete(`hiddenProfiles:${type}`);
    persistSnapshotToDisk();

    const res = await callMatrimonyFunction<{ success: boolean; dismissed: boolean }>(
      'dismissMatrimonyMatch',
      { targetUid, type }
    );
    invalidateCache({ interestsHub: true, chatContacts: type === 'blocked' });
    return res;
  },

  async restoreDismissedMatches(
    targetUid?: string,
    type: 'dont_show' | 'blocked' | 'all' = 'dont_show'
  ): Promise<{ success: boolean; restoredCount: number }> {
    const res = await callMatrimonyFunction<{ success: boolean; restoredCount: number }>(
      'restoreMatrimonyMatches',
      { ...(targetUid ? { targetUid } : {}), type }
    );
    const s = getStore();
    if (type === 'all') {
      s.hiddenProfiles.dont_show = { data: [], fetchedAt: Date.now() };
      s.hiddenProfiles.blocked = { data: [], fetchedAt: Date.now() };
      s.inflight.delete('hiddenProfiles:dont_show');
      s.inflight.delete('hiddenProfiles:blocked');
    } else if (targetUid && s.hiddenProfiles[type]?.data) {
      s.hiddenProfiles[type] = {
        data: s.hiddenProfiles[type]!.data.filter((p) => p.uid !== targetUid),
        fetchedAt: Date.now(),
      };
      s.inflight.delete(`hiddenProfiles:${type}`);
    } else {
      s.hiddenProfiles[type] = { data: [], fetchedAt: 0 };
      s.inflight.delete(`hiddenProfiles:${type}`);
    }
    persistSnapshotToDisk();
    invalidateCache({ matches: true, interestsHub: true, chatContacts: type !== 'dont_show' });
    return res;
  },

  getCachedHiddenProfiles(type: 'dont_show' | 'blocked'): MatrimonyHiddenProfileItem[] | null {
    const entry = getStore().hiddenProfiles[type];
    return entry ? entry.data : null;
  },

  async getHiddenProfiles(
    type: 'dont_show' | 'blocked',
    options: FetchCacheOptions = {}
  ): Promise<{ success: boolean; profiles: MatrimonyHiddenProfileItem[] }> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    const cached = s.hiddenProfiles[type];
    if (!options.force && isEntryFresh(cached, maxAge)) {
      return { success: true, profiles: cached!.data };
    }
    const inflightKey = `hiddenProfiles:${type}`;
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      let list: MatrimonyHiddenProfileItem[] | null = null;
      const uid = auth().currentUser?.uid;

      if (uid) {
        try {
          const blocksSnap = await firestore()
            .collection('matrimony_profiles')
            .doc(uid)
            .collection('blocks')
            .get();

          const entries: Array<{ targetUid: string; hiddenAtMs: number }> = [];
          blocksSnap.docs.forEach((d) => {
            const data = d.data() || {};
            const docType = String(data.type || 'dont_show');
            if (docType !== type) return;
            const tUid = String(data.targetUid || d.id);
            if (!tUid || tUid === uid) return;
            const rawTs = data.createdAt;
            const ms =
              rawTs && typeof rawTs.toMillis === 'function'
                ? rawTs.toMillis()
                : rawTs && typeof rawTs.seconds === 'number'
                ? rawTs.seconds * 1000
                : 0;
            entries.push({ targetUid: tUid, hiddenAtMs: ms });
          });

          if (entries.length === 0) {
            list = [];
          } else {
            let needsServerFallback = false;
            const resolved = await Promise.all(
              entries.map(async ({ targetUid, hiddenAtMs }) => {
                try {
                  const profSnap = await firestore()
                    .collection('matrimony_profiles')
                    .doc(targetUid)
                    .get();
                  const docExists =
                    typeof (profSnap as any).exists === 'function'
                      ? (profSnap as any).exists()
                      : Boolean((profSnap as any).exists);
                  if (!docExists) return null;
                  const p: any = profSnap.data() || {};
                  if (p.profileStatus === 'deleted') return null;

                  let signedProfilePhoto: string | null = null;
                  if (p.profilePhoto && p.photoVisibility !== 'protect_photo') {
                    const rawPhoto = String(p.profilePhoto);
                    if (rawPhoto.startsWith('https://') || rawPhoto.startsWith('http://')) {
                      signedProfilePhoto = rawPhoto;
                    } else {
                      signedProfilePhoto = await resolveStoragePhotoUrl(rawPhoto);
                    }
                  }

                  return {
                    uid: targetUid,
                    displayName: String(p.displayName || 'Rhema Member'),
                    profileCode: String(
                      p.matrimonyId || `RM${targetUid.slice(0, 7).toUpperCase()}`
                    ),
                    age: typeof p.age === 'number' ? p.age : null,
                    heightCm: typeof p.heightCm === 'number' ? p.heightCm : null,
                    occupation: String(
                      p.career?.profession ||
                        p.career?.occupationCategory ||
                        p.education?.qualification ||
                        ''
                    ).trim(),
                    city: String(
                      p.location?.village || p.location?.city || p.location?.state || ''
                    ).trim(),
                    signedProfilePhoto,
                    hiddenAtMs,
                  } as MatrimonyHiddenProfileItem;
                } catch {
                  needsServerFallback = true;
                  return null;
                }
              })
            );

            if (!needsServerFallback) {
              list = resolved
                .filter((x): x is MatrimonyHiddenProfileItem => x !== null)
                .sort((a, b) => (b.hiddenAtMs || 0) - (a.hiddenAtMs || 0));
            }
          }
        } catch {
          // Fall back to Cloud Function if Firestore direct read fails
        }
      }

      if (list === null) {
        const res = await callMatrimonyFunction<{
          success: boolean;
          profiles: MatrimonyHiddenProfileItem[];
        }>('getMatrimonyHiddenProfiles', { type });
        list = Array.isArray(res?.profiles) ? res.profiles : [];
      }

      s.hiddenProfiles[type] = { data: list, fetchedAt: Date.now() };
      prefetchImageUrls(list.slice(0, 10).map((p) => p.signedProfilePhoto));
      persistSnapshotToDisk();
      return { success: true, profiles: list };
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  async sendInterest(
    targetUid: string
  ): Promise<{ success: boolean; interestStatus: string; isMutual: boolean }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      interestStatus: string;
      isMutual: boolean;
    }>('sendMatrimonyInterest', { targetUid });
    const s = getStore();
    const sentAt = Date.now();
    s.matchesByKey.forEach((entry) => {
      if (entry.data?.matches) {
        entry.data = {
          ...entry.data,
          matches: entry.data.matches.map((m) =>
            m.uid === targetUid
              ? { ...m, interestStatus: res.interestStatus as any, interestSentAtMs: sentAt }
              : m
          ),
        };
      }
    });
    if (s.entitlements?.data && typeof (res as any).interestsSentThisMonth === 'number') {
      s.entitlements = {
        ...s.entitlements,
        data: {
          ...s.entitlements.data,
          interestsSentThisMonth: (res as any).interestsSentThisMonth,
          interestsRemaining:
            typeof (res as any).interestsRemaining === 'number'
              ? (res as any).interestsRemaining
              : s.entitlements.data.interestsRemaining,
        },
      };
    }
    invalidateCache({ interestsHub: true, chatContacts: res.isMutual });
    return res;
  },

  async getInterestsHub(options: FetchCacheOptions = {}): Promise<GetMatrimonyInterestsHubResponse> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    if (!options.force && isEntryFresh(s.interestsHub, maxAge) && s.interestsHub) {
      return s.interestsHub.data;
    }
    const inflightKey = 'getInterestsHub';
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      const res = await callMatrimonyFunction<GetMatrimonyInterestsHubResponse>('getMatrimonyInterestsHub', {});
      s.interestsHub = { data: res, fetchedAt: Date.now() };
      prefetchImageUrls([
        ...(res.received || []).slice(0, 5).map((e) => e.candidate?.signedProfilePhoto),
        ...(res.sent || []).slice(0, 5).map((e) => e.candidate?.signedProfilePhoto),
      ]);
      persistSnapshotToDisk();
      return res;
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  async respondInterest(
    targetUid: string,
    action: 'accept' | 'decline' | 'withdraw'
  ): Promise<{ success: boolean; status: string }> {
    const res = await callMatrimonyFunction<{ success: boolean; status: string }>(
      'respondMatrimonyInterest',
      { targetUid, action }
    );
    const s = getStore();
    const nextMatchStatus = action === 'withdraw' ? null : action === 'accept' ? 'accepted' : 'declined';
    s.matchesByKey.forEach((entry) => {
      if (entry.data?.matches) {
        entry.data = {
          ...entry.data,
          matches: entry.data.matches.map((m) =>
            m.uid === targetUid
              ? {
                  ...m,
                  interestStatus: nextMatchStatus as any,
                  ...(action === 'withdraw' ? { interestSentAtMs: undefined } : {}),
                }
              : m
          ),
        };
      }
    });
    if (s.interestsHub?.data) {
      if (action === 'withdraw') {
        s.interestsHub = {
          ...s.interestsHub,
          data: {
            ...s.interestsHub.data,
            sent: (s.interestsHub.data.sent || []).filter((e) => e.candidate?.uid !== targetUid),
          },
        };
      } else {
        const nextHubStatus = action === 'accept' ? 'accepted' : 'declined';
        s.interestsHub = {
          ...s.interestsHub,
          data: {
            ...s.interestsHub.data,
            received: (s.interestsHub.data.received || []).map((e) =>
              e.candidate?.uid === targetUid
                ? {
                    ...e,
                    status: nextHubStatus,
                    candidate: { ...e.candidate, interestStatus: nextHubStatus },
                  }
                : e
            ),
          },
        };
      }
    }
    invalidateCache({ chatContacts: action === 'accept' });
    return res;
  },

  async ensureChatRoom(targetUid: string): Promise<{
    success: boolean;
    roomId: string;
    canMessage?: boolean;
    viewerTier?: string;
    peer: MatrimonyChatPeer;
    self: { uid: string; displayName: string; signedProfilePhoto: string | null };
  }> {
    return callMatrimonyFunction('ensureMatrimonyChatRoom', { targetUid });
  },

  async getChatContacts(options: FetchCacheOptions = {}): Promise<ChatContactsResponse & { canMessage?: boolean; viewerTier?: string }> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    if (!options.force && isEntryFresh(s.chatContacts, maxAge) && s.chatContacts) {
      return s.chatContacts.data;
    }
    const inflightKey = 'getChatContacts';
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      const res = await callMatrimonyFunction<ChatContactsResponse & { canMessage?: boolean; viewerTier?: string }>('getMatrimonyChatContacts', {});
      s.chatContacts = { data: res, fetchedAt: Date.now() };
      prefetchImageUrls([
        res.self?.signedProfilePhoto,
        ...(res.contacts || []).slice(0, 10).map((c) => c.signedProfilePhoto),
      ]);
      persistSnapshotToDisk();
      return res;
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  async notifyChatMessage(targetUid: string, previewText: string): Promise<void> {
    await callMatrimonyFunction('notifyMatrimonyChatMessage', { targetUid, previewText }).catch(
      () => undefined
    );
  },

  async sendChatMessage(params: {
    targetUid: string;
    text?: string;
    imageUrl?: string | null;
  }): Promise<{ success: boolean; roomId: string; messageId: string }> {
    return callMatrimonyFunction('sendMatrimonyMessage', params);
  },

  async uploadChatImage(localUri: string, mimeType = 'image/jpeg'): Promise<string> {
    const { signedUrl } = await uploadDirectToStorage(localUri, mimeType, false);
    return signedUrl;
  },

  async getPlans(options: FetchCacheOptions = {}): Promise<{ success: boolean; plans: MatrimonyPlanSpec[] }> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? PLANS_CACHE_TTL_MS;
    if (!options.force && isEntryFresh(s.plans, maxAge) && s.plans) {
      return { success: true, plans: s.plans.data };
    }
    const inflightKey = 'getPlans';
    if (!options.force) {
      const existing = s.inflight.get(inflightKey);
      if (existing) return existing;
    }

    const req = (async () => {
      const res = await callMatrimonyFunction<{ success: boolean; plans: MatrimonyPlanSpec[] }>(
        'getMatrimonyPlans',
        {}
      );
      if (Array.isArray(res?.plans)) {
        s.plans = { data: res.plans, fetchedAt: Date.now() };
        persistSnapshotToDisk();
      }
      return res;
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  async getMemberEntitlements(
    options: FetchCacheOptions = {}
  ): Promise<{ success: boolean; entitlements: MemberEntitlements }> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    if (!options.force && isEntryFresh(s.entitlements, maxAge) && s.entitlements) {
      return { success: true, entitlements: s.entitlements.data };
    }
    const inflightKey = 'getMemberEntitlements';
    if (!options.force) {
      const existing = s.inflight.get(inflightKey);
      if (existing) return existing;
    }

    const req = (async () => {
      const res = await callMatrimonyFunction<{ success: boolean; entitlements: MemberEntitlements }>(
        'getMemberEntitlements',
        {}
      );
      if (res?.entitlements) {
        s.entitlements = { data: res.entitlements, fetchedAt: Date.now() };
        persistSnapshotToDisk();
      }
      return res;
    })().finally(() => {
      s.inflight.delete(inflightKey);
    });

    s.inflight.set(inflightKey, req);
    return req;
  },

  async unlockContact(targetUid: string): Promise<{
    success: boolean;
    alreadyUnlocked: boolean;
    contactPhone: string | null;
    dob: string | null;
    contactNumbersViewedCount: number;
    contactNumbersRemaining: number;
  }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      alreadyUnlocked: boolean;
      contactPhone: string | null;
      dob: string | null;
      contactNumbersViewedCount: number;
      contactNumbersRemaining: number;
    }>('unlockMatrimonyContact', { targetUid });
    const s = getStore();
    s.matchesByKey.forEach((entry) => {
      if (entry.data?.matches) {
        entry.data = {
          ...entry.data,
          matches: entry.data.matches.map((m) =>
            m.uid === targetUid
              ? {
                  ...m,
                  contactPhone: res.contactPhone ?? m.contactPhone,
                  dob: res.dob ?? m.dob,
                  isContactUnlocked: true,
                }
              : m
          ),
        };
      }
    });
    if (s.interestsHub?.data) {
      const patchEntry = (e: any) =>
        e?.candidate?.uid === targetUid
          ? {
              ...e,
              candidate: {
                ...e.candidate,
                contactPhone: res.contactPhone ?? e.candidate.contactPhone,
                dob: res.dob ?? e.candidate.dob,
                isContactUnlocked: true,
              },
            }
          : e;
      s.interestsHub = {
        ...s.interestsHub,
        data: {
          ...s.interestsHub.data,
          received: (s.interestsHub.data.received || []).map(patchEntry),
          sent: (s.interestsHub.data.sent || []).map(patchEntry),
        },
      };
    }
    invalidateCache({ chatContacts: true, entitlements: true });
    return res;
  },

  async createUpgradeOrder(plan: 'silver' | 'gold' | 'platinum' | string): Promise<{
    success: boolean;
    orderId: string;
    amount: number;
    amountInr: number;
    currency: string;
    keyId: string;
    plan: 'silver' | 'gold' | 'platinum';
    planId?: string;
    planName: string;
    durationMonths?: number;
  }> {
    return callMatrimonyFunction('createMatrimonyUpgradeOrder', { plan });
  },

  async verifyUpgradePayment(payload: {
    plan: 'silver' | 'gold' | 'platinum' | string;
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }): Promise<{
    success: boolean;
    membership: MatrimonyMembershipInfo;
    entitlements?: MemberEntitlements;
  }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      membership: MatrimonyMembershipInfo;
      entitlements?: MemberEntitlements;
    }>('verifyMatrimonyUpgradePayment', payload);

    if (res?.success && res.membership) {
      const s = getStore();
      if (s.registration?.data?.profile) {
        s.registration = {
          data: {
            ...s.registration.data,
            profile: {
              ...s.registration.data.profile,
              membership: res.membership,
            },
          },
          fetchedAt: Date.now(),
        };
      }
      if (s.status?.data) {
        s.status = {
          data: {
            ...s.status.data,
            profile: s.status.data.profile
              ? { ...s.status.data.profile, membership: res.membership }
              : s.status.data.profile,
          },
          fetchedAt: Date.now(),
        };
      }
      if (res.entitlements) {
        s.entitlements = { data: res.entitlements, fetchedAt: Date.now() };
      }
      invalidateCache({ registration: true, status: true, matches: true, entitlements: !res.entitlements });
    }
    return res;
  },

  async seedTestUsers(): Promise<{
    success: boolean;
    createdCount: number;
    maleCount: number;
    femaleCount: number;
  }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      createdCount: number;
      maleCount: number;
      femaleCount: number;
    }>('seedMatrimonyTestUsers', {}, 120_000);
    invalidateCache({ matches: true });
    return res;
  },

  async deleteTestUsers(): Promise<{
    success: boolean;
    deletedCount: number;
  }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      deletedCount: number;
    }>('deleteMatrimonyTestUsers', {}, 180_000);
    invalidateCache({ matches: true });
    return res;
  },

  async adminGetPlansAndSubs(): Promise<AdminMatrimonyPlansAndSubsResponse> {
    return callMatrimonyFunction<AdminMatrimonyPlansAndSubsResponse>(
      'adminGetMatrimonyPlansAndSubs',
      {}
    );
  },

  async adminUpsertPlan(
    payload: Partial<MatrimonyPlanSpec> & { planId: string }
  ): Promise<{ success: boolean; plan: MatrimonyPlanSpec }> {
    const res = await callMatrimonyFunction<{ success: boolean; plan: MatrimonyPlanSpec }>(
      'adminUpsertMatrimonyPlan',
      payload
    );
    invalidateCache({ plans: true });
    return res;
  },

  async adminGrantComplimentarySubscription(payload: {
    targetUid: string;
    planId?: string;
    tier?: 'silver' | 'gold' | 'platinum';
    durationMonths?: number;
    note?: string;
    action?: 'grant' | 'revoke';
  }): Promise<{
    success: boolean;
    tier?: string;
    status?: string;
    subscriptionId?: string;
    validUntilMs?: number;
  }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      tier?: string;
      status?: string;
      subscriptionId?: string;
      validUntilMs?: number;
    }>('adminGrantComplimentarySubscription', payload);
    invalidateCache({ registration: true, status: true, matches: true, entitlements: true });
    return res;
  },

  async searchByProfileId(profileCode: string): Promise<SearchMatrimonyByIdResponse> {
    const cleaned = String(profileCode || '').replace(/\s+/g, '').toUpperCase();
    if (!cleaned) {
      return {
        success: true,
        found: false,
        reason: 'not_found',
        message: 'Please enter a valid Matrimony ID.',
      };
    }

    const s = getStore();
    const cachedLookup = s.searchByIdCache.get(cleaned);
    if (cachedLookup && isEntryFresh(cachedLookup, DEFAULT_CACHE_TTL_MS)) {
      return cachedLookup.data;
    }

    // 0ms instant hit when profile is already cached inside loaded Home/Matches feeds
    const numericTarget = /^\d+$/.test(cleaned)
      ? new Set([`RMT${cleaned}`, `RMT${cleaned.padStart(3, '0')}`, `RM${cleaned}`, `RM${cleaned.padStart(4, '0')}`])
      : null;
    for (const entry of s.matchesByKey.values()) {
      if (!isEntryFresh(entry, 5 * 60_000)) continue;
      const found = entry.data.matches?.find((m) => {
        const code = String(m.profileCode || '').replace(/\s+/g, '').toUpperCase();
        return code === cleaned || (numericTarget ? numericTarget.has(code) : false);
      });
      if (found) {
        const hit: SearchMatrimonyByIdResponse = {
          success: true,
          found: true,
          profile: found,
          viewerPhoto: entry.data.viewerPhoto ?? null,
        };
        s.searchByIdCache.set(cleaned, { data: hit, fetchedAt: Date.now() });
        return hit;
      }
    }

    const res = await callMatrimonyFunction<SearchMatrimonyByIdResponse>('searchMatrimonyById', {
      profileCode: cleaned,
    });
    if (res?.found && res.profile) {
      const normalizedRes: SearchMatrimonyByIdResponse = { ...res };
      s.searchByIdCache.set(cleaned, { data: normalizedRes, fetchedAt: Date.now() });
      const actualCode = String(res.profile.profileCode || '').replace(/\s+/g, '').toUpperCase();
      if (actualCode && actualCode !== cleaned) {
        s.searchByIdCache.set(actualCode, { data: normalizedRes, fetchedAt: Date.now() });
      }
      if (res.profile.signedProfilePhoto) {
        prefetchImageUrls([res.profile.signedProfilePhoto]);
      }
    }
    return res;
  },
};
