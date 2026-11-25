import logoUrl from '../assets/qoption-logo.png';
import { actionButton, amountField, blank, credits, dateTime, esc, formStatus, label, recordReference, section, state, table, type Row, type Wallet } from './view';

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
  chat: svgIcon('<path d="M2.678 11.894a1 1 0 0 1 .287.801 11 11 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8 8 0 0 0 8 14c4.02 0 7-2.805 7-6s-2.98-6-7-6-7 2.806-7 6c0 1.468.617 2.83 1.678 3.894M2.19 15.8a22 22 0 0 1-.713.128c-.2.032-.352-.176-.273-.362a9 9 0 0 0 .641-2.083q.075-.421.124-.884C.742 11.369 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9 9 0 0 1-2.35-.307c-.52.263-1.639.742-3.46 1.107"/><path d="M4 8a1 1 0 1 1 2 0 1 1 0 0 1-2 0m3 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0m3 0a1 1 0 1 1 2 0 1 1 0 0 1-2 0"/>', 15),
  report: svgIcon('<path d="M14 14V4.5L9.5 0H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2M9.5 3A1.5 1.5 0 0 0 11 4.5h2V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h5.5z"/><path d="M4.603 14.087a.8.8 0 0 1-.438-.42c-.195-.388-.13-.776.08-1.102.198-.307.526-.568.897-.787a7.7 7.7 0 0 1 1.482-.645 20 20 0 0 0 1.062-2.227 7.3 7.3 0 0 1-.43-1.295c-.086-.4-.119-.796-.046-1.136.075-.354.274-.672.65-.823.192-.077.4-.12.602-.077a.7.7 0 0 1 .477.365c.088.164.12.356.127.538.007.188-.012.396-.047.614-.084.51-.27 1.134-.52 1.794a11 11 0 0 0 .98 1.686 5.8 5.8 0 0 1 1.334.05c.364.066.734.195.96.465.12.144.193.32.2.518.007.192-.047.382-.138.563a1.04 1.04 0 0 1-.354.416.86.86 0 0 1-.51.138c-.331-.014-.654-.196-.933-.417a5.7 5.7 0 0 1-.911-.95 11.7 11.7 0 0 0-1.997.406 11.3 11.3 0 0 1-1.02 1.51c-.292.35-.609.656-.927.787a.8.8 0 0 1-.58.029"/>', 15),
  wallet: svgIcon('<path d="M12.136.326A1.5 1.5 0 0 1 14 1.78V3h.5A1.5 1.5 0 0 1 16 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 13.5v-9a1.5 1.5 0 0 1 1.432-1.499zM5.562 3H13V1.78a.5.5 0 0 0-.621-.484zM1.5 4a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5z"/>', 15),
  bell: svgIcon('<path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2m.995-14.901a1 1 0 1 0-1.99 0A5 5 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901"/>', 15),
  edit: svgIcon('<path d="m13.498.795.149-.149a1.207 1.207 0 1 1 1.707 1.708l-.149.148a1.5 1.5 0 0 1-.059 2.059L4.854 14.854a.5.5 0 0 1-.233.131l-4 1a.5.5 0 0 1-.606-.606l1-4a.5.5 0 0 1 .131-.232l9.642-9.642a.5.5 0 0 0-.642.056L6.854 4.854a.5.5 0 1 1-.708-.708L9.44.854A1.5 1.5 0 0 1 11.5.796a1.5 1.5 0 0 1 1.998-.001"/>', 14),
  qrCode: svgIcon('<path d="M2 2h2v2H2z"/><path d="M6 0v6H0V0zM5 1H1v4h4zM4 12H2v2h2z"/><path d="M6 10v6H0v-6zm-5 1v4h4v-4zm11-9h2v2h-2z"/><path d="M10 0v6h6V0zm5 1v4h-4V1zM8 1V0h1v2H8v2H7V1zm0 5V4h1v2zM6 8V7h1V6h1v2h1V7h5v1h-4v1H7V8zm0 0v1H2V8H1v1H0V7h3v1zm10 1h-1V7h1zm-1 0h-1v2h2v-1h-1zm-4 0h2v1h-1v1h-1zm2 3v-1h-1v1h-1v1H9v1h3v-2zm0 0h3v1h-2v1h-1zm-4-1v1h1v-2H7v1z"/><path d="M7 12h1v3h4v1H7zm9 2v2h-3v-1h2v-1z"/>', 15),
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
export const pair = (value: unknown) => esc(String(value || '').replace(/USDT$/, '/USDT'));
export const chartFrames = ['1m', '5m', '15m', '1h', '4h', '1d'];
export const brandContent = '<img class="brand-logo" src="' + logoUrl + '" width="40" height="40" alt=""><span class="brand-wordmark">Option</span>';
export const brand = '<div class="brand" role="img" aria-label="Qoption">' + brandContent + '</div>';

export function title(name: string, description: string, badge = '') {
  return '<div class="page-title"><div><h1>' + esc(name) + '</h1><p>' + esc(description) + '</p></div>' + (badge ? '<span class="pill practice">' + esc(badge) + '</span>' : '') + '</div>';
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
  const forms = ['deposit', 'withdrawal'].map(kind => section(kind === 'deposit' ? 'Deposit request' : 'Withdrawal request',
    '<div class="panel-body"><form class="stack" data-form="funding.request"><input type="hidden" name="kind" value="' + kind + '">' +
    amountField('25') + '<button class="button" ' + (kind === 'withdrawal' && !withdrawalEnabled ? 'disabled' : '') + '>Submit ' + kind + '</button>' +
    (kind === 'withdrawal' && !withdrawalEnabled ? '<p class="error">Withdrawals are paused for this account.</p>' : '') +
    formStatus() + '</form></div>', kind === 'deposit' ? 'Funds are credited after staff review.' : 'Funds are held until the request is decided.'));
  return '<div class="asset-strip workspace-wallet-balances"><div class="metric"><small>Available balance</small><strong>' + credits(balance.available) + '</strong></div>' +
    '<div class="metric"><small>Balance on hold</small><strong>' + credits(balance.held) + '</strong></div></div><div class="two-panels">' + forms.join('') + '</div>';
}

export function messageThread(rows: Row[], uid = '') {
  return rows.length ? '<div class="messages">' + [...rows].reverse().map(row => '<div class="message"><small>' + esc(uid && row.sender === 'You' ? 'Client' : row.sender) +
    ' · ' + dateTime(row.createdAt) + '</small><p>' + esc(row.id === 'demo-welcome' && row.sender === 'Support' && row.message === 'Welcome to your demo workspace. Contact us here if you need help exploring it.'
      ? 'Welcome to your trading workspace. Contact us here if you need support.' : row.message) + '</p></div>').join('') + '</div>' : blank('No messages yet', 'Start a conversation below.');
}

export function messages(rows: Row[], uid = '') {
  return '<div id="client-message-thread" role="log" aria-label="Support conversation">' + messageThread(rows, uid) + '</div>' +
    '<div class="panel-body"><form class="stack" data-form="' + (uid ? 'admin.message.send' : 'message.send') + '">' +
    (uid ? '<input type="hidden" name="uid" value="' + esc(uid) + '">' : '') +
    '<label>Message<textarea name="message" maxlength="1000" required></textarea></label><div><button class="button">Send message</button></div>' + formStatus() + '</form></div>';
}
