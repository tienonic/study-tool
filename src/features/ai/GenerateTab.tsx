import { createSignal, Show } from 'solid-js';
import { generateLoading, generateError, runGenerate, abortStream } from './store.ts';
import { QuestionPreview } from './QuestionPreview.tsx';

export function GenerateTab() {
  const [sourceText, setSourceText] = createSignal('');
  const [count, setCount] = createSignal(10);

  return (
    <div class="ai-generate-form">
      <textarea
        placeholder="Paste study material here (notes, textbook excerpts, etc.)..."
        value={sourceText()}
        onInput={(e) => setSourceText(e.currentTarget.value)}
      />
      <div class="ai-generate-row">
        <label>Questions:</label>
        <input
          type="number"
          min={1}
          max={50}
          value={count()}
          onInput={(e) => setCount(parseInt(e.currentTarget.value, 10) || 10)}
        />
        <Show when={generateLoading()} fallback={
          <button type="button"
            class="ai-btn"
            disabled={!sourceText().trim()}
            onClick={() => runGenerate(sourceText(), count())}
          >
            Generate
          </button>
        }>
          <button type="button" class="ai-btn ai-btn-secondary" onClick={abortStream}>
            <span class="ai-spinner ai-spinner-dark" /> Stop
          </button>
        </Show>
      </div>

      <Show when={generateError()}>
        <div class="ai-error">{generateError()}</div>
      </Show>

      <QuestionPreview />

      <Show when={!generateLoading() && !generateError() && sourceText().length === 0}>
        <div class="ai-empty">
          Paste study material above and click "Generate" to create quiz questions with FSRS tracking.
        </div>
      </Show>
    </div>
  );
}
