import { describe, it, expect } from 'vitest';
import { timeToRating, lookupQuestion, getCardType, resolveFlashCard } from './helpers.ts';
import type { Section } from '../../projects/types.ts';

// === timeToRating ===

describe('timeToRating', () => {
  it('returns 1 (Again) at the fail threshold', () => {
    expect(timeToRating(60)).toBe(1);
    expect(timeToRating(120)).toBe(1);
  });

  it('returns 2 (Hard) for the upper pre-fail range', () => {
    expect(timeToRating(40)).toBe(2);
    expect(timeToRating(50)).toBe(2);
    expect(timeToRating(59)).toBe(2);
  });

  it('returns 3 (Good) for 8-39 seconds', () => {
    expect(timeToRating(8)).toBe(3);
    expect(timeToRating(20)).toBe(3);
    expect(timeToRating(39)).toBe(3);
  });

  it('returns 4 (Easy) for 0-7 seconds', () => {
    expect(timeToRating(0)).toBe(4);
    expect(timeToRating(5)).toBe(4);
    expect(timeToRating(7)).toBe(4);
  });
});

// === lookupQuestion ===

function mcSection(overrides?: Partial<Section>): Section {
  return {
    id: 'sec1',
    name: 'Section 1',
    type: 'mc-quiz',
    questions: [
      { q: 'Q1?', correct: 'A', wrong: ['B', 'C'] },
      { q: 'Q2?', correct: 'X', wrong: ['Y', 'Z'] },
    ],
    cardIds: ['sec1-0', 'sec1-1'],
    flashCardIds: [],
    ...overrides,
  };
}

function passageSection(overrides?: Partial<Section>): Section {
  return {
    id: 'pass1',
    name: 'Passages',
    type: 'passage-quiz',
    scenarios: [
      {
        passage: 'The passage text.',
        source: 'Source & <tag>',
        questions: [
          { q: 'PQ1?', correct: 'PA', wrong: ['PB'] },
          { q: 'PQ2?', correct: 'PC', wrong: ['PD'] },
        ],
      },
      {
        passage: 'Second passage.',
        questions: [{ q: 'PQ3?', correct: 'PE', wrong: ['PF'] }],
      },
    ],
    cardIds: ['pass1-0-0', 'pass1-0-1', 'pass1-1-0'],
    flashCardIds: [],
    ...overrides,
  };
}

describe('lookupQuestion', () => {
  describe('mc-quiz section', () => {
    it('returns question for valid card ID', () => {
      const section = mcSection();
      const result = lookupQuestion(section, 'sec1-0');
      expect(result).not.toBeNull();
      expect(result!.question.q).toBe('Q1?');
      expect(result!.question.correct).toBe('A');
    });

    it('returns second question for index 1', () => {
      const section = mcSection();
      const result = lookupQuestion(section, 'sec1-1');
      expect(result).not.toBeNull();
      expect(result!.question.q).toBe('Q2?');
    });

    it('returns null for out-of-bounds index', () => {
      const section = mcSection();
      expect(lookupQuestion(section, 'sec1-99')).toBeNull();
    });

    it('returns null for non-numeric suffix', () => {
      const section = mcSection();
      expect(lookupQuestion(section, 'sec1-abc')).toBeNull();
    });
  });

  describe('passage-quiz section', () => {
    it('returns question with scenarioIdx and questionIdx', () => {
      const section = passageSection();
      const result = lookupQuestion(section, 'pass1-0-0');
      expect(result).not.toBeNull();
      expect(result!.question.q).toBe('PQ1?');
      expect(result!.scenarioIdx).toBe(0);
      expect(result!.questionIdx).toBe(0);
    });

    it('returns second question in first scenario', () => {
      const section = passageSection();
      const result = lookupQuestion(section, 'pass1-0-1');
      expect(result).not.toBeNull();
      expect(result!.question.q).toBe('PQ2?');
      expect(result!.scenarioIdx).toBe(0);
      expect(result!.questionIdx).toBe(1);
    });

    it('returns question from second scenario', () => {
      const section = passageSection();
      const result = lookupQuestion(section, 'pass1-1-0');
      expect(result).not.toBeNull();
      expect(result!.question.q).toBe('PQ3?');
      expect(result!.scenarioIdx).toBe(1);
    });

    it('builds passage with HTML-escaped source', () => {
      const section = passageSection();
      const result = lookupQuestion(section, 'pass1-0-0');
      expect(result!.passage).toContain('The passage text.');
      expect(result!.passage).toContain('Source &amp; &lt;tag&gt;');
      expect(result!.passage).toContain('<span class="source">');
    });

    it('omits source span when source is absent', () => {
      const section = passageSection();
      const result = lookupQuestion(section, 'pass1-1-0');
      expect(result!.passage).toBe('Second passage.');
      expect(result!.passage).not.toContain('<span');
    });

    it('returns null for out-of-bounds scenario', () => {
      const section = passageSection();
      expect(lookupQuestion(section, 'pass1-9-0')).toBeNull();
    });

    it('returns null for out-of-bounds question in scenario', () => {
      const section = passageSection();
      expect(lookupQuestion(section, 'pass1-0-9')).toBeNull();
    });

    it('returns null for malformed suffix', () => {
      const section = passageSection();
      expect(lookupQuestion(section, 'pass1-abc')).toBeNull();
    });
  });
});

