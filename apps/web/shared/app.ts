import './style.css';
import './login.css';
import { createUserWithEmailAndPassword, getMultiFactorResolver, multiFactor, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, TotpMultiFactorGenerator, type MultiFactorError, type MultiFactorResolver, type TotpSecret, type User } from 'firebase/auth';
import { assets, findAsset, profitPercent, type Asset } from '../../../functions/src/market';
import { connect, emulator, rememberPreference, setRememberPreference } from './firebase';
import { userLogin } from './login';
import { adminNav, brand, brandMark, chartFrames, coin, fundingRows, ledgerRows, marketScreen, messages, openTrades, pair, title, tradeRows, userNav, walletForms } from './screens';
import { actionButton, amountField, credits, dateTime, errorMessage, esc, formStatus, label, pager, recordReference, section, showFormStatus, state, table, type Home, type Page, type Profile, type Row, type Wallet } from './view';

const root = document.querySelector<HTMLElement>('#app')!;
const admin = root.dataset.audience === 'admin';
const first = admin ? 'overview' : 'trade';
let api: Awaited<ReturnType<typeof connect>>;
let person: User | null;
let home: Home | undefined;
let roles: string[] = [];
let access = false, guestMarket = false, version = 0, authVersion = 0, clockOffset = 0;
let route = first, selected: Asset = assets[0], frame = '1m';
let chart: ReturnType<typeof import('./canvas-chart').mountChart> | undefined;
let refreshTimer = 0, toastTimer = 0, refreshing = false, registration = !admin && new URLSearchParams(location.search).get('mode') === 'register';
let resolver: MultiFactorResolver | undefined;
let secret: TotpSecret | undefined;
let clientSection = 'activity';
let visibleRows = new Map<string, Row>();
type List = { page: number; next: string | null; cursors: (string | null)[]; search: string; status: string };
const lists = new Map<string, List>();
const role = (name: string) => roles.includes(name);
const nav = () => admin ? adminNav.filter(item => !item[3] || role(item[3])) : userNav;
const part = (i: number) => {
  try { return decodeURIComponent(location.hash.slice(1).split('/')[i] || ''); } catch { return ''; }
};
const clientId = () => part(1);
const content = () => root.querySelector<HTMLElement>('#content')!;
const panel = () => root.querySelector<HTMLDialogElement>('#details')!;
const routeName = () => nav().find(item => item[0] === route)?.[2] || 'Client details';
const stop = () => { chart?.destroy(); chart = undefined; clearInterval(refreshTimer); };
const go = (target: string) => { if (location.hash === '#' + target) void render(); else location.hash = target; };
const cents = (value: unknown) => Math.round(Number(value) * 100);
function list(): List {
  const key = route + (route === 'client' ? ':' + clientId() + ':' + clientSection : '');
  const saved = lists.get(key);
  if (saved) return saved;
  const initial: List = { page: 0, next: null, cursors: [null], search: '', status: 'pending' };
  lists.set(key, initial);
  return initial;
}
function resetList() { Object.assign(list(), { page: 0, next: null, cursors: [null] }); }
const navigation = () => pager(list().page, list().next);
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
function setHome(value: Home) {
  home = value; clockOffset = value.serverTime - Date.now();
  const balance = root.querySelector('#top-balance');
  if (balance) balance.textContent = credits(value.wallet.available);
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
  guestMarket = false;
  stop();
  if (!admin) {
    root.innerHTML = userLogin({ registration, signedIn: !!person, remember: rememberPreference(), showQuickStart: emulator, notice }) + dialogShell;
    void attachPublicChart('#login-chart', '#login-chart-status', false);
    return;
  }
  const heading = admin ? 'Admin sign-in' : registration ? 'Create your practice account' : 'Sign in';
  const fields = '<label>Email<input name="email" type="email" autocomplete="email" required></label>' +
    '<label>Password<input name="password" type="password" autocomplete="' + (registration ? 'new-password' : 'current-password') + '" minlength="6" required></label>';
  root.innerHTML = '<div class="auth-wrap"><div class="auth-intro">' + brand + '<h1>' + (admin ? 'Trading operations' : 'Your practice trading workspace') +
    '</h1><p>' + (admin ? 'Review practice accounts, approve funding requests and monitor trading activity.' : 'Explore crypto markets, practise trades and follow each result in one workspace.') +
    '</p><span class="pill practice">Practice environment</span></div><section class="auth-card"><h2>' + heading + '</h2>' +
    (notice ? '<p class="error">' + esc(notice) + '</p>' : '') + (!person ? '<form data-form="auth">' + fields +
      '<button class="button">' + (registration ? 'Create account' : 'Sign in') + '</button>' + formStatus() + '</form>' : '') + '<div class="button-row">' +
    (!person && !admin ? '<button class="button secondary compact" data-action="registration">' + (registration ? 'Back to sign in' : 'Create an account') + '</button>' : '') +
    (!person ? '<button class="button secondary compact" data-action="reset">Reset password</button>' : '') +
    (person && admin && !emulator ? '<button class="button secondary compact" data-action="enroll">Set up authenticator</button>' : '') +
    (person ? '<button class="button secondary compact" data-action="signout">Sign out</button>' : '') +
    (emulator && !person ? '<button class="button secondary" data-action="quick-start">Open practice workspace</button>' : '') +
    '<a href="' + (admin ? '/' : '/admin/') + '">' + (admin ? 'User site' : 'Staff sign-in') + '</a></div><p id="auth-notice" class="form-status" role="status"></p>' + dialogShell + '</section></div>';
}
async function attachPublicChart(canvasSelector: string, statusSelector: string, live: boolean) {
  const canvas = root.querySelector<HTMLCanvasElement>(canvasSelector);
  const status = root.querySelector<HTMLElement>(statusSelector);
  if (!canvas || !status) return;
  try {
    const { mountChart, formatPrice } = await import('./canvas-chart');
    if (!canvas.isConnected) return;
    const price = live ? root.querySelector<HTMLElement>('#market-price') : null;
    chart = mountChart(canvas, status, value => { if (price) price.textContent = formatPrice(value); });
    chart.load(live ? selected : assets[0], live ? frame : '5m', live);
    if (!live) status.textContent = 'Simulated chart';
  } catch {
    if (status.isConnected) status.textContent = 'Chart unavailable';
  }
}
function showGuestMarket() {
  if (admin || access || person) return;
  stop();
  guestMarket = true;
  root.innerHTML = '<header class="guest-toolbar">' + brand +
    '<button type="button" class="button secondary" data-action="back-to-login">Back to sign in</button></header>' +
    '<main class="content">' + marketScreen(selected, frame) + '</main>' + dialogShell;
  void attachPublicChart('#market-chart', '#feed-status', true);
}
function authNotice(message: string) {
  const node = root.querySelector('#auth-notice');
  if (node) node.textContent = message;
}
function shell() {
  root.innerHTML = '<div class="shell' + (admin ? ' admin-shell' : '') + '"><aside class="sidebar" id="sidebar">' + brand +
    '<nav class="navigation" aria-label="' + (admin ? 'Staff' : 'Workspace') + ' navigation">' +
    nav().map(([id, icon, name]) => '<a href="#' + id + '" data-nav="' + id + '"><span class="nav-symbol" aria-hidden="true">' + icon + '</span>' + name + '</a>').join('') +
    '</nav><div class="side-bottom"><p class="quiet">' + esc(admin ? 'Staff workspace' : home?.profile.name) + '</p><a href="' + (admin ? '/' : '/admin/') + '">' +
    (admin ? 'User site' : 'Staff sign-in') + '</a></div></aside><div class="work"><header class="topbar">' +
    '<button class="button secondary compact menu-toggle" data-action="menu" aria-controls="sidebar" aria-expanded="false">Menu</button>' +
    '<span class="mobile-brand" role="img" aria-label="Qoption">' + brandMark + '</span><span class="top-title">' +
    (admin ? 'Admin panel' : 'Trading terminal') + '</span><div class="top-actions">' +
    (admin ? '<span class="pill practice">Practice environment</span>' : '<a href="#wallet" class="top-balance"><span class="quiet">Practice Credits</span><strong id="top-balance">' + credits(home?.wallet.available) + '</strong></a>') +
    '<button class="button secondary compact" data-action="signout">Sign out</button></div></header><main id="content" class="content"></main></div></div>' + dialogShell + '<p id="toast" class="toast" role="status"></p>';
}
async function start() {
  try {
    api = await connect(admin ? 'admin' : 'user');
    onAuthStateChanged(api.auth, async user => {
      const latest = ++authVersion;
      version++; stop(); access = false; guestMarket = false; home = undefined; roles = []; lists.clear(); visibleRows.clear();
      person = user; resolver = undefined; secret = undefined;
      if (!user) { showAuth(); return; }
      root.innerHTML = '<p class="boot">Opening workspace…</p>';
      try {
        if (admin) {
          const data = await api.call<{ roles: string[] }>('admin.access');
          if (latest !== authVersion) return;
          roles = data.roles;
        } else {
          const data = await api.call<Home>('access');
          if (latest !== authVersion) return;
          setHome(data);
        }
        access = true; shell(); await render();
      } catch (error) { if (latest === authVersion) showAuth(errorMessage(error)); }
    });
  } catch (error) { root.innerHTML = '<main class="content">' + title('Workspace unavailable', errorMessage(error)) + '</main>'; }
}
async function renderUser(run: number) {
  if (!home) return '';
  if (route === 'trade' || route === 'assets') return marketScreen(selected, frame, route === 'trade' ? home : undefined);
  if (route === 'wallet') {
    const [updated, rows] = await Promise.all([api.call<Home>('home'), getPage(run, 'list', { list: 'funding' })]);
    if (run !== version) return '';
    setHome(updated);
    return title('Wallet', 'Manage practice credits and simulated funding requests.', 'Practice Credits') +
      walletForms(updated.wallet, updated.profile.withdrawalEnabled) + '<div class="dashboard-lower">' + section('Funding history', fundingRows(rows) + navigation()) + '</div>';
  }
  if (route === 'history') {
    const rows = await getPage(run, 'list', { list: 'trades' });
    return title('Trade history', 'Review open and settled simulated trades.') + section('Trades', tradeRows(rows) + navigation());
  }
  if (route === 'notifications') {
    const rows = await getPage(run, 'list', { list: 'ledger' });
    const readAt = home.profile.notificationReadAt ?? 0;
    const controls = '<div class="filters"><form data-form="notifications.read"><button class="button secondary">Mark all as read</button>' + formStatus() + '</form></div>';
    const activity = table(['Update', 'Available change', 'Date', 'Status'], rows.map(row => [
      esc(label(row.kind)), credits(row.availableDelta), dateTime(row.createdAt),
      state(Number(row.createdAt) > readAt ? 'new' : 'read'),
    ]), 'No updates yet');
    return title('Notifications', 'Trade results and wallet updates.') + section('Account activity', controls + activity + navigation());
  }
  if (route === 'messages') {
    const rows = await getPage(run, 'list', { list: 'messages' });
    return title('Messages', 'Contact support about your practice workspace.') + section('Support conversation', messages(rows) + navigation());
  }
  if (route === 'leaderboard') return title('Leaderboard', 'Example practice trading standings.', 'Sample rankings') +
    section('Practice standings', table(['Rank', 'Trader', 'Practice P/L', 'Trades'], [
      ['1', 'MarketLark', '242.00', '17'], ['2', 'BlueCandle', '188.00', '14'], ['3', 'HarborQuant', '146.00', '12'],
      ['4', 'RiverDelta', '112.00', '11'], ['5', 'NightSession', '84.00', '9'],
    ], 'No rankings'));
  return title('Settings', 'Manage your workspace profile.') + section('Profile', '<div class="panel-body"><form class="stack" data-form="profile.update">' +
    '<label>Name<input name="name" minlength="2" maxlength="50" value="' + esc(home.profile.name) + '" required></label><label>Account email<input value="' +
    esc(home.profile.email) + '" readonly></label><div><button class="button">Save profile</button></div>' + formStatus() + '</form></div>');
}

