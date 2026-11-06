import { Platform } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { BibleService } from './BibleService';
import { SupportedLanguage } from '../locales';
import { getVerseBackgroundUrl } from '../constants/VerseBackgrounds';

const VERSES_CACHE_KEY = '@rhema_verses_cache';

// Stable notification ID prefix — used to deduplicate / cancel by slot
const NOTIF_ID_PREFIX = 'daily_verse_';

export interface DailyVerse {
  id: string;
  verseEn: string;
  referenceEn: string;
  verseTe: string;
  referenceTe: string;
  verseHi?: string;
  referenceHi?: string;
  verseTa?: string;
  referenceTa?: string;
  verseKn?: string;
  referenceKn?: string;
  verseMl?: string;
  referenceMl?: string;
  verseMr?: string;
  referenceMr?: string;
  translations?: Record<string, { verse: string; reference?: string } | string>;
  index?: number;
  backgroundUrl?: string;
  unsplashPhotographer?: string;
  [key: string]: any;
}

// Fixed epoch date for global synchronization across all phones
// Using UTC midnight to ensure everyone transitions days at roughly the same time (or use local midnight if preferred)
const EPOCH = new Date('2026-10-30T00:00:00Z');

class VerseNotificationService {
  // Mutex: prevents concurrent syncAndSchedule calls (e.g. auth state flicker)
  private isSyncing = false;

