export interface Question {
  id?: string;
  q: string;
  correct: string;
  wrong: string[];
  imageName?: string;
  cropName?: string;
  explanation?: string;
  image?: string;
}

export interface Scenario {
  passage: string;
  source?: string;
  image?: string;
  questions: Question[];
}

export interface Flashcard {
  /** Stable within its section. Existing decks may continue to use index-based IDs. */
  id?: string;
  front: string;
  back: string;
  frontImage?: string;
  backImage?: string;
  /** Lower values are introduced first when a deck has a finite study goal. */
  priority?: number;
  lemma?: string;
  display_form?: string;
  pronunciation_en?: string;
  meaning_en?: string;
  usage_note?: string;
  part_of_speech?: string;
  grammar?: string;
  tags?: string[];
  source_refs?: string[];
  audio_text?: string;
  pronunciation_override?: string;
  audio_src?: string;
}

export interface Section {
  id: string;
  name: string;
  type: 'mc-quiz' | 'passage-quiz' | 'math-gen';
  questions?: Question[];
  scenarios?: Scenario[];
  generators?: string[];
  hasFlashcards?: boolean;
  hasImages?: boolean;
  flashcards?: Flashcard[];
  tips?: string[];
  instruction?: string;
  cardIds: string[];
  flashCardIds: string[];
}

export interface TimerConfig {
  warnAt: number;   // seconds: timer turns red
  failAt: number;   // seconds: skull icon / auto-rates Again
}

export interface ProjectConfig {
  learning?: import('../features/learning/model.ts').LearningConfig;
  desired_retention: number;
  new_per_session: number;
  leech_threshold: number;
  max_interval: number;
  imageSearchSuffix: string;
  prefer_project_config?: boolean;
  prefer_project_config_until?: string;
  timerConfigs?: Record<string, TimerConfig>;
  listening: ListeningConfig;
  study_goal?: StudyGoalConfig;
}

export type ListeningProvider = 'cached-audio' | 'speech-synthesis' | 'auto';

export interface ListeningConfig {
  enabled: boolean;
  provider?: ListeningProvider;
  locale?: string;
  voice?: string;
  rate?: number;
  engine_version?: string;
  autoplay?: boolean;
  /** Play the target word after either direction of a flashcard flip. Defaults on for language decks. */
  play_on_flip?: boolean;
}

export interface StudyGoalConfig {
  /** Local calendar date in YYYY-MM-DD form. */
  start_date?: string;
  /** Local calendar date in YYYY-MM-DD form. */
  target_date?: string;
  /** Relative share of unseen-card exposure assigned to Saturday and Sunday. */
  weekend_multiplier?: number;
}

export interface ProjectData {
  name: string;
  version?: number;
  config?: Partial<ProjectConfig>;
  sections: Omit<Section, 'cardIds' | 'flashCardIds'>[];
  glossary?: { term: string; def: string; hasImage?: boolean }[];
}

export interface Project {
  name: string;
  slug: string;
  version: number;
  config: ProjectConfig;
  sections: Section[];
  glossary: { term: string; def: string; hasImage?: boolean }[];
  sourceFolder?: string;
}

export interface RegistryEntry {
  name: string;
  slug: string;
  folder: string;
  loader: () => Promise<ProjectData>;
}
