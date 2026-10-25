import { createSignal, batch } from 'solid-js';
import { getCardType } from './helpers.ts';
import { pushChartEntry } from '../activity/store.ts';
import type { ProjectApi } from '../../core/hooks/useWorker.ts';
import type { PickCardType } from '../../core/workers/protocol.ts';

type PerformanceCard = Awaited<ReturnType<ProjectApi['getPerformanceCards']>>[number];

interface CramCard {
  id: string;
  weakness: number;
  goal: number;
  correctStreak: number;
  misses: number;
  reviews: number;
  nextAt: number;
  order: number;
  retired: boolean;
}

const CRAM_MAX_REVIEWS_PER_CARD = 4;

export interface CramDeps {
  projectSlug: () => string | undefined;
  sectionId: string;
  sectionIds?: string[];
  flashMode: () => boolean;
  sectionType: 'mc-quiz' | 'passage-quiz' | 'math-gen';
  merged?: boolean;
  ownerSectionId?: (cardId: string) => string;
  onPickMcq: (cardId: string) => void;
  onPickFlash: (cardId: string) => void;
  onDone: () => void;
  api: ProjectApi;
}

export function createCramSession(deps: CramDeps) {
  const allSectionIds = deps.sectionIds ?? [deps.sectionId];
  const [cramMode, setCramMode] = createSignal(false);
  const [cramCount, setCramCount] = createSignal(0);
  let cramCards: CramCard[] = [];
  let reviewBudget = 0;
  let lastPickedId: string | null = null;

  function activeCardType(): PickCardType {
    if (deps.flashMode()) return 'flashcard';
    return deps.merged ? 'quiz' : getCardType(deps.sectionType, false);
  }

  function matchesCardType(card: PerformanceCard, cardType: PickCardType): boolean {
    if (cardType === 'quiz') return card.card_type !== 'flashcard';
    return card.card_type === cardType;
  }

  function weaknessScore(card: PerformanceCard): number {
    const stability = Math.max(0, Number(card.stability) || 0);
    const difficulty = Math.max(0, Number(card.difficulty) || 0);
    const reps = Math.max(0, Number(card.reps) || 0);
    const lapses = Math.max(0, Number(card.lapses) || 0);
    const state = Number(card.fsrs_state) || 0;
    const stateBoost = state === 0 ? 6 : state === 1 || state === 3 ? 4 : 0;
    return stateBoost + lapses * 5 + difficulty * 0.45 + 1 / (stability + 0.25) - reps * 0.04;
  }

  function masteryGoal(card: PerformanceCard): number {
    const state = Number(card.fsrs_state) || 0;
    const stability = Math.max(0, Number(card.stability) || 0);
    const difficulty = Math.max(0, Number(card.difficulty) || 0);
    const lapses = Math.max(0, Number(card.lapses) || 0);
    if (state === 0 || state === 1 || state === 3 || lapses > 0 || stability < 2.5 || difficulty >= 8) return 2;
    return 1;
  }

  async function buildCramCards(cardType: PickCardType): Promise<CramCard[]> {
    const performance = await deps.api.getPerformanceCards();
    return performance
      .filter(card => allSectionIds.includes(card.section_id) && matchesCardType(card, cardType))
      .map(card => ({ card, weakness: weaknessScore(card) }))
      .sort((a, b) => b.weakness - a.weakness)
      .map(({ card, weakness }, order) => ({
        id: card.card_id,
        weakness,
        goal: masteryGoal(card),
        correctStreak: 0,
        misses: 0,
        reviews: 0,
        nextAt: 0,
        order,
        retired: false,
      }));
  }

  function activeCards(): CramCard[] {
    return cramCards.filter(card => !card.retired);
  }

  function cardPriority(card: CramCard): number {
    const remaining = Math.max(0, card.goal - card.correctStreak);
    return card.misses * 80 + remaining * 18 + card.weakness - card.reviews * 2 - card.order * 0.001;
  }

  function chooseNextCard(): CramCard | null {
    const active = activeCards();
    if (active.length === 0) return null;

    const now = cramCount();
    const ready = active.filter(card => card.nextAt <= now);
    const dueMisses = ready.filter(card => card.misses > 0);
    const unseen = ready.filter(card => card.reviews === 0);
    const candidates = dueMisses.length > 0
      ? dueMisses
      : unseen.length > 0
        ? unseen
        : ready.length > 0
      ? ready
      : active.filter(card => card.nextAt === Math.min(...active.map(c => c.nextAt)));

    const avoidImmediateRepeat = candidates.filter(card => card.id !== lastPickedId);
    const pool = avoidImmediateRepeat.length > 0 ? avoidImmediateRepeat : candidates;
    return [...pool].sort((a, b) => cardPriority(b) - cardPriority(a))[0] ?? null;
  }

  function finishCram() {
    batch(() => { endCram(); deps.onDone(); });
  }

  async function pickNextCram() {
    const slug = deps.projectSlug();
    if (!slug) { finishCram(); return; }

    if (cramCards.length === 0) {
      cramCards = await buildCramCards(activeCardType());
      reviewBudget = Math.max(cramCards.length, cramCards.length * CRAM_MAX_REVIEWS_PER_CARD);
    }

    if (cramCards.length === 0 || cramCount() >= reviewBudget) {
      finishCram();
      return;
    }

    const next = chooseNextCard();
    if (!next) {
      finishCram();
      return;
    }
    lastPickedId = next.id;

    if (deps.flashMode()) {
      deps.onPickFlash(next.id);
    } else {
      deps.onPickMcq(next.id);
    }
  }

  async function startCram() {
    const cardType = activeCardType();
    cramCards = await buildCramCards(cardType);
    reviewBudget = Math.max(cramCards.length, cramCards.length * CRAM_MAX_REVIEWS_PER_CARD);
    lastPickedId = null;
    batch(() => { setCramCount(0); setCramMode(true); });
    await pickNextCram();
  }

  function endCram() {
    cramCards = [];
    reviewBudget = 0;
    lastPickedId = null;
    batch(() => { setCramMode(false); setCramCount(0); });
  }

  function markSeen(cardId: string) {
    const card = cramCards.find(item => item.id === cardId);
    if (card) {
      card.reviews += 1;
      card.correctStreak += 1;
      card.retired = card.correctStreak >= card.goal;
      card.nextAt = cramCount() + 4;
    }
    setCramCount(cramCount() + 1);
  }

  function rateCram(cardId: string, rating: number) {
    const secId = deps.ownerSectionId ? deps.ownerSectionId(cardId) : deps.sectionId;
    deps.api.addActivity(secId, rating, rating !== 1).catch(() => {});
    pushChartEntry(rating, rating !== 1);

    const nextCount = cramCount() + 1;
    const card = cramCards.find(item => item.id === cardId);
    if (card) {
      card.reviews += 1;
      if (rating === 1) {
        card.misses += 1;
        card.goal = Math.max(card.goal, 2);
        card.correctStreak = 0;
        card.nextAt = nextCount + 1;
      } else {
        card.correctStreak += rating === 4 ? 2 : 1;
        card.retired = card.correctStreak >= card.goal;
        card.nextAt = nextCount + (rating === 2 ? 2 : rating === 4 ? 5 : 3);
      }
    }
    setCramCount(nextCount);
  }

  return {
    cramMode,
    cramCount,
    startCram,
    endCram,
    pickNextCram,
    markSeen,
    rateCram,
  };
}
