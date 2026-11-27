import { createHash, randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldPath, FieldValue, getFirestore, type DocumentData, type DocumentSnapshot, type Query, type Transaction } from 'firebase-admin/firestore';
import { defineBoolean, defineString } from 'firebase-functions/params';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { ClientReport, ClientReportPeriod } from './client-report';
import { demoPrice, durations, findAsset, isGateAsset, profitForDuration, profitPercent } from './market';
import { gateFeedVersion, gateTradePrice } from './gate-market';
import { invitationCodeAlphabet, invitationCodeLength, legacyFundedCodePrefix, shortFundedCodePattern, shortFundedCodePrefix } from './invitation-codes';
import { walletFreeze } from './wallet-freeze';
import { withdrawalReputationWarning } from './withdrawal-reputation';

initializeApp();
const db = getFirestore();
const local = process.env.FUNCTIONS_EMULATOR === 'true';
const requireAppCheck = defineBoolean('REQUIRE_APP_CHECK', { default: true });
const region = defineString('QOPTION_REGION', { default: 'us-central1' });
const staffSessionSeconds = 30 * 60;
const maxAmount = 100000000;
const invitationBonus = 200_000;
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
    fail('invalid-argument', 'Enter an amount within the allowed limits.');
  }
  return value;
}
function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function generateInviteCode(length = invitationCodeLength) {
  const bytes = randomBytes(length);
  return Array.from(bytes, b => invitationCodeAlphabet[b % invitationCodeAlphabet.length]).join('');
}
async function reserveFundedInviteCode(tx: Transaction) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = shortFundedCodePrefix + generateInviteCode(invitationCodeLength - shortFundedCodePrefix.length);
    const reservation = db.collection('issuedFundedInvitationCodes').doc(code);
    if ((await tx.get(reservation)).exists) continue;
    // Keep the reservation after rotation so a replaced code can never be issued again.
    tx.create(reservation, {});
    return code;
  }
  fail('resource-exhausted', 'Could not generate a unique 2000 invitation code. Try again.');
}
async function bumpSync(fields: Record<string, unknown>, userUids: string[] = []) {
  const now = Date.now();
  const tasks: Promise<unknown>[] = [
    db.collection('meta').doc('liveSync').set(fields, { merge: true }),
  ];
  for (const uid of new Set(userUids.filter(Boolean))) {
    tasks.push(db.collection('userSync').doc(uid).set({ updatedAt: now, ...fields }, { merge: true }));
  }
  await Promise.allSettled(tasks);
}

const profile = (uid: string) => db.collection('profiles').doc(uid);
const wallet = (uid: string) => db.collection('wallets').doc(uid);

function isClientNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function parseClientNumber(reference: string) {
  const number = Number(reference);
  return /^[1-9]\d*$/.test(reference) && isClientNumber(number) ? number : undefined;
}

async function reserveClientNumbers(tx: Transaction, count: number) {
  const ref = db.collection('meta').doc('clientNumbers');
  const counter = await tx.get(ref);
  let last: unknown = counter.get('last');
  if (!counter.exists) {
    const highest = await tx.get(db.collection('profiles').orderBy('clientNumber', 'desc').limit(1));
    last = highest.docs[0]?.get('clientNumber') ?? 0;
  }
  if (last !== 0 && !isClientNumber(last)) fail('internal', 'The client number counter is invalid.');
  const next = last + count;
  if (!Number.isSafeInteger(next)) fail('resource-exhausted', 'Client numbers are unavailable.');
  tx.set(ref, { last: next });
  return last + 1;
}

async function recordClientActivity(uid: string, ageMs: unknown) {
  if (typeof ageMs !== 'number' || !Number.isSafeInteger(ageMs) || ageMs < 0 || ageMs >= 600_000) {
    fail('invalid-argument', 'Invalid activity age.');
  }
  const observedAt = Date.now() - ageMs;
  return db.runTransaction(async tx => {
    const ref = profile(uid);
    const client = await tx.get(ref);
    if (!client.exists) fail('failed-precondition', 'Open the workspace before recording activity.');
    const previous = Number(client.get('lastActiveAt') || 0);
    if (observedAt - previous < 5000) return { lastActiveAt: previous };
    tx.update(ref, { lastActiveAt: observedAt });
    return { lastActiveAt: observedAt };
  });
}

async function adminClientActivity(user: Actor, uids: unknown) {
  if (!Array.isArray(uids) || !uids.length || uids.length > 25) fail('invalid-argument', 'Select up to 25 clients.');
  const refs = [...new Set(uids.map(identifier))].map(profile);
  const clients = await db.getAll(...refs);
  return {
    rows: clients
      .filter(client => client.exists && (user.allClients || client.get('assignedTo') === user.uid))
      .map(client => ({ id: client.id, lastActiveAt: Number(client.get('lastActiveAt') || 0) })),
    serverTime: Date.now(),
  };
}

function ledger(tx: Transaction, uid: string, entryId: string, kind: string, availableDelta: number, heldDelta: number, now: number, note: string) {
  tx.create(db.collection('ledger').doc(entryId), { uid, kind, availableDelta, heldDelta, createdAt: now, note });
}
function audit(tx: Transaction, actor: Actor, target: string, event: string, reason: string, now: number) {
  tx.create(db.collection('audit').doc(), { uid: target, actor: actor.uid, event, reason, createdAt: now });
}
function changeFunds(tx: Transaction, uid: string, current: DocumentData | undefined, availableDelta: number, heldDelta: number) {
  if (!current) fail('failed-precondition', 'Open the workspace before modifying wallet balance.');
  const available = current.available + availableDelta;
  const held = current.held + heldDelta;
  if (!Number.isSafeInteger(available) || !Number.isSafeInteger(held) || available < 0 || held < 0) {
    fail('failed-precondition', 'The wallet cannot cover this operation.');
  }
  tx.update(wallet(uid), { available, held });
}

