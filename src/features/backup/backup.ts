import { initWorker, workerApi } from '../../core/hooks/useWorker.ts';
import type { CardRow, ReviewLogRow, ScoreRow, ActivityRow, NoteRow, HotkeyRow } from '../../core/workers/protocol.ts';
import type { ProjectData, ProjectConfig } from '../../projects/types.ts';
import { normalizeProjectData } from '../../projects/textNormalization.ts';

export interface BackupFile {
  version: 1;
  backupType: 'full';
  exportedAt: string;
  slug: string;
  projectData: ProjectData | null;
  projectConfig: Partial<ProjectConfig> | null;
  cards: CardRow[];
  review_log: ReviewLogRow[];
  scores: ScoreRow[];
  activity: ActivityRow[];
  notes: NoteRow[];
  hotkeys: HotkeyRow[];
}

export interface RestoreBackupOptions {
  includeGlobal?: boolean;
}

const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBit(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function validCardRow(row: unknown, slug: string): boolean {
  if (!isObject(row) || row.project_id !== slug) return false;
  return typeof row.card_id === 'string'
    && typeof row.section_id === 'string'
    && (row.card_type === 'mcq' || row.card_type === 'passage' || row.card_type === 'flashcard')
    && isFiniteNumber(row.fsrs_state)
    && typeof row.due === 'string'
    && isFiniteNumber(row.stability)
    && isFiniteNumber(row.difficulty)
    && isFiniteNumber(row.elapsed_days)
    && isFiniteNumber(row.scheduled_days)
    && (row.learning_steps === undefined || (isFiniteNumber(row.learning_steps) && Number.isInteger(row.learning_steps) && row.learning_steps >= 0))
    && isFiniteNumber(row.reps)
    && isFiniteNumber(row.lapses)
    && isNullableString(row.last_review)
    && isBit(row.suspended)
    && isBit(row.buried)
    && (row.buried_until === undefined || isNullableString(row.buried_until))
    && isBit(row.leech)
    && (row.in_deck === undefined || isBit(row.in_deck))
    && (row.priority === undefined || (isFiniteNumber(row.priority) && Number.isInteger(row.priority) && row.priority >= 1))
    && typeof row.updated_at === 'string';
}

function validReviewRow(row: unknown, slug: string): boolean {
  return isObject(row) && row.project_id === slug
    && typeof row.id === 'string' && typeof row.card_id === 'string'
    && isFiniteNumber(row.rating) && row.rating >= 1 && row.rating <= 4
    && typeof row.review_time === 'string' && isNullableString(row.section_id);
}

function validScoreRow(row: unknown, slug: string): boolean {
  return isObject(row) && row.project_id === slug
    && typeof row.section_id === 'string'
    && isFiniteNumber(row.correct) && isFiniteNumber(row.attempted)
    && typeof row.updated_at === 'string';
}

function validActivityRow(row: unknown, slug: string): boolean {
  return isObject(row) && row.project_id === slug
    && typeof row.id === 'string' && isNullableString(row.section_id)
    && isFiniteNumber(row.rating) && row.rating >= 1 && row.rating <= 4
    && isBit(row.correct) && typeof row.timestamp === 'string';
}

function validNoteRow(row: unknown, slug: string): boolean {
  return isObject(row) && row.project_id === slug
    && typeof row.id === 'string' && typeof row.text === 'string'
    && typeof row.created_at === 'string';
}

function validHotkeyRow(row: unknown): boolean {
  return isObject(row) && typeof row.action === 'string'
    && typeof row.binding === 'string' && typeof row.context === 'string'
    && isNullableString(row.updated_at);
}

function validRows(value: unknown, predicate: (row: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(predicate);
}

export function validateBackupFile(data: unknown): data is BackupFile {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.version !== 1
    || d.backupType !== 'full'
    || typeof d.exportedAt !== 'string'
    || typeof d.slug !== 'string'
    || !PROJECT_SLUG_PATTERN.test(d.slug)
    || !(d.projectData === null || isObject(d.projectData))
    || !(d.projectConfig === null || isObject(d.projectConfig))) return false;

  return validRows(d.cards, row => validCardRow(row, d.slug as string))
    && validRows(d.review_log, row => validReviewRow(row, d.slug as string))
    && validRows(d.scores, row => validScoreRow(row, d.slug as string))
    && validRows(d.activity, row => validActivityRow(row, d.slug as string))
    && validRows(d.notes, row => validNoteRow(row, d.slug as string))
    && validRows(d.hotkeys, validHotkeyRow);
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let autoSavePending = false;

export function autoSave(slug: string): void {
  if (location.hostname !== 'localhost') return;
  autoSavePending = true;
  if (autoSaveTimer) return; // already debouncing
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    if (!autoSavePending) return;
    autoSavePending = false;
    doAutoSave(slug).catch(() => {});
  }, 30_000);
}

