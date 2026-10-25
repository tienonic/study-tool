import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSignal, createRoot } from 'solid-js';
import { createFakeProjectApi } from './testUtils.ts';

// Mock side effects
vi.mock('../glossary/store.ts', () => ({
  setQuestionContext: vi.fn(),
}));

vi.mock('../activity/store.ts', () => ({
  pushChartEntry: vi.fn(),
  loadActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../backup/backup.ts', () => ({
  autoSave: vi.fn(),
}));

import { createFlashFlow } from './flashFlow.ts';
import { reportFigureState, retryFigure } from './sourceFigures.ts';
import type { FlashSignals } from './flashFlow.ts';
import type { Flashcard, Section } from '../../projects/types.ts';

function mockSection(): Section {
  return {
    id: 'sec1',
    name: 'Section 1',
    type: 'mc-quiz',
    questions: [{ q: 'Q?', correct: 'A', wrong: ['B'] }],
    cardIds: ['sec1-0'],
    flashCardIds: ['sec1-flash-0', 'sec1-flash-1'],
    flashcards: [
      { front: 'Term', back: 'Definition' },
      { front: 'Second Term', back: 'Second Definition' },
    ],
  };
}

function createSignals(): FlashSignals {
  const [state, setState] = createSignal('idle' as string);
  const [flashCardId, setFlashCardId] = createSignal<string | null>(null);
  const [flashFlipped, setFlashFlipped] = createSignal(false);
  const [flashFront, setFlashFront] = createSignal('');
  const [flashBack, setFlashBack] = createSignal('');
  const [flashTitle, setFlashTitle] = createSignal('');
  const [flashFrontImage, setFlashFrontImage] = createSignal('');
  const [flashBackImage, setFlashBackImage] = createSignal('');
  const [flashDefFirst] = createSignal(false);
  const [ratingLabels, setRatingLabels] = createSignal<Record<number, string>>({});
  const [, setActiveFlashcard] = createSignal<Flashcard | null>(null);
  return {
    state, setState, flashCardId, setFlashCardId,
    flashFlipped, setFlashFlipped, flashFront, setFlashFront,
    flashBack, setFlashBack, flashTitle, setFlashTitle, flashFrontImage, setFlashFrontImage,
    flashBackImage, setFlashBackImage, flashDefFirst,
    ratingLabels, setRatingLabels, setActiveFlashcard,
  };
}

function makeDeps(api: ReturnType<typeof createFakeProjectApi>) {
  const timer = { start: vi.fn(), stop: vi.fn().mockReturnValue(4), reset: vi.fn() };
  return {
    section: mockSection(),
    project: () => ({ slug: 'test-proj', config: { new_per_session: 10 } }),
    guard: { isActing: () => false, withActing: async (fn: () => Promise<void>) => fn() },
    timer,
    cramMode: () => false,
    cramMarkSeen: vi.fn(),
    cramPickNext: vi.fn().mockResolvedValue(undefined),
    cramRate: vi.fn(),
    refreshDue: vi.fn().mockResolvedValue(undefined),
    api,
  };
}

describe('required flashcard figures', () => {
  it('blocks reveal and ratings until both source images load without changing history', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi();
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createFlashFlow(s, deps);
      const card = { front: 'Read the figure.', back: 'Answer', frontImage: '/flash-required-front.png', backImage: '/flash-required-back.png' };
      flow.applyFlashCard('sec1-flash-0', { card });
      const history = flow.historyPosition();
      reportFigureState(card.frontImage, 'ready');
      flow.flipFlash();
      await flow.rateFlash(3);
      expect(s.flashFlipped()).toBe(false);
      expect(s.state()).toBe('answering');
      reportFigureState(card.backImage, 'error');
      await flow.markFlashWrong();
      expect(api.reviewCard).not.toHaveBeenCalled();
      expect(flow.historyPosition()).toEqual(history);
      retryFigure(card.backImage);
      reportFigureState(card.backImage, 'ready');
      flow.flipFlash();
      expect(s.flashFlipped()).toBe(true);
      expect(s.state()).toBe('revealed');
      await flow.rateFlash(3);
      expect(api.reviewCard).toHaveBeenCalledWith('sec1-flash-0', 'sec1', 3);
      dispose();
    });
  });
});

