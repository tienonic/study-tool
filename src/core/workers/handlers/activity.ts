import type { WorkerContext } from '../workerContext.ts';

export async function addActivity(
  ctx: WorkerContext,
  projectId: string,
  sectionId: string,
  rating: number | null,
  correct: boolean,
): Promise<{ ok: boolean }> {
  await ctx.run(
    `INSERT INTO activity (id, project_id, section_id, rating, correct, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ctx.uuidv7(), projectId, sectionId, rating, correct ? 1 : 0, new Date().toISOString()],
  );
  const countRow = await ctx.queryOne(
    `SELECT COUNT(*) as cnt FROM activity WHERE project_id = ?`,
    [projectId],
  );
  const cnt = (countRow?.cnt as number) ?? 0;
  if (cnt > 200) {
    await ctx.run(
      `DELETE FROM activity WHERE id IN (
        SELECT id FROM activity WHERE project_id = ? ORDER BY timestamp ASC LIMIT ?
      )`,
      [projectId, cnt - 200],
    );
  }
  return { ok: true };
}

export async function getActivity(
  ctx: WorkerContext,
  projectId: string,
  limit?: number,
): Promise<Record<string, unknown>[]> {
  const effectiveLimit = limit ?? 200;
  return ctx.queryAll(
    `SELECT * FROM activity WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?`,
    [projectId, effectiveLimit],
  );
}

export async function clearActivity(
  ctx: WorkerContext,
  projectId: string,
): Promise<{ ok: boolean }> {
  await ctx.run(`DELETE FROM activity WHERE project_id = ?`, [projectId]);
  return { ok: true };
}
