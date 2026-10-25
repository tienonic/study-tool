import { normalizeProjectText } from '../../projects/textNormalization.ts';
import { cleanAnswerLabel, cleanExplanation, cleanQuestionPrompt } from '../../projects/studyCopy.ts';

export interface GeneratedMcqCard {
  q: string;
  correct: string;
  wrong: string[];
  explanation?: string;
}

export const ANSWER_BALANCE_INSTRUCTIONS = `Anti-guessing requirements:
- The correct answer must not be the longest, most qualified, or most detailed option.
- All four options must match in character count, grammar, specificity, and detail level. Keep the longest and shortest visible options within 12 characters of each other whenever possible.
- If the correct option needs a qualifier, add comparable qualifiers to the distractors.
- For term-in-context questions, do not make one option contain all the contextual detail while the other options are short labels.
- Put teaching detail in the explanation, not in the answer option.
- Before returning JSON, rewrite any question a test-taker could answer by picking the longest or most specific option.`;

export const SOURCE_COVERAGE_INSTRUCTIONS = `Source coverage requirements:
- Use only the pasted source material and any topic or density constraints supplied in this prompt.
- Do not invent around skipped, auth-blocked, unreadable, unconverted, or image-only material.
- When the source names required sources, chapters, slides, images, objects, pages, timestamps, or coverage buckets, keep questions mapped to those source anchors when possible.
- If in-scope material is named but missing or unreadable in the pasted text, surface it as a source gap instead of pretending coverage is complete.
- Do not call a deck exam-ready or comprehensive unless the pasted source shows every in-scope item is covered or explicitly excluded.
- For art history or visual material, every in-scope artwork, object, or image present in the pasted source should be tested, explicitly excluded, or surfaced as a source gap.`;

const MAX_OPTION_LENGTH_SPREAD = 12;

function visibleLength(text: string): number {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .length;
}

export function hasBalancedAnswerOptions(question: GeneratedMcqCard): boolean {
  if (question.wrong.length < 3) return false;

  const lengths = [question.correct, ...question.wrong.slice(0, 3)].map(visibleLength);
  if (lengths.some(length => length === 0)) return false;

  const correctLength = lengths[0];
  const wrongMax = Math.max(...lengths.slice(1));
  const maxLength = Math.max(...lengths);
  const minLength = Math.min(...lengths);
  const spread = maxLength - minLength;

  if (spread > MAX_OPTION_LENGTH_SPREAD) return false;

  const correctIsClearlyLongest =
    correctLength > wrongMax
    && correctLength - wrongMax >= 5;
  if (correctIsClearlyLongest) return false;

  const optionsAreObviouslyUneven =
    spread >= 10
    && maxLength / minLength >= 1.35;
  return !optionsAreObviouslyUneven;
}

function normalizeCard(item: Record<string, unknown>): GeneratedMcqCard | null {
  if (
    typeof item.q !== 'string'
    || item.q.trim().length === 0
    || typeof item.correct !== 'string'
    || item.correct.trim().length === 0
    || !Array.isArray(item.wrong)
    || item.wrong.length < 3
    || !item.wrong.every((wrong: unknown) => typeof wrong === 'string')
    || item.wrong.some((wrong: string) => wrong.trim().length === 0)
  ) {
    return null;
  }

  const question = cleanQuestionPrompt(item.q) ?? item.q;
  const correct = cleanAnswerLabel(item.correct) ?? item.correct;
  const wrong = item.wrong.slice(0, 3).map((wrong: string) => cleanAnswerLabel(wrong) ?? wrong);
  const explanation = item.explanation ? cleanExplanation(String(item.explanation)) : undefined;

  return { q: question, correct, wrong, explanation };
}

function extractJsonArray(raw: string): unknown[] | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Try embedded JSON below.
  }

  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseGeneratedMcqCards(raw: string): GeneratedMcqCard[] {
  const parsed = extractJsonArray(raw);
  if (!parsed) return [];

  const cards = parsed
    .map(item => (item && typeof item === 'object' ? normalizeCard(item as Record<string, unknown>) : null))
    .filter((card): card is GeneratedMcqCard => card !== null)
    .filter(hasBalancedAnswerOptions);

  return normalizeProjectText(cards);
}
