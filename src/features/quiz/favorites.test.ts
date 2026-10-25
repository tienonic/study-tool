import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('flashcard favorites', () => {
  it('persists favorites per project and card', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    });
    const favorites = await import('./favorites.ts');

    expect(favorites.isFavorite('russian', 'card-1')).toBe(false);
    expect(favorites.toggleFavorite('russian', 'card-1')).toBe(true);
    expect(favorites.isFavorite('russian', 'card-1')).toBe(true);
    expect(favorites.isFavorite('another-project', 'card-1')).toBe(false);
    expect(favorites.toggleFavorite('russian', 'card-1')).toBe(false);
    expect(favorites.isFavorite('russian', 'card-1')).toBe(false);
  });

  it('ignores malformed stored data without breaking study', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => '{broken'),
      setItem: vi.fn(),
    });
    const favorites = await import('./favorites.ts');

    expect(favorites.isFavorite('russian', 'card-1')).toBe(false);
    expect(favorites.toggleFavorite('russian', 'card-1')).toBe(true);
  });
});
