import { createSignal, createEffect, batch } from 'solid-js';
import { useTimer } from '../../core/hooks/useTimer.ts';
import { activeProject, setActiveProject, easyMode } from '../../core/store/app.ts';
import { getTimerConfig, TIMER_DEFAULTS } from '../../core/timerConfig.ts';
import { autoSave } from '../backup/backup.ts';
import { pushChartEntry } from '../activity/store.ts';
import { getCardType, sectionToCardType, lookupQuestion, lookupQuestionAcross, resolveFlashCard, resolveFlashCardAcross, findOwnerSection } from './helpers.ts';
import { createGuard } from './guard.ts';
import { createCramSession } from './cramSession.ts';
import { createMcqFlow } from './mcqFlow.ts';
import { createFlashFlow } from './flashFlow.ts';
import { bumpHandlerVersion, switchToSection } from '../../core/store/sections.ts';
import type { ProjectApi } from '../../core/hooks/useWorker.ts';
import type { PickCardType } from '../../core/workers/protocol.ts';
import type { Section } from '../../projects/types.ts';
import type { Flashcard } from '../../projects/types.ts';
import type { QuizState, QuizSession } from './types.ts';
import { playPronunciation, stopPronunciation } from '../listening/playback.ts';
import { createManualPronunciationGate, shouldPlayAfterFlashFlip } from '../listening/playOnFlip.ts';
import { resetScheduledNewCount, reviewQuotaKey } from '../goals/goalScheduling.ts';
export type { QuizSession } from './types.ts';

