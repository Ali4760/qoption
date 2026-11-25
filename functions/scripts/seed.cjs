const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const emulator = '127.0.0.1';
const projectId = 'demo-qoption';
process.env.FIREBASE_AUTH_EMULATOR_HOST = emulator + ':9099';
process.env.FIRESTORE_EMULATOR_HOST = emulator + ':8080';
initializeApp({ projectId });

const db = getFirestore();
const auth = getAuth();
const password = 'QoptionDemo!2026';
const now = Date.now();
const accounts = [
  { uid: 'demo-user', name: 'Alex Morgan', email: 'trader@example.test' },
  { uid: 'demo-staff', name: 'Practice Operations', email: 'staff@example.test' },
  { uid: 'demo-jordan', name: 'Jordan Lee', email: 'jordan@example.test' },
  { uid: 'demo-sam', name: 'Sam Rivera', email: 'sam@example.test' },
];

async function seed() {
  for (const person of accounts) {
    try { await auth.getUser(person.uid); }
    catch (error) {
      if (error.code !== 'auth/user-not-found') throw error;
      await auth.createUser({ uid: person.uid, email: person.email, displayName: person.name, emailVerified: true, password });
    }
  }
  await db.runTransaction(async tx => {
    const marker = db.collection('localFixtures').doc('workspace');
    if ((await tx.get(marker)).exists) return;
    for (const person of accounts.filter(person => person.uid !== 'demo-staff')) {
      const held = person.uid === 'demo-jordan' ? 7500 : 0;
      tx.set(db.collection('profiles').doc(person.uid), { ...person, nameSearch: person.name.toLowerCase(), assignedTo: 'demo-staff', tradeEnabled: true, withdrawalEnabled: true, createdAt: now - 86400000 });
      tx.set(db.collection('wallets').doc(person.uid), { available: 100000 - held, held });
      tx.set(db.collection('ledger').doc('opening_' + person.uid), { uid: person.uid, kind: 'Opening balance', availableDelta: 100000, heldDelta: 0, note: 'Practice trading credit', createdAt: now - 86400000 });
    }
    tx.set(db.collection('staff').doc('demo-staff'), { active: true, allClients: true, roles: ['admin', 'finance', 'support'] });
    tx.set(db.collection('funding').doc('demo-deposit'), { uid: 'demo-sam', kind: 'deposit', amount: 25000, method: 'Simulated transfer', status: 'pending', createdAt: now - 440000 });
    tx.set(db.collection('funding').doc('demo-withdrawal'), { uid: 'demo-jordan', kind: 'withdrawal', amount: 7500, method: 'Simulated transfer', status: 'pending', createdAt: now - 340000 });
    tx.set(db.collection('ledger').doc('demo-withdrawal-hold'), { uid: 'demo-jordan', kind: 'Withdrawal hold', availableDelta: -7500, heldDelta: 7500, note: 'Simulated withdrawal', createdAt: now - 340000 });
    tx.set(db.collection('messages').doc('demo-welcome'), { uid: 'demo-user', sender: 'Support', message: 'Welcome to your practice workspace. Contact us here if you need help exploring it.', createdAt: now - 600000 });
    tx.create(marker, { seededAt: now });
  });
  console.log('Emulator practice accounts ready: trader@example.test and staff@example.test.');
}
seed().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
