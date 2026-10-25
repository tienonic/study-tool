import type { ProjectApi } from '../../core/hooks/useWorker.ts';
import type { PickCardType } from '../../core/workers/protocol.ts';
import type { StudyGoalConfig } from '../../projects/types.ts';
import { studyGoalQuotaKey } from './studyPlan.ts';

export interface GoalSchedulingProject {
  slug: string;
  config: {
    new_per_session: number;
    study_goal?: StudyGoalConfig;
  };
}

export function hasFiniteStudyGoal(project: GoalSchedulingProject): boolean {
  return Boolean(project.config.study_goal?.target_date);
}

export function reviewQuotaKey(project: GoalSchedulingProject): string | undefined {
  return hasFiniteStudyGoal(project) ? studyGoalQuotaKey(project.slug) : undefined;
}

export function pickNextScheduled(
  api: ProjectApi,
  project: GoalSchedulingProject,
  sectionIds: string[],
  cardType: PickCardType,
): Promise<{ cardId: string | null }> {
  const goal = project.config.study_goal;
  if (!goal?.target_date) {
    return api.pickNext(sectionIds, project.config.new_per_session, cardType);
  }
  return api.pickNext(
    sectionIds,
    project.config.new_per_session,
    cardType,
    studyGoalQuotaKey(project.slug),
    goal,
  );
}

export function resetScheduledNewCount(
  api: ProjectApi,
  project: GoalSchedulingProject,
  sectionIds: string[],
  cardType: PickCardType,
): Promise<unknown> {
  if (!hasFiniteStudyGoal(project)) return api.resetNewCount(sectionIds, cardType);
  return api.resetNewCount(sectionIds, cardType, studyGoalQuotaKey(project.slug));
}
