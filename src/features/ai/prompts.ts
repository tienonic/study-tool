import type { PerformanceSummary, GeneratedQuestion } from './types.ts';
import type { Section } from '../../projects/types.ts';
import { ANSWER_BALANCE_INSTRUCTIONS, SOURCE_COVERAGE_INSTRUCTIONS, parseGeneratedMcqCards } from './questionQuality.ts';

const INSIGHTS_SYSTEM = `You are a spaced-repetition study coach analyzing FSRS data. Cover:
1. Overall summary (1-2 sentences)
2. Weakest sections by accuracy
3. Specific weak cards (up to 5) — mention card IDs and why they're struggling
4. Actionable recommendations
5. Positive observations

Be direct, under 600 words. Use markdown headers and bullet points.`;

const GENERATE_SYSTEM = `Output ONLY a JSON array. Each element: { "q": "question text", "correct": "correct answer", "wrong": ["wrong1", "wrong2", "wrong3"], "explanation": "brief explanation" }.
Questions test recall not recognition. Wrong answers must be plausible. Vary types: definition, application, comparison, cause/effect. Explanations under 60 words. Generate exactly the number requested.
For art history slide/image ID material, include the work's style, movement, or culture in the tested fact or explanation when the source provides it. Do not leave style implicit.
Use source anchors only to decide coverage. Do not include source IDs, page IDs, deck IDs, coverage labels, source-point suffixes like "source point 1", chapter/source preambles like "Connect eBook Ch4:", "MGT Ch6 slide visual drill:", "Source:", "Final guide:", or "Which [course] final concept fits this clue:" in q, correct, wrong, or explanation text.
${SOURCE_COVERAGE_INSTRUCTIONS}
${ANSWER_BALANCE_INSTRUCTIONS}`;

const TARGETED_SYSTEM = `Output ONLY a JSON array. Each element: { "q": "question text", "correct": "correct answer", "wrong": ["wrong1", "wrong2", "wrong3"], "explanation": "brief explanation" }.
Focus on the student's weakest areas. Generate questions that reinforce concepts they're struggling with — target low-accuracy sections, high-lapse cards, and unstable knowledge. Wrong answers must be plausible. Explanations under 60 words.
For art history slide/image ID material, include the work's style, movement, or culture in the tested fact or explanation when the source provides it. Do not leave style implicit.
Use source anchors only to decide coverage. Do not include source IDs, page IDs, deck IDs, coverage labels, source-point suffixes like "source point 1", chapter/source preambles like "Connect eBook Ch4:", "MGT Ch6 slide visual drill:", "Source:", "Final guide:", or "Which [course] final concept fits this clue:" in q, correct, wrong, or explanation text.
${ANSWER_BALANCE_INSTRUCTIONS}`;

export function formatPerformanceSummary(summary: PerformanceSummary): string {
  const lines: string[] = [];
  lines.push(`Project: ${summary.projectName}`);
  lines.push(`Total cards: ${summary.totalCards}, Total reviews: ${summary.totalReviews}`);
  lines.push(`Recent accuracy (last 100): ${(summary.recentAccuracy * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('Sections:');
  for (const s of summary.sections) {
    const acc = s.attempted > 0 ? ((s.accuracy * 100).toFixed(1) + '%') : 'no data';
    lines.push(`- ${s.name} (${s.id}): ${acc} (${s.attempted} attempts), ${s.weakCards} weak cards, avg stability ${s.avgStability.toFixed(1)}`);
  }
  if (summary.weakCards.length > 0) {
    lines.push('');
    lines.push('Weakest cards (by lapses):');
    for (const c of summary.weakCards.slice(0, 10)) {
      lines.push(`- ${c.cardId}: ${c.lapses} lapses, stability ${c.stability.toFixed(2)}, difficulty ${c.difficulty.toFixed(2)}`);
    }
  }
  return lines.join('\n');
}

export function formatSampleQuestions(section: Section): string {
  const samples: string[] = [];
  const questions = section.questions ?? section.scenarios?.flatMap(s => s.questions) ?? [];
  for (const q of questions.slice(0, 5)) {
    samples.push(`Q: ${q.q}\nA: ${q.correct}`);
  }
  if (samples.length === 0) return '';
  return 'Sample questions from this section for style/content context:\n' + samples.join('\n\n');
}

export function parseGeneratedQuestions(raw: string): GeneratedQuestion[] {
  return parseGeneratedMcqCards(raw);
}

export function buildInsightsPrompt(performanceData: string): string {
  return `${INSIGHTS_SYSTEM}\n\nHere is the student's performance data:\n${performanceData}`;
}

export function buildGeneratePrompt(sourceText: string, count: number): string {
  return `${GENERATE_SYSTEM}\n\nGenerate ${count} multiple-choice questions from this study material:\n\n${sourceText}`;
}

export function buildTargetedPrompt(performanceData: string, sampleQuestions: string, count: number): string {
  return `${TARGETED_SYSTEM}\n\nStudent performance data:\n${performanceData}\n\n${sampleQuestions}\n\nGenerate ${count} questions targeting their weaknesses.`;
}
