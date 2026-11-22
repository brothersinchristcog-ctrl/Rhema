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
