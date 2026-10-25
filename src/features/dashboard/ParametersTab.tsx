import { createSignal, onCleanup, onMount } from 'solid-js';
import { createPopupMenu } from './createHoverMenu.ts';
import type { FSRSDefaults } from '../../core/store/config.ts';

interface ParametersTabProps {
  defaults: FSRSDefaults;
  onSaveDefaults: (d: FSRSDefaults) => void;
}

export function ParametersTab(props: ParametersTabProps) {
  const menu = createPopupMenu();
  const [retention, setRetention] = createSignal(props.defaults.desired_retention);
  const [newPerSession, setNewPerSession] = createSignal(props.defaults.new_per_session);
  const [leechThreshold, setLeechThreshold] = createSignal(props.defaults.leech_threshold);
  const [maxInterval, setMaxInterval] = createSignal(props.defaults.max_interval);
  const [saved, setSaved] = createSignal(false);
  const triggerRefs = new Map<string, HTMLButtonElement>();

  function closeMenus() {
    menu.closeAll();
  }

  function openTopMenu(key: string, e: MouseEvent) {
    e.stopPropagation();
    menu.toggleOnly(key);
  }

  function focusPanel(id: string, last = false) {
    queueMicrotask(() => {
      const panel = document.getElementById(id);
      const controls = panel?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]');
      if (!controls?.length) return;
      (last ? controls[controls.length - 1] : controls[0]).focus();
    });
  }

  function handleTriggerKeyDown(key: string, panelId: string, event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      menu.openOnly(key);
      focusPanel(panelId);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      menu.openOnly(key);
      focusPanel(panelId, true);
    } else if (event.key === 'Escape' && menu.isOpen(key)) {
      event.preventDefault();
      menu.closeAll();
    }
  }

  function handlePanelKeyDown(key: string, event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    menu.closeAll();
    queueMicrotask(() => triggerRefs.get(key)?.focus());
  }

  function handleSave() {
    props.onSaveDefaults({
      desired_retention: retention(),
      new_per_session: newPerSession(),
      leech_threshold: leechThreshold(),
      max_interval: maxInterval(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  onMount(() => {
    const closeOnOutsidePointer = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest('.db-create')) return;
      closeMenus();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    onCleanup(() => document.removeEventListener('pointerdown', closeOnOutsidePointer));
  });

  return (
    <div class="db-create">
      <div class="db-create-menu">

        {/* FSRS Defaults */}
        <div class="db-create-item">
          <button type="button" ref={element => triggerRefs.set('fsrs', element)} class="db-create-item-trigger" aria-haspopup="dialog" aria-expanded={menu.isOpen('fsrs')} aria-controls="parameters-fsrs-panel" onKeyDown={(event) => handleTriggerKeyDown('fsrs', 'parameters-fsrs-panel', event)} onClick={(e) => openTopMenu('fsrs', e)}>
            <span class="db-create-item-label">FSRS defaults</span>
            <span class="db-create-item-sub">Recall target and limits</span>
          </button>
          <div id="parameters-fsrs-panel" role="dialog" aria-label="FSRS defaults" onKeyDown={(event) => handlePanelKeyDown('fsrs', event)} class={`db-submenu db-submenu-wide ${menu.isOpen('fsrs') ? 'db-submenu--open' : ''}`}>
            <div class="db-params-form">
              <label class="db-params-field">
                <span class="db-params-label">Desired retention</span>
                <div class="db-params-row">
                  <input
                    type="range" min="0.80" max="0.99" step="0.01"
                    value={retention()}
                    onInput={(e) => setRetention(parseFloat(e.currentTarget.value))}
                    class="db-params-slider"
                  />
                  <span class="db-params-value">{Math.round(retention() * 100)}%</span>
                </div>
              </label>
              <label class="db-params-field">
                <span class="db-params-label">New cards per day</span>
                <input type="number" min="1" max="10000" value={newPerSession()}
                  onInput={(e) => setNewPerSession(Math.min(10_000, Math.max(1, parseInt(e.currentTarget.value, 10) || 1)))}
                  class="db-params-input" />
              </label>
              <label class="db-params-field">
                <span class="db-params-label">Leech threshold</span>
                <input type="number" min="2" max="30" value={leechThreshold()}
                  onInput={(e) => setLeechThreshold(Math.max(2, parseInt(e.currentTarget.value, 10) || 8))}
                  class="db-params-input" />
              </label>
              <label class="db-params-field">
                <span class="db-params-label">Max interval (days)</span>
                <input type="number" min="1" max="365" value={maxInterval()}
                  onInput={(e) => setMaxInterval(Math.max(1, parseInt(e.currentTarget.value, 10) || 90))}
                  class="db-params-input" />
              </label>
              <button type="button" class="db-params-save" onClick={handleSave}>
                {saved() ? 'Saved' : 'Save defaults'}
              </button>
            </div>
          </div>
        </div>

        {/* Tips — Deck Generation */}
        <div class="db-create-item">
          <button type="button" ref={element => triggerRefs.set('tips', element)} class="db-create-item-trigger" aria-haspopup="dialog" aria-expanded={menu.isOpen('tips')} aria-controls="parameters-tips-panel" onKeyDown={(event) => handleTriggerKeyDown('tips', 'parameters-tips-panel', event)} onClick={(e) => openTopMenu('tips', e)}>
            <span class="db-create-item-label">Tips</span>
            <span class="db-create-item-sub">Deck generation</span>
          </button>
          <div id="parameters-tips-panel" role="dialog" aria-label="Deck generation tips" onKeyDown={(event) => handlePanelKeyDown('tips', event)} class={`db-submenu db-submenu-wide ${menu.isOpen('tips') ? 'db-submenu--open' : ''}`}>
            <div class="db-params-dropdown-body db-params-tips">
              <p>Paste <button type="button" class="db-tips-open-btn" title="Open in explorer" onClick={() => fetch('/__open-folder?path=GENERATING_PROJECTS.md').catch(() => {})}>GENERATING_PROJECTS.md</button> into any LLM with your source material. It will generate a JSON you can import directly.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
