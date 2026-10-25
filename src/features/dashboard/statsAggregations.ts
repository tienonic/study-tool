import type { CardRow, ReviewLogRow } from '../../core/workers/protocol.ts';

export function activeDeckCards(cards: CardRow[]): CardRow[] {
  return cards.filter(card => card.in_deck !== 0);
}

// --- Helpers ---

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// --- Output Interfaces ---

export interface TodaySummary {
  studied: number;
  correctPct: number;
  againCount: number;
}

export interface FutureDueBar {
  dayOffset: number;
  count: number;
}

export interface CalendarDay {
  date: string;
  count: number;
}

export interface ReviewsBar {
  date: string;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

export interface CardCountSlice {
  label: string;
  count: number;
  color: string;
}

export interface IntervalBucket {
  rangeLabel: string;
  count: number;
}

// --- Aggregation Functions ---

export function aggregateTodaySummary(log: ReviewLogRow[]): TodaySummary {
  const midnight = todayMidnight();
  const today = log.filter(r => new Date(r.review_time) >= midnight);
  const studied = today.length;
  const againCount = today.filter(r => r.rating === 1).length;
  const correctPct = studied > 0 ? Math.round(((studied - againCount) / studied) * 100) : 0;
  return { studied, correctPct, againCount };
}

export function aggregateFutureDue(cards: CardRow[], days: number): FutureDueBar[] {
  const now = todayMidnight();
  const buckets = new Array(days).fill(0) as number[];

  for (const c of cards) {
    if (c.suspended || c.buried || c.fsrs_state === 0) continue;
    const due = new Date(c.due);
    due.setHours(0, 0, 0, 0);
    const offset = Math.round((due.getTime() - now.getTime()) / 86400000);
    const clamped = Math.max(0, Math.min(offset, days - 1));
    buckets[clamped]++;
  }

  return buckets.map((count, i) => ({ dayOffset: i, count }));
}

export function aggregateCalendar(log: ReviewLogRow[], year: number): CalendarDay[] {
  const prefix = String(year);
  const counts = new Map<string, number>();
  for (const r of log) {
    const date = r.review_time.slice(0, 10);
    if (date.startsWith(prefix)) {
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([date, count]) => ({ date, count }));
}

export function aggregateReviews(log: ReviewLogRow[], days: number): ReviewsBar[] {
  if (log.length === 0) return [];
  const now = todayMidnight();

  // Find earliest review
  let earliest = now;
  for (const r of log) {
    const d = new Date(r.review_time);
    d.setHours(0, 0, 0, 0);
    if (d < earliest) earliest = d;
  }

  let start: Date;
  if (days <= 0) {
    start = earliest;
  } else {
    start = new Date(now.getTime() - (days - 1) * 86400000);
  }

  const span = Math.round((now.getTime() - start.getTime()) / 86400000) + 1;
  const map = new Map<string, ReviewsBar>();
  for (let i = 0; i < span; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const ds = dateStr(d);
    map.set(ds, { date: ds, again: 0, hard: 0, good: 0, easy: 0 });
  }

  for (const r of log) {
    const ds = r.review_time.slice(0, 10);
    const bar = map.get(ds);
    if (!bar) continue;
    if (r.rating === 1) bar.again++;
    else if (r.rating === 2) bar.hard++;
    else if (r.rating === 3) bar.good++;
    else if (r.rating === 4) bar.easy++;
  }

  return Array.from(map.values());
}

const CARD_COUNT_COLORS: Record<string, string> = {
  New: '#4a7fb5',
  Learning: '#e8a838',
  Relearning: '#c0392b',
  Young: '#7cc47c',
  Mature: '#2d6b3e',
  Suspended: '#d4c5a9',
};

export function aggregateCardCounts(cards: CardRow[]): CardCountSlice[] {
  const counts: Record<string, number> = {
    New: 0, Learning: 0, Relearning: 0, Young: 0, Mature: 0, Suspended: 0,
  };

  for (const c of cards) {
    if (c.suspended) { counts.Suspended++; continue; }
    switch (c.fsrs_state) {
      case 0: counts.New++; break;
      case 1: counts.Learning++; break;
      case 3: counts.Relearning++; break;
      case 2:
        if (c.scheduled_days < 21) counts.Young++;
        else counts.Mature++;
        break;
    }
  }

  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count, color: CARD_COUNT_COLORS[label] }));
}

export function aggregateIntervals(cards: CardRow[], percentileCap: number | null): IntervalBucket[] {
  const intervals = cards
    .filter(c => c.fsrs_state === 2 && !c.suspended)
    .map(c => c.scheduled_days)
    .sort((a, b) => a - b);

  if (intervals.length === 0) return [];

  let filtered = intervals;
  if (percentileCap !== null && percentileCap < 1) {
    const idx = Math.ceil(intervals.length * percentileCap) - 1;
    const cap = intervals[Math.max(0, idx)];
    filtered = intervals.filter(d => d <= cap);
  }

  const max = filtered[filtered.length - 1];
  const bucketSize = max <= 30 ? 1 : max <= 180 ? 7 : 30;
  const bucketMap = new Map<number, number>();

  for (const d of filtered) {
    const bucket = Math.floor(d / bucketSize) * bucketSize;
    bucketMap.set(bucket, (bucketMap.get(bucket) ?? 0) + 1);
  }

  const numBuckets = Math.floor(max / bucketSize) + 1;
  const result: IntervalBucket[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const days = i * bucketSize;
    result.push({ rangeLabel: String(days), count: bucketMap.get(days) ?? 0 });
  }
  return result;
}

export function formatRetention(r: number | null): string {
  return r != null ? Math.round(r * 100) + '%' : '--';
}

export function avgInterval(cards: CardRow[]): number {
  const intervals = cards
    .filter(c => c.fsrs_state === 2 && !c.suspended)
    .map(c => c.scheduled_days);
  if (intervals.length === 0) return 0;
  return Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
}
