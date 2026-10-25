import { describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../workerContext.ts';
import type { ActivityRow, CardRow, NoteRow, ReviewLogRow, ScoreRow } from '../protocol.ts';
import { importProjectData } from './importExport.ts';

describe('importProjectData project ownership', () => {
  it('binds every imported row to the requested project instead of embedded project ids', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const ctx = { run } as unknown as WorkerContext;
    const foreign = 'foreign-project';

    await importProjectData(
      ctx,
      'target-project',
      [{ card_id: 'c1', project_id: foreign } as CardRow],
      [{ id: 'r1', card_id: 'c1', project_id: foreign } as ReviewLogRow],
      [{ project_id: foreign, section_id: 's1' } as ScoreRow],
      [{ id: 'a1', project_id: foreign } as ActivityRow],
      [{ id: 'n1', project_id: foreign } as NoteRow],
    );

    const inserts = run.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO'));
    expect(inserts).toHaveLength(5);
    expect(inserts[0][1][0]).toBe('target-project');
    expect(inserts[1][1][2]).toBe('target-project');
    expect(inserts[2][1][0]).toBe('target-project');
    expect(inserts[3][1][1]).toBe('target-project');
    expect(inserts[4][1][1]).toBe('target-project');
  });
});
