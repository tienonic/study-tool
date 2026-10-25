import { batch } from 'solid-js';
import { shuffleAvoidingPrevious } from '../../utils/shuffle.ts';
import { easyMode, sessionSummary, setSessionSummary } from '../../core/store/app.ts';
import { setQuestionContext } from '../glossary/store.ts';
import { loadActivity } from '../activity/store.ts';
import { timeToRating, lookupQuestion, lookupQuestionAcross, findOwnerSection, getCardType } from './helpers.ts';
import { createHistoryNav, type HistoryEntry } from './historyNav.ts';
import { isAnsweringState, isRatedState, isRevealedState, isReviewingHistoryState, restoredHistoryState } from './sessionState.ts';
import type { ProjectApi } from '../../core/hooks/useWorker.ts';
import type { PickCardType } from '../../core/workers/protocol.ts';
import type { Guard } from './guard.ts';
import type { Section, Question } from '../../projects/types.ts';
import type { StudyGoalConfig } from '../../projects/types.ts';
import { pickNextScheduled } from '../goals/goalScheduling.ts';
import type { QuizState } from './types.ts';
import { figuresReady } from './sourceFigures.ts';

export interface McqSignals {
  state: () => QuizState;
  setState: (v: QuizState) => void;
  cardId: () => string | null;
  setCardId: (v: string | null) => void;
  question: () => Question | null;
  setQuestion: (v: Question | null) => void;
  options: () => string[];
  setOptions: (v: string[]) => void;
  selected: () => string | null;
  setSelected: (v: string | null) => void;
  isCorrect: () => boolean;
  setIsCorrect: (v: boolean) => void;
  passage: () => string;
  setPassage: (v: string) => void;
  ratingLabels: () => Record<number, string>;
  setRatingLabels: (v: Record<number, string>) => void;
  score: () => { correct: number; attempted: number };
  setScore: (v: { correct: number; attempted: number }) => void;
  leechWarning: () => boolean;
  setLeechWarning: (v: boolean) => void;
  skipped: () => boolean;
  setSkipped: (v: boolean) => void;
  flashMode: () => boolean;
}

export interface McqDeps {
  section: Section;
  sourceSections?: Section[];
  project: () => { slug: string; config: { new_per_session: number; imageSearchSuffix: string; study_goal?: StudyGoalConfig } } | null;
  guard: Guard;
  timer: { start: () => void; stop: () => number };
  failAt: () => number;
  doRate: (cId: string, rating: number) => Promise<void>;
  refreshDue: () => Promise<void>;
  cramMode: () => boolean;
  pickNextCram: () => Promise<void>;
  api: ProjectApi;
}

