import { niceYTicks } from '../activity/chartUtils.ts';

// --- Types ---

export interface HitRegion {
  x: number; y: number; w: number; h: number;
  label: string;
  value: string;
}

// --- Canvas Setup ---

function setup(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

const C = {
  axis: '#b3a89a',
  text: '#4a4540',
  grid: '#e8e0d4',
  bar: '#4a7fb5',
  again: '#c0392b',
  hard: '#e8a838',
  good: '#2d6b3e',
  easy: '#4a7fb5',
};

function drawEmpty(canvas: HTMLCanvasElement): HitRegion[] {
  const { ctx, w, h } = setup(canvas);
  ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No data', w / 2, h / 2);
  return [];
}

function yAxis(ctx: CanvasRenderingContext2D, ticks: number[], yMax: number, lp: number, rp: number, tp: number, plotH: number, w: number) {
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const tick of ticks) {
    const y = tp + (1 - tick / yMax) * plotH;
    ctx.fillStyle = C.text;
    ctx.fillText(String(tick), lp - 4, y);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(lp, y);
    ctx.lineTo(w - rp, y);
    ctx.stroke();
  }
}

// --- Tooltip helper ---

export function setupTooltip(canvas: HTMLCanvasElement, tip: HTMLDivElement, regions: HitRegion[]) {
  function onMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.clientWidth / rect.width;
    const scaleY = canvas.clientHeight / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const hit = regions.find(r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
    if (hit) {
      tip.textContent = `${hit.label}: ${hit.value}`;
      tip.style.left = `${mx + 10}px`;
      tip.style.top = `${my - 6}px`;
      tip.classList.add('sm-tooltip--visible');
    } else {
      tip.classList.remove('sm-tooltip--visible');
    }
  }
  function onLeave() { tip.classList.remove('sm-tooltip--visible'); }
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', onLeave);
  return () => {
    canvas.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('mouseleave', onLeave);
  };
}

// --- Bar Chart ---

export function drawBarChart(
  canvas: HTMLCanvasElement,
  bars: { label: string; value: number }[],
  color = C.bar,
): HitRegion[] {
  if (bars.length === 0) return drawEmpty(canvas);
  const { ctx, w, h } = setup(canvas);

  const lp = 35, rp = 10, tp = 10, bp = 20;
  const plotW = w - lp - rp;
  const plotH = h - tp - bp;
  const maxVal = Math.max(...bars.map(b => b.value), 1);
  const ticks = niceYTicks(0, maxVal, 5);
  const yMax = ticks[ticks.length - 1] || maxVal;

  yAxis(ctx, ticks, yMax, lp, rp, tp, plotH, w);

  const barW = Math.max(1, plotW / bars.length - 1);
  const regions: HitRegion[] = [];
  ctx.fillStyle = color;
  for (let i = 0; i < bars.length; i++) {
    const x = lp + (i / bars.length) * plotW;
    const bh = (bars[i].value / yMax) * plotH;
    if (bh > 0) ctx.fillRect(x, tp + plotH - bh, barW, bh);
    regions.push({ x, y: tp, w: barW, h: plotH, label: bars[i].label, value: String(bars[i].value) });
  }

  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '9px Inter, system-ui, sans-serif';
  const step = Math.max(1, Math.floor(bars.length / 8));
  for (let i = 0; i < bars.length; i += step) {
    const x = lp + ((i + 0.5) / bars.length) * plotW;
    ctx.fillText(bars[i].label, x, tp + plotH + 3);
  }

  return regions;
}

// --- Stacked Bar Chart ---

export function drawStackedBarChart(
  canvas: HTMLCanvasElement,
  bars: { label: string; again: number; hard: number; good: number; easy: number }[],
): HitRegion[] {
  if (bars.length === 0) return drawEmpty(canvas);
  const { ctx, w, h } = setup(canvas);

  const lp = 35, rp = 10, tp = 10, bp = 20;
  const plotW = w - lp - rp;
  const plotH = h - tp - bp;
  const maxVal = Math.max(...bars.map(b => b.again + b.hard + b.good + b.easy), 1);
  const ticks = niceYTicks(0, maxVal, 5);
  const yMax = ticks[ticks.length - 1] || maxVal;

  yAxis(ctx, ticks, yMax, lp, rp, tp, plotH, w);

  const barW = Math.max(1, plotW / bars.length - 1);
  const segs: { color: string; key: 'again' | 'hard' | 'good' | 'easy' }[] = [
    { color: C.again, key: 'again' },
    { color: C.hard, key: 'hard' },
    { color: C.good, key: 'good' },
    { color: C.easy, key: 'easy' },
  ];

  const regions: HitRegion[] = [];
  for (let i = 0; i < bars.length; i++) {
    const x = lp + (i / bars.length) * plotW;
    let cum = 0;
    for (const seg of segs) {
      const val = bars[i][seg.key];
      if (val <= 0) continue;
      const segH = (val / yMax) * plotH;
      ctx.fillStyle = seg.color;
      ctx.fillRect(x, tp + plotH - cum - segH, barW, segH);
      cum += segH;
    }
    const b = bars[i];
    const total = b.again + b.hard + b.good + b.easy;
    regions.push({
      x, y: tp, w: barW, h: plotH,
      label: b.label,
      value: total > 0 ? `${total} (${b.again}A ${b.hard}H ${b.good}G ${b.easy}E)` : '0',
    });
  }

  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '9px Inter, system-ui, sans-serif';
  const step = Math.max(1, Math.floor(bars.length / 8));
  for (let i = 0; i < bars.length; i += step) {
    const x = lp + ((i + 0.5) / bars.length) * plotW;
    ctx.fillText(bars[i].label, x, tp + plotH + 3);
  }

  return regions;
}

