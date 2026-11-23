const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const { Firestore, Timestamp } = require(path.resolve(__dirname, '../functions/node_modules/@google-cloud/firestore'));
const { GoogleAuth, OAuth2Client } = require(path.resolve(__dirname, '../node_modules/google-auth-library'));

const saPath = path.resolve(__dirname, '../serviceAccountKey.json');
const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));

function getServerTimeSeconds() {
  return new Promise((resolve) => {
    const req = https.request('https://oauth2.googleapis.com/token', { method: 'HEAD' }, (res) => {
      const dateStr = res.headers.date;
      if (dateStr) {
        const ms = Date.parse(dateStr);
        if (!Number.isNaN(ms)) {
          resolve(Math.floor(ms / 1000));
          return;
        }
      }
      resolve(Math.floor(Date.now() / 1000));
    });
    req.on('error', () => resolve(Math.floor(Date.now() / 1000)));
    req.end();
  });
}

async function fetchAccessTokenFromSa() {
  const now = await getServerTimeSeconds();
  const exp = now + 3600;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      exp,
      iat: now,
    })
  ).toString('base64url');
  const toSign = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  const sig = signer.sign(sa.private_key, 'base64url');
  const jwt = `${toSign}.${sig}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  }).toString();

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function createClockSkewedFirestore() {
  const initialToken = await fetchAccessTokenFromSa();
  const client = new OAuth2Client();
  client.setCredentials({
    access_token: initialToken,
    expiry_date: Date.now() + 50 * 60 * 1000,
  });
  client.refreshHandler = async () => {
    const token = await fetchAccessTokenFromSa();
    return {
      access_token: token,
      expiry_date: Date.now() + 50 * 60 * 1000,
    };
  };

  const auth = new GoogleAuth({ authClient: client, projectId: sa.project_id });
  return new Firestore({
    projectId: sa.project_id,
    auth,
    preferRest: true,
  });
}

function convertTimestamps(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(convertTimestamps);
  if (typeof obj === 'object') {
    if (typeof obj.toMillis === 'function') {
      return Timestamp.fromMillis(obj.toMillis());
    }
    if (typeof obj._seconds === 'number' && typeof obj._nanoseconds === 'number') {
      return new Timestamp(obj._seconds, obj._nanoseconds);
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = convertTimestamps(v);
    }
    return out;
  }
  return obj;
}

const DEFAULT_CHURCH_ID = 'rhema';

async function commitBatchedWrites(db, writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const batch = db.batch();
    for (const item of chunk) {
      batch.set(item.ref, convertTimestamps(item.data), { merge: true });
    }
    await batch.commit();
  }
}

async function run() {
  const { buildTestUserBatch } = await import('../functions/src/matrimony/testSeedData.js');
  const db = await createClockSkewedFirestore();
  const churchRef = db.collection('Rhema Church').doc(DEFAULT_CHURCH_ID);

  const existingTestProfiles = await db.collection('matrimony_profiles').where('isTestUser', '==', true).get();
  let maxSeq = 0;
  existingTestProfiles.docs.forEach((d) => {
    const seqVal = Number(d.data()?.testSequence || 0);
    if (Number.isFinite(seqVal) && seqVal > maxSeq) maxSeq = seqVal;
    const m = d.id.match(/^test_rhema_(\d+)$/);
    if (m && m[1]) {
      const parsed = parseInt(m[1], 10);
      if (Number.isFinite(parsed) && parsed > maxSeq) maxSeq = parsed;
    }
  });

  const startSequence = maxSeq === 0 ? 1 : maxSeq + 1;
  const bundle = buildTestUserBatch({
    count: 50,
    startSequence,
    batchLabel: `initial_50_${Date.now()}`,
  });

  const writes = [];
  for (const u of bundle) {
    const profileRef = db.collection('matrimony_profiles').doc(u.uid);
    writes.push(
      { ref: churchRef.collection('members').doc(u.uid), data: u.memberDoc },
      { ref: churchRef.collection('memberPhoneIndex').doc(u.last10Phone), data: u.phoneIndexDoc },
      { ref: churchRef.collection('registration_requests').doc(u.last10Phone), data: u.registrationRequestDoc },
      { ref: db.collection('users').doc(u.uid), data: u.globalUserDoc },
      { ref: profileRef, data: u.matrimonyProfileDoc },
      { ref: profileRef.collection('private').doc('info'), data: u.matrimonyPrivateDoc },
      { ref: profileRef.collection('preferences').doc('partner'), data: u.matrimonyPrefsDoc },
      { ref: profileRef.collection('verification').doc('status'), data: u.matrimonyVerificationDoc },
      { ref: db.collection('matrimony_admin_profiles').doc(u.uid), data: u.matrimonyAdminProfileDoc }
    );
  }

  await commitBatchedWrites(db, writes);

  const men = bundle.filter((u) => u.memberDoc.gender === 'Male').length;
  const women = bundle.filter((u) => u.memberDoc.gender === 'Female').length;
  const byState = {};
  for (const u of bundle) {
    const st = u.matrimonyProfileDoc.location.state;
    const ct = u.matrimonyProfileDoc.location.city;
    if (!byState[st]) byState[st] = {};
    byState[st][ct] = (byState[st][ct] || 0) + 1;
  }

  console.log(`Seeded ${bundle.length} test users (${men} Men, ${women} Women).`);
  console.log('Location breakdown:', JSON.stringify(byState, null, 2));
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
