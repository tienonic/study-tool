import type { WorkerContext } from '../workerContext.ts';
import { deleteUndoRowsForScope } from './card.ts';

export async function updateScore(
  ctx: WorkerContext,
  projectId: string,
  sectionId: string,
  correct: boolean,
): Promise<Record<string, unknown> | null> {
  if (correct) {
    await ctx.run(
      `UPDATE scores SET correct = correct + 1, attempted = attempted + 1, updated_at = datetime('now')
       WHERE project_id = ? AND section_id = ?`,
      [projectId, sectionId],
    );
  } else {
    await ctx.run(
      `UPDATE scores SET attempted = attempted + 1, updated_at = datetime('now')
       WHERE project_id = ? AND section_id = ?`,
      [projectId, sectionId],
    );
  }
  const row = await ctx.queryOne(
    `SELECT * FROM scores WHERE project_id = ? AND section_id = ?`,
    [projectId, sectionId],
  );
  return row;
}

export async function getScores(
  ctx: WorkerContext,
  projectId: string,
): Promise<Record<string, unknown>[]> {
  return ctx.queryAll(`SELECT * FROM scores WHERE project_id = ?`, [projectId]);
}

export async function resetSection(
  ctx: WorkerContext,
  projectId: string,
  sectionId: string,
): Promise<{ ok: boolean }> {
  await ctx.run('BEGIN');
  try {
    await deleteUndoRowsForScope(ctx, projectId, sectionId);
    await ctx.run(`DELETE FROM cards WHERE project_id = ? AND section_id = ?`, [
      projectId,
      sectionId,
    ]);
    await ctx.run(
      `UPDATE scores SET correct = 0, attempted = 0, updated_at = datetime('now')
       WHERE project_id = ? AND section_id = ?`,
      [projectId, sectionId],
    );
    const quotaRows = await ctx.queryAll(`SELECT date, key FROM daily_new WHERE project_id = ?`, [projectId]);
    for (const row of quotaRows) {
      const key = String(row.key ?? '');
      const parts = key.split('|');
      if (parts.length === 3 && parts[0] === projectId && parts[1].split(',').includes(sectionId)) {
        await ctx.run(`DELETE FROM daily_new WHERE project_id = ? AND date = ? AND key = ?`, [projectId, row.date, key]);
      }
    }
    await ctx.run('COMMIT');
  } catch (e) {
    await ctx.run('ROLLBACK');
    throw e;
  }
  return { ok: true };
}
