import { createRoot, createSignal } from 'solid-js';
import { describe, expect, test, vi } from 'vitest';
import { coreFeatureScenarios, type ContentShape, type FeatureScenario } from './featureMatrix.ts';
import { createFakeProjectApi } from './testUtils.ts';
import type { FlashSignals } from './flashFlow.ts';
import type { McqSignals } from './mcqFlow.ts';
import type { Guard } from './guard.ts';
import type { Flashcard, Question, Section } from '../../projects/types.ts';
import type { QuizState } from './types.ts';

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

vi.mock('../../core/store/app.ts', () => ({
  easyMode: () => false,
  sessionSummary: () => null,
  setSessionSummary: vi.fn(),
}));

import { createCramSession } from './cramSession.ts';
import { createFlashFlow } from './flashFlow.ts';
import { createMcqFlow } from './mcqFlow.ts';

function runInRoot(fn: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    createRoot((dispose) => {
      fn().then(resolve, reject).finally(dispose);
    });
  });
}

function guard(): Guard {
  return { isActing: () => false, withActing: async (fn: () => Promise<void>) => fn() };
}

function question(label: string, shape: ContentShape): Question {
  return {
    q: `${label}?`,
    correct: `${label} correct`,
    wrong: [`${label} wrong 1`, `${label} wrong 2`, `${label} wrong 3`],
    explanation: shape === 'artId' ? 'Style: Impressionism. Test feedback.' : `${label} explanation`,
    imageName: shape === 'image' || shape === 'artId' ? `${label}.jpg` : undefined,
  };
}

function mcqSection(id: string, shape: ContentShape): Section {
  if (shape === 'passage') {
    return {
      id,
      name: id,
      type: 'passage-quiz',
      scenarios: [{
        passage: 'A short source passage.',
        questions: [question(`${id} first`, shape), question(`${id} second`, shape)],
      }],
      cardIds: [`${id}-0-0`, `${id}-0-1`],
      flashCardIds: [],
    };
  }
  return {
    id,
    name: id,
    type: 'mc-quiz',
    questions: [question(`${id} first`, shape), question(`${id} second`, shape)],
    cardIds: [`${id}-0`, `${id}-1`],
    flashCardIds: [],
  };
}

function flashSection(id: string, shape: ContentShape): Section {
  return {
    id,
    name: id,
    type: 'mc-quiz',
    questions: [question(`${id} quiz`, 'text')],
    cardIds: [`${id}-0`],
    flashCardIds: [`${id}-flash-0`, `${id}-flash-1`],
    flashcards: [
      {
        front: `${id} front 1`,
        back: shape === 'artId' ? '<strong>Work One</strong><br>Style: Impressionism' : `${id} back 1`,
        frontImage: shape === 'image' || shape === 'artId' ? `${id}-front-1.jpg` : undefined,
      },
      {
        front: `${id} front 2`,
        back: shape === 'artId' ? '<strong>Work Two</strong><br>Style: Realism' : `${id} back 2`,
        frontImage: shape === 'image' || shape === 'artId' ? `${id}-front-2.jpg` : undefined,
      },
    ],
  };
}

function createMcqSignals(): McqSignals {
  const [state, setState] = createSignal<QuizState>('idle');
  const [cardId, setCardId] = createSignal<string | null>(null);
  const [questionSignal, setQuestion] = createSignal<Question | null>(null);
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
    state, setState, cardId, setCardId, question: questionSignal, setQuestion,
    options, setOptions, selected, setSelected, isCorrect, setIsCorrect,
    passage, setPassage, ratingLabels, setRatingLabels, score, setScore,
    leechWarning, setLeechWarning, skipped, setSkipped, flashMode,
  };
}

function createFlashSignals(): FlashSignals {
  const [state, setState] = createSignal<QuizState>('idle');
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
    state, setState, flashCardId, setFlashCardId, flashFlipped, setFlashFlipped,
    flashFront, setFlashFront, flashBack, setFlashBack, flashTitle, setFlashTitle,
    flashFrontImage, setFlashFrontImage, flashBackImage, setFlashBackImage,
    flashDefFirst, ratingLabels, setRatingLabels, setActiveFlashcard,
  };
}

function quizSectionsForScenario(scenario: FeatureScenario) {
  const primary = mcqSection('sec-a', scenario.contentShape);
  if (scenario.deckScope === 'single') return { section: primary, sourceSections: undefined, cardIds: primary.cardIds };
  const secondary = mcqSection('sec-b', scenario.contentShape);
  return { section: primary, sourceSections: [primary, secondary], cardIds: secondary.cardIds };
}

function flashSectionsForScenario(scenario: FeatureScenario) {
  const primary = flashSection('sec-a', scenario.contentShape);
  if (scenario.deckScope === 'single') return { section: primary, sourceSections: undefined, cardIds: primary.flashCardIds };
  const secondary = flashSection('sec-b', scenario.contentShape);
  return { section: primary, sourceSections: [primary, secondary], cardIds: secondary.flashCardIds };
}

