import type { StudyGoalConfig } from '../../projects/types.ts';

export type StudyCardType = 'mcq' | 'passage' | 'flashcard';
export type PickCardType = StudyCardType | 'quiz';

export interface CardRegistration {
  sectionId: string;
  cardId: string;
  cardType: StudyCardType;
  priority?: number;
}

export type WorkerRequest =
  | { type: 'INIT' }
  | { type: 'LOAD_PROJECT'; projectId: string; sectionIds: string[]; cardIds: CardRegistration[] }
  | { type: 'PICK_NEXT'; projectId: string; sectionIds: string[]; newPerSession: number; cardType?: PickCardType; quotaKey?: string; studyGoal?: StudyGoalConfig }
  | { type: 'PICK_NEXT_OVERRIDE'; projectId: string; sectionIds: string[]; cardType?: PickCardType; excludeIds?: string[] }
  | { type: 'RESET_NEW_COUNT'; projectId: string; sectionIds: string[]; cardType?: PickCardType; quotaKey?: string }
  | { type: 'PREVIEW_RATINGS'; projectId: string; cardId: string }
  | { type: 'REVIEW_CARD'; cardId: string; projectId: string; sectionId: string; rating: number; quotaKey?: string }
  | { type: 'UNDO_REVIEW'; projectId: string; expectedCardId?: string }
  | { type: 'SUSPEND_CARD'; projectId: string; cardId: string }
  | { type: 'BURY_CARD'; projectId: string; cardId: string }
  | { type: 'UNBURY_ALL'; projectId: string }
  | { type: 'COUNT_DUE'; projectId: string; sectionIds: string[]; cardType?: PickCardType }
  | { type: 'UPDATE_SCORE'; projectId: string; sectionId: string; correct: boolean }
  | { type: 'GET_SCORES'; projectId: string }
  | { type: 'RESET_SECTION'; projectId: string; sectionId: string }
  | { type: 'ADD_ACTIVITY'; projectId: string; sectionId: string; rating: number; correct: boolean }
  | { type: 'GET_ACTIVITY'; projectId: string; limit?: number }
  | { type: 'CLEAR_ACTIVITY'; projectId: string }
  | { type: 'ADD_NOTE'; projectId: string; text: string }
  | { type: 'GET_HOTKEYS' }
  | { type: 'SET_HOTKEY'; action: string; binding: string; context: string }
  | { type: 'GET_REVIEW_LOG'; projectId: string; limit?: number }
  | { type: 'SET_FSRS_PARAMS'; retention: number; leechThreshold?: number; maxInterval?: number }
  | { type: 'GET_PERFORMANCE_CARDS'; projectId: string }
  | { type: 'GET_SESSION_SUMMARY'; projectId: string }
  | { type: 'EXPORT_PROJECT_DATA'; projectId: string }
  | { type: 'EXPORT_GLOBAL_DATA' }
  | { type: 'IMPORT_PROJECT_DATA'; projectId: string; cards: CardRow[]; review_log: ReviewLogRow[]; scores: ScoreRow[]; activity: ActivityRow[]; notes: NoteRow[] }
  | { type: 'IMPORT_GLOBAL_DATA'; hotkeys: HotkeyRow[] }
  | { type: 'GET_DECK_STATS'; projectId: string }
  | { type: 'GET_PROJECT_CARD_COUNT'; projectId: string }
  | { type: 'GET_RETENTION'; projectId: string }
  | { type: 'GET_STUDY_PROGRESS'; projectId: string; desiredRetention: number; quotaKey?: string }
  | { type: 'GET_SECTION_STATS'; projectId: string }
  | { type: 'GET_ALL_PROJECT_IDS' }
  | { type: 'DELETE_PROJECT'; projectId: string };

export interface WorkerResponse {
  id: number;
  type: 'RESULT' | 'ERROR';
  data?: unknown;
  error?: string;
}

export interface WorkerMessage {
  id: number;
  request: WorkerRequest;
}

export interface CardRow {
  card_id: string;
  project_id: string;
  section_id: string;
  card_type: string;
  fsrs_state: number;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps?: number;
  reps: number;
  lapses: number;
  last_review: string | null;
  suspended: number;
  buried: number;
  buried_until?: string | null;
  leech: number;
  in_deck?: number;
  priority?: number;
  updated_at: string;
}

export interface StudyProgress {
  total: number;
  unseen: number;
  exposed: number;
  learning: number;
  recognized: number;
  due: number;
  estimatedRetrievability: number | null;
  durableRetention: number;
  introducedToday: number;
}

export interface ReviewLogRow {
  id: string;
  card_id: string;
  project_id: string;
  rating: number;
  review_time: string;
  section_id: string | null;
}

export interface ScoreRow {
  project_id: string;
  section_id: string;
  correct: number;
  attempted: number;
  updated_at: string;
}

export interface ActivityRow {
  id: string;
  project_id: string;
  section_id: string | null;
  rating: number;
  correct: number;
  timestamp: string;
}

export interface NoteRow {
  id: string;
  project_id: string;
  text: string;
  created_at: string;
}

export interface HotkeyRow {
  action: string;
  binding: string;
  context: string;
  updated_at: string | null;
}
