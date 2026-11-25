import { demoHistory, demoPrice, type Asset, type Point } from '../../../functions/src/market';

export type ChartMode = 'line' | 'candles' | 'combined';
type ChartPoint = Point & { open?: number; high?: number; low?: number; volume?: number };

function candlePoint(time: number, open: string, high: string, low: string, close: string, volume: string): ChartPoint | null {
  const values = [time, Number(open), Number(high), Number(low), Number(close)];
  if (!values.every(Number.isFinite)) return null;
  const baseVolume = Number(volume);
  return { time, open: values[1], high: values[2], low: values[3], price: values[4],
    volume: Number.isFinite(baseVolume) && baseVolume >= 0 ? baseVolume : undefined };
}

const frames: Record<string, number> = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
const timeLabel = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
export const timeframes = Object.keys(frames);
export const formatPrice = (value: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: value < 1 ? 4 : 2, maximumFractionDigits: value < 1 ? 6 : 2 }).format(value);

export function mountChart(canvas: HTMLCanvasElement, status: HTMLElement, onPrice: (price: number) => void) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  const style = getComputedStyle(canvas);
  const color = (name: string) => style.getPropertyValue(name).trim();
  const palette = {
    grid: color('--line'), axis: color('--quiet'), line: color('--chart-line'),
    fill: color('--chart-fill'), up: color('--chart-up'), down: color('--chart-down'),
    text: color('--accent-ink'), marker: color('--accent'),
  };
  let points: ChartPoint[] = [], socket: WebSocket | undefined, timer = 0, generation = 0, offset = 0, windowSize = 66;
  let retries = 0, pointer: { x: number; offset: number } | undefined;
  let pending: AbortController | undefined;
  let singleFrame = 0;
  let currentFrame = '1m';
  let mode: ChartMode = 'line';

  function draw() {
    singleFrame = 0;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !ctx) return;
    const scale = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    ctx.scale(scale, scale);
    const left = 12, right = w - (w < 440 ? 72 : 87), top = 17, plotBottom = h - 36;
    const end = Math.max(2, points.length - offset);
    const visible = points.slice(Math.max(0, end - windowSize), end);
    if (visible.length < 2 || right <= left) return;
    const showCandles = mode !== 'line';
    const maximumVolume = mode === 'combined' ? Math.max(0, ...visible.map(point => point.volume ?? 0)) : 0;
    const volumeHeight = maximumVolume ? Math.min(58, (plotBottom - top) * 0.23) : 0;
    const bottom = plotBottom - volumeHeight - (volumeHeight ? 7 : 0);
    const min = Math.min(...visible.map(point => showCandles ? point.low ?? point.price : point.price));
    const max = Math.max(...visible.map(point => showCandles ? point.high ?? point.price : point.price));
    const pad = Math.max((max - min) * 0.14, max * 0.0004);
    const high = max + pad, low = min - pad;
    const x = (i: number) => left + (right - left) * i / (visible.length - 1);
    const y = (value: number) => bottom - (value - low) * (bottom - top) / (high - low);
    ctx.font = '11px system-ui';
    ctx.strokeStyle = palette.grid;
    for (let i = 0; i <= 5; i++) {
      const price = high - i * (high - low) / 5;
      const at = Math.round(y(price)) + .5;
      ctx.beginPath(); ctx.moveTo(left, at); ctx.lineTo(right + 3, at); ctx.stroke();
      ctx.fillStyle = palette.axis; ctx.fillText(formatPrice(price), right + 10, at + 4);
    }
    const columns = w < 520 ? 4 : 7;
    for (let i = 0; i < columns; i++) {
      const index = Math.round((visible.length - 1) * i / columns), at = x(index);
      ctx.beginPath(); ctx.moveTo(at, top); ctx.lineTo(at, plotBottom); ctx.stroke();
      ctx.fillStyle = palette.axis;
      const date = new Date(visible[index].time);
      ctx.fillText(currentFrame === '1d' || currentFrame === '4h' ? dayLabel.format(date) : timeLabel.format(date), at, plotBottom + 23);
    }
    const candleWidth = Math.max(2, Math.min(9, (right - left) / visible.length * 0.64));
    const candleColor = (point: ChartPoint) => point.price >= (point.open ?? point.price) ? palette.up : palette.down;
    const tracePrice = () => {
      ctx.beginPath();
      visible.forEach((point, i) => i ? ctx.lineTo(x(i), y(point.price)) : ctx.moveTo(x(i), y(point.price)));
    };

    if (volumeHeight) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      visible.forEach((point, i) => {
        const barHeight = (point.volume ?? 0) / maximumVolume * volumeHeight;
        ctx.fillStyle = candleColor(point);
        ctx.fillRect(x(i) - candleWidth / 2, plotBottom - barHeight, candleWidth, barHeight);
      });
      ctx.restore();
      ctx.fillStyle = palette.axis;
      ctx.fillText('Volume', right + 10, plotBottom - volumeHeight / 2);
    }
    if (showCandles) {
      visible.forEach((point, index) => {
        const open = point.open ?? point.price;
        const center = x(index);
        ctx.fillStyle = ctx.strokeStyle = candleColor(point);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(center, y(point.high ?? point.price));
        ctx.lineTo(center, y(point.low ?? point.price));
        ctx.stroke();
        const bodyTop = Math.min(y(open), y(point.price));
        ctx.fillRect(center - candleWidth / 2, bodyTop, candleWidth, Math.max(2, Math.abs(y(open) - y(point.price))));
      });
    } else {
      tracePrice();
      const gradient = ctx.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, palette.fill); gradient.addColorStop(1, 'transparent');
      ctx.lineTo(right, bottom); ctx.lineTo(left, bottom); ctx.closePath();
      ctx.fillStyle = gradient; ctx.fill();
    }
    if (mode !== 'candles') {
      tracePrice();
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = mode === 'combined' ? 1.7 : 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    if (!offset) {
      const last = visible[visible.length - 1], yLast = y(last.price);
      ctx.beginPath(); ctx.arc(right, yLast, 4, 0, Math.PI * 2); ctx.fillStyle = palette.line; ctx.fill();
      ctx.fillStyle = palette.marker; ctx.fillRect(right + 5, yLast - 11, w - right - 6, 22);
      ctx.fillStyle = palette.text; ctx.fillText(formatPrice(last.price), right + 9, yLast + 4);
    }
  }
  function paint() { if (!singleFrame) singleFrame = requestAnimationFrame(draw); }
  const resize = new ResizeObserver(paint);
  resize.observe(canvas);
  const listeners = new AbortController();

  canvas.addEventListener('pointerdown', event => {
    pointer = { x: event.clientX, offset }; canvas.setPointerCapture(event.pointerId);
  }, { signal: listeners.signal });
  canvas.addEventListener('pointermove', event => {
    if (!pointer) return;
    offset = Math.max(0, Math.min(points.length - windowSize, pointer.offset + Math.round((event.clientX - pointer.x) / 7)));
    paint();
  }, { signal: listeners.signal });
  for (const event of ['pointerup', 'pointercancel']) canvas.addEventListener(event, () => { pointer = undefined; }, { signal: listeners.signal });
  canvas.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    windowSize = Math.max(24, Math.min(130, windowSize + (event.deltaY > 0 ? 8 : -8)));
    offset = Math.min(offset, Math.max(0, points.length - windowSize)); paint();
  }, { passive: false, signal: listeners.signal });

  function stop() {
    clearTimeout(timer); socket?.close(); socket = undefined; pending?.abort(); pending = undefined;
  }

  function load(asset: Asset, frame: string, live: boolean, clockOffset = 0) {
    generation++;
    const id = generation, interval = frames[frame] || frames['1m'];
    stop();
    points = []; offset = 0; retries = 0; currentFrame = frame; paint();
    if (!live) {
      status.textContent = 'Simulated feed';
      const tick = () => {
        if (generation !== id) return;
        const now = Date.now() + clockOffset, price = demoPrice(asset, now);
        points = demoHistory(asset, interval, now, 160);
        points[points.length - 1] = { time: now, price };
        onPrice(price); paint(); timer = window.setTimeout(tick, 1200);
      };
      tick();
      return;
    }
    const market = async () => {
      if (generation !== id) return;
      pending = new AbortController();
      status.textContent = retries ? 'Reconnecting to Binance…' : 'Connecting to Binance…';
      try {
        const query = new URLSearchParams({ symbol: asset.symbol, interval: frame, limit: '180' });
        const response = await fetch('https://data-api.binance.vision/api/v3/klines?' + query, { signal: AbortSignal.any([pending.signal, AbortSignal.timeout(12000)]) });
        if (!response.ok) throw new Error('Market request failed');
        const rows = await response.json() as [number, string, string, string, string, string][];
        const history = rows.map(row => candlePoint(row[0], row[1], row[2], row[3], row[4], row[5]))
          .filter((point): point is ChartPoint => point !== null);
        if (generation !== id) return;
        if (!history.length) throw new Error('Empty market history');
        points = history; onPrice(history.at(-1)!.price); paint();
        const symbol = asset.symbol.toLowerCase();
        const active = new WebSocket('wss://data-stream.binance.vision/ws/' + symbol + '@kline_' + frame);
        socket = active;
        active.addEventListener('message', event => {
          if (id !== generation) return;
          try {
            const candle = JSON.parse(event.data).k as { t: number; o: string; h: string; l: string; c: string; v: string } | undefined;
            const point = candle && candlePoint(candle.t, candle.o, candle.h, candle.l, candle.c, candle.v);
            if (!point) return;
            if (points.at(-1)?.time === point.time) points[points.length - 1] = point;
            else if (!points.length || point.time > points.at(-1)!.time) points = [...points, point].slice(-250);
            else return;
            status.textContent = 'Binance spot · live'; retries = 0; onPrice(point.price); paint();
          } catch { /* Ignore malformed provider messages. */ }
        });
        active.addEventListener('error', () => active.close());
        active.addEventListener('close', retry, { once: true });
      } catch { retry(); }
    };
    function retry() {
      if (generation !== id) return;
      status.textContent = 'Feed unavailable · retrying';
      timer = window.setTimeout(() => void market(), Math.min(30000, 1500 * 2 ** retries++));
    }
    void market();
  }

  return { load, setMode(next: ChartMode) { mode = next; canvas.dataset.chartMode = next; paint(); }, destroy() {
    generation++; stop(); listeners.abort(); resize.disconnect(); cancelAnimationFrame(singleFrame);
  }};
}
