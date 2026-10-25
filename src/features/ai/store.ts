import { createSignal, batch } from 'solid-js';
import { workerApi } from '../../core/hooks/useWorker.ts';
import { activeProject } from '../../core/store/app.ts';
import type { Section, Question } from '../../projects/types.ts';
import type { AITab, PerformanceSummary, GeneratedQuestion } from './types.ts';
import { registerAndActivateSection } from './sectionInjector.ts';
import {
  formatPerformanceSummary, formatSampleQuestions,
  parseGeneratedQuestions,
  buildInsightsPrompt, buildGeneratePrompt, buildTargetedPrompt,
} from './prompts.ts';

const [aiTab, setAiTab] = createSignal<AITab>('insights');
export { aiTab, setAiTab };

const [insightsOutput, setInsightsOutput] = createSignal('');
const [insightsLoading, setInsightsLoading] = createSignal(false);
const [insightsError, setInsightsError] = createSignal<string | null>(null);
export { insightsOutput, insightsLoading, insightsError };

const [generateOutput, setGenerateOutput] = createSignal<GeneratedQuestion[]>([]);
const [generateLoading, setGenerateLoading] = createSignal(false);
const [generateError, setGenerateError] = createSignal<string | null>(null);
const [generateAccepted, setGenerateAccepted] = createSignal<Set<number>>(new Set());
export { generateOutput, generateLoading, generateError, generateAccepted, setGenerateAccepted };

const [targetedOutput, setTargetedOutput] = createSignal<GeneratedQuestion[]>([]);
const [targetedLoading, setTargetedLoading] = createSignal(false);
const [targetedError, setTargetedError] = createSignal<string | null>(null);
const [targetedAccepted, setTargetedAccepted] = createSignal<Set<number>>(new Set());
const [targetedWeakAreas, setTargetedWeakAreas] = createSignal('');
export { targetedOutput, targetedLoading, targetedError, targetedAccepted, setTargetedAccepted, targetedWeakAreas };

let activeAbort: AbortController | null = null;

export function abortStream() {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
}

