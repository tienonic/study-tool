import { createSignal, batch } from 'solid-js';
import { projectRegistry } from '../../projects/registry.ts';
import { loadProject, validateProject, slugify } from '../../projects/loader.ts';
import { normalizeProjectData } from '../../projects/textNormalization.ts';
import { initWorker, workerApi } from '../../core/hooks/useWorker.ts';
import { setAppPhase, setActiveProject, setActiveTab, setHeaderVisible, setActivePanel, setHeaderLocked, setSessionSummary, formatGap, mergedMode } from '../../core/store/app.ts';
import { buildGlossary } from '../glossary/store.ts';
import { loadKeybinds } from '../settings/keybinds.ts';
import { fetchAutosave, restoreBackup } from '../backup/backup.ts';
import { sectionToCardType } from '../quiz/helpers.ts';
import { resolveStudyTab } from '../quiz/merged.ts';
import type { Project, ProjectData } from '../../projects/types.ts';
import type { CardRegistration } from '../../core/workers/protocol.ts';

interface OpenProjectOptions {
  preferredSectionId?: string;
  forceProjectConfig?: boolean;
}

interface RecentProject {
  name: string;
  slug: string;
  timestamp: number;
}

interface ProjectFileSummary {
  file: string;
  name: string;
  modifiedAt?: string;
}

const [isLoading, setIsLoading] = createSignal(false);
const [loadError, setLoadError] = createSignal<string | null>(null);
const [failedSlug, setFailedSlug] = createSignal<string | null>(null);
const autoOpenLastProject = import.meta.env.VITE_STUDY_AUTO_OPEN_LAST_PROJECT === '1';

export { isLoading, loadError, setLoadError, failedSlug, setFailedSlug };

export function getRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem('recent-projects');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addRecentProject(name: string, slug: string) {
  try {
    let list: RecentProject[] = getRecentProjects();
    list = list.filter(p => p.slug !== slug);
    list.unshift({ name, slug, timestamp: Date.now() });
    if (list.length > 10) list = list.slice(0, 10);
    localStorage.setItem('recent-projects', JSON.stringify(list));
  } catch { /* */ }
}

function setLastProject(slug: string) {
  try { localStorage.setItem('last-project', slug); } catch { /* */ }
}

export function getLastProject(): string | null {
  try { return localStorage.getItem('last-project'); } catch { return null; }
}

function saveProjectData(slug: string, data: ProjectData) {
  try { localStorage.setItem(`proj-data-${slug}`, JSON.stringify(normalizeProjectData(data))); } catch { /* */ }
}

