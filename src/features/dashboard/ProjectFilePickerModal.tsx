import { createEffect, createSignal, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { listProjectFiles, openProjectFile, openProjectsFolder, type ProjectFileEntry } from './projectFiles.ts';
import { setLoadError } from '../launcher/store.ts';

interface Props {
  open: boolean;
  onClose: () => void;
}

type SortKey = 'modified' | 'created' | 'title' | 'file';
type SortDirection = 'asc' | 'desc';

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProjectFilePickerModal(props: Props) {
  const [files, setFiles] = createSignal<ProjectFileEntry[]>([]);
  const [search, setSearch] = createSignal('');
  const [sortKey, setSortKey] = createSignal<SortKey>('modified');
  const [sortDirection, setSortDirection] = createSignal<SortDirection>('desc');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    if (!props.open) return;
    setSearch('');
    setError(null);
    setLoading(true);
    listProjectFiles()
      .then(setFiles)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to list project files.'))
      .finally(() => setLoading(false));
  });

  const sortedFiles = () => {
    const q = search().trim().toLowerCase();
    const rows = q
      ? files().filter(file =>
        file.name.toLowerCase().includes(q) || file.file.toLowerCase().includes(q)
      )
      : files();

    const direction = sortDirection() === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey() === 'modified') {
        return direction * (new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime());
      }
      if (sortKey() === 'created') {
        return direction * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
      const left = sortKey() === 'title' ? a.name : a.file;
      const right = sortKey() === 'title' ? b.name : b.file;
      return direction * left.localeCompare(right);
    });
  };

  function dateLine(file: ProjectFileEntry) {
    if (sortKey() === 'created') return `Added ${formatDate(file.createdAt)}`;
    if (sortKey() === 'modified') return `Modified ${formatDate(file.modifiedAt)}`;
    return `Added ${formatDate(file.createdAt)} - Modified ${formatDate(file.modifiedAt)}`;
  }

  function handleSortChange(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value as SortKey;
    setSortKey(value);
    setSortDirection(value === 'title' || value === 'file' ? 'asc' : 'desc');
  }

  async function handleOpen(file: ProjectFileEntry) {
    try {
      setError(null);
      await openProjectFile(file.file);
      props.onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open project file.';
      setError(message);
      setLoadError(message);
    }
  }

  async function handleOpenFolder() {
    try {
      setError(null);
      await openProjectsFolder();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open projects folder.';
      setError(message);
      setLoadError(message);
    }
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div class="db-modal-backdrop" onClick={props.onClose}>
          <div class="db-modal-panel db-project-file-panel" onClick={(e) => e.stopPropagation()}>
            <div class="db-modal-header">
              <span>Project Files</span>
              <div class="db-modal-header-actions">
                <button type="button" class="db-modal-tool" onClick={() => void handleOpenFolder()} title="Open projects folder in Explorer">Open Folder</button>
                <button type="button" class="db-modal-close" onClick={props.onClose}>&times;</button>
              </div>
            </div>

            <div class="db-modal-controls">
              <input
                type="text"
                class="db-modal-search"
                placeholder="Search JSON projects..."
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                autofocus
              />
              <div class="db-modal-sortbar">
                <select
                  class="db-modal-sort-select"
                  value={sortKey()}
                  onChange={handleSortChange}
                  title="Sort project files"
                >
                  <option value="modified">Last modified</option>
                  <option value="created">Date added</option>
                  <option value="title">Title</option>
                  <option value="file">Filename</option>
                </select>
                <button
                  type="button"
                  class="db-modal-sort-dir"
                  onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                  title={sortDirection() === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {sortDirection() === 'asc' ? '↑' : '↓'}
                </button>
                <span class="db-modal-count">{files().length} files</span>
              </div>
            </div>

            <Show when={error()}>
              <div class="db-review-inline-error">{error()}</div>
            </Show>

            <div class="db-modal-list">
              <Show when={!loading()} fallback={<div class="db-modal-empty">Loading projects...</div>}>
                <For each={sortedFiles()} fallback={<div class="db-modal-empty">No JSON projects found</div>}>
                  {(file) => (
                    <button type="button" class="db-modal-item" onClick={() => void handleOpen(file)} title={`${file.name} - ${file.file}`}>
                      <span class="db-modal-item-title">{file.name}</span>
                      <span class="db-modal-item-file">{file.file}</span>
                      <span class="db-modal-item-date">{dateLine(file)}</span>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
