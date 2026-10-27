// seed_rhema_church.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const key = require('./key.json');

initializeApp({ credential: cert(key) });
const db = getFirestore();

const RHEMA_CHURCH_ID = 'rhema';

const rhemaChurchData = {
  id: RHEMA_CHURCH_ID,
  name: 'Rhema Global Ministries',
  churchCode: 'RHEMA',
  subdomain: 'rhema',
  tagline: 'Transforming Lives Through The Word of God',
  contactEmail: 'contact@rhemaglobalministries.org',
  contactPhone: '+1234567890',
  address: 'Global',
  aboutUs: 'Welcome to Rhema Global Ministries. We are a Bible-believing, Christ-centered ministry committed to preaching the Word, equipping believers, and walking together in faith.',
  isActive: true,
  createdAt: new Date().toISOString(),
  theme: {
    primaryColor: '#1E3A8A',
    secondaryColor: '#D97706',
    backgroundColor: '#FFFFFF',
    textColor: '#0F172A'
  },
  useWeChristianDailyPromise: true,
  whatsappIntegrationEnabled: false,
  automatedWhatsappWishesEnabled: false
};

async function seed() {
  console.log(`Seeding primary church document: churches/${RHEMA_CHURCH_ID}...`);
  await db.collection('churches').doc(RHEMA_CHURCH_ID).set(rhemaChurchData, { merge: true });
  console.log('✅ Rhema Global Ministries church document successfully seeded in Firestore!');
}

seed().catch(err => {
  console.error('❌ Seeding error:', err);
  process.exit(1);
});
