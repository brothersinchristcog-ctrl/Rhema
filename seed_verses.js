const admin = require('firebase-admin');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('./key.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY || 'ppd4mBIqu8573rS42D9fobzAipdPsYdKkfOD0A5yiQc';

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

async function seedVerses() {
  console.log('🚀 Starting Verse Seeding for Rhema Global Ministries...');
  
  const jsonPath = path.join(__dirname, 'app', 'assets', 'bulk_verses.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ bulk_verses.json not found at:', jsonPath);
    process.exit(1);
  }

  const rawData = fs.readFileSync(jsonPath, 'utf8');
  const verses = JSON.parse(rawData);
  console.log(`📦 Loaded ${verses.length} verses from JSON.`);

  const versesRef = db.collection('daily_verses');
  
  let batch = db.batch();
  let count = 0;
  let batchCount = 0;
  const BATCH_SIZE = 400;

  for (let i = 0; i < verses.length; i++) {
    const v = verses[i];
    if (v.verseEn && v.verseTe) {
      // Deterministic document ID or auto-id with index field
      const docRef = versesRef.doc(`verse_${i}`);
      batch.set(docRef, {
        verseEn: v.verseEn,
        verseTe: v.verseTe,
        referenceEn: v.referenceEn,
        referenceTe: v.referenceTe,
        index: i,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      count++;

      if (count % BATCH_SIZE === 0) {
        batchCount++;
        await batch.commit();
        console.log(`✅ Committed batch ${batchCount} (${count} verses)...`);
        batch = db.batch();
      }
    }
  }

  if (count % BATCH_SIZE !== 0) {
    batchCount++;
    await batch.commit();
    console.log(`✅ Committed final batch ${batchCount} (total ${count} verses).`);
  }

  // Update metadata
  await db.collection('daily_verses_meta').doc('metadata').set({
    totalVerses: count,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`🎉 Successfully populated ${count} daily verses and updated metadata!`);

  // Now fetch Unsplash backgrounds for Today and next 7 days
  console.log('🖼️ Fetching Unsplash backgrounds for today and upcoming 7 days...');
  const EPOCH = new Date('2024-01-01T00:00:00Z');
  const today = new Date();
  const targetIndices = new Set();

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + dayOffset);
    const localDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const epochDate = new Date(EPOCH.getFullYear(), EPOCH.getMonth(), EPOCH.getDate());
    const daysSinceEpoch = Math.floor((localDate.getTime() - epochDate.getTime()) / (1000 * 60 * 60 * 24));

    for (let slot = 0; slot < 4; slot++) {
      targetIndices.add((daysSinceEpoch * 4 + slot) % count);
    }
  }

  const indicesArray = Array.from(targetIndices);
  console.log(`Target verse indices for next 7 days: ${indicesArray.length} slots:`, indicesArray);

  for (const idx of indicesArray) {
    const snap = await versesRef.where('index', '==', idx).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data();
      if (!data.backgroundUrl) {
        const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
        try {
          const res = await axios.get('https://api.unsplash.com/photos/random', {
            params: {
              query: theme,
              orientation: 'portrait',
              content_filter: 'high'
            },
            headers: {
              Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`
            },
            timeout: 10000
          });

          const imageUrl = res.data?.urls?.regular;
          if (imageUrl) {
            await doc.ref.update({
              backgroundUrl: imageUrl,
              unsplashPhotographer: res.data?.user?.name || 'Unsplash',
              backgroundTheme: theme
            });
            console.log(`  📸 Index ${idx}: Added Unsplash image (${theme})`);
          }
        } catch (err) {
          console.warn(`  ⚠️ Unsplash fetch failed for index ${idx}:`, err.response?.status || err.message);
        }
      } else {
        console.log(`  ✓ Index ${idx} already has backgroundUrl.`);
      }
    }
  }

  console.log('✨ All done!');
  process.exit(0);
}

seedVerses().catch(err => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});

