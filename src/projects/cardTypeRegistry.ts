import type { Component } from 'solid-js';
import type { Section, Question } from './types.ts';
import { assertNever } from '../features/quiz/helpers.ts';
import { imgSrc } from '../utils/imgSrc.ts';

export interface LookupResult {
  question: Question;
  scenarioIdx?: number;
  questionIdx?: number;
  passage?: string;
}

export interface CardTypeEntry {
  /** Component to render this section type */
  component: () => Promise<{ default: Component<{ section: Section }> }>;
  /** Build card IDs from section data — mutates section.cardIds/flashCardIds */
  buildCardIds: (section: Section) => void;
  /** Worker card type for FSRS registration (null = not registered, e.g. math-gen) */
  workerCardType: 'mcq' | 'passage' | null;
  /** Keyboard handler category */
  keyboardHandler: 'mcq' | 'math';
  /** Look up a question by card ID (null for types with no static questions) */
  lookupQuestion: ((section: Section, cardId: string) => LookupResult | null) | null;
}

function buildMcqCardIds(section: Section): void {
  section.cardIds = [];
  section.flashCardIds = [];
  if (section.questions) {
    section.questions.forEach((question, i) => {
      section.cardIds.push(`${section.id}-${question.id ?? i}`);
    });
  }
  if (section.flashcards) {
    section.flashcards.forEach((flashcard, i) => {
      section.flashCardIds.push(`${section.id}-flash-${flashcard.id ?? i}`);
    });
  }
}

function buildPassageCardIds(section: Section): void {
  section.cardIds = [];
  section.flashCardIds = [];
  if (section.scenarios) {
    section.scenarios.forEach((s, si) => {
      s.questions.forEach((question, qi) => {
        section.cardIds.push(`${section.id}-${question.id ?? `${si}-${qi}`}`);
      });
    });
  }
  if (section.flashcards) {
    section.flashcards.forEach((flashcard, i) => {
      section.flashCardIds.push(`${section.id}-flash-${flashcard.id ?? i}`);
    });
  }
}

function buildMathCardIds(section: Section): void {
  section.cardIds = [];
  section.flashCardIds = [];
  if (section.flashcards) {
    section.flashcards.forEach((flashcard, i) => {
      section.flashCardIds.push(`${section.id}-flash-${flashcard.id ?? i}`);
    });
  }
}

function lookupMcq(section: Section, cardId: string): LookupResult | null {
  if (!section.questions) return null;
  const explicit = section.questions.find(question => question.id && cardId === `${section.id}-${question.id}`);
  if (explicit) return { question: explicit };
  const idx = parseInt(cardId.slice(section.id.length + 1), 10);
  if (isNaN(idx)) return null;
  const q = section.questions[idx];
  return q ? { question: q } : null;
}

function lookupPassage(section: Section, cardId: string): LookupResult | null {
  if (!section.scenarios) return null;
  for (const [scenarioIdx, scenario] of section.scenarios.entries()) {
    const questionIdx = scenario.questions.findIndex(question => question.id && cardId === `${section.id}-${question.id}`);
    if (questionIdx >= 0) {
      return {
        question: scenario.questions[questionIdx],
        scenarioIdx,
        questionIdx,
        passage: buildPassage(section, scenarioIdx),
      };
    }
  }
  const suffix = cardId.slice(section.id.length + 1);
  const parts = suffix.split('-');
  if (parts.length < 2) return null;
  const si = parseInt(parts[0], 10);
  const qi = parseInt(parts[1], 10);
  if (isNaN(si) || isNaN(qi)) return null;
  const scenario = section.scenarios[si];
  if (!scenario) return null;
  const q = scenario.questions[qi];
  if (!q) return null;
  return { question: q, scenarioIdx: si, questionIdx: qi, passage: buildPassage(section, si) };
}

function buildPassage(section: Section, scenarioIdx: number): string {
  const scenario = section.scenarios?.[scenarioIdx];
  if (!scenario) return '';
  return (scenario.image ? `<img src="${(imgSrc(scenario.image) ?? '').replace(/"/g, '&quot;')}" alt="" class="card-image" loading="lazy" crossorigin="anonymous" />` : '')
    + scenario.passage + (scenario.source
    ? `<span class="source">${scenario.source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`
    : '');
}

export const cardTypeRegistry: Record<Section['type'], CardTypeEntry> = {
  'mc-quiz': {
    component: () => import('../features/quiz/QuizSection.tsx').then(m => ({ default: m.QuizSection })),
    buildCardIds: buildMcqCardIds,
    workerCardType: 'mcq',
    keyboardHandler: 'mcq',
    lookupQuestion: lookupMcq,
  },
  'passage-quiz': {
    component: () => import('../features/quiz/QuizSection.tsx').then(m => ({ default: m.QuizSection })),
    buildCardIds: buildPassageCardIds,
    workerCardType: 'passage',
    keyboardHandler: 'mcq',
    lookupQuestion: lookupPassage,
  },
  'math-gen': {
    component: () => import('../features/math/MathSection.tsx').then(m => ({ default: m.MathSection })),
    buildCardIds: buildMathCardIds,
    workerCardType: null,
    keyboardHandler: 'math',
    lookupQuestion: null,
  },
};

/** Get registry entry with exhaustiveness check */
export function getCardTypeEntry(type: Section['type']): CardTypeEntry {
  const entry = cardTypeRegistry[type];
  if (!entry) assertNever(type as never, 'Unknown section type');
  return entry;
}
