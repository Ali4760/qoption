import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const project = 'demo-qoption';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
require('firebase-admin/app').initializeApp({ projectId: project });
const db = require('firebase-admin/firestore').getFirestore();
const auth = require('firebase-admin/auth').getAuth();
const identity = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:';
const functionUrl = 'http://127.0.0.1:5001/demo-qoption/us-central1/workspace';
const email = 'test-' + randomUUID() + '@example.test';
const password = 'QoptionDemo!2026';

async function identityCall(action, email) {
  const response = await fetch(identity + action + '?key=demo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data.error));
  return data;
}
async function call(account, op, args = {}, expected = 200) {
  const headers = { 'Content-Type': 'application/json' };
  if (account) headers.Authorization = 'Bearer ' + account.idToken;
  const response = await fetch(functionUrl, { method: 'POST', headers, body: JSON.stringify({ data: { op, ...args } }) });
  const data = await response.json();
  assert.equal(response.status, expected, op + ': ' + JSON.stringify(data.error || {}));
  return data.result;
}
async function main() {
  const trader = await identityCall('signUp', email);
  const staff = await identityCall('signInWithPassword', 'staff@example.test');
  const uid = trader.localId;
  try {
    await call(null, 'access', {}, 401);
    await call(trader, 'admin.access', {}, 403);
    const start = await call(trader, 'access');
    assert.equal(start.wallet.available, 100000);
    const unauthorised = await fetch('http://127.0.0.1:8080/v1/projects/demo-qoption/databases/(default)/documents/wallets/' + uid, {
      headers: { Authorization: 'Bearer ' + trader.idToken },
    });
    assert.equal(unauthorised.status, 403, 'Direct reads obey Firestore rules');

    const tradeInput = { symbol: 'BTCUSDT', amount: 1000, direction: 'up', duration: 30, requestId: randomUUID() };
    const [placed, retry] = await Promise.all([call(trader, 'trade.place', tradeInput), call(trader, 'trade.place', tradeInput)]);
    assert.equal(placed.id, retry.id);
    await call(trader, 'trade.place', { ...tradeInput, amount: 1100 }, 409);
    const open = await call(trader, 'home');
    assert.equal(open.wallet.available, 99000);
    assert.equal(open.wallet.held, 1000);
    await db.collection('trades').doc(placed.id).update({ dueAt: Date.now() - 1000 });
    const [settled] = await Promise.all([call(trader, 'home'), call(trader, 'home')]);
    const settledTrade = (await db.collection('trades').doc(placed.id).get()).data();
    assert.equal(settled.wallet.held, 0);
    assert.equal(settled.wallet.available, 99000 + settledTrade.payout);
    assert.equal(settledTrade.status, 'settled');
    assert.equal((await db.collection('ledger').where('uid', '==', uid).get()).size, 3);

    const withdrawal = await call(trader, 'funding.request', { kind: 'withdrawal', amount: 1500, requestId: randomUUID() });
    assert.equal((await call(trader, 'home')).wallet.held, 1500);
    await call(trader, 'funding.cancel', { id: withdrawal.id, requestId: randomUUID() });
    assert.equal((await call(trader, 'home')).wallet.available, settled.wallet.available);

    const deposit = await call(trader, 'funding.request', { kind: 'deposit', amount: 2500, requestId: randomUUID() });
    const decision = { id: deposit.id, status: 'approved', reason: 'Verified test request', requestId: randomUUID() };
    await call(trader, 'admin.funding.decide', decision, 403);
    await call(staff, 'admin.funding.decide', decision);
    await call(staff, 'admin.funding.decide', decision);
    assert.equal((await call(trader, 'home')).wallet.available, settled.wallet.available + 2500);
    await call(staff, 'admin.funding.decide', { ...decision, requestId: randomUUID() }, 400);
    await call(trader, 'message.send', { message: 'Test message', requestId: randomUUID() });
    const thread = await call(staff, 'admin.messages', { uid });
    assert.equal(thread.rows[0].message, 'Test message');

    const batch = db.batch();
    for (let index = 0; index < 28; index++) {
      batch.create(db.collection('funding').doc(), { uid, kind: 'deposit', amount: 100, status: 'pending', createdAt: index });
    }
    await batch.commit();
    const first = await call(trader, 'list', { list: 'funding' });
    const second = await call(trader, 'list', { list: 'funding', cursor: first.cursor });
    assert.equal(first.rows.length, 25);
    assert.equal(second.rows.length, 5);
    assert.equal(new Set([...first.rows, ...second.rows].map(row => row.id)).size, 30);
    console.log('Firebase integration passed: account separation, rules, idempotent trades, settlement, funding, messaging, and pagination.');
  } finally {
    const cleanup = db.batch();
    for (const name of ['trades', 'funding', 'ledger', 'messages', 'audit', 'operationReceipts']) {
      const snapshot = await db.collection(name).where('uid', '==', uid).get();
      for (const doc of snapshot.docs) cleanup.delete(doc.ref);
    }
    for (const name of ['profiles', 'wallets', 'writeLimits']) cleanup.delete(db.collection(name).doc(uid));
    await cleanup.commit();
    await auth.deleteUser(uid);
  }
}
await main();
