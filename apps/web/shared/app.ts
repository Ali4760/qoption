import './style.css';
import './login.css';
import './workspace.css';
import './admin.css';
import './client-replica.css';
import { createUserWithEmailAndPassword, getMultiFactorResolver, multiFactor, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, TotpMultiFactorGenerator, type MultiFactorError, type MultiFactorResolver, type TotpSecret, type User } from 'firebase/auth';
import { assets, demoPrice, findAsset, isGateAsset, profitForDuration, type Asset } from '../../../functions/src/market';
import { gateTicker } from '../../../functions/src/gate-market';
import { walletFreeze } from '../../../functions/src/wallet-freeze';
import { withdrawalReputationWarning } from '../../../functions/src/withdrawal-reputation';
import { connect, emulator, rememberPreference, setRememberPreference } from './firebase';
import { userLogin } from './login';
import { tradeCoinIcon } from './coin-icons';
import { finishStartup, showStartup } from './startup';
import { adminClientPath, adminPath, adminRouteForPath, clientPaths, clientTabForPath, workspaceEntryPath } from './workspace-routes';
import { depositSettingsChanges, depositSettingsForm } from './admin-deposit';
import { adminActionIcons, adminLogoutIcon, adminNav, adminNavGroups, brand, chartFrames, ledgerRows, messages, messageThread, pair, title, userNav } from './screens';
import { actionButton, amountField, credits, dateTime, errorMessage, esc, formStatus, label, pager, recordReference, section, showFormStatus, state, table, type DepositSettings, type Home, type Page, type Profile, type Row, type Wallet } from './view';
import {
  buildClientShellHtml, buildLeaderboardHtml, buildProfileTabHtml, buildTradeHistoryHtml, buildTransactionHistoryHtml, buildWalletTabHtml,
  clientChartPresentation, clientIcons, clientWithdrawalRestriction, createLeaderboardData, curSym, downloadCsv, durationChoices, filterTrades, filterTransactions,
  fmtMoney, fmtSignedMoney, formatDurationLabel, formatPair, isNotifUnread, renderAssetDropdownAndGrid, renderBankFieldsHtml,
  renderAssetsBalance, renderDepositPaymentHtml, renderNotificationsOverlayList, renderOrderBookHtml, renderRealAccountBalance, renderReputationValue, renderTradePair, renderTxnDetailHtml,
  renderChartAssetMark, renderTradeAssetSelector,
  updateNotifBanners, validateBankDetails, type ClientState,
} from './client-ui';

const root = document.querySelector<HTMLElement>('#app')!;
const admin = root.dataset.audience === 'admin';
const first = admin ? 'overview' : 'trade';
let api: Awaited<ReturnType<typeof connect>>;
let person: User | null;
let home: Home | undefined;
let roles: string[] = [];
let access = false, version = 0, authVersion = 0, clockOffset = 0;
let adminSessionExpiresAt = 0, adminSessionTimer = 0;
let adminSignInNotice = '';
let route = first, selected: Asset = assets[0], frame = '1m';
let adminLocation = adminRouteForPath(location.pathname);
type AdminClientIdentity = { uid: string; clientNumber: number };
let adminClient: AdminClientIdentity | undefined;
let chart: ReturnType<typeof import('./canvas-chart').mountChart> | undefined;
let refreshTimer = 0, toastTimer = 0, quoteTimer = 0, activeTradeInt = 0, tradeSettling = false;
let registration = !admin && new URLSearchParams(location.search).get('mode') === 'register';
let resolver: MultiFactorResolver | undefined;
let secret: TotpSecret | undefined;
let visibleRows = new Map<string, Row>();
type List = { page: number; next: string | null; cursors: (string | null)[]; search: string; status: string };
const lists = new Map<string, List>();
type CachedAdminView = { key: string; route: string; data: unknown; rows: Row[]; next: string | null; ts: number; dirty: boolean };
const adminCache = new Map<string, CachedAdminView>();
let invitationRevision = 0;
const CACHE_TTL = 60_000;
const ADMIN_TABLE_PAGE_SIZE = 25;
const CLIENT_IDLE_MS = 10 * 60_000;
const CLIENT_ACTIVITY_SYNC_MS = 30_000;
let clientActivityTimer = 0;
let lastClientActivity = 0;
let lastClientActivityReport = -Infinity;
let syncUnsub: (() => void) | undefined;
let syncInitialized = false;
let prevAdminSync = { tradesAt: 0, fundingAt: 0, clientsAt: 0, auditAt: 0, messagesAt: 0 };
let prevUserUpdatedAt = 0;
let prevUserDepositSettingsAt = 0;
let silentRefreshQueued = false;
let silentRefreshActive = false;
let clientMessagesRequest = 0;
let clientNotificationsRequest = 0;

const clientLoaded = { funding: false, trades: false, notifications: false, messages: false };
const DEFAULT_TRADE_DURATION = 120;
const clientState: ClientState = {
  activeTab: 'market',
  walletSubTab: 'deposit',
  depositMethod: 'USDT_BSC',
  depositPresetAmount: 3000,
  depositReferenceNumber: '',
  selected: assets[0],
  frame: '1m',
  chartMode: 'candles',
  selDur: DEFAULT_TRADE_DURATION,
  selProfit: profitForDuration(DEFAULT_TRADE_DURATION),
  livePrice: demoPrice(assets[0], Date.now()),
  quotes: new Map(),
  notifications: [],
  unreadNotifs: 0,
  messages: [],
  fundingRows: [],
  tradeRows: [],
  leaderboardRows: createLeaderboardData(),
  pendingTrade: null,
  activeTrade: null,
  lastSettledAlertId: '',
  bankCountry: 'India',
  bankDraft: {},
  txnFilters: { search: '', type: 'ALL', status: 'ALL', date: 'ALL', sort: 'NEWEST' },
  tradeFilters: { search: '', result: 'ALL', dir: 'ALL', date: 'ALL', sort: 'NEWEST' },
};

const role = (name: string) => roles.includes(name);
const nav = () => admin ? adminNav.filter(item => !item[3] || role(item[3])) : userNav;
const clientId = () => adminClient?.uid || '';
const canChat = () => role('admin') || role('support');
const clientSection = () => canChat() && adminLocation.messages ? 'messages' : 'activity';
const content = () => root.querySelector<HTMLElement>('#content')!;
const panel = () => root.querySelector<HTMLDialogElement>('#details')!;
const routeName = () => nav().find(item => item[0] === route)?.[2] || 'Client details';
const stop = () => {
  chart?.destroy(); chart = undefined;
  clearInterval(refreshTimer);
  clearInterval(quoteTimer);
  clearInterval(activeTradeInt);
  quoteTimer = 0; activeTradeInt = 0;
};
const stopSync = () => {
  syncUnsub?.();
  syncUnsub = undefined;
  window.clearTimeout(clientActivityTimer);
  clientActivityTimer = 0;
  lastClientActivityReport = -Infinity;
  syncInitialized = false;
  prevAdminSync = { tradesAt: 0, fundingAt: 0, clientsAt: 0, auditAt: 0, messagesAt: 0 };
  prevUserUpdatedAt = 0;
  prevUserDepositSettingsAt = 0;
  adminCache.clear();
  clientLoaded.funding = false;
  clientLoaded.trades = false;
  clientLoaded.notifications = false;
  clientLoaded.messages = false;
  clientState.notifications = [];
  clientState.unreadNotifs = 0;
  clientState.messages = [];
  clientState.fundingRows = [];
  clientState.tradeRows = [];
  clientState.activeTrade = null;
  clientState.depositReferenceNumber = '';
  clientState.chartMode = 'candles';
  clientState.selDur = DEFAULT_TRADE_DURATION;
  clientState.selProfit = profitForDuration(DEFAULT_TRADE_DURATION);
};
function replaceWorkspacePath(path: string) {
  if (location.pathname !== path || location.hash) history.replaceState(history.state, '', path + location.search);
}
function go(path: string) {
  if (location.pathname !== path) history.pushState(null, '', path);
  void render();
}
const cents = (value: unknown) => Math.round(Number(value) * 100);
function list(): List {
  const key = route + (route === 'client' ? ':' + clientId() + ':' + clientSection() : '');
  const saved = lists.get(key);
  if (saved) return saved;
  const initial: List = { page: 0, next: null, cursors: [null], search: '', status: 'pending' };
  lists.set(key, initial);
  return initial;
}
function resetList() { Object.assign(list(), { page: 0, next: null, cursors: [null] }); }
const navigation = () => pager(list().page, list().next);
const firstRowNumber = () => list().page * ADMIN_TABLE_PAGE_SIZE + 1;
function adminCacheKey(targetRoute = route) {
  const current = list();
  if (targetRoute === 'overview') return 'overview';
  if (targetRoute === 'withdrawals' || targetRoute === 'deposits') return targetRoute + ':' + current.status + ':' + current.search + ':' + current.page;
  if (targetRoute === 'client') return 'client:' + clientId() + ':' + clientSection() + ':' + current.page;
  return targetRoute + ':' + current.search + ':' + current.page;
}
function invalidateAdminCache(prefixes: string[]) {
  for (const [key, entry] of adminCache) {
    if (prefixes.some(prefix => key === prefix || key.startsWith(prefix + ':'))) {
      entry.dirty = true;
    }
  }
}
function applyCachedRows(rows: Row[], next: string | null, clientRow?: Row) {
  visibleRows = new Map(rows.map(row => [row.id, row]));
  if (clientRow) visibleRows.set('@client', clientRow);
  list().next = next;
}
async function getPage(run: number, op: string, args: Record<string, unknown> = {}) {
  const current = list();
  const page = await api.call<Page>(op, { ...args, cursor: current.cursors[current.page] });
  if (run === version) remember(page, current);
  return page.rows;
}
function remember(page: Page, current: List) {
  visibleRows = new Map(page.rows.map(row => [row.id, row]));
  current.next = page.cursor;
}
function updateWithdrawalRestriction(value: Home) {
  const warning = root.querySelector<HTMLElement>('#withdrawalRestriction');
  if (!warning) return;
  const restriction = clientWithdrawalRestriction(value);
  warning.textContent = restriction;
  warning.hidden = !restriction;
  const submit = root.querySelector<HTMLButtonElement>('#wdFormView button[type="submit"]');
  if (submit) {
    submit.disabled = Boolean(restriction || submit.form?.dataset.busy);
    submit.formNoValidate = Boolean(withdrawalReputationWarning(value.profile.reputationScore));
  }
}

function setHome(value: Home) {
  const previousDeposit = home?.depositSettings;
  const nextDeposit = value.depositSettings;
  home = value; clockOffset = value.serverTime - Date.now();
  const payment = root.querySelector('#depositPayment');
  const depositFields = ['usdtBscAddress', 'upiId', 'upiName', 'upiQrImage', 'usdtBscQrImage'] as const;
  if (payment && depositFields.some(field => previousDeposit?.[field] !== nextDeposit?.[field])) {
    payment.innerHTML = renderDepositPaymentHtml(value, clientState.depositMethod);
  }
  const balance = root.querySelector('#top-balance');
  if (balance) {
    balance.textContent = credits(value.wallet.available);
    balance.closest('a')?.setAttribute('aria-label', 'Available credits: ' + balance.textContent);
  }
  const pill = root.querySelector('#realAccountPill');
  if (pill) {
    const html = renderRealAccountBalance(value);
    if (pill.innerHTML !== html) pill.innerHTML = html;
  }
  const assets = root.querySelector('#walletBalanceCard');
  if (assets) {
    const html = renderAssetsBalance(value);
    if (assets.innerHTML !== html) assets.innerHTML = html;
  }
  updateWithdrawalRestriction(value);
  const reputation = root.querySelector('#dispRep');
  if (reputation) {
    const html = renderReputationValue(value.profile.reputationScore);
    if (reputation.innerHTML !== html) reputation.innerHTML = html;
  }
  if (value.profile.savedBank && !Object.keys(clientState.bankDraft).length) {
    clientState.bankCountry = value.profile.savedBank.country || 'India';
    clientState.bankDraft = { ...value.profile.savedBank };
  }
  const profileName = root.querySelector('#workspace-profile-name');
  const avatar = root.querySelector('#workspace-avatar');
  const name = value.profile.name?.trim() || 'Account';
  if (profileName) profileName.textContent = name;
  if (avatar) avatar.textContent = [...name][0].toUpperCase();
}
function toast(message: string) {
  const node = root.querySelector('#toast');
  if (!node) return;
  window.clearTimeout(toastTimer); node.textContent = message;
  toastTimer = window.setTimeout(() => { node.textContent = ''; }, 4500);
}
function dialog(heading: string, body: string) {
  const box = panel();
  box.innerHTML = '<h2 id="detail-heading">' + esc(heading) + '</h2>' + body +
    '<div class="button-row dashboard-lower"><button class="button secondary compact" data-action="close" type="button">Close</button></div>';
  if (!box.open) box.showModal();
}
const dialogShell = '<dialog id="details" aria-labelledby="detail-heading"></dialog>';
function definition(entries: [string, unknown][]) {
  return '<dl>' + entries.map(([name, value]) => '<dt>' + esc(name) + '</dt><dd>' + esc(value ?? '—') + '</dd>').join('') + '</dl>';
}
function showAuth(notice = '') {
  stop();
  if (!admin) {
    root.innerHTML = userLogin({ registration, signedIn: !!person, remember: rememberPreference(), showQuickStart: emulator, notice }) + dialogShell;
    void attachLoginChart();
    return;
  }
  const heading = admin ? 'Admin sign-in' : registration ? 'Create your trading account' : 'Sign in';
  const fields = '<label>Email<input name="email" type="email" autocomplete="email" required></label>' +
    '<label>Password<input name="password" type="password" autocomplete="' + (registration ? 'new-password' : 'current-password') + '" minlength="6" required></label>';
  root.innerHTML = '<div class="auth-wrap"><div class="auth-intro">' + brand + '<h1>' + (admin ? 'Trading operations' : 'Your live trading workspace') +
    '</h1><p>' + (admin ? 'Review client accounts, approve funding requests and monitor trading activity.' : 'Explore live crypto markets, place trades and follow each result in one workspace.') +
    '</p><span class="pill practice">Live terminal</span></div><section class="auth-card"><h2>' + heading + '</h2>' +
    (notice ? '<p class="error">' + esc(notice) + '</p>' : '') + (!person ? '<form data-form="auth">' + fields +
      '<button class="button">' + (registration ? 'Create account' : 'Sign in') + '</button>' + formStatus() + '</form>' : '') + '<div class="button-row">' +
    (!person && !admin ? '<button class="button secondary compact" data-action="registration">' + (registration ? 'Back to sign in' : 'Create an account') + '</button>' : '') +
    (!person ? '<button class="button secondary compact" data-action="reset">Reset password</button>' : '') +
    (person && admin && !emulator ? '<button class="button secondary compact" data-action="enroll">Set up authenticator</button>' : '') +
    (person ? '<button class="button secondary compact" data-action="signout">Sign out</button>' : '') +
    (emulator && !person ? '<button class="button secondary" data-action="quick-start">Open trading workspace</button>' : '') +
    '</div><p id="auth-notice" class="form-status" role="status"></p>' + dialogShell + '</section></div>';
}
async function attachLoginChart() {
  const canvas = root.querySelector<HTMLCanvasElement>('#login-chart');
  const status = root.querySelector<HTMLElement>('#login-chart-status');
  if (!canvas || !status) return;
  try {
    const { mountChart } = await import('./canvas-chart');
    if (!canvas.isConnected) return;
    chart = mountChart(canvas, status, () => {});
    chart.load(assets[0], '5m', false);
    status.textContent = 'Live chart';
  } catch {
    if (status.isConnected) status.textContent = 'Chart unavailable';
  }
}
function authNotice(message: string) {
  const node = root.querySelector('#auth-notice');
  if (node) node.textContent = message;
}
function navigationLink([id, icon, name]: string[]) {
  const badge = admin && (id === 'withdrawals' || id === 'deposits')
    ? '<span class="nav-badge" id="nav-badge-' + id + '" hidden>0</span>' : '';
  return '<a href="' + adminPath(id) + '" data-nav="' + id + '"><span class="nav-symbol" aria-hidden="true">' + icon + '</span><span class="nav-text">' + name + '</span>' + badge + '</a>';
}

