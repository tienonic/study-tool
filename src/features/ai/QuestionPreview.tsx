import { createSignal, For, Show } from 'solid-js';
import { generateOutput, generateAccepted, setGenerateAccepted, injectAcceptedQuestions } from './store.ts';

export function QuestionPreview() {
  const [sectionName, setSectionName] = createSignal('AI Generated');
  const [injecting, setInjecting] = createSignal(false);

  function toggleAccepted(index: number) {
    const current = new Set(generateAccepted());
    if (current.has(index)) {
      current.delete(index);
    } else {
      current.add(index);
    }
    setGenerateAccepted(current);
  }

  async function handleInject() {
    setInjecting(true);
    try {
      await injectAcceptedQuestions(sectionName());
    } catch {
      // Injection failure — keep UI state consistent
    } finally {
      setInjecting(false);
    }
  }

  const acceptedCount = () => generateAccepted().size;

  return (
    <Show when={generateOutput().length > 0}>
      <div class="ai-preview-list">
        <For each={generateOutput()}>
          {(q, i) => {
            const accepted = () => generateAccepted().has(i());
            return (
              <div class={`ai-preview-card ${accepted() ? '' : 'rejected'}`}>
                <div class="ai-preview-header">
                  <input
                    type="checkbox"
                    checked={accepted()}
                    onChange={() => toggleAccepted(i())}
                  />
                  <span class="ai-preview-q">{q.q}</span>
                </div>
                <div class="ai-preview-answers">
                  <div class="ai-preview-correct">{q.correct}</div>
                  <For each={q.wrong}>
                    {(w) => <div>{w}</div>}
                  </For>
                  <Show when={q.explanation}>
                    <div class="ai-preview-explanation">
                      {q.explanation}
                    </div>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
        <div class="ai-preview-actions">
          <input
            type="text"
            value={sectionName()}
            onInput={(e) => setSectionName(e.currentTarget.value)}
            placeholder="Section name"
          />
          <button type="button"
            class="ai-btn"
            disabled={acceptedCount() === 0 || injecting()}
            onClick={handleInject}
          >
            {injecting() ? 'Injecting...' : `Add ${acceptedCount()} questions`}
          </button>
        </div>
      </div>
    </Show>
  );
}
