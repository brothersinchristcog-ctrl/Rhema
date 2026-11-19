import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';
import storage from '@react-native-firebase/storage';
import { Image } from 'react-native';
import {
  AdminMatrimonyCounts,
  AdminMatrimonyProfileDetail,
  AdminMatrimonyProfileSummary,
  GetMatrimonyInterestsHubResponse,
  GetMatrimonyMatchesResponse,
  MatrimonyChatContact,
  MatrimonyChatPeer,
  MatrimonyMatchTab,
  MatrimonyMatchesFilter,
  MatrimonyMembershipInfo,
  MatrimonyStatusResponse,
  StartRegistrationResponse,
} from '../types/matrimony';

export const MATRIMONY_BUCKET_URL = 'gs://rhema-global-ministries-matrimony';
const MATRIMONY_FUNCTIONS_REGION = 'us-central1';
const DEFAULT_PROJECT_ID = 'rhema-global-ministries';
const DEFAULT_CACHE_TTL_MS = 60_000;
const STORAGE_CACHE_PREFIX = '@rhema_matrimony_swr_v1_';

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

interface GetMatchesParams {
  tab?: MatrimonyMatchTab;
  matchBasis?: 'partner_preferences' | 'all_filters';
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
  registration: CacheEntry<StartRegistrationResponse> | null;
  status: CacheEntry<MatrimonyStatusResponse> | null;
  matchesByKey: Map<string, CacheEntry<GetMatrimonyMatchesResponse>>;
  lastMatchesKey: string | null;
  interestsHub: CacheEntry<GetMatrimonyInterestsHubResponse> | null;
  chatContacts: CacheEntry<ChatContactsResponse> | null;
  inflight: Map<string, Promise<any>>;
  resolvedUrls: Map<string, string>;
}

let store: MatrimonyMemoryStore | null = null;

function getStore(): MatrimonyMemoryStore {
  const currentUid = auth().currentUser?.uid || 'anon';
  if (!store || store.uid !== currentUid) {
    store = {
      uid: currentUid,
      hydratedFromDisk: false,
      cacheVersion: 0,
      registration: null,
      status: null,
      matchesByKey: new Map(),
      lastMatchesKey: null,
      interestsHub: null,
      chatContacts: null,
      inflight: new Map(),
      resolvedUrls: new Map(),
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
    sortBy: params.sortBy || 'best_match',
    filters: normalizedFilters,
  });
}

function isEntryFresh<T>(entry: CacheEntry<T> | null | undefined, maxAgeMs: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < maxAgeMs;
}

function persistSnapshotToDisk(): void {
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
  };
  AsyncStorage.setItem(`${STORAGE_CACHE_PREFIX}${s.uid}`, JSON.stringify(payload)).catch(() => {});
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
  interestsHub?: boolean;
  chatContacts?: boolean;
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
    s.matchesByKey.forEach((entry) => {
      entry.fetchedAt = 0;
    });
    for (const key of Array.from(s.inflight.keys())) {
      if (key.startsWith('getMatches:') || key.startsWith('matches:')) s.inflight.delete(key);
    }
  }
  if (targets.interestsHub) {
    if (s.interestsHub) s.interestsHub.fetchedAt = 0;
    s.inflight.delete('interestsHub');
  }
  if (targets.chatContacts) {
    if (s.chatContacts) s.chatContacts.fetchedAt = 0;
    s.inflight.delete('chatContacts');
  }
  persistSnapshotToDisk();
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

