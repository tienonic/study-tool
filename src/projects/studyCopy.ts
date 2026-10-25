import type { Flashcard, ProjectData, Question, Scenario } from './types.ts';

type GlossaryEntry = NonNullable<ProjectData['glossary']>[number];

function trimTrailingBreaks(value: string): string {
  return value.replace(/(?:\s*<br\s*\/?>\s*)+$/gi, '').trim();
}

function tidy(value: string): string {
  return trimTrailingBreaks(value)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,;:?])/g, '$1')
    .replace(/\s+\.(?=\s|$)/g, '.')
    .trim();
}

function stripHtmlSourceBlocks(value: string): string {
  return value
    .replace(/(?:\s*<br\s*\/?>\s*){0,3}<strong>\s*(?:Sources?|References?)\s*:\s*<\/strong>\s*[\s\S]*$/gi, '')
    .replace(/(\S[\s\S]*?)\s+(?:Sources?|References?)\s*:\s*[\s\S]*$/gi, '$1');
}

function stripAnchorMetadata(value: string): string {
  return value
    .replace(/\s*;\s*(?:anchor|source anchor)\s*:\s*[\s\S]*$/gi, '')
    .replace(/\s*;\s*(?:primary anchors?|supporting anchors?|confidence)\s*:\s*[\s\S]*$/gi, '')
    .replace(/\s+(?:primary anchors?|supporting anchors?|confidence)\s*:\s*[\s\S]*$/gi, '');
}

function stripLeadingStudyPreamble(value: string): string {
  let next = value;
  for (;;) {
    const previous = next;
    next = next
      .replace(/^(?:Connect\s+e-?book|McGraw[-\s]?Hill\s+Connect|e-?book)\s+Ch(?:apter)?\.?\s*\d+[a-z]?\s*:\s*/i, '')
      .replace(/^(?:MGT\s+)?Ch(?:apter)?\.?\s*\d+[a-z]?\s+slide\s+visual\s+drill\s*:\s*/i, '')
      .replace(/^(?:[A-Z]{2,}\s*)?Ch(?:apter)?\.?\s*\d+[a-z]?\s+(?:slides?|lecture|review|homework|quiz|practice)\s*:\s*/i, '')
      .replace(/^(?:Final guide|Source gap|Source|Manual low-text review|Exam relevance)\s*:\s*/i, '');
    if (next === previous) return next;
  }
}

function stripVisualIdMetadata(value: string): string {
  return value
    .replace(/(?:\s*<br\s*\/?>\s*){1,3}Visual ID label from [^<\n]*(?=(?:\s*<br\s*\/?>|$))/gi, '')
    .replace(/\s*Visual ID label from [^.;<\n]+[.;]?\s*/gi, ' ');
}

function stripTrailingTerms(value: string): string {
  return value
    .replace(/(?:\s*<br\s*\/?>\s*){0,2}<strong>\s*Terms\s*:\s*<\/strong>\s*[\s\S]*$/gi, '')
    .replace(/\s+Terms\s*:\s*[\s\S]*$/g, '');
}

function stripStudyMetadata(value: string): string {
  return tidy(stripAnchorMetadata(stripHtmlSourceBlocks(stripVisualIdMetadata(stripLeadingStudyPreamble(value)))));
}

function stripGeneratedIdPrefix(value: string): string {
  return value.replace(/^[A-Z]{2,}\d*(?:_[A-Z0-9]+)+_\d+\s*:\s*/i, '');
}

function stripCuePrefix(value: string): string {
  return value
    .replace(/^Final guide\s*:\s*/i, '')
    .replace(/^Source gap\s*:\s*/i, '')
    .replace(/^Source\s*:\s*/i, '')
    .replace(/^Manual low-text review\s*:\s*/i, '')
    .replace(/^ID this\s*:\s*/i, '')
    .replace(/^Remember\s*:\s*/i, '')
    .replace(/^Q\d+\s*:\s*/i, '')
    .replace(/^ABT\s+final\s+project\s*:\s*/i, '');
}

