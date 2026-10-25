import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSignal, createRoot } from 'solid-js';
import { createFakeProjectApi } from './testUtils.ts';

// Mock side effects that mcqFlow imports
vi.mock('../glossary/store.ts', () => ({
  setQuestionContext: vi.fn(),
}));

vi.mock('../../core/store/app.ts', () => ({
  easyMode: () => false,
  sessionSummary: () => null,
  setSessionSummary: vi.fn(),
}));

vi.mock('../activity/store.ts', () => ({
  loadActivity: vi.fn().mockResolvedValue(undefined),
}));

import { createMcqFlow } from './mcqFlow.ts';
import { handleMcqOptionClick } from './mcqOptionClick.ts';
import { reportFigureState, retryFigure } from './sourceFigures.ts';
import type { McqSignals } from './mcqFlow.ts';
import type { QuizState } from './types.ts';
import type { Section } from '../../projects/types.ts';

function mockSection(): Section {
  return {
    id: 'sec1',
    name: 'Section 1',
    type: 'mc-quiz',
    questions: [
      { q: 'What is 2+2?', correct: '4', wrong: ['3', '5', '6'] },
      { q: 'What is 3+3?', correct: '6', wrong: ['5', '7', '8'] },
    ],
    cardIds: ['sec1-0', 'sec1-1'],
    flashCardIds: [],
  };
}

function createSignals(): McqSignals {
  const [state, setState] = createSignal('idle' as string);
  const [cardId, setCardId] = createSignal<string | null>(null);
  const [question, setQuestion] = createSignal<any>(null);
  const [options, setOptions] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [isCorrect, setIsCorrect] = createSignal(false);
  const [passage, setPassage] = createSignal('');
  const [ratingLabels, setRatingLabels] = createSignal<Record<number, string>>({});
  const [score, setScore] = createSignal({ correct: 0, attempted: 0 });
  const [leechWarning, setLeechWarning] = createSignal(false);
  const [skipped, setSkipped] = createSignal(false);
  const [flashMode] = createSignal(false);
  return {
    state, setState, cardId, setCardId, question, setQuestion,
    options, setOptions, selected, setSelected, isCorrect, setIsCorrect,
    passage, setPassage, ratingLabels, setRatingLabels, score, setScore,
    leechWarning, setLeechWarning, skipped, setSkipped, flashMode,
  };
}

function makeDeps(api: ReturnType<typeof createFakeProjectApi>, section?: Section) {
  const sec = section ?? mockSection();
  return {
    section: sec,
    project: () => ({ slug: 'test-proj', config: { new_per_session: 10, imageSearchSuffix: '' } }),
    guard: { isActing: () => false, withActing: async (fn: () => Promise<void>) => fn() },
    timer: { start: vi.fn(), stop: vi.fn().mockReturnValue(5) },
    doRate: vi.fn(),
    refreshDue: vi.fn().mockResolvedValue(undefined),
    cramMode: () => false,
    pickNextCram: vi.fn().mockResolvedValue(undefined),
    api,
  };
}

function mockOptionClickSession(state: QuizState, correct = true) {
  return {
    state: () => state,
    answer: vi.fn().mockResolvedValue(undefined),
    rate: vi.fn().mockResolvedValue(undefined),
    pickNextCard: vi.fn().mockResolvedValue(undefined),
    advanceFromHistory: vi.fn(),
    isCorrect: () => correct,
  };
}

