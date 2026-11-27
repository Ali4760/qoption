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
const firestoreUrl = 'http://127.0.0.1:8080/v1/projects/demo-qoption/databases/(default)/documents/';
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

async function checkAdminSession(staff, trader, uid) {
  // The Auth emulator issues unsigned test tokens. Change only the sign-in time for the expiry check.
  const [header, payload, signature] = staff.idToken.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const access = await call(staff, 'admin.access');
  assert.equal(access.sessionExpiresAt, (claims.auth_time + 1800) * 1000);
  assert.ok(access.sessionExpiresAt > access.serverTime);
  const expiredClaims = { ...claims, auth_time: Math.floor(Date.now() / 1000) - 1801 };
  const expired = { idToken: [header, Buffer.from(JSON.stringify(expiredClaims)).toString('base64url'), signature].join('.') };
  for (const op of ['admin.access', 'admin.dashboard', 'admin.clients', 'admin.client.resolve', 'admin.client', 'admin.client.report', 'admin.client.update']) {
    await call(expired, op, { uid }, 401);
  }
  for (const [account, status] of [[staff, 200], [expired, 403], [trader, 403]]) {
    const response = await fetch(firestoreUrl + 'meta/liveSync', { headers: { Authorization: 'Bearer ' + account.idToken } });
    assert.equal(response.status, status, 'Live sync requires a current staff session');
  }
}

async function checkInvitations(staff, trader, testClientUids) {
  const newClient = async () => {
    const client = await identityCall('signUp', 'invite-' + randomUUID() + '@example.test');
    testClientUids.push(client.localId);
    return client;
  };
  const generate = kind => call(staff, 'admin.invite.refresh', { kind, requestId: randomUUID() });
  const legacyCode = 'BONUS-' + 'Z'.repeat(20);
  await db.collection('staff').doc(staff.localId).update({ fundedInvitationCode: legacyCode });
  const legacyClient = await newClient();
  assert.deepEqual((await call(legacyClient, 'access', { inviteCode: legacyCode })).wallet, { available: 200000, held: 0 });

  const { code: firstStandard } = await generate('standard');
  assert.match(firstStandard, /^[A-HJ-NP-Z2-9]{8}$/);
  const request = { kind: 'funded', requestId: randomUUID() };
  const funded = await call(staff, 'admin.invite.refresh', request);
  assert.match(funded.code, /^0[A-HJ-NP-Z2-9]{7}$/);
  assert.deepEqual(await call(staff, 'admin.invite.refresh', request), funded);
  assert.equal((await call(staff, 'admin.dashboard')).invitationCode, firstStandard);
  const retryClient = await newClient();
  await call(retryClient, 'access', { inviteCode: legacyCode }, 400);

  const { code: standard } = await generate('standard');
  assert.notEqual(standard, firstStandard);
  assert.equal((await call(staff, 'admin.dashboard')).fundedInvitationCode, funded.code);
  const regular = await newClient();
  assert.deepEqual((await call(regular, 'access', { inviteCode: standard })).wallet, { available: 0, held: 0 });
  assert.deepEqual((await call(trader, 'access', { inviteCode: funded.code })).wallet, { available: 0, held: 0 });

  const bonusClient = await newClient();
  const registration = { inviteCode: '  ' + funded.code.toLowerCase() + '  ', amount: 1 };
  const attempts = await Promise.all([call(bonusClient, 'access', registration), call(bonusClient, 'access', registration)]);
  for (const result of attempts) {
    assert.deepEqual(result.wallet, { available: 200000, held: 0 });
    assert.equal(result.profile.assignedTo, staff.localId);
    assert.equal(result.profile.invitation_code, '2000 Invitation Code');
  }
  const { rows } = await call(bonusClient, 'list', { list: 'ledger' });
  assert.deepEqual(rows.map(row => [row.kind, row.availableDelta]), [['Invitation bonus', 200000]]);
  const secondBonusClient = await newClient();
  assert.deepEqual((await call(secondBonusClient, 'access', { inviteCode: funded.code })).wallet, { available: 200000, held: 0 });
  assert.equal((await call(staff, 'admin.dashboard')).fundedInvitationCode, funded.code);

  const { code: replacement } = await generate('funded');
  assert.notEqual(replacement, funded.code);
  const dashboard = await call(staff, 'admin.dashboard');
  assert.equal(dashboard.invitationCode, standard);
  assert.equal(dashboard.fundedInvitationCode, replacement);
  await call(retryClient, 'access', { inviteCode: funded.code }, 400);
  const currentCode = { inviteCode: replacement };
  assert.deepEqual((await call(retryClient, 'access', currentCode)).wallet, { available: 200000, held: 0 });
  assert.deepEqual((await call(bonusClient, 'access', currentCode)).wallet, { available: 200000, held: 0 });
}

