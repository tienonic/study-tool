import { describe, expect, it } from 'vitest';
import { checkWorkbookMath, makeWorkbookMath, type MathCategory } from './workbookMath.ts';

describe('workbook math practice', () => {
  it('checks the actual numeric result and diagnoses a proportion reported as a percentage', () => {
    const problem = makeWorkbookMath('percent', 1, 0);
    expect(problem.question).toContain('$20$');
    expect(problem.question).toContain('$2$');
    expect(checkWorkbookMath(problem, '10').kind).toBe('correct');
    expect(checkWorkbookMath(problem, '0.1')).toMatchObject({ kind: 'incorrect', message: expect.stringContaining('Multiply it by 100') });
  });
  it('rejects blank, nonfinite, expression, and partially parsed inputs without grading them', () => {
    const problem = makeWorkbookMath('percent', 1, 0);
    for (const input of ['', ' ', '10abc', '10%', '1/10', 'Infinity', 'NaN', '1e999']) expect(checkWorkbookMath(problem, input).kind).toBe('invalid');
    expect(checkWorkbookMath(problem, '1e1').kind).toBe('correct');
  });
  it('diagnoses the sum mistaken for the mean', () => {
    const problem = makeWorkbookMath('average', 1, 0);
    expect(checkWorkbookMath(problem, '5').kind).toBe('correct');
    expect(checkWorkbookMath(problem, '15').message).toContain('Divide it by the number');
  });
  it('diagnoses conversion in the wrong direction', () => {
    const problem = makeWorkbookMath('conversion', 1, 0);
    expect(problem.answer).toBe(32);
    expect(checkWorkbookMath(problem, '0.125').message).toContain('inverted');
  });
  it('generates repeatable, distinct examples at each supported difficulty', () => {
    for (const category of ['decimal', 'average', 'percent', 'conversion'] as MathCategory[]) {
      for (const difficulty of [1, 2, 3] as const) {
        const first = makeWorkbookMath(category, difficulty, 0);
        expect(first).toEqual(makeWorkbookMath(category, difficulty, 0));
        expect(first.question).not.toBe(makeWorkbookMath(category, difficulty, 1).question);
        expect(Number.isFinite(first.answer)).toBe(true);
        expect(first.steps.length).toBeGreaterThan(1);
      }
    }
  });
});
