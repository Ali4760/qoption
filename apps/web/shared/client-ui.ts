import logoUrl from '../assets/qoption-logo.png';
import { assets, demoPrice, findAsset, type Asset } from '../../../functions/src/market';
import { dateTime, errorMessage, esc, type Home, type Page, type Row } from './view';

const bi = (paths: string, size = 18) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`;

// Real coin icons as SVG, keyed by coin code
const coinIconSvg: Record<string, string> = {
  BTC: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="20" height="20" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#f7931a"/><path fill="#fff" d="M22.6 14.2c.3-2.1-1.3-3.2-3.5-4l.7-2.8-1.7-.4-.7 2.7c-.5-.1-.9-.2-1.4-.3l.7-2.7-1.7-.4-.7 2.8c-.4-.1-.8-.2-1.2-.3l-2.3-.6-.4 1.8s1.3.3 1.2.3c.7.2.8.6.8 1l-.8 3.3c0 .1.1.1.1.2h-.2l-1.1 4.5c-.1.2-.3.6-.8.4 0 0-1.2-.3-1.2-.3l-.8 2 2.2.5 1.2.3-.7 2.8 1.7.4.7-2.8c.5.1 1 .3 1.4.4l-.7 2.7 1.7.4.7-2.8c2.9.5 5 .3 5.9-2.3.7-2-.1-3.2-1.5-3.9 1.1-.2 1.9-1 2.1-2.5zm-3.8 5.3c-.5 2-3.9.9-5 .6l.9-3.5c1.1.3 4.6.9 4.1 2.9zm.5-5.4c-.5 1.8-3.4.9-4.3.7l.8-3.2c.9.2 3.9.7 3.5 2.5z"/></svg>`,
  BTS: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="20" height="20" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#35baeb"/><text x="16" y="21" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff" font-family="sans-serif">BTS</text></svg>`,
};

export function coinIcon(code: string, color: string, size = 20): string {
  if (coinIconSvg[code]) return `<span class="asset-pill-icon">${coinIconSvg[code]}</span>`;
  // Generic: colored circle with first 2 letters
  const label = code.slice(0, 2);
  return `<span class="asset-pill-dot" style="background:${color};font-size:9px;font-weight:700;width:${size}px;height:${size}px;">${label}</span>`;
}

export const clientIcons = {
  menu: bi('<path fill-rule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"/>', 20),
  trade: bi('<path fill-rule="evenodd" d="M0 0h1v15h15v1H0zm14.817 3.113a.5.5 0 0 1 .07.704l-4.5 5.5a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61 4.15-5.073a.5.5 0 0 1 .704-.07"/>'),
  tradeArrow: bi('<path fill-rule="evenodd" d="M0 0h1v15h15v1H0zm10 3.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V4.9l-3.613 4.417a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61L13.445 4H10.5a.5.5 0 0 1-.5-.5"/>'),
  wallet: bi('<path d="M12.136.326A1.5 1.5 0 0 1 14 1.78V3h.5A1.5 1.5 0 0 1 16 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 13.5v-9a1.5 1.5 0 0 1 1.432-1.499zM5.562 3H13V1.78a.5.5 0 0 0-.621-.484zM1.5 4a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5z"/>'),
  history: bi('<path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z"/><path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z"/><path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5"/>'),
  journal: bi('<path d="M5 10.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5"/><path d="M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-1h1v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v1H1V2a2 2 0 0 1 2-2"/><path d="M1 5v-.5a.5.5 0 0 1 1 0V5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0V8h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1zm0 3v-.5a.5.5 0 0 1 1 0v.5h.5a.5.5 0 0 1 0 1h-2a.5.5 0 0 1 0-1z"/>'),
  trophy: bi('<path d="M2.5.5A.5.5 0 0 1 3 0h10a.5.5 0 0 1 .5.5q0 .807-.034 1.536a3 3 0 1 1-1.133 5.89c-.79 1.865-1.878 2.777-2.833 3.011v2.173l1.425.356c.194.048.377.135.537.255L13.3 15.1a.5.5 0 0 1-.3.9H3a.5.5 0 0 1-.3-.9l1.838-1.379c.16-.12.343-.207.537-.255L6.5 13.11v-2.173c-.955-.234-2.043-1.146-2.833-3.012a3 3 0 1 1-1.132-5.89A33 33 0 0 1 2.5.5m.099 2.54a2 2 0 0 0 .72 3.935c-.333-1.05-.588-2.346-.72-3.935m10.083 3.935a2 2 0 0 0 .72-3.935c-.133 1.59-.388 2.885-.72 3.935"/>'),
  settings: bi('<path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0M8 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m.256 7a4.5 4.5 0 0 1-.229-1.004H3c.001-.246.154-.986.832-1.664C4.484 10.68 5.711 10 8 10q.39 0 .74.025c.226-.341.496-.65.804-.918Q8.844 9.002 8 9c-5 0-6 3-6 4s1 1 1 1zm3.63-4.54c.18-.613 1.048-.613 1.229 0l.043.148a.64.64 0 0 0 .921.382l.136-.074c.561-.306 1.175.308.87.869l-.075.136a.64.64 0 0 0 .382.92l.149.045c.612.18.612 1.048 0 1.229l-.15.043a.64.64 0 0 0-.38.921l.074.136c.305.561-.309 1.175-.87.87l-.136-.075a.64.64 0 0 0-.92.382l-.045.149c-.18.612-1.048.612-1.229 0l-.043-.15a.64.64 0 0 0-.921-.38l-.136.074c-.561.305-1.175-.309-.87-.87l.075-.136a.64.64 0 0 0-.382-.92l-.148-.045c-.613-.18-.613-1.048 0-1.229l.148-.043a.64.64 0 0 0 .382-.921l-.074-.136c-.306-.561.308-1.175.869-.87l.136.075a.64.64 0 0 0 .92-.382zM14 12.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0"/>'),
  logout: bi('<path fill-rule="evenodd" d="M6 12.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5v2a.5.5 0 0 1-1 0v-2A1.5 1.5 0 0 1 6.5 2h8A1.5 1.5 0 0 1 16 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 12.5v-2a.5.5 0 0 1 1 0z"/><path fill-rule="evenodd" d="M.146 8.354a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L1.707 7.5H10.5a.5.5 0 0 1 0 1H1.707l2.147 2.146a.5.5 0 0 1-.708.708z"/>'),
  chat: bi('<path d="M16 2a2 2 0 0 0-2-2H2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5a1 1 0 0 1 .8.4l1.9 2.533a1 1 0 0 0 1.6 0l1.9-2.533a1 1 0 0 1 .8-.4H14a2 2 0 0 0 2-2zM3.5 3h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1m0 2.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1m0 2.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1 0-1"/>', 17),
  bell: bi('<path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2m.995-14.901a1 1 0 1 0-1.99 0A5 5 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7 0-2.42-1.72-4.44-4.005-4.901"/>', 17),
  personCircle: bi('<path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/><path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1"/>', 19),
  personFill: bi('<path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>', 30),
  chevronDown: bi('<path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708"/>', 11),
  dash: bi('<path fill-rule="evenodd" d="M2 8a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 8"/>', 15),
  plus: bi('<path fill-rule="evenodd" d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2"/>', 15),
  clock: bi('<path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/>', 15),
  upRight: bi('<path fill-rule="evenodd" d="M14 2.5a.5.5 0 0 0-.5-.5h-6a.5.5 0 0 0 0 1h4.793L2.146 13.146a.5.5 0 0 0 .708.708L13 3.707V8.5a.5.5 0 0 0 1 0z"/>', 18),
  downRight: bi('<path fill-rule="evenodd" d="M14 13.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1 0-1h4.793L2.146 2.854a.5.5 0 1 1 .708-.708L13 12.293V7.5a.5.5 0 0 1 1 0z"/>', 18),
  clipboard: bi('<path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0z"/>', 15),
  headset: bi('<path d="M8 1a5 5 0 0 0-5 5v1h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a6 6 0 1 1 12 0v6a2.5 2.5 0 0 1-2.5 2.5H9.366a1 1 0 0 1-.866.5h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 .866.5H11.5A1.5 1.5 0 0 0 13 12h-1a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1V6a5 5 0 0 0-5-5"/>', 15),
  search: bi('<path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0"/>', 14),
  download: bi('<path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z"/>', 14),
  close: bi('<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>', 14),
  send: bi('<path d="M15.964.686a.5.5 0 0 0-.65-.65L.767 5.855H.766l-.452.18a.5.5 0 0 0-.082.887l.41.26.001.002 4.995 3.178 3.178 4.995.002.002.26.41a.5.5 0 0 0 .886-.083zm-1.833 1.89L6.637 10.07l-.215-.338a.5.5 0 0 0-.154-.154l-.338-.215 7.494-7.494 1.178-.471z"/>', 14),
};

