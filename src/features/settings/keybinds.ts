import { createSignal } from 'solid-js';
import { workerApi } from '../../core/hooks/useWorker.ts';

export type KeyAction =
  | 'answer1' | 'answer2' | 'answer3' | 'answer4'
  | 'skip' | 'undo' | 'suspend' | 'bury'
  | 'viewImage' | 'copyCard' | 'goBack' | 'forward'
  | 'flipCard' | 'flipAlt' | 'flashAgain' | 'flashGood'
  | 'replayPronunciation'
  | 'note' | 'mathSubmit';

export interface Binding {
  key: string;
  code?: string;
  label: string;
}

type KeybindMap = Record<KeyAction, Binding>;

export type KeyContext = 'global' | 'mcq' | 'flashcard' | 'math';

export const ACTION_META: Record<KeyAction, { name: string; context: KeyContext }> = {
  answer1:   { name: 'Answer/rate 1', context: 'mcq' },
  answer2:   { name: 'Answer/rate 2', context: 'mcq' },
  answer3:   { name: 'Answer/rate 3', context: 'mcq' },
  answer4:   { name: 'Answer/rate 4', context: 'mcq' },
  skip:      { name: 'Skip',          context: 'mcq' },
  undo:      { name: 'Undo',          context: 'mcq' },
  suspend:   { name: 'Suspend',       context: 'mcq' },
  bury:      { name: 'Bury',          context: 'mcq' },
  viewImage: { name: 'View image',    context: 'mcq' },
  copyCard:  { name: 'Copy card',     context: 'global' },
  goBack:    { name: 'Go back',       context: 'mcq' },
  forward:   { name: 'Forward',       context: 'mcq' },
  flipCard:  { name: 'Flip card',     context: 'flashcard' },
  flipAlt:   { name: 'Flip (alt)',    context: 'flashcard' },
  flashAgain:{ name: 'Again',         context: 'flashcard' },
  flashGood: { name: 'Good',          context: 'flashcard' },
  replayPronunciation: { name: 'Play pronunciation', context: 'flashcard' },
  note:      { name: 'Open note',     context: 'global' },
  mathSubmit:{ name: 'Skip / next',   context: 'math' },
};

export const DEFAULT_KEYBINDS: KeybindMap = {
  answer1:    { key: '1', label: '1' },
  answer2:    { key: '2', label: '2' },
  answer3:    { key: '3', label: '3' },
  answer4:    { key: '4', label: '4' },
  skip:       { key: ' ', code: 'Space', label: 'Space' },
  undo:       { key: 'z', label: 'Z' },
  suspend:    { key: 's', label: 'S' },
  bury:       { key: 'b', label: 'B' },
  viewImage:  { key: 'r', label: 'R' },
  copyCard:   { key: 'c', label: 'C' },
  goBack:     { key: 'a', label: 'A' },
  forward:    { key: 'd', label: 'D' },
  flipCard:   { key: 'Space', code: 'Space', label: 'Space' },
  flipAlt:    { key: 'f', label: 'F' },
  flashAgain: { key: '1', label: '1' },
  flashGood:  { key: '2', label: '2' },
  replayPronunciation: { key: 'p', label: 'P' },
  note:       { key: '/', label: '/' },
  mathSubmit: { key: 'd', label: 'D' },
};

function cloneDefaults(): KeybindMap {
  return structuredClone(DEFAULT_KEYBINDS);
}

const [keybinds, setKeybinds] = createSignal<KeybindMap>(cloneDefaults());

export { keybinds };

export function getLabel(action: KeyAction): string {
  return keybinds()[action].label;
}

export function matchesKey(e: KeyboardEvent, action: KeyAction): boolean {
  const b = keybinds()[action];
  if (b.code && e.code === b.code) return true;
  return e.key.toLowerCase() === b.key.toLowerCase();
}

export async function loadKeybinds(): Promise<void> {
  try {
    const rows = await workerApi.getHotkeys();
    if (!rows || rows.length === 0) return;
    const map = cloneDefaults();
    for (const row of rows) {
      const action = row.action as KeyAction;
      if (!(action in DEFAULT_KEYBINDS)) continue;
      try {
        const parsed = JSON.parse(row.binding) as Binding;
        if (parsed && typeof parsed.key === 'string' && typeof parsed.label === 'string') {
          map[action] = parsed;
        }
      } catch {
        // Skip malformed binding row; leave default for this action
      }
    }
    setKeybinds(map);
  } catch {
    // Use defaults on error
  }
}

export async function setKeybind(action: KeyAction, binding: Binding): Promise<void> {
  const map = { ...keybinds() };
  map[action] = binding;
  setKeybinds(map);
  try {
    const context = ACTION_META[action].context;
    await workerApi.setHotkey(action, JSON.stringify(binding), context);
  } catch {
    // Local state already updated; DB persistence failure is non-critical
  }
}

export async function resetKeybinds(): Promise<void> {
  setKeybinds(cloneDefaults());
  try {
    const actions = Object.keys(DEFAULT_KEYBINDS) as KeyAction[];
    await Promise.all(actions.map(action =>
      workerApi.setHotkey(action, JSON.stringify(DEFAULT_KEYBINDS[action]), ACTION_META[action].context)
    ));
  } catch {
    // Local state already reset; DB persistence failure is non-critical
  }
}

/** Find action that uses the same key in the same or overlapping context */
export function findConflict(action: KeyAction, binding: Binding): KeyAction | null {
  const map = keybinds();
  const ctx = ACTION_META[action].context;
  for (const k of Object.keys(map) as KeyAction[]) {
    if (k === action) continue;
    const otherCtx = ACTION_META[k].context;
    // Only conflict if same context or either is global
    if (ctx !== otherCtx && ctx !== 'global' && otherCtx !== 'global') continue;
    const b = map[k];
    if (binding.code && b.code && binding.code === b.code) return k;
    if (binding.key.toLowerCase() === b.key.toLowerCase()) return k;
  }
  return null;
}

export const CONTEXT_LABELS: Record<KeyContext, string> = {
  global: 'Global',
  mcq: 'MCQ / quiz',
  flashcard: 'Flashcard',
  math: 'Math',
};

export function keyToLabel(key: string, code?: string): string {
  if (code === 'Space' || key === ' ') return 'Space';
  if (key === 'ArrowRight') return '\u2192';
  if (key === 'ArrowLeft') return '\u2190';
  if (key === 'ArrowUp') return '\u2191';
  if (key === 'ArrowDown') return '\u2193';
  if (key === 'Enter') return 'Enter';
  if (key === 'Escape') return 'Esc';
  if (key === 'Backspace') return 'Bksp';
  if (key === 'Tab') return 'Tab';
  if (key.length === 1) return key.toUpperCase();
  return key;
}
