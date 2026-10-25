import { createSignal, For, Show } from 'solid-js';
import type { ProjectRowData } from './types.ts';
import { ProjectBrowserModal } from './ProjectBrowserModal.tsx';
import { ProjectFilePickerModal } from './ProjectFilePickerModal.tsx';
import { loadError, failedSlug } from '../launcher/store.ts';

interface ReviewTabProps {
  projects: ProjectRowData[];
  onOpen: (slug: string) => void;
  onRemove: (slug: string) => void;
}

export function ReviewTab(props: ReviewTabProps) {
  const [browserOpen, setBrowserOpen] = createSignal(false);
  const [filePickerOpen, setFilePickerOpen] = createSignal(false);

  return (
    <div class="db-review">
      <div class="db-review-header">
        <span class="db-review-title">Your Decks</span>
        <div class="db-review-header-actions">
          <button type="button" class="db-review-browse" onClick={() => setBrowserOpen(true)}>Browse Decks</button>
          <button type="button" class="db-review-browse" onClick={() => setFilePickerOpen(true)}>Open File</button>
        </div>
      </div>

      <Show when={props.projects.length > 0} fallback={
        <div class="db-review-empty">No decks yet. Browse, import, or create one.</div>
      }>
        <div class="db-review-list">
          <For each={props.projects}>
            {(p) => {
              const hasDue = () => p.due > 0 || p.learning > 0;
              return (
                <div class={`db-review-row ${hasDue() ? 'db-review-row--due' : ''} ${failedSlug() === p.slug ? 'db-review-row--error' : ''}`} onClick={() => props.onOpen(p.slug)}>
                  <div class="db-review-main">
                    <span class="db-review-name">{p.name}</span>
                    <Show when={failedSlug() === p.slug && loadError()}>
                      <span class="db-review-inline-error">{loadError()}</span>
                    </Show>
                    <span class="db-review-pills">
                      <span class={`db-pill db-pill-new ${p.new === 0 ? 'db-pill--zero' : ''}`} title="New">{p.new}</span>
                      <span class={`db-pill db-pill-learning ${p.learning === 0 ? 'db-pill--zero' : ''}`} title="Learning">{p.learning}</span>
                      <span class={`db-pill db-pill-due ${p.due === 0 ? 'db-pill--zero' : ''}`} title="Due">{p.due}</span>
                    </span>
                    <button type="button" class="db-review-remove" onClick={(e) => { e.stopPropagation(); props.onRemove(p.slug); }} title="Remove from recents">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <ProjectBrowserModal open={browserOpen()} onClose={() => setBrowserOpen(false)} />
      <ProjectFilePickerModal open={filePickerOpen()} onClose={() => setFilePickerOpen(false)} />
    </div>
  );
}