const DEFAULT_QR_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAACWAQMAAAAGz+OhAAAABlBMVEX///8AAABVwtN+AAAACXBIWXMAAA7EAAAOxAGVKw4bAAABI0lEQVRIib2WOxLCMAxElaFw6SP4KFyMyedmOYqPkNKFJ2IlAQMMJV4NRfxSRKxWkkV+xKKIXfKudWrFDu3v7Ibv5L3nPeFUVpGJxLIC4EWTWcqmujEZZNAqfHY5JJn2ROba63HV73qMZeE1pINEPv03lkVcVNE+zxODIZeeFRrgOdUZPw6D9gA9etpsvnLYS/ukp+XyUY+BTLLC4B0Z1eWRDoUtJoCl08rpY+z8P4POXa56IINJrbhCY/jLwC75murSaMytJaYBTBV+JjAzc/SvWSzm5HgW4asBTp7cWgz26CMMDWSBUWlTi8FiL6CVPIvoIwqL/XtILIX3nUxgfuXAsNrUPU5jXnAsBbtykJhrDyZFv+4CQ1l4zZhVe7Y3FPYj7rc4qAKiTHuaAAAAAElFTkSuQmCC';

const currencySymbols: Record<string, string> = {
  INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ',
};
export const curSym = (home?: Home) => currencySymbols[String(home?.profile.currency || 'INR')] || '₹';
export const fmtMoney = (centsVal: unknown, home?: Home) => {
  const n = Number(centsVal ?? 0) / 100;
  return (n < 0 ? '-' : '') + curSym(home) + Math.abs(n).toFixed(2);
};
export const fmtSignedMoney = (centsVal: unknown, home?: Home) => {
  const n = Number(centsVal ?? 0) / 100;
  return (n >= 0 ? '+' : '-') + curSym(home) + Math.abs(n).toFixed(2);
};
export const formatPair = (sym: string) => sym.replace(/USDT$/, '/USD');
export const formatDurationLabel = (sec: number) => sec >= 300 && sec % 60 === 0 ? `${sec / 60} min` : `${sec} sec`;

export const durationChoices = [
  { sec: 60, label: '60 sec', longLabel: '60 Seconds', profit: 50 },
  { sec: 120, label: '120 sec', longLabel: '120 Seconds', profit: 40 },
  { sec: 180, label: '180 sec', longLabel: '180 Seconds', profit: 30 },
  { sec: 300, label: '5 min', longLabel: '5 Minutes', profit: 10 },
];

type CountryField = [string, string, 'text' | 'select', string | string[]];
export const withdrawalCountryFields: Record<string, CountryField[]> = {
  India: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['account_number', 'Account Number', 'text', 'Account Number'],
    ['ifsc_swift', 'IFSC Code', 'text', '11-character IFSC code'],
  ],
  'United States': [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['account_number', 'Account Number', 'text', 'Account Number'],
    ['routing_number', 'ABA Routing Number', 'text', '9-digit routing number'],
    ['account_type', 'Account Type', 'select', ['Checking', 'Savings']],
  ],
  'United Kingdom': [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['account_number', 'Account Number', 'text', '8-digit account number'],
    ['sort_code', 'Sort Code', 'text', '6-digit sort code'],
  ],
  Eurozone: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['iban', 'IBAN', 'text', 'IBAN'],
    ['swift_bic', 'SWIFT / BIC', 'text', '8 or 11-character BIC'],
  ],
  Australia: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['account_number', 'Account Number', 'text', 'Account Number'],
    ['bsb_code', 'BSB Number', 'text', '6-digit BSB'],
  ],
  Canada: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['account_number', 'Account Number', 'text', 'Account Number'],
    ['transit_number', 'Transit Number', 'text', '5-digit transit number'],
    ['institution_number', 'Institution Number', 'text', '3-digit institution number'],
  ],
  Singapore: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['account_number', 'Account Number', 'text', 'Account Number'],
    ['bank_code', 'Bank Code', 'text', 'Bank Code'],
    ['branch_code', 'Branch Code', 'text', 'Branch Code'],
  ],
  'Hong Kong': [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['account_number', 'Account Number', 'text', 'Account Number'],
    ['bank_code', 'Bank Code', 'text', '3-digit bank code'],
    ['branch_code', 'Branch Code', 'text', '3-digit branch code'],
  ],
  'United Arab Emirates': [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['iban', 'IBAN', 'text', 'UAE IBAN (starts with AE)'],
    ['swift_bic', 'SWIFT / BIC', 'text', '8 or 11-character BIC'],
  ],
  Germany: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['iban', 'IBAN', 'text', 'German IBAN (starts with DE)'],
    ['swift_bic', 'SWIFT / BIC', 'text', '8 or 11-character BIC'],
  ],
  France: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['iban', 'IBAN', 'text', 'French IBAN (starts with FR)'],
    ['swift_bic', 'SWIFT / BIC', 'text', '8 or 11-character BIC'],
  ],
  Japan: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Account holder name'],
    ['branch_name', 'Branch Name', 'text', 'Bank branch name'],
    ['branch_code', 'Branch Code', 'text', 'Branch Code'],
    ['account_number', 'Account Number', 'text', 'Account Number'],
    ['account_type', 'Account Type', 'select', ['Ordinary (Futsu)', 'Current (Toza)']],
  ],
  Switzerland: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['iban', 'IBAN', 'text', 'Swiss IBAN (starts with CH)'],
    ['swift_bic', 'SWIFT / BIC', 'text', '8 or 11-character BIC'],
  ],
  Pakistan: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['iban', 'IBAN', 'text', 'Pakistan IBAN (starts with PK)'],
    ['swift_bic', 'SWIFT / BIC', 'text', '8 or 11-character BIC'],
  ],
  Other: [
    ['bank_name', 'Bank Name', 'text', 'Bank Name'],
    ['account_holder', 'Account Holder', 'text', 'Name on bank account'],
    ['account_number', 'Account Number / IBAN', 'text', 'Account Number or IBAN'],
    ['swift_bic', 'SWIFT / BIC', 'text', 'Bank SWIFT / BIC code'],
  ],
};

export function renderBankFieldsHtml(country: string, values: Record<string, string> = {}) {
  const fields = withdrawalCountryFields[country] || withdrawalCountryFields.Other;
  return fields.map(([key, lbl, type, placeholder]) => {
    const val = values[key] || '';
    const control = type === 'select' && Array.isArray(placeholder)
      ? `<select class="replica-input" data-bank-field="${esc(key)}" required><option value="">Select ${esc(lbl)}</option>${placeholder.map(opt => `<option value="${esc(opt)}"${val === opt ? ' selected' : ''}>${esc(opt)}</option>`).join('')}</select>`
      : `<input type="text" class="replica-input" data-bank-field="${esc(key)}" value="${esc(val)}" placeholder="${esc(String(placeholder))}" required autocomplete="off">`;
    return `<div><label class="control-label">${esc(lbl)}</label>${control}</div>`;
  }).join('');
}

