import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  activeDeckCards,
  aggregateTodaySummary,
  aggregateFutureDue,
  aggregateCalendar,
  aggregateReviews,
  aggregateCardCounts,
  aggregateIntervals,
  avgInterval,
} from './statsAggregations.ts';

describe('activeDeckCards', () => {
  it('keeps legacy/current active rows and excludes explicitly inactive membership', () => {
    expect(activeDeckCards([
      card({ card_id: 'active', in_deck: 1 }),
      card({ card_id: 'legacy' }),
      card({ card_id: 'inactive', in_deck: 0 }),
    ]).map(row => row.card_id)).toEqual(['active', 'legacy']);
  });
});
import type { CardRow, ReviewLogRow } from '../../core/workers/protocol.ts';

// Helper: build a minimal ReviewLogRow
function review(overrides: Partial<ReviewLogRow> & { rating: number; review_time: string }): ReviewLogRow {
  return { id: 'r1', card_id: 'c1', project_id: 'p1', section_id: 's1', ...overrides };
}

// Helper: build a minimal CardRow
function card(overrides: Partial<CardRow>): CardRow {
  return {
    card_id: 'c1', project_id: 'p1', section_id: 's1', card_type: 'mcq',
    fsrs_state: 2, due: new Date().toISOString(), stability: 5, difficulty: 0.5,
    elapsed_days: 0, scheduled_days: 10, reps: 3, lapses: 0,
    last_review: null, suspended: 0, buried: 0, leech: 0,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// === aggregateTodaySummary ===

describe('aggregateTodaySummary', () => {
  it('returns zeros for empty log', () => {
    const result = aggregateTodaySummary([]);
    expect(result).toEqual({ studied: 0, correctPct: 0, againCount: 0 });
  });

  it('counts only reviews from today', () => {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000 * 2).toISOString();
    const log = [
      review({ rating: 3, review_time: now }),
      review({ rating: 3, review_time: now }),
      review({ rating: 3, review_time: yesterday }),
    ];
    const result = aggregateTodaySummary(log);
    expect(result.studied).toBe(2);
  });

  it('calculates correct percentage (Again = wrong)', () => {
    const now = new Date().toISOString();
    const log = [
      review({ rating: 3, review_time: now }),
      review({ rating: 1, review_time: now }),
      review({ rating: 4, review_time: now }),
      review({ rating: 1, review_time: now }),
    ];
    const result = aggregateTodaySummary(log);
    expect(result.studied).toBe(4);
    expect(result.againCount).toBe(2);
    expect(result.correctPct).toBe(50);
  });
});

// === aggregateCalendar ===

describe('aggregateCalendar', () => {
  it('returns empty for no reviews', () => {
    expect(aggregateCalendar([], 2026)).toEqual([]);
  });

  it('groups reviews by date for the given year', () => {
    const log = [
      review({ rating: 3, review_time: '2026-03-25T10:00:00Z' }),
      review({ rating: 3, review_time: '2026-03-25T14:00:00Z' }),
      review({ rating: 3, review_time: '2026-03-24T10:00:00Z' }),
      review({ rating: 3, review_time: '2025-12-01T10:00:00Z' }), // wrong year
    ];
    const result = aggregateCalendar(log, 2026);
    expect(result).toHaveLength(2);
    expect(result.find(d => d.date === '2026-03-25')?.count).toBe(2);
    expect(result.find(d => d.date === '2026-03-24')?.count).toBe(1);
  });
});

// === aggregateCardCounts ===

describe('aggregateCardCounts', () => {
  it('returns empty for no cards', () => {
    expect(aggregateCardCounts([])).toEqual([]);
  });

  it('categorizes cards by FSRS state', () => {
    const cards = [
      card({ fsrs_state: 0 }),                             // New
      card({ fsrs_state: 1 }),                             // Learning
      card({ fsrs_state: 3 }),                             // Relearning
      card({ fsrs_state: 2, scheduled_days: 10 }),         // Young (<21d)
      card({ fsrs_state: 2, scheduled_days: 30 }),         // Mature (>=21d)
      card({ fsrs_state: 2, suspended: 1 }),               // Suspended
    ];
    const result = aggregateCardCounts(cards);
    const byLabel = Object.fromEntries(result.map(s => [s.label, s.count]));
    expect(byLabel.New).toBe(1);
    expect(byLabel.Learning).toBe(1);
    expect(byLabel.Relearning).toBe(1);
    expect(byLabel.Young).toBe(1);
    expect(byLabel.Mature).toBe(1);
    expect(byLabel.Suspended).toBe(1);
  });

  it('omits categories with zero count', () => {
    const cards = [card({ fsrs_state: 0 })];
    const result = aggregateCardCounts(cards);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('New');
  });
});

// === aggregateFutureDue ===

describe('aggregateFutureDue', () => {
  it('returns correct number of buckets', () => {
    const result = aggregateFutureDue([], 7);
    expect(result).toHaveLength(7);
    expect(result.every(b => b.count === 0)).toBe(true);
  });

  it('skips suspended, buried, and new cards', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const cards = [
      card({ fsrs_state: 2, due: tomorrow, suspended: 1 }),
      card({ fsrs_state: 2, due: tomorrow, buried: 1 }),
      card({ fsrs_state: 0, due: tomorrow }),
    ];
    const result = aggregateFutureDue(cards, 7);
    expect(result.every(b => b.count === 0)).toBe(true);
  });

  it('clamps overdue cards to day 0', () => {
    const past = new Date(Date.now() - 86400000 * 5).toISOString();
    const cards = [card({ fsrs_state: 2, due: past })];
    const result = aggregateFutureDue(cards, 7);
    expect(result[0].count).toBe(1);
  });
});