function setAdminBadges(deposits: unknown, withdrawals: unknown) {
  for (const [key, count] of [['deposits', Number(deposits || 0)], ['withdrawals', Number(withdrawals || 0)]] as const) {
    const el = root.querySelector<HTMLElement>('#nav-badge-' + key);
    if (!el) continue;
    if (count > 0) {
      el.textContent = String(count);
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }
}

async function refreshAdminBadges() {
  if (!admin || !access) return;
  try {
    const data = await api.call<{ deposits?: number; withdrawals?: number }>('admin.badges');
    setAdminBadges(data.deposits, data.withdrawals);
  } catch { /* Non-fatal badge refresh. */ }
}

function clientAlert(heading: string, msg: string) {
  const titleEl = root.querySelector<HTMLElement>('#alertTitle');
  const msgEl = root.querySelector<HTMLElement>('#alertMsg');
  const box = root.querySelector<HTMLElement>('#alertOverlay');
  if (titleEl && msgEl && box) {
    titleEl.textContent = heading;
    msgEl.textContent = msg;
    box.classList.add('open');
  } else {
    toast(msg);
  }
}

function updateClientQuoteDisplays() {
  const { dropItems, gridItems } = renderAssetDropdownAndGrid(clientState);
  const assetList = root.querySelector<HTMLElement>('#assetList');
  if (assetList) assetList.innerHTML = dropItems;
  const coinGrid = root.querySelector<HTMLElement>('#coinGrid');
  if (coinGrid) coinGrid.innerHTML = gridItems;
  const ob = root.querySelector<HTMLElement>('#orderBookList');
  if (ob) {
    if (isGateAsset(clientState.selected)) ob.textContent = 'Price updates come from Gate spot.';
    else ob.innerHTML = renderOrderBookHtml(clientState.livePrice);
  }
  const blindPrice = root.querySelector<HTMLElement>('#blindPrice');
  if (blindPrice && clientState.livePrice > 0) {
    blindPrice.textContent = clientState.livePrice < 1 ? clientState.livePrice.toFixed(5) : clientState.livePrice.toFixed(4);
  }
}

async function fetchLiveMarketQuotes() {
  if (admin || !access) return;
  const session = authVersion;
  const gate = assets.find(isGateAsset);
  const syms = assets.filter(asset => !isGateAsset(asset)).map(asset => asset.symbol);
  const url = 'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(syms));
  const [binanceQuotes, gateQuote] = await Promise.allSettled([
    fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) }).then(async response =>
      response.ok ? await response.json() as { symbol: string; lastPrice: string; priceChangePercent: string }[] : [],
    ),
    gate ? gateTicker(gate) : null,
  ]);
  if (!access || session !== authVersion) return;
  if (binanceQuotes.status === 'fulfilled') {
    for (const r of binanceQuotes.value) {
      const price = Number(r.lastPrice), change = Number(r.priceChangePercent);
      if (Number.isFinite(price) && price > 0) {
        clientState.quotes.set(r.symbol, { price, change: Number.isFinite(change) ? change : 0 });
      }
    }
  }
  if (gate) {
    if (gateQuote.status === 'fulfilled' && gateQuote.value) clientState.quotes.set(gate.symbol, gateQuote.value);
    else clientState.quotes.delete(gate.symbol);
  }
  const selQ = clientState.quotes.get(clientState.selected.symbol);
  if (selQ && selQ.price > 0) clientState.livePrice = selQ.price;
  updateClientQuoteDisplays();
}

function renderClientNotificationsUi(animate = true) {
  if (!home) return;
  const unread = clientState.notifications.filter(n => isNotifUnread(n, home!)).length;
  clientState.unreadNotifs = unread;
  const badge = root.querySelector<HTMLElement>('#notifBadge');
  if (badge) {
    badge.textContent = String(unread);
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }
  const listEl = root.querySelector<HTMLElement>('#notifList');
  if (listEl) listEl.innerHTML = renderNotificationsOverlayList(home, clientState);
  const banners = root.querySelector<HTMLElement>('#notifBanners');
  const bell = animate ? root.querySelector<HTMLElement>('[data-action="client-toggle-notif"]') : null;
  if (banners) updateNotifBanners(banners, bell, home, clientState);
}

function renderClientMessagesUi() {
  const host = root.querySelector<HTMLElement>('#msgConvoList');
  if (!host) return;
  if (!clientState.messages.length) {
    const prompt = clientLoaded.messages ? 'Start a conversation with Support below.' : 'Loading conversation…';
    host.innerHTML = '<div class="msg-convo-caption">' + prompt + '</div>';
    return;
  }
  const html = [...clientState.messages].reverse().map(m => {
    const mine = String(m.sender || '') !== 'Support';
    return `<div class="msg-bubble ${mine ? 'mine' : 'theirs'}">${esc(m.message)}<div class="msg-time">${mine ? 'You' : 'Support'} · ${esc(dateTime(m.createdAt))}</div></div>`;
  }).join('');
  if (host.innerHTML === html) return;
  host.innerHTML = html;
  host.scrollTop = host.scrollHeight;
}

async function loadClientMessages() {
  const run = ++clientMessagesRequest, session = authVersion;
  try {
    const result = await api.call<Page>('list', { list: 'messages' });
    if (run !== clientMessagesRequest || session !== authVersion) return;
    clientState.messages = result.rows;
    clientLoaded.messages = true;
    renderClientMessagesUi();
  } catch {
    const host = root.querySelector<HTMLElement>('#msgConvoList');
    if (run === clientMessagesRequest && session === authVersion && host && !clientLoaded.messages) {
      host.innerHTML = '<div class="msg-convo-caption">Unable to load messages. Close and reopen Support Messages to retry.</div>';
    }
  }
}

async function hydrateClientSidebarData() {
  if (admin || !access || !home) return;
  const session = authVersion;
  const request = ++clientNotificationsRequest;
  const messagesRequest = loadClientMessages();
  try {
    const notifRes = await api.call<Page>('list', { list: 'notifications' });
    if (session === authVersion && request === clientNotificationsRequest) {
      const animate = clientLoaded.notifications;
      const readIds = new Set(clientState.notifications.filter(n => n.read === true).map(n => String(n.id)));
      clientState.notifications = notifRes.rows.map(n => readIds.has(String(n.id)) ? { ...n, read: true } : n);
      clientLoaded.notifications = true;
      renderClientNotificationsUi(animate);
    }
  } catch { /* Non-fatal background sync. */ }
  await messagesRequest;
}

function startActiveTradeCountdown(trade: { id: string; symbol: string; direction: string; stake: number; dueAt: number; profitPercent: number; entry: number }) {
  clientState.activeTrade = trade;
  clearInterval(activeTradeInt);
  const overlay = root.querySelector<HTMLElement>('#activeTradeOverlay');
  const card = root.querySelector<HTMLElement>('#activeTradeCard');
  if (!overlay || !card || !home) return;
  const isUp = String(trade.direction).toLowerCase() === 'up';
  const potential = Math.round(Number(trade.stake) * Number(trade.profitPercent || 50) / 100);
  card.innerHTML = `
    <h5 style="color:#fff;margin:0 0 18px;font-weight:800;letter-spacing:.06em;">TRADE ACTIVE</h5>
    <div class="blind-label">ASSET</div>
    <div class="blind-val">${renderTradePair(trade.symbol)}</div>
    <div class="blind-label">DIRECTION</div>
    <div class="blind-val" style="color:${isUp ? 'var(--iq-green)' : 'var(--iq-red)'};">${isUp ? 'BUY' : 'SELL'}</div>
    <div class="blind-timer" id="blindTimer">00:00</div>
    <div class="blind-label">CURRENT PRICE</div>
    <div class="blind-val" id="blindPrice" style="color:var(--iq-accent);">${Number(clientState.livePrice || trade.entry).toFixed(4)}</div>
    <div class="blind-label">POTENTIAL PROFIT (${esc(curSym(home))})</div>
    <div class="blind-val">${esc(fmtMoney(potential, home))}</div>
    <div style="color:var(--iq-accent);font-size:12px;font-weight:700;margin-top:10px;">Please wait for the timer to complete. Your order is already booked.</div>`;
  overlay.classList.add('open');

  const tick = async () => {
    const timerEl = root.querySelector<HTMLElement>('#blindTimer');
    const remMs = trade.dueAt - (Date.now() + clockOffset);
    const remSec = Math.max(0, Math.ceil(remMs / 1000));
    const min = Math.floor(remSec / 60), sec = remSec % 60;
    if (timerEl) timerEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    if (remMs <= 0 && !tradeSettling) {
      tradeSettling = true;
      clearInterval(activeTradeInt);
      activeTradeInt = 0;
      const resultOverlay = root.querySelector<HTMLElement>('#resultOverlay');
      const resultCard = root.querySelector<HTMLElement>('#resultCard');
      overlay.classList.remove('open');
      if (resultCard && resultOverlay) {
        resultCard.innerHTML = '<h5 style="color:var(--iq-muted);margin:0 0 12px;">SETTLING TRADE</h5><p style="font-size:14px;">Calculating result…</p>';
        resultOverlay.classList.add('open');
      }
      try {
        const [updated, tradesPage] = await Promise.all([
          api.call<Home>('home'),
          api.call<Page>('list', { list: 'trades', limit: 100 }),
        ]);
        setHome(updated);
        clientState.tradeRows = tradesPage.rows;
        clientLoaded.trades = true;
        const settled = tradesPage.rows.find(t => t.id === trade.id) || tradesPage.rows[0];
        clientState.activeTrade = null;
        if (settled && resultCard && home) {
          const outcome = String(settled.outcome || '').toLowerCase();
          const pnl = Number(settled.pnl || 0);
          const color = outcome === 'win' ? 'var(--iq-green)' : outcome === 'loss' ? 'var(--iq-red)' : 'var(--iq-muted)';
          resultCard.innerHTML = `
            <h5 style="color:var(--iq-muted);margin:0 0 12px;font-weight:800;">TRADE RESULT</h5>
            <h1 style="font-weight:900;color:${color};margin:0 0 8px;font-size:34px;">${esc(fmtSignedMoney(pnl, home))}</h1>
            <div style="font-weight:800;margin-bottom:20px;color:#fff;">${renderTradePair(String(settled.symbol || trade.symbol))}</div>
            <button type="button" class="replica-primary-btn" data-action="client-close-result">CONTINUE</button>`;
        } else {
          resultOverlay?.classList.remove('open');
        }
        void hydrateClientSidebarData();
        if (clientState.activeTab === 'tradeHistory') renderClientTabContent('tradeHistory');
      } catch (err) {
        resultOverlay?.classList.remove('open');
        clientState.activeTrade = null;
        toast(errorMessage(err));
      } finally {
        tradeSettling = false;
      }
    }
  };
  void tick();
  activeTradeInt = window.setInterval(() => void tick(), 250);
}

function renderClientTabContent(tab: ClientState['activeTab']) {
  if (!home) return;
  if (tab === 'wallet') {
    const el = root.querySelector<HTMLElement>('#walletTab');
    if (el) el.innerHTML = buildWalletTabHtml(home, clientState);
  } else if (tab === 'history') {
    const el = root.querySelector<HTMLElement>('#historyTab');
    if (el) el.innerHTML = buildTransactionHistoryHtml(home, clientState);
  } else if (tab === 'tradeHistory') {
    const el = root.querySelector<HTMLElement>('#tradeHistoryTab');
    if (el) el.innerHTML = buildTradeHistoryHtml(home, clientState);
  } else if (tab === 'leaderboard') {
    const el = root.querySelector<HTMLElement>('#leaderboardTab');
    if (el) el.innerHTML = buildLeaderboardHtml(home, clientState);
  } else if (tab === 'profile') {
    const el = root.querySelector<HTMLElement>('#profileTab');
    if (el) el.innerHTML = buildProfileTabHtml(home);
  } else if (tab === 'assets') {
    updateClientQuoteDisplays();
  }
}

async function refreshClientTabData(tab: ClientState['activeTab'], force = false) {
  if (admin || !access || !home) return;
  try {
    if (tab === 'wallet' || tab === 'history') {
      if (!force && clientLoaded.funding && tab === 'history') return;
      const [updated, pageRes] = await Promise.all([
        api.call<Home>('home'),
        api.call<Page>('list', { list: 'funding', limit: 100 }),
      ]);
      setHome(updated);
      clientState.fundingRows = pageRes.rows;
      clientLoaded.funding = true;
      if (tab === 'wallet') {
        if (!root.querySelector('#walletTab')?.contains(document.activeElement)) renderClientTabContent('wallet');
      } else if (!root.querySelector('#historyTab')?.contains(document.activeElement)) {
        renderClientTabContent('history');
      }
    } else if (tab === 'tradeHistory') {
      if (!force && clientLoaded.trades) return;
      const pageRes = await api.call<Page>('list', { list: 'trades', limit: 100 });
      clientState.tradeRows = pageRes.rows;
      clientLoaded.trades = true;
      if (!root.querySelector('#tradeHistoryTab')?.contains(document.activeElement)) renderClientTabContent('tradeHistory');
    } else if (tab === 'profile') {
      const updated = await api.call<Home>('home');
      setHome(updated);
      if (!root.querySelector('#profileTab')?.contains(document.activeElement)) renderClientTabContent('profile');
    }
  } catch { /* Preserve cached tab contents quietly. */ }
}

function activateClientTab(tab: ClientState['activeTab']) {
  clientState.activeTab = tab;
  const appIf = root.querySelector<HTMLElement>('#app-interface');
  if (appIf) {
    appIf.classList.toggle('market-active', tab === 'market');
    appIf.classList.toggle('content-expanded', tab !== 'market');
  }
  const rightSide = root.querySelector<HTMLElement>('.right-sidebar');
  if (rightSide) {
    rightSide.classList.toggle('trade-visible', tab === 'market');
    rightSide.classList.toggle('is-market-panel', tab === 'market');
    rightSide.style.display = tab === 'market' ? 'flex' : 'none';
  }
  const map: Record<ClientState['activeTab'], string> = {
    market: '', assets: 'assetsTab', wallet: 'walletTab', history: 'historyTab',
    tradeHistory: 'tradeHistoryTab', leaderboard: 'leaderboardTab', profile: 'profileTab',
  };
  for (const ov of root.querySelectorAll<HTMLElement>('.content-overlay')) {
    ov.classList.toggle('active', ov.id === map[tab]);
  }
  for (const item of root.querySelectorAll<HTMLElement>('.left-sidebar .menu-icon, #mobileSidebar .mobile-nav-item')) {
    item.classList.toggle('active', item.dataset.tab === tab);
  }
  root.querySelector('#mobileSidebar')?.classList.remove('open');
  root.querySelector('#mobileOverlay')?.classList.remove('open');
  root.querySelector('#notifOverlay')?.classList.remove('open');
  root.querySelector('#msgOverlay')?.classList.remove('open');

  renderClientTabContent(tab);
  void refreshClientTabData(tab, false);
}

function shell() {
  if (!admin && home) {
    stop();
    root.innerHTML = buildClientShellHtml(home, clientState) + dialogShell + '<p id="toast" class="toast" role="status"></p>';
    updateClientQuoteDisplays();
    renderClientNotificationsUi(false);
    renderClientMessagesUi();
    void (async () => {
      const canvas = root.querySelector<HTMLCanvasElement>('#market-chart');
      const statusEl = root.querySelector<HTMLElement>('#feed-status');
      const markerEl = root.querySelector<HTMLElement>('#chartLiveMarker');
      const { mountChart } = await import('./canvas-chart');
      if (!canvas?.isConnected || !statusEl?.isConnected) return;
      chart = mountChart(canvas, statusEl, value => {
        clientState.livePrice = value;
        const ob = root.querySelector<HTMLElement>('#orderBookList');
        if (ob && clientState.activeTab === 'market' && !isGateAsset(clientState.selected)) ob.innerHTML = renderOrderBookHtml(value);
        const bp = root.querySelector<HTMLElement>('#blindPrice');
        if (bp && clientState.activeTrade) bp.textContent = value < 1 ? value.toFixed(5) : value.toFixed(4);
      }, {
        replica: true,
        onMarker: pos => {
          if (!markerEl) return;
          if (!pos) { markerEl.style.display = 'none'; return; }
          markerEl.style.display = 'block';
          markerEl.style.left = `${pos.x}px`;
          markerEl.style.top = `${pos.y}px`;
          markerEl.classList.toggle('price-tick-up', pos.up);
          markerEl.classList.toggle('price-tick-down', !pos.up);
        },
      });
      chart.setMode(clientState.chartMode);
      chart.load(clientState.selected, clientState.frame, !emulator, clockOffset);
      await fetchLiveMarketQuotes();
      quoteTimer = window.setInterval(() => { if (!document.hidden) void fetchLiveMarketQuotes(); }, 20000);
    })();
    void hydrateClientSidebarData();
    if (home.active.length) {
      const t = home.active[0];
      startActiveTradeCountdown({
        id: String(t.id),
        symbol: String(t.symbol || 'BTCUSDT'),
        direction: String(t.direction || 'up'),
        stake: Number(t.stake || 0),
        dueAt: Number(t.dueAt || Date.now()),
        profitPercent: Number(t.profitPercent || 50),
        entry: Number(t.entry || 0),
      });
    }
    return;
  }

  const navigation = adminNavGroups.map(group => {
    const links = group.links.filter(item => !item[3] || role(item[3]));
    return links.length ? '<div class="admin-nav-group">' +
      links.map(navigationLink).join('') +
      '<button type="button" class="nav-logout-btn" data-action="signout"><span class="nav-symbol" aria-hidden="true">' + adminLogoutIcon + '</span><span class="nav-text">Logout</span></button>' +
      '</div>' : '';
  }).join('');
  const dismissMenu = '<button type="button" class="workspace-menu-dismiss" data-action="dismiss-menu" tabindex="-1" aria-label="Close navigation"></button>';
  root.innerHTML = '<div class="shell admin-shell"><aside class="sidebar" id="sidebar">' + brand +
    '<nav class="navigation" aria-label="Staff navigation">' + navigation +
    '</nav></aside>' + dismissMenu + '<div class="work">' +
    '<button type="button" class="button secondary compact menu-toggle" data-action="menu" aria-controls="sidebar" aria-expanded="false">Menu</button>' +
    '<main id="content" class="content"></main></div></div>' + dialogShell + '<p id="toast" class="toast" role="status"></p>';
}
function startRealtimeSync() {
  if (!api || !person) return;
  syncUnsub?.();
  syncInitialized = false;
  if (admin) {
    syncUnsub = api.watchAdminSync(data => {
      const next = {
        tradesAt: Number(data.tradesAt || 0),
        fundingAt: Number(data.fundingAt || 0),
        clientsAt: Number(data.clientsAt || 0),
        auditAt: Number(data.auditAt || 0),
        messagesAt: Number(data.messagesAt || 0),
      };
      if (!syncInitialized) {
        prevAdminSync = next;
        syncInitialized = true;
        return;
      }
      const tradesChanged = next.tradesAt > prevAdminSync.tradesAt;
      const fundingChanged = next.fundingAt > prevAdminSync.fundingAt;
      const clientsChanged = next.clientsAt > prevAdminSync.clientsAt;
      const auditChanged = next.auditAt > prevAdminSync.auditAt;
      const messagesChanged = canChat() && next.messagesAt !== prevAdminSync.messagesAt;
      prevAdminSync = next;

      if (tradesChanged) invalidateAdminCache(['trades', 'overview']);
      if (fundingChanged) invalidateAdminCache(['withdrawals', 'deposits', 'overview']);
      if (clientsChanged) invalidateAdminCache(['clients', 'client', 'overview']);
      if (auditChanged) invalidateAdminCache(['audit']);
      if (messagesChanged) invalidateAdminCache(['clients', 'client']);

      if (fundingChanged && route !== 'overview') {
        void refreshAdminBadges();
      }
      const shouldRefreshCurrent =
        (route === 'overview' && (tradesChanged || fundingChanged || clientsChanged)) ||
        (route === 'trades' && tradesChanged) ||
        ((route === 'clients' || route === 'client') && clientsChanged) ||
        (messagesChanged && (route === 'clients' || (route === 'client' && clientSection() === 'messages'))) ||
        ((route === 'withdrawals' || route === 'deposits') && fundingChanged) ||
        (route === 'audit' && auditChanged);

      if (shouldRefreshCurrent) {
        void silentRefreshCurrentRoute();
      }
    });
  } else {
    const uid = person.uid;
    syncUnsub = api.watchUserSync(uid, data => {
      const nextAt = Number(data.updatedAt || 0);
      const depositSettingsAt = Number(data.depositSettingsAt || 0);
      const depositSettingsChanged = depositSettingsAt > prevUserDepositSettingsAt;
      if (depositSettingsChanged) prevUserDepositSettingsAt = depositSettingsAt;
      if (!syncInitialized) {
        prevUserUpdatedAt = nextAt;
        syncInitialized = true;
        if (depositSettingsChanged) void silentRefreshUserView();
        return;
      }
      if (nextAt <= prevUserUpdatedAt && !depositSettingsChanged) return;
      prevUserUpdatedAt = Math.max(prevUserUpdatedAt, nextAt);
      void silentRefreshUserView();
    });
  }
}

