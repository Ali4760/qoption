import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore, type DocumentData, type Query, type Transaction } from 'firebase-admin/firestore';
import { defineBoolean, defineString } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { demoPrice, durations, findAsset, profitPercent } from './market';

initializeApp();
const db = getFirestore();
const local = process.env.FUNCTIONS_EMULATOR === 'true';
const requireAppCheck = defineBoolean('REQUIRE_APP_CHECK', { default: true });
const region = defineString('QOPTION_REGION', { default: 'us-central1' });
const openingAmount = 100000;
const maxAmount = 10000000;
const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
type Data = Record<string, unknown>;
type Actor = { uid: string; staff: string[]; allClients: boolean };
type Mutation = (tx: Transaction) => Promise<Data>;

function fail(code: ConstructorParameters<typeof HttpsError>[0], message: string): never {
  throw new HttpsError(code, message);
}
function record(value: unknown): Data {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-argument', 'Invalid request.');
  return value as Data;
}
function text(value: unknown, max: number, min = 1): string {
  if (typeof value !== 'string') fail('invalid-argument', 'Check the required fields.');
  const result = value.trim();
  if (result.length < min || result.length > max) fail('invalid-argument', 'Check the field length.');
  return result;
}
function identifier(value: unknown): string {
  const result = text(value, 128);
  if (!idPattern.test(result)) fail('invalid-argument', 'Invalid record identifier.');
  return result;
}
function cents(value: unknown, signed = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Math.abs(value) > maxAmount || (signed ? value === 0 : value < 100)) {
    fail('invalid-argument', 'Enter an amount within the practice limits.');
  }
  return value;
}
function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const profile = (uid: string) => db.collection('profiles').doc(uid);
const wallet = (uid: string) => db.collection('wallets').doc(uid);

function ledger(tx: Transaction, uid: string, entryId: string, kind: string, availableDelta: number, heldDelta: number, now: number, note: string) {
  tx.create(db.collection('ledger').doc(entryId), { uid, kind, availableDelta, heldDelta, createdAt: now, note });
}
function audit(tx: Transaction, actor: Actor, target: string, event: string, reason: string, now: number) {
  tx.create(db.collection('audit').doc(), { uid: target, actor: actor.uid, event, reason, createdAt: now });
}
function changeFunds(tx: Transaction, uid: string, current: DocumentData | undefined, availableDelta: number, heldDelta: number) {
  if (!current) fail('failed-precondition', 'Open the workspace before changing the practice wallet.');
  const available = current.available + availableDelta;
  const held = current.held + heldDelta;
  if (!Number.isSafeInteger(available) || !Number.isSafeInteger(held) || available < 0 || held < 0) {
    fail('failed-precondition', 'The wallet cannot cover this operation.');
  }
  tx.update(wallet(uid), { available, held });
}

async function upsertProfile(uid: string, email: string) {
  await db.runTransaction(async tx => {
    const [user, balance] = await Promise.all([tx.get(profile(uid)), tx.get(wallet(uid))]);
    if (!user.exists) {
      const name = email.split('@')[0]?.slice(0, 40) || 'Trader';
      tx.create(profile(uid), { uid, email, name, nameSearch: name.toLowerCase(), createdAt: Date.now(), tradeEnabled: true, withdrawalEnabled: true, assignedTo: '' });
    }
    if (!balance.exists) {
      tx.create(wallet(uid), { available: openingAmount, held: 0 });
      ledger(tx, uid, 'opening_' + uid, 'Opening balance', openingAmount, 0, Date.now(), 'Practice trading credit');
    }
  });
}

async function actor(request: CallableRequest, staffRequired: boolean): Promise<Actor> {
  if (!request.auth) fail('unauthenticated', 'Sign in to continue.');
  const uid = request.auth.uid;
  if (!staffRequired) return { uid, staff: [], allClients: false };
  const staff = (await db.collection('staff').doc(uid).get()).data();
  if (!staff?.active || !Array.isArray(staff.roles) || !staff.roles.some((role: string) => ['admin', 'finance', 'support'].includes(role))) {
    fail('permission-denied', 'This account has no staff access.');
  }
  if (!local && !request.auth.token.email_verified) {
    fail('permission-denied', 'Verify your email to access staff tools.');
  }
  return { uid, staff: staff.roles, allClients: staff.allClients === true };
}