async function checkClientReport(staff, trader, testClientUids) {
  const email = 'report-' + randomUUID() + '@example.test';
  const client = await identityCall('signUp', email);
  const uid = client.localId;
  testClientUids.push(uid);
  const started = await call(client, 'access', { name: 'Report Test' });
  const from = Date.UTC(2026, 0, 12), until = Date.UTC(2026, 0, 13);
  const setup = db.batch();
  setup.update(db.collection('wallets').doc(uid), { available: 123450, held: 25000 });
  for (const [createdAt, outcome, pnl] of [[from - 1, 'win', 1000], [from, 'win', 35000], [from + 1, 'loss', -10000], [from + 1, 'refund', 0], [until, 'loss', -3000]]) {
    setup.create(db.collection('trades').doc(), { uid, createdAt, outcome, pnl, status: 'settled' });
  }
  for (const [createdAt, kind, status, amount] of [[from, 'deposit', 'approved', 50000], [from + 1, 'withdrawal', 'approved', 15000], [from + 2, 'deposit', 'pending', 44000], [until, 'deposit', 'approved', 5000]]) {
    setup.create(db.collection('funding').doc(), { uid, createdAt, kind, status, amount });
  }
  await setup.commit();

  const { generatedAt, ...report } = await call(staff, 'admin.client.report', { uid, from, until });
  assert.ok(Number.isSafeInteger(generatedAt));
  assert.deepEqual(report, {
    period: { from, until },
    client: { uid, number: started.profile.clientNumber, name: 'Report Test', email, status: 'Active', vipLevel: 'VIP1', reputation: 100, currency: 'INR' },
    available: 123450, held: 25000, deposits: 50000, withdrawals: 15000, netProfit: 25000, trades: 3, wins: 1, losses: 1,
  });
  const allActivity = await call(staff, 'admin.client.report', { uid });
  assert.equal(allActivity.trades, 5);
  assert.equal(allActivity.deposits, 55000);
  await call(staff, 'admin.client.report', { uid, from: until, until }, 400);
  await call(trader, 'admin.client.report', { uid }, 403);
  await call(staff, 'admin.client.report', { uid: staff.localId }, 403);
}

