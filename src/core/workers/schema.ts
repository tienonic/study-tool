import type { SQLiteAPI } from 'wa-sqlite';

export const SCHEMA_VERSION = 4;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS cards (
  project_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  card_type TEXT NOT NULL CHECK(card_type IN ('mcq','passage','flashcard')),
  fsrs_state INTEGER DEFAULT 0,
  due TEXT DEFAULT (datetime('now')),
  stability REAL DEFAULT 0,
  difficulty REAL DEFAULT 0,
  elapsed_days INTEGER DEFAULT 0,
  scheduled_days INTEGER DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0 CHECK(learning_steps >= 0),
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  last_review TEXT,
  suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN (0,1)),
  buried INTEGER NOT NULL DEFAULT 0 CHECK(buried IN (0,1)),
  buried_until TEXT,
  leech INTEGER NOT NULL DEFAULT 0 CHECK(leech IN (0,1)),
  in_deck INTEGER NOT NULL DEFAULT 1 CHECK(in_deck IN (0,1)),
  priority INTEGER NOT NULL DEFAULT 100 CHECK(priority >= 1),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(project_id, in_deck, due);
CREATE INDEX IF NOT EXISTS idx_cards_section ON cards(project_id, in_deck, section_id);
CREATE INDEX IF NOT EXISTS idx_cards_new_priority ON cards(project_id, in_deck, fsrs_state, priority, card_id);

CREATE TABLE IF NOT EXISTS review_log (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  review_time TEXT NOT NULL,
  section_id TEXT
);

CREATE TABLE IF NOT EXISTS scores (
  project_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  correct INTEGER DEFAULT 0,
  attempted INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, section_id)
);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  section_id TEXT,
  rating INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hotkeys (
  action TEXT PRIMARY KEY,
  binding TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT 'global',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS undo_stack (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  review_log_id TEXT NOT NULL,
  activity_id TEXT,
  prev_state TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_undo_project ON undo_stack(project_id, id);

CREATE TABLE IF NOT EXISTS daily_new (
  project_id TEXT NOT NULL,
  date TEXT NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, date, key)
);
`;

export async function migrateToV3(sqlite3: SQLiteAPI, db: number): Promise<void> {
  await sqlite3.exec(db, `
    ALTER TABLE cards RENAME TO cards_v2;

    CREATE TABLE cards (
      project_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      card_type TEXT NOT NULL CHECK(card_type IN ('mcq','passage','flashcard')),
      fsrs_state INTEGER DEFAULT 0,
      due TEXT DEFAULT (datetime('now')),
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      elapsed_days INTEGER DEFAULT 0,
      scheduled_days INTEGER DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      last_review TEXT,
      suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN (0,1)),
      buried INTEGER NOT NULL DEFAULT 0 CHECK(buried IN (0,1)),
      buried_until TEXT,
      leech INTEGER NOT NULL DEFAULT 0 CHECK(leech IN (0,1)),
      in_deck INTEGER NOT NULL DEFAULT 1 CHECK(in_deck IN (0,1)),
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, card_id)
    );

    INSERT INTO cards (
      project_id, card_id, section_id, card_type, fsrs_state, due, stability,
      difficulty, elapsed_days, scheduled_days, reps, lapses, last_review,
      suspended, buried, buried_until, leech, in_deck, updated_at
    )
    SELECT
      project_id, card_id, section_id, card_type, fsrs_state, due, stability,
      difficulty, elapsed_days, scheduled_days, reps, lapses, last_review,
      COALESCE(suspended, 0), COALESCE(buried, 0),
      CASE WHEN COALESCE(buried, 0) = 1 THEN date(updated_at, 'localtime', '+1 day') ELSE NULL END,
      COALESCE(leech, 0), 1, updated_at
    FROM cards_v2;

    DROP TABLE cards_v2;
    CREATE INDEX idx_cards_due ON cards(project_id, in_deck, due);
    CREATE INDEX idx_cards_section ON cards(project_id, in_deck, section_id);

    DROP TABLE undo_stack;
    CREATE TABLE undo_stack (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      review_log_id TEXT NOT NULL,
      activity_id TEXT,
      prev_state TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_undo_project ON undo_stack(project_id, id);
  `);
}

export async function migrateToV4(sqlite3: SQLiteAPI, db: number): Promise<void> {
  await sqlite3.exec(db, `
    ALTER TABLE cards ADD COLUMN priority INTEGER NOT NULL DEFAULT 100 CHECK(priority >= 1);
    ALTER TABLE cards ADD COLUMN learning_steps INTEGER NOT NULL DEFAULT 0 CHECK(learning_steps >= 0);
    CREATE INDEX idx_cards_new_priority ON cards(project_id, in_deck, fsrs_state, priority, card_id);
  `);
}
