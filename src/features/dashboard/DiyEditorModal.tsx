import { createSignal, For, Show, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { injectFlashcards } from '../ai/injectCards.ts';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface CardRow {
  front: string;
  back: string;
}

const DRAFT_KEY = 'diy-card-draft';
const INITIAL_ROWS = 10;

function loadDraft(): CardRow[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return makeRows(INITIAL_ROWS);
}

function makeRows(n: number): CardRow[] {
  return Array.from({ length: n }, () => ({ front: '', back: '' }));
}

export function DiyEditorModal(props: Props) {
  const [rows, setRows] = createSignal<CardRow[]>(loadDraft());
  const [sectionName, setSectionName] = createSignal('DIY Flashcards');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => { if (saveTimer) clearTimeout(saveTimer); });

  const completePairs = () => rows().filter(r => r.front.trim() && r.back.trim());

  // Debounced draft save
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(rows())); } catch {}
    }, 500);
  }

  function updateRow(idx: number, field: 'front' | 'back', value: string) {
    setRows(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
    scheduleSave();
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
    scheduleSave();
  }

  function addRows() {
    setRows(prev => [...prev, ...makeRows(10)]);
  }

  async function save() {
    const cards = completePairs();
    if (cards.length === 0) return;
    await injectFlashcards(cards, sectionName());
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setRows(makeRows(INITIAL_ROWS));
    props.onClose();
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div class="db-modal-backdrop" onClick={props.onClose}>
          <div class="db-diy-modal" onClick={(e) => e.stopPropagation()}>
            <div class="db-modal-header">
              <span>DIY Flashcards</span>
              <button type="button" class="db-modal-close" onClick={props.onClose}>&times;</button>
            </div>
            <div class="db-diy-body">
              <div class="db-diy-col-headers">
                <span class="db-diy-num">#</span>
                <span class="db-diy-col">Front</span>
                <span class="db-diy-arrow" />
                <span class="db-diy-col">Back</span>
                <span class="db-diy-del-spacer" />
              </div>
              <div class="db-diy-grid">
                <For each={rows()}>
                  {(row, i) => {
                    const oneSided = () => (row.front.trim() && !row.back.trim()) || (!row.front.trim() && row.back.trim());
                    return (
                      <div class="db-diy-row">
                        <span class="db-diy-num">{i() + 1}</span>
                        <input
                          type="text"
                          class={`db-diy-input ${oneSided() && row.front.trim() ? '' : oneSided() ? 'db-diy-input-warn' : ''}`}
                          value={row.front}
                          onInput={(e) => updateRow(i(), 'front', e.currentTarget.value)}
                          placeholder="term"
                        />
                        <span class="db-diy-arrow">&rarr;</span>
                        <input
                          type="text"
                          class={`db-diy-input ${oneSided() && row.back.trim() ? '' : oneSided() ? 'db-diy-input-warn' : ''}`}
                          value={row.back}
                          onInput={(e) => updateRow(i(), 'back', e.currentTarget.value)}
                          placeholder="definition"
                        />
                        <button type="button" class="db-diy-del" onClick={() => removeRow(i())}>&times;</button>
                      </div>
                    );
                  }}
                </For>
              </div>
              <button type="button" class="db-diy-add" onClick={addRows}>Add 10 More</button>
            </div>
            <div class="db-diy-footer">
              <input type="text" class="db-diy-name" value={sectionName()} onInput={(e) => setSectionName(e.currentTarget.value)} placeholder="Section name" />
              <button type="button" class="db-diy-save" disabled={completePairs().length === 0} onClick={save}>
                Save {completePairs().length} Cards
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
