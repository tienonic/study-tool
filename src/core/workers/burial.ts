import type { WorkerContext } from './workerContext.ts';

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function nextLocalDateKey(date = new Date()): string {
  return localDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
}

export async function releaseExpiredBuried(ctx: WorkerContext, today = localDateKey()): Promise<void> {
  await ctx.run(
    `UPDATE cards SET buried = 0, buried_until = NULL, updated_at = datetime('now')
     WHERE buried = 1 AND (buried_until IS NULL OR buried_until <= ?)`,
    [today],
  );
}
