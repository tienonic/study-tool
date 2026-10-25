import type { WorkerMessage, WorkerRequest, WorkerResponse } from './protocol.ts';
import {
  fsrs,
  generatorParameters,
  type FSRS,
  type Card,
} from 'ts-fsrs';
import { cardToFSRS, uuidv7 } from './helpers.ts';
import type { WorkerContext } from './workerContext.ts';
import { localDateKey, releaseExpiredBuried } from './burial.ts';
import { SCHEMA, SCHEMA_VERSION, migrateToV3, migrateToV4 } from './schema.ts';

// Handler imports
import * as cardH from './handlers/card.ts';
import * as scoreH from './handlers/score.ts';
import * as activityH from './handlers/activity.ts';
import * as statsH from './handlers/stats.ts';
import * as importExportH from './handlers/importExport.ts';
import * as miscH from './handlers/misc.ts';
import * as projectH from './handlers/project.ts';

import type { SQLiteAPI } from 'wa-sqlite';

// wa-sqlite state
let db: number = 0;
let sqlite3: SQLiteAPI | null = null;
let lastBurialCheckDate: string | null = null;

const migrations: Record<number, () => Promise<void>> = {
  2: async () => {
    await sqlite3!.exec(db, `
      CREATE TABLE IF NOT EXISTS daily_new (
        project_id TEXT NOT NULL,
        date TEXT NOT NULL,
        key TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (project_id, date, key)
      );
    `);
  },
  3: async () => migrateToV3(sqlite3!, db),
  4: async () => migrateToV4(sqlite3!, db),
};

async function applyMigrations() {
  const rows: unknown[][] = [];
  await sqlite3!.exec(db, 'PRAGMA user_version', (row: unknown[]) => rows.push(row));
  const currentVersion = rows.length > 0 ? (rows[0][0] as number) : 0;

  if (currentVersion === SCHEMA_VERSION) return;

  if (currentVersion === 0) {
    const statements = SCHEMA.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await sqlite3!.exec(db, stmt + ';');
    }
    await sqlite3!.exec(db, `PRAGMA user_version = ${SCHEMA_VERSION}`);
    return;
  }

  for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new Error(`Missing migration for version ${v}`);
    await sqlite3!.exec(db, 'BEGIN');
    try {
      await migrate();
      await sqlite3!.exec(db, `PRAGMA user_version = ${v}`);
      await sqlite3!.exec(db, 'COMMIT');
    } catch (err) {
      await sqlite3!.exec(db, 'ROLLBACK');
      throw err;
    }
  }
}

// FSRS state
let fsrsEngine: FSRS | null = null;
let leechThreshold = 8;

function initFSRS(retention = 0.9, threshold = 8, maxInterval = 36500) {
  const params = generatorParameters({
    request_retention: retention,
    enable_short_term: true,
    maximum_interval: maxInterval,
  });
  fsrsEngine = fsrs(params);
  leechThreshold = threshold;
}

// DB helpers
async function run(sql: string, params?: unknown[]) {
  await sqlite3!.run(db, sql, params ?? null);
}

async function queryAll(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
  const result = await sqlite3!.execWithParams(db, sql, params ?? null);
  if (!result.rows || result.rows.length === 0) return [];
  const { columns, rows } = result;
  return rows.map((row: unknown[]) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i];
    }
    return obj;
  });
}

async function queryOne(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
  const rows = await queryAll(sql, params);
  return rows[0] ?? null;
}

async function saveCardFromFSRS(projectId: string, cardId: string, card: Card, lapses?: number) {
  await run(
    `UPDATE cards SET fsrs_state = ?, due = ?, stability = ?, difficulty = ?,
     elapsed_days = ?, scheduled_days = ?, learning_steps = ?, reps = ?, lapses = COALESCE(?, lapses),
     last_review = ?, updated_at = datetime('now')
     WHERE project_id = ? AND card_id = ? AND in_deck = 1`,
    [
      card.state, card.due.toISOString(), card.stability, card.difficulty,
      card.elapsed_days, card.scheduled_days, card.learning_steps, card.reps,
      lapses ?? null,
      card.last_review ? card.last_review.toISOString() : null,
      projectId, cardId,
    ]
  );
}

async function checkNewDay() {
  const today = localDateKey();
  if (lastBurialCheckDate === today) return;
  await releaseExpiredBuried(getContext(), today);
  lastBurialCheckDate = today;
}

async function getNewTodayCount(projectId: string, key: string): Promise<number> {
  const today = localDateKey();
  const row = await queryOne(
    `SELECT count FROM daily_new WHERE project_id = ? AND date = ? AND key = ?`,
    [projectId, today, key]
  );
  return row ? (row.count as number) : 0;
}

async function incrementNewToday(projectId: string, key: string): Promise<void> {
  const today = localDateKey();
  await run(
    `INSERT INTO daily_new (project_id, date, key, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(project_id, date, key) DO UPDATE SET count = count + 1`,
    [projectId, today, key]
  );
}

// Build context for handler modules
function getContext(): WorkerContext {
  return {
    run,
    queryAll,
    queryOne,
    fsrsEngine: () => { if (!fsrsEngine) initFSRS(); return fsrsEngine!; },
    leechThreshold: () => leechThreshold,
    initFSRS,
    uuidv7,
    cardToFSRS,
    saveCardFromFSRS,
    checkNewDay,
    getNewTodayCount,
    incrementNewToday,
  };
}

