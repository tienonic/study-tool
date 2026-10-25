import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../workerContext.ts';
import { getStudyProgress } from './stats.ts';

function row(overrides: Record<string, unknown>) {
  return {
    card_id: 'card', project_id: 'project-a', section_id: 'section-a', card_type: 'flashcard',
    fsrs_state: 0, due: '2030-01-07T19:00:00.000Z', stability: 0, difficulty: 0,
    elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0,
    last_review: null, suspended: 0, buried: 0, leech: 0, in_deck: 1,
    ...overrides,
  };
}

function context(rows: Record<string, unknown>[], retrievability: Record<string, number> = {}): WorkerContext {
  return {
    queryAll: vi.fn().mockResolvedValue(rows),
    queryOne: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue(undefined),
    fsrsEngine: (() => ({
      get_retrievability: (card: { marker?: string }) => retrievability[card.marker ?? ''] ?? 0.5,
    })) as unknown as WorkerContext['fsrsEngine'],
    cardToFSRS: ((value: Record<string, unknown>) => ({ marker: value.card_id })) as unknown as WorkerContext['cardToFSRS'],
    leechThreshold: () => 8,
    initFSRS: vi.fn(),
    uuidv7: () => 'id',
    saveCardFromFSRS: vi.fn().mockResolvedValue(undefined),
    checkNewDay: vi.fn().mockResolvedValue(undefined),
    getNewTodayCount: vi.fn().mockResolvedValue(3),
    incrementNewToday: vi.fn().mockResolvedValue(undefined),
  };
}

describe('getStudyProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-07T20:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('separates exposure, recognition, due work, and conservative durable retention', async () => {
    const ctx = context([
      row({ card_id: 'new' }),
      row({ card_id: 'learning-due', fsrs_state: 1, reps: 1 }),
      row({ card_id: 'relearning-future', fsrs_state: 3, reps: 3, due: '2030-01-08T20:00:00.000Z' }),
      row({ card_id: 'durable', fsrs_state: 2, reps: 3, scheduled_days: 12 }),
      row({ card_id: 'one-correct', fsrs_state: 2, reps: 1, scheduled_days: 1 }),
      row({ card_id: 'buried-due', fsrs_state: 2, reps: 5, scheduled_days: 20, buried: 1 }),
    ], { durable: 0.95, 'one-correct': 0.98, 'buried-due': 0.85 });

    await expect(getStudyProgress(ctx, 'project-a', 0.9, 'project-a|study-goal')).resolves.toEqual({
      total: 6,
      unseen: 1,
      exposed: 5,
      learning: 2,
      recognized: 3,
      due: 3,
      estimatedRetrievability: (0.95 + 0.98 + 0.85) / 3,
      durableRetention: 1,
      introducedToday: 3,
    });
    expect(ctx.getNewTodayCount).toHaveBeenCalledWith('project-a', 'project-a|study-goal');
  });

  it('handles an empty or imported-history deck without claiming retention', async () => {
    const empty = context([]);
    await expect(getStudyProgress(empty, 'project-a', 0.9)).resolves.toEqual({
      total: 0, unseen: 0, exposed: 0, learning: 0, recognized: 0, due: 0,
      estimatedRetrievability: null, durableRetention: 0, introducedToday: 0,
    });

    const imported = context([
      row({ card_id: 'imported', fsrs_state: 2, reps: 8, scheduled_days: 30, due: '2030-02-07T20:00:00.000Z' }),
    ], { imported: 0.92 });
    const result = await getStudyProgress(imported, 'project-a', 0.9);
    expect(result).toMatchObject({ unseen: 0, exposed: 1, recognized: 1, due: 0, durableRetention: 1 });
  });
});
