import { describe, it, expect } from 'vitest';
import { shuffle } from './utils/shuffle.ts';

import { loadProject, validateProject } from './projects/loader.ts';
import { parseGeneratedQuestions, buildInsightsPrompt, buildGeneratePrompt, buildTargetedPrompt, formatPerformanceSummary, formatSampleQuestions } from './features/ai/prompts.ts';

// === shuffle.ts ===
describe('shuffle', () => {
  it('returns a new array of same length', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = shuffle(arr);
    expect(result).toHaveLength(5);
    expect(result).not.toBe(arr); // new reference
  });

  it('contains all original elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = shuffle(arr);
    expect(result.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not mutate original', () => {
    const arr = [1, 2, 3];
    shuffle(arr);
    expect(arr).toEqual([1, 2, 3]);
  });

  it('handles empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('handles single element', () => {
    expect(shuffle([42])).toEqual([42]);
  });
});


// === loader.ts ===
describe('loadProject', () => {
  const minimalProject = {
    name: 'Test Project',
    sections: [
      {
        id: 'sec1',
        name: 'Section 1',
        type: 'mc-quiz' as const,
        questions: [
          { q: 'Q1?', correct: 'A', wrong: ['B', 'C', 'D'] },
          { q: 'Q2?', correct: 'X', wrong: ['Y', 'Z'] },
        ],
      },
    ],
  };

  it('returns project with default config', () => {
    const project = loadProject(minimalProject);
    expect(project.name).toBe('Test Project');
    expect(project.config.desired_retention).toBe(0.9);
    expect(project.config.new_per_session).toBe(20);
    expect(project.config.leech_threshold).toBe(8);
  });

  it('generates slug from name', () => {
    const project = loadProject(minimalProject);
    expect(project.slug).toBe('test-project');
  });

  it('builds card IDs for mc-quiz', () => {
    const project = loadProject(minimalProject);
    const section = project.sections[0];
    expect(section.cardIds).toEqual(['sec1-0', 'sec1-1']);
    expect(section.flashCardIds).toEqual([]);
  });

  it('builds card IDs for passage-quiz', () => {
    const project = loadProject({
      name: 'Passage Test',
      sections: [{
        id: 'pass1',
        name: 'Passages',
        type: 'passage-quiz' as const,
        scenarios: [
          { passage: 'Text', questions: [{ q: 'Q1', correct: 'A', wrong: ['B'] }, { q: 'Q2', correct: 'C', wrong: ['D'] }] },
          { passage: 'Text2', questions: [{ q: 'Q3', correct: 'E', wrong: ['F'] }] },
        ],
      }],
    });
    expect(project.sections[0].cardIds).toEqual(['pass1-0-0', 'pass1-0-1', 'pass1-1-0']);
  });

  it('builds flashcard IDs', () => {
    const project = loadProject({
      name: 'Flash Test',
      sections: [{
        id: 'flash1',
        name: 'Cards',
        type: 'mc-quiz' as const,
        questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }],
        flashcards: [{ front: 'F1', back: 'B1' }, { front: 'F2', back: 'B2' }],
      }],
    });
    const section = project.sections[0];
    expect(section.cardIds).toEqual(['flash1-0']);
    expect(section.flashCardIds).toEqual(['flash1-flash-0', 'flash1-flash-1']);
  });

  it('merges custom config over defaults', () => {
    const project = loadProject({
      ...minimalProject,
      config: { desired_retention: 0.85, new_per_session: 10 },
    });
    expect(project.config.desired_retention).toBe(0.85);
    expect(project.config.new_per_session).toBe(10);
    expect(project.config.leech_threshold).toBe(8); // default preserved
  });
});

describe('validateProject', () => {
  it('passes valid project', () => {
    const errors = validateProject({
      name: 'Good',
      sections: [{ id: 's1', name: 'S1', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] }],
    });
    expect(errors).toEqual([]);
  });

  it('rejects null', () => {
    expect(validateProject(null)).toContain('Invalid project data');
  });

  it('rejects missing name', () => {
    const errors = validateProject({ sections: [{ id: 's1', name: 'S', type: 'mc-quiz', questions: [{}] }] });
    expect(errors).toContain('Missing or invalid project name');
  });

  it('rejects empty sections', () => {
    const errors = validateProject({ name: 'X', sections: [] });
    expect(errors.some(e => e.includes('No sections'))).toBe(true);
  });

  it('rejects duplicate section IDs', () => {
    const errors = validateProject({
      name: 'X',
      sections: [
        { id: 'dup', name: 'A', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] },
        { id: 'dup', name: 'B', type: 'mc-quiz', questions: [{ q: 'Q', correct: 'A', wrong: ['B'] }] },
      ],
    });
    expect(errors.some(e => e.includes('Duplicate'))).toBe(true);
  });

  it('rejects invalid section type', () => {
    const errors = validateProject({
      name: 'X',
      sections: [{ id: 's1', name: 'S', type: 'unknown' }],
    });
    expect(errors.some(e => e.includes('invalid type'))).toBe(true);
  });

  it('rejects mc-quiz without questions', () => {
    const errors = validateProject({
      name: 'X',
      sections: [{ id: 's1', name: 'S', type: 'mc-quiz', questions: [] }],
    });
    expect(errors.some(e => e.includes('no questions'))).toBe(true);
  });
});

