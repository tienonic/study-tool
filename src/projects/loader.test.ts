import { describe, it, expect } from 'vitest';
import { validateProject, loadProject } from './loader.ts';
import type { ProjectData } from './types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid mc-quiz ProjectData */
function validMcProject(overrides?: Partial<ProjectData>): ProjectData {
  return {
    name: 'Test Project',
    sections: [{
      id: 'sec1',
      name: 'Section 1',
      type: 'mc-quiz',
      questions: [{ q: 'Q?', correct: 'A', wrong: ['B'] }],
    }],
    ...overrides,
  };
}

/** Minimal valid passage-quiz ProjectData */
function validPassageProject(overrides?: Partial<ProjectData>): ProjectData {
  return {
    name: 'Passage Project',
    sections: [{
      id: 'pass1',
      name: 'Passage 1',
      type: 'passage-quiz',
      scenarios: [{
        passage: 'Some passage',
        questions: [{ q: 'Q?', correct: 'A', wrong: ['B'] }],
      }],
    }],
    ...overrides,
  };
}

/** Minimal valid math-gen ProjectData */
function validMathProject(overrides?: Partial<ProjectData>): ProjectData {
  return {
    name: 'Math Project',
    sections: [{
      id: 'math1',
      name: 'Math 1',
      type: 'math-gen',
      generators: ['add'],
    }],
    ...overrides,
  };
}

// ===========================================================================
// validateProject
// ===========================================================================