// === getCardType ===

describe('getCardType', () => {
  it('returns flashcard when flashMode is true regardless of section type', () => {
    expect(getCardType('mc-quiz', true)).toBe('flashcard');
    expect(getCardType('passage-quiz', true)).toBe('flashcard');
  });

  it('returns passage for passage-quiz when flashMode is false', () => {
    expect(getCardType('passage-quiz', false)).toBe('passage');
  });

  it('returns mcq for mc-quiz when flashMode is false', () => {
    expect(getCardType('mc-quiz', false)).toBe('mcq');
  });

  it('returns mcq for math-gen when flashMode is false', () => {
    expect(getCardType('math-gen', false)).toBe('mcq');
  });
});

// === resolveFlashCard ===

function flashSection(overrides?: Partial<Section>): Section {
  return {
    id: 'sec1',
    name: 'Section 1',
    type: 'mc-quiz',
    questions: [{ q: 'Q1?', correct: 'A', wrong: ['B', 'C'] }],
    flashcards: [
      { front: 'Term A', back: 'Definition A' },
      { front: 'Term B', back: 'Definition B' },
    ],
    cardIds: ['sec1-0'],
    flashCardIds: ['sec1-flash-0', 'sec1-flash-1'],
    ...overrides,
  };
}

describe('resolveFlashCard', () => {
  it('returns card and index for valid flash card ID', () => {
    const section = flashSection();
    const result = resolveFlashCard(section, 'sec1-flash-0');
    expect(result).not.toBeNull();
    expect(result!.idx).toBe(0);
    expect(result!.card.front).toBe('Term A');
    expect(result!.card.back).toBe('Definition A');
  });

  it('returns second card for index 1', () => {
    const section = flashSection();
    const result = resolveFlashCard(section, 'sec1-flash-1');
    expect(result).not.toBeNull();
    expect(result!.idx).toBe(1);
    expect(result!.card.front).toBe('Term B');
  });

  it('resolves an explicit stable flashcard ID after reordering', () => {
    const section = flashSection({
      flashcards: [
        { id: 'gracias', front: 'gracias', back: 'thank you' },
        { id: 'hola', front: 'hola', back: 'hello' },
      ],
      flashCardIds: ['sec1-flash-gracias', 'sec1-flash-hola'],
    });
    const result = resolveFlashCard(section, 'sec1-flash-hola');
    expect(result).toEqual({ idx: 1, card: section.flashcards![1] });
  });

  it('returns null for wrong prefix', () => {
    const section = flashSection();
    expect(resolveFlashCard(section, 'other-flash-0')).toBeNull();
  });

  it('returns null for non-numeric suffix', () => {
    const section = flashSection();
    expect(resolveFlashCard(section, 'sec1-flash-abc')).toBeNull();
  });

  it('returns null for out-of-bounds index', () => {
    const section = flashSection();
    expect(resolveFlashCard(section, 'sec1-flash-99')).toBeNull();
  });

  it('returns null when section has no flashcards', () => {
    const section = flashSection({ flashcards: undefined });
    expect(resolveFlashCard(section, 'sec1-flash-0')).toBeNull();
  });

  it('returns null for empty flashcards array', () => {
    const section = flashSection({ flashcards: [] });
    expect(resolveFlashCard(section, 'sec1-flash-0')).toBeNull();
  });
});