async function main() {
  const trader = await identityCall('signUp', email);
  const staff = await identityCall('signInWithPassword', 'staff@example.test');
  const uid = trader.localId;
  const testClientUids = [uid];
  let otherStaff;
  try {
    await call(null, 'access', {}, 401);
    await call(trader, 'admin.access', {}, 403);
    const start = await call(trader, 'access');
    assert.deepEqual(start.wallet, { available: 0, held: 0 });
    const clientNumber = start.profile.clientNumber;
    assert.ok(Number.isSafeInteger(clientNumber) && clientNumber > 0);
    assert.equal((await call(trader, 'access')).profile.clientNumber, clientNumber);
    const reference = String(clientNumber);
    assert.deepEqual(await call(staff, 'admin.client.resolve', { reference }), { uid, clientNumber });
    assert.deepEqual(await call(staff, 'admin.client.resolve', { reference: uid }), { uid, clientNumber });
    await call(trader, 'admin.client.resolve', { reference }, 403);
    assert.deepEqual((await call(trader, 'list', { list: 'ledger' })).rows, []);
    await checkAdminSession(staff, trader, uid);
    await checkInvitations(staff, trader, testClientUids);
    await checkClientReport(staff, trader, testClientUids);

    const adminCreatedEmail = 'admin-created-' + randomUUID() + '@example.test';
    const adminCreated = await call(staff, 'admin.client.create', { name: 'Test Client', email: adminCreatedEmail, password });
    testClientUids.push(adminCreated.uid);
    const adminCreatedClient = await identityCall('signInWithPassword', adminCreatedEmail);
    const createdProfile = await db.collection('profiles').doc(adminCreated.uid).get();
    const createdNumber = createdProfile.get('clientNumber');
    assert.ok(Number.isSafeInteger(createdNumber) && createdNumber > clientNumber);
    const createdAccess = await call(adminCreatedClient, 'access');
    assert.equal(createdAccess.profile.clientNumber, createdNumber);
    assert.deepEqual(createdAccess.wallet, { available: 0, held: 0 });
    assert.deepEqual((await call(adminCreatedClient, 'list', { list: 'ledger' })).rows, []);

    const legacy = await identityCall('signUp', 'legacy-' + randomUUID() + '@example.test');
    testClientUids.push(legacy.localId);
    await db.collection('profiles').doc(legacy.localId).set({ uid: legacy.localId, name: 'Legacy Client', createdAt: Date.now(), assignedTo: staff.localId });
    const [legacyList, legacyRoute] = await Promise.all([
      call(staff, 'admin.clients', { search: legacy.localId }),
      call(staff, 'admin.client.resolve', { reference: legacy.localId }),
    ]);
    assert.ok(legacyRoute.clientNumber > createdNumber);
    assert.equal(legacyList.rows.find(row => row.id === legacy.localId)?.clientNumber, legacyRoute.clientNumber);
    assert.deepEqual(await call(staff, 'admin.client.resolve', { reference: String(legacyRoute.clientNumber) }), legacyRoute);
    const byNumber = await call(staff, 'admin.clients', { search: '#' + legacyRoute.clientNumber });
    assert.equal(byNumber.rows[0]?.id, legacy.localId);

    const unauthorised = await fetch(firestoreUrl + 'wallets/' + uid, {
      headers: { Authorization: 'Bearer ' + trader.idToken },
    });
    assert.equal(unauthorised.status, 403, 'Direct reads obey Firestore rules');

    await call(null, 'client.activity', { ageMs: 0 }, 401);
    await call(staff, 'client.activity', { ageMs: 0 }, 403);
    await call(trader, 'client.activity', { ageMs: -1 }, 400);
    await call(trader, 'admin.clients.activity', { uids: [uid] }, 403);
    const previousActivity = await call(trader, 'client.activity', { ageMs: 20_000 });
    const resumedActivity = await call(trader, 'client.activity', { ageMs: 0, uid: staff.localId });
    assert.ok(resumedActivity.lastActiveAt > previousActivity.lastActiveAt);
    const delayedActivity = await call(trader, 'client.activity', { ageMs: 45_000 });
    assert.equal(delayedActivity.lastActiveAt, resumedActivity.lastActiveAt);
    assert.deepEqual((await call(staff, 'admin.clients.activity', { uids: [uid] })).rows, [
      { id: uid, lastActiveAt: resumedActivity.lastActiveAt },
    ]);
    const listedClient = (await call(staff, 'admin.clients', { search: uid })).rows.find(row => row.id === uid);
    assert.equal(listedClient?.lastActiveAt, resumedActivity.lastActiveAt);

    await call(staff, 'admin.client.adjust', { uid, amount: 100000, reason: 'Fund integration test wallet', requestId: randomUUID() });
    assert.deepEqual((await call(trader, 'access')).wallet, { available: 100000, held: 0 });

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

    const qrImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS94AAAAASUVORK5CYII=';
    const depositSettings = {
      uid,
      upiId: 'qoption-test@upi',
      upiName: 'Qoption Test',
      upiQrImage: qrImage,
      usdtBscAddress: '0x1111111111111111111111111111111111111111',
      usdtBscQrImage: qrImage,
      requestId: randomUUID(),
    };
    await call(trader, 'admin.depositSettings.update', depositSettings, 403);
    await call(staff, 'admin.depositSettings.update', { uid, upiQrImage: 'data:image/svg+xml;base64,PHN2Zz4=', requestId: randomUUID() }, 400);
    const updated = await call(staff, 'admin.depositSettings.update', depositSettings);
    assert.deepEqual((await call(staff, 'admin.depositSettings', { uid })).depositSettings, updated.depositSettings);
    assert.deepEqual((await call(trader, 'home')).depositSettings, updated.depositSettings);
    assert.equal(updated.depositSettings.usdtBscQrImage, qrImage);
    assert.equal(updated.depositSettings.upiQrImage, qrImage);
    assert.equal(updated.depositSettings.upiId, 'qoption-test@upi');
    assert.equal(updated.depositSettings.upiName, 'Qoption Test');
    assert.ok((await db.collection('userSync').doc(uid).get()).get('depositSettingsAt') > 0);
    const differentTrader = await identityCall('signInWithPassword', 'trader@example.test');
    assert.notEqual((await call(differentTrader, 'home')).depositSettings.upiId, 'qoption-test@upi');

    const depositInput = { kind: 'deposit', amount: 2500, method: 'UPI / BANK', requestId: randomUUID() };
    await call(trader, 'funding.request', depositInput, 400);
    const deposit = await call(trader, 'funding.request', { ...depositInput, referenceNumber: ' 123456789012 ' });
    const retriedDeposit = await call(trader, 'funding.request', { ...depositInput, referenceNumber: '123456789012' });
    assert.equal(retriedDeposit.id, deposit.id);
    await call(trader, 'funding.request', { ...depositInput, referenceNumber: '123456789013' }, 409);
    const staffDeposits = await call(staff, 'admin.funding', { kind: 'deposit', status: 'pending' });
    assert.equal(staffDeposits.rows.find(row => row.id === deposit.id)?.referenceNumber, '123456789012');
    const decision = { id: deposit.id, status: 'approved', reason: 'Verified test request', requestId: randomUUID() };
    await call(trader, 'admin.funding.decide', decision, 403);
    await call(staff, 'admin.funding.decide', decision);
    await call(staff, 'admin.funding.decide', decision);
    assert.equal((await call(trader, 'home')).wallet.available, settled.wallet.available + 2500);
    await call(staff, 'admin.funding.decide', { ...decision, requestId: randomUUID() }, 400);

    const [matchingDeposits, matchingWithdrawals, matchingTrades, matchingAudit] = await Promise.all([
      call(staff, 'admin.funding', { kind: 'deposit', status: 'approved', search: '123456789012' }),
      call(staff, 'admin.funding', { kind: 'withdrawal', status: 'cancelled', search: email.toUpperCase() }),
      call(staff, 'admin.trades', { search: 'BTC/USDT' }),
      call(staff, 'admin.audit', { search: 'Verified test request' }),
    ]);
    assert.ok(matchingDeposits.rows.some(row => row.id === deposit.id));
    assert.deepEqual(matchingWithdrawals.rows.map(row => row.id), [withdrawal.id]);
    assert.ok(matchingTrades.rows.some(row => row.id === placed.id));
    assert.ok(matchingAudit.rows.some(row => row.uid === uid && row.event === 'Deposit approved'));
    const unreadMarker = async viewer => (await call(viewer, 'admin.clients', { search: uid })).rows.find(row => row.id === uid)?.supportUnreadMarker;
    await db.collection('profiles').doc(uid).update({ supportNeedsReply: true });
    await db.collection('messages').add({ uid, sender: 'You', message: 'Legacy unread message', createdAt: Date.now() - 1000 });
    assert.equal(await unreadMarker(staff), 'legacy');
    const legacyThread = await call(staff, 'admin.messages', { uid });
    assert.equal(legacyThread.supportUnreadMarker, 'legacy');
    assert.equal((await call(staff, 'admin.messages.read', { uid, marker: 'legacy' })).read, true);
    assert.equal(await unreadMarker(staff), null);

    const sent = await call(trader, 'message.send', { message: 'Test message', requestId: randomUUID() });
    assert.equal(await unreadMarker(staff), sent.id);
    const thread = await call(staff, 'admin.messages', { uid });
    assert.equal(thread.rows[0].message, 'Test message');
    assert.equal(thread.supportUnreadMarker, sent.id);
    await call(trader, 'admin.messages.read', { uid, marker: sent.id }, 403);
    assert.equal((await call(staff, 'admin.messages.read', { uid, marker: sent.id })).read, true);
    assert.equal(await unreadMarker(staff), null);
    assert.equal((await call(staff, 'admin.messages', { uid })).supportUnreadMarker, undefined);

    otherStaff = await identityCall('signUp', 'support-' + randomUUID() + '@example.test');
    const otherStaffRef = db.collection('staff').doc(otherStaff.localId);
    await otherStaffRef.set({ active: true, roles: ['support'], allClients: false });
    await call(otherStaff, 'admin.invite.refresh', { kind: 'funded', requestId: randomUUID() }, 403);
    await call(otherStaff, 'admin.client.resolve', { reference }, 403);
    await call(otherStaff, 'admin.client.resolve', { reference: uid }, 403);
    await call(otherStaff, 'admin.client.report', { uid }, 403);
    assert.deepEqual((await call(otherStaff, 'admin.clients.activity', { uids: [uid] })).rows, []);
    await otherStaffRef.update({ allClients: true });
    await call(otherStaff, 'admin.client.report', { uid }, 403);
    assert.equal(await unreadMarker(otherStaff), sent.id);

    const followup = await call(trader, 'message.send', { message: 'Follow-up', requestId: randomUUID() });
    assert.equal((await call(staff, 'admin.messages.read', { uid, marker: sent.id })).read, false);
    assert.equal(await unreadMarker(staff), followup.id);
    await call(staff, 'admin.message.send', { uid, message: 'Support reply', requestId: randomUUID() });
    const customerThread = await call(trader, 'list', { list: 'messages' });
    assert.ok(customerThread.rows.some(row => row.sender === 'Support' && row.message === 'Support reply'));
    assert.equal(await unreadMarker(staff), followup.id);
    assert.equal((await call(staff, 'admin.messages.read', { uid, marker: followup.id })).read, true);
    assert.equal(await unreadMarker(staff), null);

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
    const search = { kind: 'deposit', status: 'pending', search: 'UID: ' + uid };
    const firstMatch = await call(staff, 'admin.funding', search);
    const secondMatch = await call(staff, 'admin.funding', { ...search, cursor: firstMatch.cursor });
    assert.equal(firstMatch.rows.length, 25);
    assert.equal(secondMatch.rows.length, 3);
    assert.equal(new Set([...firstMatch.rows, ...secondMatch.rows].map(row => row.id)).size, 28);
    assert.ok([...firstMatch.rows, ...secondMatch.rows].every(row => row.uid === uid));
    await call(staff, 'admin.funding', { ...search, search: 'another query', cursor: firstMatch.cursor }, 400);
    const pushed = await call(staff, 'admin.notifications.push', { uid, title: 'Maintenance Alert', message: 'Scheduled check', requestId: randomUUID() });
    const notifsBefore = await call(trader, 'list', { list: 'notifications' });
    const targetNotif = notifsBefore.rows.find(row => row.id === pushed.id);
    assert.ok(targetNotif, 'Pushed notification is listed for trader');
    assert.equal(targetNotif.read, false);
    await call(trader, 'notifications.read', { id: pushed.id, requestId: randomUUID() });
    const notifsAfter = await call(trader, 'list', { list: 'notifications' });
    const readNotif = notifsAfter.rows.find(row => row.id === pushed.id);
    assert.ok(readNotif, 'Notification remains in list after being marked as read');
    assert.equal(readNotif.read, true);

    const beforeFreeze = (await call(trader, 'home')).wallet;
    const setFreeze = options => call(staff, 'admin.client.update', { uid, ...options, requestId: randomUUID() });
    const withdraw = (amount, expected = 200) => call(trader, 'funding.request', { kind: 'withdrawal', amount, requestId: randomUUID() }, expected);
    const place = (amount, expected = 200) => call(trader, 'trade.place', { ...tradeInput, amount, requestId: randomUUID() }, expected);
    await setFreeze({ frozen: true });
    assert.equal((await call(trader, 'home')).profile.frozen, true);
    await place(100, 400);
    await withdraw(100, 400);
    await setFreeze({ frozen: false, freezeAmount: true, frozenAmount: 0 });
    await withdraw(100, 400);

    const available = 2000;
    const amountToFreeze = beforeFreeze.available - available;
    await setFreeze({ freezeAmount: true, frozenAmount: amountToFreeze / 100 });
    const partiallyFrozen = await call(trader, 'home');
    assert.equal(partiallyFrozen.profile.frozenAmount, amountToFreeze);
    assert.deepEqual(partiallyFrozen.wallet, beforeFreeze);
    await place(available + 1, 400);
    await withdraw(available + 1, 400);
    const remainingWithdrawal = await withdraw(available);
    assert.equal((await call(trader, 'home')).wallet.available, amountToFreeze);
    await place(100, 400);
    await call(trader, 'funding.cancel', { id: remainingWithdrawal.id, requestId: randomUUID() });
    await place(available);
    assert.equal((await call(trader, 'home')).wallet.available, amountToFreeze);

    await setFreeze({ freezeAmount: false, frozenAmount: 0 });
    const unfrozen = await call(trader, 'home');
    assert.equal(unfrozen.profile.freezeAmount, false);
    assert.equal(unfrozen.profile.frozenAmount, 0);
    const unfrozenWithdrawal = await withdraw(100);
    await call(trader, 'funding.cancel', { id: unfrozenWithdrawal.id, requestId: randomUUID() });

    console.log('Firebase integration passed: invitation bonuses, zero opening balances, account separation, rules, client activity, trades, funding references, deposit settings, support chat, notifications, wallet freezes, and pagination.');
  } finally {
    const cleanup = db.batch();
    for (const name of ['trades', 'funding', 'ledger', 'messages', 'notifications', 'audit', 'operationReceipts']) {
      const snapshot = await db.collection(name).where('uid', 'in', testClientUids).get();
      for (const doc of snapshot.docs) cleanup.delete(doc.ref);
    }
    for (const clientUid of testClientUids) {
      for (const name of ['profiles', 'wallets', 'writeLimits', 'userSync', 'depositSettings']) cleanup.delete(db.collection(name).doc(clientUid));
    }
    cleanup.delete(db.collection('staff').doc(staff.localId).collection('supportReads').doc(uid));
    if (otherStaff) cleanup.delete(db.collection('staff').doc(otherStaff.localId));
    await cleanup.commit();
    await Promise.all(testClientUids.map(clientUid => auth.deleteUser(clientUid)));
    if (otherStaff) await auth.deleteUser(otherStaff.localId);
  }
}
await main();
