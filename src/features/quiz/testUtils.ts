import { vi } from 'vitest';
import type { ProjectApi } from '../../core/hooks/useWorker.ts';

export function createFakeProjectApi(overrides?: Partial<ProjectApi>): ProjectApi {
  return {
    loadProject: vi.fn().mockResolvedValue(undefined),
    pickNext: vi.fn().mockResolvedValue({ cardId: null }),
    pickNextOverride: vi.fn().mockResolvedValue({ cardId: null }),
    unburyAll: vi.fn().mockResolvedValue(undefined),
    countDue: vi.fn().mockResolvedValue({ due: 0, newCount: 0, total: 0 }),
    updateScore: vi.fn().mockResolvedValue({ correct: 0, attempted: 0 }),
    getScores: vi.fn().mockResolvedValue([]),
    resetSection: vi.fn().mockResolvedValue(undefined),
    addActivity: vi.fn().mockResolvedValue(undefined),
    getActivity: vi.fn().mockResolvedValue([]),
    clearActivity: vi.fn().mockResolvedValue(undefined),
    addNote: vi.fn().mockResolvedValue(undefined),
    getReviewLog: vi.fn().mockResolvedValue([]),
    getPerformanceCards: vi.fn().mockResolvedValue([]),
    getSessionSummary: vi.fn().mockResolvedValue({ lastReviewAt: null, dueNow: 0 }),
    exportProjectData: vi.fn().mockResolvedValue({ cards: [], review_log: [], scores: [], activity: [], notes: [] }),
    importProjectData: vi.fn().mockResolvedValue(undefined),
    getDeckStats: vi.fn().mockResolvedValue({ new: 0, learning: 0, due: 0 }),
    getRetention: vi.fn().mockResolvedValue({ retention: null }),
    getStudyProgress: vi.fn().mockResolvedValue({
      total: 0, unseen: 0, exposed: 0, learning: 0, recognized: 0, due: 0,
      estimatedRetrievability: null, durableRetention: 0, introducedToday: 0,
    }),
    getSectionStats: vi.fn().mockResolvedValue([]),
    deleteProject: vi.fn().mockResolvedValue({ ok: true }),
    reviewCard: vi.fn().mockResolvedValue({ card: { state: 0, due: '', stability: 0, difficulty: 0 }, isLeech: false, lapses: 0 }),
    previewRatings: vi.fn().mockResolvedValue({ labels: {} }),
    suspendCard: vi.fn().mockResolvedValue(undefined),
    buryCard: vi.fn().mockResolvedValue(undefined),
    undoReview: vi.fn().mockResolvedValue({ undone: false }),
    resetNewCount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
