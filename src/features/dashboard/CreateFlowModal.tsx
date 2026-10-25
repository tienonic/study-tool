import { createSignal, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { callGemini, GEMINI_MODELS, getGeminiKey, setGeminiKey } from './gemini.ts';
import { injectGeneratedCards, type GeneratedCard } from '../ai/injectCards.ts';
import { parseGeneratedMcqCards } from '../ai/questionQuality.ts';
import type { FlowConfig } from './flowConfigs.ts';

interface Props {
  config: FlowConfig | null;
  onClose: () => void;
}

export function CreateFlowModal(props: Props) {
  const [topic, setTopic] = createSignal('');
  const [count, setCount] = createSignal(10);
  const [model, setModel] = createSignal<string>(GEMINI_MODELS.LITE);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [cards, setCards] = createSignal<GeneratedCard[]>([]);
  const [accepted, setAccepted] = createSignal<Set<number>>(new Set());
  const [sectionName, setSectionName] = createSignal('');

  let abortCtrl: AbortController | null = null;

  async function generate() {
    const config = props.config;
    if (!config || !topic().trim()) return;
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    setLoading(true);
    setError(null);
    setCards([]);

    let fullResponse = '';
    try {
      const prompt = `Topic: ${topic()}\nGenerate ${count()} questions.`;
      await callGemini(prompt, config.systemPrompt, model(), (text) => { fullResponse += text; }, abortCtrl.signal);

      const parsed = parseCards(fullResponse);
      if (parsed.length === 0) {
        setError('No valid questions found in response');
      } else {
        setCards(parsed);
        setAccepted(new Set(parsed.map((_, i) => i)));
        if (!sectionName()) setSectionName(config.title + ' - ' + topic().slice(0, 30));
      }
    } catch (err: unknown) {
      if (abortCtrl?.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function toggleCard(idx: number) {
    setAccepted(prev => {
      const s = new Set(prev);
      if (s.has(idx)) s.delete(idx); else s.add(idx);
      return s;
    });
  }

  async function addToDeck() {
    const selected = cards().filter((_, i) => accepted().has(i));
    if (selected.length === 0) return;
    await injectGeneratedCards(selected, sectionName() || 'AI Generated');
    props.onClose();
  }

  return (
    <Show when={props.config}>
      <Portal>
        <div class="db-modal-backdrop" onClick={props.onClose}>
          <div class="db-flow-modal" onClick={(e) => e.stopPropagation()}>
            <div class="db-modal-header">
              <span>{props.config!.title}</span>
              <button type="button" class="db-modal-close" onClick={props.onClose}>&times;</button>
            </div>
            <div class="db-flow-body">
              <p class="db-flow-desc">{props.config!.subtitle}</p>

              <div class="db-flow-field">
                <label>Gemini API Key</label>
                <input type="password" value={getGeminiKey() ?? ''} onInput={(e) => setGeminiKey(e.currentTarget.value)} placeholder="Paste your Gemini API key" />
              </div>

              <div class="db-flow-field">
                <label>Topic</label>
                <input type="text" value={topic()} onInput={(e) => setTopic(e.currentTarget.value)} placeholder="e.g., Photosynthesis" />
              </div>

              <div class="db-flow-row">
                <div class="db-flow-field">
                  <label>Questions</label>
                  <input type="number" value={count()} min={1} max={50} onInput={(e) => setCount(+e.currentTarget.value || 10)} />
                </div>
                <div class="db-flow-field">
                  <label>Model</label>
                  <select value={model()} onChange={(e) => setModel(e.currentTarget.value)}>
                    <option value={GEMINI_MODELS.LITE}>Lite</option>
                    <option value={GEMINI_MODELS.FLASH}>Flash</option>
                    <option value={GEMINI_MODELS.PRO}>Pro</option>
                  </select>
                </div>
              </div>

              <button type="button" class="db-flow-generate" disabled={loading() || !topic().trim()} onClick={loading() ? () => abortCtrl?.abort() : generate}>
                {loading() ? 'Stop' : 'Generate'}
              </button>

              <Show when={error()}>
                <div class="db-flow-error">{error()}</div>
              </Show>

              <Show when={cards().length > 0}>
                <div class="db-flow-cards">
                  <For each={cards()}>
                    {(card, i) => (
                      <div class={`db-flow-card ${accepted().has(i()) ? '' : 'db-flow-card--rejected'}`}>
                        <label class="db-flow-card-check">
                          <input type="checkbox" checked={accepted().has(i())} onChange={() => toggleCard(i())} />
                        </label>
                        <div class="db-flow-card-content">
                          <div class="db-flow-card-q">{card.q}</div>
                          <div class="db-flow-card-a">{card.correct}</div>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
                <div class="db-flow-inject">
                  <input type="text" value={sectionName()} onInput={(e) => setSectionName(e.currentTarget.value)} placeholder="Section name" />
                  <button type="button" class="db-flow-add" onClick={addToDeck}>
                    Add {accepted().size} to Deck
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

function parseCards(raw: string): GeneratedCard[] {
  return parseGeneratedMcqCards(raw);
}