function reportClientActivity() {
  clientActivityTimer = 0;
  if (!access) return;
  const now = performance.now();
  const ageMs = Math.floor(now - lastClientActivity);
  if (ageMs >= CLIENT_IDLE_MS) return;
  lastClientActivityReport = now;
  void api.call('client.activity', { ageMs }).catch(() => { /* Retry on later interactions. */ });
}

function noteClientActivity(event?: Event) {
  if (admin || !access || document.hidden || (event && !event.isTrusted)) return;
  lastClientActivity = performance.now();
  if (clientActivityTimer) return;
  const wait = CLIENT_ACTIVITY_SYNC_MS - (lastClientActivity - lastClientActivityReport);
  if (wait > 0) clientActivityTimer = window.setTimeout(reportClientActivity, wait);
  else reportClientActivity();
}

function resetWorkspaceSession(user: User | null) {
  authVersion++;
  version++;
  stop();
  stopSync();
  window.clearTimeout(adminSessionTimer);
  adminSessionTimer = 0;
  adminSessionExpiresAt = 0;
  access = false;
  home = undefined;
  roles = [];
  lists.clear();
  adminCache.clear();
  adminClient = undefined;
  visibleRows.clear();
  person = user;
  resolver = undefined;
  secret = undefined;
}

function expireAdminSession() {
  if (!admin || !person) return;
  adminSignInNotice = 'Your admin session ended. Sign in again.';
  resetWorkspaceSession(null);
  showAuth(adminSignInNotice);
  void finishStartup(root);
  void signOut(api.auth).catch(() => { /* The workspace and its cached data have been cleared. */ });
}

async function start() {
  replaceWorkspacePath(workspaceEntryPath(location, admin ? adminNav : undefined));
  try {
    api = await connect(admin ? 'admin' : 'user', expireAdminSession);
    onAuthStateChanged(api.auth, async user => {
      resetWorkspaceSession(user);
      const latest = authVersion;
      if (!user) {
        showAuth(adminSignInNotice);
        adminSignInNotice = '';
        void finishStartup(root);
        return;
      }
      showStartup(root);
      root.replaceChildren();
      try {
        if (admin) {
          const data = await api.call<{ roles: string[]; serverTime?: number; sessionExpiresAt?: number }>('admin.access');
          if (latest !== authVersion) return;
          roles = data.roles;
          clockOffset = (data.serverTime ?? Date.now()) - Date.now();
          adminSessionExpiresAt = data.sessionExpiresAt ?? 0;
          if (adminSessionExpiresAt) {
            const remaining = adminSessionExpiresAt - (Date.now() + clockOffset);
            if (remaining <= 0) { expireAdminSession(); return; }
            adminSessionTimer = window.setTimeout(expireAdminSession, remaining);
          }
        } else {
          const data = await api.call<Home>('access');
          if (latest !== authVersion) return;
          setHome(data);
        }
        access = true; shell(); startRealtimeSync();
        if (admin) void refreshAdminBadges();
        else noteClientActivity();
        await render();
      } catch (error) {
        if (latest === authVersion) showAuth(errorMessage(error));
      } finally {
        if (latest === authVersion) void finishStartup(root);
      }
    });
  } catch (error) {
    root.innerHTML = '<main class="content">' + title('Workspace unavailable', errorMessage(error)) + '</main>';
    void finishStartup(root);
  }
}
type SupportPage = Page & { supportUnreadMarker?: string };
type ClientBundle = { data: { profile: Profile; wallet: Wallet | null; activity: Page }; page: SupportPage };
type OverviewData = {
  clients: number;
  trades: number;
  deposits: number;
  withdrawals: number;
  invitationCode?: string;
  fundedInvitationCode?: string;
};
type AdminPayload = { payload: unknown; rows: Row[]; next: string | null; clientRow?: Row; invitationRevision?: number };
type ListBundle = { rows: Row[]; next: string | null };

function clientSummaryHtml(data: ClientBundle['data']) {
  const balance = data.wallet ? '<div class="admin-client-balances"><article class="metric"><small>Available balance</small><strong>₹' +
    credits(data.wallet.available) + '</strong></article><article class="metric"><small>Balance on hold</small><strong>₹' +
    credits(data.wallet.held) + '</strong></article></div>' : '';
  const identity = data.wallet ? '<section class="panel admin-client-identity"><header class="panel-heading"><h2>Account permissions</h2></header>' +
    '<div class="panel-body"><dl><dt>Trading</dt><dd>' + state(data.profile.tradeEnabled ? 'enabled' : 'paused') +
    '</dd><dt>Withdrawals</dt><dd>' + state(data.profile.withdrawalEnabled ? 'enabled' : 'paused') + '</dd></dl></div></section>' : '';
  return balance + identity;
}
function clientActivityBodyHtml(uid: string, data: ClientBundle['data'], page: Page) {
  const thread = clientSection() === 'messages';
  return '<div class="filters" role="group" aria-label="Client activity view">' +
    '<button type="button" class="button secondary compact" data-action="client-tab" data-id="activity" aria-pressed="' + String(!thread) + '">Activity</button>' +
    (canChat() ? '<button type="button" class="button secondary compact" data-action="client-tab" data-id="messages" aria-pressed="' +
      String(thread) + '">Messages</button>' : '') + '</div>' +
    (thread ? messages(page.rows, uid) : data.wallet ? ledgerRows(page.rows) : table(['Sender', 'Message', 'Date'],
      page.rows.map(row => [esc(row.sender), esc(row.message), dateTime(row.createdAt)]), 'No client messages')) +
    '<div id="client-activity-pager">' + navigation() + '</div>';
}
function buildClientDetailHtml(bundle: ClientBundle) {
  const uid = clientId(), { data, page } = bundle;
  return '<div id="client-detail-head">' + title(data.profile.name, data.profile.email) + '</div>' +
    '<div class="button-row admin-client-actions"><a class="button secondary compact" href="' + adminPath('clients') + '" data-nav="clients">Back to clients</a>' +
    (role('admin') ? actionButton('restrictions', uid, 'Restrictions') : '') +
    (role('finance') ? actionButton('adjustment', uid, 'Adjust credits') : '') + '</div>' +
    '<div class="admin-client-summary" id="client-summary-panel">' + clientSummaryHtml(data) + '</div>' +
    '<section class="panel" id="client-activity-panel"><header class="panel-heading"><h2>' + (clientSection() === 'messages' ? 'Support chat' : 'Client activity') + '</h2></header>' +
    '<div id="client-activity-body">' + clientActivityBodyHtml(uid, data, page) + '</div></section>';
}

const overviewCards = [
  ['clients', 'Clients in your scope'],
  ['trades', 'Open trades'],
  ['deposits', 'Pending deposits'],
  ['withdrawals', 'Pending withdrawals'],
] as const;

const invitationCards = [
  { kind: 'standard', key: 'invitationCode', title: 'Client Invitation Code', copy: 'Copy code', description: 'Share this code with new clients to register under your management.' },
  { kind: 'funded', key: 'fundedInvitationCode', title: '2000 Invitation Code', copy: 'Copy 2000 code', description: 'Share this reusable code to give each new client ₹2,000 at registration.' },
] as const;

function invitationCardHtml(card: typeof invitationCards[number], code: string) {
  return '<section class="panel admin-invite" data-invite-kind="' + card.kind + '"><div class="admin-invite-copy"><h2>' +
    card.title + '</h2><p>' + card.description + '</p></div>' +
    '<div class="admin-invite-controls"><code data-invite-code>' + esc(code || 'No code generated') + '</code>' +
    '<div class="admin-invite-actions">' +
    '<button type="button" class="invite-btn refresh-btn" data-action="refresh-invite" data-id="' + card.kind + '" aria-label="Generate new ' +
    card.title + '">' + adminActionIcons.refresh + '<span>Generate</span></button>' +
    '<button type="button" class="invite-btn invite-copy-btn" data-action="copy-invite" data-id="' + card.kind + '" data-code="' + esc(code) + '"' +
    (code ? '' : ' disabled') + '>' + adminActionIcons.copy + '<span>' + card.copy + '</span></button>' +
    '</div></div></section>';
}

function updateInvitationCard(kind: string, code: string) {
  const card = root.querySelector('[data-invite-kind="' + kind + '"]');
  const codeEl = card?.querySelector('[data-invite-code]');
  const copyBtn = card?.querySelector<HTMLButtonElement>('[data-action="copy-invite"]');
  if (!codeEl || !copyBtn) return;
  const label = code || 'No code generated';
  if (codeEl.textContent !== label) codeEl.textContent = label;
  copyBtn.dataset.code = code;
  copyBtn.disabled = !code;
}

function buildOverviewHtml(values: OverviewData) {
  const cards = invitationCards.filter(card => card.kind === 'standard' || role('admin'));
  return title('Admin dashboard', 'Monitor accounts, orders, and requests in your staff scope.') + '<div class="admin-overview-grid">' +
    overviewCards.map(([key, name]) => {
      const allowed = nav().some(item => item[0] === key);
      const tag = allowed ? 'a' : 'article';
      return '<' + tag + ' class="metric admin-metric"' + (allowed ? ' href="' + adminPath(key) + '" data-nav="' + key + '"' : '') + '><small>' + name + '</small><strong data-metric="' + key + '">' +
        Number(values[key] || 0).toLocaleString() + '</strong><span class="admin-metric-foot">' + (allowed ? 'View ' + key + ' ↗' : 'Current total') +
        '</span></' + tag + '>';
    }).join('') + '</div>' + cards.map(card => invitationCardHtml(card, values[card.key] || '')).join('');
}

function clientStatusHtml(row: Row, now = Date.now() + clockOffset) {
  const freeze = walletFreeze(Number(row.balance ?? 0), {
    frozen: row.frozen,
    freezeAmount: row.freezeAmount,
    frozenAmount: row.frozenAmount,
  });
  if (freeze.kind === 'account') return '<span class="status-frozen">FROZEN</span>';
  if (freeze.kind === 'amount') return '<span class="status-frozen">AMOUNT FROZEN</span>';
  if (freeze.kind === 'withdrawals') return '<span class="status-frozen">WITHDRAWALS FROZEN</span>';
  if (!row.tradeEnabled || !row.withdrawalEnabled) return '<span class="status-inactive">SUSPENDED</span>';
  const lastActiveAt = Number(row.lastActiveAt || 0);
  if (!lastActiveAt || now - lastActiveAt > CLIENT_IDLE_MS) return '<span class="status-idle">IDLE</span>';
  return '<span class="status-active">ACTIVE</span>';
}

