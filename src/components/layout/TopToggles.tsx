import { Show } from 'solid-js';
import { activeTab, zenMode, toggleZenMode, headerVisible, termsOpen, graphVisible, toggleGraphVisible } from '../../core/store/app.ts';
import { sectionHandlers, handlerVersion } from '../../core/store/sections.ts';
import { mixedPromptSides, setMixedPromptSides } from '../../features/quiz/mixedPromptSides.ts';

export function TopToggles() {
  const quizSession = () => {
    handlerVersion();
    const tab = activeTab();
    if (!tab) return undefined;
    const entry = sectionHandlers.get(tab);
    return entry?.kind === 'quiz' ? entry.session : undefined;
  };

  const isFlashMode = () => quizSession()?.flashMode() ?? false;

  return (
    <div class={`top-toggles${headerVisible() || termsOpen() ? ' hidden' : ''}`}>
      <Show when={isFlashMode()}>
        <label class="top-toggle def-first-toggle" title="Show definition side first">
          <span class="top-toggle-label">flip</span>
          <input
            type="checkbox"
            checked={!mixedPromptSides() && (quizSession()?.flashDefFirst() ?? false)}
            disabled={mixedPromptSides()}
            onChange={(e) => quizSession()?.setFlashDefFirst(e.currentTarget.checked)}
          />
        </label>
      </Show>
      <Show when={!graphVisible()}>
        <label class="top-toggle graph-toggle" title="Show activity graph">
          <span class="top-toggle-label">graph</span>
          <input type="checkbox" checked={graphVisible()} onChange={toggleGraphVisible} />
        </label>
      </Show>
      <Show when={isFlashMode()}>
        <label class="top-toggle mixed-sides-toggle" title="Randomly show the term or definition first on new cards">
          <span class="top-toggle-label">mix</span>
          <input
            type="checkbox"
            checked={mixedPromptSides()}
            onChange={(event) => setMixedPromptSides(event.currentTarget.checked)}
          />
        </label>
      </Show>
      <label class="top-toggle zen-toggle" title="Focus mode — hide extra UI">
        <span class="top-toggle-label">zen</span>
        <input type="checkbox" checked={zenMode()} onChange={toggleZenMode} />
      </label>
    </div>
  );
}
