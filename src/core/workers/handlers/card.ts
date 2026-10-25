import type { WorkerContext } from '../workerContext.ts';
import { Rating, State, type Card, type Grade, type IPreview, type RecordLogItem } from 'ts-fsrs';
import { formatInterval, isLeech, newTodayKey } from '../helpers.ts';
import type { PickCardType } from '../protocol.ts';
import { localDateKey, nextLocalDateKey } from '../burial.ts';
import { buildExposurePlan } from '../../../features/goals/studyPlan.ts';
import type { StudyGoalConfig } from '../../../projects/types.ts';

function cardTypeFilter(cardType?: PickCardType): { sql: string; params: string[] } {
  if (!cardType) return { sql: '', params: [] };
  if (cardType === 'quiz') return { sql: ' AND card_type != ?', params: ['flashcard'] };
  return { sql: ' AND card_type = ?', params: [cardType] };
}

export async function pickNext(
  ctx: WorkerContext,
  projectId: string,
  sectionIds: string[],
  newPerSession: number,
  cardType?: PickCardType,
  quotaKey?: string,
  studyGoal?: StudyGoalConfig,
): Promise<{ cardId: string | null }> {
  await ctx.checkNewDay();
  const placeholders = sectionIds.map(() => '?').join(',');
  const now = new Date().toISOString();
  const typeFilter = cardTypeFilter(cardType);

  // 1. Learning/Relearning due (oldest)
  let row = await ctx.queryOne(
    `SELECT card_id FROM cards
     WHERE project_id = ? AND in_deck = 1 AND section_id IN (${placeholders})
     AND suspended = 0 AND buried = 0
     AND fsrs_state IN (1, 3) AND due <= ?${typeFilter.sql}
     ORDER BY due ASC LIMIT 1`,
    [projectId, ...sectionIds, now, ...typeFilter.params],
  );
  if (row) return { cardId: row.card_id as string };

  // 2. Review due (oldest)
  row = await ctx.queryOne(
    `SELECT card_id FROM cards
     WHERE project_id = ? AND in_deck = 1 AND section_id IN (${placeholders})
     AND suspended = 0 AND buried = 0
     AND fsrs_state = 2 AND due <= ?${typeFilter.sql}
     ORDER BY due ASC LIMIT 1`,
    [projectId, ...sectionIds, now, ...typeFilter.params],
  );
  if (row) return { cardId: row.card_id as string };

  // 3. New cards (capped per local day and persisted in daily_new).
  // A finite goal uses one project-wide key so switching sections cannot multiply exposure.
  const key = quotaKey?.trim() || newTodayKey(projectId, sectionIds, cardType);
  const used = await ctx.getNewTodayCount(projectId, key);
  let dailyLimit = Math.max(0, Math.floor(newPerSession));
  if (studyGoal?.target_date) {
    const unseenRow = await ctx.queryOne(
      `SELECT COUNT(*) as cnt FROM cards
       WHERE project_id = ? AND in_deck = 1 AND suspended = 0 AND fsrs_state = 0`,
      [projectId],
    );
    try {
      const plan = buildExposurePlan({
        today: localDateKey(),
        startDate: studyGoal.start_date,
        targetDate: studyGoal.target_date,
        weekendMultiplier: studyGoal.weekend_multiplier,
        unseen: (unseenRow?.cnt as number) ?? 0,
        introducedToday: used,
        due: 0,
      });
      if (plan.status !== 'deadline-passed' && plan.status !== 'not-configured') {
        dailyLimit = plan.dailyLimit;
      }
    } catch {
      // A stale invalid saved goal must not make the deck unusable. The validated daily
      // setting remains the safe fallback until the goal is corrected in Settings.
    }
  }
  if (used < dailyLimit) {
    row = await ctx.queryOne(
      `SELECT card_id FROM cards
       WHERE project_id = ? AND in_deck = 1 AND section_id IN (${placeholders})
       AND suspended = 0 AND buried = 0
       AND fsrs_state = 0${typeFilter.sql}
       ORDER BY priority ASC, card_id ASC LIMIT 1`,
      [projectId, ...sectionIds, ...typeFilter.params],
    );
    if (row) {
      // Legacy daily limits reserve on selection. Finite-goal limits count a new card
      // only after the learner rates it, so hidden/preloaded sections and reloads do
      // not consume exposure quota without an actual study action.
      if (!studyGoal?.target_date) await ctx.incrementNewToday(projectId, key);
      return { cardId: row.card_id as string };
    }
  }

  // No more cards due
  return { cardId: null };
}