function requireRole(user: Actor, role: string) {
  if (!user.staff.includes(role)) fail('permission-denied', 'Your staff role cannot perform this action.');
}

function checkScope(user: Actor, client: DocumentData | undefined) {
  if (!client || (!user.allClients && client.assignedTo !== user.uid)) fail('permission-denied', 'This client is outside your staff scope.');
}
async function checkStaff(tx: Transaction, user: Actor, role: string) {
  const current = (await tx.get(db.collection('staff').doc(user.uid))).data();
  if (!current?.active || !current.roles?.includes(role) || (current.allClients === true) !== user.allClients) {
    fail('permission-denied', 'Your staff access changed. Refresh and try again.');
  }
}

async function mutate(user: Actor, data: Data, operation: string, parameters: unknown, apply: Mutation) {
  const key = identifier(data.requestId);
  const fingerprint = digest(parameters);
  const ref = db.collection('operationReceipts').doc(digest([user.uid, operation, key]));
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const rate = db.collection('writeLimits').doc(user.uid);
  return db.runTransaction(async tx => {
    const [previous, active] = await Promise.all([tx.get(ref), tx.get(rate)]);
    if (previous.exists) {
      if (previous.get('fingerprint') !== fingerprint) fail('already-exists', 'This request ID belongs to another submission.');
      return previous.get('result') as Data;
    }
    const count = active.get('minute') === minute ? Number(active.get('count')) : 0;
    if (count >= 24) fail('resource-exhausted', 'Too many changes. Try again in a minute.');
    const result = await apply(tx);
    tx.set(rate, { minute, count: count + 1 });
    tx.create(ref, { uid: user.uid, fingerprint, result, createdAt: now });
    return result;
  });
}

async function placeTrade(user: Actor, data: Data) {
  const asset = findAsset(data.symbol);
  const duration = Number(data.duration);
  const direction = data.direction;
  if (!asset || !durations.some(value => value === duration) || (direction !== 'up' && direction !== 'down')) {
    fail('invalid-argument', 'Choose a supported market, direction, and duration.');
  }
  const stake = cents(data.amount);
  const now = Date.now(), dueAt = now + 1000 * duration;
  const entry = demoPrice(asset, now);
  const trade = db.collection('trades').doc();
  return mutate(user, data, 'trade.place', [asset.symbol, duration, direction, stake], async tx => {
    const [person, balance] = await Promise.all([tx.get(profile(user.uid)), tx.get(wallet(user.uid))]);
    if (!person.get('tradeEnabled')) fail('failed-precondition', 'Trading is paused for this account.');
    changeFunds(tx, user.uid, balance.data(), -stake, stake);
    tx.create(trade, { uid: user.uid, symbol: asset.symbol, direction, duration, stake, entry, dueAt, createdAt: now, status: 'open', feedVersion: 1, profitPercent });
    ledger(tx, user.uid, 'trade_hold_' + trade.id, 'Trade hold', -stake, stake, now, asset.code + ' simulated trade');
    return { id: trade.id, entry, dueAt };
  });
}

async function settle(id: string, now: number) {
  const ref = db.collection('trades').doc(id);
  await db.runTransaction(async tx => {
    const trade = (await tx.get(ref)).data();
    if (!trade || trade.status !== 'open' || trade.dueAt > now) return;
    const balance = (await tx.get(wallet(trade.uid))).data();
    const asset = findAsset(trade.symbol);
    const exit = asset && trade.feedVersion === 1 ? demoPrice(asset, trade.dueAt) : null;
    const outcome = exit === null || exit === trade.entry ? 'refund'
      : ((exit > trade.entry) === (trade.direction === 'up') ? 'win' : 'loss');
    const payout = outcome === 'win' ? trade.stake + Math.round(trade.stake * trade.profitPercent / 100) : outcome === 'refund' ? trade.stake : 0;
    changeFunds(tx, trade.uid, balance, payout, -trade.stake);
    tx.update(ref, { status: 'settled', outcome, exit, payout, pnl: payout - trade.stake, settledAt: now });
    ledger(tx, trade.uid, 'trade_result_' + id, 'Trade ' + outcome, payout, -trade.stake, now, (asset?.code || trade.symbol) + ' simulated trade');
  });
}
async function settleDue(uid?: string) {
  const now = Date.now();
  let query: Query = db.collection('trades').where('status', '==', 'open').where('dueAt', '<=', now);
  if (uid) query = query.where('uid', '==', uid);
  const due = await query.orderBy('dueAt').limit(uid ? 12 : 50).get();
  for (const trade of due.docs) await settle(trade.id, now);
}