async function upsertProfile(uid: string, email: string, nameParam?: string, inviteCodeParam?: string) {
  // Block staff members from creating/using a client profile — they must use the admin panel only.
  const staffDoc = await db.collection('staff').doc(uid).get();
  if (staffDoc.exists && staffDoc.get('active') === true) {
    fail('permission-denied', 'Staff accounts cannot access the client workspace. Use the admin panel.');
  }
  const trimmedName = nameParam?.trim().slice(0, 60);
  const trimmedInvite = inviteCodeParam?.trim().slice(0, 40);
  const normalizedInvite = trimmedInvite?.toUpperCase();
  const fundedInvite = normalizedInvite && (normalizedInvite.startsWith(legacyFundedCodePrefix) || shortFundedCodePattern.test(normalizedInvite))
    ? normalizedInvite : undefined;
  const created = await db.runTransaction(async tx => {
    const [user, balance] = await Promise.all([tx.get(profile(uid)), tx.get(wallet(uid))]);
    let invitedBy = '';
    const now = Date.now();
    if (!user.exists && !balance.exists && fundedInvite) {
      const matches = await tx.get(db.collection('staff').where('fundedInvitationCode', '==', fundedInvite).limit(2));
      const issuer = matches.docs[0]?.data();
      if (matches.size !== 1 || issuer?.active !== true || !Array.isArray(issuer.roles) || !issuer.roles.includes('admin')) {
        fail('invalid-argument', 'This 2000 invitation code is invalid or has been replaced.');
      }
      invitedBy = matches.docs[0].id;
    }
    if (!user.exists) {
      const name = trimmedName || email.split('@')[0]?.slice(0, 40) || 'Trader';
      const clientNumber = await reserveClientNumbers(tx, 1);
      tx.create(profile(uid), {
        uid,
        clientNumber,
        email,
        name,
        nameSearch: name.toLowerCase(),
        invitation_code: invitedBy ? '2000 Invitation Code' : fundedInvite ? '' : trimmedInvite || '',
        createdAt: now,
        tradeEnabled: true,
        withdrawalEnabled: true,
        assignedTo: invitedBy
      });
    } else {
      const updates: Record<string, unknown> = {};
      if (!isClientNumber(user.get('clientNumber'))) updates.clientNumber = await reserveClientNumbers(tx, 1);
      if (trimmedName) {
        updates.name = trimmedName;
        updates.nameSearch = trimmedName.toLowerCase();
      }
      if (trimmedInvite && !fundedInvite) {
        updates.invitation_code = trimmedInvite;
      }
      if (Object.keys(updates).length) tx.update(profile(uid), updates);
    }
    if (!balance.exists) {
      tx.create(wallet(uid), { available: invitedBy ? invitationBonus : 0, held: 0 });
      if (invitedBy) ledger(tx, uid, 'invitation_bonus_' + uid, 'Invitation bonus', invitationBonus, 0, now, '2000 Invitation Code signup credit');
    }
    return !user.exists;
  });
  if (created) await bumpSync({ clientsAt: Date.now() }, [uid]);
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

function requireStaffSession(authTime: unknown) {
  const expiresAt = typeof authTime === 'number' && Number.isSafeInteger(authTime) && authTime > 0
    ? (authTime + staffSessionSeconds) * 1000 : 0;
  if (expiresAt <= Date.now()) fail('unauthenticated', 'Your admin session expired. Sign in again.');
  return expiresAt;
}

function requireRole(user: Actor, role: string) {
  if (!user.staff.includes(role)) fail('permission-denied', 'Your staff role cannot perform this action.');
}

function supportRole(user: Actor): string {
  const role = user.staff.includes('admin') ? 'admin' : 'support';
  requireRole(user, role);
  return role;
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

async function mutate(user: Actor, data: Data, operation: string, parameters: unknown, apply: Mutation, prepare?: () => Promise<void>) {
  const key = identifier(data.requestId);
  const fingerprint = digest(parameters);
  const ref = db.collection('operationReceipts').doc(digest([user.uid, operation, key]));
  const previousResult = (previous: DocumentSnapshot) => {
    if (previous.get('fingerprint') !== fingerprint) fail('already-exists', 'This request ID belongs to another submission.');
    return previous.get('result') as Data;
  };
  if (prepare) {
    const previous = await ref.get();
    if (previous.exists) return previousResult(previous);
    await prepare();
  }
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const rate = db.collection('writeLimits').doc(user.uid);
  return db.runTransaction(async tx => {
    const [previous, active] = await Promise.all([tx.get(ref), tx.get(rate)]);
    if (previous.exists) return previousResult(previous);
    const count = active.get('minute') === minute ? Number(active.get('count')) : 0;
    if (count >= 24) fail('resource-exhausted', 'Too many changes. Try again in a minute.');
    const result = await apply(tx);
    tx.set(rate, { minute, count: count + 1 });
    tx.create(ref, { uid: user.uid, fingerprint, result, createdAt: now });
    return result;
  });
}

async function liveAssetPrice(symbol: string): Promise<number | null> {
  if (local) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbol=' + encodeURIComponent(symbol), { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { price?: string };
    const price = Number(json?.price);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function placeTrade(user: Actor, data: Data) {
  const asset = findAsset(data.symbol);
  const duration = Number(data.duration);
  const direction = data.direction;
  if (!asset || !durations.some(value => value === duration) || (direction !== 'up' && direction !== 'down')) {
    fail('invalid-argument', 'Choose a supported market, direction, and duration.');
  }
  const stake = cents(data.amount);
  let now = Date.now();
  const pct = profitForDuration(duration);
  const usesGate = isGateAsset(asset);
  const clientPrice = typeof data.price === 'number' && Number.isFinite(data.price) && data.price > 0 ? data.price : 0;
  const feedVersion = usesGate ? gateFeedVersion : clientPrice > 0 ? 2 : 1;
  let gateEntry: number | null = null;
  const prepare = usesGate ? async () => {
    gateEntry = await gateTradePrice(asset).catch(() => null);
    if (gateEntry === null) fail('failed-precondition', 'The Openverse Network price is temporarily unavailable.');
    now = Date.now();
  } : undefined;
  const trade = db.collection('trades').doc();
  const result = await mutate(user, data, 'trade.place', [asset.symbol, duration, direction, stake], async tx => {
    const [person, balance] = await Promise.all([tx.get(profile(user.uid)), tx.get(wallet(user.uid))]);
    if (person.get('frozen')) fail('failed-precondition', 'Account is frozen. Contact support.');
    if (!person.get('tradeEnabled')) fail('failed-precondition', 'Trading is paused for this account.');
    const freeze = walletFreeze(Number(balance.get('available') ?? 0), person.data() ?? {});
    if (freeze.kind === 'amount' && stake > freeze.available) fail('failed-precondition', 'The trade amount exceeds your unfrozen balance.');
    const dueAt = now + 1000 * duration;
    const entry = usesGate ? gateEntry! : clientPrice > 0 ? Math.round(clientPrice * 1e6) / 1e6 : demoPrice(asset, now);
    changeFunds(tx, user.uid, balance.data(), -stake, stake);
    tx.create(trade, { uid: user.uid, symbol: asset.symbol, direction, duration, stake, entry, dueAt, createdAt: now, status: 'open', feedVersion, profitPercent: pct });
    ledger(tx, user.uid, 'trade_hold_' + trade.id, 'Trade hold', -stake, stake, now, asset.code + ' trade');
    return { id: trade.id, entry, dueAt, duration, profitPercent: pct, stake, symbol: asset.symbol, direction, createdAt: now };
  }, prepare);
  const ts = Date.now();
  await bumpSync({ tradesAt: ts, clientsAt: ts }, [user.uid]);
  return result;
}

async function settle(id: string, now: number): Promise<string | null> {
  const ref = db.collection('trades').doc(id);
  const preSnap = (await ref.get()).data();
  if (!preSnap || preSnap.status !== 'open' || preSnap.dueAt > now) return null;
  let liveExit: number | null = null;
  const market = findAsset(preSnap.symbol);
  if (preSnap.feedVersion === gateFeedVersion && market && isGateAsset(market)) {
    liveExit = await gateTradePrice(market, { from: preSnap.createdAt, to: preSnap.dueAt }).catch(() => null);
  } else if (preSnap.feedVersion === 2 && typeof preSnap.symbol === 'string') {
    liveExit = await liveAssetPrice(preSnap.symbol);
  }
  let settledUid: string | null = null;
  await db.runTransaction(async tx => {
    const trade = (await tx.get(ref)).data();
    if (!trade || trade.status !== 'open' || trade.dueAt > now) return;
    const [balanceSnap, personSnap] = await Promise.all([tx.get(wallet(trade.uid)), tx.get(profile(trade.uid))]);
    const balance = balanceSnap.data();
    const usesGate = trade.feedVersion === gateFeedVersion;
    const tradeMode = usesGate ? 'auto' : String(personSnap.get('tradeMode') || 'auto').toLowerCase();
    const asset = findAsset(trade.symbol);
    let exit: number | null = null;
    if (usesGate) {
      exit = liveExit;
    } else if (trade.feedVersion === 2) {
      if (liveExit !== null) exit = liveExit;
      else if (asset && !isGateAsset(asset)) {
        const simDelta = (demoPrice(asset, trade.dueAt) - demoPrice(asset, trade.createdAt)) / Math.max(1e-9, demoPrice(asset, trade.createdAt));
        exit = Math.round(Number(trade.entry) * (1 + simDelta) * 1e6) / 1e6;
      }
    } else {
      exit = asset && !isGateAsset(asset) && trade.feedVersion === 1 ? demoPrice(asset, trade.dueAt) : null;
    }
    const outcome = tradeMode === 'win' ? 'win'
      : tradeMode === 'loss' ? 'loss'
      : exit === null || exit === trade.entry ? 'refund'
      : ((exit > trade.entry) === (trade.direction === 'up') ? 'win' : 'loss');
    if (tradeMode === 'win' && (exit === null || ((exit > trade.entry) !== (trade.direction === 'up')))) {
      const nudge = Math.max(Number(trade.entry) * 0.0004, 0.0001);
      exit = Math.round((Number(trade.entry) + (trade.direction === 'up' ? nudge : -nudge)) * 1e6) / 1e6;
    } else if (tradeMode === 'loss' && (exit === null || ((exit > trade.entry) === (trade.direction === 'up')))) {
      const nudge = Math.max(Number(trade.entry) * 0.0004, 0.0001);
      exit = Math.round((Number(trade.entry) + (trade.direction === 'up' ? -nudge : nudge)) * 1e6) / 1e6;
    }
    const pct = Number(trade.profitPercent || profitPercent);
    const payout = outcome === 'win' ? trade.stake + Math.round(trade.stake * pct / 100) : outcome === 'refund' ? trade.stake : 0;
    const pnl = payout - trade.stake;
    changeFunds(tx, trade.uid, balance, payout, -trade.stake);
    tx.update(ref, { status: 'settled', outcome, exit, payout, pnl, settledAt: now });
    ledger(tx, trade.uid, 'trade_result_' + id, 'Trade ' + outcome, payout, -trade.stake, now, (asset?.code || trade.symbol) + ' trade');
    const pairLabel = (asset?.code || String(trade.symbol || '').replace(/USDT$/, '')) + (usesGate ? '/USDT' : '/USD');
    const amtText = '₹' + (Math.abs(outcome === 'win' ? pnl : trade.stake) / 100).toFixed(2);
    const notifMsg = outcome === 'win'
      ? `Trade successful on ${pairLabel}. Profit: ${amtText}.`
      : outcome === 'loss'
      ? `Trade closed on ${pairLabel}. Loss: ${amtText}.`
      : `Trade refunded on ${pairLabel}.`;
    tx.create(db.collection('notifications').doc('trade_' + id), {
      uid: trade.uid,
      title: 'Trade Result',
      message: notifMsg,
      type: 'TRADE',
      createdAt: now,
    });
    settledUid = String(trade.uid || '');
  });
  return settledUid;
}
async function settleDue(uid?: string) {
  const now = Date.now();
  let query: Query = db.collection('trades').where('status', '==', 'open').where('dueAt', '<=', now);
  if (uid) query = query.where('uid', '==', uid);
  const due = await query.orderBy('dueAt').limit(uid ? 12 : 50).get();
  const settledUids: string[] = [];
  for (const trade of due.docs) {
    const target = await settle(trade.id, now);
    if (target) settledUids.push(target);
  }
  if (settledUids.length) {
    await bumpSync({ tradesAt: Date.now(), clientsAt: Date.now() }, settledUids);
  }
}

function cleanBankDetails(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cleaned: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-zA-Z0-9_]{1,32}$/.test(key) || typeof val !== 'string') continue;
    const trimmed = val.trim().slice(0, 120);
    if (trimmed) cleaned[key] = trimmed;
  }
  return Object.keys(cleaned).length ? cleaned : null;
}

