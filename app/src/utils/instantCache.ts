import AsyncStorage from '@react-native-async-storage/async-storage';
import { perfMonitor } from './perfMonitor';

interface MemoryCacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const MEMORY_CACHE = new Map<string, MemoryCacheEntry<any>>();
const IN_FLIGHT_FETCHES = new Map<string, Promise<any>>();
const CACHE_STORAGE_PREFIX = '@rhema_instant_v1_';

function sanitizeScopePart(val?: string | null, fallback = 'anon'): string {
  const cleaned = String(val || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || fallback;
}

/**
 * Builds a tenant- and user-isolated cache key so church or account switches
 * can never expose another church's or member's cached content.
 */
export function makeScopedCacheKey(
  feature: string,
  churchId?: string | null,
  uid?: string | null,
  suffix?: string | number | null
): string {
  const base = `${sanitizeScopePart(feature, 'cache')}_c_${sanitizeScopePart(churchId, 'rhema')}_u_${sanitizeScopePart(uid, 'guest')}`;
  return suffix !== undefined && suffix !== null && String(suffix).trim() !== ''
    ? `${base}_${sanitizeScopePart(String(suffix), '')}`
    : base;
}

/**
 * Synchronous in-memory cache read for zero-frame-delay initial React state.
 */
export function getInstantMemory<T>(key: string, maxAgeMs?: number): T | null {
  const entry = MEMORY_CACHE.get(key);
  if (!entry) return null;
  if (typeof maxAgeMs === 'number' && maxAgeMs > 0 && Date.now() - entry.fetchedAt > maxAgeMs) {
    return null;
  }
  return entry.data as T;
}

/**
 * Returns timestamp of the last successful cache write in memory, if available.
 */
export function getInstantMemoryAgeMs(key: string): number {
  const entry = MEMORY_CACHE.get(key);
  if (!entry) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - entry.fetchedAt);
}

/**
 * Reads cached value from memory first, then AsyncStorage.
 */