async function renderClient(run: number) {
  const uid = clientId(), current = list(), thread = clientSection === 'messages';
  const data = await api.call<{ profile: Profile; wallet: Wallet | null; activity: Page }>('admin.client', { uid, cursor: thread ? null : current.cursors[current.page] });
  const page = thread ? await api.call<Page>('admin.messages', { uid, cursor: current.cursors[current.page] }) : data.activity;
  if (run !== version) return '';
  remember(page, current); visibleRows.set('@client', { ...data.profile, id: uid });
  const balance = data.wallet ? '<div class="asset-strip"><article class="metric"><small>Available</small><strong>' + credits(data.wallet.available) +
    '</strong></article><article class="metric"><small>In hold</small><strong>' + credits(data.wallet.held) + '</strong></article></div>' : '';
  return title(data.profile.name, data.profile.email) + '<div class="button-row"><a class="button secondary compact" href="#clients">Back to clients</a></div>' +
    '<div class="dashboard-lower">' + balance + section('Client details',
      '<div class="filters">' + actionButton('client-tab', 'activity', 'Activity') + (role('support') ? actionButton('client-tab', 'messages', 'Messages') : '') +
      (role('admin') ? actionButton('restrictions', uid, 'Restrictions') : '') + (role('finance') ? actionButton('adjustment', uid, 'Adjust balance') : '') + '</div>' +
      (thread ? messages(page.rows, uid) : data.wallet ? ledgerRows(page.rows) : table(['Sender', 'Message', 'Date'],
        page.rows.map(row => [esc(row.sender), esc(row.message), dateTime(row.createdAt)]), 'No client messages')) + navigation()) + '</div>';
}
async function renderAdmin(run: number) {
  if (route === 'overview') {
    const values = await api.call<Record<string, number> & { recent: Row[]; pending: Row[] }>('admin.dashboard');
    if (run === version) visibleRows = new Map([...values.recent, ...values.pending].map(row => [row.id, row]));
    const cards = [['clients', 'Assigned clients'], ['trades', 'Open trades'], ['deposits', 'Pending deposits'], ['withdrawals', 'Pending withdrawals']];
    return title('Admin dashboard', 'Monitor client accounts, trades, and funding requests.', 'Staff workspace') + '<div class="metrics">' +
      cards.map(([key, name]) => '<article class="metric"><small>' + name + '</small><strong>' + Number(values[key] || 0).toLocaleString() + '</strong>' +
        (nav().some(item => item[0] === key) ? '<a href="#' + key + '">View ' + key + '</a>' : '') + '</article>').join('') + '</div>' +
      section('Operations', '<div class="panel-body button-row">' + nav().filter(item => item[0] !== 'overview').map(([id,, name]) =>
        '<a class="button secondary" href="#' + id + '">' + name + '</a>').join('') + '</div>') + '<div class="overview-panels dashboard-lower">' +
      (role('finance') ? section('Pending funding', table(['Request', 'Amount', 'Client', ''], values.pending.map(row => [
        esc(label(row.kind)), credits(row.amount), esc(recordReference(row.uid)), actionButton('review-funding', row.id, 'Review'),
      ]), 'No requests awaiting review')) : '') +
      (role('admin') ? section('Recent trades', table(['Market', 'Direction', 'Status', ''], values.recent.map(row => [
        pair(row.symbol), state(row.direction), state(row.outcome || row.status), actionButton('trade-detail', row.id, 'Details'),
      ]), 'No recent trades')) : '') + '</div>';
  }
  if (route === 'client') return renderClient(run);
  if (route === 'clients') {
    const search = list().search, rows = await getPage(run, 'admin.clients', { search });
    return title('Clients', 'Browse accounts within your staff scope.') + section('Client directory',
      '<form class="filters" data-form="search"><label>Client name<input name="search" maxlength="50" value="' + esc(search) +
      '" placeholder="Search by name prefix"></label><button class="button secondary">Search</button></form>' +
      table(['Client', 'Email', 'Trading', 'Withdrawals', ''], rows.map(row => [esc(row.name), esc(row.email), state(row.tradeEnabled ? 'enabled' : 'paused'),
        state(row.withdrawalEnabled ? 'enabled' : 'paused'), actionButton('client', row.id, 'Open')]), 'No clients found') + navigation());
  }
  const refresh = '<button class="button secondary" data-action="reload">Refresh</button>';
  if (route === 'deposits' || route === 'withdrawals') {
    const status = list().status;
    const name = routeName();
    const rows = await getPage(run, 'admin.funding', { kind: route === 'deposits' ? 'deposit' : 'withdrawal', status });
    return title(name, 'Review simulated funding requests.') + section(name + ' queue',
      '<div class="filters"><label>Status<select id="funding-status">' + ['pending', 'approved', 'rejected', 'cancelled', 'all'].map(value =>
        '<option value="' + value + '"' + (value === status ? ' selected' : '') + '>' + label(value) + '</option>').join('') + '</select></label>' +
      refresh + '</div>' + fundingRows(rows, true) + navigation());
  }
  if (route === 'trades') {
    const rows = await getPage(run, 'admin.trades');
    return title('Trade activity', 'Review recent activity from the simulated order engine.') +
      section('Recent trades', '<div class="filters">' + refresh + '</div>' + tradeRows(rows, true) + navigation());
  }
  const rows = await getPage(run, 'admin.audit');
  return title('Audit log', 'Staff actions recorded by the server.') + section('Audit events', table(['Event', 'Client ID', 'Staff ID', 'Reason', 'Date'],
    rows.map(row => [esc(row.event), esc(recordReference(row.uid)), esc(recordReference(row.actor)), esc(row.reason), dateTime(row.createdAt)]), 'No audit events') + navigation());
}

