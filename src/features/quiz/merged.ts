import type { Project, Section } from '../../projects/types.ts';

export const MERGED_TAB_ID = '__merged__';

export function isMergeableQuizSection(section: Section): boolean {
  return section.type === 'mc-quiz' || section.type === 'passage-quiz';
}

export function getMergeableQuizSections(project: Project | null | undefined): Section[] {
  return project?.sections.filter(isMergeableQuizSection) ?? [];
}

export function canUseMergedQuiz(project: Project | null | undefined): boolean {
  return getMergeableQuizSections(project).length > 1;
}

export function shouldUseMergedQuiz(project: Project | null | undefined, mergedEnabled: boolean): boolean {
  return mergedEnabled && canUseMergedQuiz(project);
}

export function resolveStudyTab(
  project: Project | null | undefined,
  mergedEnabled: boolean,
  preferredTab?: string | null,
): string | null {
  if (!project) return null;
  if (shouldUseMergedQuiz(project, mergedEnabled)) return MERGED_TAB_ID;
  if (
    preferredTab
    && preferredTab !== MERGED_TAB_ID
    && project.sections.some(section => section.id === preferredTab)
  ) {
    return preferredTab;
  }
  return project.sections[0]?.id ?? null;
}