  async initialize() {
    console.log('[VerseNotificationService] Initializing...');
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('daily_verse', {
        name: 'Daily Verses',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FCD34D',
      });
    }

    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });

    // 1. Cancel all legacy or locally-scheduled verse notifications to prevent duplicates
    await this.cancelAllScheduledVerseNotifications();

    // 2. Sync verse cache from Firestore for instant offline access
    await this.syncAndSchedule();
  }

  /**
   * Cancel all locally-scheduled verse notifications so that only the server-side
   * Cloud Function dispatches the unified Daily Verse push via FCM.
   */
  async cancelAllScheduledVerseNotifications() {
    try {
      const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of allScheduled) {
        const id = n.identifier || '';
        const dataType = n.content?.data?.type;
        if (id.startsWith(NOTIF_ID_PREFIX) || id.includes('daily_verse') || dataType === 'daily_verse') {
          console.log(`[VerseNotificationService] Cancelling local scheduled verse notification: ${id}`);
          await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[VerseNotificationService] Error cancelling local verse notifications:', e);
    }
  }

  async requestPermissions() {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  }

  /**
   * Invalidate local verses cache so that newly created/updated verses are pulled fresh from Firestore
   */
  async invalidateCache() {
    try {
      await AsyncStorage.removeItem(VERSES_CACHE_KEY);
      await AsyncStorage.removeItem('@rhema_verses_meta');
      await AsyncStorage.removeItem('@rhema_last_sync_timestamp');
      console.log('[VerseNotificationService] Local verses cache successfully invalidated.');
    } catch (e) {
      console.warn('[VerseNotificationService] Error invalidating cache:', e);
    }
  }

  /**
   * Update local cache with newly fetched verses
   */
  async updateCacheWithVerses(verses: DailyVerse[]) {
    try {
      const cacheStr = await AsyncStorage.getItem(VERSES_CACHE_KEY);
      const cache: Record<number, DailyVerse> = cacheStr ? JSON.parse(cacheStr) : {};
      verses.forEach(v => {
        if (v.index !== undefined) {
          cache[v.index] = v;
        }
      });
      await AsyncStorage.setItem(VERSES_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.warn('[VerseNotificationService] Error updating cache with verses:', e);
    }
  }

  /**
   * Calculates which indices a given date needs (Morning, Afternoon, Evening, Night).
   * Aligns 100% with SuperAdminVersesManager and HomeScreen:
   * Today at local midnight is Day 0 (indices 0, 1, 2, 3: Morning, Afternoon, Evening, Night).
   * Future days are offset by +4 per day. Past days wrap smoothly backwards.
   */
  getIndicesForDate(date: Date, totalVerses: number = 5863, churchId: string = 'rhema'): number[] {
    if (totalVerses === 0) return [0, 1, 2, 3];
    
    // Anchor strictly to today at local midnight
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const daysFromToday = Math.round((targetMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
    const base = daysFromToday * 4;
    
    return [
      ((base + 0) % totalVerses + totalVerses) % totalVerses,
      ((base + 1) % totalVerses + totalVerses) % totalVerses,
      ((base + 2) % totalVerses + totalVerses) % totalVerses,
      ((base + 3) % totalVerses + totalVerses) % totalVerses,
    ];
  }

  /**
   * Builds a stable, unique notification identifier for a given date + period slot + language.
   * This ensures that even if syncAndSchedule is called multiple times, the same
   * slot is never duplicated — the OS simply overwrites/ignores the same identifier.
   * Format: daily_verse_YYYY-MM-DD_Morning_en or daily_verse_YYYY-MM-DD_Morning_te
   */
  private getNotifId(date: Date, periodLabel: string, lang: 'en' | 'te' = 'en'): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${NOTIF_ID_PREFIX}${y}-${m}-${d}_${periodLabel}_${lang}`;
  }

  /**
   * Syncs upcoming verses from Firestore into local cache for instantaneous offline access.
   * Cancels all locally-scheduled notifications so only the Google Cloud Scheduler + Cloud Run
   * function dispatches the single unified daily verse push via FCM.
   */
  async syncAndSchedule(churchId: string = 'rhema') {
    // ── Mutex guard: skip if already running ──────────────────────────────────
    if (this.isSyncing) {
      console.log('[VerseNotificationService] Sync already in progress. Skipping duplicate call.');
      return;
    }
    this.isSyncing = true;

    try {
      // 1. Calculate the next 7 days we need to cover
      const today = new Date();
      const targetDates: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        targetDates.push(d);
      }

      // 2. Clean up any legacy AsyncStorage tracking keys from old implementation
      AsyncStorage.multiRemove([
        '@wechristian_scheduled_verses',
        '@wechristian_shown_verses',
        '@wechristian_verses_pool',
      ]).catch(() => {});

      // 3. Cancel all local scheduled verse notifications
      await this.cancelAllScheduledVerseNotifications();

      // 4. Fetch total verses metadata
      const metaDoc = await firestore().collection('daily_verses_meta').doc('metadata').get();
      const metaExists = typeof metaDoc.exists === 'function' ? metaDoc.exists() : metaDoc.exists;
      if (!metaExists) return;
      const mData = metaDoc.data();
      const totalVerses = mData?.totalVerses || 0;
      if (totalVerses === 0) return;

      // 5. Calculate which verse indices are required
      const requiredIndices = new Set<number>();
      for (const d of targetDates) {
        this.getIndicesForDate(d, totalVerses, churchId).forEach(idx => requiredIndices.add(idx));
      }

      // 6. Load cache and fetch any missing verse data or verses missing backgroundUrl
      const cacheStr = await AsyncStorage.getItem(VERSES_CACHE_KEY);
      const cache: Record<number, DailyVerse> = cacheStr ? JSON.parse(cacheStr) : {};

      const missingIndices = Array.from(requiredIndices).filter(idx => !cache[idx] || !cache[idx].backgroundUrl);
      if (missingIndices.length > 0) {
        console.log(`[VerseNotificationService] Fetching ${missingIndices.length} missing verses from Firestore...`);
        for (let i = 0; i < missingIndices.length; i += 10) {
          const batch = missingIndices.slice(i, i + 10);
          const snapshot = await firestore().collection('daily_verses').where('index', 'in', batch).get();
          const docs = snapshot.docs.map(doc => ({ ...(doc.data() as any), id: doc.id } as DailyVerse));
          docs.sort((a, b) => {
            const tA = (a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt || a.createdAt || 0));
            const tB = (b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt || b.createdAt || 0));
            return tA - tB;
          });
          docs.forEach(data => {
            if (data.index !== undefined) {
              cache[data.index] = data;
            }
          });
        }
        await AsyncStorage.setItem(VERSES_CACHE_KEY, JSON.stringify(cache));
      }

      console.log(`[VerseNotificationService] Synced verse cache for ${requiredIndices.size} upcoming slots. Local duplicate notifications disabled.`);

    } catch (error) {
      console.error('[VerseNotificationService] Error syncing verses:', error);
    } finally {
      // Always release the mutex
      this.isSyncing = false;
    }
  }


  /**
   * (Helper) Used by UI when user clicks notification
   */
  async getVerseById(id: string): Promise<DailyVerse | null> {
    try {
      const cacheStr = await AsyncStorage.getItem(VERSES_CACHE_KEY);
      if (cacheStr) {
        const cache: Record<number, DailyVerse> = JSON.parse(cacheStr);
        const found = Object.values(cache).find(v => v.id === id);
        if (found) return found;
      }
      
      // Fallback: Fetch directly from Firestore if not in cache (useful for testing or if cache cleared)
      const doc = await firestore().collection('daily_verses').doc(id).get();
      const docExists = typeof doc.exists === 'function' ? doc.exists() : doc.exists;
      if (docExists) {
        return { ...doc.data(), id: doc.id } as DailyVerse;
      }
    } catch (e) {
      console.log('[VerseNotificationService] Error fetching verse by ID:', e);
    }
    
    return null;
  }

  /**
   * (Helper) Used by the HomeScreen Daily Verse Card — fetches today's verse for a specific period
   */
  async getVerseForDate(date: Date, period: string, forceRefresh: boolean = false): Promise<DailyVerse | null> {
    try {
      // 1. Try cache first if not force refresh
      const cacheStr = await AsyncStorage.getItem(VERSES_CACHE_KEY);
      let totalVerses = 5863;
      try {
        const metaDoc = await firestore().collection('daily_verses_meta').doc('metadata').get();
        const metaExists = typeof metaDoc.exists === 'function' ? metaDoc.exists() : metaDoc.exists;
        if (metaExists) {
          const mData = metaDoc.data();
          totalVerses = mData?.totalVerses || 5863;
        }
      } catch (_) {}

      const periodOrder: Record<string, number> = { Morning: 0, Afternoon: 1, Evening: 2, Night: 3 };
      const periodOffset = periodOrder[period] ?? 0;
      const allIndices = this.getIndicesForDate(date, totalVerses, 'rhema');
      const targetIndex = allIndices[periodOffset];

      if (!forceRefresh && cacheStr) {
        const cache: Record<number, DailyVerse> = JSON.parse(cacheStr);
        if (cache[targetIndex]) {
          if (!cache[targetIndex].backgroundUrl) {
            cache[targetIndex].backgroundUrl = getVerseBackgroundUrl(cache[targetIndex], period, targetIndex);
          }
          return cache[targetIndex];
        }
      }

      // 2. Fetch directly from Firestore by index (getting the latest updated one)
      const snapshot = await firestore().collection('daily_verses').where('index', '==', targetIndex).get();
      if (!snapshot.empty) {
        const docs = snapshot.docs.map(d => ({ ...(d.data() as any), id: d.id } as DailyVerse));
        docs.sort((a, b) => {
          const tA = (a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt || a.createdAt || 0));
          const tB = (b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt || b.createdAt || 0));
          return tB - tA;
        });
        const vData = docs[0];
        if (!vData.backgroundUrl) {
          vData.backgroundUrl = getVerseBackgroundUrl(vData, period, targetIndex);
        }
        try {
          const cache = cacheStr ? JSON.parse(cacheStr) : {};
          cache[targetIndex] = vData;
          await AsyncStorage.setItem(VERSES_CACHE_KEY, JSON.stringify(cache));
        } catch (_) {}
        return vData;
      }
    } catch (e) {
      console.log('[VerseNotificationService] Error in getVerseForDate:', e);
    }
    return null;
  }

  async markVerseAsShown(id: string) {
    // No longer needed as we use deterministic math, but kept for interface compatibility
  }

  /**
   * Synchronously builds initial verses for today + past N days using bundled bulk_verses.json.
   * This executes in < 1ms on JS thread with 0 network calls, allowing the screen
   * to paint instantly without showing any loading spinner or blank page.
   */
  getSynchronousInitialVerses(pastDays: number = 5, churchId: string = 'rhema'): { date: Date, verses: DailyVerse[] }[] {
    try {
      const bundledVerses: any[] = require('../../assets/bulk_verses.json');
      const totalVerses = bundledVerses.length || 5863;
      const today = new Date();
      const results: { date: Date, verses: DailyVerse[] }[] = [];
      const PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'] as const;

      for (let i = 0; i <= pastDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dailyIndices = this.getIndicesForDate(d, totalVerses, churchId);
        const versesForDay: DailyVerse[] = [];
        for (let pIdx = 0; pIdx < 4; pIdx++) {
          const idx = dailyIndices[pIdx];
          const bv = bundledVerses[idx] || {};
          const period = PERIODS[pIdx];
          const bgUrl = bv.backgroundUrl || getVerseBackgroundUrl(bv, period, idx);
          versesForDay.push({
            id: `bundled_${idx}_${pIdx}`,
            index: idx,
            verseEn: bv.verseEn || '',
            verseTe: bv.verseTe || '',
            referenceEn: bv.referenceEn || '',
            referenceTe: bv.referenceTe || '',
            backgroundUrl: bgUrl,
            churchId: 'rhema',
          });
        }
        results.push({ date: d, verses: versesForDay });
      }
      return results;
    } catch (e) {
      console.warn('[VerseNotificationService] Error in getSynchronousInitialVerses:', e);
      return [];
    }
  }

  /**
   * Fetches verses for multiple recent days efficiently (combines cache and batch firestore queries).
   */
  async getRecentVerses(pastDays: number, includeToday: boolean = true, forceRefresh: boolean = false, churchId: string = 'rhema'): Promise<{ date: Date, verses: DailyVerse[] }[]> {
    try {
      let totalVerses = 0;
      const metaCacheStr = await AsyncStorage.getItem('@rhema_verses_meta');
      if (metaCacheStr) {
        totalVerses = parseInt(metaCacheStr, 10);
      }
      
      if (totalVerses === 0 || forceRefresh) {
        try {
          const metaDoc = await firestore().collection('daily_verses_meta').doc('metadata').get();
          const metaExists = typeof metaDoc.exists === 'function' ? metaDoc.exists() : metaDoc.exists;
          if (metaExists) {
            const mData = metaDoc.data();
            totalVerses = mData?.totalVerses || 0;
            await AsyncStorage.setItem('@rhema_verses_meta', totalVerses.toString());
          }
        } catch (mErr) {
          console.warn('[VerseNotificationService] Could not fetch metadata from Firestore:', mErr);
        }
      }
      
      // Fallback: If metadata not available yet or offline, default to 5,863 bundled verses
      if (totalVerses === 0) {
        totalVerses = 5863;
      }

      const today = new Date();
      const targetDates: Date[] = [];
      
      if (includeToday) {
        targetDates.push(new Date(today));
      }
      
      for (let i = 1; i <= pastDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        targetDates.push(d);
      }

      const requiredIndices = new Set<number>();
      for (const d of targetDates) {
        this.getIndicesForDate(d, totalVerses, churchId).forEach(idx => requiredIndices.add(idx));
      }

      const cacheStr = await AsyncStorage.getItem(VERSES_CACHE_KEY);
      const cache: Record<number, DailyVerse> = cacheStr ? JSON.parse(cacheStr) : {};
      
      const missingIndices = forceRefresh 
        ? Array.from(requiredIndices) 
        : Array.from(requiredIndices).filter(idx => !cache[idx]);

      if (missingIndices.length > 0) {
        const batchPromises = [];
        for (let i = 0; i < missingIndices.length; i += 10) {
          const batch = missingIndices.slice(i, i + 10);
          batchPromises.push(
            firestore().collection('daily_verses').where('index', 'in', batch).get()
          );
        }
        
        const snapshots = await Promise.all(batchPromises);
        
        snapshots.forEach(snapshot => {
          const docs = snapshot.docs.map(doc => ({ ...(doc.data() as any), id: doc.id } as DailyVerse));
          docs.sort((a, b) => {
            const tA = (a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt || a.createdAt || 0));
            const tB = (b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt || b.createdAt || 0));
            return tA - tB;
          });
          docs.forEach(data => {
            if (data.index !== undefined) {
              cache[data.index] = data;
            }
          });
        });

        await AsyncStorage.setItem(VERSES_CACHE_KEY, JSON.stringify(cache));
      }

      // Offline / missing fallback: Ensure all required indices are populated from bundled JSON
      let bundledVerses: any[] | null = null;
      for (const idx of requiredIndices) {
        if (!cache[idx]) {
          if (!bundledVerses) {
            try {
              bundledVerses = require('../../assets/bulk_verses.json');
            } catch (_) {}
          }
          if (bundledVerses && bundledVerses[idx]) {
            const bv = bundledVerses[idx];
            cache[idx] = {
              id: `verse_${idx}`,
              index: idx,
              verseEn: bv.verseEn,
              verseTe: bv.verseTe,
              referenceEn: bv.referenceEn,
              referenceTe: bv.referenceTe,
            };
          }
        }
      }

      const results = [];
      const PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];
      for (const d of targetDates) {
        const dailyIndices = this.getIndicesForDate(d, totalVerses, churchId);
        const versesForDay: DailyVerse[] = [];
        for (let i = 0; i < 4; i++) {
          const idx = dailyIndices[i];
          if (cache[idx]) {
            const v = cache[idx];
            if (!v.backgroundUrl) {
              v.backgroundUrl = getVerseBackgroundUrl(v, PERIODS[i], idx);
            }
            versesForDay.push(v);
          }
        }
        results.push({ date: d, verses: versesForDay });
      }
      return results;
    } catch (e) {
      console.error('[VerseNotificationService] Error in getRecentVerses:', e);
      // Failsafe: Return at least today's verses from bundled JSON
      try {
        const bundledVerses = require('../../assets/bulk_verses.json');
        const today = new Date();
        const indices = this.getIndicesForDate(today, bundledVerses.length || 5863);
        const todayVerses = indices.map((idx) => {
          const bv = bundledVerses[idx] || {};
          return {
            id: `verse_${idx}`,
            index: idx,
            verseEn: bv.verseEn || '',
            verseTe: bv.verseTe || '',
            referenceEn: bv.referenceEn || '',
            referenceTe: bv.referenceTe || '',
          };
        });
        return [{ date: today, verses: todayVerses }];
      } catch (_) {
        return [];
      }
    }
  }

  /**
   * Helper to retrieve all 4 verses for today (Morning, Afternoon, Evening, Night)
   */
  async getTodayVerses(forceRefresh: boolean = false): Promise<DailyVerse[]> {
    try {
      const recent = await this.getRecentVerses(0, true, forceRefresh);
      return recent[0]?.verses || [];
    } catch (e) {
      console.error('[VerseNotificationService] Error in getTodayVerses:', e);
      return [];
    }
  }

  /**
   * Immediately fires a single combined test notification containing both Telugu and English verses,
   * matching the exact server-side FCM push payload format.
   */
  async triggerTestPair(verse?: DailyVerse, periodOverride?: string): Promise<boolean> {
    try {
      const nowIst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const hour = nowIst.getHours();

      let period = periodOverride;
      if (!period) {
        if (hour >= 5 && hour < 12) period = 'Morning';
        else if (hour >= 12 && hour < 17) period = 'Afternoon';
        else if (hour >= 17 && hour < 21) period = 'Evening';
        else period = 'Night';
      }

      const periodTitles: Record<string, string> = {
        Morning: "Good Morning · Today's Verse (నేటి వాక్యం)",
        Afternoon: "Blessed Afternoon · Daily Peace (అనుదిన శాంతి)",
        Evening: "Evening Prayer · Faith & Grace (విశ్వాసం - కృప)",
        Night: "Good Night · God's Protection (దేవుని కాపుదల)",
      };

      const title = periodTitles[period] || periodTitles.Night;

      let targetVerse = verse;
      if (!targetVerse) {
        const todayVerses = await this.getTodayVerses(false);
        const periodIdx = ['Morning', 'Afternoon', 'Evening', 'Night'].indexOf(period);
        targetVerse = todayVerses[periodIdx >= 0 ? periodIdx : 3] || todayVerses[0];
      }
      if (!targetVerse) {
        // Fallback verse if database is initializing
        targetVerse = {
          id: 'test_verse',
          verseEn: 'And the way of peace have they not known:',
          referenceEn: 'Romans 3:17',
          verseTe: 'శాంతిమార్గము వారెరుగరు.',
          referenceTe: 'రోమీయులకు 3:17',
        };
      }

      const teVerse = (targetVerse.verseTe || targetVerse.verseEn || '').replace(/^["“”'‘]+|["“”'‘]+$/g, '').trim();
      const teRef = (targetVerse.referenceTe || targetVerse.referenceEn || '').trim();
      const enVerse = (targetVerse.verseEn || '').replace(/^["“”'‘]+|["“”'‘]+$/g, '').trim();
      const enRef = (targetVerse.referenceEn || '').trim();

      const combinedRef = (teRef && enRef && teRef !== enRef)
        ? `${teRef} | ${enRef}`
        : (teRef || enRef);

      const GAP = '\n \n';
      let body = '';
      if (teVerse && enVerse && teVerse !== enVerse) {
        body = `${teVerse}${GAP}${enVerse}${GAP}${combinedRef}`;
      } else {
        body = `${teVerse || enVerse}${GAP}${combinedRef}`;
      }

      // Schedule exactly ONE combined notification
      await Notifications.scheduleNotificationAsync({
        identifier: `${NOTIF_ID_PREFIX}test_${Date.now()}`,
        content: {
          title,
          body,
          sound: true,
          data: {
            type: 'daily_verse',
            verseId: targetVerse.id,
            period,
          },
        },
        trigger: null,
      });

      return true;
    } catch (e) {
      console.error('[VerseNotificationService] Error triggering test notification:', e);
      return false;
    }
  }

  /**
   * Localizes a DailyVerse object for the requested language by resolving
   * scripture text and reference via BibleService or local cache.
   */
  async localizeVerse(verse: DailyVerse, lang: SupportedLanguage): Promise<DailyVerse> {
    if (!verse || !lang || lang === 'en') return verse;
    if (lang === 'te' && verse.verseTe && verse.verseTe.trim().length > 0) return verse;

    const cap = lang.charAt(0).toUpperCase() + lang.slice(1);
    const directKey = `verse${cap}`;
    const directRefKey = `reference${cap}`;

    // If already localized in-memory
    if (verse[directKey] && verse[directRefKey]) {
      return verse;
    }

    const cacheKey = `@daily_verse_trans_${verse.id || verse.referenceEn}_${lang}`;
    try {
      const cachedStr = await AsyncStorage.getItem(cacheKey);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (cached.verse && cached.reference) {
          return {
            ...verse,
            [directKey]: cached.verse,
            [directRefKey]: cached.reference,
            [`verse_${lang}`]: cached.verse,
            [`reference_${lang}`]: cached.reference,
          };
        }
      }
    } catch (_) {}

    const ref = verse.referenceEn || verse.reference;
    if (!ref) return verse;

    try {
      const res = await BibleService.fetchVerseByReference(ref, lang);
      if (res && res.verse) {
        await AsyncStorage.setItem(cacheKey, JSON.stringify(res));
        return {
          ...verse,
          [directKey]: res.verse,
          [directRefKey]: res.reference,
          [`verse_${lang}`]: res.verse,
          [`reference_${lang}`]: res.reference,
        };
      }
    } catch (e) {
      console.warn('[VerseNotificationService] Failed to localize verse:', e);
    }

    return verse;
  }

  /**
   * Localizes an array of DailyVerse objects for the requested language
   */
  async localizeVerses(verses: DailyVerse[], lang: SupportedLanguage): Promise<DailyVerse[]> {
    if (!verses || verses.length === 0 || !lang || lang === 'en') return verses;
    return Promise.all(verses.map(v => this.localizeVerse(v, lang)));
  }
}

export default new VerseNotificationService();
