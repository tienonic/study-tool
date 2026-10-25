import { Show, onMount, onCleanup, createEffect, untrack } from 'solid-js';
import { createQuizSession } from './store.ts';
import { sectionHandlers, bumpHandlerVersion } from '../../core/store/sections.ts';
import { forProject } from '../../core/hooks/useWorker.ts';
import { activeProject, activeTab } from '../../core/store/app.ts';
import { McqCard } from './McqCard.tsx';
import { FlashcardArea } from './FlashcardArea.tsx';
import type { Section } from '../../projects/types.ts';
import { MERGED_TAB_ID, getMergeableQuizSections } from './merged.ts';

export function MergedQuizView() {
  const project = activeProject()!;
  const quizSections = getMergeableQuizSections(project);

  // Build a synthetic section for the merged session — its fields aren't used for lookups
  // (sourceSections handles that), but cardIds/flashCardIds are used for length checks
  const mergedSection: Section = {
    id: MERGED_TAB_ID,
    name: 'All',
    type: quizSections[0]?.type ?? 'mc-quiz',
    cardIds: quizSections.flatMap(s => s.cardIds),
    flashCardIds: quizSections.flatMap(s => s.flashCardIds),
    flashcards: quizSections.flatMap(s => s.flashcards ?? []),
    hasFlashcards: quizSections.some(s => s.hasFlashcards),
  };

  const session = createQuizSession(mergedSection, forProject(project.slug), quizSections);

  onMount(() => {
    sectionHandlers.set(MERGED_TAB_ID, { kind: 'quiz', session });
    bumpHandlerVersion();
    session.pickNextCard().catch(() => {});
  });

  onCleanup(() => {
    session.stopPronunciation();
    sectionHandlers.delete(MERGED_TAB_ID);
    bumpHandlerVersion();
  });

  // Reset timer when merged tab becomes active
  createEffect(() => {
    if (activeTab() !== MERGED_TAB_ID) return;
    if (untrack(() => session.state()) === 'answering') session.timer.start();
  });

  const hasPassage = quizSections.some(s => s.type === 'passage-quiz');

  return (
    <div>
      <Show when={!session.flashMode()}>
        <McqCard session={session} isPassage={hasPassage} />
      </Show>
      <Show when={session.flashMode()}>
        <FlashcardArea session={session} />
      </Show>
    </div>
  );
}