function clientNumberOf(row?: Row) {
  const number = row?.clientNumber;
  return typeof number === 'number' && Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function clientRowCells(row: Row) {
  const uid = String(row.id || '');
  const chatPending = Boolean(row.supportUnreadMarker);
  const chatLabel = chatPending ? 'Chat with client · Unread messages' : 'Chat with client';
  const shortUid = uid.slice(0, 8).toUpperCase();
  const number = clientNumberOf(row);
  const vipRaw = String(row.vipLevel || 'VIP1');
  const vipUnverified = vipRaw.toLowerCase() === 'unverified';
  const vipLabel = vipUnverified ? 'UNVERIFIED' : vipRaw.toUpperCase().replace(/^VIP(\d)$/i, 'VIP $1');
  const rep = Number(row.reputationScore ?? 100);
  const balance = Number(row.balance ?? 0);
  const mode = String(row.tradeMode || 'auto').toLowerCase();
  return [
    number === undefined ? '—' : '#' + number,
    '<strong class="client-name">' + esc(String(row.name || '')) + '</strong><div class="client-email">' + esc(String(row.email || '')) + '</div><div class="client-uid">UID: ' + esc(shortUid) + '</div>',
    '<span class="vip-badge' + (vipUnverified ? ' unverified' : '') + '">' + esc(vipLabel) + '</span><div class="rep-score">Rep: ' + rep + '</div>',
    '₹' + credits(balance),
    clientStatusHtml(row),
    '<div class="trade-mode-group">' +
      '<button type="button" class="trade-pill trade-auto' + (mode === 'auto' ? ' active' : '') + '" data-action="trade-mode" data-id="' + esc(uid) + '" data-mode="auto">Auto</button>' +
      '<button type="button" class="trade-pill trade-win' + (mode === 'win' ? ' active' : '') + '" data-action="trade-mode" data-id="' + esc(uid) + '" data-mode="win">Win</button>' +
      '<button type="button" class="trade-pill trade-loss' + (mode === 'loss' ? ' active' : '') + '" data-action="trade-mode" data-id="' + esc(uid) + '" data-mode="loss">Loss</button>' +
    '</div>',
    '<button type="button" class="icon-action-btn" data-action="client" data-id="' + esc(uid) + '" title="View details">' + adminActionIcons.report + '</button>' +
    (canChat() ? '<button type="button" class="icon-action-btn' + (chatPending ? ' chat-pending' : '') + '" data-action="client-chat" data-id="' + esc(uid) +
      '" title="' + chatLabel + '" aria-label="' + chatLabel + '">' + adminActionIcons.chat + '</button>' : '') +
    '<button type="button" class="icon-action-btn" data-action="balance-modal" data-id="' + esc(uid) + '" data-name="' + esc(String(row.name || '')) + '" title="Manage balance">' + adminActionIcons.wallet + '</button>' +
    '<button type="button" class="icon-action-btn" data-action="notify-client" data-id="' + esc(uid) + '" data-name="' + esc(String(row.name || '')) + '" title="Push notification">' + adminActionIcons.bell + '</button>' +
    '<button type="button" class="icon-action-btn" data-action="edit-client" data-id="' + esc(uid) + '" title="Edit client">' + adminActionIcons.edit + '</button>' +
    (role('admin') ? '<button type="button" class="icon-action-btn" data-action="deposit-settings" data-id="' + esc(uid) + '" title="Update deposit QR codes" aria-label="Update deposit QR codes">' + adminActionIcons.qrCode + '</button>' : ''),
  ];
}
function clientRowHtml(row: Row) {
  const isFrozen = row.frozen === true;
  const uid = String(row.id || '');
  const c = clientRowCells(row);
  return '<tr data-row-id="' + esc(uid) + '"' + (isFrozen ? ' style="opacity:0.75"' : '') + '>' +
    '<td class="client-id-cell">' + c[0] + '</td>' +
    '<td class="client-detail-cell">' + c[1] + '</td>' +
    '<td class="vip-rep-cell">' + c[2] + '</td>' +
    '<td class="balance-cell">' + c[3] + '</td>' +
    '<td class="client-status-cell">' + c[4] + '</td>' +
    '<td class="trade-mode-cell">' + c[5] + '</td>' +
    '<td class="actions-cell">' + c[6] + '</td>' +
  '</tr>';
}
function adminSearchForm(searchRoute: string, placeholder = 'Search UID, Name or Email') {
  return '<form class="clients-search-form" role="search" data-form="search" data-search-route="' + esc(searchRoute) + '">' +
    '<input type="search" name="search" class="clients-search-input" maxlength="50" value="' + esc(list().search) +
    '" placeholder="' + esc(placeholder) + '" aria-label="' + esc(placeholder) + '">' +
    '<button type="button" class="button secondary compact icon-btn refresh-btn" data-action="reload" title="Refresh" aria-label="Refresh results">' + adminActionIcons.refresh + '</button>' +
    '</form>';
}

function buildClientsHtml(rows: Row[]) {
  return '<div class="clients-page-header"><h1 class="clients-title">My Clients</h1>' +
    '<div class="clients-controls">' + adminSearchForm('clients', 'Search ID, Name or Email') +
    '<button type="button" class="button new-client-btn" data-action="new-client">＋ New</button>' +
    '</div></div>' +
    '<section class="panel">' +
    '<div class="table-wrap"' + (rows.length === 0 ? ' hidden' : '') + '><table>' +
    '<thead><tr><th>ID</th><th>CLIENT DETAILS</th><th>VIP / REP</th><th>BALANCE</th><th>STATUS</th><th>TRADE MODE</th><th>ACTIONS</th></tr></thead>' +
    '<tbody id="clients-tbody">' + rows.map(clientRowHtml).join('') + '</tbody></table></div>' +
    '<div id="clients-blank" class="blank"' + (rows.length > 0 ? ' hidden' : '') + '><div class="blank-icon">◇</div><h3>No clients found</h3><p>Records will appear here as activity comes in.</p></div>' +
    '<div id="table-pager">' + navigation() + '</div></section>';
}

function fundingRowCells(row: Row, rowNumber: number) {
  const clientName = String(row.clientName || recordReference(row.uid));
  const clientEmail = String(row.clientEmail || '');
  const statusVal = String(row.status || 'pending');
  return [
    '#' + rowNumber,
    '<strong class="client-name">' + esc(clientName) + '</strong>' + (clientEmail ? '<div class="client-email">' + esc(clientEmail) + '</div>' : ''),
    '₹' + credits(row.amount),
    dateTime(row.createdAt),
    state(statusVal),
    '<button type="button" class="icon-action-btn" data-action="funding-detail" data-id="' + esc(row.id) + '" title="View details">' + adminActionIcons.eye + '</button>' +
    (statusVal === 'pending' ? '<button type="button" class="icon-action-btn approve-btn" data-action="approve-funding" data-id="' + esc(row.id) + '" data-name="' + esc(clientName) + '" title="Approve">✓</button>' : '') +
    (statusVal === 'pending' ? '<button type="button" class="icon-action-btn reject-btn" data-action="reject-funding" data-id="' + esc(row.id) + '" data-name="' + esc(clientName) + '" title="Reject">✗</button>' : ''),
  ];
}
function fundingRowHtml(row: Row, rowNumber: number) {
  const c = fundingRowCells(row, rowNumber);
  return '<tr data-row-id="' + esc(row.id) + '">' +
    '<td class="client-id-cell">' + c[0] + '</td>' +
    '<td class="client-detail-cell">' + c[1] + '</td>' +
    '<td class="funding-amount-cell">' + c[2] + '</td>' +
    '<td class="funding-date-cell">' + c[3] + '</td>' +
    '<td class="funding-status-cell">' + c[4] + '</td>' +
    '<td class="funding-actions-cell">' + c[5] + '</td>' +
  '</tr>';
}
function buildFundingHtml(rows: Row[], isWithdrawal: boolean) {
  const status = list().status;
  const start = firstRowNumber();
  const heading = isWithdrawal ? 'Withdrawal History' : 'Deposit History';
  const emptyTitle = isWithdrawal ? 'No withdrawal requests' : 'No deposit requests';
  return '<div class="page-header-row"><h1 class="page-main-title">' + heading + '</h1>' +
    adminSearchForm(isWithdrawal ? 'withdrawals' : 'deposits') + '</div>' +
    '<section class="panel">' +
    '<div class="filters">' +
    '<label>Status<select id="funding-status">' + ['pending', 'approved', 'rejected', 'cancelled', 'all'].map(value =>
      '<option value="' + value + '"' + (value === status ? ' selected' : '') + '>' + label(value) + '</option>').join('') + '</select></label>' +
    '</div>' +
    '<div class="table-wrap"' + (rows.length === 0 ? ' hidden' : '') + '><table>' +
    '<thead><tr><th>NO.</th><th>CLIENT</th><th>AMOUNT</th><th>DATE</th><th>STATUS</th><th>ACTIONS</th></tr></thead>' +
    '<tbody id="funding-tbody">' + rows.map((row, i) => fundingRowHtml(row, start + i)).join('') + '</tbody></table></div>' +
    '<div id="funding-blank" class="blank"' + (rows.length > 0 ? ' hidden' : '') + '><div class="blank-icon">◇</div><h3>' + emptyTitle + '</h3><p>Records will appear here as activity comes in.</p></div>' +
    '<div id="table-pager">' + navigation() + '</div></section>';
}

function tradeRowCells(row: Row, rowNumber: number) {
  const clientName = String(row.clientName || recordReference(row.uid));
  const dueAt = Number(row.dueAt);
  const createdAt = Number(row.createdAt);
  const secs = dueAt && createdAt ? Math.max(1, Math.round((dueAt - createdAt) / 1000)) : Number(row.duration || 60);
  const timeframeText = secs >= 60 && secs % 60 === 0 ? (secs / 60) + ' min' : secs + ' sec';
  const outcome = String(row.outcome || row.status || 'open').toLowerCase();
  const badge = outcome === 'win' ? '<span class="trade-status-win">WIN</span>'
    : outcome === 'loss' ? '<span class="trade-status-loss">LOSS</span>'
    : outcome === 'refund' ? '<span class="trade-status-refund">REFUND</span>'
    : '<span class="trade-status-open">OPEN</span>';
  return [
    '#' + rowNumber,
    '<strong>' + esc(clientName) + '</strong>',
    pair(row.symbol),
    esc(String(row.direction || '').toUpperCase()),
    '₹' + credits(row.stake),
    esc(timeframeText),
    badge,
  ];
}
function tradeRowHtml(row: Row, rowNumber: number) {
  const c = tradeRowCells(row, rowNumber);
  return '<tr data-row-id="' + esc(row.id) + '">' +
    '<td class="client-id-cell">' + c[0] + '</td>' +
    '<td>' + c[1] + '</td>' +
    '<td>' + c[2] + '</td>' +
    '<td>' + c[3] + '</td>' +
    '<td>' + c[4] + '</td>' +
    '<td>' + c[5] + '</td>' +
    '<td class="trade-status-cell">' + c[6] + '</td>' +
  '</tr>';
}
function buildTradesHtml(rows: Row[]) {
  const start = firstRowNumber();
  return '<div class="page-header-row">' +
    '<h1 class="page-main-title">Live Trades</h1>' +
    '<div class="clients-controls">' + adminSearchForm('trades') +
    '<button class="button live-updates-btn" type="button" disabled>⬤ LIVE UPDATES</button></div></div>' +
    '<section class="panel">' +
    '<div class="table-wrap"' + (rows.length === 0 ? ' hidden' : '') + '><table>' +
    '<thead><tr><th>NO.</th><th>CLIENT</th><th>ASSET</th><th>DIRECTION</th><th>AMOUNT</th><th>TIMEFRAME</th><th>STATUS</th></tr></thead>' +
    '<tbody id="trades-tbody">' + rows.map((row, i) => tradeRowHtml(row, start + i)).join('') + '</tbody></table></div>' +
    '<div id="trades-blank" class="blank"' + (rows.length > 0 ? ' hidden' : '') + '><div class="blank-icon">◇</div><h3>No trades yet</h3><p>Records will appear here as activity comes in.</p></div>' +
    '<div id="table-pager">' + navigation() + '</div></section>';
}

function auditRowCells(row: Row) {
  const uid = String(row.uid || '');
  const shortUid = uid.slice(0, 8).toUpperCase();
  const clientName = String(row.clientName || '');
  const clientCell = clientName
    ? '<strong class="client-name">' + esc(clientName) + '</strong><div class="client-uid">UID: ' + esc(shortUid) + '</div>'
    : '<div class="client-uid">UID: ' + esc(recordReference(uid)) + '</div>';
  const actorName = String(row.actorName || recordReference(row.actor) || 'Staff');
  return [
    esc(row.event),
    clientCell,
    '<span class="audit-actor">' + esc(actorName) + '</span>',
    '<span class="audit-reason">' + esc(row.reason || '—') + '</span>',
    dateTime(row.createdAt),
  ];
}
function auditRowHtml(row: Row) {
  const c = auditRowCells(row);
  return '<tr data-row-id="' + esc(row.id) + '">' + c.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
}
function buildAuditHtml(rows: Row[]) {
  return '<div class="page-header-row">' + title('Audit log', 'Staff actions recorded by the server.') +
    adminSearchForm('audit', 'Search client, admin or event') + '</div>' +
    '<section class="panel"><header class="panel-heading"><h2>Audit events</h2></header>' +
    '<div class="table-wrap"' + (rows.length === 0 ? ' hidden' : '') + '><table>' +
    '<thead><tr><th>Event</th><th>Client</th><th>Admin</th><th>Reason</th><th>Date</th></tr></thead>' +
    '<tbody id="audit-tbody">' + rows.map(auditRowHtml).join('') + '</tbody></table></div>' +
    '<div id="audit-blank" class="blank"' + (rows.length > 0 ? ' hidden' : '') + '><div class="blank-icon">◇</div><h3>No audit events</h3><p>Records will appear here as activity comes in.</p></div>' +
    '<div id="table-pager">' + navigation() + '</div></section>';
}

function buildAdminHtml(targetRoute: string, payload: unknown): string {
  if (targetRoute === 'overview') return buildOverviewHtml(payload as OverviewData);
  if (targetRoute === 'client') return buildClientDetailHtml(payload as ClientBundle);
  const { rows } = payload as ListBundle;
  if (targetRoute === 'clients') return buildClientsHtml(rows);
  if (targetRoute === 'deposits' || targetRoute === 'withdrawals') return buildFundingHtml(rows, targetRoute === 'withdrawals');
  if (targetRoute === 'trades') return buildTradesHtml(rows);
  return buildAuditHtml(rows);
}

async function fetchAdminPayload(targetRoute: string, current: List): Promise<AdminPayload> {
  if (targetRoute === 'overview') {
    const requestedRevision = invitationRevision;
    const values = await api.call<OverviewData>('admin.dashboard');
    setAdminBadges(values.deposits, values.withdrawals);
    return { payload: values, rows: [], next: null, invitationRevision: requestedRevision };
  }
  if (targetRoute === 'client') {
    const uid = clientId(), thread = clientSection() === 'messages';
    const data = await api.call<{ profile: Profile; wallet: Wallet | null; activity: Page }>('admin.client', { uid, cursor: thread ? null : current.cursors[current.page] });
    const page = thread ? await api.call<SupportPage>('admin.messages', { uid, cursor: current.cursors[current.page] }) : data.activity;
    return { payload: { data, page }, rows: page.rows, next: page.cursor, clientRow: { ...data.profile, id: uid } };
  }
  const pageArgs = { cursor: current.cursors[current.page], limit: ADMIN_TABLE_PAGE_SIZE, search: current.search };
  let pageRes: Page;
  if (targetRoute === 'clients') pageRes = await api.call<Page>('admin.clients', pageArgs);
  else if (targetRoute === 'deposits' || targetRoute === 'withdrawals') pageRes = await api.call<Page>('admin.funding', {
    ...pageArgs, kind: targetRoute === 'withdrawals' ? 'withdrawal' : 'deposit', status: current.status,
  });
  else if (targetRoute === 'trades') pageRes = await api.call<Page>('admin.trades', pageArgs);
  else pageRes = await api.call<Page>('admin.audit', pageArgs);
  return { payload: { rows: pageRes.rows, next: pageRes.cursor }, rows: pageRes.rows, next: pageRes.cursor };
}

async function markVisibleChatRead(targetRoute: string, payload: unknown) {
  if (targetRoute !== 'client' || clientSection() !== 'messages' || document.hidden) return;
  const { page } = payload as ClientBundle;
  const marker = page.supportUnreadMarker;
  if (!marker) return;
  const uid = clientId(), session = authVersion;
  try {
    const { read } = await api.call<{ read: boolean }>('admin.messages.read', { uid, marker });
    if (!read || authVersion !== session) return;
    delete page.supportUnreadMarker;
    for (const entry of adminCache.values()) {
      if (entry.route !== 'clients') continue;
      const row = entry.rows.find(item => item.id === uid);
      if (row?.supportUnreadMarker === marker) row.supportUnreadMarker = null;
    }
    if (route === 'clients') {
      const cached = adminCache.get(adminCacheKey());
      if (cached) patchAdminDom('clients', cached.data);
    }
  } catch { /* Keep the unread marker until the read can be saved. */ }
}

function patchTableRows(
  tbodyId: string,
  blankId: string,
  rows: Row[],
  getCells: (row: Row, index: number) => string[],
  buildRow: (row: Row, index: number) => string,
  patchRowExtras?: (tr: HTMLTableRowElement, row: Row) => void
) {
  const tbody = root.querySelector<HTMLTableSectionElement>('#' + tbodyId);
  const blank = root.querySelector<HTMLElement>('#' + blankId);
  const wrap = tbody?.closest<HTMLElement>('.table-wrap');
  const pagerHost = root.querySelector<HTMLElement>('#table-pager');
  if (!tbody) return false;
  if (wrap) wrap.hidden = rows.length === 0;
  if (blank) blank.hidden = rows.length > 0;
  if (pagerHost) {
    const nextPager = navigation();
    if (pagerHost.innerHTML !== nextPager) pagerHost.innerHTML = nextPager;
  }
  const existing = Array.from(tbody.children) as HTMLTableRowElement[];
  const sameOrder = existing.length === rows.length && existing.every((tr, i) => tr.dataset.rowId === String(rows[i].id || ''));
  if (sameOrder) {
    for (let i = 0; i < rows.length; i++) {
      const tr = existing[i];
      patchRowExtras?.(tr, rows[i]);
      const cells = getCells(rows[i], i);
      for (let c = 0; c < cells.length; c++) {
        const td = tr.children[c] as HTMLElement | undefined;
        if (td && td.innerHTML !== cells[c]) td.innerHTML = cells[c];
      }
    }
  } else {
    tbody.innerHTML = rows.map((r, i) => buildRow(r, i)).join('');
  }
  return true;
}

function patchAdminDom(targetRoute: string, payload: unknown): boolean {
  if (targetRoute === 'overview') {
    const values = payload as OverviewData;
    setAdminBadges(values.deposits, values.withdrawals);
    for (const [key] of overviewCards) {
      const el = root.querySelector<HTMLElement>('[data-metric="' + key + '"]');
      if (!el) return false;
      const formatted = Number(values[key] || 0).toLocaleString();
      if (el.textContent !== formatted) el.textContent = formatted;
    }
    for (const card of invitationCards) updateInvitationCard(card.kind, values[card.key] || '');
    return true;
  }
  if (targetRoute === 'client') {
    const bundle = payload as ClientBundle;
    const summary = root.querySelector<HTMLElement>('#client-summary-panel');
    const activityBody = root.querySelector<HTMLElement>('#client-activity-body');
    if (!summary || !activityBody) return false;
    const nextSummary = clientSummaryHtml(bundle.data);
    if (summary.innerHTML !== nextSummary) summary.innerHTML = nextSummary;
    const thread = activityBody.querySelector<HTMLElement>('#client-message-thread');
    const pagerHost = activityBody.querySelector<HTMLElement>('#client-activity-pager');
    if (clientSection() === 'messages' && thread && pagerHost) {
      const threadHtml = messageThread(bundle.page.rows, clientId());
      if (thread.innerHTML !== threadHtml) thread.innerHTML = threadHtml;
      const pagerHtml = navigation();
      if (pagerHost.innerHTML !== pagerHtml) pagerHost.innerHTML = pagerHtml;
      return true;
    }
    const nextActivity = clientActivityBodyHtml(clientId(), bundle.data, bundle.page);
    if (activityBody.innerHTML !== nextActivity) activityBody.innerHTML = nextActivity;
    return true;
  }
  const { rows } = payload as ListBundle;
  const start = firstRowNumber();
  if (targetRoute === 'clients') {
    return patchTableRows(
      'clients-tbody', 'clients-blank', rows,
      clientRowCells,
      clientRowHtml,
      (tr, row) => { tr.style.opacity = row.frozen === true ? '0.75' : ''; }
    );
  }
  if (targetRoute === 'withdrawals' || targetRoute === 'deposits') {
    return patchTableRows(
      'funding-tbody', 'funding-blank', rows,
      (row, i) => fundingRowCells(row, start + i),
      (row, i) => fundingRowHtml(row, start + i)
    );
  }
  if (targetRoute === 'trades') {
    return patchTableRows(
      'trades-tbody', 'trades-blank', rows,
      (row, i) => tradeRowCells(row, start + i),
      (row, i) => tradeRowHtml(row, start + i)
    );
  }
  return patchTableRows(
    'audit-tbody', 'audit-blank', rows,
    row => auditRowCells(row),
    row => auditRowHtml(row)
  );
}

function cacheAdminPayload(key: string, targetRoute: string, result: AdminPayload) {
  if (targetRoute === 'overview') {
    const values = result.payload as OverviewData;
    const current = adminCache.get(key)?.data as OverviewData | undefined;
    if (current) {
      // A refresh can return an older snapshot or omit a code the server already confirmed.
      for (const { key: codeKey } of invitationCards) {
        if (current[codeKey] && (result.invitationRevision !== invitationRevision || !values[codeKey])) {
          values[codeKey] = current[codeKey];
        }
      }
    }
  }
  adminCache.set(key, { key, route: targetRoute, data: result.payload, rows: result.rows, next: result.next, ts: Date.now(), dirty: false });
}

async function silentRefreshCurrentRoute(button?: HTMLElement) {
  if (!admin || !access || (route === 'client' && !adminClient)) return;
  if (silentRefreshActive) { silentRefreshQueued = true; return; }
  silentRefreshActive = true;
  const spinStart = Date.now();
  const spinner = button?.closest<HTMLElement>('.refresh-btn') || button;
  spinner?.classList.add('is-spinning');
  const activeRoute = route, activeKey = adminCacheKey(activeRoute), activeVersion = version;
  const activeSession = authVersion;
  try {
    const result = await fetchAdminPayload(activeRoute, list());
    if (!access || activeSession !== authVersion) return;
    cacheAdminPayload(activeKey, activeRoute, result);
    if (activeVersion === version && adminCacheKey(route) === activeKey) {
      applyCachedRows(result.rows, result.next, result.clientRow);
      if (!patchAdminDom(activeRoute, result.payload)) {
        content().innerHTML = buildAdminHtml(activeRoute, result.payload);
      }
      void markVisibleChatRead(activeRoute, result.payload);
    }
  } catch { /* Retain visible cached view silently on transient network error. */ }
  finally {
    if (spinner) {
      const wait = Math.max(0, 420 - (Date.now() - spinStart));
      window.setTimeout(() => spinner.classList.remove('is-spinning'), wait);
    }
    silentRefreshActive = false;
    if (silentRefreshQueued) {
      silentRefreshQueued = false;
      if (admin && access) void silentRefreshCurrentRoute();
    }
  }
}

async function silentRefreshUserView() {
  if (admin || !access) return;
  const run = version;
  try {
    const updated = await api.call<Home>('home');
    if (run !== version) return;
    setHome(updated);
    clientLoaded.funding = false;
    clientLoaded.trades = false;
    void hydrateClientSidebarData();
    void refreshClientTabData(clientState.activeTab, true);
  } catch { /* Retain current user view on transient error. */ }
}

function updateVisibleClientStatuses() {
  const now = Date.now() + clockOffset;
  for (const tr of root.querySelectorAll<HTMLTableRowElement>('#clients-tbody tr[data-row-id]')) {
    const row = visibleRows.get(tr.dataset.rowId || '');
    const cell = tr.querySelector('.client-status-cell');
    if (!row || !cell) continue;
    const html = clientStatusHtml(row, now);
    if (cell.innerHTML !== html) cell.innerHTML = html;
  }
}

function startAdminClientActivityRefresh() {
  let nextPoll = 0;
  let polling = false;
  refreshTimer = window.setInterval(async () => {
    if (document.hidden || !access || !root.querySelector('#clients-tbody')) return;
    updateVisibleClientStatuses();
    const view = visibleRows;
    if (!view.size || polling || Date.now() < nextPoll) return;

    polling = true;
    nextPoll = Date.now() + CLIENT_ACTIVITY_SYNC_MS;
    try {
      const { rows, serverTime } = await api.call<{ rows: { id: string; lastActiveAt: number }[]; serverTime: number }>(
        'admin.clients.activity', { uids: [...view.keys()] }
      );
      if (!access || view !== visibleRows || route !== 'clients') return;
      clockOffset = serverTime - Date.now();
      for (const { id, lastActiveAt } of rows) {
        const row = view.get(id);
        if (row) row.lastActiveAt = Math.max(Number(row.lastActiveAt || 0), lastActiveAt);
      }
      updateVisibleClientStatuses();
    } catch { /* Retry on the next poll. */ }
    finally { polling = false; }
  }, 1000);
}

async function render() {
  if (!access) return;
  const run = ++version;
  if (!admin) {
    const nextTab = clientTabForPath(location.pathname);
    replaceWorkspacePath(clientPaths[nextTab]);
    activateClientTab(nextTab);
    return;
  }
  stop();
  adminLocation = adminRouteForPath(location.pathname);
  const target = adminLocation.route;
  route = nav().some(item => item[0] === target) || (target === 'client' && adminLocation.reference) ? target : first;
  if (route === 'clients') startAdminClientActivityRefresh();
  for (const link of root.querySelectorAll<HTMLElement>('#sidebar [data-nav]')) {
    if (link.dataset.nav === (route === 'client' ? 'clients' : route)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (route === 'client') {
    const { reference } = adminLocation;
    if (!adminClient || (reference !== String(adminClient.clientNumber) && reference !== adminClient.uid)) {
      adminClient = undefined;
      visibleRows.clear();
      const loading = window.setTimeout(() => {
        if (run === version) content().innerHTML = title('Client details', 'Loading…');
      }, 180);
      try {
        const client = await api.call<AdminClientIdentity>('admin.client.resolve', { reference });
        if (run !== version) return;
        adminClient = client;
      } catch (error) {
        if (run === version) {
          content().innerHTML = title('Client details', errorMessage(error)) +
            '<a class="button secondary" data-nav="clients" href="' + adminPath('clients') + '">Back to clients</a>';
        }
        return;
      } finally {
        window.clearTimeout(loading);
      }
    }
    replaceWorkspacePath(adminClientPath(adminClient.clientNumber, clientSection() === 'messages'));
  } else {
    adminClient = undefined;
    replaceWorkspacePath(adminPath(route));
  }
  const key = adminCacheKey(route);
  const cached = adminCache.get(key);
  if (cached) {
    applyCachedRows(cached.rows, cached.next, route === 'client' ? { ...(cached.data as ClientBundle).data.profile, id: clientId() } : undefined);
    content().innerHTML = buildAdminHtml(route, cached.data);
    void markVisibleChatRead(route, cached.data);
    if (cached.dirty || Date.now() - cached.ts > CACHE_TTL) {
      void silentRefreshCurrentRoute();
    }
    return;
  }
  visibleRows.clear();
  const delay = window.setTimeout(() => {
    if (run === version && adminCacheKey() === key) content().innerHTML = title(routeName(), 'Loading…') + '<div class="panel empty-space" aria-busy="true"></div>';
  }, 180);
  try {
    const result = await fetchAdminPayload(route, list());
    if (run !== version || adminCacheKey() !== key) return;
    window.clearTimeout(delay);
    cacheAdminPayload(key, route, result);
    applyCachedRows(result.rows, result.next, result.clientRow);
    content().innerHTML = buildAdminHtml(route, result.payload);
    void markVisibleChatRead(route, result.payload);
  } catch (error) {
    if (run === version && adminCacheKey() === key) content().innerHTML = title(routeName(), errorMessage(error)) + '<button class="button secondary" data-action="reload">Try again</button>';
  } finally { clearTimeout(delay); }
}
function openClientTradeConfirm(dir: 'up' | 'down') {
  if (!home || clientState.activeTrade) return;
  const rawAmt = Number(root.querySelector<HTMLInputElement>('#tradeAmount')?.value || 1000) || 1000;
  clientState.pendingTrade = { dir, amount: Math.max(0, rawAmt), dur: clientState.selDur, profit: clientState.selProfit };
  const overlay = root.querySelector<HTMLElement>('#tradeConfirmOverlay');
  const body = root.querySelector<HTMLElement>('#tradeConfirmBody');
  if (!overlay || !body) return;
  const pt = clientState.pendingTrade;
  const est = (pt.amount * (pt.profit / 100)).toFixed(2);
  body.innerHTML = `
    <div class="trade-confirm-pair">
      <div style="font-weight:800;font-size:17px;">${esc(formatPair(clientState.selected.symbol))}</div>
      <div class="dir-pill ${pt.dir}">${pt.dir === 'up' ? 'BUY' : 'SELL'}</div>
    </div>
    <div style="background:#0a121c;border:1px solid var(--iq-border);border-radius:12px;padding:10px 12px;margin-bottom:12px;">
      <div class="control-label" style="margin-bottom:6px;">Custom Amount (${esc(curSym(home))})</div>
      <input type="number" id="tcAmount" class="replica-input" min="1" step="100" value="${pt.amount || ''}" placeholder="Enter amount">
    </div>
    <div class="tc-opt-grid" role="group" aria-label="Trade duration">
      ${durationChoices.map(d => `
        <button type="button" class="tc-opt${pt.dur === d.sec ? ' active' : ''}" aria-pressed="${pt.dur === d.sec}" data-action="client-tc-opt" data-sec="${d.sec}">
          <span class="t1">${esc(d.longLabel)}</span>
          <span class="t2">Profit: ${d.profit}%</span>
        </button>
      `).join('')}
    </div>
    <div class="tc-est">
      <div class="control-label" style="margin:0;">Estimated Profit (${esc(curSym(home))})</div>
      <div id="tcEstProfit" style="font-size:16px;font-weight:800;color:var(--iq-green);">+${est}</div>
    </div>
    <div style="font-size:11px;color:var(--iq-muted);line-height:1.4;margin-bottom:14px;">
      This order will be booked instantly after confirmation. Please verify the amount, duration, and profit before proceeding.
    </div>
    <div class="trade-confirm-actions">
      <button type="button" class="btn-confirm cancel" data-action="client-close-trade-confirm">Cancel</button>
      <button type="button" class="btn-confirm go ${pt.dir}" data-action="client-tc-confirm">Confirm</button>
    </div>`;
  overlay.classList.add('open');
}

async function executeClientTrade(dir: 'up' | 'down', amountRupees: number, durSec: number, profitPct: number) {
  if (!home || clientState.activeTrade) return;
  if (!home.profile.tradeEnabled || home.profile.frozen) {
    clientAlert('Trading Restricted', home.profile.frozen ? 'Account is frozen. Contact support.' : 'Trading is paused for this account.');
    return;
  }
  if (!Number.isFinite(amountRupees) || amountRupees < 1) {
    clientAlert('Invalid Amount', 'Please enter a valid trade amount of at least 1.');
    return;
  }
  const stakeCents = Math.round(amountRupees * 100);
  const freeze = walletFreeze(home.wallet.available, home.profile);
  const available = freeze.kind === 'amount' ? freeze.available : home.wallet.available;
  if (stakeCents > available) {
    clientAlert('Insufficient Balance', `Available for trading: ${fmtMoney(available, home)}.`);
    return;
  }
  root.querySelector('#tradeConfirmOverlay')?.classList.remove('open');
  try {
    const placed = await api.call<{ id: string; dueAt: number; entry: number }>('trade.place', {
      symbol: clientState.selected.symbol,
      duration: durSec,
      direction: dir,
      amount: stakeCents,
      price: !isGateAsset(clientState.selected) && clientState.livePrice > 0 ? clientState.livePrice : undefined,
      requestId: crypto.randomUUID(),
    });
    const updated = await api.call<Home>('home');
    setHome(updated);
    startActiveTradeCountdown({
      id: placed.id,
      symbol: clientState.selected.symbol,
      direction: dir,
      stake: stakeCents,
      dueAt: placed.dueAt,
      profitPercent: profitPct,
      entry: placed.entry,
    });
  } catch (err) {
    clientAlert('Trade Error', errorMessage(err));
  }
}

function updateMarket() {
  if (admin || !home) return;
  clientState.selected = selected;
  clientState.frame = frame;
  const hAsset = root.querySelector('[data-action="client-toggle-assets"]');
  if (hAsset) hAsset.innerHTML = renderTradeAssetSelector(selected.code);
  const ticketIcon = root.querySelector('#tradeTicketAssetIcon');
  if (ticketIcon) ticketIcon.innerHTML = tradeCoinIcon(selected.code, 18);
  const sAsset = root.querySelector('#selectedAssetName');
  if (sAsset) sAsset.textContent = formatPair(selected.symbol);
  const chartMark = root.querySelector('#chartAssetMark');
  if (chartMark) chartMark.innerHTML = renderChartAssetMark(selected.code);
  const cMarket = root.querySelector('#chartMarketName');
  if (cMarket) cMarket.textContent = formatPair(selected.symbol);
  const subtitle = root.querySelector('.chart-market-subtitle');
  if (subtitle) subtitle.textContent = clientChartPresentation(clientState.chartMode, selected).subtitle;
  for (const btn of root.querySelectorAll<HTMLElement>('[data-action="frame"]')) {
    const active = btn.dataset.id === frame;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
  chart?.load(selected, frame, !emulator, clockOffset);
  updateClientQuoteDisplays();
}

function details(action: string, row: Row) {
  if (action === 'trade-detail') {
    dialog('Trade details', definition([['Reference', recordReference(row.id)], ['Asset', String(row.symbol).replace('USDT', '/USDT')],
      ['Direction', label(row.direction)], ['Stake', credits(row.stake)], ['Entry price', row.entry], ['Expiry', dateTime(row.dueAt)],
      ['Exit price', row.exit], ['Result', label(row.outcome || row.status)], ['Net result', row.pnl === undefined ? '—' : '₹' + credits(row.pnl)]]));
    return;
  }
  const id = esc(row.id);
  const bankDetails = row.details && typeof row.details === 'object'
    ? Object.entries(row.details as Record<string, string>).map(([k, v]) => [label(k), v] as [string, unknown]) : [];
  // Build a human-readable copy string for bank details
  const bd = row.details && typeof row.details === 'object' ? row.details as Record<string, string> : {};
  const copyLines = [
    bd.bank_name, bd.account_holder, bd.account_number,
    bd.ifsc_swift || bd.routing_number || bd.iban || bd.sort_code || bd.bsb_code || bd.transit_number || bd.bank_code || bd.swift_bic,
    bd.account_type, bd.branch_name, bd.branch_code, bd.institution_number,
  ].filter(Boolean).join('\n');
  const copyBtnHtml = bankDetails.length
    ? `<button type="button" class="button secondary" style="margin-top:12px;width:100%;" data-action="copy-bank-details" data-copy="${esc(copyLines)}">Copy Bank Details</button>`
    : '';
  const adminInfo = definition([
    ['Reference', recordReference(row.id)],
    ['Type', label(row.kind)],
    ['Method', row.method || '—'],
    ...(row.referenceNumber ? [['UTR / Reference number', row.referenceNumber] as [string, unknown]] : []),
    ['Amount', '₹' + credits(row.amount)],
    ['Status', label(row.status)],
    ['Submitted', dateTime(row.createdAt)],
    ['Decision reason', row.reason],
    ...bankDetails,
  ]) + (row.receiptUrl ? '<div style="margin-top:12px;text-align:center;"><img src="' + esc(String(row.receiptUrl)) + '" alt="Deposit receipt" style="max-width:100%;max-height:240px;border-radius:10px;border:1px solid rgba(148,178,208,0.2);"></div>' : '');
  // For admin funding-detail view of withdrawals: show only bank details + copy button (not full metadata)
  const isAdminWithdrawalView = admin && action === 'funding-detail' && row.kind === 'withdrawal';
  const info = isAdminWithdrawalView
    ? (bankDetails.length
        ? definition(bankDetails) + copyBtnHtml
        : '<p style="color:var(--iq-muted)">No bank details submitted with this withdrawal.</p>')
    : adminInfo;
  if (action === 'review-funding') {
    dialog('Review ' + label(row.kind).toLowerCase(), info + '<form class="stack" data-form="admin.funding.decide"><input type="hidden" name="id" value="' + id +
      '"><label>Decision<select name="status"><option value="approved">Approve</option><option value="rejected">Reject</option></select></label>' +
      '<label>Reason<input name="reason" minlength="3" maxlength="240" required></label><button class="button">Record decision</button>' + formStatus() + '</form>');
  } else {
    const title = isAdminWithdrawalView ? 'Bank Details' : 'Funding receipt';
    dialog(title, info + (!admin && row.kind === 'withdrawal' && row.status === 'pending' ?
      '<form data-form="funding.cancel"><input type="hidden" name="id" value="' + id + '"><button class="button secondary">Cancel withdrawal</button>' + formStatus() + '</form>' : ''));
  }
}
async function openDepositSettings(uid: string) {
  const row = visibleRows.get(uid);
  if (!row) return;
  dialog('Deposit payment settings', '<p class="quiet" id="deposit-settings-loading" role="status">Loading payment settings…</p>');
  const box = panel();
  const loading = box.querySelector<HTMLElement>('#deposit-settings-loading')!;
  try {
    const { depositSettings } = await api.call<{ depositSettings: DepositSettings }>('admin.depositSettings', { uid });
    if (box.open && loading.isConnected) {
      loading.outerHTML = depositSettingsForm(uid, String(row.name || 'this client'), depositSettings);
    }
  } catch (error) {
    loading.className = 'error';
    loading.textContent = errorMessage(error);
  }
}

function clientAction(action: string, id: string) {
  const target = visibleRows.get('@client');
  if (!target || target.id !== id) return;
  const restrict = action === 'restrictions';
  dialog(restrict ? 'Client restrictions' : 'Adjust client balance',
    '<form class="stack" data-form="' + (restrict ? 'admin.client.restrict' : 'admin.client.adjust') + '"><input type="hidden" name="uid" value="' + esc(id) + '">' +
    (restrict ? '<label class="check-row"><input type="checkbox" name="tradeEnabled" ' + (target.tradeEnabled ? 'checked' : '') +
      '>Allow new trades</label><label class="check-row"><input type="checkbox" name="withdrawalEnabled" ' + (target.withdrawalEnabled ? 'checked' : '') +
      '>Allow new withdrawals</label>' : amountField('10', 'amount', true)) +
    '<label>Reason<input name="reason" minlength="3" maxlength="240" required></label><button class="button">Save change</button>' + formStatus() + '</form>');
}
async function enroll() {
  if (!person) return;
  await person.reload();
  if (!person.emailVerified) {
    await sendEmailVerification(person);
    authNotice('Verification email sent. Verify your email, then select Set up authenticator again.'); return;
  }
  if (multiFactor(person).enrolledFactors.length) {
    authNotice('Sign out, then sign in with your authenticator to open the admin panel.'); return;
  }
  secret = await TotpMultiFactorGenerator.generateSecret(await multiFactor(person).getSession());
  dialog('Set up authenticator', '<p>Add this setup key to your authenticator app.</p>' + definition([['Setup key', secret.secretKey]]) +
    '<form class="stack" data-form="enroll"><label>Six-digit code<input name="code" inputmode="numeric" pattern="[0-9]{6}" required></label>' +
    '<button class="button">Verify authenticator</button>' + formStatus() + '</form>');
}
function dismissNavigation(restoreFocus = false) {
  root.querySelector('#sidebar')?.classList.remove('open');
  const menu = root.querySelector<HTMLElement>('[data-action=menu]');
  const main = root.querySelector<HTMLElement>('#content');
  if (main) main.inert = false;
  menu?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) menu?.focus();
}

window.matchMedia('(max-width: 680px)').addEventListener('change', event => {
  if (!event.matches) dismissNavigation();
});

async function loadClientNotifications(uid: string) {
  const box = panel();
  const container = box.querySelector<HTMLElement>('#client-notifications-list');
  const client = box.querySelector<HTMLInputElement>('form[data-form="admin.notifications.push"] input[name="uid"]');
  if (!container || client?.value !== uid) return;
  container.innerHTML = '<p class="quiet" style="margin:8px 0">Loading notification records…</p>';
  try {
    const res = await api.call<{ rows: Row[] }>('admin.notifications.list', { uid });
    if (!res.rows.length) {
      container.innerHTML = '<p class="quiet" style="margin:8px 0">No notifications pushed to this client yet.</p>';
      return;
    }
    container.innerHTML = res.rows.map(item =>
      '<div class="notif-record-card">' +
      '<div class="notif-record-copy">' +
      '<strong>' + esc(item.title) + '</strong>' +
      '<p>' + esc(item.message) + '</p>' +
      '<small>' + dateTime(item.createdAt) + '</small>' +
      '</div>' +
      '<div class="notif-record-actions">' +
      '<button type="button" class="icon-action-btn reject-btn notif-delete-btn" data-action="delete-notification" data-id="' + esc(item.id) + '" data-uid="' + esc(uid) + '" title="Remove notification">' + adminActionIcons.trash + '</button>' +
      '<button type="button" class="button secondary compact" data-action="reuse-notification">Push Again</button>' +
      '</div>' +
      '</div>'
    ).join('');
  } catch (error) {
    container.innerHTML = '<p class="error">' + esc(errorMessage(error)) + '</p>';
  }
}

let searchDebounceTimer = 0;
let pressedDialogBackdrop: HTMLDialogElement | null = null;

function adminDialogBackdrop(event: MouseEvent) {
  if (!admin || !access) return null;
  const box = panel();
  if (!box?.open || event.target !== box) return null;
  // Both the backdrop and the dialog's own padding can target the dialog element.
  const { left, right, top, bottom } = box.getBoundingClientRect();
  return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom ? box : null;
}

root.addEventListener('pointerdown', event => {
  if (event.isPrimary) pressedDialogBackdrop = event.button === 0 ? adminDialogBackdrop(event) : null;
});
root.addEventListener('pointercancel', event => {
  if (event.isPrimary) pressedDialogBackdrop = null;
});

root.addEventListener('keydown', event => {
  if (event.key === 'Escape' && root.querySelector('.sidebar.open') && !panel().open) dismissNavigation(true);
});

root.addEventListener('click', async event => {
  const backdrop = pressedDialogBackdrop;
  pressedDialogBackdrop = null;
  if (backdrop && event.detail > 0 && backdrop === adminDialogBackdrop(event) && !backdrop.querySelector('form[data-busy]')) {
    backdrop.close();
    return;
  }
  const target = (event.target as Element).closest<HTMLElement>('[data-action], [data-nav]');
  if (!target) return;
  const action = target.dataset.action, id = target.dataset.id || '';
  const side = root.querySelector('#sidebar');
  if (target instanceof HTMLAnchorElement && target.dataset.nav) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dismissNavigation(side?.classList.contains('open'));
    go(target.pathname);
    return;
  }
  try {
    switch (action) {
      case 'menu': {
        const open = Boolean(side?.classList.toggle('open'));
        target.setAttribute('aria-expanded', String(open));
        content().inert = open;
        if (open) side?.querySelector<HTMLElement>('a')?.focus();
        break;
      }
      case 'dismiss-menu': dismissNavigation(true); break;
      case 'signout': await signOut(api.auth); break;
      case 'registration': registration = !registration; showAuth(); break;
      case 'password-visibility': {
        const password = root.querySelector<HTMLInputElement>('#login-password');
        if (!password) break;
        const reveal = password.type === 'password';
        password.type = reveal ? 'text' : 'password';
        target.textContent = reveal ? 'Hide' : 'Show';
        target.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
        break;
      }
      case 'quick-start': await signInWithEmailAndPassword(api.auth, admin ? 'staff@example.test' : 'trader@example.test', 'QoptionDemo!2026'); break;
      case 'reset': {
        const email = person?.email || root.querySelector<HTMLInputElement>('form[data-form=auth] input[name=email]')?.value;
        dialog('Reset password', '<form class="stack" data-form="reset"><label>Email address<input type="email" name="email" value="' +
          esc(email) + '" required></label><button class="button">Send reset link</button>' + formStatus() + '</form>');
        break;
      }
      case 'copy-invite': {
        const code = target.dataset.code;
        const card = invitationCards.find(item => item.kind === id);
        if (!card || !code) break;
        try {
          await navigator.clipboard.writeText(code);
          toast(card.title + ' copied.');
        } catch {
          const displayedCode = target.closest('[data-invite-kind]')?.querySelector('[data-invite-code]');
          const selection = window.getSelection();
          if (displayedCode && selection) {
            const range = document.createRange();
            range.selectNodeContents(displayedCode);
            selection.removeAllRanges();
            selection.addRange(range);
          }
          toast('Clipboard access is unavailable. Copy the displayed code manually.');
        }
        break;
      }
      case 'refresh-invite': {
        const card = invitationCards.find(item => item.kind === id);
        if (!card) break;
        const currentCode = target.closest('[data-invite-kind]')?.querySelector<HTMLButtonElement>('[data-action="copy-invite"]')?.dataset.code;
        const description = card.kind === 'funded'
          ? (currentCode ? 'The current code will stop giving the ₹2,000 signup credit.' : card.description)
          : (currentCode ? 'This will replace the code shown on your dashboard.' : card.description);
        const box = panel();
        box.innerHTML = '<h2 id="detail-heading">Generate a new ' + card.title + '?</h2>' +
          '<form class="stack" data-form="admin.invite.refresh"><p>' + description + '</p>' +
          '<input type="hidden" name="kind" value="' + card.kind + '">' +
          '<div class="button-row"><button type="button" class="button secondary compact" data-action="close" autofocus>Cancel</button>' +
          '<button class="button">Generate code</button></div>' + formStatus() + '</form>';
        if (!box.open) box.showModal();
        break;
      }
      case 'enroll': await enroll(); break;
      case 'close': panel().close(); break;
      case 'reload': if (admin) await silentRefreshCurrentRoute(target); else await render(); break;
      case 'asset': {
        const asset = findAsset(id);
        if (asset) {
          if (asset !== selected && (isGateAsset(asset) || isGateAsset(selected))) {
            clientState.livePrice = clientState.quotes.get(asset.symbol)?.price ?? 0;
          }
          selected = asset;
          clientState.selected = asset;
          if (asset.code === 'BTG') frame = '1d';
          root.querySelector('#assetList')?.classList.remove('show');
          if (!admin && clientState.activeTab === 'assets') go(clientPaths.market);
          updateMarket();
        }
        break;
      }
      case 'frame': if (chartFrames.includes(id)) { frame = id; clientState.frame = id; updateMarket(); } break;
      case 'client-toggle-chart-mode': {
        if (admin || !access || clientState.activeTab !== 'market') break;
        clientState.chartMode = clientChartPresentation(clientState.chartMode, clientState.selected).nextMode;
        const presentation = clientChartPresentation(clientState.chartMode, clientState.selected);
        chart?.setMode(clientState.chartMode);
        target.innerHTML = presentation.toggleIcon;
        target.setAttribute('aria-label', presentation.toggleLabel);
        target.title = presentation.toggleLabel;
        const subtitle = root.querySelector('.chart-market-subtitle');
        if (subtitle) subtitle.textContent = presentation.subtitle;
        root.querySelector('#market-chart')?.setAttribute('aria-label', presentation.canvasLabel);
        break;
      }
      case 'client-menu-toggle': {
        const sb = root.querySelector('#mobileSidebar');
        const ov = root.querySelector('#mobileOverlay');
        const open = Boolean(sb?.classList.toggle('open'));
        ov?.classList.toggle('open', open);
        target.setAttribute('aria-expanded', String(open));
        break;
      }
      case 'client-menu-close':
        root.querySelector('#mobileSidebar')?.classList.remove('open');
        root.querySelector('#mobileOverlay')?.classList.remove('open');
        break;
      case 'client-nav': {
        const tab = (target.dataset.tab || 'market') as ClientState['activeTab'];
        go(clientPaths[tab]);
        break;
      }
      case 'client-open-deposit':
        clientState.walletSubTab = 'deposit';
        go(clientPaths.wallet);
        break;
      case 'client-wallet-tab':
        clientState.walletSubTab = target.dataset.sub === 'withdraw' ? 'withdraw' : 'deposit';
        renderClientTabContent('wallet');
        break;
      case 'client-dep-method':
        clientState.depositMethod = target.dataset.method === 'UPI' ? 'UPI' : 'USDT_BSC';
        renderClientTabContent('wallet');
        break;
      case 'client-dep-amt': {
        const amt = Number(target.dataset.amt || 0);
        clientState.depositPresetAmount = amt;
        const inp = root.querySelector<HTMLInputElement>('#customDepAmt');
        if (inp) inp.value = String(amt);
        for (const btn of root.querySelectorAll<HTMLElement>('.amt-btn')) {
          btn.classList.toggle('active', Number(btn.dataset.amt || 0) === amt);
        }
        break;
      }
      case 'client-copy-dep-addr': {
        const addr = target.dataset.addr || '';
        if (addr) {
          await navigator.clipboard.writeText(addr);
          clientAlert('Copied', 'Payment address copied to clipboard.');
        }
        break;
      }
      case 'client-autofill-bank': {
        const saved = home?.profile.savedBank;
        if (!saved || !Object.keys(saved).length) {
          clientAlert('Info', 'No saved bank details found. Submit a withdrawal once to save them.');
          break;
        }
        clientState.bankCountry = saved.country || 'India';
        clientState.bankDraft = { ...saved };
        renderClientTabContent('wallet');
        break;
      }
      case 'client-toggle-assets':
        go(clientState.activeTab === 'assets' ? clientPaths.market : clientPaths.assets);
        break;
      case 'client-toggle-notif':
        root.querySelector('#msgOverlay')?.classList.remove('open');
        root.querySelector('#notifOverlay')?.classList.toggle('open');
        break;
      case 'client-contact-support':
      case 'client-toggle-msgs': {
        root.querySelector('#notifOverlay')?.classList.remove('open');
        const overlay = root.querySelector('#msgOverlay');
        const opening = action === 'client-contact-support' || !overlay?.classList.contains('open');
        overlay?.classList.toggle('open', opening);
        if (opening) {
          renderClientMessagesUi();
          overlay?.querySelector('textarea')?.focus();
          void loadClientMessages();
        }
        break;
      }
      case 'client-close-overlays':
        root.querySelector('#notifOverlay')?.classList.remove('open');
        root.querySelector('#msgOverlay')?.classList.remove('open');
        break;
      case 'client-read-notifs': {
        const res = await api.call<{ readAt?: number }>('notifications.read', { requestId: crypto.randomUUID() });
        if (home) home.profile.notificationReadAt = Number(res.readAt || (Date.now() + clockOffset));
        clientState.notifications = clientState.notifications.map(n => ({ ...n, read: true }));
        renderClientNotificationsUi();
        break;
      }
      case 'client-mark-notif-read': {
        const id = String(target.dataset.id || '').trim();
        if (!id) break;
        const btn = target.closest('button');
        if (btn) btn.disabled = true;
        try {
          await api.call('notifications.read', { id, requestId: crypto.randomUUID() });
          clientState.notifications = clientState.notifications.map(n => String(n.id) === id ? { ...n, read: true } : n);
          renderClientNotificationsUi();
        } catch (error) {
          if (btn) btn.disabled = false;
          clientAlert('Error', errorMessage(error));
        }
        break;
      }
      case 'client-toggle-asset-drop':
        root.querySelector('#timeList')?.classList.remove('show');
        root.querySelector('#assetList')?.classList.toggle('show');
        break;
      case 'client-toggle-time-drop':
        root.querySelector('#assetList')?.classList.remove('show');
        root.querySelector('#timeList')?.classList.toggle('show');
        break;
      case 'client-adj-amount': {
        const inp = root.querySelector<HTMLInputElement>('#tradeAmount');
        if (!inp) break;
        const delta = Number(target.dataset.delta || 0);
        const cur = Number(inp.value || 0);
        inp.value = String(Math.max(100, cur + delta));
        break;
      }
      case 'client-set-duration': {
        const sec = Number(target.dataset.sec ?? DEFAULT_TRADE_DURATION), profit = profitForDuration(sec);
        clientState.selDur = sec;
        clientState.selProfit = profit;
        const st = root.querySelector('#selectedTime'); if (st) st.textContent = formatDurationLabel(sec);
        const pd = root.querySelector('#profitDisplay'); if (pd) pd.textContent = '+' + profit + '%';
        for (const item of root.querySelectorAll<HTMLElement>('#timeList .iq-dropdown-item')) {
          item.classList.toggle('selected', Number(item.dataset.sec || 0) === sec);
        }
        root.querySelector('#timeList')?.classList.remove('show');
        break;
      }
      case 'client-trade-click': {
        const dir = target.dataset.dir === 'down' ? 'down' : 'up';
        if (window.matchMedia('(max-width: 900px)').matches) {
          openClientTradeConfirm(dir);
        } else {
          const amt = Number(root.querySelector<HTMLInputElement>('#tradeAmount')?.value || 0);
          await executeClientTrade(dir, amt, clientState.selDur, clientState.selProfit);
        }
        break;
      }
      case 'client-tc-opt': {
        if (!clientState.pendingTrade) break;
        const sec = Number(target.dataset.sec ?? DEFAULT_TRADE_DURATION), profit = profitForDuration(sec);
        clientState.pendingTrade.dur = sec;
        clientState.pendingTrade.profit = profit;
        for (const card of root.querySelectorAll<HTMLButtonElement>('#tradeConfirmBody .tc-opt')) {
          const active = Number(card.dataset.sec) === sec;
          card.classList.toggle('active', active);
          card.setAttribute('aria-pressed', String(active));
        }
        const estEl = root.querySelector('#tcEstProfit');
        if (estEl) estEl.textContent = '+' + (clientState.pendingTrade.amount * (profit / 100)).toFixed(2);
        break;
      }
      case 'client-tc-confirm': {
        const pt = clientState.pendingTrade;
        if (!pt) break;
        clientState.selDur = pt.dur;
        clientState.selProfit = pt.profit;
        const amtInput = root.querySelector<HTMLInputElement>('#tradeAmount');
        if (amtInput) amtInput.value = String(pt.amount);
        await executeClientTrade(pt.dir, pt.amount, pt.dur, pt.profit);
        break;
      }
      case 'client-close-trade-confirm':
        if ((event.target as Element).closest('[data-stop-prop="1"]') && target === root.querySelector('#tradeConfirmOverlay')) break;
        root.querySelector('#tradeConfirmOverlay')?.classList.remove('open');
        break;
      case 'client-close-result':
        root.querySelector('#resultOverlay')?.classList.remove('open');
        break;
      case 'client-close-alert':
        root.querySelector('#alertOverlay')?.classList.remove('open');
        break;
      case 'client-txn-reset':
        clientState.txnFilters = { search: '', type: 'ALL', status: 'ALL', date: 'ALL', sort: 'NEWEST' };
        renderClientTabContent('history');
        break;
      case 'client-txn-csv': {
        if (!home) break;
        const rows = filterTransactions(home, clientState);
        if (!rows.length) { clientAlert('Info', 'No transactions to export.'); break; }
        downloadCsv('transaction-history.csv', ['Date', 'Type', 'Amount', 'Status', 'Note'],
          rows.map(r => [dateTime(r.createdAt), String(r.kind || '').toUpperCase(), fmtMoney(r.amount, home), String(r.status || ''), String(r.reason || r.note || r.method || '')]));
        break;
      }
      case 'client-txn-view': {
        if (!home) break;
        const txn = clientState.fundingRows.find(r => r.id === id);
        const card = root.querySelector<HTMLElement>('#txnDetailCard');
        const ov = root.querySelector<HTMLElement>('#transactionDetailOverlay');
        if (txn && card && ov) {
          card.innerHTML = renderTxnDetailHtml(home, txn);
          ov.classList.add('open');
        }
        break;
      }
      case 'client-close-txn-detail':
        root.querySelector('#transactionDetailOverlay')?.classList.remove('open');
        break;
      case 'client-open-receipt': {
        const url = target.dataset.url || '';
        const img = root.querySelector<HTMLImageElement>('#receiptViewerImage');
        const ov = root.querySelector<HTMLElement>('#receiptViewerOverlay');
        if (url && img && ov) { img.src = url; ov.classList.add('open'); }
        break;
      }
      case 'client-close-receipt':
        root.querySelector('#receiptViewerOverlay')?.classList.remove('open');
        break;
      case 'client-trade-reset':
        clientState.tradeFilters = { search: '', result: 'ALL', dir: 'ALL', date: 'ALL', sort: 'NEWEST' };
        renderClientTabContent('tradeHistory');
        break;
      case 'client-trade-csv': {
        if (!home) break;
        const rows = filterTrades(clientState);
        if (!rows.length) { clientAlert('Info', 'No trades to export.'); break; }
        downloadCsv('trade-history.csv', ['Date', 'Asset', 'Direction', 'Stake', 'Entry', 'Profit %', 'Result', 'P/L'],
          rows.map(r => [
            dateTime(r.createdAt), formatPair(String(r.symbol || '')), String(r.direction) === 'up' ? 'BUY' : 'SELL',
            fmtMoney(r.stake, home), String(r.entry || ''), String(r.profitPercent || '') + '%',
            String(r.outcome || r.status || '').toUpperCase(), fmtSignedMoney(r.pnl || 0, home),
          ]));
        break;
      }
      case 'client': go(adminClientPath(clientNumberOf(visibleRows.get(id)) ?? id)); break;
      case 'client-tab':
        if (adminClient) go(adminClientPath(adminClient.clientNumber, id === 'messages' && canChat()));
        break;
      case 'next': { const current = list(); if (current.next) { current.cursors[current.page + 1] = current.next; current.page++; await render(); } break; }
      case 'previous': if (list().page > 0) { list().page--; await render(); } break;
      case 'restrictions': case 'adjustment': clientAction(action, id); break;
      case 'trade-detail': case 'funding-detail': case 'review-funding': { const row = visibleRows.get(id); if (row) details(action, row); break; }
      case 'copy-bank-details': {
        const text = target.dataset.copy || '';
        if (!text) break;
        const done = () => {
          target.textContent = '✓ Copied!';
          setTimeout(() => { target.textContent = 'Copy Bank Details'; }, 1800);
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => {});
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); done(); } finally { ta.remove(); }
        }
        break;
      }
      case 'approve-funding': {
        const clientName = target.dataset.name || id;
        const row = visibleRows.get(id);
        const kindWord = (row?.kind === 'deposit' || route === 'deposits') ? 'Deposit' : 'Withdrawal';
        const box = panel();
        box.innerHTML = '<h2 id="detail-heading">Approve ' + kindWord + '</h2>' +
          '<p style="color:#8fa5be;margin-bottom:14px">Approving ' + kindWord.toLowerCase() + ' for <strong style="color:#c5d9ec">' + esc(clientName) + '</strong></p>' +
          '<form class="stack" data-form="admin.funding.decide">' +
          '<input type="hidden" name="id" value="' + esc(id) + '">' +
          '<input type="hidden" name="status" value="approved">' +
          '<label>Remark (optional)<input name="reason" maxlength="240" placeholder="Optional remark" value="' + kindWord + ' approved"></label>' +
          '<div class="button-row"><button type="button" class="button secondary compact" data-action="close">Cancel</button>' +
          '<button class="button approve-submit-btn">✓ Approve</button></div>' +
          formStatus() + '</form>';
        if (!box.open) box.showModal();
        break;
      }
      case 'reject-funding': {
        const clientName = target.dataset.name || id;
        const row = visibleRows.get(id);
        const kindWord = (row?.kind === 'deposit' || route === 'deposits') ? 'Deposit' : 'Withdrawal';
        const box = panel();
        box.innerHTML = '<h2 id="detail-heading">Reject ' + kindWord + '</h2>' +
          '<p style="color:#8fa5be;margin-bottom:14px">Rejecting ' + kindWord.toLowerCase() + ' for <strong style="color:#c5d9ec">' + esc(clientName) + '</strong></p>' +
          '<form class="stack" data-form="admin.funding.decide">' +
          '<input type="hidden" name="id" value="' + esc(id) + '">' +
          '<input type="hidden" name="status" value="rejected">' +
          '<label>Reason for rejection <span style="color:#ff8fa3">*</span><input name="reason" minlength="3" maxlength="240" placeholder="Explain why this ' + kindWord.toLowerCase() + ' is rejected" required></label>' +
          '<div class="button-row"><button type="button" class="button secondary compact" data-action="close">Cancel</button>' +
          '<button class="button reject-submit-btn">✗ Reject</button></div>' +
          formStatus() + '</form>';
        if (!box.open) box.showModal();
        break;
      }
      case 'balance-modal': {
        const clientName = target.dataset.name || 'Client';
        const box = panel();
        box.innerHTML = '<h2 id="detail-heading">Manage Balance</h2>' +
          '<div class="balance-modal-client">ADJUST WALLET<br><strong>' + esc(clientName) + '</strong></div>' +
          '<form class="stack" data-form="admin.client.adjust">' +
          '<input type="hidden" name="uid" value="' + esc(id) + '">' +
          '<input type="hidden" name="adjSign" value="1">' +
          '<div class="balance-modal-box">' +
          '<div class="balance-type-label">ADJUSTMENT TYPE</div>' +
          '<div class="adj-type-toggle">' +
          '<button type="button" class="adj-btn active" data-action="adj-type" data-adj="add">⊕ Add funds</button>' +
          '<button type="button" class="adj-btn" data-action="adj-type" data-adj="deduct">⊖ Deduct</button>' +
          '</div>' +
          '<label>AMOUNT<div class="amount-with-prefix"><span class="amount-prefix">₹</span>' +
          '<input name="amount" type="number" step=".01" min=".01" max="100000" placeholder="Enter amount" required></div></label>' +
          '<label>NOTE<textarea name="reason" placeholder="Optional note for the audit trail" maxlength="240" style="min-height:70px"></textarea></label>' +
          '</div>' +
          '<div class="button-row balance-modal-footer"><button type="button" class="button secondary compact" data-action="close">Cancel</button>' +
          '<button class="button">✓ Update balance</button></div>' +
          formStatus() + '</form>';
        if (!box.open) box.showModal();
        break;
      }
      case 'deposit-settings': await openDepositSettings(id); break;
      case 'edit-client': {
        const row = visibleRows.get(id);
        if (!row) { toast('Client data not loaded. Try refreshing.'); break; }
        const frozenAmount = Number(row.frozenAmount || 0);
        const vipVal = String(row.vipLevel || 'VIP1');
        const vipOptions: [string, string][] = [
          ['Unverified', 'Unverified'],
          ['VIP1', 'VIP Level 1'],
          ['VIP2', 'VIP Level 2'],
          ['VIP3', 'VIP Level 3'],
          ['VIP4', 'VIP Level 4'],
          ['VIP5', 'VIP Level 5'],
        ];
        const box = panel();
        box.innerHTML = '<h2 id="detail-heading">Edit Client: ' + esc(String(row.name || '')) + '</h2>' +
          '<form class="stack" data-form="admin.client.update">' +
          '<input type="hidden" name="uid" value="' + esc(id) + '">' +
          '<div class="edit-client-grid">' +
          '<label>FULL NAME<input name="name" value="' + esc(String(row.name || '')) + '" maxlength="60" required></label>' +
          '<label>EMAIL ADDRESS<input name="email" type="email" value="' + esc(String(row.email || '')) + '" readonly style="opacity:.65"></label>' +
          '<label>LOGIN PASSWORD<input name="password" type="password" minlength="6" placeholder="Leave blank to keep current" autocomplete="new-password"></label>' +
          '<label>WITHDRAWAL PIN<input name="withdrawalPin" type="text" placeholder="Leave blank to keep current"></label>' +
          '<label>VIP LEVEL<select name="vipLevel">' +
          vipOptions.map(([val, text]) =>
            '<option value="' + esc(val) + '"' + (vipVal.toUpperCase() === val.toUpperCase() ? ' selected' : '') + '>' + esc(text) + '</option>').join('') +
          '</select></label>' +
          '<label>REPUTATION SCORE<input name="reputationScore" type="number" min="0" max="1000" value="' + Number(row.reputationScore ?? 100) + '"></label>' +
          '</div>' +
          '<div class="permissions-section"><h3>Permissions &amp; Security</h3>' +
          '<label class="toggle-row"><span class="toggle-switch-wrap"><input type="checkbox" name="tradeEnabled" class="toggle-cb"' + (row.tradeEnabled ? ' checked' : '') + '><span class="toggle-track"></span></span>Allow Trading</label>' +
          '<label class="toggle-row"><span class="toggle-switch-wrap"><input type="checkbox" name="withdrawalEnabled" class="toggle-cb"' + (row.withdrawalEnabled ? ' checked' : '') + '><span class="toggle-track"></span></span>Allow Withdrawals</label>' +
          '<label class="toggle-row freeze"><span class="toggle-switch-wrap"><input type="checkbox" name="frozen" class="toggle-cb freeze-cb"' + (row.frozen ? ' checked' : '') + '><span class="toggle-track"></span></span>FREEZE ACCOUNT <span class="freeze-note">(Restrict All Access)</span></label>' +
          '<label class="toggle-row freeze"><span class="toggle-switch-wrap"><input type="checkbox" name="freezeAmount" class="toggle-cb freeze-cb"' + (row.freezeAmount ? ' checked' : '') + '><span class="toggle-track"></span></span>FREEZE AMOUNT</label>' +
          '<div class="frozen-amount-field"><label for="adminFrozenAmount">Amount to freeze</label>' +
          '<div class="frozen-amount-entry"><input type="number" id="adminFrozenAmount" name="frozenAmount" min="0.01" step="0.01"' + (row.freezeAmount ? '' : ' disabled') + ' value="' +
          (row.freezeAmount && frozenAmount > 0 ? (frozenAmount / 100).toFixed(2) : '') +
          '"><button type="button" class="button secondary compact" data-action="max-frozen-amount" aria-label="Max freeze amount">Max</button></div>' +
          '<small>Enter an amount to reserve it from trades and withdrawals. Leave it blank to freeze all withdrawals.</small></div>' +
          '</div>' +
          '<div class="currency-section"><h3>Client currency</h3>' +
          '<label>CURRENCY OVERRIDE<select name="currency">' +
          [['INR','₹','Indian Rupee'],['USD','$','US Dollar'],['EUR','€','Euro'],['GBP','£','British Pound'],['AED','د.إ','UAE Dirham']].map(([code, sym, name]) =>
            '<option value="' + code + '"' + (String(row.currency || 'INR') === code ? ' selected' : '') + '>' + code + ' (' + sym + ') - ' + name + '</option>').join('') +
          '</select></label>' +
          '<label>CURRENCY-CHANGE PASSWORD<input name="currencyPassword" type="password" autocomplete="new-password" placeholder="Required for this client\'s currency change"></label>' +
          '<div class="button-row" style="margin-top:8px">' +
          '<button type="button" class="button" data-action="save-client-currency" style="font-size:.82rem;min-height:34px;padding:4px 12px">Save currency</button>' +
          '<button type="button" class="button secondary" data-action="default-client-currency" style="font-size:.82rem;min-height:34px;padding:4px 12px">Use admin default</button>' +
          '</div></div>' +
          '<div class="button-row edit-client-footer">' +
          '<button type="button" class="button secondary compact" data-action="close">Cancel</button>' +
          '<button class="button">Save Client</button></div>' +
          formStatus() + '</form>';
        if (!box.open) box.showModal();
        break;
      }
      case 'max-frozen-amount': {
        const form = target.closest<HTMLFormElement>('form[data-form="admin.client.update"]');
        const amount = form?.querySelector<HTMLInputElement>('[name="frozenAmount"]');
        if (!form || !amount || amount.disabled || form.dataset.busy) break;
        const uid = form.querySelector<HTMLInputElement>('[name="uid"]')?.value || '';
        const balance = Number(visibleRows.get(uid)?.balance);
        if (!Number.isSafeInteger(balance)) {
          showFormStatus(form, 'The balance is unavailable. Refresh the client list and try again.', true);
          break;
        }
        if (balance <= 0) {
          showFormStatus(form, 'This client has no available balance to freeze.', true);
          break;
        }
        const maximum = (balance / 100).toFixed(2);
        if (amount.value !== maximum) delete form.dataset.operationId;
        amount.value = maximum;
        showFormStatus(form, '');
        break;
      }
      case 'save-client-currency':
      case 'default-client-currency': {
        const form = target.closest('form');
        const uid = form?.querySelector<HTMLInputElement>('input[name="uid"]')?.value || '';
        const select = form?.querySelector<HTMLSelectElement>('select[name="currency"]');
        const currency = action === 'default-client-currency' ? 'INR' : (select?.value || 'INR');
        if (!uid) break;
        if (select && action === 'default-client-currency') select.value = 'INR';
        await api.call('admin.client.update', { uid, currency, requestId: crypto.randomUUID() });
        const row = visibleRows.get(uid);
        if (row) row.currency = currency;
        invalidateAdminCache(['clients', 'client', 'audit']);
        toast(action === 'default-client-currency' ? 'Client currency reset to admin default (INR).' : 'Client currency updated to ' + currency + '.');
        await silentRefreshCurrentRoute();
        break;
      }
      case 'trade-mode': {
        const mode = target.dataset.mode || 'auto';
        const group = target.closest('.trade-mode-group');
        if (group) {
          for (const btn of group.querySelectorAll('.trade-pill')) btn.classList.remove('active');
          target.classList.add('active');
        }
        const row = visibleRows.get(id);
        if (row) row.tradeMode = mode;
        await api.call('admin.client.update', { uid: id, tradeMode: mode, requestId: crypto.randomUUID() });
        invalidateAdminCache(['audit']);
        toast('Trade mode set to ' + mode.toUpperCase() + '.');
        break;
      }
      case 'notify-client': {
        const clientName = target.dataset.name || 'Client';
        const box = panel();
        box.innerHTML = '<h2 id="detail-heading">Push Notification: ' + esc(clientName) + '</h2>' +
          '<form class="stack" data-form="admin.notifications.push">' +
          '<input type="hidden" name="uid" value="' + esc(id) + '">' +
          '<label>NOTIFICATION TITLE<input name="title" minlength="1" maxlength="100" placeholder="Enter alert or notice title" required></label>' +
          '<label>MESSAGE<textarea name="message" minlength="1" maxlength="1000" placeholder="Write the notification message for the client..." style="min-height:85px" required></textarea></label>' +
          '<div class="button-row" style="justify-content:flex-end">' +
          '<button type="button" class="button secondary compact" data-action="close">Close</button>' +
          '<button class="button">Push Notification</button></div>' +
          formStatus() + '</form>' +
          '<div class="notif-records-section">' +
          '<h3>Sent Notification Records</h3>' +
          '<div id="client-notifications-list" class="notif-records-list"></div>' +
          '</div>';
        if (!box.open) box.showModal();
        void loadClientNotifications(id);
        break;
      }
      case 'reuse-notification': {
        const form = panel().querySelector<HTMLFormElement>('form[data-form="admin.notifications.push"]');
        if (!form || form.dataset.busy) break;
        const copy = target.closest('.notif-record-card')?.querySelector('.notif-record-copy');
        const title = form.querySelector<HTMLInputElement>('input[name="title"]');
        const message = form.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
        if (!copy || !title || !message) break;
        const nextTitle = copy.querySelector('strong')?.textContent ?? '';
        const nextMessage = copy.querySelector('p')?.textContent ?? '';
        if (title.value !== nextTitle || message.value !== nextMessage) delete form.dataset.operationId;
        title.value = nextTitle;
        message.value = nextMessage;
        showFormStatus(form, '');
        title.focus();
        break;
      }
      case 'delete-notification': {
        const uid = target.dataset.uid || '';
        await api.call('admin.notifications.delete', { id, uid, requestId: crypto.randomUUID() });
        invalidateAdminCache(['audit']);
        toast('Notification removed.');
        if (uid) void loadClientNotifications(uid);
        break;
      }
      case 'client-chat':
        lists.delete('client:' + id + ':messages');
        adminCache.delete('client:' + id + ':messages:0');
        go(adminClientPath(clientNumberOf(visibleRows.get(id)) ?? id, true));
        break;
      case 'new-client': {
        const box = panel();
        box.innerHTML = '<h2 id="detail-heading">Register New Client</h2>' +
          '<form class="stack" data-form="admin.client.create">' +
          '<div class="edit-client-grid">' +
          '<label>FULL NAME<input name="name" minlength="2" maxlength="60" required></label>' +
          '<label>EMAIL ADDRESS<input name="email" type="email" required></label>' +
          '<label>LOGIN PASSWORD<input name="password" type="password" minlength="6" required autocomplete="new-password"></label>' +
          '<label>VIP LEVEL<select name="vipLevel">' +
          [['Unverified','Unverified'],['VIP1','VIP Level 1'],['VIP2','VIP Level 2'],['VIP3','VIP Level 3']].map(([val, text]) =>
            '<option value="' + val + '">' + text + '</option>').join('') +
          '</select></label>' +
          '<label>REPUTATION SCORE<input name="reputationScore" type="number" min="0" max="1000" value="100"></label>' +
          '</div>' +
          '<div class="permissions-section"><h3>Permissions &amp; Security</h3>' +
          '<label class="toggle-row"><span class="toggle-switch-wrap"><input type="checkbox" name="tradeEnabled" class="toggle-cb" checked><span class="toggle-track"></span></span>Allow Trading</label>' +
          '<label class="toggle-row"><span class="toggle-switch-wrap"><input type="checkbox" name="withdrawalEnabled" class="toggle-cb" checked><span class="toggle-track"></span></span>Allow Withdrawals</label>' +
          '<label class="toggle-row freeze"><span class="toggle-switch-wrap"><input type="checkbox" name="frozen" class="toggle-cb freeze-cb"><span class="toggle-track"></span></span>FREEZE ACCOUNT <span class="freeze-note">(Restrict All Access)</span></label>' +
          '</div>' +
          '<div class="button-row edit-client-footer">' +
          '<button type="button" class="button secondary compact" data-action="close">Cancel</button>' +
          '<button class="button">Create Client</button></div>' +
          formStatus() + '</form>';
        if (!box.open) box.showModal();
        break;
      }
      case 'adj-type': {
        const form = target.closest('form');
        if (!form) break;
        for (const btn of form.querySelectorAll<HTMLButtonElement>('.adj-btn')) btn.classList.remove('active');
        target.classList.add('active');
        const signInput = form.querySelector<HTMLInputElement>('input[name="adjSign"]');
        if (signInput) signInput.value = target.dataset.adj === 'deduct' ? '-1' : '1';
        break;
      }
    }
  } catch (error) {
    if (action === 'quick-start') authNotice('Start the emulators and run npm run seed to open the trading workspace.');
    else if (access) toast(errorMessage(error));
    else authNotice(errorMessage(error));
  }
});

