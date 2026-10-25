import type { WorkerContext } from '../workerContext.ts';
import type { CardRegistration } from '../protocol.ts';

export async function loadProject(
  ctx: WorkerContext,
  projectId: string,
  sectionIds: string[],
  cardIds: CardRegistration[],
): Promise<{ ok: boolean }> {
  await ctx.run('BEGIN');
  try {
    for (const sid of sectionIds) {
      await ctx.run(
        `INSERT OR IGNORE INTO scores (project_id, section_id, correct, attempted) VALUES (?, ?, 0, 0)`,
        [projectId, sid],
      );
    }

    await ctx.run(`UPDATE cards SET in_deck = 0 WHERE project_id = ?`, [projectId]);
    await ctx.run(`DELETE FROM undo_stack WHERE project_id = ?`, [projectId]);
    for (const card of cardIds) {
      await ctx.run(
        `INSERT INTO cards (project_id, card_id, section_id, card_type, priority, in_deck)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(project_id, card_id) DO UPDATE SET
           section_id = excluded.section_id,
           card_type = excluded.card_type,
           priority = excluded.priority,
           in_deck = 1,
           updated_at = datetime('now')`,
        [projectId, card.cardId, card.sectionId, card.cardType, card.priority ?? 100],
      );
    }
    await ctx.run('COMMIT');
  } catch (error) {
    await ctx.run('ROLLBACK');
    throw error;
  }
  return { ok: true };
}
