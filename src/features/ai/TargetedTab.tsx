import { createSignal, Show, For } from 'solid-js';
import {
  targetedOutput, targetedLoading, targetedError,
  targetedAccepted, setTargetedAccepted, targetedWeakAreas,
  runTargeted, injectTargetedQuestions, abortStream,
} from './store.ts';

export function TargetedTab() {
  const [count, setCount] = createSignal(10);
  const [sectionName, setSectionName] = createSignal('AI Targeted Practice');
  const [injecting, setInjecting] = createSignal(false);

  function toggleAccepted(index: number) {
    const s = new Set(targetedAccepted());
    s.has(index) ? s.delete(index) : s.add(index);
    setTargetedAccepted(s);
  }

  async function handleInject() {
    setInjecting(true);
    try { await injectTargetedQuestions(sectionName()); } catch { /* injection failure */ } finally { setInjecting(false); }
  }

  const acceptedCount = () => targetedAccepted().size;

  return (
    <div class="ai-generate-form">
      <div class="ai-targeted-info">Generate questions targeting your weak areas based on FSRS performance data.</div>
      <Show when={targetedWeakAreas()}>
        <div class="ai-targeted-weak">Weak areas: {targetedWeakAreas()}</div>
      </Show>

      <div class="ai-generate-row">
        <label>Questions:</label>
        <input type="number" min={1} max={50} value={count()} onInput={(e) => setCount(parseInt(e.currentTarget.value, 10) || 10)} />
        <Show when={targetedLoading()} fallback={<button type="button" class="ai-btn" onClick={() => runTargeted(count())}>Generate from Weaknesses</button>}>
          <button type="button" class="ai-btn ai-btn-secondary" onClick={abortStream}><span class="ai-spinner ai-spinner-dark" /> Stop</button>
        </Show>
      </div>

      <Show when={targetedError()}>
        <div class="ai-error">{targetedError()}</div>
      </Show>

      <Show when={targetedOutput().length > 0}>
        <div class="ai-preview-list">
          <For each={targetedOutput()}>
            {(q, i) => {
              const accepted = () => targetedAccepted().has(i());
              return (
                <div class={`ai-preview-card ${accepted() ? '' : 'rejected'}`}>
                  <div class="ai-preview-header">
                    <input type="checkbox" checked={accepted()} onChange={() => toggleAccepted(i())} />
                    <span class="ai-preview-q">{q.q}</span>
                  </div>
                  <div class="ai-preview-answers">
                    <div class="ai-preview-correct">{q.correct}</div>
                    <For each={q.wrong}>
                      {(w) => <div>{w}</div>}
                    </For>
                    <Show when={q.explanation}><div class="ai-preview-explanation">{q.explanation}</div></Show>
                  </div>
                </div>
              );
            }}
          </For>
          <div class="ai-preview-actions">
            <input type="text" value={sectionName()} onInput={(e) => setSectionName(e.currentTarget.value)} placeholder="Section name" />
            <button type="button" class="ai-btn" disabled={acceptedCount() === 0 || injecting()} onClick={handleInject}>{injecting() ? 'Adding...' : `Add ${acceptedCount()} questions`}</button>
          </div>
        </div>
      </Show>
    </div>
  );
}
