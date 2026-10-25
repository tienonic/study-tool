import { describe, expect, it } from 'vitest';
import { buildExposurePlan, studyGoalQuotaKey } from './studyPlan.ts';

describe('buildExposurePlan', () => {
  it('lowers the daily exposure target when studying starts earlier', () => {
    const early = buildExposurePlan({
      today: '2030-01-07', startDate: '2030-01-07', targetDate: '2030-01-15',
      unseen: 5_000, due: 0, weekendMultiplier: 2,
    });
    const late = buildExposurePlan({
      today: '2030-01-11', startDate: '2030-01-11', targetDate: '2030-01-15',
      unseen: 5_000, due: 0, weekendMultiplier: 2,
    });

    expect(early.dailyLimit).toBeLessThan(late.dailyLimit);
    expect(early.dailyLimit).toBeGreaterThan(0);
  });

  it('assigns more exposure to a weekend while preserving the same seven-day total weight', () => {
    const saturday = buildExposurePlan({
      today: '2030-01-12', targetDate: '2030-01-18', unseen: 900, due: 0, weekendMultiplier: 2,
    });
    const monday = buildExposurePlan({
      today: '2030-01-14', targetDate: '2030-01-20', unseen: 900, due: 0, weekendMultiplier: 2,
    });

    expect(saturday.remainingWeight).toBe(monday.remainingWeight);
    expect(saturday.dailyLimit).toBe(monday.dailyLimit * 2);
  });

  it('catches up after missed days and keeps the quota stable as cards are introduced', () => {
    const original = buildExposurePlan({
      today: '2030-01-07', targetDate: '2030-01-15', unseen: 900, due: 5, weekendMultiplier: 1,
    });
    const missed = buildExposurePlan({
      today: '2030-01-10', targetDate: '2030-01-15', unseen: 900, due: 5, weekendMultiplier: 1,
    });
    const partway = buildExposurePlan({
      today: '2030-01-07', targetDate: '2030-01-15', unseen: 850, introducedToday: 50,
      due: 5, weekendMultiplier: 1,
    });

    expect(missed.dailyLimit).toBeGreaterThan(original.dailyLimit);
    expect(partway.dailyLimit).toBe(original.dailyLimit);
    expect(partway.recommendedNew).toBe(original.dailyLimit - 50);
  });

  it('uses calendar days across daylight-saving boundaries', () => {
    const spring = buildExposurePlan({
      today: '2026-03-07', targetDate: '2026-03-09', unseen: 300, due: 0, weekendMultiplier: 1,
    });
    const fall = buildExposurePlan({
      today: '2026-10-31', targetDate: '2026-11-02', unseen: 300, due: 0, weekendMultiplier: 1,
    });

    expect(spring.remainingDays).toBe(3);
    expect(fall.remainingDays).toBe(3);
    expect(spring.dailyLimit).toBe(100);
    expect(fall.dailyLimit).toBe(100);
  });

  it('does not introduce cards before the window and reports an expired deadline', () => {
    const before = buildExposurePlan({
      today: '2030-01-07', startDate: '2030-01-12', targetDate: '2030-01-15',
      unseen: 100, due: 3, weekendMultiplier: 2,
    });
    const expired = buildExposurePlan({
      today: '2030-01-16', startDate: '2030-01-07', targetDate: '2030-01-15',
      unseen: 100, due: 3, weekendMultiplier: 2,
    });

    expect(before.status).toBe('before-start');
    expect(before.dailyLimit).toBe(0);
    expect(before.firstDayNew).toBeGreaterThan(0);
    expect(expired.status).toBe('deadline-passed');
    expect(expired.deadlinePassed).toBe(true);
    expect(expired.dailyLimit).toBe(0);
  });

  it('bounds empty and extreme workloads and rejects impossible dates', () => {
    const empty = buildExposurePlan({
      today: '2030-01-07', targetDate: '2030-01-07', unseen: 0, due: -2, weekendMultiplier: 99,
    });
    const extreme = buildExposurePlan({
      today: '2030-01-07', targetDate: '2030-01-07', unseen: 5_000, due: 100,
    });

    expect(empty.status).toBe('complete');
    expect(empty.recommendedTotal).toBe(0);
    expect(empty.weekendMultiplier).toBe(4);
    expect(extreme.dailyLimit).toBe(5_000);
    expect(extreme.workload).toBe('extreme');
    expect(() => buildExposurePlan({ today: '2026-02-30', targetDate: '2026-03-01', unseen: 1, due: 0 })).toThrow(RangeError);
  });
});

describe('studyGoalQuotaKey', () => {
  it('is stable and project-wide', () => {
    expect(studyGoalQuotaKey('finite-deck')).toBe('finite-deck|study-goal');
  });
});
