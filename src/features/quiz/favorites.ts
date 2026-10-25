import { createSignal } from 'solid-js';

const STORAGE_KEY = 'study-tool-card-favorites-v1';
const [favoriteRevision, setFavoriteRevision] = createSignal(0);

function favoriteKey(projectSlug: string, cardId: string): string {
  return JSON.stringify([projectSlug, cardId]);
}

function readFavorites(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

function writeFavorites(favorites: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites].sort()));
  } catch {
    // Studying must keep working when storage is unavailable.
  }
}

export function isFavorite(projectSlug: string | undefined, cardId: string | null): boolean {
  favoriteRevision();
  if (!projectSlug || !cardId) return false;
  return readFavorites().has(favoriteKey(projectSlug, cardId));
}

export function toggleFavorite(projectSlug: string | undefined, cardId: string | null): boolean {
  if (!projectSlug || !cardId) return false;
  const favorites = readFavorites();
  const key = favoriteKey(projectSlug, cardId);
  const next = !favorites.has(key);
  if (next) favorites.add(key);
  else favorites.delete(key);
  writeFavorites(favorites);
  setFavoriteRevision(value => value + 1);
  return next;
}
