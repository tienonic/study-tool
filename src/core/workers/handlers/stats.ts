import type { WorkerContext } from '../workerContext.ts';
import { State } from 'ts-fsrs';
import type { StudyProgress } from '../protocol.ts';

export async function getProjectCardCount(ctx: WorkerContext, projectId: string): Promise<number> {
  const row = await ctx.queryOne(`SELECT COUNT(*) as cnt FROM cards WHERE project_id = ?`, [projectId]);
  return (row?.cnt as number) ?? 0;
}

export async function getDeckStats(
  ctx: WorkerContext,
  projectId: string,
): Promise<{ new: number; learning: number; due: number }> {
  const now = new Date().toISOString();
  const newRow = await ctx.queryOne(
    `SELECT COUNT(*) as cnt FROM cards WHERE project_id = ? AND in_deck = 1 AND fsrs_state = 0 AND suspended = 0 AND buried = 0`,
    [projectId],
  );
  const learningRow = await ctx.queryOne(
    `SELECT COUNT(*) as cnt FROM cards WHERE project_id = ? AND in_deck = 1 AND fsrs_state IN (1, 3) AND suspended = 0 AND buried = 0 AND due <= ?`,
    [projectId, now],
  );
  const dueRow = await ctx.queryOne(
    `SELECT COUNT(*) as cnt FROM cards WHERE project_id = ? AND in_deck = 1 AND fsrs_state = 2 AND suspended = 0 AND buried = 0 AND due <= ?`,
    [projectId, now],
  );
  return {
    new: (newRow?.cnt as number) ?? 0,
    learning: (learningRow?.cnt as number) ?? 0,
    due: (dueRow?.cnt as number) ?? 0,
  };
}

export async function getSectionStats(
  ctx: WorkerContext,
  projectId: string,
): Promise<{ section_id: string; new: number; learning: number; due: number; total: number }[]> {
  const now = new Date().toISOString();
  const rows = await ctx.queryAll(
    `SELECT section_id,
      SUM(CASE WHEN fsrs_state = 0 THEN 1 ELSE 0 END) as new_count,
      SUM(CASE WHEN fsrs_state IN (1,3) AND due <= ? THEN 1 ELSE 0 END) as learning_count,
      SUM(CASE WHEN fsrs_state = 2 AND due <= ? THEN 1 ELSE 0 END) as due_count,
      COUNT(*) as total
    FROM cards
    WHERE project_id = ? AND in_deck = 1 AND suspended = 0 AND buried = 0
    GROUP BY section_id`,
    [now, now, projectId],
  );
  return rows.map((r: Record<string, unknown>) => ({
    section_id: r.section_id as string,
    new: (r.new_count as number) ?? 0,
    learning: (r.learning_count as number) ?? 0,
    due: (r.due_count as number) ?? 0,
    total: (r.total as number) ?? 0,
  }));
}

export async function getSessionSummary(
  ctx: WorkerContext,
  projectId: string,
): Promise<{ lastReviewAt: string | null; dueNow: number }> {
  const lastRow = await ctx.queryOne(
    `SELECT review_time FROM review_log WHERE project_id = ? ORDER BY review_time DESC LIMIT 1`,
    [projectId],
  );
  const now = new Date().toISOString();
  const dueRow = await ctx.queryOne(
    `SELECT COUNT(*) as cnt FROM cards
     WHERE project_id = ? AND in_deck = 1 AND suspended = 0 AND buried = 0
     AND fsrs_state IN (1,2,3) AND due <= ?`,
    [projectId, now],
  );
  return {
    lastReviewAt: lastRow ? (lastRow.review_time as string) : null,
    dueNow: (dueRow?.cnt as number) ?? 0,
  };
}

export async function getReviewLog(
  ctx: WorkerContext,
  projectId: string,
  limit?: number,
): Promise<Record<string, unknown>[]> {
  const effectiveLimit = limit ?? 1000;
  return ctx.queryAll(
    `SELECT * FROM review_log WHERE project_id = ? ORDER BY review_time DESC LIMIT ?`,
    [projectId, effectiveLimit],
  );
}

export async function getPerformanceCards(
  ctx: WorkerContext,
  projectId: string,
): Promise<Record<string, unknown>[]> {
  return ctx.queryAll(
    `SELECT card_id, section_id, card_type, fsrs_state, stability, difficulty, reps, lapses
     FROM cards WHERE project_id = ? AND in_deck = 1 AND suspended = 0 AND buried = 0
     ORDER BY lapses DESC, stability ASC`,
    [projectId],
  );
}

export async function getAllProjectIds(ctx: WorkerContext): Promise<string[]> {
  const rows = await ctx.queryAll(`SELECT DISTINCT project_id FROM cards`);
  return (rows as { project_id: string }[]).map((r) => r.project_id);
}

export async function getRetention(
  ctx: WorkerContext,
  projectId: string,
): Promise<{ retention: number | null }> {
  const rows = await ctx.queryAll(
    `SELECT * FROM cards WHERE project_id = ? AND in_deck = 1 AND fsrs_state = 2 AND suspended = 0`,
    [projectId],
  );
  if (rows.length === 0) return { retention: null };
  const now = new Date();
  let sum = 0;
  for (const row of rows) {
    sum += ctx.fsrsEngine().get_retrievability(ctx.cardToFSRS(row), now, false);
  }
  return { retention: sum / rows.length };
}

/**
 * Return conservative, mutually understandable progress measures for a finite deck.
 * "Recognized" means FSRS review state; "durable retention" additionally requires
 * repeated reviews, a seven-day interval, and current retrievability at the target.
 */
export async function getStudyProgress(
  ctx: WorkerContext,
  projectId: string,
  desiredRetention: number,
  quotaKey?: string,
): Promise<StudyProgress> {
  const rows = await ctx.queryAll(
    `SELECT * FROM cards
     WHERE project_id = ? AND in_deck = 1 AND suspended = 0`,
    [projectId],
  );
  const now = new Date();
  const retentionTarget = Math.max(0.7, Math.min(0.99, desiredRetention));
  let unseen = 0;
  let learning = 0;
  let recognized = 0;
  let due = 0;
  let retentionSum = 0;
  let retentionCount = 0;
  let durableRetention = 0;

  for (const row of rows) {
    const state = Number(row.fsrs_state);
    if (state === State.New) unseen += 1;
    if (state === State.Learning || state === State.Relearning) learning += 1;
    if (state === State.Review) recognized += 1;

    const dueTime = new Date(String(row.due)).getTime();
    if (
      state !== State.New
      && Number(row.buried) === 0
      && Number.isFinite(dueTime)
      && dueTime <= now.getTime()
    ) due += 1;

    if (state === State.Review) {
      const retrievability = Math.max(0, Math.min(
        1,
        ctx.fsrsEngine().get_retrievability(ctx.cardToFSRS(row), now, false),
      ));
      retentionSum += retrievability;
      retentionCount += 1;
      if (
        Number(row.reps) >= 2
        && Number(row.scheduled_days) >= 7
        && retrievability >= retentionTarget
      ) durableRetention += 1;
    }
  }

  const total = rows.length;
  return {
    total,
    unseen,
    exposed: total - unseen,
    learning,
    recognized,
    due,
    estimatedRetrievability: retentionCount > 0 ? retentionSum / retentionCount : null,
    durableRetention,
    introducedToday: quotaKey?.trim()
      ? await ctx.getNewTodayCount(projectId, quotaKey.trim())
      : 0,
  };
}