export async function pickNextOverride(
  ctx: WorkerContext,
  projectId: string,
  sectionIds: string[],
  cardType?: PickCardType,
  excludeIds?: string[],
): Promise<{ cardId: string | null }> {
  await ctx.checkNewDay();
  const placeholders = sectionIds.map(() => '?').join(',');
  const typeFilter = cardTypeFilter(cardType);
  const excludeFilter =
    excludeIds && excludeIds.length > 0
      ? ` AND card_id NOT IN (${excludeIds.map(() => '?').join(',')})`
      : '';
  const excludeParam = excludeIds && excludeIds.length > 0 ? excludeIds : [];

  // Pick weakest card (lowest stability) regardless of due date
  const row = await ctx.queryOne(
    `SELECT card_id FROM cards
     WHERE project_id = ? AND in_deck = 1 AND section_id IN (${placeholders})
     AND suspended = 0 AND buried = 0${typeFilter.sql}${excludeFilter}
    ORDER BY stability ASC, priority ASC, card_id ASC LIMIT 1`,
    [projectId, ...sectionIds, ...typeFilter.params, ...excludeParam],
  );
  return row ? { cardId: row.card_id as string } : { cardId: null };
}

export async function resetNewCount(
  ctx: WorkerContext,
  projectId: string,
  sectionIds: string[],
  cardType?: PickCardType,
  quotaKey?: string,
): Promise<{ ok: boolean }> {
  const today = localDateKey();
  const key = quotaKey?.trim() || newTodayKey(projectId, sectionIds, cardType);
  await ctx.run(`DELETE FROM daily_new WHERE project_id = ? AND date = ? AND key = ?`, [projectId, today, key]);
  return { ok: true };
}

export async function previewRatings(
  ctx: WorkerContext,
  projectId: string,
  cardId: string,
): Promise<{ labels: Record<number, string> }> {
  const row = await ctx.queryOne(`SELECT * FROM cards WHERE project_id = ? AND card_id = ? AND in_deck = 1`, [projectId, cardId]);
  if (!row) return { labels: {} };

  const card = ctx.cardToFSRS(row);
  const result: IPreview = ctx.fsrsEngine().repeat(card, new Date());
  const labels: Record<number, string> = {};
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const nextCard = result[r as Grade].card;
    const days = Math.max(0, (nextCard.due.getTime() - Date.now()) / 86400000);
    labels[r] = formatInterval(days);
  }
  return { labels };
}