export async function readInstantCache<T>(
  key: string,
  maxAgeMs?: number
): Promise<{ data: T; fetchedAt: number; isStale: boolean } | null> {
  const mem = MEMORY_CACHE.get(key);
  if (mem) {
    const age = Date.now() - mem.fetchedAt;
    const isStale = typeof maxAgeMs === 'number' && maxAgeMs > 0 ? age > maxAgeMs : false;
    return { data: mem.data as T, fetchedAt: mem.fetchedAt, isStale };
  }

  try {
    const raw = await AsyncStorage.getItem(`${CACHE_STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MemoryCacheEntry<T>;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || parsed.data === undefined) {
      return null;
    }
    MEMORY_CACHE.set(key, parsed);
    const age = Date.now() - parsed.fetchedAt;
    const isStale = typeof maxAgeMs === 'number' && maxAgeMs > 0 ? age > maxAgeMs : false;
    return { data: parsed.data, fetchedAt: parsed.fetchedAt, isStale };
  } catch {
    return null;
  }
}

/**
 * Stores data in both RAM and AsyncStorage so both tab switches and cold boots open instantaneously.
 */
export async function writeInstantCache<T>(key: string, data: T): Promise<void> {
  const entry: MemoryCacheEntry<T> = {
    data,
    fetchedAt: Date.now(),
  };
  MEMORY_CACHE.set(key, entry);
  try {
    await AsyncStorage.setItem(`${CACHE_STORAGE_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    // Non-fatal: RAM cache remains valid even if AsyncStorage write quota is full.
  }
}

/**
 * Removes an entry from both RAM and persistent storage.
 */
export async function removeInstantCache(key: string): Promise<void> {
  MEMORY_CACHE.delete(key);
  try {
    await AsyncStorage.removeItem(`${CACHE_STORAGE_PREFIX}${key}`);
  } catch {
    // Ignore storage cleanup errors.
  }
}

/**
 * Clears all instant caches in memory and persistent storage (useful on sign-out / church switch).
 */
export async function clearAllInstantCaches(): Promise<void> {
  MEMORY_CACHE.clear();
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const scopedKeys = allKeys.filter((k) => k.startsWith(CACHE_STORAGE_PREFIX));
    if (scopedKeys.length > 0) {
      await AsyncStorage.multiRemove(scopedKeys);
    }
  } catch {
    // Ignore storage cleanup errors.
  }
}

export interface StaleWhileRevalidateOptions<T> {
  key: string;
  fetcher: () => Promise<T>;
  onCached?: (data: T) => void;
  onFresh?: (data: T) => void;
  maxAgeMs?: number;
  freshSkipMs?: number;
  forceRefresh?: boolean;
  screenName?: string;
}

/**
 * Stale-While-Revalidate loader:
 * 1. Emits RAM/disk cache immediately (0ms perceived load) via `onCached`.
 * 2. Deduplicates concurrent network calls for the same key.
 * 3. Fetches fresh data in the background and persists + emits via `onFresh`.
 */
async function loadWithInstantCacheImpl<T>({
  key,
  fetcher,
  onCached,
  onFresh,
  maxAgeMs,
  freshSkipMs = 0,
  forceRefresh = false,
  screenName,
}: StaleWhileRevalidateOptions<T>): Promise<T> {
  let hasDeliveredCached = false;
  const startedAt = Date.now();

  if (!forceRefresh) {
    const hasRam = MEMORY_CACHE.has(key);
    const cached = await readInstantCache<T>(key, maxAgeMs);
    if (cached) {
      onCached?.(cached.data);
      hasDeliveredCached = true;
      if (screenName) {
        perfMonitor.recordScreenLoad(screenName, {
          source: hasRam ? 'ram' : 'disk',
          totalMs: Date.now() - startedAt,
        });
      }
      const age = Date.now() - cached.fetchedAt;
      if (freshSkipMs > 0 && age < freshSkipMs) {
        return cached.data;
      }
    }
  }

  let pending = IN_FLIGHT_FETCHES.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = fetcher().finally(() => {
      IN_FLIGHT_FETCHES.delete(key);
    });
    IN_FLIGHT_FETCHES.set(key, pending);
  }

  try {
    const netStart = Date.now();
    const fresh = await pending;
    MEMORY_CACHE.set(key, { data: fresh, fetchedAt: Date.now() });
    onFresh?.(fresh);
    // Persist to AsyncStorage in background so large lists (e.g. 600+ members) never block UI paint
    setTimeout(() => {
      writeInstantCache(key, fresh).catch(() => {});
    }, 0);
    if (screenName) {
      perfMonitor.recordScreenLoad(screenName, {
        source: 'network',
        totalMs: Date.now() - startedAt,
        apiMs: Date.now() - netStart,
      });
    }
    return fresh;
  } catch (err) {
    if (hasDeliveredCached) {
      // Keep UI functional with already-rendered cached content instead of failing loudly.
      const fallback = getInstantMemory<T>(key);
      if (fallback !== null) return fallback;
    }
    throw err;
  }
}

export async function readScopedPersonalNotes<T = any>(
  churchId?: string | null,
  uid?: string | null
): Promise<T[]> {
  const key = makeScopedCacheKey('sermon_personal_notes_v2', churchId, uid);
  const mem = getInstantMemory<T[]>(key);
  if (Array.isArray(mem)) return mem;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        writeInstantCache(key, parsed).catch(() => {});
        return parsed;
      }
    }
    const legacy = await AsyncStorage.getItem('@SermonPersonalNotes');
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      if (Array.isArray(parsedLegacy)) {
        AsyncStorage.setItem(key, legacy).catch(() => {});
        writeInstantCache(key, parsedLegacy).catch(() => {});
        return parsedLegacy;
      }
    }
  } catch {
    // Non-fatal
  }
  return [];
}

export async function appendScopedPersonalNote<T = any>(
  churchId: string | null | undefined,
  uid: string | null | undefined,
  note: T
): Promise<T[]> {
  const key = makeScopedCacheKey('sermon_personal_notes_v2', churchId, uid);
  const existing = await readScopedPersonalNotes<T>(churchId, uid);
  const updated = [note, ...existing];
  writeInstantCache(key, updated).catch(() => {});
  await AsyncStorage.setItem(key, JSON.stringify(updated));
  return updated;
}

