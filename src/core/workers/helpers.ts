import type { Card } from 'ts-fsrs';

export function formatInterval(days: number): string {
  if (days < 1 / 24) return Math.max(1, Math.round(days * 24 * 60)) + 'm';
  if (days < 1) return Math.round(days * 24) + 'h';
  if (days < 30) return Math.round(days) + 'd';
  if (days < 365) return Math.round(days / 30) + 'mo';
  return (days / 365).toFixed(1).replace(/\.0$/, '') + 'y';
}

export function isLeech(lapses: number, threshold: number): boolean {
  if (lapses < threshold) return false;
  return (lapses - threshold) % Math.ceil(threshold / 2) === 0;
}

export function cardToFSRS(row: Record<string, unknown>): Card {
  return {
    due: new Date(row.due as string),
    stability: row.stability as number,
    difficulty: row.difficulty as number,
    elapsed_days: row.elapsed_days as number,
    scheduled_days: row.scheduled_days as number,
    learning_steps: typeof row.learning_steps === 'number' ? row.learning_steps : 0,
    reps: row.reps as number,
    lapses: row.lapses as number,
    state: row.fsrs_state as number,
    last_review: row.last_review ? new Date(row.last_review as string) : undefined,
  } as Card;
}

export function newTodayKey(projectId: string, sectionIds: string[], cardType?: string): string {
  return projectId + '|' + sectionIds.join(',') + '|' + (cardType ?? '');
}

export function uuidv7(): string {
  const now = Date.now();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