const historyReadOnlyScenarios = coreFeatureScenarios.filter(s => s.mustHold.includes('historyIsReadOnly'));
const cramHardScenarios = coreFeatureScenarios.filter(s => s.mustHold.includes('cramHardRemembered'));

describe('feature-matrix-backed behavior', () => {
  test.each(historyReadOnlyScenarios)('$id keeps history navigation read-only', async (scenario) => {
    await runInRoot(async () => {
      if (scenario.studyMode === 'flash') {
        const { section, sourceSections, cardIds } = flashSectionsForScenario(scenario);
        const api = createFakeProjectApi({
          pickNext: vi.fn()
            .mockResolvedValueOnce({ cardId: cardIds[0] })
            .mockResolvedValueOnce({ cardId: cardIds[1] }),
          reviewCard: vi.fn().mockResolvedValue({ card: {}, isLeech: false, lapses: 0 }),
          addActivity: vi.fn().mockResolvedValue(undefined),
        });
        const s = createFlashSignals();
        const flow = createFlashFlow(s, {
          section,
          sourceSections,
          project: () => ({ slug: 'matrix-test', config: { new_per_session: 10 } }),
          guard: guard(),
          timer: { start: vi.fn(), stop: vi.fn().mockReturnValue(3), reset: vi.fn() },
          cramMode: () => false,
          cramMarkSeen: vi.fn(),
          cramPickNext: vi.fn().mockResolvedValue(undefined),
          cramRate: vi.fn(),
          refreshDue: vi.fn().mockResolvedValue(undefined),
          api,
        });

        await flow.pickNextFlash();
        flow.flipFlash();
        await flow.rateFlash(3);
        const reviewCalls = vi.mocked(api.reviewCard).mock.calls.length;
        const activityCalls = vi.mocked(api.addActivity).mock.calls.length;

        flow.goBackHistory();
        await flow.rateFlash(1);
        flow.advanceHistory();

        expect(s.state()).not.toBe('reviewing-history');
        expect(api.reviewCard).toHaveBeenCalledTimes(reviewCalls);
        expect(api.addActivity).toHaveBeenCalledTimes(activityCalls);
        return;
      }

      const { section, sourceSections, cardIds } = quizSectionsForScenario(scenario);
      const doRate = vi.fn().mockResolvedValue(undefined);
      const api = createFakeProjectApi({
        pickNext: vi.fn()
          .mockResolvedValueOnce({ cardId: cardIds[0] })
          .mockResolvedValueOnce({ cardId: cardIds[1] }),
        updateScore: vi.fn().mockResolvedValue({ correct: 1, attempted: 1 }),
      });
      const s = createMcqSignals();
      const flow = createMcqFlow(s, {
        section,
        sourceSections,
        project: () => ({ slug: 'matrix-test', config: { new_per_session: 10, imageSearchSuffix: '' } }),
        guard: guard(),
        timer: { start: vi.fn(), stop: vi.fn().mockReturnValue(3) },
        failAt: () => 60,
        doRate,
        refreshDue: vi.fn().mockResolvedValue(undefined),
        cramMode: () => false,
        pickNextCram: vi.fn().mockResolvedValue(undefined),
        api,
      });

      await flow.pickNextCardImpl();
      await flow.answer(s.question()!.correct);
      await flow.pickNextCardImpl();
      const scoreCalls = vi.mocked(api.updateScore).mock.calls.length;
      const rateCalls = doRate.mock.calls.length;

      flow.goBackHistory();
      flow.advanceFromHistory(flow.pickNextCardImpl);

      expect(api.updateScore).toHaveBeenCalledTimes(scoreCalls);
      expect(doRate).toHaveBeenCalledTimes(rateCalls);
      expect(api.reviewCard).not.toHaveBeenCalled();
    });
  });

  test.each(cramHardScenarios)('$id treats Hard as remembered and keeps unseen cards moving', async (scenario) => {
    await runInRoot(async () => {
      const picked: string[] = [];
      const cardType = scenario.studyMode === 'flash' ? 'flashcard' : 'mcq';
      const sectionIds = scenario.deckScope === 'merged' ? ['sec-a', 'sec-b'] : ['sec-a'];
      const api = createFakeProjectApi({
        getPerformanceCards: vi.fn().mockResolvedValue([
          { card_id: 'c1', section_id: sectionIds.at(-1)!, card_type: cardType, fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
          { card_id: 'c2', section_id: sectionIds.at(-1)!, card_type: cardType, fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
          { card_id: 'c3', section_id: sectionIds.at(-1)!, card_type: cardType, fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
          { card_id: 'c4', section_id: sectionIds.at(-1)!, card_type: cardType, fsrs_state: 0, stability: 0, difficulty: 0, reps: 0, lapses: 0 },
        ]),
      });
      const cram = createCramSession({
        projectSlug: () => 'matrix-test',
        sectionId: 'sec-a',
        sectionIds,
        flashMode: () => scenario.studyMode === 'flash',
        sectionType: 'mc-quiz',
        merged: scenario.deckScope === 'merged',
        onPickMcq: (cardId) => picked.push(cardId),
        onPickFlash: (cardId) => picked.push(cardId),
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
});
