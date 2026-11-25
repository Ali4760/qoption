export const assets = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', code: 'BTC', base: 67420, color: '#f7931a' },
  { symbol: 'BTSUSDT', name: 'BitShares', code: 'BTS', base: 0.0145, color: '#35baeb' },
  { symbol: 'ETHUSDT', name: 'Ethereum', code: 'ETH', base: 3524, color: '#a5a8ff' },
  { symbol: 'XRPUSDT', name: 'XRP', code: 'XRP', base: 0.529, color: '#a6b9d7' },
  { symbol: 'ADAUSDT', name: 'Cardano', code: 'ADA', base: 0.461, color: '#69a9fc' },
  { symbol: 'AVAXUSDT', name: 'Avalanche', code: 'AVAX', base: 34.8, color: '#e84142' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', code: 'DOGE', base: 0.141, color: '#f2cf79' },
  { symbol: 'DOTUSDT', name: 'Polkadot', code: 'DOT', base: 6.45, color: '#e6007a' },
  { symbol: 'SOLUSDT', name: 'Solana', code: 'SOL', base: 169.46, color: '#6bebc1' },
  { symbol: 'TRXUSDT', name: 'TRON', code: 'TRX', base: 0.125, color: '#eb0029' },
  { symbol: 'LINKUSDT', name: 'Chainlink', code: 'LINK', base: 14.2, color: '#375bd2' },
  { symbol: 'MATICUSDT', name: 'Polygon', code: 'MATIC', base: 0.62, color: '#8247e5' },
  { symbol: 'LTCUSDT', name: 'Litecoin', code: 'LTC', base: 78.4, color: '#345d9d' },
  { symbol: 'UNIUSDT', name: 'Uniswap', code: 'UNI', base: 7.65, color: '#ff007a' },
  { symbol: 'ETCUSDT', name: 'Ethereum Classic', code: 'ETC', base: 24.5, color: '#328332' },
  { symbol: 'ATOMUSDT', name: 'Cosmos', code: 'ATOM', base: 8.15, color: '#6f7390' },
  { symbol: 'XLMUSDT', name: 'Stellar', code: 'XLM', base: 0.112, color: '#a8b8d0' },
  { symbol: 'ALGOUSDT', name: 'Algorand', code: 'ALGO', base: 0.178, color: '#7892aa' },
  { symbol: 'FILUSDT', name: 'Filecoin', code: 'FIL', base: 5.25, color: '#0090ff' },
  { symbol: 'VETUSDT', name: 'VeChain', code: 'VET', base: 0.035, color: '#15bdff' },
] as const;

export type Asset = typeof assets[number];
export type Point = { time: number; price: number };
export const durations = [30, 60, 120, 180, 300] as const;
export const profitPercent = 80;
export const durationProfits: Record<number, number> = { 30: 80, 60: 50, 120: 40, 180: 30, 300: 10 };

export function profitForDuration(duration: number): number {
  return durationProfits[duration] ?? profitPercent;
}

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