describe('required MCQ figure', () => {
  it('blocks answers and scored skips until the original figure loads', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi();
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createMcqFlow(s, deps);
      const question = { q: 'Read the figure.', image: '/mcq-required-figure.png', correct: 'A', wrong: ['B'] };
      flow.applyMcqCard('sec1-0', { question }, ['A', 'B'], '');
      await flow.answer('A');
      expect(s.state()).toBe('answering');
      expect(s.selected()).toBe(null);
      expect(s.score()).toEqual({ correct: 0, attempted: 0 });
      reportFigureState(question.image, 'error');
      await flow.skip();
      expect(s.state()).toBe('answering');
      expect(api.updateScore).not.toHaveBeenCalled();
      expect(deps.doRate).not.toHaveBeenCalled();
      retryFigure(question.image);
      reportFigureState(question.image, 'ready');
      await flow.answer('A');
      expect(s.state()).toBe('revealed');
      expect(s.selected()).toBe('A');
      expect(api.updateScore).toHaveBeenCalledWith('sec1', true);
      reportFigureState(question.image, 'error');
      await flow.rate(3);
      await flow.flagWrong();
      expect(deps.doRate).not.toHaveBeenCalled();
      reportFigureState(question.image, 'ready');
      await flow.rate(3);
      expect(deps.doRate).toHaveBeenCalledWith('sec1-0', 3);
      dispose();
    });
  });
});

describe('handleMcqOptionClick', () => {
  it('answers with the clicked option while answering', () => {
    const session = mockOptionClickSession('answering');

    handleMcqOptionClick(session, 'A');

    expect(session.answer).toHaveBeenCalledWith('A');
    expect(session.pickNextCard).not.toHaveBeenCalled();
  });

  it('advances to the next question when another option is clicked after rating', () => {
    const session = mockOptionClickSession('rated');

    handleMcqOptionClick(session, 'B');

    expect(session.pickNextCard).toHaveBeenCalledTimes(1);
    expect(session.answer).not.toHaveBeenCalled();
  });

  it('advances through history review on option click', () => {
    const session = mockOptionClickSession('reviewing-history');

    handleMcqOptionClick(session, 'C');

    expect(session.advanceFromHistory).toHaveBeenCalledTimes(1);
  });

  it('mirrors Space behavior in easy revealed mode', () => {
    const correctSession = mockOptionClickSession('revealed', true);
    const wrongSession = mockOptionClickSession('revealed', false);

    handleMcqOptionClick(correctSession, 'A', true);
    handleMcqOptionClick(wrongSession, 'A', true);

    expect(correctSession.rate).toHaveBeenCalledWith(3);
    expect(wrongSession.rate).toHaveBeenCalledWith(1);
  });

  it('does not auto-advance from revealed manual rating mode', () => {
    const session = mockOptionClickSession('revealed');

    handleMcqOptionClick(session, 'A', false);

    expect(session.rate).not.toHaveBeenCalled();
    expect(session.pickNextCard).not.toHaveBeenCalled();
  });
});

