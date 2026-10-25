import { batch } from 'solid-js';
import { workerApi } from '../../core/hooks/useWorker.ts';
import { activeProject, setActiveProject, setActiveTab } from '../../core/store/app.ts';
import { bumpHandlerVersion } from '../../core/store/sections.ts';
import type { Section } from '../../projects/types.ts';

/**
 * Register a new section with the worker and activate it in the UI.
 * Returns true if successful, false if project changed during the async operation.
 * Optional `afterActivate` callback runs inside the batch (for extra state cleanup).
 */
export async function registerAndActivateSection(
  newSection: Section,
  cardRegs: { sectionId: string; cardId: string; cardType: 'mcq' | 'passage' | 'flashcard' }[],
  afterActivate?: () => void,
): Promise<boolean> {
  const project = activeProject();
  if (!project) return false;

  await workerApi.loadProject(project.slug, [newSection.id], cardRegs);

  const currentProject = activeProject();
  if (!currentProject || currentProject.slug !== project.slug) return false;

  const updatedSections = [...currentProject.sections, newSection];
  batch(() => {
    setActiveProject({ ...currentProject, sections: updatedSections });
    setActiveTab(newSection.id);
    bumpHandlerVersion();
    afterActivate?.();
  });
  return true;
}
