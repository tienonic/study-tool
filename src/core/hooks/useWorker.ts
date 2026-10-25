import type { WorkerRequest, WorkerResponse, WorkerMessage, CardRow, ReviewLogRow, ScoreRow, ActivityRow, NoteRow, HotkeyRow, PickCardType, CardRegistration, StudyProgress } from '../workers/protocol.ts';
import type { StudyGoalConfig } from '../../projects/types.ts';

let worker: Worker | null = null;
let msgId = 0;
const pending = new Map<number, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();
let initPromise: Promise<void> | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/db.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, type, data, error } = e.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (type === 'ERROR') {
        entry.reject(new Error(error ?? 'Worker error'));
      } else {
        entry.resolve(data);
      }
    };
    worker.onerror = () => {
      for (const [, entry] of pending) {
        entry.reject(new Error('Worker crashed'));
      }
      pending.clear();
      worker = null;
      initPromise = null;
    };
  }
  return worker;
}

async function sendWorkerMessage<T = unknown>(request: WorkerRequest): Promise<T> {
  if (request.type !== 'INIT') {
    // Ensure worker is initialized — handles both normal startup and crash recovery
    // (after crash, initPromise is null but the new worker still needs INIT)
    if (!initPromise) await initWorker();
    else await initPromise;
  }
  const w = getWorker();
  const id = ++msgId;
  const msg: WorkerMessage = { id, request };
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (data: unknown) => void,
      reject,
    });
    w.postMessage(msg);
  });
}

export async function initWorker(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = sendWorkerMessage({ type: 'INIT' }).then(() => {});
  return initPromise;
}

export function terminateWorker(): void {
  for (const [, entry] of pending) {
    entry.reject(new Error('Worker terminated'));
  }
  pending.clear();
  worker?.terminate();
  worker = null;
  initPromise = null;
}

