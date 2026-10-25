import { createSignal, For, Show, onCleanup, batch } from 'solid-js';
import {
  keybinds, setKeybind, resetKeybinds, findConflict,
  ACTION_META, DEFAULT_KEYBINDS, CONTEXT_LABELS, keyToLabel,
  type KeyAction, type Binding, type KeyContext,
} from './keybinds.ts';
import { activePanel, setActivePanel, setHeaderLocked } from '../../core/store/app.ts';
import { AnchoredDialog } from '../../components/overlays/AnchoredDialog.tsx';

const CONTEXT_ORDER: KeyContext[] = ['global', 'mcq', 'flashcard', 'math'];

const GROUPED_ACTIONS: Record<KeyContext, KeyAction[]> = { global: [], mcq: [], flashcard: [], math: [] };
for (const action of Object.keys(ACTION_META) as KeyAction[]) GROUPED_ACTIONS[ACTION_META[action].context].push(action);

export function KeybindsPanel() {
  const [capturing, setCapturing] = createSignal<KeyAction | null>(null);
  const [conflict, setConflict] = createSignal<{ action: KeyAction; existing: KeyAction } | null>(null);
  let btnRef!: HTMLButtonElement;

  function close() {
    if (activeCaptureHandler) { document.removeEventListener('keydown', activeCaptureHandler, true); activeCaptureHandler = null; }
    batch(() => { setCapturing(null); setConflict(null); setActivePanel(null); setHeaderLocked(false); });
  }

  let activeCaptureHandler: ((e: KeyboardEvent) => void) | null = null;
  let captureTimerId: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (captureTimerId) clearTimeout(captureTimerId);
    if (activeCaptureHandler) { document.removeEventListener('keydown', activeCaptureHandler, true); activeCaptureHandler = null; }
  });

  function startCapture(action: KeyAction) {
    batch(() => { setConflict(null); setCapturing(action); });

    function captureHandler(e: KeyboardEvent) {
      e.preventDefault(); e.stopPropagation();
      document.removeEventListener('keydown', captureHandler, true);
      activeCaptureHandler = null;
      if (e.key === 'Escape') { setCapturing(null); return; }
      const binding: Binding = { key: e.key, label: keyToLabel(e.key, e.code) };
      if (e.code === 'Space') binding.code = 'Space';
      const existing = findConflict(action, binding);
      if (existing) { batch(() => { setConflict({ action, existing }); setKeybind(existing, keybinds()[action]); }); }
      batch(() => { setKeybind(action, binding); setCapturing(null); });
    }

    captureTimerId = setTimeout(() => { captureTimerId = undefined; activeCaptureHandler = captureHandler; document.addEventListener('keydown', captureHandler, true); }, 0);
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        class="tips-btn"
        title="Keyboard shortcuts"
        role="menuitem"
        aria-haspopup="dialog"
        aria-expanded={activePanel() === 'keybinds'}
        onClick={() => {
          if (activePanel() === 'keybinds') close();
          else batch(() => { setActivePanel('keybinds'); setHeaderLocked(true); });
        }}
      >Keys</button>
      <Show when={activePanel() === 'keybinds'}>
        <AnchoredDialog anchor={btnRef} class="keybinds-modal" label="Keyboard shortcuts" onDismiss={() => {
          if (capturing()) {
            if (activeCaptureHandler) { document.removeEventListener('keydown', activeCaptureHandler, true); activeCaptureHandler = null; }
            batch(() => { setCapturing(null); setConflict(null); });
          } else close();
        }}>
              <div class="keybinds-header"><span>Keyboard shortcuts</span><button type="button" class="keybinds-close" aria-label="Close keyboard shortcuts" onClick={close}>&times;</button></div>
              <div class="keybinds-body">
                <For each={CONTEXT_ORDER}>
                  {(ctx) => {
                    const actions = GROUPED_ACTIONS[ctx];
                    return (
                      <Show when={actions.length > 0}>
                        <div class="keybinds-group">
                          <div class="keybinds-group-label">{CONTEXT_LABELS[ctx]}</div>
                          <For each={actions}>
                            {(action) => {
                              const b = () => keybinds()[action];
                              const isDefault = () => b().key === DEFAULT_KEYBINDS[action].key && b().code === DEFAULT_KEYBINDS[action].code;
                              const isCapturing = () => capturing() === action;
                              const isConflictSource = () => conflict()?.existing === action;
                              return <div class={`keybinds-row ${isConflictSource() ? 'keybinds-conflict' : ''}`}><span class="keybinds-action">{ACTION_META[action].name}</span><kbd class={isCapturing() ? 'keybinds-capture' : ''}>{isCapturing() ? '…' : b().label}</kbd><button type="button" class="keybinds-rebind" onClick={() => startCapture(action)} disabled={!!capturing()}>{isCapturing() ? 'Press key' : 'Rebind'}</button><Show when={!isDefault()}><span class="keybinds-custom">&bull;</span></Show></div>;
                            }}
                          </For>
                        </div>
                      </Show>
                    );
                  }}
                </For>
                <Show when={conflict()}>{(c) => <div class="keybinds-conflict-msg">Swapped with "{ACTION_META[c().existing].name}"</div>}</Show>
              </div>
              <div class="keybinds-footer"><button type="button" class="settings-save-btn" onClick={() => batch(() => { resetKeybinds(); setConflict(null); })}>Reset all to defaults</button></div>
        </AnchoredDialog>
      </Show>
    </>
  );
}