root.addEventListener('click', event => {
  if (admin || !access) return;
  const el = event.target as Element;
  if (!el.closest('#assetDrop')) root.querySelector('#assetList')?.classList.remove('show');
  if (!el.closest('#timeDrop')) root.querySelector('#timeList')?.classList.remove('show');
  if (!el.closest('#notifOverlay') && !el.closest('[data-action="client-toggle-notif"]')) {
    root.querySelector('#notifOverlay')?.classList.remove('open');
  }
  if (!el.closest('#msgOverlay') && !el.closest('[data-action="client-toggle-msgs"]') && !el.closest('[data-action="client-contact-support"]')) {
    root.querySelector('#msgOverlay')?.classList.remove('open');
  }
});

root.addEventListener('change', event => {
  const node = event.target as HTMLInputElement | HTMLSelectElement;
  if (admin && node instanceof HTMLInputElement && node.name === 'freezeAmount') {
    const amount = node.form?.querySelector<HTMLInputElement>('[name="frozenAmount"]');
    if (amount) amount.disabled = !node.checked;
  }
  if (node.id === 'funding-status') {
    window.clearTimeout(searchDebounceTimer);
    const search = root.querySelector<HTMLInputElement>('.clients-search-input');
    if (search) list().search = search.value.trim();
    list().status = node.value;
    resetList();
    void render();
  }
  if (!admin && node.id === 'wdCountry') {
    clientState.bankCountry = node.value || 'India';
    const box = root.querySelector<HTMLElement>('#wdBankFields');
    if (box) box.innerHTML = renderBankFieldsHtml(clientState.bankCountry, clientState.bankDraft);
  }
  if (!admin && ['txnTypeFilter', 'txnStatusFilter', 'txnDateFilter', 'txnSortSelect'].includes(node.id)) {
    if (node.id === 'txnTypeFilter') clientState.txnFilters.type = node.value;
    if (node.id === 'txnStatusFilter') clientState.txnFilters.status = node.value;
    if (node.id === 'txnDateFilter') clientState.txnFilters.date = node.value;
    if (node.id === 'txnSortSelect') clientState.txnFilters.sort = node.value;
    renderClientTabContent('history');
  }
  if (!admin && ['tradeResultFilter', 'tradeDirFilter', 'tradeDateFilter', 'tradeSortSelect'].includes(node.id)) {
    if (node.id === 'tradeResultFilter') clientState.tradeFilters.result = node.value;
    if (node.id === 'tradeDirFilter') clientState.tradeFilters.dir = node.value;
    if (node.id === 'tradeDateFilter') clientState.tradeFilters.date = node.value;
    if (node.id === 'tradeSortSelect') clientState.tradeFilters.sort = node.value;
    renderClientTabContent('tradeHistory');
  }
});
async function refreshAdminSearch(searchRoute: string, value: string) {
  if (!admin || !access || route !== searchRoute) return;
  const search = value.trim();
  const current = list();
  if (search === current.search && current.page === 0) return;
  current.search = search;
  resetList();
  const key = adminCacheKey();
  const cached = adminCache.get(key);
  if (cached && !cached.dirty && Date.now() - cached.ts <= CACHE_TTL) {
    applyCachedRows(cached.rows, cached.next);
    if (!patchAdminDom(searchRoute, cached.data)) {
      content().innerHTML = buildAdminHtml(searchRoute, cached.data);
    }
    return;
  }
  await silentRefreshCurrentRoute();
}

