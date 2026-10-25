import { createSignal } from 'solid-js';

const STORAGE_KEY = 'mixed-prompt-sides';

function readStoredSetting(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

const [mixedPromptSides, setMixedPromptSidesSignal] = createSignal(readStoredSetting());

export { mixedPromptSides };

export function setMixedPromptSides(enabled: boolean): void {
  setMixedPromptSidesSignal(enabled);
  try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* */ }
}
