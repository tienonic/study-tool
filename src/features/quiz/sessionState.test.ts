import { describe, expect, test } from 'vitest';
import {
  flashCardEntryState,
  flashFlipState,
  isActiveCardState,
  isAnsweringState,
  isDoneState,
  isIdleState,
  isQuizState,
  isRatedState,
  isRevealedState,
  isReviewableMcqState,
  isReviewingHistoryState,
  quizStates,
  restoredHistoryState,
} from './sessionState.ts';
import type { QuizState } from './sessionState.ts';

describe('quiz session state helpers', () => {
  test('recognizes only supported quiz states', () => {
    for (const state of quizStates) {
      expect(isQuizState(state)).toBe(true);
    }

    expect(isQuizState('history')).toBe(false);
    expect(isQuizState('loading')).toBe(false);
    expect(isQuizState(null)).toBe(false);
  });

  test.each<QuizState>(quizStates)('%s has one primary state predicate', (state) => {
    const matches = [
      isIdleState(state),
      isAnsweringState(state),
      isRevealedState(state),
      isRatedState(state),
      isReviewingHistoryState(state),
      isDoneState(state),
    ].filter(Boolean);

    expect(matches).toHaveLength(1);
  });

  test('active card states exclude idle and done', () => {
    expect(quizStates.filter(isActiveCardState)).toEqual(['answering', 'revealed', 'rated', 'reviewing-history']);
  });

  test('reviewable MCQ states are exactly revealed and rated', () => {
    expect(quizStates.filter(isReviewableMcqState)).toEqual(['revealed', 'rated']);
  });

  test('derives restored history and flash flip states', () => {
    expect(restoredHistoryState(true)).toBe('answering');
    expect(restoredHistoryState(false)).toBe('reviewing-history');
    expect(flashCardEntryState(false)).toBe('answering');
    expect(flashCardEntryState(true)).toBe('reviewing-history');
    expect(flashFlipState(false)).toBe('answering');
    expect(flashFlipState(true)).toBe('revealed');
  });
});
