import './activity.css';
import { Show, createSignal, onMount, onCleanup, batch } from 'solid-js';
import {
  activityScore, reviewStats, sidebarScore, sidebarConcepts,
  setCanvasRef, loadActivity, clearActivity,
} from './store.ts';
import {
  copiedFlash, activeProject, activeTab,
  graphVisible, toggleGraphVisible,
  syncActivity, toggleSyncActivity,
  termsVisible, toggleTermsVisible,
} from '../../core/store/app.ts';
import { getTimerConfig } from '../../core/timerConfig.ts';
import { isAnsweringState } from '../quiz/sessionState.ts';
import { nextMenuIndex, typeaheadMenuIndex } from '../../components/overlays/menuNavigation.ts';

import type { SessionEntry } from '../../core/store/sections.ts';

export function ActivityWidget(props: { isFlashMode: () => boolean; activeEntry: () => SessionEntry | undefined }) {
  const session = () => props.activeEntry()?.session;
  const quizSession = () => { const e = props.activeEntry(); return e?.kind === 'quiz' ? e.session : undefined; };
  const historyPosition = () => quizSession()?.historyPosition();
  const visibleHistoryPosition = () => {
    const pos = historyPosition();
    return pos?.reviewing && pos.total > 0 ? pos : undefined;
  };
  const seconds = () => session()?.timer.seconds() ?? 0;
  const isAnswering = () => {
    const state = session()?.state();
    return state ? isAnsweringState(state) : false;
  };
  const paused = () => session()?.paused() ?? false;
  const togglePause = () => session()?.togglePause();

  const tc = () => {
    const project = activeProject();
    const tab = activeTab();
    if (!project || !tab) return { warnAt: 15, failAt: 60 };
    const sec = project.sections.find(s => s.id === tab);
    return getTimerConfig(project.config, tab, sec?.type ?? 'mc-quiz');
  };
  const timerCls = () => { const s = seconds(); const t = tc(); return `sidebar-timer${paused() ? ' paused' : ''}${s >= t.failAt ? ' skull' : s >= t.warnAt ? ' red' : ''}`; };
  const timerContent = () => { const s = seconds(); return paused() ? '\u23F8' : s >= tc().failAt ? '\u{1F480}' : s + 's'; };
  const conceptProgress = () => {
    const progress = sidebarConcepts();
    return progress.exposed > 0 ? `${progress.recognized} / ${progress.exposed}` : `${progress.recognized}`;
  };

  const [resetMenuOpen, setResetMenuOpen] = createSignal(false);
  const [optionsMenuOpen, setOptionsMenuOpen] = createSignal(false);
  const [confirmAction, setConfirmAction] = createSignal<(() => void) | null>(null);

  let resetWrapRef: HTMLDivElement | undefined;
  let optionsWrapRef: HTMLDivElement | undefined;
  let resetTriggerRef: HTMLButtonElement | undefined;
  let optionsTriggerRef: HTMLButtonElement | undefined;
  let resetMenuRef: HTMLDivElement | undefined;
  let optionsMenuRef: HTMLDivElement | undefined;
  let confirmYesRef: HTMLButtonElement | undefined;
  let typeahead = '';
  let typeaheadTimer: ReturnType<typeof setTimeout> | undefined;

  function menuItems(container: HTMLElement | undefined): HTMLElement[] {
    if (!container) return [];
    return [...container.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
      .filter(item => item.closest('[role="menu"]') === container && !item.hasAttribute('disabled'));
  }

  function focusMenu(container: HTMLElement | undefined | (() => HTMLElement | undefined), last = false) {
    queueMicrotask(() => {
      const resolved = typeof container === 'function' ? container() : container;
      const items = menuItems(resolved);
      (last ? items.at(-1) : items[0])?.focus();
    });
  }

  function closeOptions(restoreFocus = false) {
    setOptionsMenuOpen(false);
    if (restoreFocus) queueMicrotask(() => optionsTriggerRef?.focus());
  }

  function closeReset(restoreFocus = false) {
    batch(() => { setResetMenuOpen(false); setConfirmAction(null); });
    if (restoreFocus) queueMicrotask(() => resetTriggerRef?.focus());
  }

  function handleTriggerKeyDown(kind: 'options' | 'reset', event: KeyboardEvent) {
    const open = kind === 'options' ? setOptionsMenuOpen : setResetMenuOpen;
    const container = () => kind === 'options' ? optionsMenuRef : resetMenuRef;
    if (event.key === 'ArrowDown' || event.key === 'Home') {
      event.preventDefault();
      batch(() => { open(true); kind === 'options' ? closeReset(false) : closeOptions(false); });
      focusMenu(container);
    } else if (event.key === 'ArrowUp' || event.key === 'End') {
      event.preventDefault();
      batch(() => { open(true); kind === 'options' ? closeReset(false) : closeOptions(false); });
      focusMenu(container, true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      kind === 'options' ? closeOptions(true) : closeReset(true);
    }
  }

  function handleMenuKeyDown(kind: 'options' | 'reset', event: KeyboardEvent) {
    const container = event.currentTarget as HTMLElement;
    const items = menuItems(container);
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      kind === 'options' ? closeOptions(true) : closeReset(true);
      return;
    }
    if (event.key === 'Tab') {
      kind === 'options' ? closeOptions(false) : closeReset(false);
      return;
    }
    const next = nextMenuIndex(event.key, current, items.length);
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
    typeahead += event.key.toLocaleLowerCase();
    if (typeaheadTimer) clearTimeout(typeaheadTimer);
    typeaheadTimer = setTimeout(() => { typeahead = ''; typeaheadTimer = undefined; }, 500);
    const repeated = [...typeahead].every(character => character === typeahead[0]);
    const match = typeaheadMenuIndex(items.map(item => item.textContent ?? ''), repeated ? typeahead[0] : typeahead, current);
    if (match !== null) {
      event.preventDefault();
      items[match]?.focus();
    }
  }

  function beginConfirmation(action: () => void) {
    setConfirmAction(() => action);
    queueMicrotask(() => confirmYesRef?.focus());
  }

  const clickOutsideHandler = (e: MouseEvent) => {
    if (!(e.target instanceof Node)) return;
    if (resetMenuOpen() && resetWrapRef && !resetWrapRef.contains(e.target)) {
      batch(() => { setResetMenuOpen(false); setConfirmAction(null); });
    }
    if (optionsMenuOpen() && optionsWrapRef && !optionsWrapRef.contains(e.target)) {
      setOptionsMenuOpen(false);
    }
  };
  onMount(() => document.addEventListener('mousedown', clickOutsideHandler));
  onCleanup(() => {
    document.removeEventListener('mousedown', clickOutsideHandler);
    if (typeaheadTimer) clearTimeout(typeaheadTimer);
  });

  return (
    <>
      <div class="activity-widget">
        <div class="activity-options-wrap" ref={optionsWrapRef} onMouseDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            ref={optionsTriggerRef}
            class="activity-options-btn"
            title="Graph options"
            aria-label="Graph options"
            aria-haspopup="menu"
            aria-expanded={optionsMenuOpen()}
            aria-controls="activity-options-menu"
            onKeyDown={(event) => handleTriggerKeyDown('options', event)}
            onClick={(event) => {
              const opening = !optionsMenuOpen();
              batch(() => { setOptionsMenuOpen(opening); setResetMenuOpen(false); setConfirmAction(null); });
              if (opening && event.detail === 0) focusMenu(() => optionsMenuRef);
            }}
          >Options</button>
          <Show when={optionsMenuOpen()}>
            <div ref={optionsMenuRef} id="activity-options-menu" class="activity-options-menu" role="menu" aria-label="Graph options" onKeyDown={(event) => handleMenuKeyDown('options', event)}>
              <button type="button" role="menuitemcheckbox" aria-checked={graphVisible()} class="activity-option-check" onClick={toggleGraphVisible}><span aria-hidden="true">{graphVisible() ? '\u2713' : ''}</span>Graph</button>
              <button type="button" role="menuitemcheckbox" aria-checked={syncActivity()} class="activity-option-check" onClick={toggleSyncActivity}><span aria-hidden="true">{syncActivity() ? '\u2713' : ''}</span>Sync</button>
              <button type="button" role="menuitemcheckbox" aria-checked={termsVisible()} class="activity-option-check" onClick={toggleTermsVisible}><span aria-hidden="true">{termsVisible() ? '\u2713' : ''}</span>Terms</button>
            </div>
          </Show>
        </div>
        <div class="activity-score-row"><Show when={isAnswering()}><span class={timerCls()} onClick={() => togglePause()} title={paused() ? 'Resume timer' : 'Pause timer'}>{timerContent()}</span></Show><div class="activity-score-label">{activityScore()}</div></div>
        <Show when={visibleHistoryPosition()}>
          {(pos) => <div class="history-position-badge">card {pos().current}/{pos().total}</div>}
        </Show>
        <div class="activity-chart-wrap">
          <canvas ref={el => setCanvasRef(el)} width="240" height="126" />
          <Show when={copiedFlash()}><span class="copied-flash">Copied</span></Show>
        </div>
        <div class="activity-widget-stats">
          <div class="activity-stats"><span class="stat-item">review: <strong>{reviewStats().reviews}</strong></span><span class="stat-item">retention: <strong>{reviewStats().retention}</strong></span></div>
          <div class="activity-stats">
            <Show when={props.isFlashMode()} fallback={<span class="stat-item">score: <strong>{sidebarScore().correct} / {sidebarScore().attempted}</strong></span>}>
              <span class="stat-item">concepts: <strong>{conceptProgress()}</strong></span>
            </Show>
            <span class="stat-item">due: <strong>{sidebarScore().due} / {sidebarScore().total}</strong></span>
          </div>
          <div class="activity-reset-wrap" ref={resetWrapRef}>
            <button type="button" class="activity-reset-btn" onClick={() => {
              batch(() => { setResetMenuOpen(false); setConfirmAction(null); });
              if (props.isFlashMode()) quizSession()?.shuffleFlash?.()?.catch(() => {});
              else quizSession()?.shuffleMcq?.()?.catch(() => {});
            }}>Shuffle</button>
            <button
              type="button"
              ref={resetTriggerRef}
              class="activity-reset-btn"
              aria-haspopup="menu"
              aria-expanded={resetMenuOpen()}
              aria-controls="activity-reset-menu"
              onKeyDown={(event) => handleTriggerKeyDown('reset', event)}
              onClick={(event) => {
                const opening = !resetMenuOpen();
                batch(() => { setResetMenuOpen(opening); setOptionsMenuOpen(false); setConfirmAction(null); });
                if (opening && event.detail === 0) focusMenu(() => resetMenuRef);
              }}
            >Reset</button>
            <Show when={resetMenuOpen()}>
              <div ref={resetMenuRef} id="activity-reset-menu" class="reset-menu" role="menu" aria-label="Reset" onKeyDown={(event) => handleMenuKeyDown('reset', event)}>
                <Show when={!confirmAction()} fallback={
                  <div
                    class="reset-confirm"
                    role="group"
                    aria-label="Confirm reset"
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return;
                      event.preventDefault();
                      event.stopPropagation();
                      setConfirmAction(null);
                      focusMenu(resetMenuRef);
                    }}
                  >
                    <span class="reset-confirm-label">Are you sure?</span>
                    <div class="reset-confirm-btns">
                      <button type="button" ref={confirmYesRef} class="reset-confirm-yes" onClick={() => { confirmAction()?.(); closeReset(false); }}>Yes</button>
                      <button type="button" class="reset-confirm-no" onClick={() => { setConfirmAction(null); focusMenu(resetMenuRef); }}>No</button>
                    </div>
                  </div>
                }>
                  <button type="button" role="menuitem" class="reset-menu-item" onClick={() => beginConfirmation(async () => { try { await clearActivity(); loadActivity(); } catch { /* UI action - failure keeps stale graph, no state to roll back */ } })}>Reset graph</button>
                  <button type="button" role="menuitem" class="reset-menu-item" onClick={() => beginConfirmation(() => { const s = session(); if (s) { const r = s.resetSection(); if (r instanceof Promise) r.catch(() => {}); } })}>Reset section</button>
                </Show>
              </div>
            </Show>
          </div>
        </div>
        <Show when={quizSession()?.cramMode()}>
          <div class="cram-bar">Cram mode — {quizSession()?.cramCount()} reviewed <button type="button" class="cram-end" onClick={() => quizSession()?.endCram()}>End</button></div>
        </Show>
      </div>
    </>
  );
}
