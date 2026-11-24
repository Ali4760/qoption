export const assets = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', code: 'BTC', base: 67420, color: '#ffb15e' },
  { symbol: 'ETHUSDT', name: 'Ethereum', code: 'ETH', base: 3524, color: '#a5a8ff' },
  { symbol: 'SOLUSDT', name: 'Solana', code: 'SOL', base: 169.46, color: '#6bebc1' },
  { symbol: 'XRPUSDT', name: 'XRP', code: 'XRP', base: 0.529, color: '#a6b9d7' },
  { symbol: 'ADAUSDT', name: 'Cardano', code: 'ADA', base: 0.461, color: '#69a9fc' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', code: 'DOGE', base: 0.141, color: '#f2cf79' },
] as const;

export type Asset = typeof assets[number];
export type Point = { time: number; price: number };
export const durations = [30, 60, 300] as const;
export const profitPercent = 80;

export function findAsset(symbol: unknown) {
  return assets.find(asset => asset.symbol === symbol);
}

// A versioned, deterministic simulation. Times are UTC Unix milliseconds.
export function demoPrice(asset: Asset, time: number) {
  const bucket = Math.floor(time / 2000);
  const seed = asset.base % 23;
  const drift = Math.sin(bucket / 843 + seed) * 0.016 + Math.sin(bucket / 127 + seed) * 0.012;
  const cycle = Math.sin(bucket / 29 + seed) * 0.004 + Math.sin(bucket / 9.3 + seed) * 0.0016;
  return Math.round(asset.base * (1 + drift + cycle) * 1e6) / 1e6;
}

export function demoHistory(asset: Asset, intervalMs: number, time = Date.now(), size = 80): Point[] {
  const rounded = Math.floor(time / intervalMs) * intervalMs;
  return Array.from({ length: size }, (_, i) => {
    const at = rounded - (size - i - 1) * intervalMs;
    return { time: at, price: demoPrice(asset, at) };
  });
}
