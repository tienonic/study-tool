import { createSignal, For, Show } from 'solid-js';
import type { CardRow, ReviewLogRow } from '../../core/workers/protocol.ts';
import { DiagnosticTab, type WeakCard } from './DiagnosticTab.tsx';
import { formatRetention } from './statsAggregations.ts';
import { PanelToday, PanelCardCounts, PanelFutureDue, PanelCalendar, PanelReviews, PanelIntervals } from './statsPanels.tsx';

export interface SectionStatRow {
  name: string;
  reviewed: number;
  retention: number | null;
  due: number;
}

export interface ProjectGroup {
  name: string;
  slug: string;
  reviewed: number;
  retention: number | null;
  due: number;
  sections: SectionStatRow[];
}

interface StatsTabProps {
  totalReviews: number;
  retention: number | null;
  groups: ProjectGroup[];
  cards: CardRow[];
  reviewLog: ReviewLogRow[];
  weakCards: WeakCard[];
  onDeleteProject?: (slug: string) => void;
}

const MAX_VISIBLE = 6;

export function StatsTab(props: StatsTabProps) {
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [showAllDecks, setShowAllDecks] = createSignal(false);
  const [deckSearch, setDeckSearch] = createSignal('');

  function toggle(slug: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }

  const filteredGroups = () => {
    const q = deckSearch().toLowerCase();
    if (!q) return props.groups;
    return props.groups.filter(g => g.name.toLowerCase().includes(q));
  };
  const visibleGroups = () => showAllDecks() ? filteredGroups() : filteredGroups().slice(0, MAX_VISIBLE);
  const hasOverflow = () => filteredGroups().length > MAX_VISIBLE;

  return (
    <div class="db-stats">
      <Show when={props.totalReviews > 0 || props.groups.length > 0} fallback={
        <div class="db-stats-empty">No study data yet. Start reviewing to see your stats.</div>
      }>
        <div class="db-stats-body">
          <div class="db-stats-main">
            {/* Deck Table */}
            <Show when={props.groups.length > 0}>
              <div class={showAllDecks() && hasOverflow() ? 'db-stats-table-scroll' : ''}>
                <table class="db-stats-table">
                  <thead>
                    <tr>
                      <th>
                        <span>Deck / Section</span>
                        <input
                          type="text"
                          class="db-stats-search"
                          value={deckSearch()}
                          onInput={(e) => setDeckSearch(e.currentTarget.value)}
                        />
                      </th>
                      <th>Reviewed</th>
                      <th>Retention</th>
                      <th>Due</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={visibleGroups()}>
                      {(g) => {
                        const isOpen = () => expanded().has(g.slug);
                        const hasSections = () => g.sections.length > 1;
                        return (
                          <>
                            <tr
                              class={`db-stats-group-header ${hasSections() ? 'db-stats-group-toggle' : ''}`}
                              onClick={() => hasSections() && toggle(g.slug)}
                            >
                              <td>
                                <Show when={hasSections()}>
                                  <span class="db-stats-chevron">{isOpen() ? '\u25BE' : '\u25B8'}</span>
                                </Show>
                                {g.name}
                              </td>
                              <td>{g.reviewed}</td>
                              <td>{formatRetention(g.retention)}</td>
                              <td class={g.due > 0 ? 'db-stats-due-active' : ''}>{g.due}</td>
                              <td>
                                <Show when={props.onDeleteProject}>
                                  <button
                                    type="button"
                                    class="db-review-remove"
                                    title={`Delete all stats for ${g.name}`}
                                    onClick={(e) => { e.stopPropagation(); props.onDeleteProject!(g.slug); }}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                  </button>
                                </Show>
                              </td>
                            </tr>
                            <Show when={isOpen()}>
                              <For each={g.sections}>
                                {(s) => (
                                  <tr class="db-stats-section-row">
                                    <td>{s.name}</td>
                                    <td>{s.reviewed}</td>
                                    <td>{formatRetention(s.retention)}</td>
                                    <td class={s.due > 0 ? 'db-stats-due-active' : ''}>{s.due}</td>
                                    <td></td>
                                  </tr>
                                )}
                              </For>
                            </Show>
                          </>
                        );
                      }}
                    </For>
                  </tbody>
                </table>
              </div>
              <Show when={hasOverflow()}>
                <button type="button" class="db-stats-show-all" onClick={() => setShowAllDecks(v => !v)}>
                  {showAllDecks() ? 'Show less' : `Show all ${props.groups.length} decks`}
                </button>
              </Show>
            </Show>

            {/* Weak Areas */}
            <Show when={props.weakCards.length > 0}>
              <DiagnosticTab cards={props.weakCards} />
            </Show>

            {/* Chart Panels */}
            <Show when={props.cards.length > 0 || props.reviewLog.length > 0}>
              <div class="sm-grid sm-grid-inline">
                <PanelToday log={props.reviewLog} totalReviews={props.totalReviews} retention={props.retention} weakCount={props.weakCards.length} />
                <PanelCardCounts cards={props.cards} />
                <PanelFutureDue cards={props.cards} />
                <PanelCalendar log={props.reviewLog} />
                <PanelReviews log={props.reviewLog} />
                <PanelIntervals cards={props.cards} />
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