// === aggregateIntervals ===

describe('aggregateIntervals', () => {
  it('returns empty for no review-state cards', () => {
    const cards = [card({ fsrs_state: 0 })];
    expect(aggregateIntervals(cards, null)).toEqual([]);
  });

  it('buckets by 1-day when max <= 30', () => {
    const cards = [
      card({ fsrs_state: 2, scheduled_days: 5 }),
      card({ fsrs_state: 2, scheduled_days: 5 }),
      card({ fsrs_state: 2, scheduled_days: 10 }),
    ];
    const result = aggregateIntervals(cards, null);
    const at5 = result.find(b => b.rangeLabel === '5');
    const at10 = result.find(b => b.rangeLabel === '10');
    expect(at5?.count).toBe(2);
    expect(at10?.count).toBe(1);
  });

  it('applies percentile cap', () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      card({ card_id: `c${i}`, fsrs_state: 2, scheduled_days: (i + 1) * 3 })
    );
    // 90th percentile cap: top 10% (card with 30d) excluded
    const result = aggregateIntervals(cards, 0.9);
    const maxLabel = Math.max(...result.map(b => parseInt(b.rangeLabel)));
    expect(maxLabel).toBeLessThanOrEqual(27);
  });
});

// === avgInterval ===

describe('avgInterval', () => {
  it('returns 0 for no review cards', () => {
    expect(avgInterval([])).toBe(0);
    expect(avgInterval([card({ fsrs_state: 0 })])).toBe(0);
  });

  it('computes rounded average of scheduled_days for review cards', () => {
    const cards = [
      card({ fsrs_state: 2, scheduled_days: 10 }),
      card({ fsrs_state: 2, scheduled_days: 20 }),
      card({ fsrs_state: 2, scheduled_days: 30 }),
    ];
    expect(avgInterval(cards)).toBe(20);
  });

  it('excludes suspended cards', () => {
    const cards = [
      card({ fsrs_state: 2, scheduled_days: 10 }),
      card({ fsrs_state: 2, scheduled_days: 100, suspended: 1 }),
    ];
    expect(avgInterval(cards)).toBe(10);
  });
});