describe('createFlashFlow with injected API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pickNextFlash calls api.pickNext with flashcard type', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-flash-0' }),
      });
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createFlashFlow(s, deps);

      await flow.pickNextFlash();

      expect(api.pickNext).toHaveBeenCalledWith(['sec1'], 10, 'flashcard');
      expect(s.state()).toBe('answering');
      expect(s.flashFront()).toBe('Term');
      expect(s.flashBack()).toBe('Definition');
      expect(s.flashTitle()).toBe('');
      expect(flow.historyPosition()).toMatchObject({ current: 1, total: 1 });
      dispose();
    });
  });

  it('skips stale scheduled flashcard IDs instead of stranding the UI', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-flash-9' })
          .mockResolvedValueOnce({ cardId: 'sec1-flash-0' }),
        suspendCard: vi.fn().mockResolvedValue(undefined),
      });
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createFlashFlow(s, deps);

      await flow.pickNextFlash();

      expect(api.suspendCard).toHaveBeenCalledWith('sec1-flash-9');
      expect(api.pickNext).toHaveBeenCalledTimes(2);
      expect(s.state()).toBe('answering');
      expect(s.flashCardId()).toBe('sec1-flash-0');
      expect(s.flashFront()).toBe('Term');
      dispose();
    });
  });

  it('rateFlash uses the canonical review operation without a second activity write', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-flash-0' })
          .mockResolvedValueOnce({ cardId: null }),
        reviewCard: vi.fn().mockResolvedValue({ card: {}, isLeech: false, lapses: 0 }),
        addActivity: vi.fn().mockResolvedValue(undefined),
      });
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createFlashFlow(s, deps);

      await flow.pickNextFlash();
      await flow.rateFlash(3);

      expect(api.reviewCard).toHaveBeenCalledWith('sec1-flash-0', 'sec1', 3);
      expect(api.addActivity).not.toHaveBeenCalled();
      dispose();
    });
  });

  it('counts a finite-goal flashcard rating against the project-wide exposure quota', async () => {
    await createRoot(async dispose => {
      const goal = { target_date: '2026-09-01', weekend_multiplier: 2 };
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-flash-0' })
          .mockResolvedValueOnce({ cardId: null }),
        reviewCard: vi.fn().mockResolvedValue({ card: {}, isLeech: false, lapses: 0 }),
      });
      const s = createSignals();
      const deps = {
        ...makeDeps(api),
        project: () => ({ slug: 'finite-proj', config: { new_per_session: 10, study_goal: goal } }),
      };
      const flow = createFlashFlow(s, deps);

      await flow.pickNextFlash();
      await flow.rateFlash(3);

      expect(api.pickNext).toHaveBeenNthCalledWith(
        1, ['sec1'], 10, 'flashcard', 'finite-proj|study-goal', goal,
      );
      expect(api.reviewCard).toHaveBeenCalledWith(
        'sec1-flash-0', 'sec1', 3, 'finite-proj|study-goal',
      );
      dispose();
    });
  });

  it('rateFlash in cram mode skips reviewCard', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-flash-0' }),
        addActivity: vi.fn().mockResolvedValue(undefined),
      });
      const s = createSignals();
      const deps = { ...makeDeps(api), cramMode: () => true };
      const flow = createFlashFlow(s, deps);

      await flow.pickNextFlash();
      s.setState('answering');
      s.setFlashCardId('sec1-flash-0');

      await flow.rateFlash(3);

      expect(api.reviewCard).not.toHaveBeenCalled();
      expect(deps.cramRate).toHaveBeenCalledWith('sec1-flash-0', 3);
      dispose();
    });
  });

  it('flipFlash calls api.previewRatings when flipping to back', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-flash-0' }),
        previewRatings: vi.fn().mockResolvedValue({ labels: { 1: 'Again', 3: 'Good' } }),
      });
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createFlashFlow(s, deps);

      await flow.pickNextFlash();
      flow.flipFlash();

      expect(s.flashFlipped()).toBe(true);
      expect(s.state()).toBe('revealed');
      expect(api.previewRatings).toHaveBeenCalledWith('sec1-flash-0');
      dispose();
    });
  });

  it('starts the flashcard timer on a new front and stops it on reveal', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-flash-0' }),
        previewRatings: vi.fn().mockResolvedValue({ labels: {} }),
      });
      const deps = makeDeps(api);
      const s = createSignals();
      const flow = createFlashFlow(s, deps);

      await flow.pickNextFlash();
      expect(deps.timer.start).toHaveBeenCalledTimes(1);

      flow.flipFlash();
      expect(deps.timer.stop).toHaveBeenCalledTimes(1);
      expect(deps.timer.start).toHaveBeenCalledTimes(1);

      dispose();
    });
  });

  it('reviews flashcard history with A/D semantics without re-rating past cards', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-flash-0' })
          .mockResolvedValueOnce({ cardId: 'sec1-flash-1' }),
        reviewCard: vi.fn().mockResolvedValue({ card: {}, isLeech: false, lapses: 0 }),
        addActivity: vi.fn().mockResolvedValue(undefined),
      });
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createFlashFlow(s, deps);

      await flow.pickNextFlash();
      flow.flipFlash();
      await flow.rateFlash(3);

      expect(s.flashCardId()).toBe('sec1-flash-1');
      expect(s.flashFront()).toBe('Second Term');
      expect(flow.historyPosition()).toMatchObject({ current: 2, total: 2, canGoBack: true, canGoForward: false });

      flow.goBackHistory();

      expect(s.flashCardId()).toBe('sec1-flash-0');
      expect(s.flashFlipped()).toBe(true);
      expect(s.state()).toBe('reviewing-history');
      expect(deps.timer.reset).toHaveBeenCalled();
      expect(flow.historyPosition()).toMatchObject({ current: 1, total: 2, reviewing: true, canGoForward: true });

      await flow.rateFlash(1);
      expect(api.reviewCard).toHaveBeenCalledTimes(1);

      flow.advanceHistory();

      expect(s.flashCardId()).toBe('sec1-flash-1');
      expect(s.state()).toBe('answering');
      expect(flow.historyPosition()).toMatchObject({ current: 2, total: 2, reviewing: false, canGoForward: false });
      dispose();
    });
  });

  it('marks a history card incorrect and requests an exact undo when possible', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-flash-0' })
          .mockResolvedValueOnce({ cardId: 'sec1-flash-1' }),
        reviewCard: vi.fn().mockResolvedValue({ card: {}, isLeech: false, lapses: 0 }),
        undoReview: vi.fn().mockResolvedValue({ undone: true, cardId: 'sec1-flash-0' }),
      });
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createFlashFlow(s, deps);

      await flow.pickNextFlash();
      flow.flipFlash();
      await flow.rateFlash(3);
      flow.goBackHistory();
      await flow.markFlashWrong();

      expect(api.undoReview).toHaveBeenCalledWith('sec1-flash-0');
      expect(api.reviewCard).toHaveBeenLastCalledWith('sec1-flash-0', 'sec1', 1);
      expect(s.flashCardId()).toBe('sec1-flash-0');
      expect(s.state()).toBe('reviewing-history');
      dispose();
    });
  });
});
