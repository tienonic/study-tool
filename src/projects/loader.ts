import type { ProjectData, Project, ProjectConfig, Section } from './types.ts';
import { getGlobalFSRSDefaults } from '../core/store/config.ts';
import { getCardTypeEntry } from './cardTypeRegistry.ts';
import { normalizeProjectData } from './textNormalization.ts';
import { cleanProjectStudyCopy } from './studyCopy.ts';
import { isCalendarDateKey } from '../utils/calendarDate.ts';

function buildDefaultConfig(): ProjectConfig {
  const fsrs = getGlobalFSRSDefaults();
  return {
    desired_retention: fsrs.desired_retention,
    new_per_session: fsrs.new_per_session,
    leech_threshold: fsrs.leech_threshold,
    max_interval: fsrs.max_interval,
    imageSearchSuffix: '',
    listening: { enabled: false },
  };
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildCardIds(section: Section): void {
  getCardTypeEntry(section.type).buildCardIds(section);
}

export function loadProject(data: ProjectData): Project {
  const normalizedData = cleanProjectStudyCopy(normalizeProjectData(data));
  const defaults = buildDefaultConfig();
  const config: ProjectConfig = {
    ...defaults,
    ...normalizedData.config,
    listening: { ...defaults.listening, ...normalizedData.config?.listening },
    study_goal: normalizedData.config?.study_goal
      ? { ...normalizedData.config.study_goal }
      : undefined,
  };
  const sections: Section[] = normalizedData.sections.map(s => {
    const section: Section = { ...s, cardIds: [], flashCardIds: [] };
    buildCardIds(section);
    return section;
  });

  return {
    name: normalizedData.name,
    slug: slugify(normalizedData.name),
    version: normalizedData.version ?? 1,
    config,
    sections,
    glossary: normalizedData.glossary ?? [],
  };
}

export function validateProject(data: unknown): string[] {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    errors.push('Invalid project data');
    return errors;
  }

  const d = data as Record<string, unknown>;
  if (!d.name || typeof d.name !== 'string') errors.push('Missing or invalid project name');
  else if (!slugify(d.name)) errors.push('Project name must contain at least one alphanumeric character');
  if (!Array.isArray(d.sections) || d.sections.length === 0) {
    errors.push('No sections defined');
  } else {
    const VALID_TYPES: Section['type'][] = ['mc-quiz', 'passage-quiz', 'math-gen'];
    const seenIds = new Set<string>();
    const seenCardIds = new Set<string>();
    for (const s of d.sections as Record<string, unknown>[]) {
      if (!s.id) errors.push('Section missing id');
      else if (seenIds.has(s.id as string)) errors.push(`Duplicate section id: "${s.id}"`);
      else seenIds.add(s.id as string);
      if (!s.name) errors.push('Section missing name');
      if (!s.type) {
        errors.push(`Section "${s.name || s.id}" missing type`);
      } else if (!VALID_TYPES.includes(s.type as Section['type'])) {
        errors.push(`Section "${s.name || s.id}" has invalid type: "${s.type}"`);
      }
      const hasFlashcards = Array.isArray(s.flashcards) && s.flashcards.length > 0;
      if (s.type === 'mc-quiz' && (!Array.isArray(s.questions) || s.questions.length === 0) && !hasFlashcards) {
        errors.push(`Section "${s.name}" has no questions`);
      } else if (s.type === 'mc-quiz' && Array.isArray(s.questions) && (s.questions as Record<string, unknown>[]).some(q => typeof q.q !== 'string' || typeof q.correct !== 'string' || !Array.isArray(q.wrong))) {
        errors.push(`Section "${s.name}" has a question missing "q" (string), "correct" (string), or "wrong" (array)`);
      }
      if (s.type === 'mc-quiz' && Array.isArray(s.questions)) {
        for (const [index, value] of (s.questions as unknown[]).entries()) {
          if (!value || typeof value !== 'object') continue;
          const label = `Section "${String(s.name ?? s.id)}" question ${index + 1}`;
          const suffix = validateStableId((value as Record<string, unknown>).id, label, errors) ?? String(index);
          registerCardId(`${String(s.id)}-${suffix}`, seenCardIds, errors);
        }
      }
      if (s.type === 'passage-quiz' && (!Array.isArray(s.scenarios) || s.scenarios.length === 0)) {
        errors.push(`Section "${s.name}" has no scenarios`);
      } else if (s.type === 'passage-quiz' && (s.scenarios as Record<string, unknown>[]).some(sc => typeof sc.passage !== 'string' || !Array.isArray(sc.questions) || (sc.questions as unknown[]).length === 0)) {
        errors.push(`Section "${s.name}" has a scenario missing "passage" (string) or "questions" array`);
      } else if (s.type === 'passage-quiz' && (s.scenarios as Record<string, unknown>[]).some(sc => (sc.questions as Record<string, unknown>[]).some(q => typeof q.q !== 'string' || typeof q.correct !== 'string' || !Array.isArray(q.wrong)))) {
        errors.push(`Section "${s.name}" has a scenario question missing "q" (string), "correct" (string), or "wrong" (array)`);
      }
      if (s.type === 'passage-quiz' && Array.isArray(s.scenarios)) {
        for (const [scenarioIndex, scenarioValue] of (s.scenarios as unknown[]).entries()) {
          if (!scenarioValue || typeof scenarioValue !== 'object') continue;
          const questions = (scenarioValue as Record<string, unknown>).questions;
          if (!Array.isArray(questions)) continue;
          for (const [questionIndex, questionValue] of questions.entries()) {
            if (!questionValue || typeof questionValue !== 'object') continue;
            const label = `Section "${String(s.name ?? s.id)}" scenario ${scenarioIndex + 1} question ${questionIndex + 1}`;
            const suffix = validateStableId((questionValue as Record<string, unknown>).id, label, errors)
              ?? `${scenarioIndex}-${questionIndex}`;
            registerCardId(`${String(s.id)}-${suffix}`, seenCardIds, errors);
          }
        }
      }
      if (Array.isArray(s.flashcards)) {
        for (const [index, value] of (s.flashcards as unknown[]).entries()) {
          const label = `Section "${String(s.name ?? s.id)}" flashcard ${index + 1}`;
          if (!value || typeof value !== 'object') {
            errors.push(`${label} is not an object`);
            continue;
          }
          const flashcard = value as Record<string, unknown>;
          if (typeof flashcard.front !== 'string' || typeof flashcard.back !== 'string') {
            errors.push(`${label} is missing "front" or "back" text`);
          }
          const suffix = validateStableId(flashcard.id, label, errors) ?? String(index);
          const fullId = `${String(s.id)}-flash-${suffix}`;
          registerCardId(fullId, seenCardIds, errors);
          validateVocabularyFlashcard(flashcard, label, errors);
        }
      }
      // generators is optional for math-gen — defaults to all categories if omitted
    }
  }

  validateProjectConfig(d.config, errors);

  return errors;
}

