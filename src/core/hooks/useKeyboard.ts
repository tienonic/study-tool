import { onMount, onCleanup } from 'solid-js';
import { activeTab, activeProject, setNoteBoxVisible, termsOpen, easyMode, zenMode, toggleZenMode, headerVisible, activePanel, flashCopied, studyView } from '../store/app.ts';
import { sectionHandlers } from '../store/sections.ts';
import { matchesKey } from '../../features/settings/keybinds.ts';
import { isAnsweringState, isRatedState, isRevealedState, isReviewingHistoryState } from '../../features/quiz/sessionState.ts';
import type { MathSession } from '../../features/math/store.ts';
import type { McqView, FlashView, QuizState } from '../../features/quiz/types.ts';
import { flashRatingForNumberKey } from '../../features/quiz/flashRatingKeys.ts';

export function useKeyboard() {
  let autoPaused = false;

  function pauseIfActive() {
    const tab = activeTab();
    if (!tab) return;
    const entry = sectionHandlers.get(tab);
    if (!entry) return;
    if (!entry.session.paused()) {
      entry.session.timer.pause();
      autoPaused = true;
    }
  }

  function resumeIfAutoPaused() {
    if (!autoPaused) return;
    const tab = activeTab();
    if (!tab) return;
    const entry = sectionHandlers.get(tab);
    if (!entry) return;
    entry.session.timer.resume();
    autoPaused = false;
  }

  function visibilityHandler() {
    if (document.hidden) pauseIfActive();
    else resumeIfAutoPaused();
  }

  function blurHandler() { pauseIfActive(); }
  function focusHandler() { resumeIfAutoPaused(); }

  function handler(e: KeyboardEvent) {
    if (studyView() !== 'drill') return;
    const tag = e.target instanceof Element ? e.target.tagName : '';

    // Block Space from toggling checkboxes
    if (e.code === 'Space' && e.target instanceof HTMLInputElement && e.target.type === 'checkbox') {
      e.preventDefault();
      return;
    }

    // Escape toggles zen mode (when not in fullscreen and no panel is open)
    if (e.key === 'Escape' && !document.fullscreenElement) {
      if (headerVisible() || activePanel() || termsOpen()) return;
      toggleZenMode();
      return;
    }

    const tab = activeTab();
    if (!tab || !activeProject()) return;

    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // When terms panel is open, let the terms filter consume printable keys
    if (termsOpen() && !e.ctrlKey && !e.metaKey && !e.altKey &&
        (e.key.length === 1 || e.key === 'Backspace')) return;

    // Note key: toggle note box
    if (matchesKey(e, 'note') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setNoteBoxVisible(true);
      return;
    }

    // Ignore when modifier keys are held (Ctrl+1 = Firefox tab switch, not answer)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const entry = sectionHandlers.get(tab);
    if (!entry) return;

    if (entry.kind === 'math') {
      handleMathKeyboard(e, entry.session);
    } else if (entry.session.flashMode()) {
      handleFlashcardKeyboard(e, entry.session);
    } else {
      handleMcqKeyboard(e, entry.session);
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handler);
    document.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('blur', blurHandler);
    window.addEventListener('focus', focusHandler);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', handler);
    document.removeEventListener('visibilitychange', visibilityHandler);
    window.removeEventListener('blur', blurHandler);
    window.removeEventListener('focus', focusHandler);
  });
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => flashCopied()).catch(() => {});
}

function handleMathKeyboard(e: KeyboardEvent, session: MathSession) {
  if (matchesKey(e, 'copyCard')) {
    e.preventDefault();
    const p = session.problem();
    if (p) copyToClipboard(p.q);
    return;
  }
  if (e.code === 'Space' || matchesKey(e, 'mathSubmit') || e.key === 'Enter') {
    e.preventDefault();
    if (session.state() === 'revealed') {
      session.nextProblem();
    } else if (session.state() === 'answering') {
      session.armSkip();
    }
  }
}

function isHistoryBackKey(e: KeyboardEvent): boolean {
  return matchesKey(e, 'goBack') || e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a';
}

function isHistoryForwardKey(e: KeyboardEvent): boolean {
  return matchesKey(e, 'forward') || e.key === 'ArrowRight' || e.key.toLowerCase() === 'd';
}