root.addEventListener('input', event => {
  const target = event.target as HTMLElement;
  const form = target.closest<HTMLFormElement>('form');
  if (form) delete form.dataset.operationId;
  if (target instanceof HTMLInputElement && form?.dataset.form === 'search') {
    window.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      if (target.isConnected) void refreshAdminSearch(form.dataset.searchRoute || '', target.value);
    }, 380);
  }
  if (!admin && target instanceof HTMLInputElement) {
    if (target.id === 'depReferenceNumber') clientState.depositReferenceNumber = target.value;
    if (target.id === 'customDepAmt') {
      clientState.depositPresetAmount = Number(target.value || 0);
      for (const b of root.querySelectorAll<HTMLElement>('.amt-btn')) {
        b.classList.toggle('active', Number(b.dataset.amt || 0) === clientState.depositPresetAmount);
      }
    }
    if (target.id === 'tcAmount' && clientState.pendingTrade) {
      const val = Math.max(0, Number(target.value || 0));
      clientState.pendingTrade.amount = val;
      const estEl = root.querySelector('#tcEstProfit');
      if (estEl) estEl.textContent = '+' + (val * (clientState.pendingTrade.profit / 100)).toFixed(2);
    }
    if (target.dataset.bankField) {
      clientState.bankDraft[target.dataset.bankField] = target.value;
    }
    if (target.id === 'txnSearchInput') {
      const caret = target.selectionStart ?? target.value.length;
      clientState.txnFilters.search = target.value;
      renderClientTabContent('history');
      const next = root.querySelector<HTMLInputElement>('#txnSearchInput');
      if (next) { next.focus(); next.setSelectionRange(caret, caret); }
    }
    if (target.id === 'tradeSearchInput') {
      const caret = target.selectionStart ?? target.value.length;
      clientState.tradeFilters.search = target.value;
      renderClientTabContent('tradeHistory');
      const next = root.querySelector<HTMLInputElement>('#tradeSearchInput');
      if (next) { next.focus(); next.setSelectionRange(caret, caret); }
    }
  }
});
async function signIn(values: Record<string, FormDataEntryValue>) {
  const email = String(values.email), password = String(values.password);
  if (!admin) await setRememberPreference(api.auth, values.remember === 'on');
  if (registration && !admin) { await createUserWithEmailAndPassword(api.auth, email, password); return; }
  try { await signInWithEmailAndPassword(api.auth, email, password); }
  catch (error) {
    if ((error as { code?: string }).code !== 'auth/multi-factor-auth-required') throw error;
    resolver = getMultiFactorResolver(api.auth, error as MultiFactorError);
    if (!resolver.hints.some(hint => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID)) throw new Error('Use an account with an authenticator.');
    dialog('Authenticator code', '<form class="stack" data-form="mfa"><label>Six-digit code<input name="code" inputmode="numeric" pattern="[0-9]{6}" required></label>' +
      '<button class="button">Continue</button>' + formStatus() + '</form>');
  }
}
async function accountForm(op: string, values: Record<string, FormDataEntryValue>, form: HTMLFormElement) {
  if (op === 'auth') { await signIn(values); showFormStatus(form, ''); return true; }
  if (op === 'reset') {
    try { await sendPasswordResetEmail(api.auth, String(values.email)); }
    catch (error) {
      if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    }
    showFormStatus(form, 'If an account exists for this address, a reset link was sent.');
    return true;
  }
  if (op === 'mfa') {
    const hint = resolver?.hints.find(value => value.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!resolver || !hint) throw new Error('Sign in again to get an authenticator challenge.');
    await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, String(values.code)));
    return true;
  }
  if (op === 'enroll') {
    if (!secret || !person) throw new Error('Start authenticator setup again.');
    await multiFactor(person).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, String(values.code)), 'Authenticator');
    await signOut(api.auth); return true;
  }
  return false;
}
root.addEventListener('submit', async event => {
  const form = event.target as HTMLFormElement, op = form.dataset.form;
  if (!op) return;
  event.preventDefault(); if (form.dataset.busy) return;
  const values = Object.fromEntries(new FormData(form));
  const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button')).filter(button => !button.disabled);
  form.dataset.busy = 'true';
  buttons.forEach(button => { button.disabled = true; });
  showFormStatus(form, 'Working…');
  const started = version;
  try {
    if (await accountForm(op, values, form)) return;
    if (op === 'search') {
      window.clearTimeout(searchDebounceTimer);
      await refreshAdminSearch(form.dataset.searchRoute || '', String(values.search || ''));
      return;
    }

    if (op === 'admin.invite.refresh') {
      const card = invitationCards.find(item => item.kind === values.kind);
      if (!card) return;
      const overview = adminCache.get('overview')?.data as OverviewData | undefined;
      const funded = card.kind === 'funded';
      if (funded && typeof overview?.fundedInvitationCode !== 'string') {
        throw new Error('Update Firebase Functions to generate a 2000 Invitation Code.');
      }
      const session = authVersion;
      const { code } = await api.call<{ code: string }>(op, { kind: card.kind, requestId: form.dataset.operationId ||= crypto.randomUUID() });
      if (authVersion !== session || !access) return;
      if (funded && !/^BONUS-[A-Z2-9]{20}$/.test(code)) {
        throw new Error('The server did not return a valid 2000 Invitation Code. Check the Firebase Functions deployment.');
      }
      invitationRevision++;
      const cached = adminCache.get('overview');
      if (cached) (cached.data as OverviewData)[card.key] = code;
      invalidateAdminCache(['audit']);
      if (form.isConnected && panel().open) panel().close();
      if (route === 'overview') updateInvitationCard(card.kind, code);
      toast(card.title + ' generated.');
      return;
    }

    if (op === 'admin.depositSettings.update') {
      const changes = await depositSettingsChanges(form, values);
      if (!Object.keys(changes).length) {
        showFormStatus(form, 'No changes to save.');
        return;
      }
      if (!form.isConnected || !panel().open || started !== version) return;
      await api.call(op, { uid: String(values.uid), ...changes, requestId: form.dataset.operationId ||= crypto.randomUUID() });
      if (started !== version) return;
      invalidateAdminCache(['audit']);
      if (form.isConnected && panel().open) panel().close();
      toast('Deposit payment settings saved.');
      return;
    }

    if (op === 'client.deposit') {
      if (home?.profile.frozen) throw new Error('Account is frozen. Contact support.');
      const amt = Number(values.amount || clientState.depositPresetAmount || 0);
      if (!Number.isFinite(amt) || amt < 1) throw new Error('Please enter a valid deposit amount.');
      const referenceNumber = String(values.referenceNumber || '').trim();
      if (!referenceNumber || referenceNumber.length > 128) throw new Error('Enter a UTR or reference number up to 128 characters.');
      const methodLabel = clientState.depositMethod === 'UPI' ? 'UPI / BANK' : 'USDT (BNB Smart Chain)';
      const account = authVersion;
      await api.call('funding.request', {
        kind: 'deposit',
        amount: cents(amt),
        method: methodLabel,
        note: 'Deposit submitted via ' + methodLabel,
        referenceNumber,
        requestId: form.dataset.operationId ||= crypto.randomUUID(),
      });
      if (account !== authVersion) return;
      delete form.dataset.operationId;
      if (clientState.depositReferenceNumber.trim() === referenceNumber) {
        clientState.depositReferenceNumber = '';
        const referenceInput = root.querySelector<HTMLInputElement>('#depReferenceNumber');
        if (referenceInput) referenceInput.value = '';
      }
      clientLoaded.funding = false;
      void refreshClientTabData('history', true);
      void hydrateClientSidebarData();
      clientAlert('Success', 'Deposit request submitted for review.');
      return;
    }

    if (op === 'client.withdraw') {
      if (!home) return;
      const restriction = clientWithdrawalRestriction(home);
      if (restriction) throw new Error(restriction);
      const reputationWarning = withdrawalReputationWarning(home.profile.reputationScore);
      if (reputationWarning) {
        clientAlert('Low reputation points', reputationWarning);
        return;
      }
      const amt = Number(values.amount || 0);
      const pin = String(values.withdrawalPin || '').trim();
      const country = String(values.country || clientState.bankCountry || 'India');
      if (!Number.isFinite(amt) || amt < 1) throw new Error('Enter a valid withdrawal amount.');
      const amount = cents(amt);
      const freeze = walletFreeze(home.wallet.available, home.profile);
      if (freeze.kind === 'amount' && amount > freeze.available) {
        throw new Error(`Available for withdrawal: ${fmtMoney(freeze.available, home)}.`);
      }
      if (!pin) throw new Error('Enter your Withdrawal PIN.');
      const bankDetails: Record<string, string> = { country };
      for (const el of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-bank-field]')) {
        const k = el.dataset.bankField || '';
        if (k) bankDetails[k] = el.value.trim();
      }
      const err = validateBankDetails(bankDetails);
      if (err) throw new Error(err);
      clientState.bankCountry = country;
      clientState.bankDraft = { ...bankDetails };
      await api.call('funding.request', {
        kind: 'withdrawal',
        amount,
        method: 'Bank Transfer',
        bankDetails,
        withdrawalPin: pin,
        requestId: form.dataset.operationId ||= crypto.randomUUID(),
      });
      delete form.dataset.operationId;
      clientLoaded.funding = false;
      const updated = await api.call<Home>('home');
      setHome(updated);
      void refreshClientTabData('history', true);
      void hydrateClientSidebarData();
      clientAlert('Success', 'Withdrawal request submitted.');
      go(clientPaths.history);
      return;
    }

    const params: Record<string, unknown> = { ...values, requestId: form.dataset.operationId ||= crypto.randomUUID() };
    if ('amount' in params) params.amount = cents(params.amount) * Number(values.adjSign || 1);
    delete params.adjSign;
    if ('duration' in params) params.duration = Number(params.duration);
    if (op === 'profile.update') {
      if (!String(values.name || '').trim()) delete params.name;
      if (!String(values.password || '').trim()) delete params.password;
      if (!String(values.withdrawalPin || '').trim()) delete params.withdrawalPin;
    }
    if (op === 'admin.client.restrict') { params.tradeEnabled = values.tradeEnabled === 'on'; params.withdrawalEnabled = values.withdrawalEnabled === 'on'; }
    if (op === 'admin.client.update' || op === 'admin.client.create') {
      params.tradeEnabled = values.tradeEnabled === 'on';
      params.withdrawalEnabled = values.withdrawalEnabled === 'on';
      params.frozen = values.frozen === 'on';
      if (op === 'admin.client.update') {
        params.freezeAmount = values.freezeAmount === 'on';
        params.frozenAmount = params.freezeAmount ? Number(values.frozenAmount || 0) : 0;
      }
      if (values.reputationScore !== undefined && String(values.reputationScore).trim() !== '') params.reputationScore = Number(values.reputationScore);
      if (!String(values.password || '').trim()) delete params.password;
      if (!String(values.withdrawalPin || '').trim()) delete params.withdrawalPin;
      delete params.currencyPassword;
      delete params.email;
      if (op === 'admin.client.create') params.email = values.email;
    }
    await api.call(op, params);
    if (started !== version) return;
    delete form.dataset.operationId;
    if (op === 'admin.notifications.push') {
      form.reset();
      showFormStatus(form, 'Notification sent.');
      toast('Notification pushed to client.');
      invalidateAdminCache(['audit']);
      void loadClientNotifications(String(values.uid || ''));
      return;
    }
    if (op === 'message.send' || op === 'admin.message.send') {
      const composer = form.querySelector('textarea[name="message"]');
      if (composer instanceof HTMLTextAreaElement && composer.value === values.message) form.reset();
      showFormStatus(form, 'Message sent.');
      if (op === 'admin.message.send') {
        invalidateAdminCache(['clients', 'client']);
        await silentRefreshCurrentRoute();
      } else {
        await loadClientMessages();
      }
      return;
    }
    panel().close();
    if (!admin) { const updated = await api.call<Home>('home'); if (started === version) setHome(updated); }
    if (started !== version) return;
    if (admin) {
      if (op === 'admin.funding.decide') {
        invalidateAdminCache(['withdrawals', 'deposits', 'clients', 'client', 'overview', 'audit']);
        void refreshAdminBadges();
      } else if (op.startsWith('admin.client.')) {
        invalidateAdminCache(['clients', 'client', 'overview', 'audit']);
      } else {
        invalidateAdminCache(['clients', 'client', 'audit']);
      }
      await silentRefreshCurrentRoute();
    } else {
      if (op === 'profile.update') {
        const passEl = form.querySelector<HTMLInputElement>('[name="password"]');
        const pinEl = form.querySelector<HTMLInputElement>('[name="withdrawalPin"]');
        if (passEl) passEl.value = '';
        if (pinEl) pinEl.value = '';
        renderClientTabContent('profile');
        clientAlert('Success', 'Profile updated successfully.');
        return;
      }
      if (op === 'funding.cancel') {
        root.querySelector('#transactionDetailOverlay')?.classList.remove('open');
        clientLoaded.funding = false;
        await refreshClientTabData('history', true);
        void hydrateClientSidebarData();
        clientAlert('Cancelled', 'Withdrawal request cancelled.');
        return;
      }
      await render();
    }
    toast(op === 'trade.place' ? 'Trade placed.' : 'Changes saved.');
  } catch (error) {
    if (!admin && access && op !== 'message.send') clientAlert('Error', errorMessage(error));
    else showFormStatus(form, errorMessage(error));
  }
  finally {
    delete form.dataset.busy;
    buttons.forEach(button => { button.disabled = false; });
    if (op === 'client.withdraw' && home) updateWithdrawalRestriction(home);
  }
});
window.addEventListener('popstate', () => {
  replaceWorkspacePath(workspaceEntryPath(location, admin ? adminNav : undefined));
  dismissNavigation();
  void render();
});
if (!admin) {
  for (const event of ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const) {
    window.addEventListener(event, noteClientActivity, { passive: true });
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !access) return;
  if (admin) {
    if (adminSessionExpiresAt && Date.now() + clockOffset >= adminSessionExpiresAt) {
      expireAdminSession();
      return;
    }
    const cached = adminCache.get(adminCacheKey(route));
    if (!cached || cached.dirty) void silentRefreshCurrentRoute();
    else void markVisibleChatRead(route, cached.data);
  } else {
    noteClientActivity();
    if (!syncInitialized || (clientState.activeTrade && clientState.activeTrade.dueAt <= Date.now() + clockOffset)) void silentRefreshUserView();
  }
});
window.addEventListener('pagehide', () => {
  if (admin && person) expireAdminSession();
  else stop();
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  if (access) void render();
  else if (!admin) void attachLoginChart();
});
void start();
