import './glossary.css';
import { Show, For, onMount, onCleanup, batch } from 'solid-js';
import {
  getRelevantTerms,
  filteredEntries,
  searchQuery,
  setSearchQuery,
} from './store.ts';
import { termsOpen, setTermsOpen } from '../../core/store/app.ts';

function googleUrl(term: string): string {
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(term + ' definition');
}

function googleImgUrl(term: string): string {
  return 'https://duckduckgo.com/?iax=images&ia=images&q=' + encodeURIComponent(term);
}

export function TermsDropdown() {
  let dropdownRef: HTMLDivElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;

  const closeTerms = (restoreFocus = false) => {
    batch(() => { setTermsOpen(false); setSearchQuery(''); });
    if (restoreFocus) queueMicrotask(() => triggerRef?.focus());
  };

  const handleClickOutside = (e: MouseEvent) => { if (dropdownRef && e.target instanceof Node && !dropdownRef.contains(e.target)) closeTerms(); };

  const handleKey = (e: KeyboardEvent) => {
    if (!termsOpen()) return;
    const tag = e.target instanceof Element ? e.target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Backspace') { setSearchQuery(searchQuery().slice(0, -1)); return; }
    if (e.key === 'Escape') { e.preventDefault(); closeTerms(true); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) setSearchQuery(searchQuery() + e.key);
  };

  onMount(() => { document.addEventListener('click', handleClickOutside, true); document.addEventListener('keydown', handleKey); });
  onCleanup(() => { document.removeEventListener('click', handleClickOutside, true); document.removeEventListener('keydown', handleKey); });

  return (
    <div class="terms-dropdown" ref={dropdownRef} onFocusOut={(event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      closeTerms();
    }}>
      <button
        type="button"
        ref={triggerRef}
        class="terms-toggle-btn"
        aria-label={termsOpen() ? 'Close terms' : 'Open terms'}
        aria-expanded={termsOpen()}
        aria-controls="activity-terms-panel"
        onClick={() => batch(() => { setTermsOpen(!termsOpen()); setSearchQuery(''); })}
      ><span aria-hidden="true">{termsOpen() ? '\u25B2' : '\u25BC'}</span></button>
      <Show when={termsOpen()}>
        <div id="activity-terms-panel" class="terms-list" role="region" aria-label="Terms">
          <Show when={searchQuery()}>
            <div class="term-filter" aria-live="polite">{searchQuery()}</div>
            <div class="term-list">
              <For each={filteredEntries()}>{t => <div class="term-item"><strong>{t.term}</strong><Show when={t.hasImage}><a class="term-img-link" href={googleImgUrl(t.term)} target="_blank" rel="noopener noreferrer">img</a></Show><div class="term-def">{t.def}</div></div>}</For>
            </div>
          </Show>
          <Show when={!searchQuery()}>
            <div class="activity-terms">
              <For each={getRelevantTerms()}>{t => <a class="term-tag" href={googleUrl(t.term)} target="_blank" rel="noopener noreferrer">{t.term}</a>}</For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
