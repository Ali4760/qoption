import logoUrl from '../assets/qoption-logo.png';
import type { ChartMode } from './canvas-chart';
import { assets, demoPrice, durations, profitPercent, type Asset } from '../../../functions/src/market';
import { actionButton, amountField, blank, credits, dateTime, esc, formStatus, label, recordReference, section, state, table, type Home, type Row, type Wallet } from './view';

export const userNavGroups = [
  { name: 'Markets', links: [['trade', '⌁', 'Trade'], ['assets', '◈', 'Assets']] },
  { name: 'Activity', links: [['wallet', '▣', 'Wallet'], ['transactions', '≡', 'Transaction history'],
    ['history', '◷', 'Trade history'], ['notifications', '◉', 'Notifications'], ['leaderboard', '♜', 'Leaderboard']] },
  { name: 'Account', links: [['messages', '▤', 'Messages'], ['settings', '⚙', 'Settings']] },
];
export const userNav = userNavGroups.flatMap(group => group.links);
const svgIcon = (path: string, size = 18) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">' + path + '</svg>';

// Bootstrap Icons paths matching Q-Option admin panel
const navIcons = {
  dashboard: svgIcon('<path d="M0 1a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1zm0 9a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1z"/>'),
  clients: svgIcon('<path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1zM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/>'),
  withdrawals: svgIcon('<path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v2h6a.5.5 0 0 1 .5.5c0 .253.08.644.306.958.207.288.557.542 1.194.542s.987-.254 1.194-.542C9.42 6.644 9.5 6.253 9.5 6a.5.5 0 0 1 .5-.5h6v-2A1.5 1.5 0 0 0 14.5 2z"/><path d="M16 6.5h-5.551a2.7 2.7 0 0 1-.443 1.042C9.613 8.088 8.963 8.5 8 8.5s-1.613-.412-2.006-.958A2.7 2.7 0 0 1 5.551 6.5H0v6A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5z"/>'),
  deposits: svgIcon('<path d="M1 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1zm7 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4"/><path d="M0 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1zm3 0a2 2 0 0 1-2 2v4a2 2 0 0 1 2 2h10a2 2 0 0 1 2-2V7a2 2 0 0 1-2-2z"/>'),
  trades: svgIcon('<path fill-rule="evenodd" d="M0 0h1v15h15v1H0zm14.817 3.113a.5.5 0 0 1 .07.704l-4.5 5.5a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61 4.15-5.073a.5.5 0 0 1 .704-.07"/>'),
  audit: svgIcon('<path d="M5 10.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5"/><path d="M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2"/><path d="M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0V8h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1z"/>'),
  logout: svgIcon('<path fill-rule="evenodd" d="M6 12.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5v2a.5.5 0 0 1-1 0v-2A1.5 1.5 0 0 1 6.5 2h8A1.5 1.5 0 0 1 16 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 12.5v-2a.5.5 0 0 1 1 0z"/><path fill-rule="evenodd" d="M.146 8.354a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L1.707 7.5H10.5a.5.5 0 0 1 0 1H1.707l2.147 2.146a.5.5 0 0 1-.708.708z"/>'),
};

