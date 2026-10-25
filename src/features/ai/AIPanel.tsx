import { createSignal, Show, onMount, onCleanup, Switch, Match, batch } from 'solid-js';
import { Portal } from 'solid-js/web';
import { activePanel, setActivePanel, setHeaderLocked } from '../../core/store/app.ts';
import { aiTab, setAiTab, abortStream } from './store.ts';
import { InsightsTab } from './InsightsTab.tsx';
import { GenerateTab } from './GenerateTab.tsx';
import { TargetedTab } from './TargetedTab.tsx';
import type { AITab } from './types.ts';

const TABS: { id: AITab; label: string }[] = [
  { id: 'insights', label: 'Insights' },
  { id: 'generate', label: 'Generate' },
  { id: 'targeted', label: 'Targeted' },
];

export function AIPanel() {
  const [panelTop, setPanelTop] = createSignal(0);
  let btnRef!: HTMLButtonElement;

  function close() { abortStream(); batch(() => { setActivePanel(null); setHeaderLocked(false); }); }
  const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape' && activePanel() === 'ai') close(); };
  function handleBackdropClick(e: MouseEvent) { if (e.target instanceof Element && e.target.classList.contains('settings-backdrop')) close(); }
  onMount(() => document.addEventListener('keydown', handleEscape));
  onCleanup(() => document.removeEventListener('keydown', handleEscape));

  return (
    <>
      <button type="button" ref={btnRef} class="tips-btn" title="AI assistant" onClick={() => batch(() => { setPanelTop(btnRef.getBoundingClientRect().top); setActivePanel('ai'); setHeaderLocked(true); })}>AI</button>
      <Show when={activePanel() === 'ai'}>
        <Portal>
          <div class="settings-backdrop" onClick={handleBackdropClick}>
            <div class="keybinds-modal panel-fixed ai-modal" style={{ top: `${panelTop()}px` }}>
              <div class="keybinds-header"><span>AI Assistant</span><button type="button" class="keybinds-close" onClick={close}>&times;</button></div>
              <div class="ai-tabs">{TABS.map(tab => <button type="button" class={`ai-tab-btn ${aiTab() === tab.id ? 'active' : ''}`} onClick={() => setAiTab(tab.id)}>{tab.label}</button>)}</div>
              <div class="ai-body"><Switch><Match when={aiTab() === 'insights'}><InsightsTab /></Match><Match when={aiTab() === 'generate'}><GenerateTab /></Match><Match when={aiTab() === 'targeted'}><TargetedTab /></Match></Switch></div>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  );
}
