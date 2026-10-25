import { describe, it, expect } from 'vitest';
import { formatInterval, isLeech, cardToFSRS, newTodayKey } from './helpers.ts';

// === formatInterval ===

describe('formatInterval', () => {
  it('formats sub-minute durations as minutes (minimum 1m)', () => {
    expect(formatInterval(0)).toBe('1m');
    expect(formatInterval(0.005)).toBe('7m');  // 0.005 * 24 * 60 = 7.2 → 7
  });

  it('formats sub-day durations as hours', () => {
    expect(formatInterval(1 / 24)).toBe('1h');
    expect(formatInterval(0.5)).toBe('12h');
  });

  it('formats days (1-29)', () => {
    expect(formatInterval(1)).toBe('1d');
    expect(formatInterval(7)).toBe('7d');
    expect(formatInterval(29)).toBe('29d');
  });

  it('formats months (30-364 days)', () => {
    expect(formatInterval(30)).toBe('1mo');
    expect(formatInterval(90)).toBe('3mo');
    expect(formatInterval(364)).toBe('12mo');
  });

  it('formats years without trailing .0', () => {
    expect(formatInterval(365)).toBe('1y');
    expect(formatInterval(730)).toBe('2y');
  });

  it('formats years with one decimal when not whole', () => {
    expect(formatInterval(548)).toBe('1.5y'); // 548/365 ≈ 1.5
  });

  it('boundary: exactly 1/24 day → 1h not minutes', () => {
    expect(formatInterval(1 / 24)).toBe('1h');
  });

  it('boundary: just under 1/24 day → minutes', () => {
    const justUnder = 1 / 24 - 0.001;
    const result = formatInterval(justUnder);
    expect(result).toMatch(/^\d+m$/);
  });
});

// === isLeech ===

describe('isLeech', () => {
  it('returns false when lapses < threshold', () => {
    expect(isLeech(0, 8)).toBe(false);
    expect(isLeech(5, 8)).toBe(false);
    expect(isLeech(7, 8)).toBe(false);
  });

  it('returns true at exactly threshold lapses', () => {
    expect(isLeech(8, 8)).toBe(true);
  });

  it('returns false at threshold + 1', () => {
    expect(isLeech(9, 8)).toBe(false);
  });

  it('returns true again at threshold + ceil(threshold/2)', () => {
    // threshold=8, ceil(8/2)=4. So next leech at 8+4=12
    expect(isLeech(12, 8)).toBe(true);
    expect(isLeech(16, 8)).toBe(true);
    expect(isLeech(10, 8)).toBe(false);
    expect(isLeech(11, 8)).toBe(false);
  });

  it('handles threshold=4 correctly', () => {
    expect(isLeech(4, 4)).toBe(true);
    expect(isLeech(5, 4)).toBe(false);
    // ceil(4/2)=2, so 4+2=6 is next leech
    expect(isLeech(6, 4)).toBe(true);
    expect(isLeech(8, 4)).toBe(true);
  });

  it('returns false for 0 lapses', () => {
    expect(isLeech(0, 8)).toBe(false);
    expect(isLeech(0, 1)).toBe(false);
  });
});

// === cardToFSRS ===

describe('cardToFSRS', () => {
  it('maps all numeric fields from row', () => {
    const row = {
      due: '2025-01-15T10:00:00.000Z',
      stability: 5.5,
      difficulty: 3.2,
      elapsed_days: 10,
      scheduled_days: 14,
      learning_steps: 1,
      reps: 5,
      lapses: 2,
      fsrs_state: 2,
      last_review: '2025-01-01T10:00:00.000Z',
    };
    const card = cardToFSRS(row);
    expect(card.stability).toBe(5.5);
    expect(card.difficulty).toBe(3.2);
    expect(card.elapsed_days).toBe(10);
    expect(card.scheduled_days).toBe(14);
    expect(card.learning_steps).toBe(1);
    expect(card.reps).toBe(5);
    expect(card.lapses).toBe(2);
    expect(card.state).toBe(2);
  });

  it('parses due as Date', () => {
    const card = cardToFSRS({
      due: '2025-06-15T12:00:00.000Z',
      stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
      reps: 0, lapses: 0, fsrs_state: 0, last_review: null,
    });
    expect(card.due).toBeInstanceOf(Date);
    expect(card.due.toISOString()).toBe('2025-06-15T12:00:00.000Z');
  });

  it('parses last_review as Date when present', () => {
    const card = cardToFSRS({
      due: '2025-01-15T10:00:00.000Z',
      stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
      reps: 0, lapses: 0, fsrs_state: 0,
      last_review: '2025-01-10T10:00:00.000Z',
    });
    expect(card.last_review).toBeInstanceOf(Date);
  });

  it('sets last_review to undefined when null', () => {
    const card = cardToFSRS({
      due: '2025-01-15T10:00:00.000Z',
      stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
      reps: 0, lapses: 0, fsrs_state: 0, last_review: null,
    });
    expect(card.last_review).toBeUndefined();
  });

  it('defaults learning_steps for cards created before the FSRS-6 field was persisted', () => {
    const card = cardToFSRS({
      due: '2025-01-15T10:00:00.000Z',
      stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
      reps: 0, lapses: 0, fsrs_state: 1, last_review: null,
    });
    expect(card.learning_steps).toBe(0);
  });
});

// === newTodayKey ===

describe('newTodayKey', () => {
  it('joins projectId and sectionIds with pipe separator', () => {
    expect(newTodayKey('proj1', ['sec1'])).toBe('proj1|sec1|');
  });

  it('handles multiple sectionIds', () => {
    expect(newTodayKey('proj1', ['sec1', 'sec2'])).toBe('proj1|sec1,sec2|');
  });

  it('appends cardType when provided', () => {
    expect(newTodayKey('proj1', ['sec1'], 'flashcard')).toBe('proj1|sec1|flashcard');
  });

  it('appends empty string for missing cardType', () => {
    const key = newTodayKey('proj1', ['sec1']);
    expect(key.endsWith('|')).toBe(true);
  });

  it('key format allows section-scoped LIKE matching with pipe delimiters', () => {
    const keyMcq = newTodayKey('proj', ['sec1'], 'mcq');
    const keyFlash = newTodayKey('proj', ['sec1'], 'flashcard');
    const keyNoType = newTodayKey('proj', ['sec1']);
    const keyOther = newTodayKey('proj', ['sec2'], 'mcq');
    const pattern = '%|sec1|%';
    // All sec1 keys contain |sec1| between pipes
    for (const k of [keyMcq, keyFlash, keyNoType]) {
      expect(k).toContain('|sec1|');
      expect(k.includes('|sec1|')).toBe(true);
    }
    // sec2 key does NOT contain |sec1|
    expect(keyOther.includes('|sec1|')).toBe(false);
  });
});
