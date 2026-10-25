import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';

// Mock all external dependencies that createQuizSession needs
vi.mock('../../core/hooks/useWorker.ts', () => ({
  workerApi: {
    pickNext: vi.fn().mockResolvedValue({ cardId: null }),
    pickNextOverride: vi.fn().mockResolvedValue({ cardId: null }),
    countDue: vi.fn().mockResolvedValue({ due: 0, newCount: 0, total: 0 }),
    previewRatings: vi.fn().mockResolvedValue({ labels: {} }),
    reviewCard: vi.fn().mockResolvedValue({ card: {}, isLeech: false, lapses: 0 }),
    undoReview: vi.fn().mockResolvedValue({ undone: false }),
    updateScore: vi.fn().mockResolvedValue({ correct: 0, attempted: 0 }),
    addActivity: vi.fn().mockResolvedValue({ ok: true }),
    suspendCard: vi.fn().mockResolvedValue({ ok: true }),
    buryCard: vi.fn().mockResolvedValue({ ok: true }),
    unburyAll: vi.fn().mockResolvedValue({ ok: true }),
    resetNewCount: vi.fn().mockResolvedValue({ ok: true }),
    resetSection: vi.fn().mockResolvedValue({ ok: true }),
    loadProject: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock('../backup/backup.ts', () => ({
  autoSave: vi.fn(),
}));

vi.mock('../glossary/store.ts', () => ({
  setQuestionContext: vi.fn(),
}));

vi.mock('../activity/store.ts', () => ({
  pushChartEntry: vi.fn(),
  loadActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../core/store/app.ts', () => {
  const { createSignal } = require('solid-js');
  const [activeProject, setActiveProject] = createSignal(null);
  const [easyMode] = createSignal(true);
  const [sessionSummary, setSessionSummary] = createSignal(null);
  return {
    activeProject,
    setActiveProject,
    easyMode,
    sessionSummary,
    setSessionSummary,
    setActiveTab: vi.fn(),
  };
});

vi.mock('../../core/store/sections.ts', () => ({
  sectionHandlers: new Map(),
  bumpHandlerVersion: vi.fn(),
}));

import { createQuizSession, type QuizSession } from './store.ts';
import { createFakeProjectApi } from './testUtils.ts';
import { setActiveProject } from '../../core/store/app.ts';
import type { Section } from '../../projects/types.ts';

function mockSection(): Section {
  return {
    id: 'sec1',
    name: 'Section 1',
    type: 'mc-quiz',
    questions: [{ q: 'Q?', correct: 'A', wrong: ['B', 'C'] }],
    cardIds: ['sec1-0'],
    flashCardIds: [],
  };
}

describe('QuizSession interface completeness', () => {
  it('exposes all required properties', () => {
    createRoot(dispose => {
      const session = createQuizSession(mockSection());
      const required: (keyof QuizSession)[] = [
        'state', 'cardId', 'question', 'options', 'selected', 'isCorrect',
        'ratingLabels', 'score', 'dueCount', 'flashMode', 'flashCardId',
        'flashFlipped', 'flashFront', 'flashBack', 'flashDefFirst', 'passage',
        'historyReview', 'leechWarning', 'skipped', 'currentImageLink',
        'cramMode', 'cramCount', 'pickNextCard', 'answer', 'skip', 'rate',
        'undo', 'suspend', 'bury', 'flipFlash', 'rateFlash', 'toggleFlashMode',
        'setFlashDefFirst', 'advanceFromHistory', 'goBackHistory', 'shuffleFlash',
        'shuffleMcq', 'resetSection', 'refreshDue', 'studyMore', 'flagWrong',
        'startCram', 'endCram', 'increaseNewCards', 'unburyAll', 'timer',
        'paused', 'togglePause',
      ];
      for (const k of required) {
        expect(session, `Missing property: ${k}`).toHaveProperty(k);
      }
      dispose();
    });
  });

  it('state starts as idle', () => {
    createRoot(dispose => {
      const session = createQuizSession(mockSection());
      expect(session.state()).toBe('idle');
      dispose();
    });
  });

  it('flashMode starts as false', () => {
    createRoot(dispose => {
      const session = createQuizSession(mockSection());
      expect(session.flashMode()).toBe(false);
      dispose();
    });
  });

  it('starts and picks in flash mode for a flashcard-only section', async () => {
    await createRoot(async dispose => {
      const section: Section = {
        id: 'words', name: 'Words', type: 'mc-quiz', cardIds: [],
        flashcards: [{ id: 'palabra', front: 'palabra', back: 'word' }],
        flashCardIds: ['words-flash-palabra'],
      };
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'words-flash-palabra' }),
      });
      setActiveProject({
        name: 'Vocabulary', slug: 'vocabulary', version: 1,
        config: {
          desired_retention: 0.9, new_per_session: 1, leech_threshold: 8,
          max_interval: 90, imageSearchSuffix: '', listening: { enabled: false },
        },
        sections: [section], glossary: [],
      });

      const session = createQuizSession(section, api);
      expect(session.flashMode()).toBe(true);
      await session.pickNextCard();

      expect(api.pickNext).toHaveBeenCalledWith(['words'], 1, 'flashcard');
      expect(session.flashCardId()).toBe('words-flash-palabra');
      expect(session.flashFront()).toBe('palabra');
      dispose();
    });
  });

  it('counts a finite-goal quiz rating against the project-wide exposure quota', async () => {
    await createRoot(async dispose => {
      const section = mockSection();
      const goal = { target_date: '2026-09-01', weekend_multiplier: 2 };
      const api = createFakeProjectApi({
        pickNext: vi.fn().mockResolvedValue({ cardId: 'sec1-0' }),
      });
      setActiveProject({
        name: 'Finite quiz', slug: 'finite-quiz', version: 1,
        config: {
          desired_retention: 0.9, new_per_session: 1, leech_threshold: 8,
          max_interval: 90, imageSearchSuffix: '', study_goal: goal,
        },
        sections: [section], glossary: [],
      });

      const session = createQuizSession(section, api);
      await session.pickNextCard();
      await session.skip();

      expect(api.pickNext).toHaveBeenCalledWith(
        ['sec1'], 1, 'mcq', 'finite-quiz|study-goal', goal,
      );
      expect(api.reviewCard).toHaveBeenCalledWith(
        'sec1-0', 'sec1', 1, 'finite-quiz|study-goal',
      );
      dispose();
    });
  });

  it('cramMode starts as false', () => {
    createRoot(dispose => {
      const session = createQuizSession(mockSection());
      expect(session.cramMode()).toBe(false);
      dispose();
    });
  });

  it('dueCount starts at zero', () => {
    createRoot(dispose => {
      const session = createQuizSession(mockSection());
      expect(session.dueCount()).toEqual({ due: 0, newCount: 0, total: 0 });
      dispose();
    });
  });

  it('Add all in merged mode expands the merged quiz pool and recovers from a stale done state', async () => {
    await createRoot(async dispose => {
      const sec1 = mockSection();
      const sec2: Section = {
        id: 'sec2',
        name: 'Section 2',
        type: 'mc-quiz',
        questions: [{ q: 'Second?', correct: 'Answer', wrong: ['Wrong 1', 'Wrong 2'] }],
        cardIds: ['sec2-0'],
        flashCardIds: [],
      };
      const api = createFakeProjectApi({
        countDue: vi.fn().mockResolvedValue({ due: 0, newCount: 2, total: 2 }),
        pickNext: vi.fn().mockResolvedValue({ cardId: null }),
        pickNextOverride: vi.fn().mockResolvedValue({ cardId: 'sec2-0' }),
      });

      setActiveProject({
        name: 'Merged Test',
        slug: 'merged-test',
        version: 1,
        config: {
          desired_retention: 0.9,
          new_per_session: 1,
          leech_threshold: 8,
          max_interval: 90,
          imageSearchSuffix: '',
        },
        sections: [sec1, sec2],
        glossary: [],
      });

      const session = createQuizSession(sec1, api, [sec1, sec2]);
      await session.refreshDue();
      await session.increaseNewCards(2);

      expect(api.resetNewCount).toHaveBeenCalledWith(['sec1', 'sec2'], 'quiz');
      expect(api.pickNext).toHaveBeenCalledWith(['sec1', 'sec2'], 2, 'quiz');
      expect(api.pickNextOverride).toHaveBeenCalledWith(['sec1', 'sec2'], 'quiz');
      expect(session.state()).toBe('answering');
      expect(session.cardId()).toBe('sec2-0');
      dispose();
    });
  });

  it('Study More in flash mode continues with flashcards instead of blanking on MCQ state', async () => {
    await createRoot(async dispose => {
      const section: Section = {
        ...mockSection(),
        flashcards: [{ front: 'Term', back: 'Definition' }],
        flashCardIds: ['sec1-flash-0'],
      };
      const pickNext = vi.fn()
        .mockResolvedValueOnce({ cardId: null })
        .mockResolvedValueOnce({ cardId: 'sec1-flash-0' });
      const api = createFakeProjectApi({
        pickNext,
        countDue: vi.fn().mockResolvedValue({ due: 0, newCount: 1, total: 1 }),
      });

      setActiveProject({
        name: 'Flash Study More Test',
        slug: 'flash-study-more-test',
        version: 1,
        config: {
          desired_retention: 0.9,
          new_per_session: 1,
          leech_threshold: 8,
          max_interval: 90,
          imageSearchSuffix: '',
        },
        sections: [section],
        glossary: [],
      });

      const session = createQuizSession(section, api);
      session.toggleFlashMode();
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(session.flashMode()).toBe(true);
      expect(session.state()).toBe('done');

      await session.studyMore();

      expect(pickNext).toHaveBeenNthCalledWith(1, ['sec1'], 1, 'flashcard');
      expect(pickNext).toHaveBeenNthCalledWith(2, ['sec1'], 1, 'flashcard');
      expect(session.state()).toBe('answering');
      expect(session.flashCardId()).toBe('sec1-flash-0');
      expect(session.flashFront()).toBe('Term');
      expect(session.cardId()).toBe(null);
      dispose();
    });
  });
});
