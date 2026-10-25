import { For, Show, createMemo } from 'solid-js';

export interface WeakCard {
  card_id: string;
  section_id: string;
  section_name: string;
  lapses: number;
  stability: number;
  difficulty: number;
}

interface DiagnosticTabProps {
  cards: WeakCard[];
}

export function DiagnosticTab(props: DiagnosticTabProps) {
  const grouped = createMemo(() => {
    const map = new Map<string, { name: string; cards: WeakCard[] }>();
    for (const c of props.cards) {
      const existing = map.get(c.section_id);
      if (existing) {
        existing.cards.push(c);
      } else {
        map.set(c.section_id, { name: c.section_name, cards: [c] });
      }
    }
    return Array.from(map.values());
  });

  return (
    <div class="db-diag">
      <h2 class="db-diag-heading">Weak Areas</h2>
      <p class="db-diag-desc">Cards with 3+ lapses that need extra attention.</p>
      <Show when={props.cards.length > 0} fallback={
        <div class="db-diag-empty">No weak areas detected. Keep studying!</div>
      }>
        <For each={grouped()}>
          {(group) => (
            <div class="db-diag-section">
              <div class="db-diag-section-title">
                <span>{group.name}</span>
                <span class="db-diag-count">{group.cards.length}</span>
              </div>
              <div class="db-diag-cards">
                <For each={group.cards}>
                  {(c) => (
                    <div class="db-diag-card-row">
                      <span class="db-diag-card-id">{c.card_id}</span>
                      <span class="db-diag-badge">{c.lapses} lapses</span>
                      <span class="db-diag-stability">stab: {c.stability.toFixed(1)}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