export function validateBankDetails(details: Record<string, string>): string {
  for (const [k, v] of Object.entries(details)) {
    if (k !== 'country' && !v.trim()) return 'Complete all bank details for the selected country.';
  }
  const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();
  if (details.country === 'India' && details.ifsc_swift && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(norm(details.ifsc_swift))) {
    return 'Enter a valid 11-character IFSC code.';
  }
  if (details.routing_number && !/^\d{9}$/.test(norm(details.routing_number))) {
    return 'Enter a valid 9-digit ABA routing number.';
  }
  if (details.sort_code && !/^\d{2}-?\d{2}-?\d{2}$/.test(norm(details.sort_code))) {
    return 'Enter a valid 6-digit UK sort code.';
  }
  if (details.bsb_code && !/^\d{6}$/.test(norm(details.bsb_code))) {
    return 'Enter a valid 6-digit BSB.';
  }
  if (details.swift_bic && !/^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(norm(details.swift_bic))) {
    return 'Enter a valid SWIFT / BIC code.';
  }
  return '';
}

export const clientNavItems: { tab: string; hash: string; label: string; icon: string }[] = [
  { tab: 'market', hash: 'trade', label: 'Trade', icon: clientIcons.trade },
  { tab: 'wallet', hash: 'wallet', label: 'Assets', icon: clientIcons.wallet },
  { tab: 'history', hash: 'transactions', label: 'Transaction History', icon: clientIcons.history },
  { tab: 'tradeHistory', hash: 'history', label: 'Trade History', icon: clientIcons.journal },
  { tab: 'leaderboard', hash: 'leaderboard', label: 'Leaderboard', icon: clientIcons.trophy },
  { tab: 'profile', hash: 'settings', label: 'Settings', icon: clientIcons.settings },
];

export type ClientState = {
  activeTab: 'market' | 'assets' | 'wallet' | 'history' | 'tradeHistory' | 'leaderboard' | 'profile';
  walletSubTab: 'deposit' | 'withdraw';
  depositMethod: 'USDT_BSC' | 'UPI';
  depositPresetAmount: number;
  selected: Asset;
  frame: string;
  selDur: number;
  selProfit: number;
  livePrice: number;
  quotes: Map<string, { price: number; change: number }>;
  notifications: Row[];
  unreadNotifs: number;
  messages: Row[];
  fundingRows: Row[];
  tradeRows: Row[];
  leaderboardRows: { rank: number; name: string; profit: number; roi: number; trades: number }[];
  pendingTrade: { dir: 'up' | 'down'; amount: number; dur: number; profit: number } | null;
  activeTrade: { id: string; symbol: string; direction: string; stake: number; dueAt: number; profitPercent: number; entry: number } | null;
  lastSettledAlertId: string;
  bankCountry: string;
  bankDraft: Record<string, string>;
  txnFilters: { search: string; type: string; status: string; date: string; sort: string };
  tradeFilters: { search: string; result: string; dir: string; date: string; sort: string };
};

export function createLeaderboardData() {
  const names = [
    'Virat K', 'Sai Iyer', 'Rishabh P', 'Nisha Kapoor', 'Shreyas I', 'Priya Sharma',
    'Aarav Sharma', 'Vivaan Patel', 'Aditya Singh', 'Vihaan Gupta', 'Arjun Verma', 'Reyansh Mehta',
    'Krishna Nair', 'Ishaan Kapoor', 'Kabir Malhotra', 'Rohan Chawla', 'Ananya Gupta', 'Diya Iyer',
    'Aisha Khan', 'Vikram Das',
  ];
  const baseProfits = [236964, 234675, 231713, 227406, 223048, 220124, 211450, 198320, 185900, 174200, 162840, 151300, 144720, 136900, 125400, 114850, 103200, 96400, 88900, 79500];
  const rois = [56.4, 78.1, 51.8, 51.4, 75.9, 57.2, 64.0, 49.5, 61.2, 53.8, 47.9, 68.3, 44.1, 58.6, 50.2, 46.7, 55.4, 42.9, 61.8, 48.0];
  const counts = [30, 88, 20, 45, 28, 89, 52, 61, 39, 44, 33, 41, 27, 36, 48, 29, 31, 25, 34, 22];
  return names.map((name, idx) => ({
    rank: idx + 1,
    name,
    profit: baseProfits[idx],
    roi: rois[idx],
    trades: counts[idx],
  }));
}