async function callBridge(
  prompt: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const resp = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Bridge error ${resp.status}: ${body}`);
  }

  if (!resp.body) throw new Error('Response body is null');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        const event = JSON.parse(data);
        if (event.error) throw new Error(event.error);
        if (event.text) onChunk(event.text);
      } catch (err) {
        if (err instanceof SyntaxError) continue; // skip malformed JSON
        throw err;
      }
    }
  }
}

async function gatherPerformanceSummary(): Promise<PerformanceSummary> {
  const project = activeProject();
  if (!project) throw new Error('No active project');
  const slug = project.slug;

  const [scores, reviewLog, cards] = await Promise.all([
    workerApi.getScores(slug),
    workerApi.getReviewLog(slug, 500),
    workerApi.getPerformanceCards(slug),
  ]);

  const scoreMap = new Map(scores.map(s => [s.section_id, s]));

  const sections = project.sections.map(s => {
    const score = scoreMap.get(s.id);
    const sectionCards = cards.filter(c => c.section_id === s.id);
    const avgStability = sectionCards.length > 0
      ? sectionCards.reduce((sum, c) => sum + c.stability, 0) / sectionCards.length
      : 0;
    const weakCards = sectionCards.filter(c => c.lapses >= 3).length;
    return {
      id: s.id,
      name: s.name,
      accuracy: score && score.attempted > 0 ? score.correct / score.attempted : 0,
      attempted: score?.attempted ?? 0,
      weakCards,
      avgStability,
    };
  });

  const weakCards = cards.filter(c => c.lapses >= 3).slice(0, 10).map(c => ({
    cardId: c.card_id, sectionId: c.section_id,
    lapses: c.lapses, stability: c.stability, difficulty: c.difficulty,
  }));

  const recent = reviewLog.slice(0, 100);
  const recentAccuracy = recent.length > 0 ? recent.filter(r => r.rating >= 3).length / recent.length : 0;

  return {
    projectName: project.name,
    sections,
    weakCards,
    recentAccuracy,
    totalReviews: reviewLog.length,
    totalCards: cards.length,
  };
}

export async function runInsights() {
  activeAbort?.abort();
  batch(() => { setInsightsLoading(true); setInsightsError(null); setInsightsOutput(''); setGenerateLoading(false); setTargetedLoading(false); });

  const ctrl = new AbortController();
  activeAbort = ctrl;
  const signal = ctrl.signal;

  try {
    const summary = await gatherPerformanceSummary();
    const prompt = buildInsightsPrompt(formatPerformanceSummary(summary));

    await callBridge(prompt, (text) => setInsightsOutput(prev => prev + text), signal);
  } catch (err) {
    if (signal.aborted) return;
    setInsightsError(err instanceof Error ? err.message : String(err));
  } finally {
    if (!signal.aborted) setInsightsLoading(false);
    if (activeAbort === ctrl) activeAbort = null;
  }
}

export async function runGenerate(sourceText: string, count: number) {
  if (!sourceText.trim()) { setGenerateError('Paste some study material first'); return; }
  activeAbort?.abort();

  batch(() => { setGenerateLoading(true); setGenerateError(null); setGenerateOutput([]); setGenerateAccepted(new Set<number>()); setInsightsLoading(false); setTargetedLoading(false); });

  const ctrl = new AbortController();
  activeAbort = ctrl;
  const signal = ctrl.signal;
  let fullResponse = '';

  try {
    const prompt = buildGeneratePrompt(sourceText, count);

    await callBridge(prompt, (text) => { fullResponse += text; }, signal);

    const questions = parseGeneratedQuestions(fullResponse);
    if (questions.length === 0) {
      setGenerateError('No valid questions found in response');
    } else {
      batch(() => { setGenerateOutput(questions); setGenerateAccepted(new Set(questions.map((_, i) => i))); });
    }
  } catch (err) {
    if (signal.aborted) return;
    setGenerateError(err instanceof Error ? err.message : String(err));
  } finally {
    if (!signal.aborted) setGenerateLoading(false);
    if (activeAbort === ctrl) activeAbort = null;
  }
}

export async function injectAcceptedQuestions(sectionName?: string) {
  const questions = generateOutput();
  const accepted = generateAccepted();
  const selected = questions.filter((_, i) => accepted.has(i));
  if (selected.length === 0) return;

  const sectionId = 'ai-' + Date.now();
  const mcqQuestions: Question[] = selected.map(q => ({
    q: q.q, correct: q.correct, wrong: q.wrong, explanation: q.explanation,
  }));
  const cardIds = mcqQuestions.map((_, i) => `${sectionId}-${i}`);

  const newSection: Section = {
    id: sectionId, name: sectionName || 'AI Generated', type: 'mc-quiz',
    questions: mcqQuestions, cardIds, flashCardIds: [],
  };
  const cardRegs = cardIds.map(cardId => ({ sectionId, cardId, cardType: 'mcq' as const }));

  await registerAndActivateSection(newSection, cardRegs, () => {
    setGenerateOutput([]); setGenerateAccepted(new Set<number>());
  });
}

export async function runTargeted(count: number) {
  const project = activeProject();
  if (!project) return;
  activeAbort?.abort();

  batch(() => { setTargetedLoading(true); setTargetedError(null); setTargetedOutput([]); setTargetedAccepted(new Set<number>()); setInsightsLoading(false); setGenerateLoading(false); });

  const ctrl = new AbortController();
  activeAbort = ctrl;
  const signal = ctrl.signal;
  let fullResponse = '';

  try {
    const summary = await gatherPerformanceSummary();
    const perfData = formatPerformanceSummary(summary);

    // Show weak areas summary in the UI
    const weak = summary.sections.filter(s => s.attempted > 0).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
    setTargetedWeakAreas(weak.map(s => `${s.name} (${(s.accuracy * 100).toFixed(0)}%)`).join(', '));

    // Gather sample questions from weakest sections for style context
    const sampleSections = weak.length > 0
      ? project.sections.filter(s => weak.some(w => w.id === s.id))
      : project.sections.slice(0, 2);
    const samples = sampleSections.map(s => formatSampleQuestions(s)).filter(Boolean).join('\n\n');

    const prompt = buildTargetedPrompt(perfData, samples, count);

    await callBridge(prompt, (text) => { fullResponse += text; }, signal);

    const questions = parseGeneratedQuestions(fullResponse);
    if (questions.length === 0) {
      setTargetedError('No valid questions found in response');
    } else {
      batch(() => { setTargetedOutput(questions); setTargetedAccepted(new Set(questions.map((_, i) => i))); });
    }
  } catch (err) {
    if (signal.aborted) return;
    setTargetedError(err instanceof Error ? err.message : String(err));
  } finally {
    if (!signal.aborted) setTargetedLoading(false);
    if (activeAbort === ctrl) activeAbort = null;
  }
}

export async function injectTargetedQuestions(sectionName?: string) {
  const questions = targetedOutput();
  const accepted = targetedAccepted();
  const selected = questions.filter((_, i) => accepted.has(i));
  if (selected.length === 0) return;

  const sectionId = 'ai-targeted-' + Date.now();
  const mcqQuestions: Question[] = selected.map(q => ({
    q: q.q, correct: q.correct, wrong: q.wrong, explanation: q.explanation,
  }));
  const cardIds = mcqQuestions.map((_, i) => `${sectionId}-${i}`);

  const newSection: Section = {
    id: sectionId, name: sectionName || 'AI Targeted Practice', type: 'mc-quiz',
    questions: mcqQuestions, cardIds, flashCardIds: [],
  };
  const cardRegs = cardIds.map(cardId => ({ sectionId, cardId, cardType: 'mcq' as const }));

  await registerAndActivateSection(newSection, cardRegs, () => {
    setTargetedOutput([]); setTargetedAccepted(new Set<number>());
  });
}
