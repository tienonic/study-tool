import type { Flashcard, Question } from '../../projects/types.ts';
import type { HistoryEntry, HistoryPosition } from './historyNav.ts';
import type { QuizState } from './sessionState.ts';

export type { QuizState };

/** Core MCQ view — used by McqCard.tsx and handleMcqKeyboard */
export interface McqView {
  state: () => QuizState;
  question: () => Question | null;
  options: () => string[];
  selected: () => string | null;
  isCorrect: () => boolean;
  passage: () => string;
  skipped: () => boolean;
  ratingLabels: () => Record<number, string>;
  leechWarning: () => boolean;
  currentImageLink: () => string;
  currentImageLinks: () => { wiki?: string; search?: string };
  score: () => { correct: number; attempted: number };
  dueCount: () => { due: number; newCount: number; total: number };
  historyPosition: () => HistoryPosition;
  cramMode: () => boolean;

  answer: (option: string) => Promise<void>;
  rate: (rating: number) => Promise<void>;
  skip: () => Promise<void>;
  pickNextCard: () => Promise<void>;
  undo: () => Promise<void>;
  suspend: () => Promise<void>;
  bury: () => Promise<void>;
  flagWrong: () => Promise<void>;
  goBackHistory: () => void;
  advanceFromHistory: () => void;
  studyMore: () => Promise<void>;
  startCram: () => Promise<void>;
  increaseNewCards: (count?: number) => Promise<void>;
  unburyAll: () => Promise<void>;
}

/** Flashcard view — used by FlashcardArea.tsx and handleFlashcardKeyboard */
export interface FlashView {
  state: () => QuizState;
  flashFlipped: () => boolean;
  flashFront: () => string;
  flashBack: () => string;
  flashTitle: () => string;
  flashFrontImage: () => string;
  flashBackImage: () => string;
  flashCardId: () => string | null;
  activeFlashcard: () => Flashcard | null;
  flashDefFirst: () => boolean;
  dueCount: () => { due: number; newCount: number; total: number };
  historyPosition: () => HistoryPosition;
  ratingLabels: () => Record<number, string>;
  pronunciationPlaying: () => boolean;
  pronunciationPlayed: () => boolean;
  pronunciationError: () => string | null;

  flipFlash: () => void;
  rateFlash: (rating: number) => Promise<void>;
  markFlashWrong: () => Promise<void>;
  playPronunciation: () => Promise<void>;
  noteManualPronunciation: () => void;
  stopPronunciation: () => void;
  goBackHistory: () => void;
  advanceFromHistory: () => void;
  studyMore: () => Promise<void>;
  startCram: () => Promise<void>;
  increaseNewCards: (count?: number) => Promise<void>;
  unburyAll: () => Promise<void>;
}

/** Narrow view for Header.tsx flash mode toggle */
export interface FlashModeView {
  flashMode: () => boolean;
  toggleFlashMode: () => void;
}

/** Full session — extends both views, adds mode controls, timer, maintenance */
export interface QuizSession extends McqView, FlashView {
  cardId: () => string | null;
  flashMode: () => boolean;
  toggleFlashMode: () => void;
  setFlashDefFirst: (v: boolean) => void;
  historyReview: () => HistoryEntry | null;
  cramCount: () => number;
  endCram: () => void;
  shuffleFlash: () => Promise<void>;
  shuffleMcq: () => Promise<void>;
  resetSection: () => Promise<void>;
  refreshDue: () => Promise<void>;
  timer: { seconds: () => number; start: () => void; stop: () => number; reset: () => void; pause: () => void; resume: () => void; setSuspended: (value: boolean) => void; paused: () => boolean };
  paused: () => boolean;
  togglePause: () => void;
}