export function buildClientShellHtml(home: Home, state: ClientState) {
  const balText = fmtMoney(home.wallet.available, home);
  const balColor = Number(home.wallet.available) < 0 ? 'var(--iq-green)' : 'var(--iq-green)';
  return `
  <div id="app-interface" class="${state.activeTab === 'market' ? 'market-active' : 'content-expanded'}">
    <div class="top-bar">
      <div class="logo-group">
        <button type="button" class="mobile-menu-btn" id="mobileMenuBtn" data-action="client-menu-toggle" aria-label="Open navigation menu" aria-expanded="false">
          ${clientIcons.menu}
        </button>
        <img class="dynamic-project-logo" src="${logoUrl}" alt="Option">
        <div class="logo-text">Option</div>
      </div>

      <div class="top-right-controls">
        <button type="button" class="asset-btn asset-btn-desk" data-action="client-toggle-assets">
          ${coinIcon(state.selected.code, state.selected.color)}
          <span id="headerAsset">${esc(state.selected.code.slice(0, 2) + '...')}</span>
          ${clientIcons.chevronDown}
        </button>

        <div class="balance-group">
          <div class="balance-display" data-action="client-nav" data-tab="wallet" role="button" tabindex="0" title="Available balance">
            <div class="balance-label">REAL ACCOUNT</div>
            <div class="balance-val" id="headerBalance" style="color:${balColor}">${esc(balText)}</div>
          </div>

          <button type="button" class="hdr-ico" data-action="client-toggle-notif" title="Notifications" aria-label="Notifications">
            ${clientIcons.bell}
            <div class="notif-badge" id="notifBadge">${state.unreadNotifs > 0 ? state.unreadNotifs : ''}</div>
          </button>

          <button type="button" class="hdr-ico hdr-wallet-btn" data-action="client-open-deposit" title="Wallet" aria-label="Wallet">
            ${clientIcons.wallet}
          </button>

          <button type="button" class="hdr-ico hdr-profile-btn" data-action="client-nav" data-tab="profile" title="Settings" aria-label="Settings">
            ${clientIcons.personCircle}
          </button>
        </div>
      </div>
    </div>

    <div class="mobile-overlay" id="mobileOverlay" data-action="client-menu-close"></div>
    <aside id="mobileSidebar" aria-label="Menu">
      <div class="mobile-sidebar-brand">
        <img class="dynamic-project-logo" src="${logoUrl}" alt="Option">
        <div class="logo-text">Option</div>
      </div>
      <h4 class="menu-heading">MENU</h4>
      ${clientNavItems.map(item => `
        <button type="button" class="mobile-nav-item${state.activeTab === item.tab ? ' active' : ''}" data-action="client-nav" data-tab="${item.tab}">
          ${item.icon} <span>${esc(item.label)}</span>
        </button>
      `).join('')}
      <button type="button" class="mobile-nav-item logout-nav" data-action="signout">
        ${clientIcons.logout} <span>Logout</span>
      </button>
    </aside>

    <div id="notifOverlay" role="region" aria-label="Notifications">
      <div class="overlay-header">
        <span class="overlay-title">Notifications</span>
        <div class="overlay-actions">
          <button type="button" class="overlay-action-btn" style="color:var(--iq-blue);" data-action="client-read-notifs">READ ALL</button>
          <button type="button" class="overlay-action-btn" style="color:var(--iq-red);" data-action="client-clear-notifs">CLEAR</button>
        </div>
      </div>
      <div id="notifList"></div>
    </div>

    <div id="msgOverlay" role="region" aria-label="Support Messages">
      <div class="overlay-header">
        <span class="overlay-title">Support Messages</span>
        <div class="overlay-actions">
          <button type="button" class="overlay-action-btn" style="color:var(--iq-muted);" data-action="client-close-overlays">CLOSE</button>
        </div>
      </div>
      <div id="msgConvoList" class="msg-convo"></div>
      <form class="msg-reply-form" data-form="message.send">
        <textarea name="message" maxlength="1000" placeholder="Write message to support…" required></textarea>
        <button type="submit" class="msg-send-btn">${clientIcons.send}</button>
      </form>
    </div>

    <nav class="left-sidebar" aria-label="Workspace navigation">
      ${clientNavItems.map(item => `
        <button type="button" class="menu-icon${state.activeTab === item.tab ? ' active' : ''}" data-action="client-nav" data-tab="${item.tab}" title="${esc(item.label)}">
          ${item.icon}
        </button>
      `).join('')}
      <button type="button" class="menu-icon logout-ico" data-action="signout" title="Logout">
        ${clientIcons.logout}
      </button>
    </nav>

    <main class="main-stage">
      <div id="tv_chart_container">
        <div class="chart-shell">
          <div class="chart-toolbar">
            <div class="chart-market-info">
              <div class="chart-symbol-mark">${clientIcons.tradeArrow}</div>
              <div>
                <div class="chart-market-name" id="chartMarketName">${esc(formatPair(state.selected.symbol))}</div>
                <div class="chart-market-subtitle">Live market · Line chart</div>
              </div>
            </div>
            <div class="chart-timeframes" role="group" aria-label="Chart timeframe">
              ${[['1m','1m'],['5m','5m'],['15m','15m'],['1h','1H'],['4h','4H'],['1d','1D']].map(([val, lbl]) => `
                <button type="button" class="chart-timeframe${state.frame === val ? ' active' : ''}" data-action="frame" data-id="${val}" aria-pressed="${state.frame === val}">${lbl}</button>
              `).join('')}
            </div>
          </div>
          <div class="chart-plot">
            <canvas id="market-chart" aria-label="Live market line chart"></canvas>
            <div class="chart-live-marker" id="chartLiveMarker" aria-hidden="true"></div>
            <span id="market-price" hidden></span>
          </div>
          <div class="chart-status"><span class="chart-live-dot"></span><span id="feed-status">Live market data</span></div>
        </div>
      </div>

      <div id="assetsTab" class="content-overlay${state.activeTab === 'assets' ? ' active' : ''}">
        <div style="max-width:920px;margin:0 auto;">
          <h4 style="color:#fff;margin:0 0 18px;font-weight:800;font-size:20px;">Top Assets</h4>
          <div class="coin-grid" id="coinGrid"></div>
        </div>
      </div>

      <div id="walletTab" class="content-overlay${state.activeTab === 'wallet' ? ' active' : ''}"></div>
      <div id="historyTab" class="content-overlay${state.activeTab === 'history' ? ' active' : ''}"></div>
      <div id="tradeHistoryTab" class="content-overlay${state.activeTab === 'tradeHistory' ? ' active' : ''}"></div>
      <div id="leaderboardTab" class="content-overlay${state.activeTab === 'leaderboard' ? ' active' : ''}"></div>
      <div id="profileTab" class="content-overlay${state.activeTab === 'profile' ? ' active' : ''}"></div>
    </main>

    <aside class="right-sidebar ${state.activeTab === 'market' ? 'trade-visible is-market-panel' : ''}">
      <div class="control-group">
        <label class="control-label">Asset</label>
        <div class="iq-dropdown" id="assetDrop">
          <div class="asset-select-head" data-action="client-toggle-asset-drop">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <span class="asset-pill-dot" id="assetDotSmall" style="background:${state.selected.color}">${esc(state.selected.code.slice(0, 2))}</span>
              <span id="selectedAssetName">${esc(formatPair(state.selected.symbol))}</span>
            </div>
            ${clientIcons.chevronDown}
          </div>
          <div class="asset-select-list" id="assetList"></div>
        </div>
      </div>

      <div class="control-group">
        <label class="control-label" for="tradeAmount">Amount (${esc(curSym(home))})</label>
        <div class="iq-input">
          <button type="button" class="step-btn" data-action="client-adj-amount" data-delta="-1000" aria-label="Decrease amount">${clientIcons.dash}</button>
          <input type="number" id="tradeAmount" min="1" step="1" value="1000">
          <button type="button" class="step-btn" data-action="client-adj-amount" data-delta="1000" aria-label="Increase amount">${clientIcons.plus}</button>
        </div>
      </div>

      <div class="control-group">
        <label class="control-label">Duration</label>
        <div class="iq-dropdown" id="timeDrop">
          <div class="iq-dropdown-head" data-action="client-toggle-time-drop">
            <span id="selectedTime">${esc(formatDurationLabel(state.selDur))}</span>
            ${clientIcons.clock}
          </div>
          <div class="iq-dropdown-list" id="timeList">
            ${durationChoices.map(d => `
              <div class="iq-dropdown-item${state.selDur === d.sec ? ' selected' : ''}" data-action="client-set-duration" data-sec="${d.sec}" data-profit="${d.profit}">
                <span>${esc(d.label)} (+${d.profit}%)</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="profit-info">
        <span class="control-label" style="margin:0;">Profit</span>
        <span class="profit-percent" id="profitDisplay">+${state.selProfit}%</span>
      </div>

      <div class="order-book">
        <div class="ob-head">
          <label class="control-label" style="margin:0;">Market Activity</label>
          <button type="button" class="ob-hist-btn" data-action="client-nav" data-tab="tradeHistory">TRADE HISTORY</button>
        </div>
        <div id="orderBookList"></div>
      </div>

      <div class="trade-buttons">
        <button type="button" class="btn-trade-iq btn-call" data-action="client-trade-click" data-dir="up" ${!home.profile.tradeEnabled ? 'disabled' : ''}>
          <div style="text-align:left;line-height:1.15;"><span class="btn-sub">HIGHER</span>BUY</div>
          ${clientIcons.upRight}
        </button>
        <button type="button" class="btn-trade-iq btn-put" data-action="client-trade-click" data-dir="down" ${!home.profile.tradeEnabled ? 'disabled' : ''}>
          <div style="text-align:left;line-height:1.15;"><span class="btn-sub">LOWER</span>SELL</div>
          ${clientIcons.downRight}
        </button>
      </div>
    </aside>

    <!-- Confirm Trade Modal (Mobile Portrait Flow) -->
    <div id="tradeConfirmOverlay" class="replica-modal-backdrop" data-action="client-close-trade-confirm">
      <div class="trade-confirm-card" data-stop-prop="1">
        <div class="trade-confirm-head">
          <div style="font-weight:800;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">Confirm Trade</div>
          <button type="button" class="trade-confirm-close" data-action="client-close-trade-confirm">${clientIcons.close}</button>
        </div>
        <div class="trade-confirm-body" id="tradeConfirmBody"></div>
      </div>
    </div>

    <!-- Active Trade Countdown Modal -->
    <div id="activeTradeOverlay" class="replica-modal-backdrop">
      <div class="blind-card" id="activeTradeCard"></div>
    </div>

    <!-- Trade Result Modal -->
    <div id="resultOverlay" class="replica-modal-backdrop" data-action="client-close-result">
      <div class="result-card" id="resultCard" data-stop-prop="1"></div>
    </div>

    <!-- Transaction Detail Modal -->
    <div id="transactionDetailOverlay" class="replica-modal-backdrop" data-action="client-close-txn-detail">
      <div class="txn-detail-card" id="txnDetailCard" data-stop-prop="1"></div>
    </div>

    <!-- Receipt Image Preview Modal -->
    <div id="receiptViewerOverlay" class="replica-modal-backdrop" data-action="client-close-receipt">
      <div class="txn-detail-card" style="width:min(640px,100%);" data-stop-prop="1">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:800;color:var(--iq-accent);text-transform:uppercase;">Receipt Preview</div>
          <button type="button" class="trade-confirm-close" data-action="client-close-receipt">${clientIcons.close}</button>
        </div>
        <div style="display:flex;justify-content:center;align-items:center;min-height:200px;">
          <img id="receiptViewerImage" src="" alt="Receipt" style="max-width:100%;max-height:70vh;border-radius:10px;">
        </div>
      </div>
    </div>

    <!-- Alert Modal -->
    <div id="alertOverlay" class="replica-modal-backdrop" data-action="client-close-alert">
      <div class="alert-box" data-stop-prop="1">
        <div style="font-weight:800;font-size:16px;text-transform:uppercase;margin-bottom:10px;" id="alertTitle">Alert</div>
        <div style="font-size:13px;color:var(--iq-muted);margin-bottom:18px;line-height:1.45;" id="alertMsg"></div>
        <button type="button" class="replica-primary-btn" style="height:42px;background:var(--iq-blue);color:#fff;" data-action="client-close-alert">OK</button>
      </div>
    </div>
  </div>`;
}

export function buildWalletTabHtml(home: Home, state: ClientState) {
  const sym = curSym(home);
  const isDep = state.walletSubTab === 'deposit';
  const presets = [1000, 3000, 5000, 10000, 25000, 50000];
  const isBsc = state.depositMethod === 'USDT_BSC';
  const bscAddr = home.depositSettings?.usdtBscAddress?.trim() || '';
  const upiId = home.depositSettings?.upiId?.trim() || '';
  const activeAddr = isBsc ? bscAddr : upiId;
  const addrDisplay = activeAddr || 'Contact your admin.';
  const qrSrc = activeAddr
    ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(isBsc ? activeAddr : `upi://pay?pa=${activeAddr}&pn=Qoption&cu=INR`)}`
    : DEFAULT_QR_PNG;

  return `
  <div class="wallet-wrap">
    <h4 class="wallet-page-h">Wallet</h4>

    <div class="wallet-card-dark">
      <small>AVAILABLE BALANCE</small>
      <h2 id="assetsBalance">${esc(fmtMoney(home.wallet.available, home))}</h2>
    </div>

    <div class="asset-tabs">
      <button type="button" class="asset-tab-btn${isDep ? ' active' : ''}" data-action="client-wallet-tab" data-sub="deposit">Deposit</button>
      <button type="button" class="asset-tab-btn${!isDep ? ' active' : ''}" data-action="client-wallet-tab" data-sub="withdraw">Withdraw</button>
    </div>

    <div id="depositView" style="display:${isDep ? 'block' : 'none'};">
      <div class="wallet-box-card">
        <h5 class="wallet-box-title">Deposit Funds</h5>
        <div class="method-btn-group">
          <button type="button" class="method-chip-btn${isBsc ? ' active' : ''}" id="btnMethodUSDT" data-action="client-dep-method" data-method="USDT_BSC">USDT (BNB Smart Chain)</button>
          <button type="button" class="method-chip-btn${!isBsc ? ' active' : ''}" id="btnMethodUPI" data-action="client-dep-method" data-method="UPI">UPI / BANK</button>
        </div>

        <form data-form="client.deposit">
          <div class="field-stack">
            <label class="control-label" for="customDepAmt">Enter Amount (${esc(sym)})</label>
            <input type="number" id="customDepAmt" name="amount" class="replica-input centered" min="1" step="0.01" value="${state.depositPresetAmount || ''}" placeholder="Custom Amount" required>
          </div>

          <div class="amt-grid">
            ${presets.map(amt => `
              <button type="button" class="amt-btn${state.depositPresetAmount === amt ? ' active' : ''}" data-action="client-dep-amt" data-amt="${amt}">
                ${esc(sym)}${amt.toLocaleString('en-IN')}
              </button>
            `).join('')}
          </div>

          <div class="qr-box-wrap">
            <div class="qr-frame">
              <img id="depQrImg" src="${esc(qrSrc)}" alt="Deposit QR Code" width="120" height="120">
            </div>
            <div>
              <span class="dep-addr-row" id="depAddrText" data-action="client-copy-dep-addr" data-addr="${esc(addrDisplay)}" title="Click to copy">
                <span>${esc(addrDisplay)}</span>
                ${clientIcons.clipboard}
              </span>
            </div>
          </div>

          <div class="field-stack" style="margin-top:18px;">
            <label class="control-label" for="depProof">Upload Receipt Screenshot</label>
            <input type="file" id="depProof" name="receipt" accept="image/*" class="replica-file-input">
          </div>

          <button type="submit" class="replica-primary-btn">I HAVE PAID</button>
          <button type="button" class="replica-support-btn" data-action="client-contact-support">
            ${clientIcons.headset} CONTACT SUPPORT
          </button>
        </form>
      </div>
    </div>

    <div id="wdFormView" style="display:${!isDep ? 'block' : 'none'};">
      <div class="wallet-box-card">
        <div class="wd-head-row">
          <h5 class="wallet-box-title" style="margin:0;">Withdrawal Request</h5>
          <button type="button" class="autofill-btn" data-action="client-autofill-bank">Auto-Fill</button>
        </div>

        ${!home.profile.withdrawalEnabled || home.profile.frozen || home.profile.freezeAmount
          ? '<p class="error" style="margin:0 0 12px;font-weight:700;font-size:13px;">Withdrawals are currently restricted for this account.</p>' : ''}

        <form data-form="client.withdraw">
          <div class="field-stack">
            <label class="control-label" for="wdAmount">Withdraw Amount (${esc(sym)})</label>
            <input type="number" id="wdAmount" name="amount" class="replica-input" min="1" step="0.01" placeholder="Amount" required>
          </div>

          <div class="field-stack">
            <label class="control-label" for="wdCountry">Country</label>
            <select id="wdCountry" name="country" class="replica-input" required>
              ${Object.keys(withdrawalCountryFields).map(c => `
                <option value="${esc(c)}"${state.bankCountry === c ? ' selected' : ''}>${esc(c === 'India' ? 'India (INR)' : c)}</option>
              `).join('')}
            </select>
          </div>

          <div id="wdBankFields" class="wd-bank-grid">
            ${renderBankFieldsHtml(state.bankCountry, state.bankDraft)}
          </div>

          <div class="field-stack">
            <label class="control-label" for="wdPinCode" style="color:var(--iq-red);">Withdrawal PIN</label>
            <input type="password" id="wdPinCode" name="withdrawalPin" class="replica-input" style="border-color:rgba(255,93,114,0.65);" placeholder="****" required>
            ${!home.profile.hasWithdrawalPin ? '<div style="font-size:11px;color:#e8b86d;margin-top:5px;">Tip: Set your Withdrawal PIN in Settings before withdrawing.</div>' : ''}
          </div>

          <button type="submit" class="replica-primary-btn" ${(!home.profile.withdrawalEnabled || home.profile.frozen || home.profile.freezeAmount) ? 'disabled' : ''}>SUBMIT WITHDRAWAL</button>
        </form>
      </div>
    </div>
  </div>`;
}