export const workerApi = {
  loadProject: (projectId: string, sectionIds: string[], cardIds: CardRegistration[]) =>
    sendWorkerMessage({ type: 'LOAD_PROJECT', projectId, sectionIds, cardIds }),

  pickNext: (projectId: string, sectionIds: string[], newPerSession: number, cardType?: PickCardType, quotaKey?: string, studyGoal?: StudyGoalConfig) =>
    sendWorkerMessage<{ cardId: string | null }>({ type: 'PICK_NEXT', projectId, sectionIds, newPerSession, cardType, quotaKey, studyGoal }),

  pickNextOverride: (projectId: string, sectionIds: string[], cardType?: PickCardType, excludeIds?: string[]) =>
    sendWorkerMessage<{ cardId: string | null }>({ type: 'PICK_NEXT_OVERRIDE', projectId, sectionIds, cardType, excludeIds }),

  resetNewCount: (projectId: string, sectionIds: string[], cardType?: PickCardType, quotaKey?: string) =>
    sendWorkerMessage({ type: 'RESET_NEW_COUNT', projectId, sectionIds, cardType, quotaKey }),

  previewRatings: (projectId: string, cardId: string) =>
    sendWorkerMessage<{ labels: Record<number, string> }>({ type: 'PREVIEW_RATINGS', projectId, cardId }),

  reviewCard: (cardId: string, projectId: string, sectionId: string, rating: number, quotaKey?: string) =>
    sendWorkerMessage<{ card: { state: number; due: string; stability: number; difficulty: number }; isLeech: boolean; lapses: number }>({
      type: 'REVIEW_CARD', cardId, projectId, sectionId, rating, quotaKey,
    }),

  undoReview: (projectId: string, expectedCardId?: string) =>
    sendWorkerMessage<{ undone: boolean; cardId?: string }>({ type: 'UNDO_REVIEW', projectId, expectedCardId }),

  suspendCard: (projectId: string, cardId: string) =>
    sendWorkerMessage({ type: 'SUSPEND_CARD', projectId, cardId }),

  buryCard: (projectId: string, cardId: string) =>
    sendWorkerMessage({ type: 'BURY_CARD', projectId, cardId }),

  unburyAll: (projectId: string) =>
    sendWorkerMessage({ type: 'UNBURY_ALL', projectId }),

  countDue: (projectId: string, sectionIds: string[], cardType?: PickCardType) =>
    sendWorkerMessage<{ due: number; newCount: number; total: number }>({ type: 'COUNT_DUE', projectId, sectionIds, cardType }),

  updateScore: (projectId: string, sectionId: string, correct: boolean) =>
    sendWorkerMessage<{ correct: number; attempted: number }>({ type: 'UPDATE_SCORE', projectId, sectionId, correct }),

  getScores: (projectId: string) =>
    sendWorkerMessage<{ project_id: string; section_id: string; correct: number; attempted: number }[]>({ type: 'GET_SCORES', projectId }),

  resetSection: (projectId: string, sectionId: string) =>
    sendWorkerMessage({ type: 'RESET_SECTION', projectId, sectionId }),

  addActivity: (projectId: string, sectionId: string, rating: number, correct: boolean) =>
    sendWorkerMessage({ type: 'ADD_ACTIVITY', projectId, sectionId, rating, correct }),

  getActivity: (projectId: string, limit?: number) =>
    sendWorkerMessage<{ id: string; section_id: string; rating: number; correct: number; timestamp: string }[]>({ type: 'GET_ACTIVITY', projectId, limit }),

  clearActivity: (projectId: string) =>
    sendWorkerMessage({ type: 'CLEAR_ACTIVITY', projectId }),

  addNote: (projectId: string, text: string) =>
    sendWorkerMessage({ type: 'ADD_NOTE', projectId, text }),

  getReviewLog: (projectId: string, limit?: number) =>
    sendWorkerMessage<{ id: string; card_id: string; project_id: string; section_id: string; rating: number; review_time: string }[]>({ type: 'GET_REVIEW_LOG', projectId, limit }),

  setFSRSParams: (retention: number, leechThreshold?: number, maxInterval?: number) =>
    sendWorkerMessage({ type: 'SET_FSRS_PARAMS', retention, leechThreshold, maxInterval }),

  getPerformanceCards: (projectId: string) =>
    sendWorkerMessage<{ card_id: string; section_id: string; card_type: string; fsrs_state: number; stability: number; difficulty: number; reps: number; lapses: number }[]>({
      type: 'GET_PERFORMANCE_CARDS', projectId,
    }),

  getSessionSummary: (projectId: string) =>
    sendWorkerMessage<{ lastReviewAt: string | null; dueNow: number }>({ type: 'GET_SESSION_SUMMARY', projectId }),

  getHotkeys: () =>
    sendWorkerMessage<{ action: string; binding: string; context: string }[]>({ type: 'GET_HOTKEYS' }),

  setHotkey: (action: string, binding: string, context: string) =>
    sendWorkerMessage({ type: 'SET_HOTKEY', action, binding, context }),

  exportProjectData: (projectId: string) =>
    sendWorkerMessage<{ cards: CardRow[]; review_log: ReviewLogRow[]; scores: ScoreRow[]; activity: ActivityRow[]; notes: NoteRow[] }>({
      type: 'EXPORT_PROJECT_DATA', projectId,
    }),

  exportGlobalData: () =>
    sendWorkerMessage<{ hotkeys: HotkeyRow[] }>({ type: 'EXPORT_GLOBAL_DATA' }),

  importProjectData: (projectId: string, cards: CardRow[], review_log: ReviewLogRow[], scores: ScoreRow[], activity: ActivityRow[], notes: NoteRow[]) =>
    sendWorkerMessage({ type: 'IMPORT_PROJECT_DATA', projectId, cards, review_log, scores, activity, notes }),

  importGlobalData: (hotkeys: HotkeyRow[]) =>
    sendWorkerMessage({ type: 'IMPORT_GLOBAL_DATA', hotkeys }),

  getDeckStats: (projectId: string) =>
    sendWorkerMessage<{ new: number; learning: number; due: number }>({ type: 'GET_DECK_STATS', projectId }),

  getProjectCardCount: (projectId: string) =>
    sendWorkerMessage<number>({ type: 'GET_PROJECT_CARD_COUNT', projectId }),

  getRetention: (projectId: string) =>
    sendWorkerMessage<{ retention: number | null }>({ type: 'GET_RETENTION', projectId }),

  getStudyProgress: (projectId: string, desiredRetention: number, quotaKey?: string) =>
    sendWorkerMessage<StudyProgress>({ type: 'GET_STUDY_PROGRESS', projectId, desiredRetention, quotaKey }),

  getSectionStats: (projectId: string) =>
    sendWorkerMessage<{ section_id: string; new: number; learning: number; due: number; total: number }[]>({ type: 'GET_SECTION_STATS', projectId }),

  getAllProjectIds: () =>
    sendWorkerMessage<string[]>({ type: 'GET_ALL_PROJECT_IDS' }),

  deleteProject: (projectId: string) =>
    sendWorkerMessage<{ ok: boolean }>({ type: 'DELETE_PROJECT', projectId }),
};

