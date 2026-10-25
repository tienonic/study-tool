import { ANSWER_BALANCE_INSTRUCTIONS, SOURCE_COVERAGE_INSTRUCTIONS } from '../ai/questionQuality.ts';

export interface FlowConfig {
  id: string;
  title: string;
  subtitle: string;
  systemPrompt: string;
  defaultModel: string;
}

const CARD_SYSTEM = `Output ONLY a JSON array. Each element: { "q": "question text", "correct": "correct answer", "wrong": ["wrong1", "wrong2", "wrong3"], "explanation": "brief explanation" }.
Questions test recall not recognition. Wrong answers must be plausible. Vary types: definition, application, comparison, cause/effect. Explanations under 60 words. Generate exactly the number requested.
${ANSWER_BALANCE_INSTRUCTIONS}`;

export const flowConfigs: Record<string, FlowConfig> = {
  translation: {
    id: 'translation',
    title: 'Translation',
    subtitle: 'Generate bilingual flashcards',
    systemPrompt: `You generate language translation flashcards. ${CARD_SYSTEM} The "q" should be in the source language and "correct" in the target language. "wrong" answers should be plausible mistranslations.`,
    defaultModel: 'gemini-2.0-flash-lite',
  },
  conversation: {
    id: 'conversation',
    title: 'Conversation',
    subtitle: 'Target language Q&A',
    systemPrompt: `You generate conversational Q&A in the target language. ${CARD_SYSTEM} Both question and answers should be in the target language.`,
    defaultModel: 'gemini-2.0-flash-lite',
  },
  language_checkit: {
    id: 'language_checkit',
    title: 'CheckIt (Language)',
    subtitle: 'Spot intentional errors',
    systemPrompt: `You generate "spot the error" language cards. ${CARD_SYSTEM} The "q" contains a sentence with an error, "correct" is the corrected version, and "wrong" answers are other incorrect versions.`,
    defaultModel: 'gemini-2.0-flash-lite',
  },
  academic_qa: {
    id: 'academic_qa',
    title: 'Academic Q&A',
    subtitle: 'Traditional flashcards for study',
    systemPrompt: `You generate academic Q&A flashcards. For art history slide/image ID material, include the work's style, movement, or culture in the tested fact or explanation when the source provides it. Do not leave style implicit. ${CARD_SYSTEM}`,
    defaultModel: 'gemini-2.0-flash-lite',
  },
  academic_checkit: {
    id: 'academic_checkit',
    title: 'CheckIt (Academic)',
    subtitle: 'Spot intentional errors in facts',
    systemPrompt: `You generate "spot the error" academic cards. ${CARD_SYSTEM} The "q" contains a statement with a factual error, "correct" is the corrected statement, and "wrong" are other incorrect statements.`,
    defaultModel: 'gemini-2.0-flash-lite',
  },
};

export const SOURCE_SYSTEM = `You generate flashcard questions from source material. Output ONLY a JSON array. Each element: { "q": "question text", "correct": "correct answer", "wrong": ["wrong1", "wrong2", "wrong3"], "explanation": "brief explanation" }.
Extract the most important concepts and test understanding, not just surface recall. Wrong answers must be plausible. Explanations under 60 words.
For art history slide/image ID material, include the work's style, movement, or culture in the tested fact or explanation when the source provides it. Do not leave style implicit.
${SOURCE_COVERAGE_INSTRUCTIONS}
${ANSWER_BALANCE_INSTRUCTIONS}`;