function stripQuestionPreamble(value: string): string {
  return value
    .replace(/^Which\s+AHI\s+slide\s+object\s+matches\s+this\s+source\s+anchor\s*:\s*Visual ID label from [^?]+\?/i, 'Which slide object matches this image?')
    .replace(/^Which\s+AHI\s+slide\s+object\s+matches\s+this\s+source\s+anchor\s*:?\s*$/i, 'Which slide object matches this image?')
    .replace(/^Which\s+AHI\s+visual detail matches this manually reviewed low-text slide\s*:\s*[^?]+\?/i, 'Which visual detail matches this slide?')
    .replace(/^AHI\s+final-priority\s+anchor check\s*:\s*which row is supported by\s+[^;?]+[\s\S]*$/i, 'Which row is supported by this source?')
    .replace(/^Which\s+[^:]{0,220}\s+fits this clue\s*:\s*/i, '')
    .replace(/^AHI\s+final-priority\s+source item\s*:\s*/i, '')
    .replace(/^Identify this\s+AHI\s+final(?:-scope)?\s+image(?:\/object anchor from the local slide corpus)?\./i, 'Identify this image.')
    .replace(/^Identify this\s+AHI\s+final\s+image\/object anchor from the local slide corpus\./i, 'Identify this image/object.')
    .replace(/\.\s*Unit\s*:\s*[^.]*\.\s*Coverage\s*:\s*[^.]*\.\s*Notes\s*:\s*/i, '. ')
    .replace(/\.\s*Unit\s*:\s*[^.]*\.\s*Coverage\s*:\s*[^.]*\.?/i, '.')
    .replace(/\.\s*Unit\s*:\s*[\s\S]*$/i, '.');
}

function stripFlashcardPromptMetadata(value: string): string {
  return value
    .replace(/^Identify this slide image\s*\([^)]+\)\s*$/i, 'Identify this slide image.')
    .replace(/\s*[-–]\s*source point\s*\d+\s*$/i, '');
}

function stripSourcePointSuffix(value: string): string {
  return value.replace(/\s*[-–]\s*source point\s*\d+\s*$/i, '');
}

function capitalizeLeadingQuestionWord(value: string): string {
  return value.replace(
    /^([a-z])/,
    (match) => match[0].toUpperCase() + match.slice(1),
  );
}

export function cleanQuestionPrompt(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return capitalizeLeadingQuestionWord(tidy(stripQuestionPreamble(stripGeneratedIdPrefix(stripStudyMetadata(value)))));
}

export function cleanAnswerLabel(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return tidy(stripSourcePointSuffix(stripCuePrefix(stripGeneratedIdPrefix(stripStudyMetadata(value)))));
}

export function cleanExplanation(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (/^\s*Anchor\s*:/i.test(value)) return undefined;
  if (/^\s*(?:Sources?|References?)\s*:/i.test(value)) return undefined;
  const withoutSourceLead = value.replace(/^Source-backed clue from\s+[^.]+(?:\.\s*)?/i, '');
  const cleaned = tidy(stripTrailingTerms(stripStudyMetadata(withoutSourceLead)));
  if (/^(?:anchor|source anchor|primary anchors?|supporting anchors?|confidence)\s*:/i.test(cleaned)) return undefined;
  if (/^Use this as a visual-ID prompt\b/i.test(cleaned)) return undefined;
  return cleaned || undefined;
}

export function cleanFlashFront(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return tidy(stripFlashcardPromptMetadata(stripCuePrefix(stripGeneratedIdPrefix(stripStudyMetadata(value))))) || undefined;
}

export function cleanFlashBack(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const withoutSource = stripStudyMetadata(stripCuePrefix(value));
  const withoutDeckMetadata = withoutSource
    .replace(/\.\s*Unit\s*:\s*[^.]*\.\s*Coverage\s*:\s*[^.]*\.\s*Notes\s*:\s*/i, '. ')
    .replace(/\.\s*Unit\s*:\s*[^.]*\.\s*Coverage\s*:\s*[^.]*\.?/i, '.')
    .replace(/\.\s*Unit\s*:\s*[\s\S]*$/i, '.');
  return tidy(stripTrailingTerms(withoutDeckMetadata)) || undefined;
}

export function cleanPassageHtml(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return stripStudyMetadata(value);
}