/** Project-scoped API — pre-binds projectId to all project-scoped methods */
export interface ProjectApi {
  loadProject: (sectionIds: string[], cardIds: CardRegistration[]) => Promise<unknown>;
  pickNext: (sectionIds: string[], newPerSession: number, cardType?: PickCardType, quotaKey?: string, studyGoal?: StudyGoalConfig) => Promise<{ cardId: string | null }>;
  pickNextOverride: (sectionIds: string[], cardType?: PickCardType, excludeIds?: string[]) => Promise<{ cardId: string | null }>;
  unburyAll: () => Promise<unknown>;
  countDue: (sectionIds: string[], cardType?: PickCardType) => Promise<{ due: number; newCount: number; total: number }>;
  updateScore: (sectionId: string, correct: boolean) => Promise<{ correct: number; attempted: number }>;
  getScores: () => Promise<{ project_id: string; section_id: string; correct: number; attempted: number }[]>;
  resetSection: (sectionId: string) => Promise<unknown>;
  addActivity: (sectionId: string, rating: number, correct: boolean) => Promise<unknown>;
  getActivity: (limit?: number) => Promise<{ id: string; section_id: string; rating: number; correct: number; timestamp: string }[]>;
  clearActivity: () => Promise<unknown>;
  addNote: (text: string) => Promise<unknown>;
  getReviewLog: (limit?: number) => Promise<{ id: string; card_id: string; project_id: string; section_id: string; rating: number; review_time: string }[]>;
  getPerformanceCards: () => Promise<{ card_id: string; section_id: string; card_type: string; fsrs_state: number; stability: number; difficulty: number; reps: number; lapses: number }[]>;
  getSessionSummary: () => Promise<{ lastReviewAt: string | null; dueNow: number }>;
  exportProjectData: () => Promise<{ cards: CardRow[]; review_log: ReviewLogRow[]; scores: ScoreRow[]; activity: ActivityRow[]; notes: NoteRow[] }>;
  importProjectData: (cards: CardRow[], review_log: ReviewLogRow[], scores: ScoreRow[], activity: ActivityRow[], notes: NoteRow[]) => Promise<unknown>;
  getDeckStats: () => Promise<{ new: number; learning: number; due: number }>;
  getRetention: () => Promise<{ retention: number | null }>;
  getStudyProgress: (desiredRetention: number, quotaKey?: string) => Promise<StudyProgress>;
  getSectionStats: () => Promise<{ section_id: string; new: number; learning: number; due: number; total: number }[]>;
  deleteProject: () => Promise<{ ok: boolean }>;
  reviewCard: (cardId: string, sectionId: string, rating: number, quotaKey?: string) => Promise<{ card: { state: number; due: string; stability: number; difficulty: number }; isLeech: boolean; lapses: number }>;
  previewRatings: (cardId: string) => ReturnType<typeof workerApi.previewRatings>;
  suspendCard: (cardId: string) => ReturnType<typeof workerApi.suspendCard>;
  buryCard: (cardId: string) => ReturnType<typeof workerApi.buryCard>;
  undoReview: (expectedCardId?: string) => ReturnType<typeof workerApi.undoReview>;
  resetNewCount: (sectionIds: string[], cardType?: PickCardType, quotaKey?: string) => ReturnType<typeof workerApi.resetNewCount>;
}

export function forProject(slug: string): ProjectApi {
  return {
    loadProject: (sectionIds, cardIds) => workerApi.loadProject(slug, sectionIds, cardIds),
    pickNext: (sectionIds, newPerSession, cardType?, quotaKey?, studyGoal?) => workerApi.pickNext(slug, sectionIds, newPerSession, cardType, quotaKey, studyGoal),
    pickNextOverride: (sectionIds, cardType?, excludeIds?) => workerApi.pickNextOverride(slug, sectionIds, cardType, excludeIds),
    unburyAll: () => workerApi.unburyAll(slug),
    countDue: (sectionIds, cardType?) => workerApi.countDue(slug, sectionIds, cardType),
    updateScore: (sectionId, correct) => workerApi.updateScore(slug, sectionId, correct),
    getScores: () => workerApi.getScores(slug),
    resetSection: (sectionId) => workerApi.resetSection(slug, sectionId),
    addActivity: (sectionId, rating, correct) => workerApi.addActivity(slug, sectionId, rating, correct),
    getActivity: (limit?) => workerApi.getActivity(slug, limit),
    clearActivity: () => workerApi.clearActivity(slug),
    addNote: (text) => workerApi.addNote(slug, text),
    getReviewLog: (limit?) => workerApi.getReviewLog(slug, limit),
    getPerformanceCards: () => workerApi.getPerformanceCards(slug),
    getSessionSummary: () => workerApi.getSessionSummary(slug),
    exportProjectData: () => workerApi.exportProjectData(slug),
    importProjectData: (cards, review_log, scores, activity, notes) => workerApi.importProjectData(slug, cards, review_log, scores, activity, notes),
    getDeckStats: () => workerApi.getDeckStats(slug),
    getRetention: () => workerApi.getRetention(slug),
    getStudyProgress: (desiredRetention, quotaKey?) => workerApi.getStudyProgress(slug, desiredRetention, quotaKey),
    getSectionStats: () => workerApi.getSectionStats(slug),
    deleteProject: () => workerApi.deleteProject(slug),
    reviewCard: (cardId, sectionId, rating, quotaKey?) => workerApi.reviewCard(cardId, slug, sectionId, rating, quotaKey),
    previewRatings: (cardId) => workerApi.previewRatings(slug, cardId),
    suspendCard: (cardId) => workerApi.suspendCard(slug, cardId),
    buryCard: (cardId) => workerApi.buryCard(slug, cardId),
    undoReview: (expectedCardId?) => workerApi.undoReview(slug, expectedCardId),
    resetNewCount: (sectionIds, cardType?, quotaKey?) => workerApi.resetNewCount(slug, sectionIds, cardType, quotaKey),
  };
}
