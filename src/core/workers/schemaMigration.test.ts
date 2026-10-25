import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs';
import { Factory, type SQLiteAPI } from 'wa-sqlite';
import type { WorkerContext } from './workerContext.ts';
import { migrateToV3, migrateToV4 } from './schema.ts';
import { loadProject } from './handlers/project.ts';
import { countDue } from './handlers/card.ts';
import { getDeckStats } from './handlers/stats.ts';
import { releaseExpiredBuried } from './burial.ts';

const V2_SCHEMA = `
CREATE TABLE cards (
  card_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, section_id TEXT NOT NULL,
  card_type TEXT NOT NULL, fsrs_state INTEGER DEFAULT 0, due TEXT,
  stability REAL DEFAULT 0, difficulty REAL DEFAULT 0, elapsed_days INTEGER DEFAULT 0,
  scheduled_days INTEGER DEFAULT 0, reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0,
  last_review TEXT, suspended INTEGER DEFAULT 0, buried INTEGER DEFAULT 0,
  leech INTEGER DEFAULT 0, updated_at TEXT
);
CREATE INDEX idx_cards_due ON cards(due);
CREATE INDEX idx_cards_section ON cards(section_id);
CREATE INDEX idx_cards_project ON cards(project_id);
CREATE TABLE review_log (id TEXT PRIMARY KEY, card_id TEXT NOT NULL, project_id TEXT NOT NULL, rating INTEGER NOT NULL, review_time TEXT NOT NULL, section_id TEXT);
CREATE TABLE scores (project_id TEXT NOT NULL, section_id TEXT NOT NULL, correct INTEGER DEFAULT 0, attempted INTEGER DEFAULT 0, updated_at TEXT, PRIMARY KEY(project_id, section_id));
CREATE TABLE activity (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, section_id TEXT, rating INTEGER NOT NULL, correct INTEGER NOT NULL, timestamp TEXT NOT NULL);
CREATE TABLE notes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT);
CREATE TABLE hotkeys (action TEXT PRIMARY KEY, binding TEXT NOT NULL, context TEXT NOT NULL, updated_at TEXT);
CREATE TABLE undo_stack (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL, prev_state TEXT NOT NULL, created_at TEXT);
CREATE TABLE daily_new (project_id TEXT NOT NULL, date TEXT NOT NULL, key TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(project_id, date, key));
PRAGMA user_version = 2;
`;