async function askFunding(user: Actor, data: Data) {
  const kind = data.kind;
  if (kind !== 'deposit' && kind !== 'withdrawal') fail('invalid-argument', 'Invalid funding type.');
  const amount = cents(data.amount);
  const now = Date.now();
  const ref = db.collection('funding').doc();
  return mutate(user, data, 'funding.request', [kind, amount], async tx => {
    const [person, balance] = await Promise.all([tx.get(profile(user.uid)), tx.get(wallet(user.uid))]);
    if (!person.exists) fail('failed-precondition', 'Open the workspace before submitting a request.');
    if (kind === 'withdrawal') {
      if (!person.get('withdrawalEnabled')) fail('failed-precondition', 'Withdrawals are paused for this account.');
      changeFunds(tx, user.uid, balance.data(), -amount, amount);
      ledger(tx, user.uid, 'funding_hold_' + ref.id, 'Withdrawal hold', -amount, amount, now, 'Simulated withdrawal');
    }
    tx.create(ref, { uid: user.uid, kind, amount, createdAt: now, status: 'pending', method: 'Simulated transfer' });
    return { id: ref.id };
  });
}

async function decideFunding(user: Actor, data: Data, asStaff: boolean) {
  const id = identifier(data.id);
  const state = asStaff ? data.status : 'cancelled';
  if (asStaff) requireRole(user, 'finance');
  if (state !== 'approved' && state !== 'rejected' && state !== 'cancelled') fail('invalid-argument', 'Invalid funding decision.');
  if (asStaff && state === 'cancelled') fail('invalid-argument', 'Choose approve or reject.');
  const reason = asStaff ? text(data.reason, 240, 3) : 'Cancelled by account owner';
  const now = Date.now();
  return mutate(user, data, 'funding.decide', [id, state, reason], async tx => {
    if (asStaff) await checkStaff(tx, user, 'finance');
    const ref = db.collection('funding').doc(id);
    const request = (await tx.get(ref)).data();
    if (!request) fail('not-found', 'Funding request was not found.');
    if (asStaff) checkScope(user, (await tx.get(profile(request.uid))).data());
    else if (request.uid !== user.uid || request.kind !== 'withdrawal') fail('permission-denied', 'Only the owner may cancel a pending withdrawal.');
    if (request.status !== 'pending') fail('failed-precondition', 'This request has already been decided.');
    const balance = (await tx.get(wallet(request.uid))).data();
    const heldDelta = request.kind === 'withdrawal' ? -request.amount : 0;
    const availableDelta = (request.kind === 'deposit' && state === 'approved') || (request.kind === 'withdrawal' && state !== 'approved') ? request.amount : 0;
    changeFunds(tx, request.uid, balance, availableDelta, heldDelta);
    tx.update(ref, { status: state, reason, decidedAt: now });
    ledger(tx, request.uid, 'funding_decision_' + id, request.kind + ' ' + state, availableDelta, heldDelta, now, 'Simulated transfer');
    if (asStaff) audit(tx, user, request.uid, request.kind + ' ' + state, reason, now);
    return { id, status: state };
  });
}

async function page(query: Query, data: Data, scope: unknown, field = 'createdAt', ascending = false) {
  const direction = ascending ? 'asc' : 'desc';
  const size = 25;
  let sorted = query.orderBy(field, direction).orderBy(FieldPath.documentId(), direction);
  const key = digest(scope);
  if (data.cursor) {
    try {
      const cursor = record(JSON.parse(Buffer.from(text(data.cursor, 900), 'base64url').toString('utf8')));
      if (cursor.key !== key || (ascending ? typeof cursor.value !== 'string' : typeof cursor.value !== 'number')) throw new Error('bad cursor');
      sorted = sorted.startAfter(cursor.value, identifier(cursor.id));
    } catch { fail('invalid-argument', 'Reload the list from the first page.'); }
  }
  const snapshots = (await sorted.limit(size + 1).get()).docs;
  const docs = snapshots.slice(0, size);
  const last = docs.at(-1);
  const cursor = snapshots.length > size && last
    ? Buffer.from(JSON.stringify({ key, value: last.get(field), id: last.id })).toString('base64url') : null;
  return { rows: docs.map(doc => ({ ...doc.data(), id: doc.id })), cursor };
}
const own = (collection: string, uid: string) => db.collection(collection).where('uid', '==', uid);
async function home(user: Actor) {
  await settleDue(user.uid);
  const [person, funds, active] = await Promise.all([
    profile(user.uid).get(), wallet(user.uid).get(),
    own('trades', user.uid).where('status', '==', 'open').orderBy('createdAt', 'desc').limit(8).get(),
  ]);
  return { profile: person.data(), wallet: funds.data(), active: active.docs.map(doc => ({ ...doc.data(), id: doc.id })), serverTime: Date.now() };
}

