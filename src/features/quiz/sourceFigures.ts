import { createSignal } from 'solid-js';

export type FigureState = 'loading' | 'ready' | 'error';
interface FigureLoad { state: FigureState; attempt: number }

const [loads, setLoads] = createSignal(new Map<string, FigureLoad>());

export function figureState(source: string | undefined): FigureState {
  return source ? loads().get(source)?.state ?? 'loading' : 'ready';
}

export function figureAttempt(source: string): number {
  return loads().get(source)?.attempt ?? 0;
}

export function reportFigureState(source: string, state: FigureState, attempt = figureAttempt(source)): void {
  if (attempt !== figureAttempt(source)) return;
  if (loads().get(source)?.state === state) return;
  setLoads(previous => new Map(previous).set(source, { state, attempt }));
}

export function retryFigure(source: string): void {
  setLoads(previous => new Map(previous).set(source, { state: 'loading', attempt: figureAttempt(source) + 1 }));
}

export function figuresReady(...sources: (string | undefined)[]): boolean {
  return sources.every(source => figureState(source) === 'ready');
}
