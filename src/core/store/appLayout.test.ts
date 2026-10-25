import { afterEach, describe, expect, it, vi } from 'vitest';
import { coreFeatureScenarios } from '../../features/quiz/featureMatrix.ts';
import type { Project } from '../../projects/types.ts';

type AppStore = typeof import('./app.ts');

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: [string, string][] = [];
  return {
    writes,
    api: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
        writes.push([key, value]);
      }),
    },
  };
}

async function loadFreshAppStore(initialStorage: Record<string, string> = {}) {
  vi.resetModules();
  const storage = createStorage(initialStorage);
  vi.stubGlobal('localStorage', storage.api);
  const app = await import('./app.ts');
  return { app, storage };
}

function project(): Project {
  return {
    name: 'Matrix Project',
    slug: 'matrix-project',
    version: 1,
    config: {
      desired_retention: 0.9,
      new_per_session: 12,
      leech_threshold: 8,
      max_interval: 90,
      imageSearchSuffix: '',
    },
    sections: [],
    glossary: [],
  };
}

function nonLayoutSnapshot(app: AppStore) {
  return {
    appPhase: app.appPhase(),
    activeProject: app.activeProject(),
    activeTab: app.activeTab(),
    easyMode: app.easyMode(),
    zenMode: app.zenMode(),
    mergedMode: app.mergedMode(),
    sessionSummary: app.sessionSummary(),
    sidebarOffsetY: app.sidebarOffsetY(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('layout-only app toggles', () => {
  it('matrix scenarios mark graph/options combinations as layout-only risks', () => {
    const layoutScenarios = coreFeatureScenarios.filter(s => s.mustHold.includes('activityPanelLayoutOnly'));

    expect(layoutScenarios.length).toBeGreaterThan(0);
    expect(layoutScenarios.some(s => s.activityPanel === 'graphOff')).toBe(true);
    expect(layoutScenarios.some(s => s.activityPanel === 'optionsOpen')).toBe(true);
  });

  it('graph, sync, and terms toggles do not mutate study/session identity state', async () => {
    const { app, storage } = await loadFreshAppStore({
      'graph-visible': 'true',
      'sync-activity': 'true',
      'terms-visible': 'true',
    });

    app.setAppPhase('study');
    app.setActiveProject(project());
    app.setActiveTab('sec-a');
    app.setMergedMode(true);
    app.setSessionSummary({ lastReviewAt: '2026-05-25T12:00:00.000Z', dueNow: 7, gap: '1h ago' });
    app.setSidebarOffsetY(18);

    const before = nonLayoutSnapshot(app);

    app.toggleGraphVisible();
    app.toggleSyncActivity();
    app.toggleTermsVisible();

    expect(app.graphVisible()).toBe(false);
    expect(app.syncActivity()).toBe(false);
    expect(app.termsVisible()).toBe(false);
    expect(nonLayoutSnapshot(app)).toEqual(before);
    expect(storage.writes).toEqual([
      ['graph-visible', 'false'],
      ['sync-activity', 'false'],
      ['terms-visible', 'false'],
    ]);
  });
});