async function doAutoSave(slug: string): Promise<void> {
  const [projectExport, globalExport] = await Promise.all([
    workerApi.exportProjectData(slug),
    workerApi.exportGlobalData(),
  ]);

  let projectData: ProjectData | null = null;
  let projectConfig: Partial<ProjectConfig> | null = null;
  try { const raw = localStorage.getItem(`proj-data-${slug}`); if (raw) projectData = normalizeProjectData(JSON.parse(raw)); } catch { /* */ }
  try { const raw = localStorage.getItem(`proj-config-${slug}`); if (raw) projectConfig = JSON.parse(raw); } catch { /* */ }

  const backup: BackupFile = {
    version: 1,
    backupType: 'full',
    exportedAt: new Date().toISOString(),
    slug,
    projectData,
    projectConfig,
    cards: projectExport.cards,
    review_log: projectExport.review_log,
    scores: projectExport.scores,
    activity: projectExport.activity,
    notes: projectExport.notes,
    hotkeys: globalExport.hotkeys,
  };

  await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, fileName: 'autosave.json', data: backup }),
  });
}

export async function fetchAutosave(slug: string): Promise<BackupFile | null> {
  if (location.hostname !== 'localhost') return null;
  try {
    const res = await fetch(`/api/autosave/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return validateBackupFile(data) && data.slug === slug ? data : null;
  } catch { return null; }
}

export async function downloadBackup(slug: string): Promise<void> {
  await initWorker();

  const [projectExport, globalExport] = await Promise.all([
    workerApi.exportProjectData(slug),
    workerApi.exportGlobalData(),
  ]);

  let projectData: ProjectData | null = null;
  let projectConfig: Partial<ProjectConfig> | null = null;
  try {
    const raw = localStorage.getItem(`proj-data-${slug}`);
    if (raw) projectData = normalizeProjectData(JSON.parse(raw));
  } catch { /* */ }
  try {
    const raw = localStorage.getItem(`proj-config-${slug}`);
    if (raw) projectConfig = JSON.parse(raw);
  } catch { /* */ }

  const backup: BackupFile = {
    version: 1,
    backupType: 'full',
    exportedAt: new Date().toISOString(),
    slug,
    projectData,
    projectConfig,
    cards: projectExport.cards,
    review_log: projectExport.review_log,
    scores: projectExport.scores,
    activity: projectExport.activity,
    notes: projectExport.notes,
    hotkeys: globalExport.hotkeys,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function restoreBackup(data: BackupFile, options: RestoreBackupOptions = {}): Promise<string> {
  if (!validateBackupFile(data)) throw new Error('Invalid backup file');
  await initWorker();

  await workerApi.importProjectData(
    data.slug,
    data.cards,
    data.review_log,
    data.scores,
    data.activity,
    data.notes,
  );
  if (options.includeGlobal !== false) await workerApi.importGlobalData(data.hotkeys);

  // Local projections move only after the canonical database imports succeed.
  if (data.projectData) {
    try { localStorage.setItem(`proj-data-${data.slug}`, JSON.stringify(normalizeProjectData(data.projectData))); } catch { /* */ }
  }
  if (data.projectConfig) {
    try { localStorage.setItem(`proj-config-${data.slug}`, JSON.stringify(data.projectConfig)); } catch { /* */ }
  }

  return data.slug;
}
