import type { Section, Question, Flashcard } from '../../projects/types.ts';
import { getCardTypeEntry } from '../../projects/cardTypeRegistry.ts';

/** Compile-time exhaustiveness check — use in default/else branches on discriminated unions */
export function assertNever(value: never, msg = 'Unhandled type'): never {
  throw new Error(`${msg}: ${value}`);
}

export function timeToRating(seconds: number, failAt = 60): number {
  if (seconds >= failAt) return 1;                // Again
  if (seconds >= Math.round(failAt * 2 / 3)) return 2; // Hard
  if (seconds >= Math.round(failAt / 8)) return 3;     // Good
  return 4;                                        // Easy
}

export function lookupQuestion(
  section: Section,
  cardId: string,
): { question: Question; scenarioIdx?: number; questionIdx?: number; passage?: string } | null {
  const entry = getCardTypeEntry(section.type);
  return entry.lookupQuestion ? entry.lookupQuestion(section, cardId) : null;
}

export function getCardType(
  sectionType: Section['type'],
  flashMode: boolean,
): 'mcq' | 'passage' | 'flashcard' {
  if (flashMode) return 'flashcard';
  switch (sectionType) {
    case 'mc-quiz': return 'mcq';
    case 'passage-quiz': return 'passage';
    case 'math-gen': return 'mcq';
    default: assertNever(sectionType, 'Unknown section type');
  }
}

/** Map section type to worker card type for registration (no flash mode consideration) */
export function sectionToCardType(sectionType: Section['type']): 'mcq' | 'passage' {
  switch (sectionType) {
    case 'mc-quiz': return 'mcq';
    case 'passage-quiz': return 'passage';
    case 'math-gen': return 'mcq';
    default: assertNever(sectionType, 'Unknown section type');
  }
}

/** Find which source section owns a card ID by matching the section.id prefix */
export function findOwnerSection(sections: Section[], cardId: string): Section | undefined {
  return sections.find(s => cardId === s.id || cardId.startsWith(s.id + '-'));
}

export function lookupQuestionAcross(
  sections: Section[],
  cardId: string,
): { question: Question; scenarioIdx?: number; questionIdx?: number; passage?: string } | null {
  const owner = findOwnerSection(sections, cardId);
  return owner ? lookupQuestion(owner, cardId) : null;
}

export function resolveFlashCardAcross(
  sections: Section[],
  cardId: string,
): { idx: number; card: Flashcard } | null {
  const owner = findOwnerSection(sections, cardId);
  return owner ? resolveFlashCard(owner, cardId) : null;
}

export function resolveFlashCard(
  section: Section,
  cardId: string,
): { idx: number; card: Flashcard } | null {
  const prefix = section.id + '-flash-';
  if (!cardId.startsWith(prefix)) return null;
  const explicitIdx = section.flashcards?.findIndex(card => card.id && cardId === `${prefix}${card.id}`) ?? -1;
  if (explicitIdx >= 0) return { idx: explicitIdx, card: section.flashcards![explicitIdx] };
  const idx = parseInt(cardId.slice(prefix.length), 10);
  if (isNaN(idx)) return null;
  const card = section.flashcards?.[idx];
  return card ? { idx, card } : null;
}