describe('validateProject', () => {
  // ---- Input type guards ----

  describe('input type guards', () => {
    it('rejects null', () => {
      expect(validateProject(null)).toContain('Invalid project data');
    });

    it('rejects undefined', () => {
      expect(validateProject(undefined)).toContain('Invalid project data');
    });

    it('rejects a string', () => {
      expect(validateProject('hello')).toContain('Invalid project data');
    });

    it('rejects a number', () => {
      expect(validateProject(42)).toContain('Invalid project data');
    });

    it('treats arrays as objects (missing name + sections)', () => {
      const errors = validateProject([1, 2]);
      expect(errors).toContain('Missing or invalid project name');
      expect(errors).toContain('No sections defined');
    });

    it('returns early with one error for non-objects', () => {
      expect(validateProject(null)).toHaveLength(1);
    });
  });

  // ---- Top-level fields ----

  describe('top-level fields', () => {
    it('errors on missing name', () => {
      const errors = validateProject({ sections: [{ id: 'a', name: 'A', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] }] });
      expect(errors).toContain('Missing or invalid project name');
    });

    it('errors on empty string name', () => {
      const errors = validateProject({ name: '', sections: [{ id: 'a', name: 'A', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] }] });
      expect(errors).toContain('Missing or invalid project name');
    });

    it('errors on missing sections', () => {
      const errors = validateProject({ name: 'X' });
      expect(errors).toContain('No sections defined');
    });

    it('errors on empty sections array', () => {
      const errors = validateProject({ name: 'X', sections: [] });
      expect(errors).toContain('No sections defined');
    });

    it('errors on non-array sections', () => {
      const errors = validateProject({ name: 'X', sections: 'bad' });
      expect(errors).toContain('No sections defined');
    });

    it('reports both missing name and sections', () => {
      const errors = validateProject({});
      expect(errors).toContain('Missing or invalid project name');
      expect(errors).toContain('No sections defined');
      expect(errors).toHaveLength(2);
    });
  });

  // ---- Section fields ----

  describe('section fields', () => {
    it('errors on missing section id', () => {
      const errors = validateProject({ name: 'X', sections: [{ name: 'A', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] }] });
      expect(errors).toContain('Section missing id');
    });

    it('errors on missing section name', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'a', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] }] });
      expect(errors).toContain('Section missing name');
    });

    it('errors on missing section type', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'a', name: 'A', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] }] });
      expect(errors).toContain('Section "A" missing type');
    });

    it('errors on invalid section type', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'a', name: 'A', type: 'bad-type' }] });
      expect(errors).toContain('Section "A" has invalid type: "bad-type"');
    });

    it('errors on duplicate section ids', () => {
      const errors = validateProject({
        name: 'X',
        sections: [
          { id: 'dup', name: 'A', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] },
          { id: 'dup', name: 'B', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] },
        ],
      });
      expect(errors).toContain('Duplicate section id: "dup"');
    });

    it('allows distinct section ids', () => {
      const data = validMcProject({
        sections: [
          { id: 'a', name: 'A', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] },
          { id: 'b', name: 'B', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] },
        ],
      });
      expect(validateProject(data)).toHaveLength(0);
    });
  });

  // ---- Per-type content ----

  describe('mc-quiz content', () => {
    it('errors when questions missing', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'a', name: 'A', type: 'mc-quiz' }] });
      expect(errors).toContain('Section "A" has no questions');
    });

    it('errors when questions empty', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'a', name: 'A', type: 'mc-quiz', questions: [] }] });
      expect(errors).toContain('Section "A" has no questions');
    });

    it('passes with valid questions', () => {
      expect(validateProject(validMcProject())).toHaveLength(0);
    });

    it('rejects duplicate and invalid stable question IDs', () => {
      const errors = validateProject(validMcProject({
        sections: [{
          id: 'quiz', name: 'Quiz', type: 'mc-quiz',
          questions: [
            { id: 'same', q: 'Q1', correct: 'A', wrong: ['B'] },
            { id: 'same', q: 'Q2', correct: 'A', wrong: ['B'] },
            { id: 'Not Stable', q: 'Q3', correct: 'A', wrong: ['B'] },
          ],
        }],
      }));

      expect(errors).toContain('Duplicate card id: "quiz-same"');
      expect(errors).toContain('Section "Quiz" question 3 has an invalid stable id');
    });

    it('allows a flashcard-only section without placeholder questions', () => {
      const errors = validateProject({
        name: 'Vocabulary',
        sections: [{
          id: 'words',
          name: 'Words',
          type: 'mc-quiz',
          hasFlashcards: true,
          flashcards: [{ front: 'palabra', back: 'word' }],
        }],
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('passage-quiz content', () => {
    it('errors when scenarios missing', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'a', name: 'A', type: 'passage-quiz' }] });
      expect(errors).toContain('Section "A" has no scenarios');
    });

    it('errors when scenarios empty', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'a', name: 'A', type: 'passage-quiz', scenarios: [] }] });
      expect(errors).toContain('Section "A" has no scenarios');
    });

    it('passes with valid scenarios', () => {
      expect(validateProject(validPassageProject())).toHaveLength(0);
    });

    it('rejects duplicate stable question IDs across scenarios', () => {
      const errors = validateProject(validPassageProject({
        sections: [{
          id: 'pass', name: 'Passage', type: 'passage-quiz',
          scenarios: [
            { passage: 'First', questions: [{ id: 'same', q: 'Q1', correct: 'A', wrong: ['B'] }] },
            { passage: 'Second', questions: [{ id: 'same', q: 'Q2', correct: 'A', wrong: ['B'] }] },
          ],
        }],
      }));

      expect(errors).toContain('Duplicate card id: "pass-same"');
    });
  });

  describe('math-gen content', () => {
    it('allows missing generators (defaults to all categories)', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'a', name: 'A', type: 'math-gen' }] });
      expect(errors).toHaveLength(0);
    });

    it('allows empty generators (defaults to all categories)', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'a', name: 'A', type: 'math-gen', generators: [] }] });
      expect(errors).toHaveLength(0);
    });

    it('passes with valid generators', () => {
      expect(validateProject(validMathProject())).toHaveLength(0);
    });
  });

  // ---- Error accumulation & fallback ----

  describe('error accumulation', () => {
    it('accumulates errors across multiple sections', () => {
      const errors = validateProject({
        name: 'X',
        sections: [
          { id: 'a', name: 'A', type: 'mc-quiz' },
          { id: 'b', name: 'B', type: 'passage-quiz' },
        ],
      });
      expect(errors).toContain('Section "A" has no questions');
      expect(errors).toContain('Section "B" has no scenarios');
    });

    it('falls back to id when name missing in type error', () => {
      const errors = validateProject({ name: 'X', sections: [{ id: 'only-id', type: 'bad' }] });
      expect(errors).toContain('Section missing name');
      expect(errors).toContain('Section "only-id" has invalid type: "bad"');
    });
  });

  describe('rich vocabulary cards', () => {
    const vocabularyCard = {
      id: 'restaurante',
      front: 'restaurante',
      back: 'restaurant',
      priority: 1,
      lemma: 'restaurante',
      display_form: 'restaurante',
      pronunciation_en: 'rehs-tow-RAHN-teh',
      meaning_en: 'restaurant',
      usage_note: 'A neutral word for a sit-down restaurant.',
      part_of_speech: 'noun',
      grammar: 'Masculine noun.',
      tags: ['travel', 'priority:1'],
      source_refs: ['source:fixture'],
      audio_text: 'restaurante',
    };

    it('accepts a complete auditable vocabulary card', () => {
      const project = validMcProject({
        config: { listening: { enabled: true, locale: 'es-ES' } },
        sections: [{
          id: 'vocab', name: 'Vocabulary', type: 'mc-quiz',
          questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }],
          flashcards: [vocabularyCard],
        }],
      });
      expect(validateProject(project)).toEqual([]);
    });

    it('rejects incomplete vocabulary records and duplicate stable IDs', () => {
      const incomplete = { ...vocabularyCard, meaning_en: '', source_refs: [] as string[] };
      const errors = validateProject(validMcProject({
        sections: [{
          id: 'vocab', name: 'Vocabulary', type: 'mc-quiz',
          questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }],
          flashcards: [incomplete, vocabularyCard],
        }],
      }));
      expect(errors).toContain('Section "Vocabulary" flashcard 1 has invalid or empty "meaning_en"');
      expect(errors).toContain('Section "Vocabulary" flashcard 1 has invalid or empty "source_refs"');
      expect(errors).toContain('Duplicate card id: "vocab-flash-restaurante"');
    });

    it('validates listening and finite-goal settings', () => {
      const errors = validateProject(validMcProject({
        config: {
          listening: { enabled: true, rate: 4 },
          study_goal: { start_date: '2030-01-20', target_date: '2030-01-15' },
        },
      }));
      expect(errors).toContain('Listening rate must be between 0.5 and 2');
      expect(errors).toContain('Study goal start date must not be after its target date');
    });

    it('rejects impossible goal dates and out-of-range weekend intensity', () => {
      const errors = validateProject(validMcProject({
        config: {
          study_goal: { start_date: '2030-02-30', target_date: '2030-03-01', weekend_multiplier: 5 },
        },
      }));

      expect(errors).toContain('Study goal "start_date" must be a real date in YYYY-MM-DD form');
      expect(errors).toContain('Study goal "weekend_multiplier" must be between 1 and 4');
    });
  });
});