export async function reviewCard(
  ctx: WorkerContext,
  cardId: string,
  projectId: string,
  sectionId: string,
  rating: number,
  quotaKey?: string,
): Promise<{
  card: { state: number; due: string; stability: number; difficulty: number };
  isLeech: boolean;
  lapses: number;
}> {
  const row = await ctx.queryOne(`SELECT * FROM cards WHERE project_id = ? AND card_id = ? AND in_deck = 1`, [projectId, cardId]);
  if (!row) throw new Error(`Card not found: ${cardId}`);

  const card = ctx.cardToFSRS(row);
  const introductionKey = card.state === State.New ? quotaKey?.trim() : undefined;

  // Apply FSRS (pure computation, before transaction)
  const result: IPreview = ctx.fsrsEngine().repeat(card, new Date());
  const reviewed = result[rating as Grade];
  const newCard = reviewed.card;

  let newLapses = row.lapses as number;
  if (rating === Rating.Again && (card.state === State.Review || card.state === State.Relearning)) {
    newLapses++;
  }

  let isLeechNow = false;
  if (isLeech(newLapses, ctx.leechThreshold())) {
    isLeechNow = true;
  }

  const logId = ctx.uuidv7();
  const reviewTime = new Date().toISOString();

  await ctx.run('BEGIN');
  try {
    await deleteUndoRowsForScope(ctx, projectId);
    await ctx.run(
      `INSERT INTO undo_stack (project_id, card_id, review_log_id, activity_id, prev_state)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, cardId, logId, logId, JSON.stringify(row)],
    );

    if (isLeechNow) {
      await ctx.run(`UPDATE cards SET leech = 1 WHERE project_id = ? AND card_id = ? AND in_deck = 1`, [projectId, cardId]);
    }

    await ctx.saveCardFromFSRS(projectId, cardId, newCard, newLapses);
    if (introductionKey) await ctx.incrementNewToday(projectId, introductionKey);

    await ctx.run(
      `INSERT INTO review_log (id, card_id, project_id, rating, review_time, section_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [logId, cardId, projectId, rating, reviewTime, sectionId],
    );
    await ctx.run(
      `INSERT INTO activity (id, project_id, section_id, rating, correct, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
      [logId, projectId, sectionId, rating, rating !== Rating.Again ? 1 : 0, reviewTime],
    );

    await ctx.run('COMMIT');
  } catch (e) {
    await ctx.run('ROLLBACK');
    throw e;
  }

  return {
    card: {
      state: newCard.state,
      due: newCard.due.toISOString(),
      stability: newCard.stability,
      difficulty: newCard.difficulty,
    },
    isLeech: isLeechNow,
    lapses: newLapses,
  };
}

function parseUndoState(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function deleteUndoRowsForScope(ctx: WorkerContext, projectId: string, sectionId?: string): Promise<void> {
  if (!sectionId) {
    await ctx.run(`DELETE FROM undo_stack WHERE project_id = ?`, [projectId]);
    return;
  }
  const rows = await ctx.queryAll(`SELECT id, prev_state FROM undo_stack WHERE project_id = ? ORDER BY id DESC`, [projectId]);
  for (const row of rows) {
    const state = parseUndoState(row.prev_state);
    if (state?.section_id === sectionId) {
      await ctx.run(`DELETE FROM undo_stack WHERE id = ?`, [row.id]);
    }
  }
}

export async function undoReview(
  ctx: WorkerContext,
  projectId: string,
  expectedCardId?: string,
): Promise<{ undone: false } | { undone: true; cardId: string }> {
  const undoRow = await ctx.queryOne(`SELECT * FROM undo_stack WHERE project_id = ? ORDER BY id DESC LIMIT 1`, [projectId]);
  if (!undoRow) return { undone: false };
  if (expectedCardId && undoRow.card_id !== expectedCardId) return { undone: false };

  const prevState = parseUndoState(undoRow.prev_state)!;
  const reviewLogId = undoRow.review_log_id as string;
  const activityId = undoRow.activity_id as string | null;

  await ctx.run('BEGIN');
  try {
    await ctx.run(
      `UPDATE cards SET fsrs_state = ?, due = ?, stability = ?, difficulty = ?,
       elapsed_days = ?, scheduled_days = ?, learning_steps = ?, reps = ?, lapses = ?,
       last_review = ?, suspended = ?, buried = ?, buried_until = ?, leech = ?, updated_at = datetime('now')
       WHERE project_id = ? AND card_id = ? AND in_deck = 1`,
      [
        prevState.fsrs_state,
        prevState.due,
        prevState.stability,
        prevState.difficulty,
        prevState.elapsed_days,
        prevState.scheduled_days,
        prevState.learning_steps ?? 0,
        prevState.reps,
        prevState.lapses,
        prevState.last_review,
        prevState.suspended,
        prevState.buried,
        prevState.buried_until ?? null,
        prevState.leech,
        projectId,
        undoRow.card_id,
      ],
    );
    await ctx.run(`DELETE FROM undo_stack WHERE id = ?`, [undoRow.id]);

    await ctx.run(`DELETE FROM review_log WHERE id = ? AND project_id = ?`, [reviewLogId, projectId]);
    if (activityId) await ctx.run(`DELETE FROM activity WHERE id = ? AND project_id = ?`, [activityId, projectId]);

    await ctx.run('COMMIT');
  } catch (e) {
    await ctx.run('ROLLBACK');
    throw e;
  }

  return { undone: true, cardId: undoRow.card_id as string };
}

export async function suspendCard(ctx: WorkerContext, projectId: string, cardId: string): Promise<{ ok: boolean }> {
  await ctx.run(
    `UPDATE cards SET suspended = 1, updated_at = datetime('now') WHERE project_id = ? AND card_id = ? AND in_deck = 1`,
    [projectId, cardId],
  );
  return { ok: true };
}

export async function buryCard(ctx: WorkerContext, projectId: string, cardId: string): Promise<{ ok: boolean }> {
  await ctx.run(`UPDATE cards SET buried = 1, buried_until = ?, updated_at = datetime('now') WHERE project_id = ? AND card_id = ? AND in_deck = 1`, [
    nextLocalDateKey(), projectId, cardId,
  ]);
  return { ok: true };
}

export async function unburyAll(ctx: WorkerContext, projectId: string): Promise<{ ok: boolean }> {
  await ctx.run(
    `UPDATE cards SET buried = 0, buried_until = NULL, updated_at = datetime('now') WHERE project_id = ?`,
    [projectId],
  );
  return { ok: true };
}

export async function countDue(
  ctx: WorkerContext,
  projectId: string,
  sectionIds: string[],
  cardType?: PickCardType,
): Promise<{ due: number; newCount: number; total: number }> {
  const placeholders = sectionIds.map(() => '?').join(',');
  const now = new Date().toISOString();
  const typeFilter = cardTypeFilter(cardType);

  const dueRow = await ctx.queryOne(
    `SELECT COUNT(*) as cnt FROM cards
     WHERE project_id = ? AND in_deck = 1 AND section_id IN (${placeholders})
     AND suspended = 0 AND buried = 0
     AND fsrs_state IN (1,2,3) AND due <= ?${typeFilter.sql}`,
    [projectId, ...sectionIds, now, ...typeFilter.params],
  );
  const newRow = await ctx.queryOne(
    `SELECT COUNT(*) as cnt FROM cards
     WHERE project_id = ? AND in_deck = 1 AND section_id IN (${placeholders})
     AND suspended = 0 AND buried = 0 AND fsrs_state = 0${typeFilter.sql}`,
    [projectId, ...sectionIds, ...typeFilter.params],
  );
  const totalRow = await ctx.queryOne(
    `SELECT COUNT(*) as cnt FROM cards
     WHERE project_id = ? AND in_deck = 1 AND section_id IN (${placeholders})
     AND suspended = 0 AND buried = 0${typeFilter.sql}`,
    [projectId, ...sectionIds, ...typeFilter.params],
  );

  return {
    due: (dueRow?.cnt as number) ?? 0,
    newCount: (newRow?.cnt as number) ?? 0,
    total: (totalRow?.cnt as number) ?? 0,
  };
}