async function handleMessage(request: WorkerRequest): Promise<unknown> {
  const ctx = getContext();

  if (request.type !== 'INIT') await checkNewDay();

  switch (request.type) {
    case 'INIT': {
      const SQLiteESMFactory = (await import('wa-sqlite/dist/wa-sqlite-async.mjs')).default;
      const { IDBBatchAtomicVFS } = await import('wa-sqlite/src/examples/IDBBatchAtomicVFS.js');
      const { Factory } = await import('wa-sqlite');

      const module = await SQLiteESMFactory({
        locateFile: (file: string) => '/' + file,
      });
      sqlite3 = Factory(module);

      const vfs = new IDBBatchAtomicVFS('study-tool-db');
      sqlite3!.vfs_register(vfs, true);
      db = await sqlite3!.open_v2('study-tool.db');

      await applyMigrations();

      if (navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
      }

      initFSRS();
      await checkNewDay();
      return { ok: true };
    }

    case 'LOAD_PROJECT': {
      const { projectId, sectionIds, cardIds } = request;
      return projectH.loadProject(ctx, projectId, sectionIds, cardIds);
    }

    // Card scheduling / FSRS
    case 'PICK_NEXT': return cardH.pickNext(ctx, request.projectId, request.sectionIds, request.newPerSession, request.cardType, request.quotaKey, request.studyGoal);
    case 'PICK_NEXT_OVERRIDE': return cardH.pickNextOverride(ctx, request.projectId, request.sectionIds, request.cardType, request.excludeIds);
    case 'RESET_NEW_COUNT': return cardH.resetNewCount(ctx, request.projectId, request.sectionIds, request.cardType, request.quotaKey);
    case 'PREVIEW_RATINGS': return cardH.previewRatings(ctx, request.projectId, request.cardId);
    case 'REVIEW_CARD': return cardH.reviewCard(ctx, request.cardId, request.projectId, request.sectionId, request.rating, request.quotaKey);
    case 'UNDO_REVIEW': return cardH.undoReview(ctx, request.projectId, request.expectedCardId);
    case 'SUSPEND_CARD': return cardH.suspendCard(ctx, request.projectId, request.cardId);
    case 'BURY_CARD': return cardH.buryCard(ctx, request.projectId, request.cardId);
    case 'UNBURY_ALL': return cardH.unburyAll(ctx, request.projectId);
    case 'COUNT_DUE': return cardH.countDue(ctx, request.projectId, request.sectionIds, request.cardType);

    // Scores
    case 'UPDATE_SCORE': return scoreH.updateScore(ctx, request.projectId, request.sectionId, request.correct);
    case 'GET_SCORES': return scoreH.getScores(ctx, request.projectId);
    case 'RESET_SECTION': return scoreH.resetSection(ctx, request.projectId, request.sectionId);

    // Activity
    case 'ADD_ACTIVITY': return activityH.addActivity(ctx, request.projectId, request.sectionId, request.rating, request.correct);
    case 'GET_ACTIVITY': return activityH.getActivity(ctx, request.projectId, request.limit);
    case 'CLEAR_ACTIVITY': return activityH.clearActivity(ctx, request.projectId);

    // Stats
    case 'GET_DECK_STATS': return statsH.getDeckStats(ctx, request.projectId);
    case 'GET_PROJECT_CARD_COUNT': return statsH.getProjectCardCount(ctx, request.projectId);
    case 'GET_SECTION_STATS': return statsH.getSectionStats(ctx, request.projectId);
    case 'GET_SESSION_SUMMARY': return statsH.getSessionSummary(ctx, request.projectId);
    case 'GET_REVIEW_LOG': return statsH.getReviewLog(ctx, request.projectId, request.limit);
    case 'GET_PERFORMANCE_CARDS': return statsH.getPerformanceCards(ctx, request.projectId);
    case 'GET_ALL_PROJECT_IDS': return statsH.getAllProjectIds(ctx);
    case 'GET_RETENTION': return statsH.getRetention(ctx, request.projectId);
    case 'GET_STUDY_PROGRESS': return statsH.getStudyProgress(ctx, request.projectId, request.desiredRetention, request.quotaKey);

    // Import/Export
    case 'EXPORT_PROJECT_DATA': return importExportH.exportProjectData(ctx, request.projectId);
    case 'EXPORT_GLOBAL_DATA': return importExportH.exportGlobalData(ctx);
    case 'IMPORT_PROJECT_DATA': return importExportH.importProjectData(ctx, request.projectId, request.cards, request.review_log, request.scores, request.activity, request.notes);
    case 'IMPORT_GLOBAL_DATA': return importExportH.importGlobalData(ctx, request.hotkeys);
    case 'DELETE_PROJECT': return importExportH.deleteProject(ctx, request.projectId);

    // Misc
    case 'ADD_NOTE': return miscH.addNote(ctx, request.projectId, request.text);
    case 'GET_HOTKEYS': return miscH.getHotkeys(ctx);
    case 'SET_HOTKEY': return miscH.setHotkey(ctx, request.action, request.binding, request.context);
    case 'SET_FSRS_PARAMS': return miscH.setFsrsParams(ctx, request.retention, request.leechThreshold, request.maxInterval);

    default:
      return { error: `Unknown request type` };
  }
}

let messageQueue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { id, request } = e.data;
  messageQueue = messageQueue.then(async () => {
    try {
      const data = await handleMessage(request);
      const response: WorkerResponse = { id, type: 'RESULT', data };
      self.postMessage(response);
    } catch (err) {
      const response: WorkerResponse = {
        id,
        type: 'ERROR',
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    }
  });
};