// --- Pie Chart ---

export function drawPieChart(
  canvas: HTMLCanvasElement,
  slices: { label: string; value: number; color: string }[],
): HitRegion[] {
  const nonZero = slices.filter(s => s.value > 0);
  if (nonZero.length === 0) return drawEmpty(canvas);
  const { ctx, w, h } = setup(canvas);

  const total = nonZero.reduce((s, sl) => s + sl.value, 0);
  const cx = w * 0.32, cy = h * 0.5;
  const radius = Math.min(cx - 10, cy - 10);

  let angle = -Math.PI / 2;
  for (const sl of nonZero) {
    const arc = (sl.value / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + arc);
    ctx.closePath();
    ctx.fillStyle = sl.color;
    ctx.fill();
    angle += arc;
  }

  // Legend
  ctx.font = '500 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lx = w * 0.6;
  let ly = Math.max(14, (h - nonZero.length * 24) / 2);
  for (const sl of nonZero) {
    ctx.fillStyle = sl.color;
    ctx.fillRect(lx, ly - 5, 10, 10);
    ctx.fillStyle = C.text;
    const pct = Math.round((sl.value / total) * 100);
    ctx.fillText(`${sl.label}  ${sl.value}  ${pct}%`, lx + 14, ly);
    ly += 24;
  }

  return []; // pie uses legend, no bar-style tooltips
}

// --- Heatmap ---

export function drawHeatmap(
  canvas: HTMLCanvasElement,
  days: { date: string; count: number }[],
  year: number,
): HitRegion[] {
  const { ctx, w, h } = setup(canvas);

  const dayMap = new Map(days.map(d => [d.date, d.count]));
  const maxCount = Math.max(1, ...days.map(d => d.count));

  const jan1 = new Date(year, 0, 1);
  const startDow = jan1.getDay();

  const lp = 24, tp = 16;
  const cellSize = Math.min(11, (w - lp - 10) / 54);
  const gap = 2;

  // Month labels
  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for (let m = 0; m < 12; m++) {
    const first = new Date(year, m, 1);
    const dayOfYear = Math.floor((first.getTime() - jan1.getTime()) / 86400000);
    const wk = Math.floor((dayOfYear + startDow) / 7);
    ctx.fillText(months[m], lp + wk * (cellSize + gap) + cellSize / 2, 0);
  }

  // Day-of-week labels
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const dowLabels = ['', 'M', '', 'W', '', 'F', ''];
  for (let d = 0; d < 7; d++) {
    if (dowLabels[d]) {
      ctx.fillText(dowLabels[d], lp - 4, tp + d * (cellSize + gap) + cellSize / 2);
    }
  }

  // Cells — warm palette
  const pal = ['#e8e0d4', '#ddc9a3', '#c4a56e', '#9a7d4a', '#6b5430'];
  const endDate = new Date(year, 11, 31);
  const totalDays = Math.floor((endDate.getTime() - jan1.getTime()) / 86400000) + 1;
  const regions: HitRegion[] = [];

  for (let d = 0; d < totalDays; d++) {
    const date = new Date(jan1.getTime() + d * 86400000);
    const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const count = dayMap.get(ds) ?? 0;
    const dayInWeek = (d + startDow) % 7;
    const wk = Math.floor((d + startDow) / 7);

    let level = 0;
    if (count > 0) level = Math.min(4, Math.ceil((count / maxCount) * 4));

    const cx = lp + wk * (cellSize + gap);
    const cy = tp + dayInWeek * (cellSize + gap);
    ctx.fillStyle = pal[level];
    ctx.fillRect(cx, cy, cellSize, cellSize);

    if (count > 0) {
      regions.push({ x: cx, y: cy, w: cellSize, h: cellSize, label: ds, value: `${count} reviews` });
    }
  }

  return regions;
}