export const adminActionIcons = {
  report: svgIcon('<path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2M9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z"/><path d="M4.603 14.087a.8.8 0 0 1-.438-.42c-.195-.388-.13-.776.08-1.102.198-.307.526-.568.897-.787a7.7 7.7 0 0 1 1.482-.645 20 20 0 0 0 1.062-2.227 7.3 7.3 0 0 1-.43-1.295c-.086-.4-.119-.796-.046-1.136.075-.354.274-.672.65-.823.192-.077.4-.12.602-.077a.7.7 0 0 1 .477.365c.088.164.12.356.127.538.007.188-.012.396-.047.614-.084.51-.27 1.134-.52 1.794a11 11 0 0 0 .98 1.686 5.8 5.8 0 0 1 1.334.05c.364.066.734.195.96.465.12.144.193.32.2.518.007.192-.047.382-.138.563a1.04 1.04 0 0 1-.354.416.86.86 0 0 1-.51.138c-.331-.014-.654-.196-.933-.417a5.7 5.7 0 0 1-.911-.95 11.7 11.7 0 0 0-1.997.406 11.3 11.3 0 0 1-1.02 1.51c-.292.35-.609.656-.927.787a.8.8 0 0 1-.58.029"/>', 15),
  wallet: svgIcon('<path d="M12.136.326A1.5 1.5 0 0 1 14 1.78V3h.5A1.5 1.5 0 0 1 16 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 13.5v-9a1.5 1.5 0 0 1 1.432-1.499zM5.562 3H13V1.78a.5.5 0 0 0-.621-.484zM1.5 4a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5z"/>', 15),
  bell: svgIcon('<path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2m.995-14.901a1 1 0 1 0-1.99 0A5 5 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901"/>', 15),
  edit: svgIcon('<path d="m13.498.795.149-.149a1.207 1.207 0 1 1 1.707 1.708l-.149.148a1.5 1.5 0 0 1-.059 2.059L4.854 14.854a.5.5 0 0 1-.233.131l-4 1a.5.5 0 0 1-.606-.606l1-4a.5.5 0 0 1 .131-.232l9.642-9.642a.5.5 0 0 0-.642.056L6.854 4.854a.5.5 0 1 1-.708-.708L9.44.854A1.5 1.5 0 0 1 11.5.796a1.5 1.5 0 0 1 1.998-.001"/>', 14),
  trash: svgIcon('<path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>', 14),
  refresh: svgIcon('<path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/>', 15),
  copy: svgIcon('<path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"/>', 15),
  eye: svgIcon('<path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8M1.173 8a13 13 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5s3.879 1.168 5.168 2.457A13 13 0 0 1 14.828 8q-.086.13-.195.288c-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5s-3.879-1.168-5.168-2.457A13 13 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0"/>', 15),
};

export const adminLogoutIcon = navIcons.logout;

export const adminNavGroups = [
  { name: 'Menu', links: [
    ['overview', navIcons.dashboard, 'Dashboard', ''],
    ['clients', navIcons.clients, 'My Clients', ''],
    ['withdrawals', navIcons.withdrawals, 'Withdrawals', 'finance'],
    ['deposits', navIcons.deposits, 'Deposits', 'finance'],
    ['trades', navIcons.trades, 'Live Trades', 'admin'],
    ['audit', navIcons.audit, 'Audit log', 'admin'],
  ] },
];
export const adminNav = adminNavGroups.flatMap(group => group.links);
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
export const pair = (value: unknown) => esc(String(value || '').replace(/USDT$/, '/USDT'));
export const coin = (asset: Asset) => '<span class="coin" style="--coin:' + asset.color + '" aria-hidden="true">' + asset.code + '</span>';
export const chartFrames = ['1m', '5m', '15m', '1h', '4h', '1d'];
export const chartModes: Record<ChartMode, string> = { line: 'Line', candles: 'Candles', combined: 'Candles + line' };
export const brandContent = '<img class="brand-logo" src="' + logoUrl + '" width="40" height="40" alt=""><span class="brand-wordmark">Option</span>';
export const brand = '<div class="brand" role="img" aria-label="Qoption">' + brandContent + '</div>';

export function title(name: string, description: string, badge = '') {
  return '<div class="page-title"><div><h1>' + esc(name) + '</h1><p>' + esc(description) + '</p></div>' + (badge ? '<span class="pill practice">' + esc(badge) + '</span>' : '') + '</div>';
}

