import { createSignal, onMount, createEffect } from 'solid-js';
import { initWorker, workerApi } from '../../core/hooks/useWorker.ts';
import { getRecentProjects, openRecentProject, removeRecentProject } from '../launcher/store.ts';
import { dashboardTab } from './store.ts';
import { ReviewTab } from './ReviewTab.tsx';
import type { ProjectRowData } from './types.ts';

export function ReviewTabContainer() {
  const [projects, setProjects] = createSignal<ProjectRowData[]>([]);

  async function loadProjects() {
    await initWorker();
    const recent = getRecentProjects();
    const rows = await Promise.all(recent.map(async (p): Promise<ProjectRowData> => {
      try {
        const [stats, sectionStats] = await Promise.all([
          workerApi.getDeckStats(p.slug),
          workerApi.getSectionStats(p.slug),
        ]);
        const totalCards = sectionStats.reduce((sum, s) => sum + s.total, 0);
        return { slug: p.slug, name: p.name, new: stats.new, learning: stats.learning, due: stats.due, total: totalCards };
      } catch {
        return { slug: p.slug, name: p.name, new: 0, learning: 0, due: 0, total: 0 };
      }
    }));
    setProjects(rows);
  }

  onMount(loadProjects);

  createEffect(() => {
    if (dashboardTab() === 'review') loadProjects();
  });

  function handleRemove(slug: string) {
    removeRecentProject(slug);
    setProjects(prev => prev.filter(p => p.slug !== slug));
  }

  return <ReviewTab projects={projects()} onOpen={openRecentProject} onRemove={handleRemove} />;
}
