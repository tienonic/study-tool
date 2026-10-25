import { createSignal, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { projectRegistry } from '../../projects/registry.ts';
import { openRegistryProject } from '../launcher/store.ts';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProjectBrowserModal(props: Props) {
  const [search, setSearch] = createSignal('');

  const filtered = () => {
    const q = search().toLowerCase();
    if (!q) return projectRegistry;
    return projectRegistry.filter(p => p.name.toLowerCase().includes(q));
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div class="db-modal-backdrop" onClick={props.onClose}>
          <div class="db-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div class="db-modal-header">
              <span>All Decks</span>
              <button type="button" class="db-modal-close" onClick={props.onClose}>&times;</button>
            </div>
            <input
              type="text"
              class="db-modal-search"
              placeholder="Search decks..."
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              autofocus
            />
            <div class="db-modal-list">
              <For each={filtered()} fallback={<div class="db-modal-empty">No decks found</div>}>
                {(p) => (
                  <button type="button" class="db-modal-item" onClick={() => { openRegistryProject(p.slug); props.onClose(); }}>
                    {p.name}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
