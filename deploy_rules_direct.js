// deploy_rules_direct.js
// Deploys firestore.rules and storage.rules directly via the Google Firebase Rules API
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const key = require('./key.json');
const projectId = key.project_id;

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
    aud: 'https://oauth2.googleapis.com/token',
    exp,
    iat: now
  })).toString('base64url');

  const toSign = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  const sig = signer.sign(key.private_key, 'base64url');
  const jwt = `${toSign}.${sig}`;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.access_token) resolve(parsed.access_token);
        else reject(new Error('Failed to get token: ' + data));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function apiRequest(token, method, apiPath, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const data = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = https.request({
      hostname: 'firebaserules.googleapis.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => {
      let resp = '';
      res.on('data', d => resp += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(resp);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`API ${method} ${apiPath} failed (${res.statusCode}): ${resp}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON (${res.statusCode}): ${resp}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function deployFirestoreRules(token) {
  console.log('\n📄 Reading firestore.rules...');
  const rulesContent = fs.readFileSync(path.join(__dirname, 'firestore.rules'), 'utf8');

  console.log('🚀 Creating new Firestore ruleset...');
  const ruleset = await apiRequest(token, 'POST', `/v1/projects/${projectId}/rulesets`, {
    source: {
      files: [
        {
          name: 'firestore.rules',
          content: rulesContent
        }
      ]
    }
  });
  console.log('✅ Created ruleset:', ruleset.name);

  console.log('🔄 Releasing new ruleset to cloud.firestore...');
  const release = await apiRequest(token, 'PATCH', `/v1/projects/${projectId}/releases/cloud.firestore?updateMask=rulesetName`, {
    release: {
      name: `projects/${projectId}/releases/cloud.firestore`,
      rulesetName: ruleset.name
    }
  });
  console.log('🎉 Firestore security rules successfully deployed to', projectId, '!');
}

async function main() {
  console.log(`Authenticating as: ${key.client_email}`);
  const token = await getAccessToken();
  console.log('🔑 Authentication successful!');

  await deployFirestoreRules(token);
}

main().catch(err => {
  console.error('❌ Deployment error:', err.message);
  process.exit(1);
});
