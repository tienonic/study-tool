import './layout.css';
import { Show, createSignal, createEffect, onMount, onCleanup, untrack } from 'solid-js';
import { activeProject, activeTab, zenMode, sessionSummary, setSessionSummary, graphVisible, termsVisible, sidebarOffsetY, setSidebarOffsetY } from '../../core/store/app.ts';
import { useKeyboard } from '../../core/hooks/useKeyboard.ts';
import { entries as glossaryEntries } from '../../features/glossary/store.ts';
import { sectionHandlers, handlerVersion } from '../../core/store/sections.ts';
import { Header } from './Header.tsx';
import { TopToggles } from './TopToggles.tsx';
import { SectionsContainer } from './SectionsContainer.tsx';
import { TermsDropdown } from '../../features/glossary/TermsDropdown.tsx';
import { NoteBox } from '../../features/notes/NoteBox.tsx';
import { ActivityWidget } from '../../features/activity/ActivityWidget.tsx';
import { initActivityEffects } from '../../features/activity/store.ts';
import { studyView } from '../../core/store/app.ts';
import { LearningWorkspace } from '../../features/learning/Workspace.tsx';

const DRAG_THRESHOLD = 5;

export function StudyApp() {
  useKeyboard();
  initActivityEffects();
  createEffect(() => {
    handlerVersion();
    const suspended = studyView() !== 'drill';
    untrack(() => {
      for (const entry of sectionHandlers.values()) entry.session.timer.setSuspended(suspended);
    });
  });

  const isMathTab = () => {
    const project = activeProject();
    const tab = activeTab();
    if (!project || !tab) return false;
    return project.sections.find(s => s.id === tab)?.type === 'math-gen';
  };

  const activeEntry = () => {
    handlerVersion();
    const tab = activeTab();
    return tab ? sectionHandlers.get(tab) : undefined;
  };

  const isFlashMode = () => {
    const e = activeEntry();
    return e?.kind === 'quiz' ? e.session.flashMode() : false;
  };

  // --- Sidebar Y-axis drag (click-vs-drag with threshold) ---
  const [dragging, setDragging] = createSignal(false);
  let dragStartY = 0;
  let dragStartOffset = 0;
  let isDragging = false;

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    dragStartY = e.clientY;
    dragStartOffset = sidebarOffsetY();
    isDragging = false;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    const delta = e.clientY - dragStartY;
    if (!isDragging && Math.abs(delta) >= DRAG_THRESHOLD) {
      isDragging = true;
      setDragging(true);
    }
    if (isDragging) {
      e.preventDefault();
      setSidebarOffsetY(dragStartOffset + delta);
    }
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    if (isDragging) {
      setDragging(false);
      isDragging = false;
      snapToCard();
      try { localStorage.setItem('sidebar-offset-y', String(sidebarOffsetY())); } catch { /* */ }
    }
  }

  function snapToCard() {
    const widget = document.querySelector('.activity-widget');
    const card = document.querySelector('.block .flashcard')
      ?? document.querySelector('.block .card')
      ?? document.querySelector('.block .done-screen');
    if (!widget || !card) return;
    const wb = widget.getBoundingClientRect();
    const cb = card.getBoundingClientRect();
    const bottomDiff = wb.bottom - cb.bottom;
    const topDiff = wb.top - cb.top;
    const snap = Math.abs(bottomDiff) < Math.abs(topDiff) ? bottomDiff : topDiff;
    if (Math.abs(snap) < 40) {
      setSidebarOffsetY(sidebarOffsetY() - Math.round(snap));
      try { localStorage.setItem('sidebar-offset-y', String(sidebarOffsetY())); } catch { /* */ }
    }
  }

  onCleanup(() => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  });

  return (
    <div class={`${zenMode() ? 'zen' : ''} ${studyView() !== 'drill' ? 'learning-expanded' : ''}`} id="study-app">
      <Header />
      <TopToggles />

      <main>
        <LearningWorkspace />
        <div class={studyView() === 'drill' ? '' : 'hidden'}><SectionsContainer /></div>
      </main>

      <Show when={!isMathTab() && studyView() === 'drill'}>
        <div
          class={`sidebar-right ${dragging() ? 'dragging' : ''}`}
          style={{ transform: `translateY(${sidebarOffsetY()}px)` }}
          onMouseDown={onMouseDown}
        >
          <NoteBox />
          <Show when={termsVisible() && glossaryEntries().length > 0}>
            <TermsDropdown />
          </Show>
          <Show when={graphVisible()}>
            <ActivityWidget isFlashMode={isFlashMode} activeEntry={activeEntry} />
          </Show>
          <Show when={sessionSummary()}>
            {(summary) => <SessionBanner gap={summary().gap} dueNow={summary().dueNow} />}
          </Show>
        </div>
      </Show>
    </div>
  );
}

function SessionBanner(props: { gap: string; dueNow: number }) {
  const [fading, setFading] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    timer = setTimeout(() => {
      setFading(true);
      fadeTimer = setTimeout(() => setSessionSummary(null), 600);
    }, 7400);
  });

  onCleanup(() => { if (timer) clearTimeout(timer); if (fadeTimer) clearTimeout(fadeTimer); });

  return (
    <div class={`session-banner ${fading() ? 'session-banner--fade' : ''}`} onClick={() => setSessionSummary(null)}>
      Last studied {props.gap} — {props.dueNow} card{props.dueNow !== 1 ? 's' : ''} due
    </div>
  );
}
