import './quiz.css';
import { Show, onMount, onCleanup, createEffect, untrack } from 'solid-js';
import type { Section } from '../../projects/types.ts';
import { createQuizSession } from './store.ts';
import { sectionHandlers, bumpHandlerVersion } from '../../core/store/sections.ts';
import { forProject } from '../../core/hooks/useWorker.ts';
import { activeProject, activeTab } from '../../core/store/app.ts';
import { McqCard } from './McqCard.tsx';
import { FlashcardArea } from './FlashcardArea.tsx';

export function QuizSection(props: { section: Section }) {
  const session = createQuizSession(props.section, forProject(activeProject()!.slug));
  let started = false;
  let disposed = false;

  function startSession() {
    if (started || disposed) return;
    started = true;
    session.pickNextCard().then(() => {
      // If still idle after resolve, retry once the worker has settled.
      if (!disposed && session.state() === 'idle') setTimeout(() => {
        if (!disposed) session.pickNextCard().catch(() => {});
      }, 300);
    }).catch(() => {
      setTimeout(() => {
        if (!disposed) session.pickNextCard().catch(() => {});
      }, 300);
    });
  }

  onMount(() => {
    sectionHandlers.set(props.section.id, { kind: 'quiz', session });
    bumpHandlerVersion();
  });
  onCleanup(() => { disposed = true; session.stopPronunciation(); sectionHandlers.delete(props.section.id); bumpHandlerVersion(); });

  // Reset timer when this section becomes the active tab — prevents stale elapsed time
  // from background timer inflating the rating in easy mode (all sections mount simultaneously)
  createEffect(() => {
    if (activeTab() !== props.section.id) return;
    startSession();
    if (untrack(() => session.state()) === 'answering') session.timer.start();
  });

  const isPassage = () => props.section.type === 'passage-quiz';
  const sourceFolder = () => activeProject()?.sourceFolder;

  function openFolder() { const folder = sourceFolder(); if (folder) fetch(`/__open-folder?path=${encodeURIComponent(folder)}`).catch(() => {}); }

  return (
    <div>
      <Show when={session.currentImageLink() || sourceFolder()}>
        <div class="mode-toggle mode-toggle-actions-only"><span class="mode-toggle-actions"><Show when={session.currentImageLink()}><a class="view-img" href={session.currentImageLink()} target="_blank" rel="noopener noreferrer">View image</a></Show><Show when={sourceFolder()}><button type="button" class="reset-btn" onClick={openFolder} title="Open project folder">Open</button></Show></span></div>
      </Show>

      <Show when={!session.flashMode()}>
        <McqCard session={session} isPassage={isPassage()} />
      </Show>
      <Show when={session.flashMode()}>
        <FlashcardArea session={session} />
      </Show>
    </div>
  );
}