describe('createMcqFlow with injected API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pickNextCardImpl calls api.pickNext and sets up card state', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-0' }),
        countDue: vi.fn().mockResolvedValue({ due: 1, newCount: 0, total: 2 }),
      });
      const s = createSignals();
      const flow = createMcqFlow(s, makeDeps(api));

      await flow.pickNextCardImpl();

      expect(api.pickNext).toHaveBeenCalledWith(['sec1'], 10, 'mcq');
      expect(s.state()).toBe('answering');
      expect(s.cardId()).toBe('sec1-0');
      expect(s.question()).not.toBeNull();
      dispose();
    });
  });

  it('changes option order when the same card repeats', async () => {
    await createRoot(async dispose => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        const api = createFakeProjectApi({
          pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-0' }),
          countDue: vi.fn().mockResolvedValue({ due: 1, newCount: 0, total: 2 }),
        });
        const s = createSignals();
        const flow = createMcqFlow(s, makeDeps(api));

        await flow.pickNextCardImpl();
        const firstOrder = [...s.options()];

        await flow.pickNextCardImpl();
        const secondOrder = [...s.options()];

        expect(secondOrder).not.toEqual(firstOrder);
        expect([...secondOrder].sort()).toEqual([...firstOrder].sort());
      } finally {
        randomSpy.mockRestore();
        dispose();
      }
    });
  });

  it('pickNextCardImpl sets state to done when no card returned', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi();
      const s = createSignals();
      const flow = createMcqFlow(s, makeDeps(api));

      await flow.pickNextCardImpl();

      expect(s.state()).toBe('done');
      dispose();
    });
  });

  it('pickNextCardImpl sets state to done immediately when project is null (no polling)', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi();
      const s = createSignals();
      const deps = { ...makeDeps(api), project: () => null as ReturnType<typeof makeDeps>['project'] extends () => infer R ? R : never };
      const flow = createMcqFlow(s, deps as any);

      const start = Date.now();
      await flow.pickNextCardImpl();
      const elapsed = Date.now() - start;

      // Should resolve immediately, not after 3×150ms polling retries
      expect(elapsed).toBeLessThan(200);
      expect(s.state()).toBe('done');
      // api.pickNext should NOT have been called when project is null
      expect(api.pickNext).not.toHaveBeenCalled();
      dispose();
    });
  });

  it('answer calls api.updateScore and transitions to revealed', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-0' }),
        updateScore: vi.fn().mockResolvedValue({ correct: 1, attempted: 1 }),
      });
      const s = createSignals();
      const flow = createMcqFlow(s, makeDeps(api));

      await flow.pickNextCardImpl();
      expect(s.state()).toBe('answering');

      // Answer correctly
      await flow.answer('4');

      expect(api.updateScore).toHaveBeenCalledWith('sec1', true);
      expect(s.state()).toBe('revealed');
      expect(s.isCorrect()).toBe(true);
      dispose();
    });
  });

  it('answer with wrong option calls api.updateScore(false)', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-0' }),
        updateScore: vi.fn().mockResolvedValue({ correct: 0, attempted: 1 }),
      });
      const s = createSignals();
      const flow = createMcqFlow(s, makeDeps(api));

      await flow.pickNextCardImpl();
      await flow.answer('3');

      expect(api.updateScore).toHaveBeenCalledWith('sec1', false);
      expect(s.isCorrect()).toBe(false);
      dispose();
    });
  });

  it('suspend calls api.suspendCard then picks next', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-0' })
          .mockResolvedValueOnce({ cardId: null }),
        suspendCard: vi.fn().mockResolvedValue(undefined),
      });
      const s = createSignals();
      const flow = createMcqFlow(s, makeDeps(api));

      await flow.pickNextCardImpl();
      expect(s.cardId()).toBe('sec1-0');

      await flow.suspend();
      expect(api.suspendCard).toHaveBeenCalledWith('sec1-0');
      dispose();
    });
  });

  it('bury calls api.buryCard then picks next', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-0' })
          .mockResolvedValueOnce({ cardId: null }),
        updateScore: vi.fn().mockResolvedValue({ correct: 1, attempted: 1 }),
        buryCard: vi.fn().mockResolvedValue(undefined),
      });
      const s = createSignals();
      const flow = createMcqFlow(s, makeDeps(api));

      await flow.pickNextCardImpl();
      await flow.answer('4');
      await flow.bury();
      expect(api.buryCard).toHaveBeenCalledWith('sec1-0');
      dispose();
    });
  });
});