const VOCABULARY_FIELDS = [
  'lemma', 'display_form', 'pronunciation_en', 'meaning_en', 'usage_note',
  'part_of_speech', 'grammar', 'tags', 'source_refs', 'audio_text',
] as const;

function validateStableId(value: unknown, label: string, errors: string[]): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/.test(value)) {
    errors.push(`${label} has an invalid stable id`);
    return null;
  }
  return value;
}

function registerCardId(fullId: string, seenCardIds: Set<string>, errors: string[]): void {
  if (seenCardIds.has(fullId)) errors.push(`Duplicate card id: "${fullId}"`);
  seenCardIds.add(fullId);
}

function validateVocabularyFlashcard(
  flashcard: Record<string, unknown>,
  label: string,
  errors: string[],
): void {
  const usesVocabularyModel = VOCABULARY_FIELDS.some(field => flashcard[field] !== undefined)
    || flashcard.pronunciation_override !== undefined
    || flashcard.audio_src !== undefined;
  if (!usesVocabularyModel) return;

  if (typeof flashcard.id !== 'string' || flashcard.id.length === 0) {
    errors.push(`${label} uses vocabulary fields but has no stable id`);
  }
  for (const field of VOCABULARY_FIELDS) {
    const value = flashcard[field];
    if (field === 'tags' || field === 'source_refs') {
      if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || !item.trim())) {
        errors.push(`${label} has invalid or empty "${field}"`);
      }
    } else if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${label} has invalid or empty "${field}"`);
    }
  }
  if (flashcard.priority !== undefined
    && (typeof flashcard.priority !== 'number' || !Number.isInteger(flashcard.priority) || flashcard.priority < 1)) {
    errors.push(`${label} has an invalid priority`);
  }
  for (const optionalText of ['pronunciation_override', 'audio_src'] as const) {
    const value = flashcard[optionalText];
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      errors.push(`${label} has an invalid "${optionalText}"`);
    }
  }
}

function validateProjectConfig(value: unknown, errors: string[]): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('Invalid project config');
    return;
  }
  const config = value as Record<string, unknown>;
  if (config.listening !== undefined) {
    if (!config.listening || typeof config.listening !== 'object' || Array.isArray(config.listening)) {
      errors.push('Invalid listening config');
    } else {
      const listening = config.listening as Record<string, unknown>;
      if (typeof listening.enabled !== 'boolean') errors.push('Listening config requires a boolean "enabled" value');
      if (listening.rate !== undefined
        && (typeof listening.rate !== 'number' || !Number.isFinite(listening.rate) || listening.rate < 0.5 || listening.rate > 2)) {
        errors.push('Listening rate must be between 0.5 and 2');
      }
      if (listening.provider !== undefined
        && !['cached-audio', 'speech-synthesis', 'auto'].includes(String(listening.provider))) {
        errors.push('Listening config has an unsupported provider');
      }
      if (listening.play_on_flip !== undefined && typeof listening.play_on_flip !== 'boolean') {
        errors.push('Listening config "play_on_flip" must be boolean');
      }
    }
  }
  if (config.study_goal !== undefined) {
    if (!config.study_goal || typeof config.study_goal !== 'object' || Array.isArray(config.study_goal)) {
      errors.push('Invalid study goal config');
    } else {
      const goal = config.study_goal as Record<string, unknown>;
      for (const field of ['start_date', 'target_date'] as const) {
        if (goal[field] !== undefined && !isCalendarDateKey(goal[field])) {
          errors.push(`Study goal "${field}" must be a real date in YYYY-MM-DD form`);
        }
      }
      if (goal.weekend_multiplier !== undefined
        && (typeof goal.weekend_multiplier !== 'number'
          || !Number.isFinite(goal.weekend_multiplier)
          || goal.weekend_multiplier < 1
          || goal.weekend_multiplier > 4)) {
        errors.push('Study goal "weekend_multiplier" must be between 1 and 4');
      }
      if (typeof goal.start_date === 'string' && typeof goal.target_date === 'string' && goal.start_date > goal.target_date) {
        errors.push('Study goal start date must not be after its target date');
      }
    }
  }
}