async function callViaHttpsFallback<T>(
  functionName: string,
  payload: Record<string, any>,
  timeoutMs: number
): Promise<T> {
  const projectId = functions().app?.options?.projectId || DEFAULT_PROJECT_ID;
  const url = `https://${MATRIMONY_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${functionName}`;
  const currentUser = auth().currentUser;
  const idToken = currentUser ? await currentUser.getIdToken() : null;

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
      error.code = status || (response.status === 503 ? 'unavailable' : 'unknown');
      error.details = json?.error?.details;
      throw error;
    }

    return (json?.result ?? json?.data) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function callMatrimonyFunction<T>(
  functionName: string,
  payload: Record<string, any> = {},
  timeoutMs = 20000
): Promise<T> {
  try {
    const callable = functions()
      .app.functions(MATRIMONY_FUNCTIONS_REGION)
      .httpsCallable(functionName, { timeout: timeoutMs });
    const res = await callable(payload);
    return res.data as T;
  } catch (err: any) {
    if (!isTransientCallableError(err)) {
      throw err;
    }

    console.warn(`[matrimonyApi] ${functionName} callable failed (${err?.code || err?.message}), retrying via HTTPS fallback...`);
    await sleep(350);

    try {
      return await callViaHttpsFallback<T>(functionName, payload, timeoutMs);
    } catch (fallbackErr: any) {
      if (!isTransientCallableError(fallbackErr)) {
        throw fallbackErr;
      }
      await sleep(700);
      return await callViaHttpsFallback<T>(functionName, payload, timeoutMs);
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

  async hydrateCacheFromStorage(): Promise<void> {
    const s = getStore();
    if (s.hydratedFromDisk || !s.uid || s.uid === 'anon') return;
    s.hydratedFromDisk = true;
    try {
      const raw = await AsyncStorage.getItem(`${STORAGE_CACHE_PREFIX}${s.uid}`);
      if (!raw) return;
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
    } catch {
      // Ignore corrupt cache JSON
    }
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
      const exact = s.matchesByKey.get(stableMatchesKey(params))?.data;
      if (exact) return exact;
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

  async prefetchMatrimonyWorkspace(): Promise<void> {
    const s = getStore();
    if (!s.uid || s.uid === 'anon') return;
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
        { tab: savedTab, matchBasis: savedMode, sortBy: savedSort, filters: savedFilters },
        { maxAgeMs: DEFAULT_CACHE_TTL_MS }
      ),
      matrimonyApi.getInterestsHub({ maxAgeMs: DEFAULT_CACHE_TTL_MS }),
      matrimonyApi.getChatContacts({ maxAgeMs: DEFAULT_CACHE_TTL_MS }),
    ]);
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

  async saveDraft(
    section: 'basic' | 'personal' | 'religious' | 'location' | 'professional' | 'additional' | 'interests' | 'consent' | 'details' | 'preferences' | 'photos' | 'complete',
    data: Record<string, any>
  ): Promise<{ success: boolean; section: string; saved: boolean }> {
    const res = await callMatrimonyFunction<{ success: boolean; section: string; saved: boolean }>(
      'saveMatrimonyDraft',
      { section, data }
    );
    invalidateCache({ registration: true, status: true, matches: true });
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
    invalidateCache({
      registration: true,
      status: true,
      matches: true,
      interestsHub: true,
      chatContacts: true,
    });
    return res;
  },

  async getAdminDashboard(): Promise<{ success: boolean; counts: AdminMatrimonyCounts }> {
    return callMatrimonyFunction<{ success: boolean; counts: AdminMatrimonyCounts }>(
      'getMatrimonyAdminDashboard',
      {}
    );
  },

  async getAdminProfiles(
    status: 'pending' | 'approved' | 'rejected' | 'inactive' | 'reported' | 'draft' | 'all' = 'pending'
  ): Promise<{
    success: boolean;
    profiles: AdminMatrimonyProfileSummary[];
    counts?: AdminMatrimonyCounts;
  }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      profiles: AdminMatrimonyProfileSummary[];
      counts?: AdminMatrimonyCounts;
    }>('getMatrimonyPendingProfiles', { status });

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
    }>('deleteMatrimonyProfile', {
      targetUid,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    });
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

  async getMatches(
    params: GetMatchesParams = {},
    options: FetchCacheOptions = {}
  ): Promise<GetMatrimonyMatchesResponse> {
    const s = getStore();
    const cacheKey = stableMatchesKey(params);
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    const cached = s.matchesByKey.get(cacheKey);
    if (!options.force && isEntryFresh(cached, maxAge) && cached) {
      s.lastMatchesKey = cacheKey;
      return cached.data;
    }
    const inflightKey = `getMatches:${cacheKey}`;
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      const res = await callMatrimonyFunction<GetMatrimonyMatchesResponse>('getMatrimonyMatches', params);
      s.matchesByKey.set(cacheKey, { data: res, fetchedAt: Date.now() });
      s.lastMatchesKey = cacheKey;
      prefetchImageUrls([
        res.viewerPhoto,
        ...(res.matches || []).slice(0, 12).map((m) => m.signedProfilePhoto),
      ]);
      persistSnapshotToDisk();
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
      invalidateCache({ matches: true });
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
    invalidateCache({ matches: true, interestsHub: true });
    return res;
  },

  async dismissMatch(targetUid: string): Promise<{ success: boolean; dismissed: boolean }> {
    const res = await callMatrimonyFunction<{ success: boolean; dismissed: boolean }>(
      'dismissMatrimonyMatch',
      { targetUid }
    );
    const s = getStore();
    s.matchesByKey.forEach((entry) => {
      if (entry.data?.matches) {
        entry.data = {
          ...entry.data,
          matches: entry.data.matches.filter((m) => m.uid !== targetUid),
        };
      }
    });
    invalidateCache({ matches: true });
    return res;
  },

  async restoreDismissedMatches(
    targetUid?: string
  ): Promise<{ success: boolean; restoredCount: number }> {
    const res = await callMatrimonyFunction<{ success: boolean; restoredCount: number }>(
      'restoreMatrimonyMatches',
      targetUid ? { targetUid } : {}
    );
    invalidateCache({ matches: true });
    return res;
  },

  async sendInterest(
    targetUid: string
  ): Promise<{ success: boolean; interestStatus: string; isMutual: boolean }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      interestStatus: string;
      isMutual: boolean;
    }>('sendMatrimonyInterest', { targetUid });
    invalidateCache({ matches: true, interestsHub: true, chatContacts: res.isMutual });
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
    invalidateCache({ matches: true, interestsHub: true, chatContacts: action === 'accept' });
    return res;
  },

  async ensureChatRoom(targetUid: string): Promise<{
    success: boolean;
    roomId: string;
    peer: MatrimonyChatPeer;
    self: { uid: string; displayName: string; signedProfilePhoto: string | null };
  }> {
    return callMatrimonyFunction('ensureMatrimonyChatRoom', { targetUid });
  },

  async getChatContacts(options: FetchCacheOptions = {}): Promise<ChatContactsResponse> {
    const s = getStore();
    const maxAge = options.maxAgeMs ?? DEFAULT_CACHE_TTL_MS;
    if (!options.force && isEntryFresh(s.chatContacts, maxAge) && s.chatContacts) {
      return s.chatContacts.data;
    }
    const inflightKey = 'getChatContacts';
    const existing = s.inflight.get(inflightKey);
    if (existing) return existing;

    const req = (async () => {
      const res = await callMatrimonyFunction<ChatContactsResponse>('getMatrimonyChatContacts', {});
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

  async uploadChatImage(localUri: string, mimeType = 'image/jpeg'): Promise<string> {
    const { signedUrl } = await uploadDirectToStorage(localUri, mimeType, false);
    return signedUrl;
  },

  async createUpgradeOrder(plan: 'silver' | 'gold' | 'platinum'): Promise<{
    success: boolean;
    orderId: string;
    amount: number;
    amountInr: number;
    currency: string;
    keyId: string;
    plan: 'silver' | 'gold' | 'platinum';
    planName: string;
  }> {
    return callMatrimonyFunction('createMatrimonyUpgradeOrder', { plan });
  },

  async verifyUpgradePayment(payload: {
    plan: 'silver' | 'gold' | 'platinum';
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }): Promise<{ success: boolean; membership: MatrimonyMembershipInfo }> {
    const res = await callMatrimonyFunction<{
      success: boolean;
      membership: MatrimonyMembershipInfo;
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
      invalidateCache({ registration: true, status: true, matches: true });
    }
    return res;
  },
};
