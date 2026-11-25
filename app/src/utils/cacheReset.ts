import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearAllInstantCaches } from './instantCache';
import { perfMonitor } from './perfMonitor';

type ResetHook = () => void | Promise<void>;
const HOME_RESET_HOOKS = new Set<ResetHook>();

export function registerHomeCacheReset(hook: ResetHook): () => void {
  HOME_RESET_HOOKS.add(hook);
  return () => {
    HOME_RESET_HOOKS.delete(hook);
  };
}

const LOGOUT_SCOPED_STORAGE_KEYS = [
  '@cached_church_id',
  '@active_church_id',
  '@cached_daily_promise',
  '@deleted_notification_ids',
  '@SermonPersonalNotes',
  '@BibleReadProgress',
  '@BiblePlansProgress',
  '@rhema_verses_cache',
  '@rhema_verses_meta',
  '@songs_cache',
  'cog_my_songbook_ids',
  '@rhema_youtube_subscribed',
  '@rhema_live_celebrations_pos',
  '@live_celebrations_pos',
];

/**
 * Safely clears all in-memory and persistent member/church caches so logging out,
 * switching accounts, or switching churches never leaks stale or private data.
 */
export async function resetAllClientCaches(
  reason: 'logout' | 'account_switch' | 'church_switch'
): Promise<void> {
  // Run synchronous in-memory clears first
  for (const hook of HOME_RESET_HOOKS) {
    try {
      await hook();
    } catch {
      // Ignore hook errors
    }
  }

  try {
    require('../services/FirestoreService').default?.clearMemberCaches?.();
  } catch {}
  try {
    require('../services/QuizService').QuizService?.clearCache?.();
  } catch {}
  try {
    require('../services/AttendanceService').default?.clearCache?.();
  } catch {}
  try {
    require('../services/TestimonyService').default?.clearCache?.();
  } catch {}
  try {
    require('../services/BibleQuizBank').BibleQuizBank?.clearProgressCache?.();
  } catch {}
  try {
    require('../modules/church_chat/services/rhemaDirectoryService').rhemaDirectoryService?.clearCache?.();
  } catch {}
  try {
    require('../modules/matrimony/services/matrimonyApi').matrimonyApi?.clearAllCaches?.();
  } catch {}

  if (reason === 'logout' || reason === 'account_switch') {
    try {
      require('../services/roomKeyManager').roomKeyManager?.clearCache?.();
    } catch {}
    try {
      require('../services/e2eeService').e2eeService?.clearSessionMemory?.();
    } catch {}
    try {
      require('../components/CachedImage').clearCachedImages?.();
    } catch {}
    perfMonitor.clearMetrics();
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const dynamicUserPrefixes = [
        'sermon_personal_notes_v2_c_',
        'bible_read_progress_v1_c_',
        'deleted_notification_ids_v1_c_',
        '@BiblePlansProgress_',
        '@cog_my_songbook_ids_',
        '@rhema_youtube_subscribed_',
        '@rhema_sermon_sub_',
        '@notifications_cleared_at_',
        '@read_job_notif_ids_',
        '@attended_events_',
      ];
      const prefixMatches = allKeys.filter((k) =>
        dynamicUserPrefixes.some((p) => k.startsWith(p))
      );
      const keysToRemove = Array.from(new Set([...LOGOUT_SCOPED_STORAGE_KEYS, ...prefixMatches]));
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
    } catch {}
  }

  await clearAllInstantCaches().catch(() => {});
}
