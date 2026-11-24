/**
 * Lightweight performance tracer for Rhema Matrimony.
 * Records screen load times, RPC durations, image/cache events, and button latencies
 * without requiring a native rebuild, and optionally forwards traces to
 * @react-native-firebase/perf when available in native builds.
 */

export interface MatrimonyPerfEvent {
  name: string;
  durationMs: number;
  ok: boolean;
  timestamp: number;
  meta?: Record<string, string | number | boolean | null | undefined>;
}

interface MetricAggregate {
  count: number;
  failures: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
  samples: number[];
}

const MAX_EVENTS = 120;
const MAX_SAMPLES_PER_METRIC = 40;
const SLOW_THRESHOLD_MS = 450;

const eventsBuffer: MatrimonyPerfEvent[] = [];
const aggregates = new Map<string, MetricAggregate>();

let nativePerfFactory: (() => { newTrace: (name: string) => any }) | null | undefined = undefined;

function getNativePerf(): (() => { newTrace: (name: string) => any }) | null {
  if (nativePerfFactory !== undefined) return nativePerfFactory;
  try {
    // Optional native integration: active only when @react-native-firebase/perf is linked
    const mod = require('@react-native-firebase/perf');
    nativePerfFactory = typeof mod?.default === 'function' ? mod.default : null;
  } catch {
    nativePerfFactory = null;
  }
  return nativePerfFactory;
}

function nowMs(): number {
  if (typeof globalThis?.performance?.now === 'function') {
    return globalThis.performance.now();
  }
  return Date.now();
}

function recordInternal(
  name: string,
  durationMs: number,
  ok: boolean,
  meta?: Record<string, string | number | boolean | null | undefined>
): void {
  const roundedMs = Math.max(0, Math.round(durationMs));
  const event: MatrimonyPerfEvent = {
    name,
    durationMs: roundedMs,
    ok,
    timestamp: Date.now(),
    ...(meta ? { meta } : {}),
  };

  eventsBuffer.push(event);
  if (eventsBuffer.length > MAX_EVENTS) {
    eventsBuffer.shift();
  }

  let agg = aggregates.get(name);
  if (!agg) {
    agg = {
      count: 0,
      failures: 0,
      totalMs: 0,
      minMs: roundedMs,
      maxMs: roundedMs,
      lastMs: roundedMs,
      samples: [],
    };
    aggregates.set(name, agg);
  }

  agg.count += 1;
  if (!ok) agg.failures += 1;
  agg.totalMs += roundedMs;
  agg.minMs = Math.min(agg.minMs, roundedMs);
  agg.maxMs = Math.max(agg.maxMs, roundedMs);
  agg.lastMs = roundedMs;
  agg.samples.push(roundedMs);
  if (agg.samples.length > MAX_SAMPLES_PER_METRIC) {
    agg.samples.shift();
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__ && (roundedMs >= SLOW_THRESHOLD_MS || !ok)) {
    const metaText = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[MatrimonyPerf] ${name}: ${roundedMs}ms (${ok ? 'ok' : 'err'})${metaText}`);
  }
}

export interface ActiveTrace {
  stop: (
    ok?: boolean,
    extraMeta?: Record<string, string | number | boolean | null | undefined>
  ) => number;
}

export const matrimonyPerf = {
  startTrace(
    name: string,
    initialMeta?: Record<string, string | number | boolean | null | undefined>
  ): ActiveTrace {
    const startedAt = nowMs();
    let stopped = false;

    let nativeTrace: any = null;
    const perfFn = getNativePerf();
    if (perfFn) {
      try {
        nativeTrace = perfFn().newTrace(`matrimony_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`);
        if (initialMeta) {
          Object.entries(initialMeta).forEach(([k, v]) => {
            if (v !== undefined && v !== null) {
              nativeTrace.putAttribute?.(k.slice(0, 40), String(v).slice(0, 100));
            }
          });
        }
        nativeTrace.start?.().catch?.(() => {});
      } catch {
        nativeTrace = null;
      }
    }

    return {
      stop: (ok = true, extraMeta) => {
        if (stopped) return 0;
        stopped = true;
        const durationMs = Math.max(0, nowMs() - startedAt);
        const mergedMeta =
          initialMeta || extraMeta ? { ...(initialMeta || {}), ...(extraMeta || {}) } : undefined;
        recordInternal(name, durationMs, ok, mergedMeta);
        if (nativeTrace) {
          try {
            if (extraMeta) {
              Object.entries(extraMeta).forEach(([k, v]) => {
                if (typeof v === 'number') {
                  nativeTrace.putMetric?.(k.slice(0, 40), Math.round(v));
                } else if (v !== undefined && v !== null) {
                  nativeTrace.putAttribute?.(k.slice(0, 40), String(v).slice(0, 100));
                }
              });
            }
            nativeTrace.stop?.().catch?.(() => {});
          } catch {
            // Ignore native trace stop errors
          }
        }
        return Math.round(durationMs);
      },
    };
  },

  recordMetric(
    name: string,
    durationMs: number,
    ok = true,
    meta?: Record<string, string | number | boolean | null | undefined>
  ): void {
    recordInternal(name, durationMs, ok, meta);
  },

  getRecentEvents(): MatrimonyPerfEvent[] {
    return [...eventsBuffer];
  },

  getSummary(): Record<
    string,
    { count: number; failures: number; avgMs: number; p95Ms: number; minMs: number; maxMs: number; lastMs: number }
  > {
    const out: Record<string, any> = {};
    aggregates.forEach((agg, key) => {
      const sorted = [...agg.samples].sort((a, b) => a - b);
      const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      out[key] = {
        count: agg.count,
        failures: agg.failures,
        avgMs: agg.count > 0 ? Math.round(agg.totalMs / agg.count) : 0,
        p95Ms: sorted.length > 0 ? sorted[p95Idx] : 0,
        minMs: agg.minMs,
        maxMs: agg.maxMs,
        lastMs: agg.lastMs,
      };
    });
    return out;
  },

  reset(): void {
    eventsBuffer.length = 0;
    aggregates.clear();
  },
};