const depositSettingsRef = (uid: string) => db.collection('depositSettings').doc(uid);
const defaultSettingsRef = () => db.collection('meta').doc('settings');

function effectiveDepositSettings(defaults: DocumentData, client: DocumentData) {
  return {
    usdtBscAddress: String(client.usdtBscAddress ?? (client.usdtBscQrImage ? '' : defaults.usdtBscAddress || defaults.usdtAddress || '')),
    upiId: String(client.upiId ?? (client.upiQrImage ? '' : defaults.upiId ?? '')),
    upiName: String(client.upiName ?? (client.upiQrImage ? '' : defaults.upiName ?? '')),
    upiQrImage: String(client.upiQrImage ?? ''),
    usdtBscQrImage: String(client.usdtBscQrImage ?? ''),
  };
}

function depositQrImage(value: unknown): string {
  const image = text(value, 400000, 0);
  if (!image) return image;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[2].length % 4 !== 0) fail('invalid-argument', 'Upload a PNG, JPEG, or WebP QR code image.');
  const [, format, encoded] = match;
  const bytes = Buffer.from(encoded, 'base64');
  const validHeader = format === 'png' ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    : format === 'jpeg' ? bytes.subarray(0, 3).toString('hex') === 'ffd8ff'
    : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!validHeader) fail('invalid-argument', 'Upload a PNG, JPEG, or WebP QR code image.');
  return image;
}

async function readClientDepositSettings(user: Actor, uid: string) {
  requireRole(user, 'admin');
  const [person, defaults, settings] = await Promise.all([
    profile(uid).get(), defaultSettingsRef().get(), depositSettingsRef(uid).get(),
  ]);
  checkScope(user, person.data());
  return { depositSettings: effectiveDepositSettings(defaults.data() ?? {}, settings.data() ?? {}) };
}

async function updateClientDepositSettings(user: Actor, data: Data) {
  requireRole(user, 'admin');
  const uid = identifier(data.uid);
  const updates: Record<string, string> = {};
  for (const key of ['upiId', 'upiName'] as const) {
    if (data[key] === undefined) continue;
    const value = text(data[key], 120, 0);
    if (/[\u0000-\u001f\u007f]/.test(value)) fail('invalid-argument', 'Enter UPI details on a single line.');
    updates[key] = value;
  }
  if (data.usdtBscAddress !== undefined) {
    const address = text(data.usdtBscAddress, 42, 0);
    if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) fail('invalid-argument', 'Enter a valid BNB Smart Chain address.');
    updates.usdtBscAddress = address;
  }
  for (const key of ['upiQrImage', 'usdtBscQrImage'] as const) {
    if (data[key] !== undefined) updates[key] = depositQrImage(data[key]);
  }
  if (!Object.keys(updates).length) fail('invalid-argument', 'Enter a change to the deposit settings.');

  const ref = depositSettingsRef(uid);
  await mutate(user, data, 'admin.depositSettings.update', [uid, updates], async tx => {
    await checkStaff(tx, user, 'admin');
    const [person, settings] = await Promise.all([tx.get(profile(uid)), tx.get(ref)]);
    checkScope(user, person.data());
    const now = Date.now();
    const version = Math.max(now, Number(settings.get('updatedAt') || 0) + 1);
    tx.set(ref, { ...updates, updatedAt: version }, { merge: true });
    tx.set(db.collection('userSync').doc(uid), { depositSettingsAt: version }, { merge: true });
    audit(tx, user, uid, 'Deposit settings updated', 'Deposit payment details updated', now);
    return { uid };
  });
  await bumpSync({ auditAt: Date.now() });
  return readClientDepositSettings(user, uid);
}

async function askFunding(user: Actor, data: Data) {
  const kind = data.kind;
  if (kind !== 'deposit' && kind !== 'withdrawal') fail('invalid-argument', 'Invalid funding type.');
  const amount = cents(data.amount);
  const now = Date.now();
  const ref = db.collection('funding').doc();
  const method = typeof data.method === 'string' && data.method.trim()
    ? data.method.trim().slice(0, 64)
    : (kind === 'withdrawal' ? 'Bank Transfer' : 'Direct transfer');
  const note = typeof data.note === 'string' && data.note.trim() ? data.note.trim().slice(0, 240) : '';
  const bankDetails = kind === 'withdrawal' ? cleanBankDetails(data.bankDetails) : null;
  const withdrawalPin = typeof data.withdrawalPin === 'string' ? data.withdrawalPin.trim() : '';
  const referenceNumber = kind === 'deposit' && typeof data.referenceNumber === 'string' ? data.referenceNumber.trim() : '';
  if (kind === 'deposit' && (!referenceNumber || referenceNumber.length > 128 || /[\u0000-\u001f\u007f]/.test(referenceNumber))) {
    fail('invalid-argument', 'Enter a UTR or reference number of up to 128 characters.');
  }

  const parameters = kind === 'deposit' ? [kind, amount, method, referenceNumber] : [kind, amount, method];
  const result = await mutate(user, data, 'funding.request', parameters, async tx => {
    const [person, balance] = await Promise.all([tx.get(profile(user.uid)), tx.get(wallet(user.uid))]);
    if (!person.exists) fail('failed-precondition', 'Open the workspace before submitting a request.');
    if (person.get('frozen')) fail('failed-precondition', 'Account is frozen. Contact support.');
    if (kind === 'withdrawal') {
      const freeze = walletFreeze(Number(balance.get('available') ?? 0), person.data() ?? {});
      if (freeze.kind === 'withdrawals') fail('failed-precondition', 'Withdrawals are frozen for this account.');
      if (!person.get('withdrawalEnabled')) fail('failed-precondition', 'Withdrawals are paused for this account.');
      const reputationWarning = withdrawalReputationWarning(person.get('reputationScore'));
      if (reputationWarning) fail('failed-precondition', reputationWarning);
      if (freeze.kind === 'amount' && amount > freeze.available) fail('failed-precondition', 'The withdrawal amount exceeds your unfrozen balance.');
      const enforcedForm = data.withdrawalPin !== undefined || data.bankDetails !== undefined;
      if (enforcedForm) {
        const storedHash = String(person.get('withdrawalPinHash') || '');
        if (!storedHash) fail('failed-precondition', 'Please set a Withdrawal PIN in Settings first.');
        if (!withdrawalPin || digest(withdrawalPin) !== storedHash) {
          fail('permission-denied', 'Incorrect Withdrawal PIN.');
        }
        if (bankDetails) {
          tx.update(profile(user.uid), { savedBank: bankDetails });
        }
      }
      changeFunds(tx, user.uid, balance.data(), -amount, amount);
      ledger(tx, user.uid, 'funding_hold_' + ref.id, 'Withdrawal hold', -amount, amount, now, method);
    }
    const docData: Record<string, unknown> = {
      uid: user.uid,
      kind,
      amount,
      createdAt: now,
      status: 'pending',
      method,
    };
    if (note) docData.note = note;
    if (referenceNumber) docData.referenceNumber = referenceNumber;
    if (bankDetails) docData.details = bankDetails;
    tx.create(ref, docData);
    return { id: ref.id };
  });
  const ts = Date.now();
  await bumpSync({ fundingAt: ts, ...(kind === 'withdrawal' ? { clientsAt: ts } : {}) }, [user.uid]);
  return result;
}

