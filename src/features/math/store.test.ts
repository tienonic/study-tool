import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import { createFakeProjectApi } from '../quiz/testUtils.ts';

// Simple mock — no solid-js signals needed, just a getter/setter
let _project: any = null;
vi.mock('../../core/store/app.ts', () => ({
  activeProject: () => _project,
}));

import { createMathSession } from './store.ts';
import type { Section } from '../../projects/types.ts';

function mockSection(): Section {
  return {
    id: 'math1',
    name: 'Math',
    type: 'math-gen',
    questions: [],
    cardIds: [],
    flashCardIds: [],
    generators: ['percent'],
  };
}

describe('createMathSession with injected API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _project = { slug: 'test-proj', sections: [], config: { new_per_session: 10 } };
  });

  it('checkAnswer calls api.updateScore with correct=true for right answer', () => {
    const api = createFakeProjectApi({
      updateScore: vi.fn().mockResolvedValue({ correct: 1, attempted: 1 }),
    });

    createRoot(dispose => {
      const session = createMathSession(mockSection(), api);
      session.generateProblem();

      const problem = session.problem()!;
      expect(problem).not.toBeNull();

      session.checkAnswer(String(problem.a));

      expect(api.updateScore).toHaveBeenCalledWith('math1', true);
      expect(session.score().correct).toBe(1);
      dispose();
    });
  });

  it('checkAnswer calls api.updateScore with correct=false for wrong answer', () => {
    const api = createFakeProjectApi();

    createRoot(dispose => {
      const session = createMathSession(mockSection(), api);
      session.generateProblem();

      session.checkAnswer('99999999');

      expect(api.updateScore).toHaveBeenCalledWith('math1', false);
      expect(session.score().attempted).toBe(1);
      expect(session.score().correct).toBe(0);
      dispose();
    });
  });

  it('resetSection calls api.resetSection and resets local state', () => {
    const api = createFakeProjectApi({
      updateScore: vi.fn().mockResolvedValue({ correct: 1, attempted: 1 }),
    });

    createRoot(dispose => {
      const session = createMathSession(mockSection(), api);
      session.generateProblem();

      const problem = session.problem()!;
      session.checkAnswer(String(problem.a));
      expect(session.score().correct).toBe(1);

      session.resetSection();

      expect(api.resetSection).toHaveBeenCalledWith('math1');
      expect(session.score()).toEqual({ correct: 0, attempted: 0 });
      expect(session.streak()).toBe(0);
      expect(session.bestStreak()).toBe(0);
      dispose();
    });
  });
});