// ===========================================================================
// loadProject
// ===========================================================================

describe('loadProject', () => {
  // ---- Config merging ----

  describe('config', () => {
    it('uses all defaults when no config provided', () => {
      const p = loadProject(validMcProject());
      expect(p.config.desired_retention).toBe(0.9);
      expect(p.config.new_per_session).toBe(20);
      expect(p.config.leech_threshold).toBe(8);
      expect(p.config.imageSearchSuffix).toBe('');
      expect(p.config.listening).toEqual({ enabled: false });
    });

    it('overrides a single config field', () => {
      const p = loadProject(validMcProject({ config: { desired_retention: 0.85 } }));
      expect(p.config.desired_retention).toBe(0.85);
      expect(p.config.new_per_session).toBe(20); // default preserved
    });

    it('overrides multiple config fields', () => {
      const p = loadProject(validMcProject({ config: { new_per_session: 10, leech_threshold: 5 } }));
      expect(p.config.new_per_session).toBe(10);
      expect(p.config.leech_threshold).toBe(5);
    });

    it('preserves imageSearchSuffix override', () => {
      const p = loadProject(validMcProject({ config: { imageSearchSuffix: 'site:example.com' } }));
      expect(p.config.imageSearchSuffix).toBe('site:example.com');
    });

    it('deep-merges deck-scoped listening settings', () => {
      const p = loadProject(validMcProject({
        config: { listening: { enabled: true, locale: 'es-ES', rate: 0.9 } },
      }));
      expect(p.config.listening).toEqual({ enabled: true, locale: 'es-ES', rate: 0.9 });
    });

    it('preserves deck-scoped finite study settings', () => {
      const p = loadProject(validMcProject({
        config: { study_goal: { start_date: '2030-01-07', target_date: '2030-01-15', weekend_multiplier: 2 } },
      }));
      expect(p.config.study_goal).toEqual({
        start_date: '2030-01-07', target_date: '2030-01-15', weekend_multiplier: 2,
      });
    });
  });

  // ---- Slugify ----

  describe('slug', () => {
    it('lowercases the name', () => {
      expect(loadProject(validMcProject({ name: 'MyProject' })).slug).toBe('myproject');
    });

    it('replaces spaces with hyphens', () => {
      expect(loadProject(validMcProject({ name: 'My Project' })).slug).toBe('my-project');
    });

    it('replaces special characters with hyphens', () => {
      expect(loadProject(validMcProject({ name: 'A@B#C' })).slug).toBe('a-b-c');
    });

    it('collapses consecutive non-alnum to single hyphen', () => {
      expect(loadProject(validMcProject({ name: 'foo   bar' })).slug).toBe('foo-bar');
    });

    it('trims leading hyphens', () => {
      expect(loadProject(validMcProject({ name: '  Leading' })).slug).toBe('leading');
    });

    it('trims trailing hyphens', () => {
      expect(loadProject(validMcProject({ name: 'Trailing!!' })).slug).toBe('trailing');
    });

    it('passes through clean names', () => {
      expect(loadProject(validMcProject({ name: 'simple' })).slug).toBe('simple');
    });
  });

  // ---- Version & glossary defaults ----

  describe('version and glossary', () => {
    it('defaults version to 1', () => {
      expect(loadProject(validMcProject()).version).toBe(1);
    });

    it('preserves explicit version', () => {
      expect(loadProject(validMcProject({ version: 3 })).version).toBe(3);
    });

    it('defaults glossary to empty array', () => {
      expect(loadProject(validMcProject()).glossary).toEqual([]);
    });

    it('preserves provided glossary', () => {
      const glossary = [{ term: 'foo', def: 'bar' }];
      expect(loadProject(validMcProject({ glossary })).glossary).toEqual(glossary);
    });
  });

  // ---- mc-quiz cardIds ----

  describe('mc-quiz cardIds', () => {
    it('generates cardIds in {id}-{index} format', () => {
      const data = validMcProject({
        sections: [{
          id: 'sec1',
          name: 'S',
          type: 'mc-quiz',
          questions: [
            { q: 'Q1', correct: 'A', wrong: ['B'] },
            { q: 'Q2', correct: 'A', wrong: ['B'] },
            { q: 'Q3', correct: 'A', wrong: ['B'] },
          ],
        }],
      });
      const p = loadProject(data);
      expect(p.sections[0].cardIds).toEqual(['sec1-0', 'sec1-1', 'sec1-2']);
    });

    it('count matches number of questions', () => {
      const questions = Array.from({ length: 5 }, (_, i) => ({ q: `Q${i}`, correct: 'A', wrong: ['B'] }));
      const p = loadProject(validMcProject({ sections: [{ id: 'x', name: 'X', type: 'mc-quiz', questions }] }));
      expect(p.sections[0].cardIds).toHaveLength(5);
    });

    it('handles hyphenated section ids', () => {
      const p = loadProject(validMcProject({
        sections: [{ id: 'my-section-1', name: 'S', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] }],
      }));
      expect(p.sections[0].cardIds[0]).toBe('my-section-1-0');
    });

    it('produces empty cardIds when no questions', () => {
      const p = loadProject({ name: 'X', sections: [{ id: 'a', name: 'A', type: 'mc-quiz' }] } as ProjectData);
      expect(p.sections[0].cardIds).toEqual([]);
    });
  });

  // ---- passage-quiz cardIds ----

  describe('passage-quiz cardIds', () => {
    it('generates cardIds in {id}-{scenarioIdx}-{questionIdx} format', () => {
      const p = loadProject(validPassageProject());
      expect(p.sections[0].cardIds).toEqual(['pass1-0-0']);
    });

    it('handles multiple scenarios with multiple questions', () => {
      const data = validPassageProject({
        sections: [{
          id: 'p',
          name: 'P',
          type: 'passage-quiz',
          scenarios: [
            { passage: 'P1', questions: [{ q: 'Q1', correct: 'A', wrong: ['B'] }, { q: 'Q2', correct: 'A', wrong: ['B'] }] },
            { passage: 'P2', questions: [{ q: 'Q3', correct: 'A', wrong: ['B'] }] },
          ],
        }],
      });
      const p = loadProject(data);
      expect(p.sections[0].cardIds).toEqual(['p-0-0', 'p-0-1', 'p-1-0']);
    });
  });

  // ---- math-gen cardIds ----

  describe('math-gen cardIds', () => {
    it('always produces empty cardIds', () => {
      const p = loadProject(validMathProject());
      expect(p.sections[0].cardIds).toEqual([]);
    });

    it('always produces empty flashCardIds', () => {
      const p = loadProject(validMathProject());
      expect(p.sections[0].flashCardIds).toEqual([]);
    });
  });

  // ---- flashCardIds ----

  describe('flashCardIds', () => {
    it('generates flashCardIds in {id}-flash-{index} format', () => {
      const data = validMcProject({
        sections: [{
          id: 'sec1',
          name: 'S',
          type: 'mc-quiz',
          questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }],
          flashcards: [{ front: 'F1', back: 'B1' }, { front: 'F2', back: 'B2' }],
        }],
      });
      const p = loadProject(data);
      expect(p.sections[0].flashCardIds).toEqual(['sec1-flash-0', 'sec1-flash-1']);
    });

    it('works with any section type', () => {
      const data = validMathProject({
        sections: [{
          id: 'math1',
          name: 'M',
          type: 'math-gen',
          generators: ['add'],
          flashcards: [{ front: 'F', back: 'B' }],
        }],
      });
      const p = loadProject(data);
      expect(p.sections[0].flashCardIds).toEqual(['math1-flash-0']);
    });

    it('is empty when no flashcards property', () => {
      const p = loadProject(validMcProject());
      expect(p.sections[0].flashCardIds).toEqual([]);
    });

    it('is orthogonal to main cardIds', () => {
      const data = validMcProject({
        sections: [{
          id: 's',
          name: 'S',
          type: 'mc-quiz',
          questions: [{ q: 'Q1', correct: 'A', wrong: ['B'] }, { q: 'Q2', correct: 'A', wrong: ['B'] }],
          flashcards: [{ front: 'F', back: 'B' }],
        }],
      });
      const p = loadProject(data);
      expect(p.sections[0].cardIds).toEqual(['s-0', 's-1']);
      expect(p.sections[0].flashCardIds).toEqual(['s-flash-0']);
    });

    it('uses explicit IDs so card identity survives reordering', () => {
      const make = (flashcards: NonNullable<ProjectData['sections'][number]['flashcards']>) => loadProject(validMcProject({
        sections: [{
          id: 'stable', name: 'Stable', type: 'mc-quiz',
          questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }],
          flashcards,
        }],
      }));
      const first = make([
        { id: 'hola', front: 'hola', back: 'hello' },
        { id: 'gracias', front: 'gracias', back: 'thank you' },
      ]);
      const reordered = make([
        { id: 'gracias', front: 'gracias', back: 'thank you' },
        { id: 'hola', front: 'hola', back: 'hello' },
      ]);

      expect(first.sections[0].flashCardIds).toEqual(['stable-flash-hola', 'stable-flash-gracias']);
      expect(reordered.sections[0].flashCardIds).toEqual(['stable-flash-gracias', 'stable-flash-hola']);
    });
  });

  // ---- Multi-section independence ----

  describe('multi-section', () => {
    it('builds cardIds independently per section', () => {
      const data: ProjectData = {
        name: 'Multi',
        sections: [
          { id: 'mc', name: 'MC', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] },
          { id: 'pass', name: 'Pass', type: 'passage-quiz', scenarios: [{ passage: 'P', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] }] },
          { id: 'math', name: 'Math', type: 'math-gen', generators: ['add'] },
        ],
      };
      const p = loadProject(data);
      expect(p.sections[0].cardIds).toEqual(['mc-0']);
      expect(p.sections[1].cardIds).toEqual(['pass-0-0']);
      expect(p.sections[2].cardIds).toEqual([]);
    });

    it('does not mutate the input data', () => {
      const data = validMcProject();
      const original = JSON.parse(JSON.stringify(data));
      loadProject(data);
      expect(data).toEqual(original);
    });
  });
});
