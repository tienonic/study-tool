import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createFakeProjectApi } from '../quiz/testUtils.ts';

// Minimal stubs for signals activity/store imports
let _project: any = null;
let _tab: string | null = null;
let _syncActivity = true;

vi.mock('../../core/store/app.ts', () => ({
  activeProject: () => _project,
  activeTab: () => _tab,
  syncActivity: () => _syncActivity,
}));

vi.mock('../../core/store/sections.ts', () => ({
  sectionHandlers: new Map(),
  handlerVersion: vi.fn().mockReturnValue(0),
}));

vi.mock('../quiz/helpers.ts', () => ({
  getCardType: vi.fn().mockReturnValue('mcq'),
}));

vi.mock('./chartUtils.ts', () => ({
  computeCumScores: vi.fn().mockReturnValue([]),
  drawChartAxes: vi.fn(),
  drawChartData: vi.fn(),
}));

// Import AFTER mocks are set up
import { loadActivity, loadSidebarScore, setActivityApi, activityScore, reviewStats, sidebarScore, sidebarConcepts } from './store.ts';
import { MERGED_TAB_ID } from '../quiz/merged.ts';
import { sectionHandlers } from '../../core/store/sections.ts';

function section(id: string, type = 'mc-quiz') {
  return {
    id,
    name: id,
    type,
    cardIds: [`${id}-0`],
    flashCardIds: [],
  };
}

describe('activity/store with injected ProjectApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sectionHandlers.clear();
    _project = { slug: 'test-proj', sections: [] };
    _tab = 'sec1';
    _syncActivity = true;
  });

  it('loadActivity calls api.getActivity (not global workerApi)', async () => {
    const api = createFakeProjectApi({
      getActivity: vi.fn().mockResolvedValue([
        { id: '1', section_id: 'sec1', rating: 3, correct: 1, timestamp: '2026-01-01' },
      ]),
      getRetention: vi.fn().mockResolvedValue({ retention: 0.9 }),
    });

    await createRoot(async (dispose) => {
      setActivityApi(api);
      await loadActivity();
      expect(api.getActivity).toHaveBeenCalledWith(200);
      dispose();
    });
  });

  it('loadActivity does not call global workerApi.getActivity', async () => {
    const api = createFakeProjectApi({
      getActivity: vi.fn().mockResolvedValue([]),
      getRetention: vi.fn().mockResolvedValue({ retention: null }),
    });

    // We verify this indirectly: if setActivityApi is wired correctly,
    // the mock api.getActivity is what gets called
    await createRoot(async (dispose) => {
      setActivityApi(api);
      await loadActivity();
      // Called once with limit 200
      expect(api.getActivity).toHaveBeenCalledTimes(1);
      expect(api.getActivity).toHaveBeenCalledWith(200);
      dispose();
    });
  });

  it('loadActivity returns early when no project is set', async () => {
    _project = null;
    const api = createFakeProjectApi();

    await createRoot(async (dispose) => {
      setActivityApi(api);
      await loadActivity();
      expect(api.getActivity).not.toHaveBeenCalled();
      dispose();
    });
  });

  it('loadActivity scopes merged mode reviews to real quiz sections when graph sync is off', async () => {
    _project = { slug: 'test-proj', sections: [section('one'), section('two', 'passage-quiz'), section('math', 'math-gen')] };
    _tab = MERGED_TAB_ID;
    _syncActivity = false;
    const api = createFakeProjectApi({
      getActivity: vi.fn().mockResolvedValue([
        { id: '1', section_id: 'one', rating: 3, correct: 1, timestamp: '2026-01-01' },
        { id: '2', section_id: 'two', rating: 1, correct: 0, timestamp: '2026-01-02' },
        { id: '3', section_id: 'math', rating: 3, correct: 1, timestamp: '2026-01-03' },
      ]),
      getRetention: vi.fn().mockResolvedValue({ retention: null }),
    });

    await createRoot(async (dispose) => {
      setActivityApi(api);
      await loadActivity();
      expect(reviewStats().reviews).toBe(2);
      dispose();
    });
  });

  it('loadSidebarScore aggregates due and score across merged quiz sections', async () => {
    _project = { slug: 'test-proj', sections: [section('one'), section('two', 'passage-quiz'), section('math', 'math-gen')] };
    _tab = MERGED_TAB_ID;
    const api = createFakeProjectApi({
      countDue: vi.fn().mockResolvedValue({ due: 4, newCount: 6, total: 20 }),
      getScores: vi.fn().mockResolvedValue([
        { project_id: 'test-proj', section_id: 'one', correct: 2, attempted: 3 },
        { project_id: 'test-proj', section_id: 'two', correct: 1, attempted: 2 },
        { project_id: 'test-proj', section_id: 'math', correct: 9, attempted: 9 },
      ]),
    });

    await createRoot(async (dispose) => {
      setActivityApi(api);
      await loadSidebarScore();
      expect(api.countDue).toHaveBeenCalledWith(['one', 'two'], 'quiz');
      expect(sidebarScore()).toEqual({ correct: 3, attempted: 5, due: 10, total: 20 });
      dispose();
    });
  });

  it('shows recognized concepts instead of a zero score in flashcard mode', async () => {
    _project = {
      slug: 'test-proj',
      config: { desired_retention: 0.9 },
      sections: [section('sec1')],
    };
    _tab = 'sec1';
    sectionHandlers.set('sec1', { kind: 'quiz', session: { flashMode: () => true } } as any);
    const api = createFakeProjectApi({
      countDue: vi.fn().mockResolvedValue({ due: 20, newCount: 3906, total: 4000 }),
      getScores: vi.fn().mockResolvedValue([]),
      getStudyProgress: vi.fn().mockResolvedValue({
        total: 4000,
        unseen: 3906,
        exposed: 94,
        learning: 25,
        recognized: 69,
        due: 20,
        estimatedRetrievability: 1,
        durableRetention: 0,
        introducedToday: 94,
      }),
    });

    await createRoot(async (dispose) => {
      setActivityApi(api);
      await loadSidebarScore();
      expect(api.getStudyProgress).toHaveBeenCalledWith(0.9);
      expect(sidebarConcepts()).toEqual({ recognized: 69, exposed: 94 });
      expect(sidebarScore()).toEqual({ correct: 0, attempted: 0, due: 3926, total: 4000 });
      dispose();
    });
  });
});
