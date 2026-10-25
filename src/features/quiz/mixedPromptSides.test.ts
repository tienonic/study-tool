import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('mixed prompt-side setting', () => {
  it('persists without changing the active card itself', async () => {
    const values = new Map([['mixed-prompt-sides', 'true']]);
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    };
    vi.stubGlobal('localStorage', storage);

    const setting = await import('./mixedPromptSides.ts');
    expect(setting.mixedPromptSides()).toBe(true);

    setting.setMixedPromptSides(false);

    expect(setting.mixedPromptSides()).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith('mixed-prompt-sides', 'false');
  });
});