function handleFlashcardKeyboard(e: KeyboardEvent, session: FlashView) {
  if (matchesKey(e, 'replayPronunciation')) {
    e.preventDefault();
    session.playPronunciation().catch(() => {});
    return;
  }

  if (matchesKey(e, 'copyCard')) {
    e.preventDefault();
    const parts: string[] = [];
    if (session.flashFrontImage()) parts.push(session.flashFrontImage());
    parts.push(session.flashFront());
    if (session.flashFlipped()) {
      if (session.flashBackImage()) parts.push(session.flashBackImage());
      parts.push(session.flashBack());
    }
    copyToClipboard(parts.filter(Boolean).join('\n\n'));
    return;
  }

  if (isHistoryBackKey(e)) {
    e.preventDefault();
    session.goBackHistory();
    return;
  }

  if (isHistoryForwardKey(e)) {
    e.preventDefault();
    if (isReviewingHistoryState(session.state()) && session.historyPosition().canGoForward) {
      session.advanceFromHistory();
    }
    return;
  }

  const isFlipped = session.flashFlipped();

  // Space / flipCard: always toggle flip, never auto-rate
  if (matchesKey(e, 'flipCard') || matchesKey(e, 'skip')) {
    e.preventDefault();
    session.flipFlash();
    return;
  }

  // Number keys keep a fixed muscle-memory layout in both flashcard modes.
  if (isFlipped) {
    if (/^[1-5]$/.test(e.key)) {
      e.preventDefault();
      const rating = flashRatingForNumberKey(e.key, easyMode());
      if (rating !== null) session.rateFlash(rating).catch(() => {});
      return;
    }
    if (matchesKey(e, 'flashAgain')) { e.preventDefault(); session.rateFlash(1).catch(() => {}); return; }
    if (matchesKey(e, 'flashGood')) { e.preventDefault(); session.rateFlash(3).catch(() => {}); return; }
    if (!easyMode() && matchesKey(e, 'answer2')) { e.preventDefault(); session.rateFlash(2).catch(() => {}); return; }
    if (!easyMode() && matchesKey(e, 'answer4')) { e.preventDefault(); session.rateFlash(4).catch(() => {}); return; }
  }

  if (matchesKey(e, 'flipAlt')) {
    e.preventDefault();
    session.flipFlash();
    return;
  }
}

function handleAnswerKey(e: KeyboardEvent, session: McqView, st: QuizState) {
  e.preventDefault();
  const answerActions = ['answer1', 'answer2', 'answer3', 'answer4'] as const;
  const idx = answerActions.findIndex(a => matchesKey(e, a));
  if (idx < 0) return;
  if (isAnsweringState(st)) {
    const opts = session.options();
    if (opts[idx]) session.answer(opts[idx]).catch(() => {});
  } else if (isRevealedState(st)) {
    session.rate(idx + 1).catch(() => {});
  }
}

function handleSpaceKey(e: KeyboardEvent, session: McqView, st: QuizState) {
  e.preventDefault();
  if (isReviewingHistoryState(st)) {
    if (session.historyPosition().canGoForward) session.advanceFromHistory();
    else session.pickNextCard().catch(() => {});
  } else if (isRatedState(st)) {
    session.pickNextCard().catch(() => {});
  } else if (isRevealedState(st)) {
    if (easyMode()) session.rate(session.isCorrect() ? 3 : 1).catch(() => {});
  } else if (isAnsweringState(st)) {
    session.skip().catch(() => {});
  }
}

function handleForwardKey(e: KeyboardEvent, session: McqView, st: QuizState) {
  e.preventDefault();
  if (isReviewingHistoryState(st) && session.historyPosition().canGoForward) {
    session.advanceFromHistory();
  }
}

function handleMcqKeyboard(e: KeyboardEvent, session: McqView) {
  const st = session.state();
  if (matchesKey(e, 'copyCard')) {
    e.preventDefault();
    const q = session.question();
    if (q) {
      const parts: string[] = [];
      if (session.passage()) parts.push(session.passage());
      if (q.image) parts.push(q.image);
      parts.push(q.q);
      copyToClipboard(parts.join('\n\n'));
    }
    return;
  }
  if (matchesKey(e, 'answer1') || matchesKey(e, 'answer2') || matchesKey(e, 'answer3') || matchesKey(e, 'answer4')) { handleAnswerKey(e, session, st); return; }
  if (matchesKey(e, 'skip')) { handleSpaceKey(e, session, st); return; }
  if (matchesKey(e, 'undo')) { e.preventDefault(); session.undo().catch(() => {}); return; }
  if (matchesKey(e, 'suspend')) { e.preventDefault(); session.suspend().catch(() => {}); return; }
  if (matchesKey(e, 'bury')) { e.preventDefault(); session.bury().catch(() => {}); return; }
  if (matchesKey(e, 'viewImage')) {
    const g = window as any;
    const pop = g.__drillImagePopup;
    let isOpen = false;
    try { isOpen = pop && !pop.closed; } catch { isOpen = false; }
    if (isOpen) {
      try { pop.close(); } catch { /* cross-origin */ }
      g.__drillImagePopup = null;
      return;
    }
    const link = session.currentImageLink();
    if (link) {
      const w = window.open(link, 'drill-images', 'popup,width=900,height=700,left=100,top=100');
      if (w) g.__drillImagePopup = w;
    }
    return;
  }
  if (isHistoryBackKey(e)) { e.preventDefault(); session.goBackHistory(); return; }
  if (isHistoryForwardKey(e)) { handleForwardKey(e, session, st); return; }
}