async function rows(sqlite: SQLiteAPI, db: number, sql: string, params: unknown[] = []) {
  const result = await sqlite.execWithParams(db, sql, params);
  if (!result.rows) return [];
  return result.rows.map(row => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
}

async function tableCounts(sqlite: SQLiteAPI, db: number, tables: string[]) {
  const counts: Record<string, unknown> = {};
  for (const table of tables) {
    counts[table] = (await rows(sqlite, db, `SELECT COUNT(*) AS count FROM ${table}`))[0].count;
  }
  return counts;
}

describe('transactional v2 to current study-memory migration', () => {
  let sqlite: SQLiteAPI;
  let db: number;

  beforeEach(async () => {
    const wasmBinary = new Uint8Array(readFileSync(resolve(process.cwd(), 'node_modules/wa-sqlite/dist/wa-sqlite.wasm')));
    sqlite = Factory(await SQLiteESMFactory({ wasmBinary }));
    db = await sqlite.open_v2(`migration-${crypto.randomUUID()}`);
    await sqlite.exec(db, V2_SCHEMA);
    await sqlite.run(db, `INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'same-card', 'project-a', 'old-sec', 'mcq', 2, '2026-07-15T00:00:00.000Z',
      4.5, 5.5, 2, 7, 3, 1, '2026-07-14T00:00:00.000Z', 0, 0, 0, '2026-07-14 00:00:00',
    ]);
    await sqlite.run(db, `INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'stale-card', 'project-a', 'old-sec', 'mcq', 0, '2026-07-16T00:00:00.000Z',
      0, 0, 0, 0, 0, 0, null, 0, null, 0, '2026-07-15 08:00:00',
    ]);
    await sqlite.run(db, `INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      'buried-card', 'project-a', 'old-sec', 'mcq', 0, '2026-07-16T00:00:00.000Z',
      0, 0, 0, 0, 0, 0, null, 0, 1, 0, '2026-07-15 08:00:00',
    ]);
    await sqlite.run(db, `INSERT INTO review_log VALUES ('review-1','same-card','project-a',3,'2026-07-14T00:00:00.000Z','old-sec')`);
    await sqlite.run(db, `INSERT INTO scores VALUES ('project-a','old-sec',1,1,'2026-07-14T00:00:00.000Z')`);
    await sqlite.run(db, `INSERT INTO activity VALUES ('activity-1','project-a','old-sec',3,1,'2026-07-14T00:00:00.000Z')`);
    await sqlite.run(db, `INSERT INTO notes VALUES ('note-1','project-a','keep me','2026-07-14T00:00:00.000Z')`);
    await sqlite.run(db, `INSERT INTO hotkeys VALUES ('answer','Space','global','2026-07-14T00:00:00.000Z')`);
    await sqlite.run(db, `INSERT INTO undo_stack (card_id,prev_state,created_at) VALUES ('same-card','{}','2026-07-14T00:00:00.000Z')`);
    await sqlite.run(db, `INSERT INTO daily_new VALUES ('project-a','2026-07-16','project-a|old-sec|quiz',2)`);
  });

  afterEach(async () => {
    if (sqlite && db !== undefined) await sqlite.close(db);
  });

  it('preserves durable rows, enables duplicate visible IDs, reconciles membership, and expires burial by local date', async () => {
    const durableTables = ['cards', 'review_log', 'scores', 'activity', 'notes', 'hotkeys', 'daily_new'];
    const before = await tableCounts(sqlite, db, durableTables);

    await sqlite.exec(db, 'BEGIN');
    await migrateToV3(sqlite, db);
    await migrateToV4(sqlite, db);
    await sqlite.exec(db, 'PRAGMA user_version = 4');
    await sqlite.exec(db, 'COMMIT');

    const after = await tableCounts(sqlite, db, durableTables);
    expect(after).toEqual(before);
    expect((await rows(sqlite, db, 'SELECT COUNT(*) AS count FROM undo_stack'))[0].count).toBe(0);

    const cardColumns = await rows(sqlite, db, 'PRAGMA table_info(cards)');
    expect(cardColumns.find(column => column.name === 'project_id')?.pk).toBe(1);
    expect(cardColumns.find(column => column.name === 'card_id')?.pk).toBe(2);
    expect(cardColumns.some(column => column.name === 'in_deck')).toBe(true);
    expect(cardColumns.some(column => column.name === 'buried_until')).toBe(true);
    expect(cardColumns.some(column => column.name === 'priority')).toBe(true);
    expect(cardColumns.some(column => column.name === 'learning_steps')).toBe(true);

    const run = (sql: string, params: unknown[] = []) => sqlite.run(db, sql, params);
    const queryAll = (sql: string, params: unknown[] = []) => rows(sqlite, db, sql, params);
    const queryOne = async (sql: string, params: unknown[] = []) => (await rows(sqlite, db, sql, params))[0] ?? null;
    const ctx = {
      run, queryAll, queryOne,
      checkNewDay: async () => {},
      getNewTodayCount: async () => 0,
      incrementNewToday: async () => {},
    } as unknown as WorkerContext;

    await loadProject(ctx, 'project-a', ['new-sec'], [
      { sectionId: 'new-sec', cardId: 'same-card', cardType: 'flashcard', priority: 2 },
      { sectionId: 'new-sec', cardId: 'new-card', cardType: 'flashcard' },
    ]);
    await loadProject(ctx, 'project-b', ['new-sec'], [
      { sectionId: 'new-sec', cardId: 'same-card', cardType: 'flashcard' },
    ]);

    const projectACards = await rows(sqlite, db, `SELECT * FROM cards WHERE project_id = 'project-a' ORDER BY card_id`);
    expect(projectACards).toHaveLength(4);
    expect(projectACards.find(card => card.card_id === 'stale-card')?.in_deck).toBe(0);
    expect(projectACards.find(card => card.card_id === 'stale-card')?.buried).toBe(0);
    expect(projectACards.find(card => card.card_id === 'same-card')).toMatchObject({
      in_deck: 1, section_id: 'new-sec', card_type: 'flashcard', priority: 2,
      stability: 4.5, learning_steps: 0, reps: 3,
    });
    expect((await rows(sqlite, db, `SELECT COUNT(*) AS count FROM cards WHERE card_id = 'same-card'`))[0].count).toBe(2);

    await expect(countDue(ctx, 'project-a', ['new-sec'], 'flashcard')).resolves.toEqual({ due: 1, newCount: 1, total: 2 });
    await expect(getDeckStats(ctx, 'project-a')).resolves.toEqual({ new: 1, learning: 0, due: 1 });

    await run(`UPDATE cards SET buried = 1, buried_until = '2026-07-17' WHERE project_id = 'project-a' AND card_id = 'same-card'`);
    await releaseExpiredBuried(ctx, '2026-07-16');
    expect((await queryOne(`SELECT buried FROM cards WHERE project_id = 'project-a' AND card_id = 'same-card'`))?.buried).toBe(1);
    await releaseExpiredBuried(ctx, '2026-07-17');
    expect(await queryOne(`SELECT buried, buried_until FROM cards WHERE project_id = 'project-a' AND card_id = 'same-card'`)).toMatchObject({ buried: 0, buried_until: null });
  });

  it('rolls the entire schema and data back when a later migration statement fails', async () => {
    await sqlite.exec(db, 'BEGIN');
    try {
      await migrateToV3(sqlite, db);
      await migrateToV4(sqlite, db);
      await sqlite.exec(db, 'SELECT * FROM intentionally_missing_table');
      await sqlite.exec(db, 'PRAGMA user_version = 4');
      await sqlite.exec(db, 'COMMIT');
      throw new Error('Expected the injected migration failure');
    } catch {
      await sqlite.exec(db, 'ROLLBACK');
    }

    expect((await rows(sqlite, db, 'PRAGMA user_version'))[0].user_version).toBe(2);
    const columns = await rows(sqlite, db, 'PRAGMA table_info(cards)');
    expect(columns.some(column => column.name === 'in_deck')).toBe(false);
    expect((await rows(sqlite, db, 'SELECT COUNT(*) AS count FROM cards'))[0].count).toBe(3);
    expect((await rows(sqlite, db, `SELECT stability FROM cards WHERE card_id = 'same-card'`))[0].stability).toBe(4.5);
  });
});
