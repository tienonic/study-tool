import { For, Show, batch } from 'solid-js';
import {
  type KeyAction, type KeyContext,
  keybinds, CONTEXT_LABELS,
} from './keybinds.ts';
import { activePanel, setActivePanel, setHeaderLocked } from '../../core/store/app.ts';
import { AnchoredDialog } from '../../components/overlays/AnchoredDialog.tsx';

const CONTEXT_ORDER: KeyContext[] = ['mcq', 'flashcard', 'math', 'global'];

const TIPS: Record<KeyContext, { action: string; keys: (map: Record<KeyAction, { label: string }>) => string }[]> = {
  mcq: [
    { action: 'Answer / rate', keys: (m) => `${m.answer1.label}-${m.answer4.label}` },
    { action: 'Skip / next', keys: (m) => m.skip.label },
    { action: 'Undo', keys: (m) => m.undo.label },
    { action: 'Suspend', keys: (m) => m.suspend.label },
    { action: 'Bury', keys: (m) => m.bury.label },
    { action: 'Go back', keys: (m) => m.goBack.label },
    { action: 'View image', keys: (m) => m.viewImage.label },
    { action: 'Forward', keys: (m) => m.forward.label },
  ],
  flashcard: [
    { action: 'Flip card', keys: (m) => `${m.flipCard.label} / ${m.flipAlt.label}` },
    { action: 'Play pronunciation', keys: (m) => m.replayPronunciation.label },
    { action: 'Again / good', keys: () => '1 / 2' },
    { action: 'Complex: hard / good / easy', keys: () => '3 / 4 / 5' },
  ],
  math: [
    { action: 'Submit', keys: () => 'Enter' },
    { action: 'Skip / next', keys: (m) => m.mathSubmit.label },
  ],
  global: [
    { action: 'Open note', keys: (m) => m.note.label },
    { action: 'Copy card', keys: (m) => m.copyCard.label },
  ],
};

export function TipsPanel() {
  let btnRef!: HTMLButtonElement;

  function close() { batch(() => { setActivePanel(null); setHeaderLocked(false); }); }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        class="tips-btn"
        title="Show keyboard tips"
        role="menuitem"
        aria-haspopup="dialog"
        aria-expanded={activePanel() === 'tips'}
        onClick={() => {
          if (activePanel() === 'tips') close();
          else batch(() => { setActivePanel('tips'); setHeaderLocked(true); });
        }}
      >Tips</button>
      <Show when={activePanel() === 'tips'}>
        <AnchoredDialog anchor={btnRef} class="keybinds-modal" label="Study tips" onDismiss={close}>
              <div class="keybinds-header"><span>Study tips</span><button type="button" class="keybinds-close" aria-label="Close study tips" onClick={close}>&times;</button></div>
              <div class="keybinds-body">
                <For each={CONTEXT_ORDER}>{(ctx) => <div class="keybinds-group"><div class="keybinds-group-label">{CONTEXT_LABELS[ctx]}</div><For each={TIPS[ctx]}>{(tip) => <div class="keybinds-row"><span class="keybinds-action">{tip.action}</span><kbd>{tip.keys(keybinds())}</kbd></div>}</For></div>}</For>
              </div>
        </AnchoredDialog>
      </Show>
    </>
  );
}
