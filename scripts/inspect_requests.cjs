const admin = require('firebase-admin');
const path = require('path');
const sa = require(path.resolve(__dirname, '../serviceAccountKey.json'));

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function run() {
  console.log('--- Checking Rhema Church / rhema / registration_requests ---');
  const snap1 = await db.collection('Rhema Church').doc('rhema').collection('registration_requests').get();
  console.log('Count in Rhema Church/rhema/registration_requests:', snap1.size);
  snap1.forEach(d => console.log('Doc ID:', d.id, JSON.stringify(d.data(), null, 2)));

  console.log('--- Checking all churches in Rhema Church ---');
  const churches = await db.collection('Rhema Church').get();
  for (const church of churches.docs) {
    const sub = await church.ref.collection('registration_requests').get();
    if (sub.size > 0) {
      console.log(`Church ${church.id} has ${sub.size} registration requests:`);
      sub.forEach(d => console.log('  Doc ID:', d.id, JSON.stringify(d.data(), null, 2)));
    }
  }

  console.log('--- Checking collectionGroup registration_requests ---');
  const snap2 = await db.collectionGroup('registration_requests').get();
  console.log('Count in collectionGroup(registration_requests):', snap2.size);
  snap2.forEach(d => console.log('Path:', d.ref.path, JSON.stringify(d.data(), null, 2)));
}

run().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

