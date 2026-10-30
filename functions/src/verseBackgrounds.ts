import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import axios from 'axios';

const THEMES = [
  'christian cross',
  'jesus light',
  'nature sunrise',
  'mountains sunset',
  'bible prayer',
  'heavenly clouds',
  'hope light',
  'peaceful water'
];

const DEFAULT_UNSPLASH_ACCESS_KEY = 'ppd4mBIqu8573rS42D9fobzAipdPsYdKkfOD0A5yiQc';

const getDb = () => {
  if (getApps().length === 0) {
    initializeApp();
  }
  return getFirestore();
};

/**
 * Core helper that ensures verses for the specified window have Unsplash backgrounds.
 */
export async function syncVerseBackgroundsInternal(daysAhead: number = 5): Promise<{ totalChecked: number, updatedCount: number }> {
  console.log(`[syncVerseBackgroundsInternal] Starting Unsplash fetch job for ${daysAhead} days...`);
  const db = getDb();
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY || DEFAULT_UNSPLASH_ACCESS_KEY;
  
  // We check metadata for total verses
  const metaDoc = await db.collection('daily_verses_meta').doc('metadata').get();
  if (!metaDoc.exists) return { totalChecked: 0, updatedCount: 0 };
  const totalVerses = metaDoc.data()?.totalVerses || 0;
  if (totalVerses === 0) return { totalChecked: 0, updatedCount: 0 };

  const today = new Date();
  const targetDates: Date[] = [];
  
  // Target today + upcoming days
  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    targetDates.push(d);
  }

  const EPOCH = new Date('2026-10-30T00:00:00Z');
  const requiredIndices = new Set<number>();
  
  targetDates.forEach(date => {
    const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const epochDate = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate());
    const daysSinceEpoch = Math.floor((localDate.getTime() - epochDate.getTime()) / (1000 * 60 * 60 * 24));
    
    requiredIndices.add((daysSinceEpoch * 4 + 0) % totalVerses);
    requiredIndices.add((daysSinceEpoch * 4 + 1) % totalVerses);
    requiredIndices.add((daysSinceEpoch * 4 + 2) % totalVerses);
    requiredIndices.add((daysSinceEpoch * 4 + 3) % totalVerses);
  });

  const missingIndices = Array.from(requiredIndices);
  if (missingIndices.length === 0) return { totalChecked: 0, updatedCount: 0 };

  // Fetch in chunks of 10 for Firestore 'in' query limit
  let updatedCount = 0;
  
  for (let chunkStart = 0; chunkStart < missingIndices.length; chunkStart += 10) {
    const chunk = missingIndices.slice(chunkStart, chunkStart + 10);
    const snapshot = await db.collection('daily_verses').where('index', 'in', chunk).get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data.backgroundUrl) {
        const randomTheme = THEMES[Math.floor(Math.random() * THEMES.length)];
        try {
          const res = await axios.get('https://api.unsplash.com/photos/random', {
            params: {
              query: randomTheme,
              orientation: 'portrait',
              content_filter: 'high'
            },
            headers: {
              'Authorization': `Client-ID ${unsplashKey}`
            },
            timeout: 10000
          });
          
          const imageUrl = res.data?.urls?.regular;
          if (imageUrl) {
            await doc.ref.update({
              backgroundUrl: imageUrl,
              unsplashPhotographer: res.data?.user?.name || 'Unsplash',
              backgroundTheme: randomTheme
            });
            updatedCount++;
            console.log(`[syncVerseBackgroundsInternal] Added image to verse index ${data.index} (${randomTheme})`);
          }
        } catch (e: any) {
          console.error(`[syncVerseBackgroundsInternal] Error fetching from Unsplash for index ${data.index}:`, e.response?.data || e.message);
        }
      }
    }
  }

  console.log(`[syncVerseBackgroundsInternal] Completed. Updated ${updatedCount} of ${missingIndices.length} checked slots.`);
  return { totalChecked: missingIndices.length, updatedCount };
}

/**
 * Scheduled cron job to run every day at 11:00 PM (23:00) server time.
 * It fetches the next 3 days of verses and ensures they have a backgroundUrl.
 */
export const generateVerseBackgroundsV2 = onSchedule({
  schedule: '0 23 * * *',
  timeZone: 'America/New_York'
}, async (event: any) => {
  await syncVerseBackgroundsInternal(3);
});

/**
 * Manual HTTP trigger for admins or testing to populate missing backgrounds.
 */
export const triggerGenerateVerseBackgrounds = onRequest({ cors: true, timeoutSeconds: 300 }, async (req, res) => {
  try {
    const days = parseInt((req.query.days as string) || (req.body?.days as string) || '7', 10);
    const result = await syncVerseBackgroundsInternal(days);
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('triggerGenerateVerseBackgrounds error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
