import { beforeEach, describe, expect, it, vi } from 'vitest';

const { events, importProjectData, importGlobalData } = vi.hoisted(() => {
  const orderedEvents: string[] = [];
  return {
    events: orderedEvents,
    importProjectData: vi.fn(async () => { orderedEvents.push('db-project'); }),
    importGlobalData: vi.fn(async () => { orderedEvents.push('db-global'); }),
  };
});

vi.mock('../../core/hooks/useWorker.ts', () => ({
  initWorker: vi.fn(async () => { events.push('worker-init'); }),
  workerApi: {
    importProjectData,
    importGlobalData,
  },
}));

import { fetchAutosave, restoreBackup, validateBackupFile, type BackupFile } from './backup.ts';

function backup(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    version: 1,
    backupType: 'full',
    exportedAt: '2026-07-16T17:00:00.000Z',
    slug: 'test-project',
    projectData: { name: 'Test Project', sections: [] },
    projectConfig: { desired_retention: 0.9 },
    cards: [],
    review_log: [],
    scores: [],
    activity: [],
    notes: [],
    hotkeys: [],
    ...overrides,
  };
}

beforeEach(() => {
  events.length = 0;
  importProjectData.mockClear();
  importGlobalData.mockClear();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(),
    setItem: vi.fn(() => { events.push('local-storage'); }),
  });
});

describe('backup ownership and restore ordering', () => {
  it('requires an exact full backup discriminator and matching project ownership', () => {
    expect(validateBackupFile(backup())).toBe(true);
    expect(validateBackupFile({ ...backup(), backupType: 'project' })).toBe(false);
    expect(validateBackupFile(backup({
      cards: [{ card_id: 'c1', project_id: 'other-project' } as BackupFile['cards'][number]],
    }))).toBe(false);
    expect(validateBackupFile(backup({
      activity: [{ id: 'a1', project_id: 'other-project' } as BackupFile['activity'][number]],
    }))).toBe(false);
    expect(validateBackupFile(backup({
      cards: [{
        card_id: 'c1', project_id: 'test-project', section_id: 's1', card_type: 'mcq',
        fsrs_state: 0, due: '2026-07-16T17:00:00.000Z', stability: 0, difficulty: 0,
        elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, last_review: null,
        suspended: 0, buried: null, leech: 0, updated_at: '2026-07-16T17:00:00.000Z',
      } as unknown as BackupFile['cards'][number]],
    }))).toBe(false);
  });

  it('never accepts an autosave whose embedded slug differs from the requested project', async () => {
    vi.stubGlobal('location', { hostname: 'localhost' });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => backup({ slug: 'other-project' }),
    })));

    await expect(fetchAutosave('test-project')).resolves.toBeNull();
  });

  it('imports project data before local storage and excludes global hotkeys for autosave restore', async () => {
    const data = backup({ hotkeys: [{ action: 'answer', binding: 'x', context: 'global', updated_at: null }] });
    await restoreBackup(data, { includeGlobal: false });

    expect(importProjectData).toHaveBeenCalledOnce();
    expect(importGlobalData).not.toHaveBeenCalled();
    expect(events.indexOf('db-project')).toBeLessThan(events.indexOf('local-storage'));
  });

  it('keeps manual full restore global settings but writes local storage only after DB imports', async () => {
    await restoreBackup(backup());

    expect(importGlobalData).toHaveBeenCalledOnce();
    expect(events.indexOf('db-project')).toBeLessThan(events.indexOf('local-storage'));
    expect(events.indexOf('db-global')).toBeLessThan(events.indexOf('local-storage'));
  });
});
