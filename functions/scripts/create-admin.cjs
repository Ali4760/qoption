const admin = require('firebase-admin');
const path = require('path');

const certPath = 'c:/Users/Ali ishrat/Downloads/qoption-6c226-firebase-adminsdk-fbsvc-7f4b2e7be8.json';
const cert = require(certPath);

admin.initializeApp({
  credential: admin.credential.cert(cert)
});

const auth = admin.auth();
const db = admin.firestore();

async function createAdmin(email, password) {
  if (!email || !password) {
    console.error('Usage: node create-admin.cjs <email> <password>');
    process.exit(1);
  }

  console.log(`Setting up admin user: ${email}...`);
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`Found existing Auth user with UID: ${userRecord.uid}`);
    await auth.updateUser(userRecord.uid, {
      password: password,
      emailVerified: true
    });
    console.log('Updated existing user password and verified email.');
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({
        email: email,
        password: password,
        emailVerified: true,
        displayName: 'Administrator'
      });
      console.log(`Created new Auth user with UID: ${userRecord.uid}`);
    } else {
      throw err;
    }
  }

  const uid = userRecord.uid;
  const staffRef = db.collection('staff').doc(uid);
  await staffRef.set({
    active: true,
    allClients: true,
    roles: ['admin', 'finance', 'support'],
    updatedAt: Date.now()
  });
  console.log(`Created/updated staff document at staff/${uid}`);

  const profileRef = db.collection('profiles').doc(uid);
  const profileDoc = await profileRef.get();
  if (!profileDoc.exists) {
    await profileRef.set({
      uid: uid,
      email: email,
      name: 'Administrator',
      nameSearch: 'administrator',
      createdAt: Date.now(),
      tradeEnabled: true,
      withdrawalEnabled: true,
      assignedTo: ''
    });
    console.log(`Created profile at profiles/${uid}`);
  }

  console.log('\n=======================================');
  console.log('SUCCESS! Admin account is ready:');
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log(`UID:      ${uid}`);
  console.log('=======================================\n');
}

const email = process.argv[2] || 'admin@qoption.com';
const password = process.argv[3] || 'Admin123456!';

createAdmin(email, password).catch(err => {
  console.error('Error creating admin:', err.message || err);
  process.exit(1);
});
