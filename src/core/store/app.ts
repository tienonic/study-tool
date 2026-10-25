import { createSignal } from 'solid-js';
import type { Project } from '../../projects/types.ts';

type AppPhase = 'launcher' | 'study';

function readLocalBool(key: string, defaultVal: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return defaultVal;
    return v !== 'false';
  } catch { return defaultVal; }
}

const [appPhase, setAppPhase] = createSignal<AppPhase>('launcher');
const [activeProject, setActiveProject] = createSignal<Project | null>(null);
const [activeTab, setActiveTab] = createSignal<string | null>(null);
const [studyView, setStudyView] = createSignal<'drill' | 'workbook' | 'map'>(
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'map' ? 'map'
    : typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('view') === 'workbook' || new URLSearchParams(window.location.search).has('learningFile')) ? 'workbook' : 'drill',
);
export { studyView, setStudyView };
const [easyMode, setEasyMode] = createSignal(readLocalBool('easy-mode', true));
const [zenMode, setZenMode] = createSignal(readLocalBool('zen-mode', false));
const [syncActivity, setSyncActivity] = createSignal(readLocalBool('sync-activity', true));
const [noteBoxVisible, setNoteBoxVisible] = createSignal(false);
const [headerVisible, setHeaderVisible] = createSignal(false);
const [termsOpen, setTermsOpen] = createSignal(false);
const [headerLocked, setHeaderLocked] = createSignal(false);
const [activePanel, setActivePanel] = createSignal<'activity' | 'ai' | 'settings' | 'keybinds' | 'tips' | null>(null);
const [sessionSummary, setSessionSummary] = createSignal<{ lastReviewAt: string; dueNow: number; gap: string } | null>(null);
const [graphVisible, setGraphVisible] = createSignal(readLocalBool('graph-visible', true));
const [termsVisible, setTermsVisible] = createSignal(readLocalBool('terms-visible', true));
const [mergedMode, setMergedMode] = createSignal(readLocalBool('merged-mode', false));
const [copiedFlash, setCopiedFlash] = createSignal(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
function flashCopied() { clearTimeout(copiedTimer); setCopiedFlash(true); copiedTimer = setTimeout(() => setCopiedFlash(false), 600); }

const [sidebarOffsetY, setSidebarOffsetY] = createSignal(
  (() => { try { return parseInt(localStorage.getItem('sidebar-offset-y') || '0', 10) || 0; } catch { return 0; } })()
);

function formatGap(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export {
  appPhase, setAppPhase,
  activeProject, setActiveProject,
  activeTab, setActiveTab,
  easyMode,
  zenMode,
  syncActivity,
  noteBoxVisible, setNoteBoxVisible,
  headerVisible, setHeaderVisible,
  termsOpen, setTermsOpen,
  headerLocked, setHeaderLocked,
  activePanel, setActivePanel,
  sessionSummary, setSessionSummary,
  graphVisible, setGraphVisible,
  termsVisible, setTermsVisible,
  mergedMode, setMergedMode,
  sidebarOffsetY, setSidebarOffsetY,
  copiedFlash, flashCopied,
  formatGap,
};

export function toggleEasyMode() {
  const next = !easyMode();
  setEasyMode(next);
  try { localStorage.setItem('easy-mode', String(next)); } catch { /* */ }
}

export function toggleZenMode() {
  const next = !zenMode();
  setZenMode(next);
  try { localStorage.setItem('zen-mode', String(next)); } catch { /* */ }
  if (next) {
    document.documentElement.requestFullscreen?.();
  } else {
    if (document.fullscreenElement) document.exitFullscreen?.();
  }
}

export function toggleSyncActivity() {
  const next = !syncActivity();
  setSyncActivity(next);
  try { localStorage.setItem('sync-activity', String(next)); } catch { /* */ }
}

export function toggleGraphVisible() {
  const next = !graphVisible();
  setGraphVisible(next);
  try { localStorage.setItem('graph-visible', String(next)); } catch { /* */ }
}

export function toggleMergedMode() {
  const next = !mergedMode();
  setMergedMode(next);
  try { localStorage.setItem('merged-mode', String(next)); } catch { /* */ }
}

export function toggleTermsVisible() {
  const next = !termsVisible();
  setTermsVisible(next);
  try { localStorage.setItem('terms-visible', String(next)); } catch { /* */ }
}
