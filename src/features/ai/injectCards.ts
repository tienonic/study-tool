import { setAppPhase } from '../../core/store/app.ts';
import { registerAndActivateSection } from './sectionInjector.ts';
import { normalizeProjectText, normalizeTextEncoding } from '../../projects/textNormalization.ts';
import { cleanAnswerLabel, cleanExplanation, cleanFlashBack, cleanFlashFront, cleanQuestionPrompt } from '../../projects/studyCopy.ts';
import type { Section, Question } from '../../projects/types.ts';

export interface GeneratedCard {
  q: string;
  correct: string;
  wrong: string[];
  explanation?: string;
}

export async function injectGeneratedCards(
  cards: GeneratedCard[],
  sectionName: string,
  enterStudy = true,
): Promise<void> {
  if (cards.length === 0) return;

  const sectionId = 'gen-' + Date.now();
  const mcqQuestions: Question[] = cards.map(q => ({
    q: cleanQuestionPrompt(normalizeTextEncoding(q.q)) ?? normalizeTextEncoding(q.q),
    correct: cleanAnswerLabel(normalizeTextEncoding(q.correct)) ?? normalizeTextEncoding(q.correct),
    wrong: q.wrong.map(wrong => cleanAnswerLabel(normalizeTextEncoding(wrong)) ?? normalizeTextEncoding(wrong)),
    explanation: q.explanation ? cleanExplanation(normalizeTextEncoding(q.explanation)) : undefined,
  }));
  const cardIds = mcqQuestions.map((_, i) => `${sectionId}-${i}`);

  const newSection: Section = {
    id: sectionId, name: normalizeTextEncoding(sectionName), type: 'mc-quiz',
    questions: mcqQuestions, cardIds, flashCardIds: [],
  };
  const cardRegs = cardIds.map(cardId => ({ sectionId, cardId, cardType: 'mcq' as const }));

  const ok = await registerAndActivateSection(newSection, cardRegs, enterStudy ? () => setAppPhase('study') : undefined);
  if (!ok) return;
}

export async function injectFlashcards(
  cards: { front: string; back: string }[],
  sectionName: string,
  enterStudy = true,
): Promise<void> {
  if (cards.length === 0) return;

  const sectionId = 'diy-' + Date.now();
  const flashcards = normalizeProjectText(cards.map(c => ({
    front: cleanFlashFront(c.front) ?? c.front,
    back: cleanFlashBack(c.back) ?? c.back,
  })));
  const flashCardIds = flashcards.map((_, i) => `${sectionId}-flash-${i}`);

  const newSection: Section = {
    id: sectionId, name: normalizeTextEncoding(sectionName), type: 'mc-quiz' as const,
    questions: [], hasFlashcards: true, flashcards, cardIds: [], flashCardIds,
  };
  const cardRegs = flashCardIds.map(cardId => ({ sectionId, cardId, cardType: 'flashcard' as const }));

  const ok = await registerAndActivateSection(newSection, cardRegs, enterStudy ? () => setAppPhase('study') : undefined);
  if (!ok) return;
}
