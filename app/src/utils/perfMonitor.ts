import { InteractionManager } from 'react-native';

export type PerfSource = 'ram' | 'disk' | 'network' | 'static';

export interface ScreenPerfMetric {
  routeName: string;
  lastOpenMs: number;
  lastColdMs: number | null;
  lastCachedMs: number | null;
  lastSource: PerfSource;
  lastApiMs: number;
  lastQueryCount: number;
  lastImageMs: number;
  visits: number;
  updatedAt: number;
}

interface ActiveTransition {
  routeName: string;
  startedAt: number;
}

const SCREEN_METRICS = new Map<string, ScreenPerfMetric>();
const API_TIMINGS = new Map<string, { calls: number; totalMs: number; maxMs: number; lastMs: number }>();
let activeTransition: ActiveTransition | null = null;
let pendingHandle: { cancel?: () => void } | null = null;

function nowMs(): number {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }
  return Date.now();
}

function getOrCreateMetric(routeName: string): ScreenPerfMetric {
  let existing = SCREEN_METRICS.get(routeName);
  if (!existing) {
    existing = {
      routeName,
      lastOpenMs: 0,
      lastColdMs: null,
      lastCachedMs: null,
      lastSource: 'static',
      lastApiMs: 0,
      lastQueryCount: 0,
      lastImageMs: 0,
      visits: 0,
      updatedAt: Date.now(),
    };
    SCREEN_METRICS.set(routeName, existing);
  }
  return existing;
}

export const perfMonitor = {
  /**
   * Called from NavigationContainer.onStateChange when active route changes.
   */
  startRouteTransition(routeName: string): void {
    if (!routeName) return;
    pendingHandle?.cancel?.();
    const startedAt = nowMs();
    activeTransition = { routeName, startedAt };

    pendingHandle = InteractionManager.runAfterInteractions(() => {
      if (!activeTransition || activeTransition.routeName !== routeName) return;
      const openMs = Math.max(0, Math.round(nowMs() - startedAt));
      const metric = getOrCreateMetric(routeName);
      metric.lastOpenMs = openMs;
      metric.visits += 1;
      metric.updatedAt = Date.now();
      if (__DEV__) {
        console.log(`[PERF] Route ${routeName} interactive in ${openMs}ms (visit #${metric.visits})`);
      }
      activeTransition = null;
    });
  },

  /**
   * Called by instantCache / screen data loaders to distinguish cached vs cold network completion.
   */
  recordScreenLoad(
    screenName: string,
    info: { source: PerfSource; totalMs: number; apiMs?: number; queryCount?: number }
  ): void {
    const metric = getOrCreateMetric(screenName);
    const rounded = Math.max(0, Math.round(info.totalMs));
    metric.lastSource = info.source;
    if (info.source === 'ram' || info.source === 'disk') {
      metric.lastCachedMs = rounded;
    } else if (info.source === 'network') {
      metric.lastColdMs = rounded;
    }
    if (typeof info.apiMs === 'number') {
      metric.lastApiMs = Math.max(0, Math.round(info.apiMs));
    }
    if (typeof info.queryCount === 'number') {
      metric.lastQueryCount = info.queryCount;
    }
    metric.updatedAt = Date.now();
    if (__DEV__) {
      console.log(
        `[PERF] ${screenName} (${info.source}) total=${rounded}ms api=${metric.lastApiMs}ms queries=${metric.lastQueryCount}`
      );
    }
  },

  /**
   * Records backend/Firestore query timing outside of screens.
   */
  recordApiCall(label: string, durationMs: number): void {
    const ms = Math.max(0, Math.round(durationMs));
    const entry = API_TIMINGS.get(label) || { calls: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
    entry.calls += 1;
    entry.totalMs += ms;
    entry.lastMs = ms;
    if (ms > entry.maxMs) entry.maxMs = ms;
    API_TIMINGS.set(label, entry);
  },

  /**
   * Records image decode/load completion timing on active route.
   */
  recordImageLoad(durationMs: number): void {
    const routeName = activeTransition?.routeName;
    if (!routeName) return;
    const metric = getOrCreateMetric(routeName);
    const ms = Math.max(0, Math.round(durationMs));
    if (ms > metric.lastImageMs) {
      metric.lastImageMs = ms;
    }
  },

  getSummaryRows(): ScreenPerfMetric[] {
    return Array.from(SCREEN_METRICS.values()).sort((a, b) => a.routeName.localeCompare(b.routeName));
  },

  getApiTimings(): Array<{ label: string; calls: number; avgMs: number; maxMs: number; lastMs: number }> {
    return Array.from(API_TIMINGS.entries()).map(([label, v]) => ({
      label,
      calls: v.calls,
      avgMs: Math.round(v.totalMs / Math.max(1, v.calls)),
      maxMs: v.maxMs,
      lastMs: v.lastMs,
    }));
  },

  logSummaryTable(): void {
    const rows = this.getSummaryRows();
    console.log(
      '[PERF_REPORT]',
      JSON.stringify({
        screens: rows,
        apis: this.getApiTimings(),
      })
    );
  },

  clearMetrics(): void {
    pendingHandle?.cancel?.();
    activeTransition = null;
    SCREEN_METRICS.clear();
    API_TIMINGS.clear();
  },
};

// Expose quick Metro/DevTools inspection hook
(globalThis as any).__RHEMA_PERF_REPORT__ = () => {
  perfMonitor.logSummaryTable();
  return perfMonitor.getSummaryRows();
};
