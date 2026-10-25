import type { FSRS, Card } from 'ts-fsrs';

export interface WorkerContext {
  run: (sql: string, params?: unknown[]) => Promise<void>;
  queryAll: (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  queryOne: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null>;
  fsrsEngine: () => FSRS;
  leechThreshold: () => number;
  initFSRS: (retention?: number, threshold?: number, maxInterval?: number) => void;
  uuidv7: () => string;
  cardToFSRS: (row: Record<string, unknown>) => Card;
  saveCardFromFSRS: (projectId: string, cardId: string, card: Card, lapses?: number) => Promise<void>;
  checkNewDay: () => Promise<void>;
  getNewTodayCount: (projectId: string, key: string) => Promise<number>;
  incrementNewToday: (projectId: string, key: string) => Promise<void>;
}
