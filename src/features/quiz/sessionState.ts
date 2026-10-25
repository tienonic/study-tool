export const quizStates = ['idle', 'answering', 'revealed', 'rated', 'reviewing-history', 'done'] as const;

export type QuizState = (typeof quizStates)[number];

const quizStateSet = new Set<string>(quizStates);

export function isQuizState(value: unknown): value is QuizState {
  return typeof value === 'string' && quizStateSet.has(value);
}

export function isIdleState(state: QuizState): state is 'idle' {
  return state === 'idle';
}

export function isAnsweringState(state: QuizState): state is 'answering' {
  return state === 'answering';
}

export function isRevealedState(state: QuizState): state is 'revealed' {
  return state === 'revealed';
}

export function isRatedState(state: QuizState): state is 'rated' {
  return state === 'rated';
}

export function isReviewingHistoryState(state: QuizState): state is 'reviewing-history' {
  return state === 'reviewing-history';
}

export function isDoneState(state: QuizState): state is 'done' {
  return state === 'done';
}

export function isActiveCardState(state: QuizState): state is 'answering' | 'revealed' | 'rated' | 'reviewing-history' {
  return isAnsweringState(state) || isRevealedState(state) || isRatedState(state) || isReviewingHistoryState(state);
}

export function isReviewableMcqState(state: QuizState): state is 'revealed' | 'rated' {
  return isRevealedState(state) || isRatedState(state);
}

export function restoredHistoryState(unanswered: boolean): QuizState {
  return unanswered ? 'answering' : 'reviewing-history';
}

export function flashCardEntryState(reviewing: boolean): QuizState {
  return reviewing ? 'reviewing-history' : 'answering';
}

export function flashFlipState(flipped: boolean): QuizState {
  return flipped ? 'revealed' : 'answering';
}