describe('createMcqFlow historyNav coordination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('goBackHistory restores previous card into signals', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-0' })
          .mockResolvedValueOnce({ cardId: 'sec1-1' }),
        countDue: vi.fn().mockResolvedValue({ due: 2, newCount: 0, total: 2 }),
      });
      const s = createSignals();
      const flow = createMcqFlow(s, makeDeps(api));

      // Pick first card, then second
      await flow.pickNextCardImpl();
      expect(s.cardId()).toBe('sec1-0');
      await flow.pickNextCardImpl();
      expect(s.cardId()).toBe('sec1-1');

      // Go back — should restore sec1-0
      flow.goBackHistory();
      expect(s.cardId()).toBe('sec1-0');
      expect(s.state()).toBe('answering'); // entry has selected=null, not answered
      dispose();
    });
  });

  it('goBackHistory sets state to reviewing-history for answered entries', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-0' })
          .mockResolvedValueOnce({ cardId: 'sec1-1' }),
        updateScore: vi.fn().mockResolvedValue({ correct: 1, attempted: 1 }),
        countDue: vi.fn().mockResolvedValue({ due: 2, newCount: 0, total: 2 }),
      });
      const s = createSignals();
      const flow = createMcqFlow(s, makeDeps(api));

      await flow.pickNextCardImpl();
      // Answer sec1-0 correctly
      await flow.answer('4');
      expect(s.state()).toBe('revealed');

      await flow.pickNextCardImpl();
      expect(s.cardId()).toBe('sec1-1');

      // Go back — sec1-0 was answered, should show reviewing-history
      flow.goBackHistory();
      expect(s.cardId()).toBe('sec1-0');
      expect(s.state()).toBe('reviewing-history');
      expect(s.isCorrect()).toBe(true);
      expect(s.selected()).toBe('4');
      dispose();
    });
  });

  it('goBackHistory does nothing when at beginning of history', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-0' }),
        countDue: vi.fn().mockResolvedValue({ due: 1, newCount: 0, total: 1 }),
      });
      const s = createSignals();
      const flow = createMcqFlow(s, makeDeps(api));

      await flow.pickNextCardImpl();
      const stateBeforeBack = s.state();
      const cardBeforeBack = s.cardId();

      // With only one entry, goBack should be a no-op
      flow.goBackHistory();
      expect(s.state()).toBe(stateBeforeBack);
      expect(s.cardId()).toBe(cardBeforeBack);
      dispose();
    });
  });

  it('advanceFromHistory moves forward and restores next answered entry', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-0' })
          .mockResolvedValueOnce({ cardId: 'sec1-1' }),
        updateScore: vi.fn().mockResolvedValue({ correct: 1, attempted: 1 }),
        countDue: vi.fn().mockResolvedValue({ due: 2, newCount: 0, total: 2 }),
      });
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createMcqFlow(s, deps);

      // Pick and answer two cards
      await flow.pickNextCardImpl();
      await flow.answer('4'); // answer sec1-0
      await flow.pickNextCardImpl();
      expect(s.cardId()).toBe('sec1-1');

      // Go back to sec1-0, then advance back to sec1-1
      flow.goBackHistory();
      expect(s.cardId()).toBe('sec1-0');

      s.setState('reviewing-history');
      flow.advanceFromHistory(flow.pickNextCardImpl);
      expect(s.cardId()).toBe('sec1-1');
      dispose();
    });
  });

  it('advanceFromHistory at the end does not pick a new card', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: 'sec1-0' })
          .mockResolvedValueOnce({ cardId: null }),
        updateScore: vi.fn().mockResolvedValue({ correct: 1, attempted: 1 }),
        countDue: vi.fn().mockResolvedValue({ due: 1, newCount: 0, total: 1 }),
      });
      const s = createSignals();
      const deps = makeDeps(api);
      const flow = createMcqFlow(s, deps);

      await flow.pickNextCardImpl();
      await flow.answer('4'); // answer sec1-0

      // Go back
      flow.goBackHistory();
      expect(s.cardId()).toBe('sec1-0');

      // Advance should call pickNextCard (history is at end after this)
      s.setState('reviewing-history');
      await flow.advanceFromHistory(flow.pickNextCardImpl);

      expect(api.pickNext).toHaveBeenCalledTimes(1);
      expect(s.state()).toBe('reviewing-history');
      dispose();
    });
  });

  it('advanceFromHistory is a no-op when state is not reviewing-history', async () => {
    await createRoot(async dispose => {
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-0' }),
        countDue: vi.fn().mockResolvedValue({ due: 1, newCount: 0, total: 1 }),
      });
      const s = createSignals();
      const pickNextCard = vi.fn().mockResolvedValue(undefined);
      const flow = createMcqFlow(s, makeDeps(api));

      await flow.pickNextCardImpl();
      // State is 'answering', not 'reviewing-history'
      expect(s.state()).toBe('answering');

      flow.advanceFromHistory(pickNextCard);
      expect(pickNextCard).not.toHaveBeenCalled();
      expect(s.cardId()).toBe('sec1-0');
      dispose();
    });
  });
});