async function message(user: Actor, data: Data, asStaff: boolean) {
  if (asStaff) requireRole(user, 'support');
  const target = asStaff ? identifier(data.uid) : user.uid;
  const content = text(data.message, 1000);
  return mutate(user, data, 'message.send', [target, content, asStaff], async tx => {
    if (asStaff) {
      await checkStaff(tx, user, 'support');
      checkScope(user, (await tx.get(profile(target))).data());
    }
    const ref = db.collection('messages').doc();
    tx.create(ref, { uid: target, sender: asStaff ? 'Support' : 'You', message: content, createdAt: Date.now() });
    return { id: ref.id };
  });
}
async function updateProfile(user: Actor, data: Data) {
  const name = text(data.name, 50, 2);
  return mutate(user, data, 'profile.update', [name], async tx => {
    tx.update(profile(user.uid), { name, nameSearch: name.toLowerCase() });
    return { name };
  });
}

async function staffQuery(user: Actor, collection: string) {
  let query: Query = db.collection(collection);
  if (user.allClients) return query;
  if (collection === 'profiles') return query.where('assignedTo', '==', user.uid);
  const assigned = (await db.collection('profiles').where('assignedTo', '==', user.uid).limit(31).get()).docs;
  if (assigned.length > 30) fail('failed-precondition', 'This staff scope exceeds the prototype assignment limit.');
  return query.where('uid', 'in', assigned.length ? assigned.map(doc => doc.id) : ['__empty_staff_scope__']);
}

async function adminOverview(user: Actor) {
  const [clients, trades, funding] = await Promise.all([
    staffQuery(user, 'profiles'), staffQuery(user, 'trades'), staffQuery(user, 'funding'),
  ]);
  const [clientCount, tradeCount, deposits, withdrawals] = await Promise.all([
    clients.count().get(), trades.where('status', '==', 'open').count().get(),
    funding.where('kind', '==', 'deposit').where('status', '==', 'pending').count().get(),
    funding.where('kind', '==', 'withdrawal').where('status', '==', 'pending').count().get(),
  ]);
  const [recent, pending] = await Promise.all([
    user.staff.includes('admin') ? trades.orderBy('createdAt', 'desc').limit(4).get() : null,
    user.staff.includes('finance') ? funding.where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(4).get() : null,
  ]);
  return { clients: clientCount.data().count, trades: tradeCount.data().count, deposits: deposits.data().count, withdrawals: withdrawals.data().count,
    recent: recent?.docs.map(doc => ({ ...doc.data(), id: doc.id })) ?? [],
    pending: pending?.docs.map(doc => ({ ...doc.data(), id: doc.id })) ?? [] };
}
async function clientView(user: Actor, data: Data) {
  const uid = identifier(data.uid);
  const state = (await profile(uid).get()).data();
  checkScope(user, state);
  const funds = user.staff.some(role => role !== 'support') ? (await wallet(uid).get()).data() : undefined;
  const activity = await page(own(user.staff.some(role => role !== 'support') ? 'ledger' : 'messages', uid), data, ['client', user.uid, uid]);
  return { profile: state, wallet: funds ?? null, activity };
}
async function adminUpdate(user: Actor, data: Data, adjusting: boolean) {
  const role = adjusting ? 'finance' : 'admin';
  requireRole(user, role);
  const uid = identifier(data.uid);
  const reason = text(data.reason, 240, 3);
  const delta = adjusting ? cents(data.amount, true) : 0;
  const tradeEnabled = data.tradeEnabled === true, withdrawalEnabled = data.withdrawalEnabled === true;
  if (!adjusting && (typeof data.tradeEnabled !== 'boolean' || typeof data.withdrawalEnabled !== 'boolean')) fail('invalid-argument', 'Invalid restriction.');
  return mutate(user, data, adjusting ? 'admin.adjust' : 'admin.restrict', [uid, reason, delta, tradeEnabled, withdrawalEnabled], async tx => {
    await checkStaff(tx, user, role);
    checkScope(user, (await tx.get(profile(uid))).data());
    const now = Date.now();
    if (adjusting) {
      changeFunds(tx, uid, (await tx.get(wallet(uid))).data(), delta, 0);
      ledger(tx, uid, db.collection('ledger').doc().id, 'Staff adjustment', delta, 0, now, reason);
    } else tx.update(profile(uid), { tradeEnabled, withdrawalEnabled });
    audit(tx, user, uid, adjusting ? 'Balance adjustment' : 'Restrictions updated', reason, now);
    return { uid };
  });
}

