import { createSignal, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { callGemini, GEMINI_MODELS, getGeminiKey, setGeminiKey } from './gemini.ts';
import { SOURCE_SYSTEM } from './flowConfigs.ts';
import { injectGeneratedCards, type GeneratedCard } from '../ai/injectCards.ts';
import { parseGeneratedMcqCards } from '../ai/questionQuality.ts';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MAX_CHARS = 10000;
const DENSITY_OPTIONS = [
  { value: 'core', label: 'Core', desc: 'Key concepts only' },
  { value: 'balanced', label: 'Balanced', desc: 'Well-rounded coverage' },
  { value: 'comprehensive', label: 'Comprehensive', desc: 'Thorough & detailed' },
  { value: 'complete', label: 'Complete', desc: 'Maximum coverage' },
] as const;

export function SourceMaterialModal(props: Props) {
  const [source, setSource] = createSignal('');
  const [density, setDensity] = createSignal('balanced');
  const [model, setModel] = createSignal<string>(GEMINI_MODELS.LITE);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [cards, setCards] = createSignal<GeneratedCard[]>([]);
  const [accepted, setAccepted] = createSignal<Set<number>>(new Set());
  const [sectionName, setSectionName] = createSignal('');

  let abortCtrl: AbortController | null = null;

  async function generate() {
    if (!source().trim()) return;
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    setLoading(true);
    setError(null);
    setCards([]);

    let fullResponse = '';
    try {
      const prompt = `Source material:\n${source().slice(0, MAX_CHARS)}\n\nDensity: ${density()}. Generate flashcard questions from this material.`;
      await callGemini(prompt, SOURCE_SYSTEM, model(), (text) => { fullResponse += text; }, abortCtrl.signal);

      const parsed = parseCards(fullResponse);
      if (parsed.length === 0) {
        setError('No valid questions found in response');
      } else {
        setCards(parsed);
        setAccepted(new Set(parsed.map((_, i) => i)));
        if (!sectionName()) setSectionName('Source Material');
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
    await injectGeneratedCards(selected, sectionName() || 'Source Material');
    props.onClose();
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div class="db-modal-backdrop" onClick={props.onClose}>
          <div class="db-flow-modal" onClick={(e) => e.stopPropagation()}>
            <div class="db-modal-header">
              <span>Source Material</span>
              <button type="button" class="db-modal-close" onClick={props.onClose}>&times;</button>
            </div>
            <div class="db-flow-body">
              <div class="db-flow-field">
                <label>Gemini API Key</label>
                <input type="password" value={getGeminiKey() ?? ''} onInput={(e) => setGeminiKey(e.currentTarget.value)} placeholder="Paste your Gemini API key" />
              </div>
              <textarea
                class="db-source-textarea"
                placeholder="Paste your study material here..."
                value={source()}
                onInput={(e) => setSource(e.currentTarget.value.slice(0, MAX_CHARS))}
              />
              <div class="db-source-charcount">{source().length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</div>

              <div class="db-source-density">
                <label>Density</label>
                <div class="db-source-density-btns">
                  <For each={[...DENSITY_OPTIONS]}>
                    {(opt) => (
                      <button
                        type="button"
                        class={`db-density-btn ${density() === opt.value ? 'db-density-btn--active' : ''}`}
                        onClick={() => setDensity(opt.value)}
                        title={opt.desc}
                      >
                        {opt.label}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="db-flow-row">
                <div class="db-flow-field">
                  <label>Model</label>
                  <select value={model()} onChange={(e) => setModel(e.currentTarget.value)}>
                    <option value={GEMINI_MODELS.LITE}>Lite</option>
                    <option value={GEMINI_MODELS.FLASH}>Flash</option>
                    <option value={GEMINI_MODELS.PRO}>Pro</option>
                  </select>
                </div>
              </div>

              <button type="button" class="db-flow-generate" disabled={loading() || !source().trim()} onClick={loading() ? () => abortCtrl?.abort() : generate}>
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
                    Accept {accepted().size} Cards
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
