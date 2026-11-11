const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');
const https = require('https');

const path = require('path');

async function deployRules() {
  const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
  const serviceAccount = require(serviceAccountPath);
  const projectId = serviceAccount.project_id;
  const rulesPath = path.resolve(__dirname, '../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  const auth = new GoogleAuth({
    keyFile: serviceAccountPath,
    scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform']
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  console.log('Got access token, creating ruleset...');

  // 1. Create Ruleset
  const createRulesetUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;
  const rulesetBody = JSON.stringify({
    source: {
      files: [
        {
          name: 'firestore.rules',
          content: rulesContent
        }
      ]
    }
  });

  const rulesetRes = await fetch(createRulesetUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json'
    },
    body: rulesetBody
  });

  const rulesetData = await rulesetRes.json();
  if (!rulesetRes.ok) {
    console.error('Failed to create ruleset:', rulesetData);
    process.exit(1);
  }

  const rulesetName = rulesetData.name;
  console.log('Created ruleset:', rulesetName);

  // 2. Release Ruleset to cloud.firestore
  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  const releaseUrl = `https://firebaserules.googleapis.com/v1/${releaseName}`;
  
  const releaseRes = await fetch(releaseUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      release: {
        name: releaseName,
        rulesetName: rulesetName
      }
    })
  });

  const releaseData = await releaseRes.json();
  if (!releaseRes.ok) {
    console.error('Failed to release ruleset:', releaseData);
    process.exit(1);
  }

  console.log('SUCCESS: Ruleset successfully deployed and released to cloud.firestore!');
}

deployRules().catch(err => {
  console.error('Error deploying rules:', err);
  process.exit(1);
});