export const workspace = onCall({ region, enforceAppCheck: local ? false : requireAppCheck, maxInstances: 8 }, async request => {
  const data = record(request.data);
  const op = text(data.op, 64);
  const user = await actor(request, op.startsWith('admin.'));
  const staffWrite = ['admin.funding.decide', 'admin.client.restrict', 'admin.client.adjust', 'admin.message.send'].includes(op);
  if (!local && staffWrite && (!request.auth?.token.auth_time || Date.now() / 1000 - request.auth.token.auth_time > 1800)) {
    fail('permission-denied', 'Sign out and sign in again before applying a staff change.');
  }
  switch (op) {
    case 'access':
      await upsertProfile(user.uid, request.auth?.token.email || '');
      return home(user);
    case 'home': return home(user);
    case 'trade.place': return placeTrade(user, data);
    case 'funding.request': return askFunding(user, data);
    case 'funding.cancel': return decideFunding(user, data, false);
    case 'profile.update': return updateProfile(user, data);
    case 'notifications.read':
      return mutate(user, data, op, null, async tx => {
        const readAt = Date.now();
        tx.update(profile(user.uid), { notificationReadAt: readAt });
        return { readAt };
      });
    case 'message.send': return message(user, data, false);
    case 'list': {
      const list = text(data.list, 20);
      if (!['trades', 'funding', 'ledger', 'messages'].includes(list)) fail('invalid-argument', 'Invalid list.');
      if (list === 'trades' || list === 'ledger') await settleDue(user.uid);
      return page(own(list, user.uid), data, [list, user.uid]);
    }
    case 'admin.access': return { roles: user.staff };
    case 'admin.dashboard': return adminOverview(user);
    case 'admin.clients': {
      const search = text(data.search ?? '', 50, 0).toLowerCase();
      let query = await staffQuery(user, 'profiles');
      if (search) query = query.where('nameSearch', '>=', search).where('nameSearch', '<=', search + '\uF8FF');
      return page(query, data, [op, user.uid, search], search ? 'nameSearch' : 'createdAt', !!search);
    }
    case 'admin.funding': {
      requireRole(user, 'finance');
      const kind = data.kind, status = data.status;
      if ((kind !== 'deposit' && kind !== 'withdrawal') || !['pending', 'approved', 'rejected', 'cancelled', 'all'].includes(String(status))) fail('invalid-argument', 'Invalid filter.');
      let query = (await staffQuery(user, 'funding')).where('kind', '==', kind);
      if (status !== 'all') query = query.where('status', '==', status);
      return page(query, data, [op, user.uid, kind, status]);
    }
    case 'admin.trades':
      requireRole(user, 'admin');
      return page(await staffQuery(user, 'trades'), data, [op, user.uid]);
    case 'admin.audit':
      requireRole(user, 'admin');
      return page(await staffQuery(user, 'audit'), data, [op, user.uid]);
    case 'admin.client': return clientView(user, data);
    case 'admin.messages': {
      requireRole(user, 'support');
      const uid = identifier(data.uid);
      checkScope(user, (await profile(uid).get()).data());
      return page(own('messages', uid), data, [op, user.uid, uid]);
    }
    case 'admin.funding.decide': return decideFunding(user, data, true);
    case 'admin.client.restrict': return adminUpdate(user, data, false);
    case 'admin.client.adjust': return adminUpdate(user, data, true);
    case 'admin.message.send': return message(user, data, true);
    default: fail('not-found', 'This operation is unavailable.');
  }
});

export const reconcileTrades = onSchedule({ schedule: '* * * * *', region, maxInstances: 1 }, async () => {
  await settleDue();
});
