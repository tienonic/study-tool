import type { WorkerContext } from '../workerContext.ts';

export async function addNote(
  ctx: WorkerContext,
  projectId: string,
  text: string,
): Promise<{ ok: boolean }> {
  await ctx.run(`INSERT INTO notes (id, project_id, text) VALUES (?, ?, ?)`, [
    ctx.uuidv7(),
    projectId,
    text,
  ]);
  return { ok: true };
}

export async function getHotkeys(ctx: WorkerContext): Promise<Record<string, unknown>[]> {
  return ctx.queryAll(`SELECT * FROM hotkeys`);
}

export async function setHotkey(
  ctx: WorkerContext,
  action: string,
  binding: string,
  context: string,
): Promise<{ ok: boolean }> {
  await ctx.run(
    `INSERT OR REPLACE INTO hotkeys (action, binding, context, updated_at) VALUES (?, ?, ?, datetime('now'))`,
    [action, binding, context],
  );
  return { ok: true };
}

export async function setFsrsParams(
  ctx: WorkerContext,
  retention?: number,
  leechThreshold?: number,
  maxInterval?: number,
): Promise<{ ok: boolean }> {
  ctx.initFSRS(retention, leechThreshold, maxInterval);
  return { ok: true };
}
