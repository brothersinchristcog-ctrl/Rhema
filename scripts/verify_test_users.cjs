const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const { Firestore } = require(path.resolve(__dirname, '../functions/node_modules/@google-cloud/firestore'));
const { GoogleAuth, OAuth2Client } = require(path.resolve(__dirname, '../node_modules/google-auth-library'));

const saPath = path.resolve(__dirname, '../serviceAccountKey.json');
const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));

function getServerTimeSeconds() {
  return new Promise((resolve) => {
    const req = https.request('https://oauth2.googleapis.com/token', { method: 'HEAD' }, (res) => {
      const ms = res.headers.date ? Date.parse(res.headers.date) : NaN;
      resolve(!Number.isNaN(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000));
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
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) throw new Error(JSON.stringify(json));
  return json.access_token;
}

async function run() {
  const token = await fetchAccessTokenFromSa();
  const client = new OAuth2Client();
  client.setCredentials({ access_token: token, expiry_date: Date.now() + 3000 * 1000 });
  const db = new Firestore({
    projectId: sa.project_id,
    auth: new GoogleAuth({ authClient: client, projectId: sa.project_id }),
    preferRest: true,
  });

  const [membersSnap, profilesSnap, adminProfilesSnap, usersSnap] = await Promise.all([
    db.collection('Rhema Church').doc('rhema').collection('members').where('isTestUser', '==', true).get(),
    db.collection('matrimony_profiles').where('isTestUser', '==', true).get(),
    db.collection('matrimony_admin_profiles').where('isTestUser', '==', true).get(),
    db.collection('users').where('isTestUser', '==', true).get(),
  ]);

  let male = 0;
  let female = 0;
  profilesSnap.docs.forEach((d) => {
    const g = String(d.data().gender || '').toLowerCase();
    if (g === 'male') male++;
    else if (g === 'female') female++;
  });

  // Verify subcollections on first sample test user
  const sampleUid = profilesSnap.docs[0]?.id;
  let subcollectionsOk = false;
  if (sampleUid) {
    const [privSnap, prefsSnap, verSnap] = await Promise.all([
      db.collection('matrimony_profiles').doc(sampleUid).collection('private').doc('info').get(),
      db.collection('matrimony_profiles').doc(sampleUid).collection('preferences').doc('partner').get(),
      db.collection('matrimony_profiles').doc(sampleUid).collection('verification').doc('status').get(),
    ]);
    subcollectionsOk = privSnap.exists && prefsSnap.exists && verSnap.exists;
  }

  console.log(JSON.stringify({
    membersCount: membersSnap.size,
    matrimonyProfilesCount: profilesSnap.size,
    matrimonyAdminProfilesCount: adminProfilesSnap.size,
    usersCount: usersSnap.size,
    maleCount: male,
    femaleCount: female,
    sampleUid,
    subcollectionsOk,
  }, null, 2));
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
