import type { GateAsset } from './market';

const spot = 'https://api.gateio.ws/api/v4/spot/';
export const gateFeedVersion = 3;

async function request<T>(path: string, query: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, spot);
  url.search = new URLSearchParams(query).toString();
  const timeout = AbortSignal.timeout(5000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: 'no-store' });
  if (!response.ok) throw new Error('Gate spot is unavailable.');
  return response.json() as Promise<T>;
}

async function verifyMarket(asset: GateAsset, signal?: AbortSignal) {
  const market = await request<{ id: string; base: string; base_name: string; quote: string; trade_status: string; buy_start?: number }>(
    'currency_pairs/' + asset.gatePair, {}, signal,
  );
  // Gate has reused the BTG symbol for different assets.
  if (market.id !== asset.gatePair || market.base !== asset.code || market.base_name !== asset.name ||
      market.quote !== 'USDT' || market.trade_status !== 'tradable') {
    throw new Error('The Openverse Network market is unavailable.');
  }
  return Number(market.buy_start || 0) * 1000;
}

export async function gateTicker(asset: GateAsset) {
  await verifyMarket(asset);
  const rows = await request<{ currency_pair: string; last: string; change_percentage: string }[]>(
    'tickers', { currency_pair: asset.gatePair },
  );
  const row = rows.find(ticker => ticker.currency_pair === asset.gatePair);
  const price = Number(row?.last);
  const change = Number(row?.change_percentage);
  return Number.isFinite(price) && price > 0 && Number.isFinite(change) ? { price, change } : null;
}

export async function gateCandles(asset: GateAsset, interval: string, limit: number, signal: AbortSignal) {
  const startedAt = await verifyMarket(asset, signal);
  const rows = await request<string[][]>('candlesticks', { currency_pair: asset.gatePair, interval, limit: String(limit) }, signal);
  return rows.filter(row => Number(row[0]) * 1000 >= startedAt);
}

export async function gateTradePrice(asset: GateAsset, window?: { from: number; to: number }) {
  const startedAt = await verifyMarket(asset);
  const query: Record<string, string> = { currency_pair: asset.gatePair, limit: window ? '100' : '1' };
  if (window) {
    query.from = String(Math.floor(window.from / 1000));
    query.to = String(Math.ceil(window.to / 1000));
  }
  const rows = await request<{ currency_pair: string; price: string; create_time_ms: string }[]>('trades', query);
  let latest: { time: number; price: number } | undefined;
  for (const row of rows) {
    const time = Number(row.create_time_ms);
    const price = Number(row.price);
    if (row.currency_pair !== asset.gatePair || !Number.isFinite(time) || time <= 0 || time < startedAt || !Number.isFinite(price) || price <= 0) continue;
    if (window && (time < window.from || time > window.to)) continue;
    if (!latest || time > latest.time) latest = { time, price };
  }
  return latest?.price ?? null;
}
