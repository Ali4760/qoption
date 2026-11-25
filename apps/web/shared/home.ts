import './style.css';
import './public-shell';
import './home.css';
import { assets, findAsset, type Asset } from '../../../functions/src/market';
import { formatPrice, mountChart, timeframes, type ChartMode } from './canvas-chart';

type Quote = { last: number; open: number; high: number; change: number };
type QuoteRow = { symbol: string; lastPrice?: string; openPrice?: string; highPrice?: string; priceChangePercent?: string };

const list = document.querySelector<HTMLElement>('#home-market-list')!;
const status = document.querySelector<HTMLElement>('#home-quote-status')!;
const feedStatus = document.querySelector<HTMLElement>('#home-feed-status')!;
const canvas = document.querySelector<HTMLCanvasElement>('#home-market-chart')!;
const pairName = document.querySelector<HTMLElement>('#home-market-title')!;
const marketName = document.querySelector<HTMLElement>('#home-market-name')!;
const latest = document.querySelector<HTMLElement>('#home-live-price')!;
const open = document.querySelector<HTMLElement>('#home-open')!;
const high = document.querySelector<HTMLElement>('#home-high')!;
const change = document.querySelector<HTMLElement>('#home-change')!;
const quoteURL = new URL('https://data-api.binance.vision/api/v3/ticker/24hr');
quoteURL.searchParams.set('symbols', JSON.stringify(assets.map(asset => asset.symbol)));

const quotes = new Map<string, Quote>();
let current: Asset = assets[0];
let interval = '5m';
let mode: ChartMode = 'combined';
let chart: ReturnType<typeof mountChart> | undefined;
let quoteTimer = 0;
let request: AbortController | undefined;

function percentage(value: number) {
  return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
}

function setChange(node: HTMLElement, value: number | undefined) {
  node.textContent = value === undefined ? '—' : percentage(value);
  node.classList.toggle('pos', (value ?? 0) > 0);
  node.classList.toggle('neg', (value ?? 0) < 0);
}

list.innerHTML = assets.map(asset => '<button type="button" class="home-market-row" data-symbol="' + asset.symbol + '" aria-label="Select ' +
  asset.name + '" aria-pressed="' + (asset === current) + '">' +
  '<span class="home-market-pair"><strong>' + asset.code + '/USDT</strong><small>' + asset.name + '</small></span>' +
  '<span class="home-market-value"><strong data-role="quote-price">—</strong><small data-role="quote-change">—</small></span></button>').join('');

function showStatistics() {
  const quote = quotes.get(current.symbol);
  open.textContent = quote ? formatPrice(quote.open) : '—';
  high.textContent = quote ? formatPrice(quote.high) : '—';
  setChange(change, quote?.change);
}

function updateChartLabel() {
  const descriptions = {
    combined: 'spot candlesticks, closing price line, and volume',
    candles: 'spot candlestick chart',
    line: 'spot price line chart',
  };
  canvas.setAttribute('aria-label', current.name + ' ' + descriptions[mode]);
}

function chooseMarket(asset: Asset) {
  current = asset;
  pairName.textContent = current.code + '/USDT';
  marketName.textContent = current.name;
  updateChartLabel();
  const price = quotes.get(current.symbol)?.last;
  latest.textContent = price !== undefined ? formatPrice(price) : '—';
  for (const button of list.querySelectorAll<HTMLButtonElement>('[data-symbol]')) {
    button.setAttribute('aria-pressed', String(button.dataset.symbol === current.symbol));
  }
  showStatistics();
  chart?.load(current, interval, true);
}

async function refreshQuotes() {
  if (request || document.hidden) return;
  const active = new AbortController();
  request = active;
  try {
    const response = await fetch(quoteURL, { signal: AbortSignal.any([active.signal, AbortSignal.timeout(9000)]) });
    if (!response.ok) throw new Error('Quotes unavailable');
    const rows = await response.json() as QuoteRow[];
    for (const row of rows) {
      if (!findAsset(row.symbol)) continue;
      const [last, openPrice, highPrice, percent] = [row.lastPrice, row.openPrice, row.highPrice, row.priceChangePercent].map(Number);
      if (![last, openPrice, highPrice, percent].every(Number.isFinite)) continue;
      quotes.set(row.symbol, { last, open: openPrice, high: highPrice, change: percent });
    }
    if (!quotes.size) throw new Error('No supported quotes received');
    for (const button of list.querySelectorAll<HTMLButtonElement>('[data-symbol]')) {
      const quote = quotes.get(button.dataset.symbol ?? '');
      if (!quote) continue;
      button.querySelector<HTMLElement>('[data-role=quote-price]')!.textContent = formatPrice(quote.last);
      setChange(button.querySelector<HTMLElement>('[data-role=quote-change]')!, quote.change);
    }
    const last = quotes.get(current.symbol)?.last;
    if (last !== undefined && latest.textContent === '—') latest.textContent = formatPrice(last);
    showStatistics();
    status.textContent = 'Binance spot · Updated ' + new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(Date.now());
  } catch {
    if (!active.signal.aborted) status.textContent = quotes.size ? 'Showing last available quotes' : 'Quotes temporarily unavailable';
  } finally {
    if (request === active) request = undefined;
  }
}

list.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLElement>('[data-symbol]');
  const asset = findAsset(button?.dataset.symbol);
  if (asset && asset !== current) chooseMarket(asset);
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-interval]')) {
  button.addEventListener('click', () => {
    const next = button.dataset.interval;
    if (!next || !timeframes.includes(next) || next === interval) return;
    interval = next;
    for (const item of document.querySelectorAll<HTMLButtonElement>('[data-interval]')) item.setAttribute('aria-pressed', String(item === button));
    chart?.load(current, interval, true);
  });
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-chart-mode]')) {
  button.addEventListener('click', () => {
    const next = button.dataset.chartMode;
    if (next !== 'combined' && next !== 'candles' && next !== 'line') return;
    mode = next;
    for (const item of document.querySelectorAll<HTMLButtonElement>('[data-chart-mode]')) item.setAttribute('aria-pressed', String(item === button));
    updateChartLabel();
    chart?.setMode(mode);
  });
}

function start() {
  if (document.hidden || quoteTimer) return;
  try {
    chart = mountChart(canvas, feedStatus, value => { latest.textContent = formatPrice(value); });
    chart.setMode(mode);
    chooseMarket(current);
  } catch {
    feedStatus.textContent = 'Chart unavailable';
  }
  void refreshQuotes();
  quoteTimer = window.setInterval(refreshQuotes, 30000);
}

function stop() {
  chart?.destroy();
  chart = undefined;
  window.clearInterval(quoteTimer);
  quoteTimer = 0;
  request?.abort();
  request = undefined;
}

document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', event => { if (event.persisted) start(); });
start();