async function render() {
  if (!access) return;
  stop();
  const run = ++version, target = part(0) || first;
  route = nav().some(item => item[0] === target) || (admin && target === 'client' && clientId()) ? target : first;
  visibleRows.clear();
  for (const link of root.querySelectorAll<HTMLElement>('[data-nav]')) {
    if (link.dataset.nav === (route === 'client' ? 'clients' : route)) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const delay = window.setTimeout(() => {
    if (run === version) content().innerHTML = title(routeName(), 'Loading…') + '<div class="panel empty-space" aria-busy="true"></div>';
  }, 180);
  try {
    const html = await (admin ? renderAdmin(run) : renderUser(run));
    if (run !== version) return;
    window.clearTimeout(delay);
    content().innerHTML = html;
    if (!admin && (route === 'trade' || route === 'assets')) {
      const { mountChart, formatPrice } = await import('./canvas-chart');
      if (run !== version) return;
      const price = root.querySelector('#market-price')!;
      chart = mountChart(root.querySelector<HTMLCanvasElement>('#market-chart')!, root.querySelector<HTMLElement>('#feed-status')!, value => { price.textContent = formatPrice(value); });
      chart.load(selected, frame, route === 'assets', clockOffset);
      if (route === 'trade') refreshTimer = window.setInterval(() => void clockTick(run), 1000);
    } else if (admin && (route === 'overview' || route === 'trades')) {
      refreshTimer = window.setInterval(async () => {
        if (document.hidden || refreshing || panel().open || content().contains(document.activeElement)) return;
        refreshing = true;
        try {
          const html = await renderAdmin(run);
          if (run === version && !panel().open && !content().contains(document.activeElement)) content().innerHTML = html;
        } catch { /* Retain the current view on a refresh failure. */ }
        finally { refreshing = false; }
      }, 15000);
    }
  } catch (error) {
    if (run === version) content().innerHTML = title(routeName(), errorMessage(error)) + '<button class="button secondary" data-action="reload">Try again</button>';
  } finally { clearTimeout(delay); }
}
let lastSettleAttempt = 0;
async function clockTick(run: number) {
  const now = Date.now() + clockOffset;
  let expired = false;
  for (const node of root.querySelectorAll<HTMLElement>('[data-due]')) {
    const remaining = Math.ceil((Number(node.dataset.due) - now) / 1000);
    node.textContent = remaining > 0 ? remaining + 's' : 'Settling…';
    if (remaining <= 0) expired = true;
  }
  if (!expired || refreshing || document.hidden || Date.now() - lastSettleAttempt < 3500) return;
  lastSettleAttempt = Date.now(); refreshing = true;
  try {
    const data = await api.call<Home>('home');
    if (run !== version) return;
    setHome(data);
    const open = root.querySelector('#open-trades');
    if (open) open.innerHTML = openTrades(data.active, data.serverTime);
  } catch (error) { if (run === version) toast(errorMessage(error)); }
  finally { refreshing = false; }
}
function updateMarket() {
  const header = root.querySelector('#chart-market');
  if (header) header.innerHTML = coin(selected) + '<div><h2>' + pair(selected.symbol) + '</h2><small>' + selected.name + '</small></div>';
  const ticket = root.querySelector('#ticket-pair'); if (ticket) ticket.textContent = selected.code + '/USDT';
  const price = root.querySelector('#market-price'); if (price) price.textContent = '—';
  const selector = root.querySelector<HTMLSelectElement>('#asset-select'); if (selector) selector.value = selected.symbol;
  for (const button of root.querySelectorAll<HTMLElement>('[data-action="asset"], [data-action="frame"]')) button.setAttribute('aria-pressed',
    String(button.dataset.id === (button.dataset.action === 'asset' ? selected.symbol : frame)));
  chart?.load(selected, frame, guestMarket || route === 'assets', clockOffset);
}

function details(action: string, row: Row) {
  if (action === 'trade-detail') {
    dialog('Trade details', definition([['Reference', recordReference(row.id)], ['Asset', String(row.symbol).replace('USDT', '/USDT')],
      ['Direction', label(row.direction)], ['Stake', credits(row.stake)], ['Entry price', row.entry], ['Expiry', dateTime(row.dueAt)],
      ['Exit price', row.exit], ['Result', label(row.outcome || row.status)], ['Net result', row.pnl === undefined ? '—' : credits(row.pnl) + ' Practice Credits']]));
    return;
  }
  const id = esc(row.id);
  const info = definition([['Reference', recordReference(row.id)], ['Type', label(row.kind)], ['Amount', credits(row.amount) + ' Practice Credits'],
    ['Status', label(row.status)], ['Submitted', dateTime(row.createdAt)], ['Decision reason', row.reason]]);
  if (action === 'review-funding') {
    dialog('Review ' + label(row.kind).toLowerCase(), info + '<form class="stack" data-form="admin.funding.decide"><input type="hidden" name="id" value="' + id +
      '"><label>Decision<select name="status"><option value="approved">Approve</option><option value="rejected">Reject</option></select></label>' +
      '<label>Reason<input name="reason" minlength="3" maxlength="240" required></label><button class="button">Record decision</button>' + formStatus() + '</form>');
  } else {
    dialog('Funding receipt', info + (!admin && row.kind === 'withdrawal' && row.status === 'pending' ?
      '<form data-form="funding.cancel"><input type="hidden" name="id" value="' + id + '"><button class="button secondary">Cancel withdrawal</button>' + formStatus() + '</form>' : ''));
  }
}
function clientAction(action: string, id: string) {
  const target = visibleRows.get('@client');
  if (!target || target.id !== id) return;
  const restrict = action === 'restrictions';
  dialog(restrict ? 'Client restrictions' : 'Adjust practice balance',
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
root.addEventListener('click', async event => {
  const target = (event.target as Element).closest<HTMLElement>('[data-action], [data-nav]');
  if (!target) return;
  const action = target.dataset.action, id = target.dataset.id || '';
  const side = root.querySelector('#sidebar');
  if (target.dataset.nav) {
    side?.classList.remove('open');
    root.querySelector('[data-action=menu]')?.setAttribute('aria-expanded', 'false'); return;
  }
  try {
    switch (action) {
      case 'menu': { const open = side?.classList.toggle('open'); target.setAttribute('aria-expanded', String(open)); if (open) side?.querySelector<HTMLElement>('a')?.focus(); break; }
      case 'signout': await signOut(api.auth); break;
      case 'registration': registration = !registration; showAuth(); break;
      case 'guest-market': showGuestMarket(); break;
      case 'back-to-login': registration = false; showAuth(); break;
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
        const email = root.querySelector<HTMLInputElement>('form[data-form=auth] input[name=email]')?.value;
        dialog('Reset password', '<form class="stack" data-form="reset"><label>Email address<input type="email" name="email" value="' +
          esc(email) + '" required></label><button class="button">Send reset link</button>' + formStatus() + '</form>');
        break;
      }
      case 'enroll': await enroll(); break;
      case 'close': panel().close(); break;
      case 'reload': await render(); break;
      case 'asset': { const asset = findAsset(id); if (asset) { selected = asset; updateMarket(); } break; }
      case 'frame': if (chartFrames.includes(id)) { frame = id; updateMarket(); } break;
      case 'client': clientSection = 'activity'; go('client/' + encodeURIComponent(id)); break;
      case 'client-tab': clientSection = id === 'messages' ? 'messages' : 'activity'; await render(); break;
      case 'next': { const current = list(); if (current.next) { current.cursors[current.page + 1] = current.next; current.page++; await render(); } break; }
      case 'previous': if (list().page > 0) { list().page--; await render(); } break;
      case 'restrictions': case 'adjustment': clientAction(action, id); break;
      case 'trade-detail': case 'funding-detail': case 'review-funding': { const row = visibleRows.get(id); if (row) details(action, row); break; }
    }
  } catch (error) {
    if (action === 'quick-start') authNotice('Start the emulators and run npm run seed to open the practice workspace.');
    else if (access) toast(errorMessage(error));
    else authNotice(errorMessage(error));
  }
});
root.addEventListener('change', event => {
  const node = event.target as HTMLSelectElement;
  if (node.id === 'asset-select') { const asset = findAsset(node.value); if (asset) { selected = asset; updateMarket(); } }
  if (node.id === 'funding-status') { list().status = node.value; resetList(); void render(); }
});
root.addEventListener('input', event => {
  const form = (event.target as Element).closest<HTMLFormElement>('form');
  if (form) delete form.dataset.operationId;
});
function confirmTrade(values: Record<string, FormDataEntryValue>, direction: string) {
  const stake = cents(values.amount), expiry = Number(values.duration);
  dialog('Confirm simulated trade', definition([['Asset', selected.code + '/USDT'], ['Direction', label(direction)], ['Stake', credits(stake) + ' Practice Credits'],
    ['Expiry', expiry + ' seconds'], ['Profit on a win', credits(Math.round(stake * profitPercent / 100)) + ' Practice Credits']]) +
    '<form class="stack" data-form="trade.place"><input type="hidden" name="symbol" value="' + selected.symbol + '"><input type="hidden" name="duration" value="' + expiry +
    '"><input type="hidden" name="amount" value="' + esc(values.amount) + '"><input type="hidden" name="direction" value="' + esc(direction) +
    '"><button class="button">Place simulated trade</button>' + formStatus() + '</form>');
}
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
  if (op === 'prepare-trade') { confirmTrade(values, ((event as SubmitEvent).submitter as HTMLButtonElement | null)?.value || 'up'); return; }
  const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button')).filter(button => !button.disabled);
  form.dataset.busy = 'true';
  buttons.forEach(button => { button.disabled = true; });
  showFormStatus(form, 'Working…');
  const started = version;
  try {
    if (await accountForm(op, values, form)) return;
    if (op === 'search') { list().search = String(values.search || ''); resetList(); await render(); return; }
    const params: Record<string, unknown> = { ...values, requestId: form.dataset.operationId ||= crypto.randomUUID() };
    if ('amount' in params) params.amount = cents(params.amount);
    if ('duration' in params) params.duration = Number(params.duration);
    if (op === 'admin.client.restrict') { params.tradeEnabled = values.tradeEnabled === 'on'; params.withdrawalEnabled = values.withdrawalEnabled === 'on'; }
    await api.call(op, params);
    if (started !== version) return;
    panel().close(); delete form.dataset.operationId;
    if (!admin) { const updated = await api.call<Home>('home'); if (started === version) setHome(updated); }
    if (started !== version) return;
    if (op === 'admin.funding.decide' && route !== 'overview') resetList();
    await render();
    toast(op === 'trade.place' ? 'Simulated trade placed.' : op.endsWith('message.send') ? 'Message sent.' : 'Changes saved.');
  } catch (error) { showFormStatus(form, errorMessage(error)); }
  finally { delete form.dataset.busy; buttons.forEach(button => { button.disabled = false; }); }
});
window.addEventListener('hashchange', () => void render());
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  if (access) void render();
  else if (guestMarket) void attachPublicChart('#market-chart', '#feed-status', true);
  else if (!admin) void attachPublicChart('#login-chart', '#login-chart-status', false);
});
void start();
