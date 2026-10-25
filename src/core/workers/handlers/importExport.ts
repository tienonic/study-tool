import type { WorkerContext } from '../workerContext.ts';
import type {
  CardRow,
  ReviewLogRow,
  ScoreRow,
  ActivityRow,
  NoteRow,
  HotkeyRow,
} from '../protocol.ts';
import { localDateKey, releaseExpiredBuried } from '../burial.ts';

export async function exportProjectData(
  ctx: WorkerContext,
  projectId: string,
): Promise<{
  cards: Record<string, unknown>[];
  review_log: Record<string, unknown>[];
  scores: Record<string, unknown>[];
  activity: Record<string, unknown>[];
  notes: Record<string, unknown>[];
}> {
  const cards = await ctx.queryAll(`SELECT * FROM cards WHERE project_id = ?`, [projectId]);
  const review_log = await ctx.queryAll(`SELECT * FROM review_log WHERE project_id = ?`, [
    projectId,
  ]);
  const scores = await ctx.queryAll(`SELECT * FROM scores WHERE project_id = ?`, [projectId]);
  const activity = await ctx.queryAll(`SELECT * FROM activity WHERE project_id = ?`, [projectId]);
  const notes = await ctx.queryAll(`SELECT * FROM notes WHERE project_id = ?`, [projectId]);
  return { cards, review_log, scores, activity, notes };
}

export async function exportGlobalData(
  ctx: WorkerContext,
): Promise<{ hotkeys: Record<string, unknown>[] }> {
  const hotkeys = await ctx.queryAll(`SELECT * FROM hotkeys`);
  return { hotkeys };
}

export async function importProjectData(
  ctx: WorkerContext,
  projectId: string,
  cards: CardRow[],
  review_log: ReviewLogRow[],
  scores: ScoreRow[],
  activity: ActivityRow[],
  notes: NoteRow[],
): Promise<{ ok: boolean }> {
  await ctx.run('BEGIN');
  try {
    await ctx.run(`DELETE FROM cards WHERE project_id = ?`, [projectId]);
    await ctx.run(`DELETE FROM review_log WHERE project_id = ?`, [projectId]);
    await ctx.run(`DELETE FROM scores WHERE project_id = ?`, [projectId]);
    await ctx.run(`DELETE FROM activity WHERE project_id = ?`, [projectId]);
    await ctx.run(`DELETE FROM notes WHERE project_id = ?`, [projectId]);
    await ctx.run(`DELETE FROM daily_new WHERE project_id = ?`, [projectId]);
    await ctx.run(`DELETE FROM undo_stack WHERE project_id = ?`, [projectId]);

    for (const c of cards) {
      const buriedUntil = typeof c.buried_until === 'string' ? c.buried_until : null;
      const buried = c.buried === 1 && buriedUntil !== null && buriedUntil > localDateKey() ? 1 : 0;
      await ctx.run(
        `INSERT INTO cards (project_id, card_id, section_id, card_type, fsrs_state, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, last_review, suspended, buried, buried_until, leech, in_deck, priority, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          c.card_id,
          c.section_id,
          c.card_type,
          c.fsrs_state,
          c.due,
          c.stability,
          c.difficulty,
          c.elapsed_days,
          c.scheduled_days,
          c.learning_steps && Number.isInteger(c.learning_steps) && c.learning_steps >= 0 ? c.learning_steps : 0,
          c.reps,
          c.lapses,
          c.last_review,
          c.suspended === 1 ? 1 : 0,
          buried,
          buried ? buriedUntil : null,
          c.leech === 1 ? 1 : 0,
          c.in_deck === 0 ? 0 : 1,
          c.priority && Number.isInteger(c.priority) && c.priority >= 1 ? c.priority : 100,
          c.updated_at,
        ],
      );
    }
    for (const r of review_log) {
      await ctx.run(
        `INSERT INTO review_log (id, card_id, project_id, rating, review_time, section_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [r.id, r.card_id, projectId, r.rating, r.review_time, r.section_id],
      );
    }
    for (const s of scores) {
      await ctx.run(
        `INSERT INTO scores (project_id, section_id, correct, attempted, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [projectId, s.section_id, s.correct, s.attempted, s.updated_at],
      );
    }
    for (const a of activity) {
      await ctx.run(
        `INSERT INTO activity (id, project_id, section_id, rating, correct, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [a.id, projectId, a.section_id, a.rating, a.correct, a.timestamp],
      );
    }
    for (const n of notes) {
      await ctx.run(
        `INSERT INTO notes (id, project_id, text, created_at) VALUES (?, ?, ?, ?)`,
        [n.id, projectId, n.text, n.created_at],
      );
    }

    await releaseExpiredBuried(ctx);

    await ctx.run('COMMIT');
  } catch (e) {
    await ctx.run('ROLLBACK');
    throw e;
  }
  return { ok: true };
}

export async function importGlobalData(
  ctx: WorkerContext,
  hotkeys: HotkeyRow[],
): Promise<{ ok: boolean }> {
  await ctx.run('BEGIN');
  try {
    for (const h of hotkeys) {
      await ctx.run(
        `INSERT OR REPLACE INTO hotkeys (action, binding, context, updated_at) VALUES (?, ?, ?, ?)`,
        [h.action, h.binding, h.context, h.updated_at],
      );
    }
    await ctx.run('COMMIT');
  } catch (e) {
    await ctx.run('ROLLBACK');
    throw e;
  }
  return { ok: true };
}

export async function deleteProject(
  ctx: WorkerContext,
  projectId: string,
): Promise<{ ok: boolean }> {
  await ctx.run(`DELETE FROM cards WHERE project_id = ?`, [projectId]);
  await ctx.run(`DELETE FROM review_log WHERE project_id = ?`, [projectId]);
  await ctx.run(`DELETE FROM scores WHERE project_id = ?`, [projectId]);
  await ctx.run(`DELETE FROM activity WHERE project_id = ?`, [projectId]);
  await ctx.run(`DELETE FROM notes WHERE project_id = ?`, [projectId]);
  await ctx.run(`DELETE FROM daily_new WHERE project_id = ?`, [projectId]);
  await ctx.run(`DELETE FROM undo_stack WHERE project_id = ?`, [projectId]);
  return { ok: true };
}
