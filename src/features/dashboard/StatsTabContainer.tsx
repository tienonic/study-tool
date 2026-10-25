import { createSignal, onMount, createEffect } from 'solid-js';
import { initWorker, workerApi } from '../../core/hooks/useWorker.ts';
import { dashboardTab } from './store.ts';
import { StatsTab } from './StatsTab.tsx';
import type { ProjectGroup, SectionStatRow } from './StatsTab.tsx';
import type { CardRow, ReviewLogRow } from '../../core/workers/protocol.ts';
import type { WeakCard } from './DiagnosticTab.tsx';
import { activeDeckCards } from './statsAggregations.ts';

const EXCLUDED_PROJECTS = ['example-botany-project'];

export function StatsTabContainer() {
  const [totalReviews, setTotalReviews] = createSignal(0);
  const [retention, setRetention] = createSignal<number | null>(null);
  const [groups, setGroups] = createSignal<ProjectGroup[]>([]);
  const [allCards, setAllCards] = createSignal<CardRow[]>([]);
  const [allReviewLog, setAllReviewLog] = createSignal<ReviewLogRow[]>([]);
  const [weakCards, setWeakCards] = createSignal<WeakCard[]>([]);

  async function loadStats() {
    await initWorker();
    const allIds = await workerApi.getAllProjectIds();
    const projectIds = allIds.filter(id => !EXCLUDED_PROJECTS.includes(id));

    if (projectIds.length === 0) {
      setTotalReviews(0);
      setRetention(null);
      setGroups([]);
      setAllCards([]);
      setAllReviewLog([]);
      setWeakCards([]);
      return;
    }

    const results = await Promise.all(projectIds.map(async (slug) => {
      try {
        const [reviewLog, ret, scores, sectionStats, exported] = await Promise.all([
          workerApi.getReviewLog(slug, 10000),
          workerApi.getRetention(slug),
          workerApi.getScores(slug),
          workerApi.getSectionStats(slug),
          workerApi.exportProjectData(slug),
        ]);
        return { slug, reviewLog, ret, scores, sectionStats, exported };
      } catch {
        return null;
      }
    }));

    let totalRev = 0;
    let retSum = 0;
    let retCount = 0;
    const projectGroups: ProjectGroup[] = [];
    const cards: CardRow[] = [];
    const reviewLogs: ReviewLogRow[] = [];
    const weak: WeakCard[] = [];

    for (const r of results) {
      if (!r) continue;
      const { slug, reviewLog, ret, scores, sectionStats, exported } = r;

      totalRev += reviewLog.length;
      if (ret.retention != null) {
        retSum += ret.retention;
        retCount++;
      }

      const activeCards = activeDeckCards(exported.cards);
      cards.push(...activeCards);
      reviewLogs.push(...exported.review_log);

      const name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      for (const c of activeCards) {
        if (c.lapses >= 3 && !c.suspended) {
          weak.push({
            card_id: c.card_id,
            section_id: c.section_id,
            section_name: `${name} - ${c.section_id}`,
            lapses: c.lapses,
            stability: c.stability,
            difficulty: c.difficulty,
          });
        }
      }

      const scoreMap = new Map(scores.map(s => [s.section_id, s]));
      const sections: SectionStatRow[] = [];
      let groupReviewed = 0;
      let groupDue = 0;

      for (const ss of sectionStats) {
        const score = scoreMap.get(ss.section_id);
        const reviewed = score?.attempted ?? 0;
        const due = ss.learning + ss.due;
        groupReviewed += reviewed;
        groupDue += due;
        sections.push({ name: ss.section_id, reviewed, retention: null, due });
      }

      projectGroups.push({
        name,
        slug,
        reviewed: groupReviewed,
        retention: ret.retention,
        due: groupDue,
        sections,
      });
    }

    setTotalReviews(totalRev);
    setRetention(retCount > 0 ? retSum / retCount : null);
    setGroups(projectGroups);
    setAllCards(cards);
    setAllReviewLog(reviewLogs);
    weak.sort((a, b) => b.lapses - a.lapses);
    setWeakCards(weak);
  }

  async function handleDelete(slug: string) {
    await workerApi.deleteProject(slug);
    loadStats();
  }

  onMount(loadStats);

  createEffect(() => {
    if (dashboardTab() === 'stats') loadStats();
  });

  return (
    <StatsTab
      totalReviews={totalReviews()}
      retention={retention()}
      groups={groups()}
      cards={allCards()}
      reviewLog={allReviewLog()}
      weakCards={weakCards()}
      onDeleteProject={handleDelete}
    />
  );
}
