import { batch, createSignal } from 'solid-js';
import { setQuestionContext } from '../glossary/store.ts';
import { loadActivity, pushChartEntry } from '../activity/store.ts';
import { autoSave } from '../backup/backup.ts';
import { resolveFlashCard, resolveFlashCardAcross, findOwnerSection } from './helpers.ts';
import { flashIdentityTitle } from './flashIdentity.ts';
import { flashCardEntryState, flashFlipState, isReviewingHistoryState } from './sessionState.ts';
import type { ProjectApi } from '../../core/hooks/useWorker.ts';
import type { Guard } from './guard.ts';
import type { HistoryPosition } from './historyNav.ts';
import type { Flashcard, Section } from '../../projects/types.ts';
import type { StudyGoalConfig } from '../../projects/types.ts';
import { pickNextScheduled, reviewQuotaKey } from '../goals/goalScheduling.ts';
import type { QuizState } from './types.ts';
import { stopPronunciation } from '../listening/playback.ts';
import { figuresReady } from './sourceFigures.ts';

export interface FlashSignals {
  state: () => QuizState;
  setState: (v: QuizState) => void;
  flashCardId: () => string | null;
  setFlashCardId: (v: string | null) => void;
  flashFlipped: () => boolean;
  setFlashFlipped: (v: boolean) => void;
  flashFront: () => string;
  setFlashFront: (v: string) => void;
  flashBack: () => string;
  setFlashBack: (v: string) => void;
  flashTitle: () => string;
  setFlashTitle: (v: string) => void;
  flashFrontImage: () => string;
  setFlashFrontImage: (v: string) => void;
  flashBackImage: () => string;
  setFlashBackImage: (v: string) => void;
  setActiveFlashcard: (v: Flashcard | null) => void;
  flashDefFirst: () => boolean;
  ratingLabels: () => Record<number, string>;
  setRatingLabels: (v: Record<number, string>) => void;
}

export interface FlashDeps {
  section: Section;
  sourceSections?: Section[];
  project: () => { slug: string; config: { new_per_session: number; study_goal?: StudyGoalConfig } } | null;
  guard: Guard;
  timer: { start: () => void; stop: () => number; reset: () => void };
  cramMode: () => boolean;
  cramMarkSeen: (id: string) => void;
  cramPickNext: () => Promise<void>;
  cramRate: (cardId: string, rating: number) => void;
  refreshDue: () => Promise<void>;
  api: ProjectApi;
}

interface FlashHistoryEntry {
  cardId: string;
  flipped: boolean;
  rated: boolean;
}

