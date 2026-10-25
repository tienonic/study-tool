import { For, Show, createEffect, lazy } from 'solid-js';
import { activeProject, activeTab, mergedMode, setActiveTab } from '../../core/store/app.ts';
import { cardTypeRegistry } from '../../projects/cardTypeRegistry.ts';
import { MergedQuizView } from '../../features/quiz/MergedQuizView.tsx';
import { resolveStudyTab, shouldUseMergedQuiz } from '../../features/quiz/merged.ts';

// Lazy-load components from registry
const componentCache = new Map<string, ReturnType<typeof lazy>>();
function getComponent(type: string) {
  if (!componentCache.has(type)) {
    const entry = cardTypeRegistry[type as keyof typeof cardTypeRegistry];
    if (entry) componentCache.set(type, lazy(entry.component));
  }
  return componentCache.get(type);
}

export function SectionsContainer() {
  const mergedActive = () => shouldUseMergedQuiz(activeProject(), mergedMode());

  createEffect(() => {
    const targetTab = resolveStudyTab(activeProject(), mergedMode(), activeTab());
    if (targetTab !== activeTab()) setActiveTab(targetTab);
  });

  return (
    <div>
      {/* Individual section views — hidden when merged mode is active */}
      <For each={activeProject()?.sections ?? []}>
        {(section) => {
          const Comp = getComponent(section.type);
          return (
            <div class={activeTab() === section.id && !mergedActive() ? 'block' : 'hidden'}>
              {Comp ? <Comp section={section} /> : null}
            </div>
          );
        }}
      </For>

      {/* Merged view — shown when merged mode is active */}
      <Show when={mergedActive()}>
        <div class="block">
          <MergedQuizView />
        </div>
      </Show>
    </div>
  );
}
