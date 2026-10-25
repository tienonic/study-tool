import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import type { CardRow, ReviewLogRow } from '../../core/workers/protocol.ts';
import {
  aggregateTodaySummary, aggregateFutureDue, aggregateCalendar,
  aggregateReviews, aggregateCardCounts, aggregateIntervals, avgInterval,
  formatRetention,
} from './statsAggregations.ts';
import { drawBarChart, drawStackedBarChart, drawPieChart, drawHeatmap, setupTooltip } from './statsCharts.ts';

export interface PanelTodayProps { log: ReviewLogRow[]; totalReviews: number; retention: number | null; weakCount: number }
export interface PanelCardsProps { cards: CardRow[] }
export interface PanelLogProps { log: ReviewLogRow[] }

export function PanelToday(props: PanelTodayProps) {
  const summary = () => aggregateTodaySummary(props.log);
  return (
    <div class="sm-card">
      <div class="sm-card-title">Today</div>
      <Show when={summary().studied > 0} fallback={<div class="sm-empty">No cards studied today.</div>}>
        <div class="sm-today">
          <div class="sm-metric">
            <span class="sm-metric-value">{summary().studied}</span>
            <span class="sm-metric-label">studied</span>
          </div>
          <div class="sm-metric">
            <span class="sm-metric-value">{summary().correctPct}%</span>
            <span class="sm-metric-label">correct</span>
          </div>
          <div class="sm-metric">
            <span class="sm-metric-value">{summary().againCount}</span>
            <span class="sm-metric-label">again</span>
          </div>
        </div>
      </Show>
      <div class="sm-divider" />
      <div class="sm-card-title">Total</div>
      <div class="sm-today">
        <div class="sm-metric">
          <span class="sm-metric-value">{props.totalReviews}</span>
          <span class="sm-metric-label">reviewed</span>
        </div>
        <div class="sm-metric">
          <span class="sm-metric-value">{formatRetention(props.retention)}</span>
          <span class="sm-metric-label">retention</span>
        </div>
        <Show when={props.weakCount > 0}>
          <div class="sm-metric">
            <span class="sm-metric-value sm-metric-value--warn">{props.weakCount}</span>
            <span class="sm-metric-label">difficult</span>
          </div>
        </Show>
      </div>
    </div>
  );
}

export function PanelCardCounts(props: PanelCardsProps) {
  let canvasEl!: HTMLCanvasElement;
  const slices = () => aggregateCardCounts(props.cards);
  const total = () => props.cards.length;

  createEffect(() => {
    const s = slices();
    if (canvasEl) drawPieChart(canvasEl, s.map(sl => ({ label: sl.label, value: sl.count, color: sl.color })));
  });

  return (
    <div class="sm-card">
      <div class="sm-card-title">Counts</div>
      <canvas ref={canvasEl} class="sm-canvas sm-canvas-pie" />
      <div class="sm-summary">{total()} total</div>
    </div>
  );
}

export function PanelFutureDue(props: PanelCardsProps) {
  let canvasEl!: HTMLCanvasElement;
  let tipEl!: HTMLDivElement;
  let ttCleanup: (() => void) | undefined;
  const [days, setDays] = createSignal(30);

  createEffect(() => {
    const bars = aggregateFutureDue(props.cards, days());
    if (canvasEl) {
      const regions = drawBarChart(canvasEl, bars.map(b => ({ label: `Day ${b.dayOffset}`, value: b.count })), '#7cc47c');
      ttCleanup?.();
      if (tipEl) ttCleanup = setupTooltip(canvasEl, tipEl, regions);
    }
  });

  const dueTomorrow = () => {
    const bars = aggregateFutureDue(props.cards, 2);
    return bars[1]?.count ?? 0;
  };

  onCleanup(() => ttCleanup?.());

  return (
    <div class="sm-card sm-full">
      <div class="sm-card-header">
        <div class="sm-card-title">Future Due</div>
        <div class="sm-toggles">
          {[{ l: '1 month', v: 30 }, { l: '3 months', v: 90 }, { l: '1 year', v: 365 }].map(o => (
            <button type="button" class={`sm-toggle ${days() === o.v ? 'sm-toggle--active' : ''}`}
              onClick={() => setDays(o.v)}>{o.l}</button>
          ))}
        </div>
      </div>
      <div class="sm-chart-wrap">
        <canvas ref={canvasEl} class="sm-canvas sm-canvas-wide" />
        <div ref={tipEl} class="sm-tooltip" />
      </div>
      <div class="sm-summary">Due tomorrow: {dueTomorrow()} reviews</div>
    </div>
  );
}