export function getProjectData(slug: string): ProjectData | null {
  try {
    const raw = localStorage.getItem(`proj-data-${slug}`);
    return raw ? normalizeProjectData(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function saveProjectConfig(slug: string, config: Partial<Project['config']>) {
  try {
    const existing = getProjectConfig(slug) ?? {};
    localStorage.setItem(`proj-config-${slug}`, JSON.stringify({ ...existing, ...config }));
  } catch {}
}

export function getProjectConfig(slug: string): Partial<Project['config']> | null {
  try {
    const raw = localStorage.getItem(`proj-config-${slug}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function prefersProjectConfig(data: ProjectData) {
  const config = data.config;
  if (!config) return false;
  if (config.prefer_project_config === true) return true;
  if (typeof config.prefer_project_config_until === 'string') {
    const until = Date.parse(config.prefer_project_config_until);
    return Number.isFinite(until) && Date.now() <= until;
  }
  return false;
}

export async function openProject(data: ProjectData, isDefault: boolean, registryFolder?: string, options: OpenProjectOptions = {}) {
  if (isLoading()) return;
  batch(() => { setIsLoading(true); setLoadError(null); });

  try {
    const normalizedData = normalizeProjectData(data);
    const project = loadProject(normalizedData);
    const savedConfig = getProjectConfig(project.slug);
    if (savedConfig && !options.forceProjectConfig && !prefersProjectConfig(data)) {
      Object.assign(project.config, savedConfig);
    }
    if (registryFolder) {
      project.sourceFolder = `src/projects/${registryFolder}`;
    }

    // Ensure worker is initialized before registering cards
    await initWorker();

    // Register cards with SQLite worker
    const cardRegs: CardRegistration[] = [];
    const sectionIds: string[] = [];
    for (const s of project.sections) {
      sectionIds.push(s.id);
      const mcqType = sectionToCardType(s.type);
      for (const id of s.cardIds) {
        cardRegs.push({ sectionId: s.id, cardId: id, cardType: mcqType });
      }
      for (const [index, id] of s.flashCardIds.entries()) {
        cardRegs.push({
          sectionId: s.id,
          cardId: id,
          cardType: 'flashcard',
          priority: s.flashcards?.[index]?.priority,
        });
      }
    }
    // Count canonical rows before registration. Due-state counts are not an emptiness test:
    // a nonempty project may contain only future, suspended, or buried cards.
    const existingCardCount = await workerApi.getProjectCardCount(project.slug);
    await workerApi.loadProject(project.slug, sectionIds, cardRegs);
    await workerApi.setFSRSParams(project.config.desired_retention, project.config.leech_threshold, project.config.max_interval);
    await loadKeybinds();

    // Auto-restore only when the project truly had no canonical card rows before registration.
    if (existingCardCount === 0 && cardRegs.length > 0) {
      const autosave = await fetchAutosave(project.slug);
      if (autosave && autosave.cards.length > 0) {
        await restoreBackup(autosave, { includeGlobal: false });
        await workerApi.loadProject(project.slug, sectionIds, cardRegs);
        await workerApi.setFSRSParams(project.config.desired_retention, project.config.leech_threshold, project.config.max_interval);
      }
    }

    // Persist project data only after async loading succeeds — prevents failed projects
    // from appearing in recent list or being auto-loaded on next startup
    if (!isDefault) saveProjectData(project.slug, normalizedData);
    setLastProject(project.slug);
    addRecentProject(project.name, project.slug);

    batch(() => {
      setHeaderVisible(false);
      setActivePanel(null);
      setHeaderLocked(false);
      setActiveProject(project);
      buildGlossary(project);
      const preferredSection = options.preferredSectionId && project.sections.some(s => s.id === options.preferredSectionId)
        ? options.preferredSectionId
        : null;
      setActiveTab(resolveStudyTab(project, mergedMode(), preferredSection));
      setAppPhase('study');
      setIsLoading(false);
    });

    // Fetch session summary (non-blocking)
    workerApi.getSessionSummary(project.slug).then(summary => {
      if (!summary.lastReviewAt) return;
      const ms = Date.now() - new Date(summary.lastReviewAt).getTime();
      const hours = ms / 3600000;
      if (hours >= 2) {
        setSessionSummary({
          lastReviewAt: summary.lastReviewAt,
          dueNow: summary.dueNow,
          gap: formatGap(summary.lastReviewAt),
        });
      }
    }).catch(() => {});
  } catch (err) {
    batch(() => {
      setLoadError(err instanceof Error ? err.message : 'Failed to load project');
      setIsLoading(false);
    });
  }
}

export async function openRegistryProject(slug: string) {
  const entry = projectRegistry.find(p => p.slug === slug);
  if (!entry) {
    setLoadError('Project not found in registry');
    return;
  }
  try {
    const data = await entry.loader();
    await openProject(data, true, entry.folder);
  } catch (err) {
    setLoadError('Failed to load project: ' + (err instanceof Error ? err.message : String(err)));
  }
}

function isValidProjectFile(file: string) {
  return !!file && !file.includes('/') && !file.includes('\\') && file.toLowerCase().endsWith('.json');
}

async function fetchProjectFileContents(file: string, quiet = false): Promise<string | null> {
  if (!isValidProjectFile(file)) {
    if (!quiet) setLoadError('Invalid project file');
    return null;
  }
  try {
    const response = await fetch(`/__project-file?dir=projects&file=${encodeURIComponent(file)}`);
    const payload = (await response.json()) as { contents?: string; error?: string };
    if (!response.ok || typeof payload.contents !== 'string') {
      if (!quiet) setLoadError(payload.error ?? 'Failed to open project file');
      return null;
    }
    return payload.contents;
  } catch (err) {
    if (!quiet) setLoadError(err instanceof Error ? err.message : 'Failed to open project file');
    return null;
  }
}

async function listLocalProjectFiles(): Promise<ProjectFileSummary[]> {
  try {
    const response = await fetch('/__project-files?dir=projects');
    const payload = (await response.json()) as { files?: ProjectFileSummary[] };
    if (!response.ok || !Array.isArray(payload.files)) return [];
    return payload.files.filter(file => isValidProjectFile(file.file));
  } catch {
    return [];
  }
}

async function findLocalProjectFileBySlug(slug: string): Promise<string | null> {
  const files = await listLocalProjectFiles();
  const found = files.find(file =>
    slugify(file.name) === slug || slugify(file.file.replace(/\.json$/i, '')) === slug
  );
  return found?.file ?? null;
}

async function newestLocalProjectFile(): Promise<string | null> {
  const files = await listLocalProjectFiles();
  files.sort((a, b) => (Date.parse(b.modifiedAt ?? '') || 0) - (Date.parse(a.modifiedAt ?? '') || 0));
  return files[0]?.file ?? null;
}

export async function openProjectFileFromProjects(file: string, options: OpenProjectOptions = {}) {
  const contents = await fetchProjectFileContents(file);
  if (contents === null) return;
  await validateAndOpenFile(contents, options);
}

export async function tryOpenProjectFileFromProjects(file: string, options: OpenProjectOptions = {}): Promise<boolean> {
  const contents = await fetchProjectFileContents(file, true);
  if (contents === null) return false;
  const previousError = loadError();
  setLoadError(null);
  await validateAndOpenFile(contents, options);
  const ok = loadError() === null;
  if (!ok) setLoadError(previousError);
  return ok;
}

async function openRecentProjectAsync(slug: string, quietNotFound = false): Promise<boolean> {
  batch(() => { setLoadError(null); setFailedSlug(null); });
  const entry = projectRegistry.find(p => p.slug === slug);
  if (entry) {
    try {
      const data = await entry.loader();
      await openProject(data, true, entry.folder);
      return loadError() === null;
    } catch {
      batch(() => { setLoadError('Failed to load'); setFailedSlug(slug); });
      return false;
    }
  }

  const localFile = await findLocalProjectFileBySlug(slug);
  if (localFile && await tryOpenProjectFileFromProjects(localFile)) return true;

  const saved = getProjectData(slug);
  if (saved) {
    await openProject(saved, false);
    return loadError() === null;
  }

  if (!quietNotFound) batch(() => { setLoadError('Data not found — re-import file'); setFailedSlug(slug); });
  return false;
}

export function openRecentProject(slug: string) {
  openRecentProjectAsync(slug).catch(() => {});
}

export async function openStartupProject() {
  if (import.meta.env.VITE_STUDY_SINGLE_DECK === '1') {
    const fallback = projectRegistry[0];
    if (fallback) await openRegistryProject(fallback.slug);
    return;
  }

  if (!autoOpenLastProject) return;

  const last = getLastProject();
  if (last && await openRecentProjectAsync(last, true)) return;

  const newestLocal = await newestLocalProjectFile();
  if (newestLocal && await tryOpenProjectFileFromProjects(newestLocal)) return;

  const fallback = projectRegistry[0];
  if (fallback) await openRegistryProject(fallback.slug);
}

export function clearRecentProjects() {
  try { localStorage.removeItem('recent-projects'); } catch { /* */ }
}

export function removeRecentProject(slug: string) {
  try {
    const list = getRecentProjects().filter(p => p.slug !== slug);
    localStorage.setItem('recent-projects', JSON.stringify(list));
  } catch { /* */ }
}

export function goToLauncher() {
  batch(() => { setAppPhase('launcher'); setActiveProject(null); setActiveTab(null); });
}

export async function validateAndOpenFile(jsonStr: string, options: OpenProjectOptions = {}) {
  try {
    const parsed: unknown = JSON.parse(jsonStr);

    // Detect backup files
    const maybeBackup = parsed as Record<string, unknown>;
    if (maybeBackup.version === 1 && maybeBackup.backupType && typeof maybeBackup.slug === 'string' && Array.isArray(maybeBackup.cards)) {
      batch(() => { setIsLoading(true); setLoadError(null); });
      try {
        const { validateBackupFile, restoreBackup } = await import('../backup/backup.ts');
        if (!validateBackupFile(parsed)) {
          batch(() => { setLoadError('Invalid backup file'); setIsLoading(false); });
          return;
        }
        const slug = await restoreBackup(parsed);
        setIsLoading(false);
        openRecentProject(slug);
      } catch (err) {
        batch(() => {
          setLoadError('Failed to restore backup: ' + (err instanceof Error ? err.message : String(err)));
          setIsLoading(false);
        });
      }
      return;
    }

    const data = normalizeProjectData(parsed as ProjectData);
    const errors = validateProject(data);
    if (errors.length > 0) {
      setLoadError('Invalid project: ' + errors.join(', '));
      return;
    }
    await openProject(data, false, undefined, options);
  } catch (err) {
    setLoadError('Failed to parse JSON: ' + (err instanceof Error ? err.message : String(err)));
  }
}
