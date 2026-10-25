import { createSignal, createEffect, onCleanup, batch, untrack } from 'solid-js';
import { activeProject, activeTab, syncActivity } from '../../core/store/app.ts';
import type { ProjectApi } from '../../core/hooks/useWorker.ts';
import { forProject } from '../../core/hooks/useWorker.ts';
import { sectionHandlers, handlerVersion } from '../../core/store/sections.ts';
import { getCardType } from '../quiz/helpers.ts';
import { MERGED_TAB_ID, getMergeableQuizSections } from '../quiz/merged.ts';
import { computeCumScores, drawChartAxes, drawChartData } from './chartUtils.ts';
import type { PickCardType } from '../../core/workers/protocol.ts';
import type { Project } from '../../projects/types.ts';


const [activityScore, setActivityScore] = createSignal(0);
const [reviewStats, setReviewStats] = createSignal({ reviews: 0, retention: '0%' });
const [sidebarScore, setSidebarScore] = createSignal({ correct: 0, attempted: 0, due: 0, total: 0 });
const [sidebarConcepts, setSidebarConcepts] = createSignal({ recognized: 0, exposed: 0 });

export { activityScore, reviewStats, sidebarScore, sidebarConcepts };

let activityApi: ProjectApi | null = null;

export function setActivityApi(api: ProjectApi) {
  activityApi = api;
}

let canvasRef: HTMLCanvasElement | undefined;
let chartEntries: { rating: number; correct: boolean }[] = [];

export function setCanvasRef(el: HTMLCanvasElement) {
  canvasRef = el;
}

let currentRetention = '—';

function sectionIdsForActivityScope(project: Project, tab: string): string[] {
  if (tab === MERGED_TAB_ID) return getMergeableQuizSections(project).map(section => section.id);
  return [tab];
}

async function fetchRetention() {
  const project = activeProject();
  if (!project || !activityApi) return;
  try {
    const result = await activityApi.getRetention();
    if (activeProject()?.slug !== project.slug) return;
    currentRetention = result.retention != null ? Math.round(result.retention * 100) + '%' : '—';
  } catch {
    // keep previous value on failure
  }
}

function updateScoreSignals() {
  const cumScores = computeCumScores(chartEntries);
  const score = cumScores.length > 0 ? cumScores[cumScores.length - 1] : 0;
  const total = chartEntries.length;
  batch(() => {
    setActivityScore(Math.round(score));
    setReviewStats({ reviews: total, retention: currentRetention });
  });
}

export async function loadActivity() {
  const project = activeProject();
  if (!project || !activityApi) return;
  const slug = project.slug;
  try {
    let entries = await activityApi.getActivity(200);
    if (activeProject()?.slug !== slug) return; // Project changed while fetching
    if (!syncActivity()) {
      const tab = activeTab();
      if (tab) {
        const sectionIds = new Set(sectionIdsForActivityScope(project, tab));
        entries = entries.filter((e) => e.section_id != null && sectionIds.has(e.section_id));
      }
    }
    chartEntries = entries.map((e) => ({ rating: e.rating, correct: !!e.correct })).reverse();
    updateScoreSignals();
    drawChart();
    fetchRetention().then(() => { if (activeProject()?.slug === slug) updateScoreSignals(); });
  } catch {
    // Background refresh — keep stale data on failure
  }
}

export async function loadSidebarScore() {
  const project = activeProject();
  const tab = activeTab();
  if (!project || !tab || !activityApi) return;
  const slug = project.slug;
  const merged = tab === MERGED_TAB_ID;
  const sections = merged ? getMergeableQuizSections(project) : project.sections.filter(s => s.id === tab);
  if (sections.length === 0 || (!merged && sections[0].type === 'math-gen')) return;

  try {
    const entry = sectionHandlers.get(tab);
    const isFlash = entry?.kind === 'quiz' ? entry.session.flashMode() : false;
    const cardType: PickCardType = merged ? (isFlash ? 'flashcard' : 'quiz') : getCardType(sections[0].type, isFlash);
    const sectionIds = sections.map(section => section.id);
    const sectionIdSet = new Set(sectionIds);
    const [scores, dueResult, progress] = await Promise.all([
      isFlash ? Promise.resolve([]) : activityApi.getScores(),
      activityApi.countDue(sectionIds, cardType),
      isFlash
        ? activityApi.getStudyProgress(project.config.desired_retention)
        : Promise.resolve(null),
    ]);
    const aggregate = scores
      .filter((sc) => sectionIdSet.has(sc.section_id))
      .reduce((acc, sc) => ({
        correct: acc.correct + (sc.correct ?? 0),
        attempted: acc.attempted + (sc.attempted ?? 0),
      }), { correct: 0, attempted: 0 });
    if (activeTab() !== tab || activeProject()?.slug !== slug) return; // Stale result — tab or project changed
    batch(() => {
      setSidebarScore({
        correct: aggregate.correct,
        attempted: aggregate.attempted,
        due: dueResult.due + dueResult.newCount,
        total: dueResult.total,
      });
      setSidebarConcepts(progress
        ? { recognized: progress.recognized, exposed: progress.exposed }
        : { recognized: 0, exposed: 0 });
    });
  } catch {
    // Background refresh — keep stale data on failure
  }
}

// Chart utility functions imported from ./chartUtils.ts

function drawChart() {
  if (!canvasRef) return;
  const ctx = canvasRef.getContext('2d');
  if (!ctx) return;
  const w = canvasRef.width; const h = canvasRef.height;
  ctx.clearRect(0, 0, w, h);
  const recent = chartEntries.slice(-50);
  if (recent.length === 0) return;
  const cumScores = computeCumScores(recent);
  const minS = 0; const maxS = Math.max(20, ...cumScores); const rangeS = maxS - minS || 1;
  const leftPad = 22; const rightPad = 6; const topPad = 6;
  const plotW = w - leftPad - rightPad; const plotH = h - topPad - 14;
  const toY = (val: number) => topPad + ((maxS - val) / rangeS) * plotH;
  const toX = (i: number) => leftPad + (i / (recent.length - 1 || 1)) * plotW;
  drawChartAxes(ctx, leftPad, rightPad, topPad, plotH, w, toY, minS, maxS);
  drawChartData(ctx, recent.length, toX, toY, cumScores, recent, topPad, plotH);
}

export async function clearActivity() {
  if (!activityApi) return;
  await activityApi.clearActivity();
}

export function pushChartEntry(rating: number, correct: boolean) {
  chartEntries.push({ rating, correct });
  updateScoreSignals();
  drawChart();
  fetchRetention().then(() => updateScoreSignals());
}

export function initActivityEffects() {
  createEffect(() => {
    const project = activeProject();
    if (project) setActivityApi(forProject(project.slug));
    else activityApi = null;
  });

  createEffect(() => {
    activeTab();
    syncActivity();
    loadActivity();
    loadSidebarScore();
  });

  createEffect(() => {
    handlerVersion();
    const tab = untrack(() => activeTab());
    if (!tab) return;
    const entry = sectionHandlers.get(tab);
    if (entry?.kind === 'quiz') { entry.session.dueCount(); entry.session.score(); }
    untrack(() => { loadActivity(); loadSidebarScore(); });
  });

  const interval = setInterval(() => { loadActivity(); loadSidebarScore(); }, 5000);
  onCleanup(() => clearInterval(interval));
}