export function createQuizSession(section: Section, api: ProjectApi, sourceSections?: Section[]): QuizSession {
  const merged = !!sourceSections;
  const allSections = sourceSections ?? [section];
  const allSectionIds = allSections.map(s => s.id);

  function ownerSection(cardId: string): Section {
    if (!merged) return section;
    return findOwnerSection(allSections, cardId) ?? allSections[0];
  }

  function lookup(cardId: string) {
    return merged ? lookupQuestionAcross(allSections, cardId) : lookupQuestion(section, cardId);
  }

  function resolveFlash(cardId: string) {
    return merged ? resolveFlashCardAcross(allSections, cardId) : resolveFlashCard(section, cardId);
  }

  const project = () => activeProject();

  // --- Shared signals ---
  const [state, setState] = createSignal<QuizState>('idle');
  const [cardId, setCardId] = createSignal<string | null>(null);
  const [question, setQuestion] = createSignal<import('../../projects/types.ts').Question | null>(null);
  const [options, setOptions] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal<string | null>(null);
  const [isCorrect, setIsCorrect] = createSignal(false);
  const [ratingLabels, setRatingLabels] = createSignal<Record<number, string>>({});
  const [score, setScore] = createSignal({ correct: 0, attempted: 0 });
  const [dueCount, setDueCount] = createSignal({ due: 0, newCount: 0, total: 0 });
  const startsInFlashMode = allSections.every(candidate => candidate.cardIds.length === 0)
    && allSections.some(candidate => candidate.flashCardIds.length > 0);
  const [flashMode, setFlashMode] = createSignal(startsInFlashMode);
  const [flashCardId, setFlashCardId] = createSignal<string | null>(null);
  const [activeFlashcard, setActiveFlashcard] = createSignal<Flashcard | null>(null);
  const [flashFlipped, setFlashFlipped] = createSignal(false);
  const [flashFront, setFlashFront] = createSignal('');
  const [flashBack, setFlashBack] = createSignal('');
  const [flashTitle, setFlashTitle] = createSignal('');
  const [flashFrontImage, setFlashFrontImage] = createSignal('');
  const [flashBackImage, setFlashBackImage] = createSignal('');
  const [flashDefFirst, setFlashDefFirst] = createSignal(false);
  const [passage, setPassage] = createSignal('');
  const [leechWarning, setLeechWarning] = createSignal(false);
  const [skipped, setSkipped] = createSignal(false);
  const [pronunciationPlaying, setPronunciationPlaying] = createSignal(false);
  const [pronunciationPlayed, setPronunciationPlayed] = createSignal(false);
  const [pronunciationError, setPronunciationError] = createSignal<string | null>(null);
  const timer = useTimer();
  const guard = createGuard();

  // --- Shared helpers ---
  function sectionCardType(): PickCardType {
    if (flashMode()) return 'flashcard';
    if (merged) return 'quiz'; // pick across quiz cards, not flashcards
    return getCardType(section.type, false);
  }

  async function refreshDue() {
    const p = project();
    if (!p) return;
    const slug = p.slug;
    const cardType = sectionCardType();
    const ids = cardType === 'flashcard'
      ? allSections.flatMap(s => s.flashCardIds)
      : allSections.flatMap(s => s.cardIds);
    if (ids.length === 0) return;
    const result = await api.countDue(allSectionIds, cardType);
    if (project()?.slug !== slug) return;
    if (sectionCardType() !== cardType) return;
    setDueCount(result);
  }

  async function doRate(cId: string, rating: number) {
    const p = project();
    if (!p) return;

    if (cram.cramMode()) {
      cram.rateCram(cId, rating);
      setState('rated');
      return;
    }

    const owner = ownerSection(cId);
    const quotaKey = reviewQuotaKey(p);
    const result = quotaKey === undefined
      ? await api.reviewCard(cId, owner.id, rating)
      : await api.reviewCard(cId, owner.id, rating, quotaKey);
    pushChartEntry(rating, rating !== 1);
    autoSave(p.slug);

    batch(() => { if (result.isLeech) setLeechWarning(true); setState('rated'); });
    await refreshDue();
  }

  // --- Cram session ---
  const cram = createCramSession({
    projectSlug: () => project()?.slug,
    sectionId: section.id,
    sectionIds: allSectionIds,
    flashMode,
    sectionType: section.type,
    merged,
    ownerSectionId: (cardId: string) => ownerSection(cardId).id,
    api,
    onPickMcq: (id) => {
      const found = lookup(id);
      if (!found) { batch(() => { cram.endCram(); setState('done'); }); return; }
      const shuffled = mcq.shuffleOptionsForCard(id, found.question);
      mcq.applyMcqCard(id, found, shuffled, found.passage ?? '');
    },
    onPickFlash: (id) => {
      const resolved = resolveFlash(id);
      if (!resolved) { batch(() => { cram.endCram(); setState('done'); }); return; }
      flash.applyFlashCard(id, resolved);
    },
    onDone: () => {
      batch(() => { cram.endCram(); setState('done'); });
    },
  });

  // --- MCQ flow ---
  const mcq = createMcqFlow(
    { state, setState, cardId, setCardId, question, setQuestion, options, setOptions,
      selected, setSelected, isCorrect, setIsCorrect, passage, setPassage,
      ratingLabels, setRatingLabels, score, setScore, leechWarning, setLeechWarning,
      skipped, setSkipped, flashMode },
    { section, sourceSections, project, guard, timer,
      failAt: () => getTimerConfig(project()?.config, section.id, section.type).failAt,
      doRate, refreshDue,
      cramMode: cram.cramMode, pickNextCram: cram.pickNextCram, api },
  );

  // --- Flash flow ---
  const flash = createFlashFlow(
    { state, setState, flashCardId, setFlashCardId, flashFlipped, setFlashFlipped,
      flashFront, setFlashFront, flashBack, setFlashBack, flashTitle, setFlashTitle,
      flashFrontImage, setFlashFrontImage, flashBackImage, setFlashBackImage,
      flashDefFirst, ratingLabels, setRatingLabels, setActiveFlashcard },
    { section, sourceSections, project, guard, timer, refreshDue,
      cramMode: cram.cramMode, cramMarkSeen: cram.markSeen, cramPickNext: cram.pickNextCram, cramRate: cram.rateCram, api },
  );
  const manualPronunciationGate = createManualPronunciationGate();

  async function playCurrentPronunciation(): Promise<void> {
    const card = activeFlashcard();
    const config = project()?.config.listening;
    if (!card || !config?.enabled) return;
    setPronunciationPlaying(true);
    setPronunciationError(null);
    try {
      const result = await playPronunciation(config, card);
      if (activeFlashcard() === card && result.played) setPronunciationPlayed(true);
    } catch (error) {
      if (activeFlashcard() === card) {
        setPronunciationError(error instanceof Error ? error.message : 'Pronunciation playback failed.');
      }
    } finally {
      if (activeFlashcard() === card) setPronunciationPlaying(false);
    }
  }

  function stopCurrentPronunciation(): void {
    stopPronunciation();
    setPronunciationPlaying(false);
  }

  function noteManualPronunciation(): void {
    manualPronunciationGate.mark(flashCardId());
  }

  async function playManualPronunciation(): Promise<void> {
    noteManualPronunciation();
    await playCurrentPronunciation();
  }

  function flipCurrentFlash(): void {
    const before = flashFlipped();
    const suppressAutomaticPlayback = manualPronunciationGate.consume(flashCardId());
    flash.flipFlash();
    const after = flashFlipped();
    if (!suppressAutomaticPlayback && shouldPlayAfterFlashFlip(project()?.config.listening, before, after)) {
      playCurrentPronunciation().catch(() => {});
    }
  }

  createEffect(() => {
    const card = activeFlashcard();
    const config = project()?.config.listening;
    stopCurrentPronunciation();
    batch(() => { setPronunciationPlayed(false); setPronunciationError(null); });
    if (card && config?.enabled && config.autoplay) {
      queueMicrotask(() => {
        if (activeFlashcard() === card) playCurrentPronunciation().catch(() => {});
      });
    }
  });

  // --- Effects ---
  createEffect(() => {
    const easy = easyMode();
    const st = state();
    const cId = cardId();
    if (!easy && st === 'revealed' && cId) {
      const captured = cId;
      api.previewRatings(cId).then(preview => {
        if (cardId() === captured) setRatingLabels(preview.labels);
      }).catch(() => {});
    }
  });

  // --- Orchestration (bridges both flows) ---
  let modeSwitch = false;

  async function pickNextCard() {
    await guard.withActing(async () => {
      try {
        if (flashMode()) await flash.pickNextFlash();
        else await mcq.pickNextCardImpl();
      } catch (err) {
        console.error(`[quiz:${section.id}] pickNextCard error:`, err);
        if (state() === 'idle') setState('done');
      }
    });
  }

  function toggleFlashMode() {
    if (guard.isActing() || modeSwitch) return;
    modeSwitch = true;
    const next = !flashMode();
    stopCurrentPronunciation();
    batch(() => { setFlashMode(next); bumpHandlerVersion(); });
    (next ? flash.pickNextFlash() : pickNextCard()).catch(() => {}).finally(() => { modeSwitch = false; });
  }

  async function studyMore() {
    const p = project();
    if (!p) return;
    await guard.withActing(async () => {
      if (flashMode()) {
        await flash.pickNextFlash();
      } else {
        await mcq.pickNextCardImpl();
      }
      if (state() !== 'done') return;

      if (await pickOverrideCard()) {
        await refreshDue();
        return;
      }

      if (!merged) {
        for (const sec of p.sections) {
          if (sec.id === section.id) continue;
          const due = await api.countDue([sec.id]);
          if (due.due > 0 || due.newCount > 0) {
            await switchToSection(sec.id);
            return;
          }
        }
      }
    });
  }

  async function pickOverrideCard(): Promise<boolean> {
    const cardType = sectionCardType();
    const result = await api.pickNextOverride(allSectionIds, cardType);
    if (!result.cardId) return false;
    if (flashMode()) {
      const resolved = resolveFlash(result.cardId);
      if (!resolved) return false;
      flash.applyFlashCard(result.cardId, resolved);
      return true;
    }
    const found = lookup(result.cardId);
    if (!found) return false;
    const shuffled = mcq.shuffleOptionsForCard(result.cardId, found.question);
    const passageText = found.passage ?? '';
    mcq.applyMcqCard(result.cardId, found, shuffled, passageText);
    mcq.pushHistoryEntry(result.cardId, found, shuffled, passageText);
    return true;
  }

  async function startCramAction() {
    await guard.withActing(async () => {
      await cram.startCram();
    });
  }

  async function increaseNewCards(count?: number) {
    const p = project();
    const before = dueCount();
    if (p && count != null && count > 0) {
      setActiveProject({ ...p, config: { ...p.config, new_per_session: count } });
    }
    await guard.withActing(async () => {
      if (p) await resetScheduledNewCount(api, p, allSectionIds, sectionCardType());
      else await api.resetNewCount(allSectionIds, sectionCardType());
      if (flashMode()) {
        await flash.pickNextFlash();
      } else {
        await mcq.pickNextCardImpl();
      }
      if (state() === 'done' && (before.due > 0 || before.newCount > 0)) {
        await pickOverrideCard();
        await refreshDue();
      }
    });
  }

  async function unburyAllAction() {
    const p = project();
    if (!p) return;
    await guard.withActing(async () => {
      await api.unburyAll();
      if (flashMode()) {
        await flash.pickNextFlash();
      } else {
        await mcq.pickNextCardImpl();
      }
    });
  }

  async function resetSectionAction() {
    const p = project();
    if (!p) return;
    await guard.withActing(async () => {
      await api.resetSection(section.id);
      const mcqType = sectionToCardType(section.type);
      const cardRegs = [
        ...section.cardIds.map(id => ({ sectionId: section.id, cardId: id, cardType: mcqType })),
        ...section.flashCardIds.map((id, index) => ({
          sectionId: section.id,
          cardId: id,
          cardType: 'flashcard' as const,
          priority: section.flashcards?.[index]?.priority,
        })),
      ];
      await api.loadProject([section.id], cardRegs);
      mcq.histNav.reset();
      flash.resetHistory();
      batch(() => { cram.endCram(); setScore({ correct: 0, attempted: 0 }); });
      if (flashMode()) {
        await flash.pickNextFlash();
      } else {
        await mcq.pickNextCardImpl();
      }
    });
  }

  // --- Public interface ---
  const activeHistoryPosition = () => flashMode() ? flash.historyPosition() : mcq.histNav.historyPosition();

  return {
    state, cardId, question, options, selected, isCorrect, ratingLabels,
    score, dueCount, flashMode, flashCardId, activeFlashcard, flashFlipped, flashFront, flashBack, flashTitle,
    flashFrontImage, flashBackImage,
    flashDefFirst, passage, historyReview: mcq.histNav.historyReview, historyPosition: activeHistoryPosition,
    leechWarning, skipped, currentImageLink: mcq.currentImageLink, currentImageLinks: mcq.currentImageLinks,
    cramMode: cram.cramMode, cramCount: cram.cramCount,

    pickNextCard,
    answer: mcq.answer,
    skip: mcq.skip,
    rate: mcq.rate,
    undo: mcq.undo,
    suspend: mcq.suspend,
    bury: mcq.bury,
    flipFlash: flipCurrentFlash,
    rateFlash: flash.rateFlash,
    markFlashWrong: flash.markFlashWrong,
    playPronunciation: playManualPronunciation,
    noteManualPronunciation,
    stopPronunciation: stopCurrentPronunciation,
    pronunciationPlaying,
    pronunciationPlayed,
    pronunciationError,
    toggleFlashMode,
    setFlashDefFirst: (v: boolean) => {
      setFlashDefFirst(v);
      const fId = flashCardId();
      if (!fId) return;
      const resolved = resolveFlash(fId);
      if (!resolved) return;
      batch(() => {
        setFlashFront(v ? resolved.card.back : resolved.card.front);
        setFlashBack(v ? resolved.card.front : resolved.card.back);
        setFlashFrontImage(v ? resolved.card.backImage ?? '' : resolved.card.frontImage ?? '');
        setFlashBackImage(v ? resolved.card.frontImage ?? '' : resolved.card.backImage ?? '');
        setFlashFlipped(false);
      });
    },
    advanceFromHistory: () => flashMode() ? flash.advanceHistory() : mcq.advanceFromHistory(pickNextCard),
    goBackHistory: () => flashMode() ? flash.goBackHistory() : mcq.goBackHistory(),
    shuffleFlash: flash.shuffleFlash,
    shuffleMcq: mcq.shuffleMcq,
    resetSection: resetSectionAction,
    refreshDue,
    studyMore,
    flagWrong: mcq.flagWrong,
    startCram: startCramAction,
    endCram: () => { batch(() => { cram.endCram(); setState('done'); }); },
    increaseNewCards,
    unburyAll: unburyAllAction,

    timer,
    paused: timer.paused,
    togglePause: timer.togglePause,
  };
}