function normalizedChoice(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function addUniqueAnswer(answerBank: string[], seen: Set<string>, value: string | undefined): void {
  if (!value) return;
  const cleaned = cleanAnswerLabel(value) ?? value;
  const key = normalizedChoice(cleaned);
  if (!key || seen.has(key)) return;
  seen.add(key);
  answerBank.push(cleaned);
}

function collectAnswerBank(data: ProjectData): string[] {
  const answerBank: string[] = [];
  const seen = new Set<string>();
  for (const section of data.sections) {
    for (const question of section.questions ?? []) {
      addUniqueAnswer(answerBank, seen, question.correct);
    }
    for (const scenario of section.scenarios ?? []) {
      for (const question of scenario.questions ?? []) {
        addUniqueAnswer(answerBank, seen, question.correct);
      }
    }
    for (const flashcard of section.flashcards ?? []) {
      addUniqueAnswer(answerBank, seen, flashcard.front);
    }
  }
  for (const entry of data.glossary ?? []) {
    addUniqueAnswer(answerBank, seen, entry.term);
  }
  return answerBank;
}

function repairWrongChoices(wrong: string[], correct: string, answerBank: string[]): string[] {
  const targetCount = Math.max(3, wrong.length);
  const used = new Set([normalizedChoice(correct)]);
  const repaired: string[] = [];

  for (const choice of wrong) {
    const cleaned = cleanAnswerLabel(choice) ?? choice;
    const key = normalizedChoice(cleaned);
    if (!key || used.has(key)) continue;
    used.add(key);
    repaired.push(cleaned);
  }

  for (const candidate of answerBank) {
    if (repaired.length >= targetCount) break;
    const key = normalizedChoice(candidate);
    if (!key || used.has(key)) continue;
    used.add(key);
    repaired.push(candidate);
  }

  return repaired;
}

function cleanQuestionData(question: Question, answerBank: string[]): Question {
  const correct = cleanAnswerLabel(question.correct) ?? question.correct;
  return {
    ...question,
    q: cleanQuestionPrompt(question.q) ?? question.q,
    correct,
    wrong: Array.isArray(question.wrong)
      ? repairWrongChoices(question.wrong, correct, answerBank)
      : question.wrong,
    explanation: cleanExplanation(question.explanation),
  };
}

function cleanFlashcardData(flashcard: Flashcard): Flashcard {
  return {
    ...flashcard,
    front: cleanFlashFront(flashcard.front) ?? flashcard.front,
    back: cleanFlashBack(flashcard.back) ?? flashcard.back,
  };
}

function cleanScenarioData(scenario: Scenario, answerBank: string[]): Scenario {
  return {
    ...scenario,
    passage: cleanPassageHtml(scenario.passage) ?? scenario.passage,
    questions: Array.isArray(scenario.questions) ? scenario.questions.map(question => cleanQuestionData(question, answerBank)) : scenario.questions,
  };
}

function cleanGlossaryDef(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const withoutSource = stripStudyMetadata(value);
  const withoutDeckMetadata = withoutSource
    .replace(/\.\s*Unit\s*:\s*[^.]*\.\s*Coverage\s*:\s*[^.]*\.\s*Notes\s*:\s*/i, '. ')
    .replace(/\.\s*Unit\s*:\s*[^.]*\.\s*Coverage\s*:\s*[^.]*\.?/i, '.')
    .replace(/\.\s*Unit\s*:\s*[\s\S]*$/i, '.');
  return tidy(withoutDeckMetadata) || undefined;
}

function cleanGlossaryEntry(entry: GlossaryEntry): GlossaryEntry | null {
  const term = cleanFlashFront(entry.term) ?? entry.term;
  const def = cleanGlossaryDef(entry.def) ?? '';
  if (!term.trim() || !def.trim()) return null;
  return { ...entry, term, def };
}

export function cleanProjectStudyCopy(data: ProjectData): ProjectData {
  const answerBank = collectAnswerBank(data);
  return {
    ...data,
    sections: data.sections.map(section => ({
      ...section,
      questions: section.questions?.map(question => cleanQuestionData(question, answerBank)),
      scenarios: section.scenarios?.map(scenario => cleanScenarioData(scenario, answerBank)),
      flashcards: section.flashcards?.map(cleanFlashcardData),
    })),
    glossary: data.glossary?.map(cleanGlossaryEntry).filter((entry): entry is GlossaryEntry => entry !== null),
  };
}
