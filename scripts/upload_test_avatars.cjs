const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const { randomUUID } = crypto;

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
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.full_control',
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

const MATRIMONY_BUCKET = 'rhema-global-ministries-matrimony';
const MALE_SRC = 'C:/Users/user/.gemini/antigravity/brain/4a4a6571-5b2e-45dc-8f68-3764289267eb/.user_uploaded/media_1795121410129_0ab2b2da.jpg';
const FEMALE_SRC = 'C:/Users/user/.gemini/antigravity/brain/4a4a6571-5b2e-45dc-8f68-3764289267eb/.user_uploaded/media_1795121416481_fe093134.jpg';

function buildFirebaseTokenUrl(bucketName, objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
}

async function uploadOne(accessToken, srcPath, destPath) {
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Source image missing: ${srcPath}`);
  }
  let token = null;
  const metaCheck = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${MATRIMONY_BUCKET}/o/${encodeURIComponent(destPath)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (metaCheck.ok) {
    const existingMeta = await metaCheck.json();
    const existing = String(existingMeta?.metadata?.firebaseStorageDownloadTokens || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (existing[0]) token = existing[0];
  }
  if (!token) token = randomUUID();

  const boundary = '-------rhema_seed_' + randomUUID();
  const metadataJson = JSON.stringify({
    name: destPath,
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=31536000',
    metadata: {
      firebaseStorageDownloadTokens: token,
    },
  });
  const imgBytes = fs.readFileSync(srcPath);
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    'utf8'
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([pre, imgBytes, post]);

  const uploadResp = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${MATRIMONY_BUCKET}/o?uploadType=multipart`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    }
  );
  if (!uploadResp.ok) {
    const txt = await uploadResp.text();
    throw new Error(`Upload ${destPath} failed (${uploadResp.status}): ${txt}`);
  }
  const url = buildFirebaseTokenUrl(MATRIMONY_BUCKET, destPath, token);
  const verifyResp = await fetch(url, { method: 'HEAD' });
  if (!verifyResp.ok) {
    throw new Error(`Verify ${url} returned ${verifyResp.status}`);
  }
  return url;
}

async function run() {
  const accessToken = await fetchAccessTokenFromSa();
  const maleUrl = await uploadOne(accessToken, MALE_SRC, 'seed_avatars/male_default.jpg');
  const femaleUrl = await uploadOne(accessToken, FEMALE_SRC, 'seed_avatars/female_default.jpg');
  console.log('MALE_AVATAR_URL=' + maleUrl);
  console.log('FEMALE_AVATAR_URL=' + femaleUrl);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Upload failed:', err);
    process.exit(1);
  });