export function marketScreen(selected: Asset, frame: string, home?: Home, liveMode?: ChartMode) {
  const trading = !!home;
  const sidebar = trading ? '<section class="panel ticket"><header class="panel-heading"><div><h2>Order ticket</h2><p id="ticket-pair">' + pair(selected.symbol) + '</p></div><span class="pill">Practice</span></header>' +
    '<div class="panel-body"><form data-form="prepare-trade">' + amountField() +
    '<label>Expiry<select name="duration">' + durations.map(duration => '<option value="' + duration + '">' + (duration < 60 ? duration + ' sec' : duration / 60 + ' min') + '</option>').join('') + '</select></label>' +
    '<div class="return"><span>Profit on a win</span><strong>+' + profitPercent + '%</strong></div><div class="actions">' +
    '<button class="button up" name="direction" value="up" ' + (!home.profile.tradeEnabled ? 'disabled' : '') + '>↗ Higher</button>' +
    '<button class="button down" name="direction" value="down" ' + (!home.profile.tradeEnabled ? 'disabled' : '') + '>↘ Lower</button></div>' +
    (!home.profile.tradeEnabled ? '<p class="error">Trading is paused for this account.</p>' : '') +
    formStatus() + '</form></div></section>' : '';
  const tiles = assets.slice(0, trading ? 4 : 6).map(asset => '<button class="asset-tile" aria-pressed="' + (asset.symbol === selected.symbol) + '" data-action="asset" data-id="' + asset.symbol + '">' +
    coin(asset) + '<span class="asset-copy"><strong>' + asset.name + '</strong><small>' + asset.code + '/USDT</small></span></button>').join('');
  const watchlist = liveMode ? '<section class="panel workspace-watchlist"><header class="panel-heading"><h2>Watchlist</h2><p>Choose a pair to update the chart.</p></header>' +
    '<div class="workspace-asset-list">' + tiles + '</div></section>' : '';
  const viewModes = liveMode ? '<div class="workspace-chart-modes"><div class="frames" role="group" aria-label="Chart type">' +
    Object.entries(chartModes).map(([mode, caption]) => '<button type="button" data-action="chart-mode" data-id="' + mode + '" aria-pressed="' +
      String(mode === liveMode) + '">' + caption + '</button>').join('') + '</div></div>' : '';

  return title(trading ? 'Trading workspace' : 'Market assets', trading ? 'Follow the chart and place orders with virtual funds.' : 'Follow live crypto prices and compare chart types.', trading ? 'Virtual funds' : 'Live market data') +
    (liveMode ? '' : '<div class="asset-strip' + (trading ? ' workspace-pairs' : '') + '">' + tiles + '</div>') +
    '<div class="' + (trading || liveMode ? 'trade-grid' : '') + '">' +
    '<section class="panel market-panel"><header class="chart-head"><div class="chart-market" id="chart-market">' + coin(selected) +
    '<div><h2>' + pair(selected.symbol) + '</h2><small>' + selected.name + '</small></div></div>' +
    '<div class="chart-quote"><span id="market-price">' + (trading ? number.format(demoPrice(selected, Date.now())) : '—') + '</span><small>USDT</small></div></header>' +
    '<div class="chart-tools"><div class="frames" aria-label="Chart timeframe">' + chartFrames.map(duration => '<button type="button" aria-pressed="' + (frame === duration) + '" data-action="frame" data-id="' + duration + '">' + duration.toUpperCase() + '</button>').join('') + '</div>' +
    '<label class="chart-market"><span>Asset</span><select id="asset-select" aria-label="Chart asset">' + assets.map(asset => '<option value="' + asset.symbol + '"' + (asset.symbol === selected.symbol ? ' selected' : '') + '>' + asset.code + '/USDT</option>').join('') + '</select></label></div>' + viewModes +
    '<canvas id="market-chart" class="chart" aria-label="Price chart. The latest price is shown above."></canvas>' +
    '<footer class="chart-footer"><span id="feed-status">' + (trading ? 'Simulated feed' : 'Connecting…') + '</span><span>' + (trading ? 'USDT · Simulated execution' : 'USDT · Read-only') + '</span></footer></section>' +
    sidebar + watchlist + '</div>' + (trading ? '<div class="dashboard-lower">' + section('Open positions', '<div id="open-trades">' + openTrades(home.active, home.serverTime) + '</div>') + '</div>' : '');
}

export function openTrades(rows: Row[], now: number) {
  return table(['Asset', 'Direction', 'Stake', 'Entry price', 'Time left'], rows.map(row => [
    '<strong>' + pair(row.symbol) + '</strong>', state(row.direction), credits(row.stake), number.format(Number(row.entry)),
    '<span data-due="' + esc(row.dueAt) + '">' + Math.max(0, Math.ceil((Number(row.dueAt) - now) / 1000)) + 's</span>',
  ]), 'No open positions');
}

