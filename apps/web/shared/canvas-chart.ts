import { demoHistory, demoPrice, isGateAsset, type Asset, type DemoAsset, type Point } from '../../../functions/src/market';
import { gateCandles } from '../../../functions/src/gate-market';

export type ChartMode = 'line' | 'candles' | 'combined';
type ChartPoint = Point & { open?: number; high?: number; low?: number; volume?: number };
export type ChartMountOptions = {
  replica?: boolean;
  onMarker?: (pos: { x: number; y: number; up: boolean } | null) => void;
};

function candlePoint(time: number, open: string, high: string, low: string, close: string, volume: string): ChartPoint | null {
  const values = [time, Number(open), Number(high), Number(low), Number(close)];
  if (!values.every(Number.isFinite)) return null;
  const baseVolume = Number(volume);
  return { time, open: values[1], high: values[2], low: values[3], price: values[4],
    volume: Number.isFinite(baseVolume) && baseVolume >= 0 ? baseVolume : undefined };
}

const frames: Record<string, number> = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
const timeLabel = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
export const timeframes = Object.keys(frames);
export const formatPrice = (value: number) => {
  const digits = value < 1 ? 4 : 4;
  return Number(value).toFixed(digits);
};

export function mountChart(
  canvas: HTMLCanvasElement,
  status: HTMLElement,
  onPrice: (price: number) => void,
  options: ChartMountOptions = {},
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  const style = getComputedStyle(canvas);
  const color = (name: string) => style.getPropertyValue(name).trim();
  const palette = {
    grid: color('--line') || 'rgba(164, 183, 202, 0.13)',
    axis: color('--quiet') || '#8fa2bb',
    line: options.replica ? '#0d6efd' : color('--chart-line'),
    fill: options.replica ? 'rgba(13, 110, 253, 0.34)' : color('--chart-fill'),
    up: color('--chart-up') || '#1fd6a4',
    down: color('--chart-down') || '#ff5d72',
    text: options.replica ? '#eef5fb' : color('--accent-ink'),
    marker: options.replica ? '#0d6efd' : color('--accent'),
  };
  let points: ChartPoint[] = [], socket: WebSocket | undefined, timer = 0, generation = 0, offset = 0, windowSize = 66;
  let retries = 0, pointer: { x: number; offset: number } | undefined;
  let pending: AbortController | undefined;
  let singleFrame = 0;
  let currentFrame = '1m';
  let mode: ChartMode = 'line';
  let fallbackTimer = 0;

  function draw() {
    singleFrame = 0;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !ctx) return;
    const scale = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (options.replica) {
      ctx.fillStyle = '#0d1523';
      ctx.fillRect(0, 0, w, h);
    }
    const rightAxisW = options.replica ? 78 : (w < 440 ? 72 : 87);
    const left = options.replica ? 8 : 12;
    const right = w - rightAxisW - (options.replica ? 18 : 0);
    const top = options.replica ? 24 : 17;
    const plotBottom = h - (options.replica ? 30 : 36);
    const end = Math.max(2, points.length - offset);
    const visible = points.slice(Math.max(0, end - windowSize), end);
    if (visible.length < 2 || right <= left) {
      options.onMarker?.(null);
      return;
    }
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

    if (options.replica) {
      ctx.fillStyle = '#111b2c';
      ctx.fillRect(w - rightAxisW, 0, rightAxisW, h);
    }

    ctx.font = options.replica ? '700 10px Outfit, system-ui, sans-serif' : '11px system-ui';
    ctx.strokeStyle = options.replica ? 'rgba(164, 183, 202, 0.12)' : palette.grid;
    ctx.lineWidth = 1;
    const rows = options.replica ? 4 : 5;
    for (let i = 0; i <= rows; i++) {
      const price = high - i * (high - low) / rows;
      const at = Math.round(y(price)) + .5;
      ctx.beginPath(); ctx.moveTo(0, at); ctx.lineTo(w - rightAxisW, at); ctx.stroke();
      ctx.fillStyle = options.replica ? '#8fa2bb' : palette.axis;
      ctx.textAlign = options.replica ? 'right' : 'left';
      ctx.fillText(formatPrice(price), options.replica ? w - 8 : w - rightAxisW + 10, at + 4);
    }
    const columns = w < 520 ? 4 : 6;
    ctx.textAlign = 'center';
    for (let i = 1; i <= columns; i++) {
      const index = Math.min(visible.length - 1, Math.round((visible.length - 1) * i / (columns + 1)));
      const at = x(index);
      ctx.beginPath(); ctx.moveTo(at, 0); ctx.lineTo(at, plotBottom); ctx.stroke();
      ctx.fillStyle = options.replica ? '#8fa2bb' : palette.axis;
      const date = new Date(visible[index].time);
      ctx.fillText(currentFrame === '1d' || currentFrame === '4h' ? dayLabel.format(date) : timeLabel.format(date), at, plotBottom + 20);
    }
    if (options.replica) {
      ctx.strokeStyle = 'rgba(177, 196, 219, 0.18)';
      ctx.beginPath(); ctx.moveTo(w - rightAxisW, 0); ctx.lineTo(w - rightAxisW, h); ctx.stroke();
    }
    ctx.textAlign = 'left';
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
      ctx.fillText('Volume', w - rightAxisW + 10, plotBottom - volumeHeight / 2);
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
      gradient.addColorStop(0, palette.fill);
      gradient.addColorStop(1, options.replica ? 'rgba(13, 110, 253, 0.02)' : 'transparent');
      ctx.lineTo(right, bottom); ctx.lineTo(left, bottom); ctx.closePath();
      ctx.fillStyle = gradient; ctx.fill();
    }
    if (mode !== 'candles') {
      tracePrice();
      ctx.strokeStyle = palette.line;
      if (options.replica) {
        ctx.shadowColor = 'rgba(13, 110, 253, 0.58)';
        ctx.shadowBlur = 8;
      }
      ctx.lineWidth = mode === 'combined' ? 1.7 : 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    if (!offset) {
      const last = visible[visible.length - 1];
      const prev = visible[visible.length - 2] ?? last;
      const yLast = y(last.price);
      if (options.replica) {
        ctx.strokeStyle = 'rgba(13, 110, 253, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(right, yLast); ctx.lineTo(w - rightAxisW, yLast); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(right, yLast, 4, 0, Math.PI * 2); ctx.fillStyle = palette.line; ctx.fill();
      ctx.fillStyle = palette.marker;
      const boxY = Math.max(top, Math.min(bottom - 18, yLast - 10));
      ctx.fillRect(w - rightAxisW + 2, boxY, rightAxisW - 4, 20);
      ctx.fillStyle = palette.text;
      ctx.textAlign = 'center';
      ctx.font = '700 10px Outfit, system-ui, sans-serif';
      ctx.fillText(formatPrice(last.price), w - rightAxisW + (rightAxisW / 2), boxY + 13, rightAxisW - 8);
      ctx.textAlign = 'left';
      options.onMarker?.({ x: right, y: yLast, up: last.price >= prev.price });
    } else {
      options.onMarker?.(null);
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
    if (!event.ctrlKey && !options.replica) return;
    event.preventDefault();
    windowSize = Math.max(24, Math.min(130, windowSize + (event.deltaY > 0 ? 8 : -8)));
    offset = Math.min(offset, Math.max(0, points.length - windowSize)); paint();
  }, { passive: false, signal: listeners.signal });

  function stop() {
    clearTimeout(timer); clearInterval(fallbackTimer); fallbackTimer = 0; socket?.close(); socket = undefined; pending?.abort(); pending = undefined;
  }

  function startSimulated(asset: DemoAsset, interval: number, id: number, clockOffset = 0, labelText = 'Live market data') {
    status.textContent = labelText;
    const tick = () => {
      if (generation !== id) return;
      const now = Date.now() + clockOffset, price = demoPrice(asset, now);
      points = demoHistory(asset, interval, now, 160);
      points[points.length - 1] = { time: now, price };
      if (options.replica) {
        points = points.map((point, index, history) => {
          const open = history[index - 1]?.price ?? point.price;
          return { ...point, open, high: Math.max(open, point.price), low: Math.min(open, point.price) };
        });
      }
      onPrice(price); paint(); timer = window.setTimeout(tick, 1200);
    };
    tick();
  }

  function load(asset: Asset, frame: string, live: boolean, clockOffset = 0) {
    generation++;
    const id = generation, interval = frames[frame] || frames['1m'];
    stop();
    points = []; offset = 0; retries = 0; currentFrame = frame; paint();
    if (isGateAsset(asset)) {
      const refresh = async () => {
        pending = new AbortController();
        try {
          const rows = await gateCandles(asset, frame, points.length ? 3 : 180, pending.signal);
          const history = rows.map(row => candlePoint(Number(row[0]) * 1000, row[5], row[3], row[4], row[2], row[6]))
            .filter((point): point is ChartPoint => point !== null)
            .sort((a, b) => a.time - b.time);
          if (generation !== id) return;
          const first = history[0], latest = history.at(-1);
          if (!first || !latest) throw new Error('Empty Gate market history.');
          points = [...points.filter(point => point.time < first.time), ...history].slice(-250);
          status.textContent = 'Live market data · Gate';
          onPrice(latest.price);
          paint();
        } catch {
          if (generation === id) status.textContent = 'Gate market data unavailable';
        } finally {
          if (generation === id) timer = window.setTimeout(() => void refresh(), 5000);
        }
      };
      status.textContent = 'Connecting to Gate spot';
      void refresh();
      return;
    }
    if (!live) {
      startSimulated(asset, interval, id, clockOffset, 'Live market data');
      return;
    }
    const market = async () => {
      if (generation !== id) return;
      pending = new AbortController();
      status.textContent = retries ? 'Reconnecting to market…' : 'Connecting to market data';
      try {
        const query = new URLSearchParams({ symbol: asset.symbol, interval: frame, limit: '180' });
        const response = await fetch('https://data-api.binance.vision/api/v3/klines?' + query, { signal: AbortSignal.any([pending.signal, AbortSignal.timeout(9000)]) });
        if (!response.ok) throw new Error('Market request failed');
        const rows = await response.json() as [number, string, string, string, string, string][];
        const history = rows.map(row => candlePoint(row[0], row[1], row[2], row[3], row[4], row[5]))
          .filter((point): point is ChartPoint => point !== null);
        if (generation !== id) return;
        if (!history.length) throw new Error('Empty market history');
        points = history; status.textContent = 'Live market data'; onPrice(history.at(-1)!.price); paint();
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
            status.textContent = 'Live market data'; retries = 0; onPrice(point.price); paint();
          } catch { /* Ignore malformed provider messages. */ }
        });
        active.addEventListener('error', () => active.close());
        active.addEventListener('close', retry, { once: true });
      } catch {
        // Fallback smoothly to deterministic market feed if external provider is unavailable or offline.
        if (generation === id && !points.length) {
          startSimulated(asset, interval, id, clockOffset, 'Live market data');
        } else {
          retry();
        }
      }
    };
    function retry() {
      if (generation !== id) return;
      status.textContent = 'Reconnecting…';
      timer = window.setTimeout(() => void market(), Math.min(30000, 2000 * 2 ** retries++));
    }
    void market();
  }

  return { load, setMode(next: ChartMode) { mode = next; canvas.dataset.chartMode = next; paint(); }, destroy() {
    generation++; stop(); listeners.abort(); resize.disconnect(); cancelAnimationFrame(singleFrame);
  }};
}