export function createFlashFlow(s: FlashSignals, d: FlashDeps) {
  const merged = !!d.sourceSections;
  const allSections = d.sourceSections ?? [d.section];
  const allSectionIds = allSections.map(sec => sec.id);
  const allFlashCardIds = allSections.flatMap(sec => sec.flashCardIds);
  const allFlashcards = allSections.flatMap(sec => sec.flashcards ?? []);

  function resolve(cardId: string) {
    return merged ? resolveFlashCardAcross(allSections, cardId) : resolveFlashCard(d.section, cardId);
  }
  function ownerSectionId(cardId: string): string {
    if (!merged) return d.section.id;
    return (findOwnerSection(allSections, cardId) ?? d.section).id;
  }

  let flashHistory: FlashHistoryEntry[] = [];
  let flashHistPos = -1;
  let reviewingFlashHistory = false;
  const [historyPosition, setHistoryPosition] = createSignal<HistoryPosition>({
    current: 0,
    total: 0,
    reviewing: false,
    canGoBack: false,
    canGoForward: false,
  });

  function updateHistoryPosition() {
    const total = flashHistory.length;
    setHistoryPosition({
      current: total > 0 && flashHistPos >= 0 ? flashHistPos + 1 : 0,
      total,
      reviewing: reviewingFlashHistory,
      canGoBack: total > 0 && flashHistPos > 0,
      canGoForward: total > 0 && flashHistPos >= 0 && flashHistPos < total - 1,
    });
  }

  function pushFlashHistory(cardId: string) {
    flashHistory = flashHistory.slice(0, flashHistPos + 1);
    flashHistory.push({ cardId, flipped: false, rated: false });
    flashHistPos = flashHistory.length - 1;
    reviewingFlashHistory = false;
    updateHistoryPosition();
  }

  function updateCurrentHistoryEntry(patch: Partial<FlashHistoryEntry>) {
    const entry = flashHistory[flashHistPos];
    if (!entry || entry.cardId !== s.flashCardId()) return;
    Object.assign(entry, patch);
    updateHistoryPosition();
  }

  function restoreFlashHistoryEntry(entry: FlashHistoryEntry) {
    const resolved = resolve(entry.cardId);
    if (!resolved) return;
    applyFlashCard(entry.cardId, resolved, {
      recordHistory: false,
      flipped: entry.flipped,
      reviewing: entry.rated,
    });
  }

  function goBackHistory() {
    if (d.guard.isActing()) return;
    if (flashHistPos <= 0) return;
    flashHistPos--;
    reviewingFlashHistory = true;
    updateHistoryPosition();
    const entry = flashHistory[flashHistPos];
    if (entry) restoreFlashHistoryEntry(entry);
  }

  function advanceHistory() {
    if (d.guard.isActing()) return;
    if (!reviewingFlashHistory || flashHistPos < 0 || flashHistPos >= flashHistory.length - 1) return;
    flashHistPos++;
    const entry = flashHistory[flashHistPos];
    if (!entry) return;
    reviewingFlashHistory = entry.rated;
    updateHistoryPosition();
    restoreFlashHistoryEntry(entry);
  }

  function resetHistory() {
    flashHistory = [];
    flashHistPos = -1;
    reviewingFlashHistory = false;
    updateHistoryPosition();
  }

  function setFlashError(msg = 'Card data mismatch') {
    stopPronunciation();
    d.timer.reset();
    batch(() => { s.setFlashCardId(null); s.setActiveFlashcard(null); s.setFlashFront(msg); s.setFlashBack(''); s.setFlashTitle(''); s.setFlashFrontImage(''); s.setFlashBackImage(''); s.setFlashFlipped(false); });
  }

  function applyFlashCard(cardId: string, resolved: { card: Flashcard }, opts: { recordHistory?: boolean; flipped?: boolean; reviewing?: boolean } = {}) {
    stopPronunciation();
    const defFirst = s.flashDefFirst();
    batch(() => {
      s.setFlashCardId(cardId);
      s.setActiveFlashcard(resolved.card);
      s.setFlashFront(defFirst ? resolved.card.back : resolved.card.front);
      s.setFlashBack(defFirst ? resolved.card.front : resolved.card.back);
      s.setFlashTitle(flashIdentityTitle(resolved.card, allFlashcards));
      s.setFlashFrontImage(defFirst ? resolved.card.backImage ?? '' : resolved.card.frontImage ?? '');
      s.setFlashBackImage(defFirst ? resolved.card.frontImage ?? '' : resolved.card.backImage ?? '');
      s.setFlashFlipped(opts.flipped ?? false);
      s.setRatingLabels({});
      s.setState(flashCardEntryState(!!opts.reviewing));
    });
    if (opts.reviewing) d.timer.reset();
    else d.timer.start();
    if (opts.recordHistory !== false) pushFlashHistory(cardId);
    setQuestionContext([resolved.card.front, resolved.card.back].join(' '));
  }

  async function pickNextFlash(staleRetries = 0) {
    if (d.cramMode()) { await d.cramPickNext(); return; }
    const p = d.project();
    if (!p || allFlashcards.length === 0 || allFlashCardIds.length === 0) return;

    const result = await pickNextScheduled(d.api, p, allSectionIds, 'flashcard');
    if (!s.state()) return; // component unmounted

    if (!result.cardId) {
      stopPronunciation();
      d.timer.reset();
      batch(() => {
        s.setFlashCardId(null);
        s.setActiveFlashcard(null);
        s.setFlashFront('');
        s.setFlashBack('');
        s.setFlashTitle('');
        s.setFlashFrontImage('');
        s.setFlashBackImage('');
        s.setFlashFlipped(false);
        s.setState('done');
      });
      await d.refreshDue();
      return;
    }

    const resolved = resolve(result.cardId);
    if (!resolved) {
      if (staleRetries < 5) {
        await d.api.suspendCard(result.cardId).catch(() => {});
        await pickNextFlash(staleRetries + 1);
        return;
      }
      setFlashError();
      return;
    }

    applyFlashCard(result.cardId, resolved);
    await d.refreshDue();
  }

  function flipFlash() {
    if (d.guard.isActing()) return;
    if (!isReviewingHistoryState(s.state()) && !figuresReady(s.flashFrontImage(), s.flashBackImage())) return;
    const flipped = !s.flashFlipped();
    const reviewing = isReviewingHistoryState(s.state());
    s.setFlashFlipped(flipped);
    updateCurrentHistoryEntry({ flipped });
    if (!reviewing) {
      if (flipped) {
        d.timer.stop();
        s.setState(flashFlipState(true));
      } else {
        s.setState(flashFlipState(false));
        d.timer.start();
      }
    }
    const cId = s.flashCardId();
    if (flipped && cId) {
      const captured = cId;
      d.api.previewRatings(cId).then(preview => {
        if (s.flashCardId() === captured) s.setRatingLabels(preview.labels);
      }).catch(() => {});
    }
  }

  async function rateFlashAction(rating: number) {
    const fId = s.flashCardId();
    const p = d.project();
    if (!fId || !p) return;
    if (isReviewingHistoryState(s.state())) return;
    if (!figuresReady(s.flashFrontImage(), s.flashBackImage())) return;
    await d.guard.withActing(async () => {
      d.timer.stop();
      updateCurrentHistoryEntry({ flipped: s.flashFlipped(), rated: true });
      if (d.cramMode()) {
        d.cramRate(fId, rating);
        await d.cramPickNext();
        return;
      }

      const quotaKey = reviewQuotaKey(p);
      if (quotaKey === undefined) await d.api.reviewCard(fId, ownerSectionId(fId), rating);
      else await d.api.reviewCard(fId, ownerSectionId(fId), rating, quotaKey);
      pushChartEntry(rating, rating !== 1);
      autoSave(p.slug);
      await pickNextFlash();
    });
  }

  async function markFlashWrongAction() {
    const fId = s.flashCardId();
    const p = d.project();
    if (!fId || !p) return;
    if (!figuresReady(s.flashFrontImage(), s.flashBackImage())) return;
    if (!isReviewingHistoryState(s.state())) {
      await rateFlashAction(1);
      return;
    }

    await d.guard.withActing(async () => {
      if (d.cramMode()) {
        d.cramRate(fId, 1);
        return;
      }

      // Replace the last rating exactly when this is the latest reviewed card.
      // For older history, add an Again review so the card is still scheduled soon.
      await d.api.undoReview(fId);
      const quotaKey = reviewQuotaKey(p);
      if (quotaKey === undefined) await d.api.reviewCard(fId, ownerSectionId(fId), 1);
      else await d.api.reviewCard(fId, ownerSectionId(fId), 1, quotaKey);
      autoSave(p.slug);
      await Promise.all([d.refreshDue(), loadActivity()]);
    });
  }

  async function shuffleFlashAction() {
    if (allFlashcards.length === 0 || allFlashCardIds.length === 0) return;
    const idx = Math.floor(Math.random() * allFlashcards.length);
    const card = allFlashcards[idx];
    const fId = allFlashCardIds[idx];
    if (!card || !fId) return;
    await d.guard.withActing(async () => {
      applyFlashCard(fId, { card });
      await d.refreshDue();
    });
  }

  return {
    historyPosition,
    applyFlashCard,
    pickNextFlash,
    flipFlash,
    rateFlash: rateFlashAction,
    markFlashWrong: markFlashWrongAction,
    shuffleFlash: shuffleFlashAction,
    goBackHistory,
    advanceHistory,
    resetHistory,
  };
}