export function tradeRows(rows: Row[], staff = false) {
  return table(staff ? ['Asset', 'Client ID', 'Direction', 'Stake', 'Opened', 'Result', ''] : ['Asset', 'Direction', 'Stake', 'Opened', 'Result', 'P/L', ''],
    rows.map(row => [
      '<strong>' + pair(row.symbol) + '</strong>', ...(staff ? [esc(recordReference(row.uid))] : []), state(row.direction), credits(row.stake), dateTime(row.createdAt),
      state(row.outcome || row.status), ...(!staff ? [row.pnl === undefined ? '—' : '<span class="' + (Number(row.pnl) < 0 ? 'neg' : 'pos') + '">' + credits(row.pnl) + '</span>'] : []),
      actionButton('trade-detail', row.id, 'Details'),
    ]), 'No trades found');
}

export function ledgerRows(rows: Row[]) {
  return table(['Entry', 'Available change', 'Hold change', 'Date'], rows.map(row => [
    esc(label(row.kind)), credits(row.availableDelta), credits(row.heldDelta), dateTime(row.createdAt),
  ]), 'No wallet activity');
}

export function fundingRows(rows: Row[], staff = false) {
  return table(staff ? ['Client ID', 'Amount', 'Requested', 'Status', ''] : ['Type', 'Amount', 'Requested', 'Status', ''],
    rows.map(row => [
      staff ? esc(recordReference(row.uid)) : esc(label(row.kind)), credits(row.amount), dateTime(row.createdAt), state(row.status),
      actionButton(staff && row.status === 'pending' ? 'review-funding' : 'funding-detail', row.id, staff && row.status === 'pending' ? 'Review' : 'Details'),
    ]), 'No funding requests');
}

export function walletForms(balance: Wallet, withdrawalEnabled: boolean) {
  const forms = ['deposit', 'withdrawal'].map(kind => section(kind === 'deposit' ? 'Simulated deposit' : 'Simulated withdrawal',
    '<div class="panel-body"><form class="stack" data-form="funding.request"><input type="hidden" name="kind" value="' + kind + '">' +
    amountField('25') + '<button class="button" ' + (kind === 'withdrawal' && !withdrawalEnabled ? 'disabled' : '') + '>Submit ' + kind + '</button>' +
    (kind === 'withdrawal' && !withdrawalEnabled ? '<p class="error">Withdrawals are paused for this account.</p>' : '') +
    formStatus() + '</form></div>', kind === 'deposit' ? 'Credits are added after staff review.' : 'Credits are held until the request is decided.'));
  return '<div class="asset-strip workspace-wallet-balances"><div class="metric"><small>Available credits</small><strong>' + credits(balance.available) + '</strong></div>' +
    '<div class="metric"><small>Credits on hold</small><strong>' + credits(balance.held) + '</strong></div></div><div class="two-panels">' + forms.join('') + '</div>';
}

export function messages(rows: Row[], uid = '') {
  const thread = rows.length ? '<div class="messages">' + [...rows].reverse().map(row => '<div class="message"><small>' + esc(row.sender) +
    ' · ' + dateTime(row.createdAt) + '</small><p>' + esc(row.id === 'demo-welcome' && row.sender === 'Support' && row.message === 'Welcome to your demo workspace. Contact us here if you need help exploring it.'
      ? 'Welcome to your practice workspace. Contact us here if you need help exploring it.' : row.message) + '</p></div>').join('') + '</div>' : blank('No messages yet', 'Start a conversation below.');
  return thread + '<div class="panel-body"><form class="stack" data-form="' + (uid ? 'admin.message.send' : 'message.send') + '">' +
    (uid ? '<input type="hidden" name="uid" value="' + esc(uid) + '">' : '') +
    '<label>Message<textarea name="message" maxlength="1000" required></textarea></label><div><button class="button">Send message</button></div>' + formStatus() + '</form></div>';
}
