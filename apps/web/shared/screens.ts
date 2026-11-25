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
export const adminNavGroups = [
  { name: 'Overview', links: [['overview', '◈', 'Dashboard', ''], ['clients', '◉', 'My Clients', '']] },
  { name: 'Operations', links: [['deposits', '↓', 'Deposits', 'finance'], ['withdrawals', '↑', 'Withdrawals', 'finance'],
    ['trades', '⟳', 'Live Trades', 'admin']] },
  { name: 'Records', links: [['audit', '◧', 'Audit log', 'admin']] },
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
