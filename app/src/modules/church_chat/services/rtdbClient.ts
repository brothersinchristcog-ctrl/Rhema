import nativeAuth from '@react-native-firebase/auth';
import type { Database } from 'firebase/database';
import { webApp } from '../../../services/firebaseWebConfig';

export const RHEMA_RTDB_URL =
  process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ||
  'https://rhema-global-ministries-default-rtdb.firebaseio.com';

let _rtdbInstance: Database | null = null;

/**
 * Returns a Firebase Realtime Database instance authenticated via the native
 * `@react-native-firebase/auth` user session.
 */
export function getChatRtdb(): Database {
  if (_rtdbInstance) return _rtdbInstance;

  const rtdbSdk = require('firebase/database') as typeof import('firebase/database') & {
    _initStandalone?: (opts: any) => Database;
  };
  try {
    rtdbSdk.forceWebSockets();
  } catch {
    // Already initialized
  }

  const tokenListeners = new Map<(token: string | null) => void, () => void>();
  const customAuthImpl = {
    getUid: () => nativeAuth().currentUser?.uid || null,
    getToken: async (forceRefresh?: boolean) => {
      const user = nativeAuth().currentUser;
      if (!user) return null;
      const accessToken = await user.getIdToken(Boolean(forceRefresh));
      return { accessToken };
    },
    addAuthTokenListener: (listener: (token: string | null) => void) => {
      const unsub = nativeAuth().onIdTokenChanged(async (user) => {
        if (!user) {
          listener(null);
          return;
        }
        try {
          const token = await user.getIdToken(false);
          listener(token);
        } catch {
          listener(null);
        }
      });
      tokenListeners.set(listener, unsub);
    },
    removeAuthTokenListener: (listener: (token: string | null) => void) => {
      const unsub = tokenListeners.get(listener);
      if (unsub) {
        unsub();
        tokenListeners.delete(listener);
      }
    },
  };

  if (typeof rtdbSdk._initStandalone === 'function') {
    _rtdbInstance = rtdbSdk._initStandalone({
      app: webApp,
      url: RHEMA_RTDB_URL,
      version: '12.18.0',
      customAuthImpl,
      nodeAdmin: false,
    });
  } else {
    _rtdbInstance = rtdbSdk.getDatabase(webApp, RHEMA_RTDB_URL);
  }

  return _rtdbInstance;
}

/**
 * Recursively strips `undefined` fields and array elements before writing to
 * Firebase Realtime Database, while preserving `null` (RTDB delete/unset) and
 * RTDB server sentinels (`serverTimestamp()`, `increment()`).
 */
export function sanitizeForRtdb<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForRtdb(item))
      .filter((item) => item !== undefined) as unknown as T;
  }

  if (Object.prototype.hasOwnProperty.call(value, '.sv')) {
    return value;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) {
    return value;
  }

  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(value as Record<string, any>)) {
    if (val === undefined) continue;
    const nextVal = sanitizeForRtdb(val);
    if (nextVal !== undefined) {
      cleaned[key] = nextVal;
    }
  }
  return cleaned as T;
}

/**
 * Performs a Firebase Realtime Database `update` after stripping `undefined`
 * values via `sanitizeForRtdb`.
 */
export function updateRtdb(
  targetRef: Parameters<typeof import('firebase/database').update>[0],
  values: object
): Promise<void> {
  const { update } = require('firebase/database') as typeof import('firebase/database');
  return update(targetRef, sanitizeForRtdb(values));
}

/**
 * Performs a Firebase Realtime Database `set` after stripping `undefined`
 * values via `sanitizeForRtdb`.
 */
export function setRtdb(
  targetRef: Parameters<typeof import('firebase/database').set>[0],
  value: unknown
): Promise<void> {
  const { set } = require('firebase/database') as typeof import('firebase/database');
  return set(targetRef, sanitizeForRtdb(value));
}
