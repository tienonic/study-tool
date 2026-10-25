import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import { createCramSession } from './cramSession.ts';
import { createFakeProjectApi } from './testUtils.ts';

function runInRoot(fn: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    createRoot((dispose) => {
      fn().then(resolve, reject).finally(dispose);
    });
  });
}

describe('createCramSession', () => {
  it('starts with weak cards, repeats misses, and ends after mastery', async () => {
    await runInRoot(async () => {
      const picked: string[] = [];
      const onDone = vi.fn();
      const api = createFakeProjectApi({
        getPerformanceCards: vi.fn().mockResolvedValue([
          { card_id: 'c1', section_id: 'sec', card_type: 'mcq', fsrs_state: 2, stability: 0.5, difficulty: 9, reps: 3, lapses: 1 },
          { card_id: 'c2', section_id: 'sec', card_type: 'mcq', fsrs_state: 2, stability: 5, difficulty: 4, reps: 5, lapses: 0 },
        ]),
      });
      const cram = createCramSession({
        projectSlug: () => 'accounting',
        sectionId: 'sec',
        flashMode: () => false,
        sectionType: 'mc-quiz',
        onPickMcq: (cardId) => picked.push(cardId),
        onPickFlash: vi.fn(),
        onDone,
        api,
      });

      await cram.startCram();
      cram.rateCram('c1', 1);
      await cram.pickNextCram();
      cram.rateCram('c2', 3);
      await cram.pickNextCram();
      cram.rateCram('c1', 3);
      await cram.pickNextCram();
      cram.rateCram('c1', 3);
      await cram.pickNextCram();

      expect(picked).toEqual(['c1', 'c2', 'c1', 'c1']);
      expect(cram.cramMode()).toBe(false);
      expect(cram.cramCount()).toBe(0);
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  it('treats Hard as remembered and does not starve unseen cards', async () => {
    await runInRoot(async () => {
      const picked: string[] = [];
      const api = createFakeProjectApi({
        getPerformanceCards: vi.fn().mockResolvedValue([
          { card_id: 'c1', section_id: 'sec', card_type: 'mcq', fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
          { card_id: 'c2', section_id: 'sec', card_type: 'mcq', fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
          { card_id: 'c3', section_id: 'sec', card_type: 'mcq', fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
          { card_id: 'c4', section_id: 'sec', card_type: 'mcq', fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
        ]),
      });
      const cram = createCramSession({
        projectSlug: () => 'art-history',
        sectionId: 'sec',
        flashMode: () => false,
        sectionType: 'mc-quiz',
        onPickMcq: (cardId) => picked.push(cardId),
        onPickFlash: vi.fn(),
        onDone: vi.fn(),
        api,
      });

      await cram.startCram();
      cram.rateCram('c1', 2);
      await cram.pickNextCram();
      cram.rateCram('c2', 2);
      await cram.pickNextCram();
      cram.rateCram('c3', 2);
      await cram.pickNextCram();

      expect(picked).toEqual(['c1', 'c2', 'c3', 'c4']);
    });
  });

  it('uses the quiz-only worker filter in merged quiz mode', async () => {
    await runInRoot(async () => {
      const picked: string[] = [];
      const api = createFakeProjectApi({
        getPerformanceCards: vi.fn().mockResolvedValue([
          { card_id: 'flash-1', section_id: 'sec-a', card_type: 'flashcard', fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
          { card_id: 'quiz-1', section_id: 'sec-b', card_type: 'passage', fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
        ]),
      });
      const cram = createCramSession({
        projectSlug: () => 'accounting',
        sectionId: 'sec',
        sectionIds: ['sec-a', 'sec-b'],
        flashMode: () => false,
        sectionType: 'mc-quiz',
        merged: true,
        onPickMcq: (cardId) => picked.push(cardId),
        onPickFlash: vi.fn(),
        onDone: vi.fn(),
        api,
      });

      await cram.startCram();

      expect(api.getPerformanceCards).toHaveBeenCalled();
      expect(picked).toEqual(['quiz-1']);
    });
  });
});