// === AI prompts.ts ===
describe('parseGeneratedQuestions', () => {
  it('parses clean JSON array', () => {
    const json = JSON.stringify([
      { q: 'What is 2+2?', correct: '4', wrong: ['3', '5', '6'] },
    ]);
    const result = parseGeneratedQuestions(json);
    expect(result).toHaveLength(1);
    expect(result[0].q).toBe('What is 2+2?');
    expect(result[0].correct).toBe('4');
    expect(result[0].wrong).toEqual(['3', '5', '6']);
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n[{"q":"Q","correct":"A","wrong":["B","C","D"]}]\n```';
    const result = parseGeneratedQuestions(raw);
    expect(result).toHaveLength(1);
  });

  it('strips code fences with extra whitespace', () => {
    const raw = '```json  \n[{"q":"Q","correct":"A","wrong":["B","C","D"]}]\n```  ';
    const result = parseGeneratedQuestions(raw);
    expect(result).toHaveLength(1);
  });

  it('handles leading text before JSON array', () => {
    const raw = 'Here are the questions:\n[{"q":"Q","correct":"A","wrong":["B","C","D"]}]';
    const result = parseGeneratedQuestions(raw);
    expect(result).toHaveLength(1);
  });

  it('filters out invalid questions', () => {
    const json = JSON.stringify([
      { q: 'Good?', correct: 'Yes', wrong: ['No', 'Maybe', 'Sometimes'] },
      { q: '', correct: 'A', wrong: ['B', 'C', 'D'] },          // empty q
      { correct: 'A', wrong: ['B', 'C', 'D'] },                  // missing q
      { q: 'Q', wrong: ['B', 'C', 'D'] },                        // missing correct
      { q: 'Q', correct: 'A' },                                   // missing wrong
      { q: 'Q', correct: 'A', wrong: [] },                        // empty wrong
      { q: 'Q', correct: 'A', wrong: ['B'] },                     // too few wrong
    ]);
    const result = parseGeneratedQuestions(json);
    expect(result).toHaveLength(1);
    expect(result[0].q).toBe('Good?');
  });

  it('returns empty for garbage input', () => {
    expect(parseGeneratedQuestions('not json at all')).toEqual([]);
    expect(parseGeneratedQuestions('')).toEqual([]);
  });

  it('preserves optional explanation', () => {
    const json = JSON.stringify([
      { q: 'Q', correct: 'A', wrong: ['B', 'C', 'D'], explanation: 'Because...' },
    ]);
    const result = parseGeneratedQuestions(json);
    expect(result[0].explanation).toBe('Because...');
  });
});

describe('buildInsightsPrompt', () => {
  it('includes system prompt and performance data', () => {
    const prompt = buildInsightsPrompt('Section X: 80% accuracy');
    expect(prompt).toContain('spaced-repetition study coach');
    expect(prompt).toContain('Section X: 80% accuracy');
  });
});

describe('buildGeneratePrompt', () => {
  it('includes count and source text', () => {
    const prompt = buildGeneratePrompt('Photosynthesis info', 5);
    expect(prompt).toContain('Generate 5');
    expect(prompt).toContain('Photosynthesis info');
    expect(prompt).toContain('JSON array');
  });

  it('includes source coverage guidance without requiring a manual agreement', () => {
    const prompt = buildGeneratePrompt('Photosynthesis info\nMissing: lab handout unavailable', 5);
    expect(prompt).toContain('Source coverage requirements');
    expect(prompt).toContain('Use only the pasted source material');
    expect(prompt).toContain('source gap');
    expect(prompt).not.toContain('MISSING:');
    expect(prompt).not.toContain('Ask for goal/event');
  });
});

describe('buildTargetedPrompt', () => {
  it('includes performance data, samples, and count', () => {
    const prompt = buildTargetedPrompt('perf data', 'sample Qs', 3);
    expect(prompt).toContain('perf data');
    expect(prompt).toContain('sample Qs');
    expect(prompt).toContain('3 questions');
  });
});

describe('formatPerformanceSummary', () => {
  it('formats summary with sections and weak cards', () => {
    const text = formatPerformanceSummary({
      projectName: 'Test',
      sections: [{ id: 's1', name: 'Sec1', accuracy: 0.75, attempted: 20, weakCards: 2, avgStability: 4.5 }],
      weakCards: [{ cardId: 'c1', sectionId: 's1', lapses: 5, stability: 1.2, difficulty: 0.8 }],
      recentAccuracy: 0.72,
      totalReviews: 100,
      totalCards: 50,
    });
    expect(text).toContain('Project: Test');
    expect(text).toContain('Sec1');
    expect(text).toContain('75.0%');
    expect(text).toContain('c1');
    expect(text).toContain('5 lapses');
  });
});

describe('formatSampleQuestions', () => {
  it('formats questions from a section', () => {
    const text = formatSampleQuestions({
      id: 's1', name: 'Test', type: 'mc-quiz',
      questions: [{ q: 'What is X?', correct: 'Y', wrong: ['Z'] }],
      cardIds: [], flashCardIds: [],
    });
    expect(text).toContain('What is X?');
    expect(text).toContain('Y');
  });

  it('returns empty for section without questions', () => {
    const text = formatSampleQuestions({
      id: 's1', name: 'Math', type: 'math-gen',
      cardIds: [], flashCardIds: [],
    });
    expect(text).toBe('');
  });
});
