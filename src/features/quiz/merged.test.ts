import { describe, expect, it } from 'vitest';
import {
  MERGED_TAB_ID,
  canUseMergedQuiz,
  resolveStudyTab,
  shouldUseMergedQuiz,
} from './merged.ts';
import type { Project, Section } from '../../projects/types.ts';

function section(id: string, type: Section['type'] = 'mc-quiz'): Section {
  return {
    id,
    name: id,
    type,
    cardIds: type === 'math-gen' ? [] : [`${id}-0`],
    flashCardIds: [],
    questions: type === 'mc-quiz' ? [{ q: 'Q?', correct: 'A', wrong: ['B'] }] : undefined,
    scenarios: type === 'passage-quiz' ? [{ passage: 'P', questions: [{ q: 'Q?', correct: 'A', wrong: ['B'] }] }] : undefined,
  };
}

function project(sections: Section[]): Project {
  return {
    name: 'Test',
    slug: 'test',
    version: 1,
    sections,
    config: {
      desired_retention: 0.9,
      new_per_session: 20,
      leech_threshold: 8,
      imageSearchSuffix: '',
      max_interval: 36500,
    },
    glossary: [],
  };
}

describe('merged quiz tab resolution', () => {
  it('uses the merged tab only when merged mode has multiple quiz sections', () => {
    const p = project([section('one'), section('two', 'passage-quiz')]);

    expect(canUseMergedQuiz(p)).toBe(true);
    expect(shouldUseMergedQuiz(p, true)).toBe(true);
    expect(resolveStudyTab(p, true, 'one')).toBe(MERGED_TAB_ID);
  });

  it('falls back to a real section when stale merged mode is enabled for one quiz section', () => {
    const p = project([section('only')]);

    expect(canUseMergedQuiz(p)).toBe(false);
    expect(shouldUseMergedQuiz(p, true)).toBe(false);
    expect(resolveStudyTab(p, true, MERGED_TAB_ID)).toBe('only');
  });

  it('preserves a valid preferred real tab when merged mode is not active', () => {
    const p = project([section('one'), section('math', 'math-gen')]);

    expect(resolveStudyTab(p, false, 'math')).toBe('math');
  });
});
