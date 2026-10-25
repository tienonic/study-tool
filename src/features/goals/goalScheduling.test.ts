import { describe, expect, it, vi } from 'vitest';
import { createFakeProjectApi } from '../quiz/testUtils.ts';
import { pickNextScheduled, resetScheduledNewCount, reviewQuotaKey } from './goalScheduling.ts';

describe('goal scheduling API bridge', () => {
  it('keeps legacy deck quotas scoped by section and card type', async () => {
    const api = createFakeProjectApi();
    const project = { slug: 'deck', config: { new_per_session: 20 } };

    await pickNextScheduled(api, project, ['a'], 'flashcard');
    await resetScheduledNewCount(api, project, ['a'], 'flashcard');

    expect(api.pickNext).toHaveBeenCalledWith(['a'], 20, 'flashcard');
    expect(api.resetNewCount).toHaveBeenCalledWith(['a'], 'flashcard');
    expect(reviewQuotaKey(project)).toBeUndefined();
  });

  it('uses one project-wide quota for a finite goal across section switches', async () => {
    const api = createFakeProjectApi({ pickNext: vi.fn().mockResolvedValue({ cardId: null }) });
    const goal = { start_date: '2030-01-07', target_date: '2030-01-15', weekend_multiplier: 2 };
    const project = { slug: 'finite-deck', config: { new_per_session: 20, study_goal: goal } };

    await pickNextScheduled(api, project, ['general'], 'flashcard');
    await pickNextScheduled(api, project, ['travel'], 'flashcard');
    await resetScheduledNewCount(api, project, ['travel'], 'flashcard');

    expect(api.pickNext).toHaveBeenNthCalledWith(1, ['general'], 20, 'flashcard', 'finite-deck|study-goal', goal);
    expect(api.pickNext).toHaveBeenNthCalledWith(2, ['travel'], 20, 'flashcard', 'finite-deck|study-goal', goal);
    expect(api.resetNewCount).toHaveBeenCalledWith(['travel'], 'flashcard', 'finite-deck|study-goal');
    expect(reviewQuotaKey(project)).toBe('finite-deck|study-goal');
  });
});