async function decideFunding(user: Actor, data: Data, asStaff: boolean) {
  const id = identifier(data.id);
  const state = asStaff ? data.status : 'cancelled';
  if (asStaff) requireRole(user, 'finance');
  if (state !== 'approved' && state !== 'rejected' && state !== 'cancelled') fail('invalid-argument', 'Invalid funding decision.');
  if (asStaff && state === 'cancelled') fail('invalid-argument', 'Choose approve or reject.');
  const rawReason = typeof data.reason === 'string' ? data.reason.trim() : '';
  const reason = !asStaff ? 'Cancelled by account owner'
    : state === 'approved' ? (rawReason ? rawReason.slice(0, 240) : 'Approved')
    : text(data.reason, 240, 3);
  const now = Date.now();
  let targetUid = '';
  const result = await mutate(user, data, 'funding.decide', [id, state, reason], async tx => {
    if (asStaff) await checkStaff(tx, user, 'finance');
    const ref = db.collection('funding').doc(id);
    const request = (await tx.get(ref)).data();
    if (!request) fail('not-found', 'Funding request was not found.');
    targetUid = String(request.uid || '');
    if (asStaff) checkScope(user, (await tx.get(profile(request.uid))).data());
    else if (request.uid !== user.uid || request.kind !== 'withdrawal') fail('permission-denied', 'Only the owner may cancel a pending withdrawal.');
    if (request.status !== 'pending') fail('failed-precondition', 'This request has already been decided.');
    const balance = (await tx.get(wallet(request.uid))).data();
    const heldDelta = request.kind === 'withdrawal' ? -request.amount : 0;
    const availableDelta = (request.kind === 'deposit' && state === 'approved') || (request.kind === 'withdrawal' && state !== 'approved') ? request.amount : 0;
    changeFunds(tx, request.uid, balance, availableDelta, heldDelta);
    tx.update(ref, { status: state, reason, decidedAt: now });
    ledger(tx, request.uid, 'funding_decision_' + id, request.kind + ' ' + state, availableDelta, heldDelta, now, reason);
    const kindLabel = request.kind === 'deposit' ? 'Deposit' : 'Withdrawal';
    const amtText = '₹' + (Number(request.amount || 0) / 100).toFixed(2);
    if (asStaff) {
      audit(tx, user, request.uid, kindLabel + ' ' + state, `${kindLabel} ${state} (${amtText}): ${reason}`, now);
      tx.create(db.collection('notifications').doc('funding_' + id), {
        uid: request.uid,
        title: `${kindLabel} ${state === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `${kindLabel} of ${amtText} was ${state}. ${reason}`,
        type: String(request.kind || 'FUNDING').toUpperCase(),
        createdAt: now,
      });
    }
    return { id, status: state };
  });
  const ts = Date.now();
  await bumpSync({ fundingAt: ts, clientsAt: ts, ...(asStaff ? { auditAt: ts } : {}) }, [targetUid || user.uid]);
  return result;
}

async function page(
  query: Query,
  data: Data,
  scope: unknown,
  field = 'createdAt',
  ascending = false,
  defaultSize = 25,
  selectRows?: (rows: Data[]) => Promise<Data[]>,
) {
  const direction = ascending ? 'asc' : 'desc';
  const requestedLimit = Number(data.limit);
  const size = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(100, Math.round(requestedLimit)) : defaultSize;
  let sorted = query.orderBy(field, direction).orderBy(FieldPath.documentId(), direction);
  const key = digest(scope);
  if (data.cursor) {
    try {
      const cursor = record(JSON.parse(Buffer.from(text(data.cursor, 900), 'base64url').toString('utf8')));
      if (cursor.key !== key || (ascending ? typeof cursor.value !== 'string' : typeof cursor.value !== 'number')) throw new Error('bad cursor');
      sorted = sorted.startAfter(cursor.value, identifier(cursor.id));
    } catch { fail('invalid-argument', 'Reload the list from the first page.'); }
  }
  const rows: Data[] = [];
  const batchSize = selectRows ? Math.max(50, size + 1) : size + 1;
  do {
    const docs = (await sorted.limit(batchSize).get()).docs;
    const batch = docs.map(doc => ({ ...doc.data(), id: doc.id }));
    rows.push(...(selectRows ? await selectRows(batch) : batch));
    const last = docs.at(-1);
    if (docs.length < batchSize || !last) break;
    sorted = sorted.startAfter(last);
  } while (rows.length <= size);
  const result = rows.slice(0, size);
  const last = result.at(-1);
  const cursor = rows.length > size && last
    ? Buffer.from(JSON.stringify({ key, value: last[field], id: last.id })).toString('base64url') : null;
  return { rows: result, cursor };
}

function adminSearchTerm(value: unknown) {
  return text(value ?? '', 80, 0).replace(/^uid:\s*/i, '').replace(/^#/, '').trim().toLowerCase();
}

async function adminListPage(
  query: Query,
  data: Data,
  scope: unknown[],
  enrich: (rows: Data[]) => Promise<Data[]>,
  additionalFields: string[],
) {
  const search = adminSearchTerm(data.search);
  if (!search) {
    const result = await page(query, data, scope);
    return { ...result, rows: await enrich(result.rows) };
  }
  const fields = ['id', 'uid', 'clientName', 'clientEmail', ...additionalFields];
  return page(query, data, [...scope, search], 'createdAt', false, 25, async rows =>
    (await enrich(rows)).filter(row => fields.some(field => {
      const value = String(row[field] ?? '').toLowerCase();
      return value.includes(field === 'symbol' ? search.replace('/', '') : search);
    })),
  );
}
const own = (collection: string, uid: string) => db.collection(collection).where('uid', '==', uid);
async function home(user: Actor) {
  await settleDue(user.uid);
  const [person, funds, active, defaults, settings] = await Promise.all([
    profile(user.uid).get(), wallet(user.uid).get(),
    own('trades', user.uid).where('status', '==', 'open').orderBy('createdAt', 'desc').limit(8).get(),
    defaultSettingsRef().get(), depositSettingsRef(user.uid).get(),
  ]);
  const rawProfile = person.data() || {};
  const { withdrawalPinHash, ...safeProfile } = rawProfile as Record<string, unknown>;
  return {
    profile: { ...safeProfile, hasWithdrawalPin: Boolean(withdrawalPinHash) },
    wallet: funds.data(),
    active: active.docs.map(doc => ({ ...doc.data(), id: doc.id })),
    depositSettings: effectiveDepositSettings(defaults.data() ?? {}, settings.data() ?? {}),
    serverTime: Date.now(),
  };
}

async function message(user: Actor, data: Data, asStaff: boolean) {
  const role = asStaff ? supportRole(user) : null;
  const target = asStaff ? identifier(data.uid) : user.uid;
  const content = text(data.message, 1000);
  const result = await mutate(user, data, 'message.send', [target, content, asStaff], async tx => {
    if (role) await checkStaff(tx, user, role);
    const client = await tx.get(profile(target));
    if (role) checkScope(user, client.data());
    else if (!client.exists) fail('failed-precondition', 'Open your workspace before sending a message.');
    const ref = db.collection('messages').doc();
    tx.create(ref, { uid: target, sender: asStaff ? 'Support' : 'You', message: content, createdAt: Date.now() });
    if (!asStaff) tx.update(client.ref, { latestSupportMessageId: ref.id });
    return { id: ref.id };
  });
  await bumpSync({ messagesAt: FieldValue.increment(1) }, asStaff ? [target] : []);
  return result;
}

const supportReadRef = (staffUid: string, clientUid: string) =>
  db.collection('staff').doc(staffUid).collection('supportReads').doc(clientUid);

function supportMessageMarker(client?: DocumentData) {
  return typeof client?.latestSupportMessageId === 'string'
    ? client.latestSupportMessageId
    : client?.supportNeedsReply === true ? 'legacy' : null;
}

async function supportThread(user: Actor, data: Data) {
  supportRole(user);
  const uid = identifier(data.uid);
  const client = (await profile(uid).get()).data();
  checkScope(user, client);
  const thread = await page(own('messages', uid), data, ['admin.messages', user.uid, uid]);
  const marker = supportMessageMarker(client);
  const containsUnread = marker && thread.rows.some((row: Data) => row.sender === 'You' && (marker === 'legacy' || row.id === marker));
  if (!containsUnread || (await supportReadRef(user.uid, uid).get()).get('marker') === marker) return thread;
  return { ...thread, supportUnreadMarker: marker };
}

async function readSupportMessage(user: Actor, data: Data) {
  const role = supportRole(user);
  const uid = identifier(data.uid);
  const marker = identifier(data.marker);
  const ref = supportReadRef(user.uid, uid);
  const { read, changed } = await db.runTransaction(async tx => {
    await checkStaff(tx, user, role);
    const [client, receipt] = await Promise.all([tx.get(profile(uid)), tx.get(ref)]);
    checkScope(user, client.data());
    if (supportMessageMarker(client.data()) !== marker) return { read: false, changed: false };
    if (receipt.get('marker') === marker) return { read: true, changed: false };
    tx.set(ref, { marker });
    return { read: true, changed: true };
  });
  if (changed) await bumpSync({ messagesAt: FieldValue.increment(1) });
  return { read };
}

async function updateProfile(user: Actor, data: Data) {
  const rawName = typeof data.name === 'string' ? data.name.trim() : '';
  const rawPass = typeof data.password === 'string' ? data.password.trim() : '';
  const rawPin = typeof data.withdrawalPin === 'string' ? data.withdrawalPin.trim() : '';
  if (!rawName && !rawPass && !rawPin) fail('invalid-argument', 'Enter a name, new password, or withdrawal PIN to update.');
  if (rawName && (rawName.length < 2 || rawName.length > 50)) fail('invalid-argument', 'Full name must be 2 to 50 characters.');
  if (rawPass && rawPass.length < 6) fail('invalid-argument', 'Password must be at least 6 characters.');
  if (rawPin && (rawPin.length < 4 || rawPin.length > 12)) fail('invalid-argument', 'Withdrawal PIN must be 4 to 12 characters.');

  if (rawPass) {
    await getAuth().updateUser(user.uid, { password: rawPass });
  }
  const updates: Record<string, unknown> = {};
  if (rawName) {
    updates.name = rawName;
    updates.nameSearch = rawName.toLowerCase();
  }
  if (rawPin) {
    updates.withdrawalPinHash = digest(rawPin);
  }
  const result = await mutate(user, data, 'profile.update', [rawName, Boolean(rawPass), Boolean(rawPin)], async tx => {
    if (Object.keys(updates).length) tx.update(profile(user.uid), updates);
    const parts: string[] = [];
    if (rawName) parts.push(`Name changed to ${rawName}`);
    if (rawPass) parts.push('Password updated by client');
    if (rawPin) parts.push('Withdrawal PIN updated by client');
    if (parts.length) {
      audit(tx, user, user.uid, 'Client profile updated', parts.join(', '), Date.now());
    }
    return { name: rawName || undefined, pinUpdated: Boolean(rawPin), passwordUpdated: Boolean(rawPass) };
  });
  const ts = Date.now();
  await bumpSync({ clientsAt: ts, auditAt: ts }, [user.uid]);
  return result;
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
  const [clients, trades, funding, staffProfile, staffAccount] = await Promise.all([
    staffQuery(user, 'profiles'), staffQuery(user, 'trades'), staffQuery(user, 'funding'),
    profile(user.uid).get(),
    user.staff.includes('admin') ? db.collection('staff').doc(user.uid).get() : null,
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
  return {
    clients: clientCount.data().count,
    trades: tradeCount.data().count,
    deposits: deposits.data().count,
    withdrawals: withdrawals.data().count,
    invitationCode: staffProfile.get('invitation_code') || '',
    fundedInvitationCode: staffAccount?.get('fundedInvitationCode') || '',
    recent: recent?.docs.map(doc => ({ ...doc.data(), id: doc.id })) ?? [],
    pending: pending?.docs.map(doc => ({ ...doc.data(), id: doc.id })) ?? []
  };
}
async function adminBadges(user: Actor) {
  const funding = await staffQuery(user, 'funding');
  const [deposits, withdrawals] = await Promise.all([
    funding.where('kind', '==', 'deposit').where('status', '==', 'pending').count().get(),
    funding.where('kind', '==', 'withdrawal').where('status', '==', 'pending').count().get(),
  ]);
  return { deposits: deposits.data().count, withdrawals: withdrawals.data().count };
}
async function adminInviteRefresh(user: Actor, data: Data) {
  const kind = data.kind ?? 'standard';
  if (kind !== 'standard' && kind !== 'funded') fail('invalid-argument', 'Choose an invitation code type.');
  const funded = kind === 'funded';
  if (funded) requireRole(user, 'admin');
  const result = await mutate(user, data, 'admin.invite.refresh', [kind], async tx => {
    await checkStaff(tx, user, funded ? 'admin' : user.staff[0]);
    const code = funded ? await reserveFundedInviteCode(tx) : generateInviteCode();
    if (funded) {
      tx.update(db.collection('staff').doc(user.uid), { fundedInvitationCode: code });
    } else {
      tx.set(profile(user.uid), { invitation_code: code }, { merge: true });
    }
    audit(tx, user, user.uid, 'Invitation code refreshed', funded ? '2000 Invitation Code generated' : 'Client Invitation Code generated', Date.now());
    return { code };
  });
  await bumpSync({ auditAt: Date.now() });
  return result;
}
async function clientView(user: Actor, data: Data) {
  const uid = identifier(data.uid);
  const state = (await profile(uid).get()).data();
  checkScope(user, state);
  const funds = user.staff.some(role => role !== 'support') ? (await wallet(uid).get()).data() : undefined;
  const activity = await page(own(user.staff.some(role => role !== 'support') ? 'ledger' : 'messages', uid), data, ['client', user.uid, uid]);
  return { profile: state, wallet: funds ?? null, activity };
}

function reportDate(value: unknown) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) {
    fail('invalid-argument', 'Choose valid report dates.');
  }
  return value;
}

function reportActivity(collection: string, uid: string, period: ClientReportPeriod) {
  let query = own(collection, uid);
  if (period.from !== null) query = query.where('createdAt', '>=', period.from);
  if (period.until !== null) query = query.where('createdAt', '<', period.until);
  return period.from !== null || period.until !== null ? query.orderBy('createdAt', 'desc') : query;
}

async function clientReport(user: Actor, data: Data): Promise<ClientReport> {
  if (!user.staff.includes('admin') && !user.staff.includes('finance')) {
    fail('permission-denied', 'You do not have access to client financial reports.');
  }
  const uid = identifier(data.uid);
  const period = { from: reportDate(data.from), until: reportDate(data.until) };
  if (period.from !== null && period.until !== null && period.from >= period.until) {
    fail('invalid-argument', 'The end date must be on or after the start date.');
  }

  return db.runTransaction(async tx => {
    const [client, staffAccount] = await Promise.all([tx.get(profile(uid)), tx.get(db.collection('staff').doc(uid))]);
    const state = client.data();
    checkScope(user, state);
    if (staffAccount.get('active') === true) fail('permission-denied', 'This account does not have a client report.');

    // Use the existing client activity indexes and read only the fields needed for the totals.
    const [funds, trades, funding] = await Promise.all([
      tx.get(wallet(uid)),
      tx.get(reportActivity('trades', uid, period).select('status', 'outcome', 'pnl')),
      tx.get(reportActivity('funding', uid, period).where('status', '==', 'approved').select('kind', 'amount')),
    ]);

    let netProfit = 0, wins = 0, losses = 0;
    for (const trade of trades.docs) {
      if (trade.get('status') !== 'settled') continue;
      netProfit += Number(trade.get('pnl') ?? 0);
      if (trade.get('outcome') === 'win') wins++;
      if (trade.get('outcome') === 'loss') losses++;
    }
    let deposits = 0, withdrawals = 0;
    for (const request of funding.docs) {
      if (request.get('kind') === 'deposit') deposits += Number(request.get('amount') ?? 0);
      if (request.get('kind') === 'withdrawal') withdrawals += Number(request.get('amount') ?? 0);
    }
    const available = Number(funds.get('available') ?? 0);
    const held = Number(funds.get('held') ?? 0);
    const freeze = walletFreeze(available, state ?? {});
    const status = freeze.kind === 'account' ? 'Frozen'
      : freeze.kind !== 'none' || state?.tradeEnabled === false || state?.withdrawalEnabled === false ? 'Restricted' : 'Active';

    return {
      generatedAt: Date.now(), period,
      client: {
        uid, number: isClientNumber(state?.clientNumber) ? state.clientNumber : null,
        name: String(state?.name || 'Client'), email: String(state?.email || ''), status,
        vipLevel: String(state?.vipLevel || 'VIP1'), reputation: Number(state?.reputationScore ?? 100),
        currency: String(state?.currency || 'INR'),
      },
      available, held, netProfit, deposits, withdrawals, trades: trades.size, wins, losses,
    };
  }, { readOnly: true });
}

async function assignClientNumbers(user: Actor, uids: string[]) {
  if (!uids.length) return new Map<string, number>();
  return db.runTransaction(async tx => {
    const clients = await tx.getAll(...uids.map(profile));
    const assigned = new Map<string, number>();
    const missing: DocumentSnapshot[] = [];
    for (const client of clients) {
      checkScope(user, client.data());
      const number = client.get('clientNumber');
      if (isClientNumber(number)) assigned.set(client.id, number);
      else missing.push(client);
    }
    if (missing.length) {
      let number = await reserveClientNumbers(tx, missing.length);
      for (const client of missing) {
        tx.update(client.ref, { clientNumber: number });
        assigned.set(client.id, number++);
      }
    }
    return assigned;
  });
}

async function resolveClientRoute(user: Actor, data: Data) {
  const reference = identifier(data.reference);
  const number = parseClientNumber(reference);
  const matches = number === undefined ? null : await db.collection('profiles').where('clientNumber', '==', number).limit(2).get();
  if (matches && matches.size > 1) fail('failed-precondition', 'The client number is duplicated.');
  const client = matches?.docs[0] ?? await profile(reference).get();
  checkScope(user, client.data());
  if ((await db.collection('staff').doc(client.id).get()).get('active') === true) {
    fail('permission-denied', 'This account does not have a client page.');
  }
  const current = client.get('clientNumber');
  const clientNumber = isClientNumber(current) ? current : (await assignClientNumbers(user, [client.id])).get(client.id);
  if (!isClientNumber(clientNumber)) fail('internal', 'The client number could not be assigned.');
  return { uid: client.id, clientNumber };
}
async function adminUpdate(user: Actor, data: Data, adjusting: boolean) {
  const role = adjusting ? 'finance' : 'admin';
  requireRole(user, role);
  const uid = identifier(data.uid);
  const delta = adjusting ? cents(data.amount, true) : 0;
  const rawReason = typeof data.reason === 'string' ? data.reason.trim() : '';
  const ledgerReason = adjusting
    ? (rawReason ? rawReason.slice(0, 240) : (delta > 0 ? 'Funds added by admin' : 'Funds deducted by admin'))
    : text(data.reason, 240, 3);
  const tradeEnabled = data.tradeEnabled === true, withdrawalEnabled = data.withdrawalEnabled === true;
  if (!adjusting && (typeof data.tradeEnabled !== 'boolean' || typeof data.withdrawalEnabled !== 'boolean')) fail('invalid-argument', 'Invalid restriction.');
  const result = await mutate(user, data, adjusting ? 'admin.adjust' : 'admin.restrict', [uid, ledgerReason, delta, tradeEnabled, withdrawalEnabled], async tx => {
    await checkStaff(tx, user, role);
    const current = (await tx.get(profile(uid))).data();
    checkScope(user, current);
    const now = Date.now();
    let auditReason = ledgerReason;
    if (adjusting) {
      changeFunds(tx, uid, (await tx.get(wallet(uid))).data(), delta, 0);
      ledger(tx, uid, db.collection('ledger').doc().id, 'Staff adjustment', delta, 0, now, ledgerReason);
      const amtText = '₹' + (Math.abs(delta) / 100).toFixed(2);
      auditReason = `Balance updated: ${delta > 0 ? '+' : '-'}${amtText}${rawReason ? ' — ' + rawReason.slice(0, 180) : ''}`;
    } else {
      const diffs: string[] = [];
      if (Boolean(current?.tradeEnabled) !== tradeEnabled) diffs.push(`Trading: ${tradeEnabled ? 'enabled' : 'disabled'}`);
      if (Boolean(current?.withdrawalEnabled) !== withdrawalEnabled) diffs.push(`Withdrawals: ${withdrawalEnabled ? 'enabled' : 'disabled'}`);
      auditReason = (diffs.length ? diffs.join(', ') + ' — ' : '') + ledgerReason;
      tx.update(profile(uid), { tradeEnabled, withdrawalEnabled });
    }
    audit(tx, user, uid, adjusting ? 'Balance updated' : 'Restrictions updated', auditReason, now);
    return { uid };
  });
  const ts = Date.now();
  await bumpSync({ clientsAt: ts, auditAt: ts }, [uid]);
  return result;
}

async function adminClientUpdate(user: Actor, data: Data) {
  requireRole(user, 'admin');
  const uid = identifier(data.uid);
  const updates: Record<string, unknown> = {};
  if (typeof data.name === 'string' && data.name.trim()) {
    updates.name = data.name.trim().slice(0, 60);
    updates.nameSearch = String(updates.name).toLowerCase();
  }
  if (typeof data.vipLevel === 'string' && data.vipLevel.trim()) updates.vipLevel = data.vipLevel.trim().slice(0, 20);
  if (typeof data.reputationScore === 'number' && Number.isFinite(data.reputationScore)) {
    updates.reputationScore = Math.max(0, Math.min(1000, Math.round(data.reputationScore)));
  }
  if (typeof data.tradeEnabled === 'boolean') updates.tradeEnabled = data.tradeEnabled;
  if (typeof data.withdrawalEnabled === 'boolean') updates.withdrawalEnabled = data.withdrawalEnabled;
  if (typeof data.frozen === 'boolean') updates.frozen = data.frozen;
  if (typeof data.freezeAmount === 'boolean') updates.freezeAmount = data.freezeAmount;
  if (data.frozenAmount !== undefined) {
    const requested = data.frozenAmount;
    const amount = typeof requested === 'number' ? Math.round(requested * 100) : NaN;
    if (typeof requested !== 'number' || !Number.isSafeInteger(amount) || (requested !== 0 && requested < 0.01)) {
      fail('invalid-argument', 'Enter a valid amount to freeze.');
    }
    updates.frozenAmount = amount;
  }
  if (typeof data.currency === 'string' && data.currency.trim()) updates.currency = data.currency.trim().slice(0, 10);
  if (typeof data.tradeMode === 'string' && ['auto', 'win', 'loss'].includes(data.tradeMode.toLowerCase())) {
    updates.tradeMode = data.tradeMode.toLowerCase();
  }
  if (typeof data.withdrawalPin === 'string' && data.withdrawalPin.trim()) {
    updates.withdrawalPinHash = digest(data.withdrawalPin.trim());
  }
  const newPassword = typeof data.password === 'string' && data.password.trim() ? data.password.trim() : '';
  if (newPassword && newPassword.length < 6) fail('invalid-argument', 'Login password must be at least 6 characters.');
  if (!Object.keys(updates).length && !newPassword) fail('invalid-argument', 'No fields to update.');

  if (newPassword) {
    const targetDoc = (await profile(uid).get()).data();
    checkScope(user, targetDoc);
    await getAuth().updateUser(uid, { password: newPassword });
  }

  const result = await mutate(user, data, 'admin.client.update', [uid, updates, Boolean(newPassword)], async tx => {
    await checkStaff(tx, user, 'admin');
    const current = (await tx.get(profile(uid))).data();
    checkScope(user, current);
    const changes: string[] = [];
    if (updates.name !== undefined && updates.name !== current?.name) {
      changes.push(`Name updated: ${String(current?.name || '—')} → ${String(updates.name)}`);
    }
    if (newPassword) changes.push('Login password changed');
    if (updates.withdrawalPinHash !== undefined) changes.push('Withdrawal PIN changed');
    if (updates.vipLevel !== undefined && updates.vipLevel !== current?.vipLevel) {
      changes.push(`VIP Level updated: ${String(current?.vipLevel || 'VIP1')} → ${String(updates.vipLevel)}`);
    }
    if (updates.reputationScore !== undefined && Number(updates.reputationScore) !== Number(current?.reputationScore ?? 100)) {
      changes.push(`Reputation score updated: ${Number(current?.reputationScore ?? 100)} → ${Number(updates.reputationScore)}`);
    }
    if (updates.tradeEnabled !== undefined && Boolean(updates.tradeEnabled) !== Boolean(current?.tradeEnabled)) {
      changes.push(`Trading ${updates.tradeEnabled ? 'enabled' : 'disabled'}`);
    }
    if (updates.withdrawalEnabled !== undefined && Boolean(updates.withdrawalEnabled) !== Boolean(current?.withdrawalEnabled)) {
      changes.push(`Withdrawals ${updates.withdrawalEnabled ? 'enabled' : 'disabled'}`);
    }
    if (updates.frozen !== undefined && Boolean(updates.frozen) !== Boolean(current?.frozen)) {
      changes.push(`Account ${updates.frozen ? 'frozen' : 'unfrozen'}`);
    }
    if (updates.freezeAmount !== undefined && Boolean(updates.freezeAmount) !== Boolean(current?.freezeAmount)) {
      changes.push(`Amount freeze ${updates.freezeAmount ? 'enabled' : 'disabled'}`);
    }
    if (updates.frozenAmount !== undefined && updates.frozenAmount !== (current?.frozenAmount ?? 0)) {
      changes.push(`Frozen amount updated to ${(Number(updates.frozenAmount) / 100).toFixed(2)}`);
    }
    if (updates.currency !== undefined && updates.currency !== (current?.currency || 'INR')) {
      changes.push(`Currency updated: ${String(current?.currency || 'INR')} → ${String(updates.currency)}`);
    }
    if (updates.tradeMode !== undefined && String(updates.tradeMode) !== String(current?.tradeMode || 'auto').toLowerCase()) {
      changes.push(`Trade mode updated: ${String(current?.tradeMode || 'auto').toUpperCase()} → ${String(updates.tradeMode).toUpperCase()}`);
    }
    if (Object.keys(updates).length) tx.update(profile(uid), updates);
    const auditReason = changes.length ? changes.join(', ') : 'Profile saved (no field changes)';
    audit(tx, user, uid, 'Profile updated', auditReason, Date.now());
    return { uid };
  });
  const ts = Date.now();
  await bumpSync({ clientsAt: ts, auditAt: ts }, [uid]);
  return result;
}

async function adminClientCreate(user: Actor, data: Data) {
  requireRole(user, 'admin');
  const name = text(data.name, 60, 2);
  const email = text(data.email, 120, 5).toLowerCase();
  const password = text(data.password, 128, 6);
  const vipLevel = typeof data.vipLevel === 'string' && data.vipLevel.trim() ? data.vipLevel.trim().slice(0, 20) : 'Unverified';
  const reputationScore = typeof data.reputationScore === 'number' && Number.isFinite(data.reputationScore)
    ? Math.max(0, Math.min(1000, Math.round(data.reputationScore))) : 100;
  const tradeEnabled = data.tradeEnabled !== false;
  const withdrawalEnabled = data.withdrawalEnabled !== false;
  const frozen = data.frozen === true;
  const created = await getAuth().createUser({ email, password, displayName: name });
  const now = Date.now();
  await db.runTransaction(async tx => {
    await checkStaff(tx, user, 'admin');
    const clientNumber = await reserveClientNumbers(tx, 1);
    tx.create(profile(created.uid), {
      uid: created.uid,
      clientNumber,
      email,
      name,
      nameSearch: name.toLowerCase(),
      invitation_code: '',
      createdAt: now,
      tradeEnabled,
      withdrawalEnabled,
      frozen,
      freezeAmount: false,
      vipLevel,
      reputationScore,
      tradeMode: 'auto',
      assignedTo: user.allClients ? '' : user.uid,
    });
    tx.create(wallet(created.uid), { available: 0, held: 0 });
    audit(tx, user, created.uid, 'Client created', `Created client account: ${name} (${email})`, now);
  });
  await bumpSync({ clientsAt: now, auditAt: now });
  return { uid: created.uid };
}

async function adminNotificationsList(user: Actor, data: Data) {
  if (!user.staff.includes('admin') && !user.staff.includes('support')) {
    fail('permission-denied', 'Your staff role cannot perform this action.');
  }
  const uid = identifier(data.uid);
  checkScope(user, (await profile(uid).get()).data());
  const snap = await db.collection('notifications').where('uid', '==', uid).limit(50).get();
  const rows = snap.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a: Data, b: Data) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return { rows };
}

async function adminNotificationPush(user: Actor, data: Data) {
  if (!user.staff.includes('admin') && !user.staff.includes('support')) {
    fail('permission-denied', 'Your staff role cannot perform this action.');
  }
  const uid = identifier(data.uid);
  const title = text(data.title, 100, 1);
  const message = text(data.message, 1000, 1);
  const role = user.staff.includes('admin') ? 'admin' : 'support';
  const result = await mutate(user, data, 'admin.notifications.push', [uid, title, message], async tx => {
    await checkStaff(tx, user, role);
    checkScope(user, (await tx.get(profile(uid))).data());
    const ref = db.collection('notifications').doc();
    const now = Date.now();
    tx.create(ref, { uid, title, message, read: false, createdAt: now, createdBy: user.uid });
    audit(tx, user, uid, 'Notification pushed', `Notification pushed: ${title}`, now);
    return { id: ref.id };
  });
  await bumpSync({ auditAt: Date.now() }, [uid]);
  return result;
}

async function adminNotificationDelete(user: Actor, data: Data) {
  if (!user.staff.includes('admin') && !user.staff.includes('support')) {
    fail('permission-denied', 'Your staff role cannot perform this action.');
  }
  const id = identifier(data.id);
  const role = user.staff.includes('admin') ? 'admin' : 'support';
  let targetUid = '';
  const result = await mutate(user, data, 'admin.notifications.delete', [id], async tx => {
    await checkStaff(tx, user, role);
    const ref = db.collection('notifications').doc(id);
    const doc = await tx.get(ref);
    if (!doc.exists) fail('not-found', 'Notification not found.');
    targetUid = String(doc.get('uid') || '');
    checkScope(user, (await tx.get(profile(targetUid))).data());
    tx.delete(ref);
    audit(tx, user, targetUid, 'Notification removed', `Notification removed: ${String(doc.get('title') || id)}`, Date.now());
    return { id, deleted: true };
  });
  await bumpSync({ auditAt: Date.now() }, [targetUid]);
  return result;
}

async function enrichWithProfiles(rows: Data[]) {
  const uids = [...new Set(rows.map(r => String(r.uid || '')).filter(Boolean))];
  if (!uids.length) return rows;
  const chunks: string[][] = [];
  for (let i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10));
  const profileMap = new Map<string, { name: string; email: string }>();
  for (const chunk of chunks) {
    const docs = await Promise.all(chunk.map(uid => db.collection('profiles').doc(uid).get()));
    for (const doc of docs) {
      if (doc.exists) profileMap.set(doc.id, { name: String(doc.get('name') || ''), email: String(doc.get('email') || '') });
    }
  }
  return rows.map(r => {
    const p = profileMap.get(String(r.uid || ''));
    return p ? { ...r, clientName: p.name, clientEmail: p.email } : r;
  });
}

async function enrichAuditRows(rows: Data[]) {
  if (!rows.length) return rows;
  const clientUids = [...new Set(rows.map(r => String(r.uid || '')).filter(Boolean))];
  const actorUids = [...new Set(rows.map(r => String(r.actor || '')).filter(Boolean))];
  const allUids = [...new Set([...clientUids, ...actorUids])];
  const profileMap = new Map<string, { name: string; email: string }>();
  for (let i = 0; i < allUids.length; i += 10) {
    const chunk = allUids.slice(i, i + 10);
    const docs = await Promise.all(chunk.map(uid => db.collection('profiles').doc(uid).get()));
    for (const doc of docs) {
      if (doc.exists) profileMap.set(doc.id, { name: String(doc.get('name') || ''), email: String(doc.get('email') || '') });
    }
  }
  const missingActors = actorUids.filter(uid => !profileMap.get(uid)?.name);
  const actorNameMap = new Map<string, string>();
  for (const uid of actorUids) {
    const p = profileMap.get(uid);
    if (p?.name) actorNameMap.set(uid, p.name);
  }
  if (missingActors.length) {
    const staffDocs = await Promise.all(missingActors.map(uid => db.collection('staff').doc(uid).get()));
    const stillMissing: string[] = [];
    for (const doc of staffDocs) {
      const staffName = String(doc.get('name') || doc.get('displayName') || '').trim();
      if (staffName) actorNameMap.set(doc.id, staffName);
      else stillMissing.push(doc.id);
    }
    if (stillMissing.length) {
      try {
        const authRes = await getAuth().getUsers(stillMissing.slice(0, 100).map(uid => ({ uid })));
        for (const u of authRes.users) {
          const resolved = u.displayName || (u.email ? u.email.split('@')[0] : '') || '';
          if (resolved) actorNameMap.set(u.uid, resolved);
        }
      } catch { /* Fallback cleanly if Auth batch lookup unavailable. */ }
    }
  }
  return rows.map(r => {
    const uid = String(r.uid || '');
    const actorId = String(r.actor || '');
    const client = profileMap.get(uid);
    const actorName = actorNameMap.get(actorId) || profileMap.get(actorId)?.email || '';
    return {
      ...r,
      clientName: client?.name || '',
      clientEmail: client?.email || '',
      actorName,
    };
  });
}

export const workspace = onCall({ region, enforceAppCheck: local ? false : requireAppCheck, maxInstances: 8 }, async request => {
  const data = record(request.data);
  const op = text(data.op, 64);
  const isAdminOp = op.startsWith('admin.');
  const user = await actor(request, isAdminOp);
  const sessionExpiresAt = isAdminOp ? requireStaffSession(request.auth?.token.auth_time) : 0;

  // For client ops, verify the caller is NOT a staff member (belt + suspenders check in addition to upsertProfile guard).
  // This prevents a staff account from using the client API even if they already have a stale profile document.
  if (!isAdminOp) {
    const staffDoc = await db.collection('staff').doc(user.uid).get();
    if (staffDoc.exists && staffDoc.get('active') === true) {
      fail('permission-denied', 'Staff accounts cannot access the client workspace. Use the admin panel.');
    }
  }

  switch (op) {
    case 'access': {
      const nameParam = typeof data.name === 'string' ? data.name : undefined;
      const inviteCodeParam = typeof data.inviteCode === 'string' ? data.inviteCode : undefined;
      await upsertProfile(user.uid, request.auth?.token.email || '', nameParam, inviteCodeParam);
      return home(user);
    }
    case 'home': return home(user);
    case 'client.activity': return recordClientActivity(user.uid, data.ageMs);
    case 'trade.place': return placeTrade(user, data);
    case 'funding.request': return askFunding(user, data);
    case 'funding.cancel': return decideFunding(user, data, false);
    case 'profile.update': return updateProfile(user, data);
    case 'notifications.read': {
      const notifId = typeof data.id === 'string' && data.id.trim() ? identifier(data.id) : null;
      return mutate(user, data, op, notifId ? [notifId] : null, async tx => {
        const readAt = Date.now();
        if (notifId) {
          const ref = db.collection('notifications').doc(notifId);
          const doc = await tx.get(ref);
          if (!doc.exists || String(doc.get('uid') || '') !== user.uid) {
            fail('not-found', 'Notification not found.');
          }
          tx.update(ref, { read: true, readAt });
          return { id: notifId, readAt };
        }
        tx.update(profile(user.uid), { notificationReadAt: readAt });
        return { readAt };
      });
    }
    case 'notifications.clear':
      return mutate(user, data, op, null, async tx => {
        const now = Date.now();
        tx.update(profile(user.uid), { notificationClearAt: now, notificationReadAt: now });
        return { clearedAt: now };
      });
    case 'message.send': return message(user, data, false);
    case 'list': {
      const list = text(data.list, 20);
      if (!['trades', 'funding', 'ledger', 'messages', 'notifications'].includes(list)) fail('invalid-argument', 'Invalid list.');
      if (list === 'trades' || list === 'ledger') await settleDue(user.uid);
      if (list === 'notifications') {
        const [snap, userSnap] = await Promise.all([
          db.collection('notifications').where('uid', '==', user.uid).limit(60).get(),
          profile(user.uid).get(),
        ]);
        const clearAt = Number(userSnap.get('notificationClearAt') || 0);
        const rows = snap.docs
          .map(doc => ({ ...doc.data(), id: doc.id }) as Data)
          .filter(row => Number(row.createdAt || 0) > clearAt)
          .sort((a: Data, b: Data) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        return { rows, cursor: null };
      }
      return page(own(list, user.uid), data, [list, user.uid]);
    }
    case 'admin.access': return { roles: user.staff, serverTime: Date.now(), sessionExpiresAt };
    case 'admin.dashboard': return adminOverview(user);
    case 'admin.badges': return adminBadges(user);
    case 'admin.invite.refresh': return adminInviteRefresh(user, data);
    case 'admin.clients.activity': return adminClientActivity(user, data.uids);
    case 'admin.clients': {
      const search = adminSearchTerm(data.search);
      const query = await staffQuery(user, 'profiles');

      // Load all active staff UIDs so we can exclude them from the client list.
      const staffSnap = await db.collection('staff').where('active', '==', true).get();
      const staffUids = new Set(staffSnap.docs.map(d => d.id));

      let result: { rows: Data[]; cursor: string | null };
      if (search) {
        const number = parseClientNumber(search);
        const [snap, exact] = await Promise.all([
          query.orderBy('createdAt', 'desc').limit(500).get(),
          number === undefined ? null : query.where('clientNumber', '==', number).limit(1).get(),
        ]);
        const first = exact?.docs[0];
        const candidates = first ? [first, ...snap.docs.filter(doc => doc.id !== first.id)] : snap.docs;
        const matched = candidates
          .map(doc => ({ ...doc.data(), id: doc.id }))
          .filter((row: Data) => {
            if (staffUids.has(String(row.id || ''))) return false; // exclude staff
            const uid = String(row.id || '').toLowerCase();
            const name = String(row.name || '').toLowerCase();
            const email = String(row.email || '').toLowerCase();
            return (number !== undefined && row.clientNumber === number) || uid.includes(search) || name.includes(search) || email.includes(search);
          })
          .slice(0, 25);
        result = { rows: matched, cursor: null };
      } else {
        const rawResult = await page(query, data, [op, user.uid, ''], 'createdAt', false);
        rawResult.rows = rawResult.rows.filter((row: Data) => !staffUids.has(String(row.id || '')));
        result = rawResult;
      }
      // Enrich with wallet balances and the signed-in staff member's unread chats.
      const uids = result.rows.map(r => String(r.id));
      const chatEnabled = user.staff.some(role => role === 'admin' || role === 'support');
      const unreadCandidates = chatEnabled
        ? result.rows.filter(row => supportMessageMarker(row)).map(row => supportReadRef(user.uid, String(row.id)))
        : [];
      const [walletDocs, readDocs, numbers] = await Promise.all([
        Promise.all(uids.map(uid => wallet(uid).get())),
        unreadCandidates.length ? db.getAll(...unreadCandidates) : [],
        assignClientNumbers(user, result.rows.filter(row => !isClientNumber(row.clientNumber)).map(row => String(row.id))),
      ]);
      const walletMap = new Map(walletDocs.map(doc => [doc.id, doc.data()]));
      const readMarkers = new Map(readDocs.map(doc => [doc.id, doc.get('marker')]));
      result.rows = result.rows.map(row => {
        const uid = String(row.id);
        const marker = chatEnabled ? supportMessageMarker(row) : null;
        return {
          ...row,
          clientNumber: numbers.get(uid) ?? row.clientNumber,
          balance: walletMap.get(uid)?.available ?? 0,
          supportUnreadMarker: marker && marker !== readMarkers.get(uid) ? marker : null,
        };
      });
      return result;
    }
    case 'admin.depositSettings': return readClientDepositSettings(user, identifier(data.uid));
    case 'admin.depositSettings.update': return updateClientDepositSettings(user, data);
    case 'admin.funding': {
      requireRole(user, 'finance');
      const kind = data.kind, status = data.status;
      if ((kind !== 'deposit' && kind !== 'withdrawal') || !['pending', 'approved', 'rejected', 'cancelled', 'all'].includes(String(status))) fail('invalid-argument', 'Invalid filter.');
      let query = (await staffQuery(user, 'funding')).where('kind', '==', kind);
      if (status !== 'all') query = query.where('status', '==', status);
      return adminListPage(query, data, [op, user.uid, kind, status], enrichWithProfiles, ['referenceNumber', 'method', 'status']);
    }
    case 'admin.trades': {
      requireRole(user, 'admin');
      return adminListPage(await staffQuery(user, 'trades'), data, [op, user.uid], enrichWithProfiles, ['symbol', 'direction', 'status', 'outcome']);
    }
    case 'admin.audit': {
      requireRole(user, 'admin');
      return adminListPage(await staffQuery(user, 'audit'), data, [op, user.uid], enrichAuditRows, ['actor', 'actorName', 'event', 'reason']);
    }
    case 'admin.client.resolve': return resolveClientRoute(user, data);
    case 'admin.client': return clientView(user, data);
    case 'admin.client.report': return clientReport(user, data);
    case 'admin.messages': return supportThread(user, data);
    case 'admin.messages.read': return readSupportMessage(user, data);
    case 'admin.client.create': return adminClientCreate(user, data);
    case 'admin.client.update': return adminClientUpdate(user, data);
    case 'admin.notifications.list': return adminNotificationsList(user, data);
    case 'admin.notifications.push': return adminNotificationPush(user, data);
    case 'admin.notifications.delete': return adminNotificationDelete(user, data);
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