export function createMcqFlow(s: McqSignals, d: McqDeps) {
  const merged = !!d.sourceSections;
  const allSections = d.sourceSections ?? [d.section];
  const allSectionIds = allSections.map(sec => sec.id);
  const allCardIds = allSections.flatMap(sec => sec.cardIds);
  const lastOptionOrderByCard = new Map<string, string[]>();

  function lookup(cardId: string) {
    return merged ? lookupQuestionAcross(allSections, cardId) : lookupQuestion(d.section, cardId);
  }
  function ownerSectionId(cardId: string): string {
    if (!merged) return d.section.id;
    return (findOwnerSection(allSections, cardId) ?? d.section).id;
  }

  const histNav = createHistoryNav();

  function buildQuestionContext(q: Question): string {
    return [q.q, q.correct, q.imageName || q.cropName || '', q.explanation || ''].join(' ');
  }

  function shuffleOptionsForCard(cId: string, q: Question): string[] {
    const options = shuffleAvoidingPrevious([q.correct, ...q.wrong], lastOptionOrderByCard.get(cId));
    lastOptionOrderByCard.set(cId, options);
    return options;
  }

  function applyMcqCard(cId: string, lookup: { question: Question; passage?: string }, shuffledOptions: string[], passageText: string) {
    batch(() => {
      s.setCardId(cId);
      s.setQuestion(lookup.question);
      s.setOptions(shuffledOptions);
      s.setSelected(null);
      s.setIsCorrect(false);
      s.setPassage(passageText);
      s.setRatingLabels({});
      s.setLeechWarning(false);
      s.setSkipped(false);
      s.setState('answering');
    });
    d.timer.start();
    setQuestionContext(buildQuestionContext(lookup.question));
  }

  function pushHistoryEntry(cId: string, lookup: { question: Question; scenarioIdx?: number; questionIdx?: number; passage?: string }, optionOrder: string[], passage: string) {
    histNav.push({
      idx: d.section.type === 'mc-quiz' ? (parseInt(cId.slice(d.section.id.length + 1), 10) || 0) : 0,
      scenarioIdx: lookup.scenarioIdx, questionIdx: lookup.questionIdx,
      cardId: cId, selected: null, correct: lookup.question.correct,
      optionOrder, isCorrect: false, skipped: false,
      explanation: lookup.question.explanation ?? '', passage,
    });
  }

  async function pickNextCardImpl() {
    if (d.cramMode()) { await d.pickNextCram(); return; }
    const p = d.project();
    if (!p) { s.setState('done'); return; }

    if (sessionSummary()) setSessionSummary(null);

    batch(() => { s.setLeechWarning(false); s.setSkipped(false); });
    histNav.clearReview();

    if (allCardIds.length === 0) { s.setState('done'); return; }

    const cardType: PickCardType = merged ? 'quiz' : getCardType(d.section.type, false);
    const result = await pickNextScheduled(d.api, p, allSectionIds, cardType);
    if (s.flashMode()) return; // Stale: flash mode toggled during pick — flash path handles it
    if (!result.cardId) { s.setState('done'); await d.refreshDue(); return; }

    const found = lookup(result.cardId);
    if (!found) { s.setState('done'); await d.refreshDue(); return; }

    const shuffled = shuffleOptionsForCard(result.cardId, found.question);
    const passageText = found.passage ?? '';

    applyMcqCard(result.cardId, found, shuffled, passageText);
    pushHistoryEntry(result.cardId, found, shuffled, passageText);

    await d.refreshDue();
  }

  function updateHistoryEntry(cId: string, q: Question, opts: { selected: string | null; isCorrect: boolean; skipped: boolean }) {
    const entry = histNav.getEntry(histNav.getPos());
    if (entry && entry.cardId === cId) {
      entry.selected = opts.selected;
      entry.correct = q.correct;
      entry.optionOrder = s.options();
      entry.isCorrect = opts.isCorrect;
      entry.skipped = opts.skipped;
      entry.explanation = q.explanation ?? '';
    }
  }

  async function answer(option: string) {
    if (!isAnsweringState(s.state())) return;
    if (!figuresReady(s.question()?.image)) return;
    const elapsed = d.timer.stop();
    const q = s.question();
    const cId = s.cardId();
    const p = d.project();
    if (!q || !cId || !p) return;
    await d.guard.withActing(async () => {
      const correct = option === q.correct;

      batch(() => {
        s.setSelected(option);
        s.setIsCorrect(correct);
        s.setState('revealed');
        s.setSkipped(false);
      });

      const sc = await d.api.updateScore(ownerSectionId(cId), correct);
      s.setScore({ correct: sc.correct, attempted: sc.attempted });
      updateHistoryEntry(cId, q, { selected: option, isCorrect: correct, skipped: false });

      if (easyMode()) {
        const autoRating = correct ? timeToRating(elapsed, d.failAt()) : 1;
        await d.doRate(cId, autoRating);
      }
    });
  }

  async function doSkip() {
    if (!isAnsweringState(s.state())) return;
    if (!figuresReady(s.question()?.image)) return;
    d.timer.stop();
    const q = s.question();
    const cId = s.cardId();
    const p = d.project();
    if (!q || !cId || !p) return;
    await d.guard.withActing(async () => {
      batch(() => {
        s.setSelected(null);
        s.setIsCorrect(false);
        s.setState('revealed');
        s.setSkipped(true);
      });

      const sc = await d.api.updateScore(ownerSectionId(cId), false);
      s.setScore({ correct: sc.correct, attempted: sc.attempted });
      updateHistoryEntry(cId, q, { selected: null, isCorrect: false, skipped: true });

      await d.doRate(cId, 1);
    });
  }

  async function rate(rating: number) {
    if (!isRevealedState(s.state())) return;
    if (!figuresReady(s.question()?.image)) return;
    const cId = s.cardId();
    if (!cId) return;
    await d.guard.withActing(async () => d.doRate(cId, rating));
  }

  async function flagWrong() {
    if (!figuresReady(s.question()?.image)) return;
    const cId = s.cardId();
    const p = d.project();
    if (!cId || !p) return;
    await d.guard.withActing(async () => {
      const st = s.state();
      if (isRevealedState(st)) {
        await d.doRate(cId, 1);
      } else if (isRatedState(st)) {
        const result = await d.api.undoReview();
        if (result.undone) {
          await loadActivity();
          await d.doRate(cId, 1);
        }
      }
    });
  }

  async function undoAction() {
    if (!isRatedState(s.state())) return;
    const cId = s.cardId();
    if (!cId) return;
    await d.guard.withActing(async () => {
      const result = await d.api.undoReview();
      if (result.undone && result.cardId) {
        s.setState('revealed');
        await Promise.all([d.refreshDue(), loadActivity()]);
      }
    });
  }

  async function suspendAction() {
    const cId = s.cardId();
    if (!cId) return;
    await d.guard.withActing(async () => {
      await d.api.suspendCard(cId);
      await d.refreshDue();
      await pickNextCardImpl();
    });
  }

  async function buryAction() {
    const cId = s.cardId();
    if (!cId) return;
    await d.guard.withActing(async () => {
      await d.api.buryCard(cId);
      await d.refreshDue();
      await pickNextCardImpl();
    });
  }

  function restoreHistoryEntry(entry: HistoryEntry) {
    const found = lookup(entry.cardId);
    if (!found) return;

    const unanswered = entry.selected === null && !entry.skipped;
    batch(() => {
      s.setLeechWarning(false);
      s.setCardId(entry.cardId);
      s.setQuestion(found.question);
      s.setOptions(entry.optionOrder);
      s.setSelected(unanswered ? null : entry.selected);
      s.setIsCorrect(unanswered ? false : entry.isCorrect);
      s.setSkipped(unanswered ? false : entry.skipped);
      s.setPassage(entry.passage);
      if (!unanswered) s.setRatingLabels({});
      s.setState(restoredHistoryState(unanswered));
    });
    if (unanswered) d.timer.start();
  }

  function goBackHistory() {
    if (d.guard.isActing()) return;
    histNav.goBack(restoreHistoryEntry);
  }

  function advanceFromHistory(pickNextCard: () => Promise<void>) {
    if (d.guard.isActing()) return;
    if (!isReviewingHistoryState(s.state())) return;
    histNav.advance(restoreHistoryEntry);
  }

  async function shuffleMcq() {
    const p = d.project();
    if (!p) return;
    if (allCardIds.length === 0) return;
    await d.guard.withActing(async () => {
      const randomId = allCardIds[Math.floor(Math.random() * allCardIds.length)];
      const found = lookup(randomId);
      if (!found) return;
      const shuffled = shuffleOptionsForCard(randomId, found.question);
      const passageText = found.passage ?? '';
      applyMcqCard(randomId, found, shuffled, passageText);
      pushHistoryEntry(randomId, found, shuffled, passageText);
      await d.refreshDue();
    });
  }

  function currentImageLinks(): { wiki?: string; search?: string } {
    const q = s.question();
    if (!q) return {};
    const result: { wiki?: string; search?: string } = {};
    if (q.image && q.image.includes('upload.wikimedia.org')) {
      const m = q.image.match(/\/(?:thumb\/)?[\da-f]\/[\da-f]{2}\/([^/]+?)(?:\/\d+px-[^/]+)?$/);
      if (m) result.wiki = 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(decodeURIComponent(m[1]));
    }
    const imgName = q.imageName || q.cropName;
    if (imgName) {
      const suffix = d.project()?.config.imageSearchSuffix ?? '';
      const query = suffix ? `${imgName} ${suffix}` : imgName;
      result.search = 'https://duckduckgo.com/?iax=images&ia=images&q=' + encodeURIComponent(query);
    }
    return result;
  }

  function currentImageLink(): string {
    const links = currentImageLinks();
    return links.search || links.wiki || '';
  }

  return {
    histNav,
    shuffleOptionsForCard,
    applyMcqCard,
    pushHistoryEntry,
    pickNextCardImpl,
    answer,
    skip: doSkip,
    rate,
    flagWrong,
    undo: undoAction,
    suspend: suspendAction,
    bury: buryAction,
    goBackHistory,
    advanceFromHistory,
    shuffleMcq,
    currentImageLink,
    currentImageLinks,
  };
}
