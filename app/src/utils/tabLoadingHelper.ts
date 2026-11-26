const LOADED_TAB_KEYS = new Set<string>(['Home', 'MatrimonyHome']);
const DEFAULT_IN_FLIGHT_STALE_MS = 15000;

/**
 * Tracks whether a lazy bottom tab route has already been mounted/loaded once,
 * preventing redundant loading indicators or frame delays on subsequent switches.
 */
export function isTabRouteLoaded(tabKey: string): boolean {
  return LOADED_TAB_KEYS.has(tabKey);
}

export function markTabRouteLoaded(tabKey: string): void {
  if (tabKey) {
    LOADED_TAB_KEYS.add(tabKey);
  }
}

export function resetLoadedTabRoutes(): void {
  LOADED_TAB_KEYS.clear();
  LOADED_TAB_KEYS.add('Home');
  LOADED_TAB_KEYS.add('MatrimonyHome');
}

/**
 * Returns true only when initial content is actively loading and no cached/existing
 * data is available to show yet (avoiding flickering & unnecessary spinners).
 */
export function shouldShowTabSpinner(opts: {
  loading: boolean;
  hasData: boolean;
  refreshing?: boolean;
}): boolean {
  return Boolean(opts.loading && !opts.hasData && !opts.refreshing);
}

/**
 * Deduplicates overlapping in-flight tab data fetches.
 */
export function tryAcquireInFlightFetch(
  inFlightMap: Map<string, number>,
  key: string,
  staleMs: number = DEFAULT_IN_FLIGHT_STALE_MS
): boolean {
  const existingStartedAt = inFlightMap.get(key);
  const now = Date.now();
  if (typeof existingStartedAt === 'number' && now - existingStartedAt < staleMs) {
    return false;
  }
  inFlightMap.set(key, now);
  return true;
}

export function releaseInFlightFetch(
  inFlightMap: Map<string, number>,
  key: string
): void {
  inFlightMap.delete(key);
}