function matchesDatePreset(ts: unknown, preset: string) {
  if (!preset || preset === 'ALL') return true;
  const n = Number(ts);
  if (!Number.isFinite(n)) return false;
  const d = new Date(n);
  const now = new Date();
  if (preset === 'TODAY') return d.toDateString() === now.toDateString();
  const days = preset === '7D' ? 7 : preset === '30D' ? 30 : 0;
  if (!days) return true;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

export function filterTransactions(home: Home, state: ClientState) {
  const f = state.txnFilters;
  let rows = [...state.fundingRows];
  rows = rows.filter(r => {
    const type = String(r.kind || '').toUpperCase();
    const status = String(r.status || 'PENDING').toUpperCase();
    if (f.type !== 'ALL' && type !== f.type) return false;
    if (f.status !== 'ALL' && status !== f.status) return false;
    if (!matchesDatePreset(r.createdAt, f.date)) return false;
    if (f.search.trim()) {
      const q = f.search.trim().toLowerCase();
      const hay = [type, status, r.reason, r.note, r.method, fmtMoney(r.amount, home)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  rows.sort((a, b) => {
    if (f.sort === 'OLDEST') return Number(a.createdAt || 0) - Number(b.createdAt || 0);
    if (f.sort === 'AMOUNT_HIGH') return Number(b.amount || 0) - Number(a.amount || 0);
    if (f.sort === 'AMOUNT_LOW') return Number(a.amount || 0) - Number(b.amount || 0);
    return Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });
  return rows;
}

export function buildTransactionHistoryHtml(home: Home, state: ClientState) {
  const rows = filterTransactions(home, state);
  const totalAmt = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const approved = rows.filter(r => String(r.status).toUpperCase() === 'APPROVED').length;
  const pending = rows.filter(r => String(r.status).toUpperCase() === 'PENDING').length;
  const rejected = rows.filter(r => String(r.status).toUpperCase() === 'REJECTED').length;

  return `
  <div class="history-shell">
    <div class="history-head">
      <div>
        <h4 class="history-title">Transaction History</h4>
        <div class="history-subtitle">Your deposit and withdrawal activity appears here.</div>
      </div>
      <div class="history-chip-row">
        <div class="history-chip"><div class="history-chip-label">Total Amount</div><div class="history-chip-value">${esc(fmtMoney(totalAmt, home))}</div></div>
        <div class="history-chip"><div class="history-chip-label">Approved</div><div class="history-chip-value">${approved}</div></div>
        <div class="history-chip"><div class="history-chip-label">Pending</div><div class="history-chip-value">${pending}</div></div>
        <div class="history-chip"><div class="history-chip-label">Rejected</div><div class="history-chip-value">${rejected}</div></div>
      </div>
    </div>

    <div class="history-toolbar">
      <div class="history-search-wrap">
        ${clientIcons.search}
        <input id="txnSearchInput" class="history-input" type="search" value="${esc(state.txnFilters.search)}" placeholder="Search amount, status, note">
      </div>
      <select id="txnTypeFilter" class="history-select">
        ${[['ALL','All Types'],['DEPOSIT','Deposit'],['WITHDRAWAL','Withdrawal']].map(([v, l]) => `<option value="${v}"${state.txnFilters.type === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <select id="txnStatusFilter" class="history-select">
        ${[['ALL','All Statuses'],['APPROVED','Approved'],['PENDING','Pending'],['REJECTED','Rejected']].map(([v, l]) => `<option value="${v}"${state.txnFilters.status === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <select id="txnDateFilter" class="history-select">
        ${[['ALL','All Time'],['TODAY','Today'],['7D','Last 7 Days'],['30D','Last 30 Days']].map(([v, l]) => `<option value="${v}"${state.txnFilters.date === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <select id="txnSortSelect" class="history-select">
        ${[['NEWEST','Latest First'],['OLDEST','Oldest First'],['AMOUNT_HIGH','Amount High-Low'],['AMOUNT_LOW','Amount Low-High']].map(([v, l]) => `<option value="${v}"${state.txnFilters.sort === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <button type="button" class="history-btn" data-action="client-txn-reset">RESET</button>
      <button type="button" class="history-btn" data-action="client-txn-csv">${clientIcons.download} EXPORT CSV</button>
    </div>
  </div>

  <div class="history-table-wrap">
    <table class="iq-table">
      <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Status</th><th>Note</th><th></th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(r => {
          const kind = String(r.kind || '').toUpperCase();
          const st = String(r.status || 'PENDING').toUpperCase();
          const cls = st === 'APPROVED' ? 'badge-success' : (st === 'REJECTED' || st === 'CANCELLED') ? 'badge-danger' : 'badge-pending';
          const reasonNote = String(r.reason || r.note || r.method || '—');
          return `
            <tr>
              <td data-label="Date">${esc(dateTime(r.createdAt))}</td>
              <td data-label="Type"><span class="hist-type-pill ${kind === 'DEPOSIT' ? 'deposit' : 'withdrawal'}">${esc(kind)}</span></td>
              <td data-label="Amount" style="color:#fff;font-weight:800;">${esc(fmtMoney(r.amount, home))}</td>
              <td data-label="Status"><span class="badge ${cls}">${esc(st)}</span></td>
              <td data-label="Note" style="color:${st === 'REJECTED' ? '#ff8a99' : '#9eb2c6'};font-weight:700;">${esc(reasonNote)}</td>
              <td data-label="Action"><button type="button" class="history-action-btn" data-action="client-txn-view" data-id="${esc(r.id)}">View</button></td>
            </tr>
          `;
        }).join('') : '<tr><td colspan="6" style="text-align:center;padding:28px;color:#8fa3b8;">No transactions found.</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

export function filterTrades(state: ClientState) {
  const f = state.tradeFilters;
  let rows = [...state.tradeRows];
  rows = rows.filter(r => {
    const res = String(r.outcome || (r.status === 'open' ? 'open' : 'settled')).toUpperCase();
    const dir = String(r.direction || '').toLowerCase() === 'up' ? 'BUY' : 'SELL';
    if (f.result !== 'ALL' && res !== f.result) return false;
    if (f.dir !== 'ALL' && dir !== f.dir) return false;
    if (!matchesDatePreset(r.createdAt, f.date)) return false;
    if (f.search.trim()) {
      const q = f.search.trim().toLowerCase();
      const hay = [r.id, formatPair(String(r.symbol || '')), res, dir, String(Number(r.stake || 0) / 100)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  rows.sort((a, b) => {
    if (f.sort === 'OLDEST') return Number(a.createdAt || 0) - Number(b.createdAt || 0);
    if (f.sort === 'STAKE_HIGH') return Number(b.stake || 0) - Number(a.stake || 0);
    if (f.sort === 'PNL_HIGH') return Number(b.pnl || 0) - Number(a.pnl || 0);
    if (f.sort === 'PNL_LOW') return Number(a.pnl || 0) - Number(b.pnl || 0);
    return Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });
  return rows;
}

export function buildTradeHistoryHtml(home: Home, state: ClientState) {
  const rows = filterTrades(state);
  const totalStake = rows.reduce((s, r) => s + Number(r.stake || 0), 0);
  const netPnl = rows.reduce((s, r) => s + Number(r.pnl || 0), 0);
  const wins = rows.filter(r => String(r.outcome || '').toLowerCase() === 'win').length;
  const winRate = rows.length ? ((wins / rows.length) * 100).toFixed(2) : '0.00';

  return `
  <div class="history-shell">
    <div class="history-head">
      <div>
        <h4 class="history-title">Trade History</h4>
        <div class="history-subtitle">Your completed and active trade records appear here.</div>
      </div>
      <div class="history-chip-row">
        <div class="history-chip"><div class="history-chip-label">Total Stake</div><div class="history-chip-value">${esc(fmtMoney(totalStake, home))}</div></div>
        <div class="history-chip"><div class="history-chip-label">Net P/L</div><div class="history-chip-value ${netPnl >= 0 ? 'positive' : 'negative'}">${esc(fmtSignedMoney(netPnl, home))}</div></div>
        <div class="history-chip"><div class="history-chip-label">Win Rate</div><div class="history-chip-value">${winRate}%</div></div>
        <div class="history-chip"><div class="history-chip-label">Trades</div><div class="history-chip-value">${rows.length}</div></div>
      </div>
    </div>

    <div class="history-toolbar">
      <div class="history-search-wrap">
        ${clientIcons.search}
        <input id="tradeSearchInput" class="history-input" type="search" value="${esc(state.tradeFilters.search)}" placeholder="Search trade ID, asset, amount">
      </div>
      <select id="tradeResultFilter" class="history-select">
        ${[['ALL','All Results'],['WIN','Win'],['LOSS','Loss'],['OPEN','Open']].map(([v, l]) => `<option value="${v}"${state.tradeFilters.result === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <select id="tradeDirFilter" class="history-select">
        ${[['ALL','All Directions'],['BUY','Buy'],['SELL','Sell']].map(([v, l]) => `<option value="${v}"${state.tradeFilters.dir === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <select id="tradeDateFilter" class="history-select">
        ${[['ALL','All Time'],['TODAY','Today'],['7D','Last 7 Days'],['30D','Last 30 Days']].map(([v, l]) => `<option value="${v}"${state.tradeFilters.date === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <select id="tradeSortSelect" class="history-select">
        ${[['NEWEST','Latest First'],['OLDEST','Oldest First'],['STAKE_HIGH','Stake High-Low'],['PNL_HIGH','P/L High-Low'],['PNL_LOW','P/L Low-High']].map(([v, l]) => `<option value="${v}"${state.tradeFilters.sort === v ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <button type="button" class="history-btn" data-action="client-trade-reset">RESET</button>
      <button type="button" class="history-btn" data-action="client-trade-csv">${clientIcons.download} EXPORT CSV</button>
    </div>
  </div>

  <div class="history-table-wrap">
    <table class="iq-table">
      <thead><tr><th>Date</th><th>Trade ID</th><th>Asset</th><th>Dir</th><th>Amount</th><th>Start Price</th><th>Profit %</th><th>Result</th><th>Profit/Loss</th><th>Timeframe</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((tr, i) => {
          const outcome = String(tr.outcome || (tr.status === 'open' ? 'open' : 'settled')).toUpperCase();
          const dir = String(tr.direction || '').toLowerCase() === 'up' ? 'BUY' : 'SELL';
          const cls = outcome === 'WIN' ? 'win' : outcome === 'LOSS' ? 'loss' : 'open';
          const pnlNum = Number(tr.pnl ?? 0);
          const pnlText = tr.pnl === undefined ? fmtMoney(0, home) : fmtSignedMoney(pnlNum, home);
          const shortId = String(tr.id || '').slice(0, 6).toUpperCase() || String(3800 + i);
          return `
            <tr>
              <td data-label="Date">${esc(dateTime(tr.createdAt))}</td>
              <td data-label="Trade ID">${esc(shortId)}</td>
              <td data-label="Asset">${esc(formatPair(String(tr.symbol || '')))}</td>
              <td data-label="Dir">${dir}</td>
              <td data-label="Amount">${esc(fmtMoney(tr.stake, home))}</td>
              <td data-label="Start Price">${esc(Number(tr.entry || 0).toFixed(4))}</td>
              <td data-label="Profit %">${esc(Number(tr.profitPercent || 80).toFixed(2))}%</td>
              <td data-label="Result"><span class="hist-result-pill ${cls}">${esc(outcome)}</span></td>
              <td data-label="Profit/Loss" style="font-weight:800;color:${outcome === 'WIN' ? 'var(--iq-green)' : outcome === 'LOSS' ? 'var(--iq-red)' : 'var(--iq-muted)'}">${esc(pnlText)}</td>
              <td data-label="Timeframe">${esc(formatDurationLabel(Number(tr.duration || 60)))}</td>
            </tr>
          `;
        }).join('') : '<tr><td colspan="10" style="text-align:center;padding:28px;color:#8fa3b8;">No trade history found.</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

export function buildLeaderboardHtml(home: Home, state: ClientState) {
  const sym = curSym(home);
  const rows = state.leaderboardRows;
  const top3 = rows.slice(0, 3);
  const events = [
    { name: 'Forex Global Summit', pool: '50,00,000', ends: '2 Days', type: 'Forex' },
    { name: 'Crypto Titans Cup', pool: '1,20,00,000', ends: '5 Days', type: 'Crypto' },
    { name: 'Commodity Kings', pool: '75,00,000', ends: '12 Hours', type: 'Commodities' },
  ];

  return `
  <div class="lb-wrap">
    <div class="lb-head">
      <div>
        <h3 class="lb-title">Leaderboard</h3>
        <div class="lb-sub">Top performers based on profit and win-rate.</div>
      </div>
      <div class="lb-note">
        Alert: Weekly Leaderboard Event incoming! Double profits count—aim for #1. Register before midnight!
      </div>
    </div>

    <div class="lb-cards">
      ${top3.map(r => `
        <div class="lb-card">
          <div class="lb-rank">TOP ${r.rank}</div>
          <div class="lb-name">${esc(r.name)}</div>
          <div class="lb-meta"><span>Profit</span><span class="lb-val lb-green">${esc(sym)}${r.profit.toLocaleString('en-IN')}</span></div>
          <div class="lb-meta"><span>ROI</span><span class="lb-val lb-green">+${r.roi.toFixed(1)}%</span></div>
          <div class="lb-meta"><span>Trades</span><span class="lb-val">${r.trades}</span></div>
        </div>
      `).join('')}
    </div>

    <table class="lb-table">
      <thead>
        <tr>
          <th style="width:54px;">RANK</th>
          <th>NAME</th>
          <th>PROFIT</th>
          <th>TRADES</th>
          <th>ROI</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="lb-muted">${r.rank}</td>
            <td style="color:#fff;font-weight:700;">${esc(r.name)}</td>
            <td class="lb-green">${esc(sym)}${r.profit.toLocaleString('en-IN')}</td>
            <td class="lb-muted">${r.trades}</td>
            <td class="lb-green">+${r.roi.toFixed(1)}%</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h4 class="lb-events-h">Upcoming Events</h4>
    ${events.map(ev => `
      <div class="lb-event-card">
        <span class="lb-event-badge">${esc(ev.ends)} LEFT</span>
        <div>
          <div style="font-size:11px;color:var(--iq-muted);font-weight:800;text-transform:uppercase;">${esc(ev.type)}</div>
          <div style="font-size:18px;font-weight:800;color:#fff;margin:4px 0;">${esc(ev.name)}</div>
          <div style="font-size:12px;color:#cbd8e6;">Compete with top traders worldwide.</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:10px;color:var(--iq-muted);font-weight:800;">PRIZE POOL</div>
          <div style="font-size:20px;font-weight:800;color:var(--iq-green);">${esc(sym)}${esc(ev.pool)}</div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

export function buildProfileTabHtml(home: Home) {
  const p = home.profile;
  const shortUid = String(p.uid || '').slice(0, 7).toUpperCase();
  const vipLabel = String(p.vipLevel || 'Unverified');
  const rep = Number(p.reputationScore ?? 100);
  const frozen = Boolean(p.frozen);
  const frozenAmt = Number(p.frozenAmount || 0);

  return `
  <div class="profile-wrap">
    <div class="profile-hero">
      <div class="prof-avatar">${clientIcons.personFill}</div>
      <div style="flex:1;min-width:0;">
        <h3 class="prof-name" id="dispName">${esc(p.name || 'Trader')}</h3>
        <div class="prof-stats-grid">
          <div class="prof-stat-box"><div class="prof-stat-label">UID</div><div class="prof-stat-val" id="dispUid">${esc(shortUid)}</div></div>
          <div class="prof-stat-box"><div class="prof-stat-label">VIP Level</div><div class="prof-stat-val" style="color:#e8b86d;" id="dispVip">${esc(vipLabel)}</div></div>
          <div class="prof-stat-box"><div class="prof-stat-label">Reputation</div><div class="prof-stat-val" style="color:var(--iq-green);" id="dispRep">${rep}</div></div>
          <div class="prof-stat-box"><div class="prof-stat-label">Status</div><div class="prof-stat-val" id="dispStatus" style="color:${frozen ? 'var(--iq-red)' : 'var(--iq-green)'};">${frozen ? 'FROZEN' : 'ACTIVE'}</div></div>
          ${frozenAmt > 0 ? `<div class="prof-stat-box" style="grid-column:1 / -1;border-color:rgba(255,93,114,0.45);"><div class="prof-stat-label" style="color:var(--iq-red);">Frozen Amount</div><div class="prof-stat-val" style="color:var(--iq-red);">${esc(fmtMoney(frozenAmt, home))}</div></div>` : ''}
        </div>
      </div>
    </div>

    <div class="wallet-box-card">
      <h5 class="wallet-box-title">Security Settings</h5>
      <form data-form="profile.update">
        <div class="field-stack">
          <label class="control-label" for="profEditName">Edit Full Name</label>
          <input type="text" id="profEditName" name="name" class="replica-input" value="${esc(p.name || '')}" maxlength="50">
        </div>
        <div class="field-stack">
          <label class="control-label" for="profEditPass">Change Password</label>
          <input type="password" id="profEditPass" name="password" class="replica-input" minlength="6" autocomplete="new-password" placeholder="New Password">
        </div>
        <div class="field-stack">
          <label class="control-label" for="profEditPin">Set Withdrawal PIN</label>
          <input type="password" id="profEditPin" name="withdrawalPin" class="replica-input" minlength="4" maxlength="12" autocomplete="new-password" placeholder="New PIN">
        </div>
        <button type="submit" class="replica-primary-btn">UPDATE PROFILE</button>
      </form>
    </div>
  </div>`;
}

export function renderNotificationsOverlayList(home: Home, state: ClientState) {
  const readAt = Number(home.profile.notificationReadAt || 0);
  if (!state.notifications.length) {
    return '<div style="padding:22px;text-align:center;color:var(--iq-muted);font-size:12px;font-weight:700;">No notifications</div>';
  }
  return state.notifications.map(n => `
    <div class="notif-item" style="opacity:${Number(n.createdAt || 0) > readAt ? 1 : 0.6}">
      <div class="notif-title">${esc(n.title || 'Notification')}</div>
      <div class="notif-body">${esc(n.message || '')}</div>
      <div class="notif-time">${esc(dateTime(n.createdAt))}</div>
    </div>
  `).join('');
}

export function renderAssetDropdownAndGrid(state: ClientState) {
  const dropItems = assets.map(a => {
    const q = state.quotes.get(a.symbol);
    const price = q ? q.price : demoPrice(a, Date.now());
    const chg = q ? q.change : (((a.base % 7) - 3) * 0.8);
    const clr = chg >= 0 ? 'var(--iq-green)' : 'var(--iq-red)';
    return `
      <div class="asset-select-item${a.symbol === state.selected.symbol ? ' active' : ''}" data-action="asset" data-id="${esc(a.symbol)}">
        <div>
          <div style="font-weight:800;color:#fff;">${esc(formatPair(a.symbol))}</div>
          <div style="font-size:10px;color:var(--iq-muted);font-weight:700;">${esc(a.symbol)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:monospace;font-weight:800;font-size:12px;color:${clr};">${price < 1 ? price.toFixed(4) : price.toFixed(2)}</div>
          <div style="font-size:10px;font-weight:800;color:${clr};">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</div>
        </div>
      </div>`;
  }).join('');

  const gridItems = assets.map(a => {
    const q = state.quotes.get(a.symbol);
    const price = q ? q.price : demoPrice(a, Date.now());
    const chg = q ? q.change : (((a.base % 7) - 3) * 0.8);
    const clr = chg >= 0 ? 'var(--iq-green)' : 'var(--iq-red)';
    return `
      <div class="coin-flash-item" data-action="asset" data-id="${esc(a.symbol)}">
        <div>
          <div style="font-weight:800;color:#fff;">${esc(formatPair(a.symbol))}</div>
          <div style="font-family:monospace;font-weight:800;font-size:12px;color:${clr};">${price < 1 ? price.toFixed(4) : price.toFixed(2)}</div>
        </div>
        <div style="font-size:11px;font-weight:800;color:${clr};">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</div>
      </div>`;
  }).join('');

  return { dropItems, gridItems };
}

export function renderOrderBookHtml(basePrice: number) {
  const p = basePrice > 0 ? basePrice : 59640;
  return Array.from({ length: 6 }, (_, i) => {
    const up = (i + Math.floor(Date.now() / 1500)) % 2 === 0;
    const price = (p * (1 + (up ? 0.0001 : -0.0001) * (i + 1))).toFixed(p < 1 ? 5 : 4);
    const amt = (0.35 + ((i * 37) % 140) / 100).toFixed(4);
    return `<div class="ob-row"><span class="${up ? 'ob-bid' : 'ob-ask'}">${price}</span><span class="ob-amt">${amt}</span></div>`;
  }).join('');
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escCsv = (v: string) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [headers.map(escCsv).join(','), ...rows.map(r => r.map(escCsv).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fileToCompressedDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please upload an image file.');
  if (file.size <= 180_000) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Could not read receipt image.'));
      reader.readAsDataURL(file);
    });
  }
  const bmp = await createImageBitmap(file);
  const maxDim = 960;
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable to process receipt.');
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}

export function renderTxnDetailHtml(home: Home, txn: Row) {
  const kind = String(txn.kind || '').toUpperCase();
  const status = String(txn.status || 'PENDING').toUpperCase();
  const reason = String(txn.reason || txn.note || txn.method || '—');
  const details = (txn.details && typeof txn.details === 'object') ? (txn.details as Record<string, string>) : {};
  const labels: Record<string, string> = {
    bank_name: 'Bank Name', account_holder: 'Account Holder', account_number: 'Account Number',
    ifsc_swift: 'IFSC Code', country: 'Country', routing_number: 'ABA Routing Number',
    account_type: 'Account Type', sort_code: 'Sort Code', iban: 'IBAN', swift_bic: 'SWIFT / BIC',
    bsb_code: 'BSB Number', transit_number: 'Transit Number', institution_number: 'Institution Number',
    bank_code: 'Bank Code', branch_code: 'Branch Code', branch_name: 'Branch Name',
  };
  const detailRows = Object.entries(details)
    .filter(([, v]) => String(v || '').trim() !== '')
    .map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;"><span style="color:var(--iq-muted);">${esc(labels[k] || k)}</span><span>${esc(v)}</span></div>`)
    .join('');

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
    <div>
      <div style="font-size:12px;font-weight:800;color:var(--iq-accent);text-transform:uppercase;">Transaction Details</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px;">${esc(kind)}</div>
    </div>
    <button type="button" class="trade-confirm-close" data-action="client-close-txn-detail">${clientIcons.close}</button>
  </div>
  <div style="display:grid;gap:12px;">
    <div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:var(--iq-muted);">Date</span><span>${esc(dateTime(txn.createdAt))}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:var(--iq-muted);">Method</span><span>${esc(String(txn.method || '—'))}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:var(--iq-muted);">Amount</span><strong>${esc(fmtMoney(txn.amount, home))}</strong></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:var(--iq-muted);">Status</span><strong>${esc(status)}</strong></div>
    <div style="display:flex;justify-content:space-between;gap:12px;font-size:13px;"><span style="color:var(--iq-muted);">Reason / Note</span><span style="text-align:right;color:${status === 'REJECTED' ? '#ff8a99' : '#eef5fb'}">${esc(reason)}</span></div>
    ${detailRows ? `<div style="display:grid;gap:8px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--iq-border);border-radius:10px;">${detailRows}</div>` : ''}
    ${txn.receiptUrl ? `<button type="button" class="history-action-btn" data-action="client-open-receipt" data-url="${esc(String(txn.receiptUrl))}">View Receipt</button>` : ''}
    ${kind === 'WITHDRAWAL' && status === 'PENDING' ? `<form data-form="funding.cancel"><input type="hidden" name="id" value="${esc(txn.id)}"><button type="submit" class="btn-confirm cancel" style="width:100%;">Cancel Withdrawal</button></form>` : ''}
    <button type="button" class="replica-primary-btn" style="height:42px;background:var(--iq-blue);color:#fff;" data-action="client-close-txn-detail">Close</button>
  </div>`;
}

export function clientSafeError(error: unknown) {
  return errorMessage(error);
}
