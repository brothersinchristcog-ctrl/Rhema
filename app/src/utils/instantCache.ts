import AsyncStorage from '@react-native-async-storage/async-storage';

interface MemoryCacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const MEMORY_CACHE = new Map<string, MemoryCacheEntry<any>>();
const IN_FLIGHT_FETCHES = new Map<string, Promise<any>>();
const CACHE_STORAGE_PREFIX = '@rhema_instant_v1_';

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
}

/**
 * Stale-While-Revalidate loader:
 * 1. Emits RAM/disk cache immediately (0ms perceived load) via `onCached`.
 * 2. Deduplicates concurrent network calls for the same key.
 * 3. Fetches fresh data in the background and persists + emits via `onFresh`.
 */
export async function loadWithInstantCache<T>({
  key,
  fetcher,
  onCached,
  onFresh,
  maxAgeMs,
  freshSkipMs = 0,
  forceRefresh = false,
}: StaleWhileRevalidateOptions<T>): Promise<T> {
  let hasDeliveredCached = false;

  if (!forceRefresh) {
    const cached = await readInstantCache<T>(key, maxAgeMs);
    if (cached) {
      onCached?.(cached.data);
      hasDeliveredCached = true;
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
    const fresh = await pending;
    await writeInstantCache(key, fresh);
    onFresh?.(fresh);
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