export async function readScopedBibleProgress(
  churchId?: string | null,
  uid?: string | null
): Promise<string[]> {
  const key = makeScopedCacheKey('bible_read_progress_v1', churchId, uid);
  const mem = getInstantMemory<string[]>(key);
  if (Array.isArray(mem)) return mem;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        writeInstantCache(key, parsed).catch(() => {});
        return parsed;
      }
    }
    const legacy = await AsyncStorage.getItem('@BibleReadProgress');
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      if (Array.isArray(parsedLegacy)) {
        AsyncStorage.setItem(key, legacy).catch(() => {});
        writeInstantCache(key, parsedLegacy).catch(() => {});
        return parsedLegacy;
      }
    }
  } catch {
    // Non-fatal
  }
  return [];
}

export async function writeScopedBibleProgress(
  churchId: string | null | undefined,
  uid: string | null | undefined,
  progress: string[]
): Promise<void> {
  const key = makeScopedCacheKey('bible_read_progress_v1', churchId, uid);
  writeInstantCache(key, progress).catch(() => {});
  await AsyncStorage.setItem(key, JSON.stringify(progress));
}

export async function readScopedDeletedNotifIds(
  churchId?: string | null,
  uid?: string | null
): Promise<string[]> {
  const key = makeScopedCacheKey('deleted_notification_ids_v1', churchId, uid);
  const mem = getInstantMemory<string[]>(key);
  if (Array.isArray(mem)) return mem;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        writeInstantCache(key, parsed).catch(() => {});
        return parsed;
      }
    }
    const legacy = await AsyncStorage.getItem('@deleted_notification_ids');
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      if (Array.isArray(parsedLegacy)) {
        AsyncStorage.setItem(key, legacy).catch(() => {});
        writeInstantCache(key, parsedLegacy).catch(() => {});
        return parsedLegacy;
      }
    }
  } catch {
    // Non-fatal
  }
  return [];
}

export async function writeScopedDeletedNotifIds(
  churchId: string | null | undefined,
  uid: string | null | undefined,
  ids: string[]
): Promise<void> {
  const key = makeScopedCacheKey('deleted_notification_ids_v1', churchId, uid);
  writeInstantCache(key, ids).catch(() => {});
  await AsyncStorage.setItem(key, JSON.stringify(ids));
}

export interface PositionalInstantCacheOptions {
  /** Max cache age before cached data is treated as stale (still shown, then refreshed). */
  ttlMs?: number;
  /** Skip network entirely when cached data is younger than this. */
  freshSkipMs?: number;
  /** Bypass cache read and always fetch. */
  force?: boolean;
  screenName?: string;
}

/**
 * Stale-while-revalidate loader.
 * - Object form: loadWithInstantCache({ key, fetcher, onCached, onFresh, ... })
 * - Positional form: loadWithInstantCache(key, fetcher, onData, { ttlMs, freshSkipMs, force })
 *   where onData receives both cached and fresh payloads.
 */
export function loadWithInstantCache<T>(options: StaleWhileRevalidateOptions<T>): Promise<T>;
export function loadWithInstantCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  onData: (data: T) => void,
  opts?: PositionalInstantCacheOptions
): Promise<T>;
export function loadWithInstantCache<T>(
  keyOrOptions: string | StaleWhileRevalidateOptions<T>,
  fetcher?: () => Promise<T>,
  onData?: (data: T) => void,
  opts: PositionalInstantCacheOptions = {}
): Promise<T> {
  if (typeof keyOrOptions !== 'string') {
    return loadWithInstantCacheImpl<T>(keyOrOptions);
  }
  return loadWithInstantCacheImpl<T>({
    key: keyOrOptions,
    fetcher: fetcher as () => Promise<T>,
    onCached: onData,
    onFresh: onData,
    maxAgeMs: opts.ttlMs,
    freshSkipMs: opts.freshSkipMs ?? 0,
    forceRefresh: opts.force ?? false,
    screenName: opts.screenName,
  } as StaleWhileRevalidateOptions<T>);
}