export function PanelReviews(props: PanelLogProps) {
  let canvasEl!: HTMLCanvasElement;
  let tipEl!: HTMLDivElement;
  let ttCleanup: (() => void) | undefined;
  const [days, setDays] = createSignal(0);

  const bars = () => aggregateReviews(props.log, days());

  createEffect(() => {
    const b = bars();
    if (canvasEl) {
      const regions = drawStackedBarChart(canvasEl, b.map(r => ({ label: r.date.slice(5), ...r })));
      ttCleanup?.();
      if (tipEl) ttCleanup = setupTooltip(canvasEl, tipEl, regions);
    }
  });

  const stats = () => {
    const b = bars();
    const total = b.reduce((s, r) => s + r.again + r.hard + r.good + r.easy, 0);
    const daysStudied = b.filter(r => r.again + r.hard + r.good + r.easy > 0).length;
    const span = b.length;
    const pct = span > 0 ? Math.round((daysStudied / span) * 100) : 0;
    const avg = daysStudied > 0 ? Math.round(total / daysStudied) : 0;
    return { total, daysStudied, pct, avg, span };
  };

  onCleanup(() => ttCleanup?.());

  return (
    <div class="sm-card sm-full">
      <div class="sm-card-header">
        <div class="sm-card-title">Reviews</div>
        <div class="sm-toggles">
          {[{ l: '1 month', v: 30 }, { l: '3 months', v: 90 }, { l: '1 year', v: 365 }, { l: 'all', v: 0 }].map(o => (
            <button type="button" class={`sm-toggle ${days() === o.v ? 'sm-toggle--active' : ''}`}
              onClick={() => setDays(o.v)}>{o.l}</button>
          ))}
        </div>
      </div>
      <div class="sm-chart-wrap">
        <canvas ref={canvasEl} class="sm-canvas sm-canvas-wide" />
        <div ref={tipEl} class="sm-tooltip" />
      </div>
      <div class="sm-summary">
        {stats().daysStudied} of {stats().span} days ({stats().pct}%) &middot; {stats().total} total &middot; {stats().avg} avg/day
      </div>
    </div>
  );
}

export function PanelCalendar(props: PanelLogProps) {
  let canvasEl!: HTMLCanvasElement;
  let tipEl!: HTMLDivElement;
  let ttCleanup: (() => void) | undefined;
  const [year, setYear] = createSignal(new Date().getFullYear());

  createEffect(() => {
    const d = aggregateCalendar(props.log, year());
    if (canvasEl) {
      const regions = drawHeatmap(canvasEl, d, year());
      ttCleanup?.();
      if (tipEl) ttCleanup = setupTooltip(canvasEl, tipEl, regions);
    }
  });

  onCleanup(() => ttCleanup?.());

  return (
    <div class="sm-card sm-full">
      <div class="sm-card-header">
        <div class="sm-card-title">Calendar</div>
        <div class="sm-toggles">
          <button type="button" class="sm-toggle" onClick={() => setYear(y => y - 1)}>&larr;</button>
          <span class="sm-year">{year()}</span>
          <button type="button" class="sm-toggle" onClick={() => setYear(y => y + 1)}>&rarr;</button>
        </div>
      </div>
      <div class="sm-chart-wrap">
        <canvas ref={canvasEl} class="sm-canvas sm-canvas-heatmap" />
        <div ref={tipEl} class="sm-tooltip" />
      </div>
    </div>
  );
}

export function PanelIntervals(props: PanelCardsProps) {
  let canvasEl!: HTMLCanvasElement;
  let tipEl!: HTMLDivElement;
  let ttCleanup: (() => void) | undefined;
  const [cap, setCap] = createSignal<number | null>(null);

  createEffect(() => {
    const buckets = aggregateIntervals(props.cards, cap());
    if (canvasEl) {
      const regions = drawBarChart(canvasEl, buckets.map(b => ({ label: `${b.rangeLabel}d`, value: b.count })));
      ttCleanup?.();
      if (tipEl) ttCleanup = setupTooltip(canvasEl, tipEl, regions);
    }
  });

  onCleanup(() => ttCleanup?.());

  const avg = () => avgInterval(props.cards);

  return (
    <div class="sm-card sm-full">
      <div class="sm-card-header">
        <div class="sm-card-title">Review Intervals</div>
        <div class="sm-toggles">
          {[
            { l: '50%', v: 0.5 as number | null },
            { l: '95%', v: 0.95 as number | null },
            { l: 'all', v: null as number | null },
          ].map(o => (
            <button type="button" class={`sm-toggle ${cap() === o.v ? 'sm-toggle--active' : ''}`}
              onClick={() => setCap(o.v)}>{o.l}</button>
          ))}
        </div>
      </div>
      <div class="sm-chart-wrap">
        <canvas ref={canvasEl} class="sm-canvas sm-canvas-wide" />
        <div ref={tipEl} class="sm-tooltip" />
      </div>
      <div class="sm-summary">Average interval: {avg()} days</div>
    </div>
  );
}
