import './notes.css';
import { createSignal, Show, batch, onCleanup } from 'solid-js';
import { noteBoxVisible, setNoteBoxVisible, activeProject } from '../../core/store/app.ts';
import { workerApi } from '../../core/hooks/useWorker.ts';

export function NoteBox() {
  const [placeholder, setPlaceholder] = createSignal('');
  let inputRef: HTMLInputElement | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function cancelCloseTimer() {
    if (closeTimer !== undefined) { clearTimeout(closeTimer); closeTimer = undefined; }
  }

  onCleanup(cancelCloseTimer);

  function handleKeyDown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = inputRef?.value.trim();
      const project = activeProject();
      if (text && project && inputRef) {
        workerApi.addNote(project.slug, text).catch(() => {});
        inputRef.value = '';
        setPlaceholder('saved');
        cancelCloseTimer();
        closeTimer = setTimeout(() => {
          closeTimer = undefined;
          batch(() => { setNoteBoxVisible(false); setPlaceholder(''); });
        }, 400);
      }
    } else if (e.key === 'Escape') {
      cancelCloseTimer();
      if (inputRef) inputRef.value = '';
      batch(() => { setPlaceholder(''); setNoteBoxVisible(false); });
    }
  }

  function handleBlur() {
    cancelCloseTimer();
    batch(() => { setNoteBoxVisible(false); setPlaceholder(''); });
  }

  return (
    <Show when={noteBoxVisible()}>
      <div class="note-box">
        <input
          ref={el => { inputRef = el; el?.focus(); }}
          type="text"
          placeholder={placeholder()}
          autocomplete="off"
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      </div>
    </Show>
  );
}
