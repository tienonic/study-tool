import { describe, expect, it } from 'vitest';
import { figureAttempt, figureState, figuresReady, reportFigureState, retryFigure } from './sourceFigures.ts';

describe('required source figures', () => {
  it('waits for required images, reports failure, and recovers on retry', () => {
    const source = '/test-required-figure.png';
    expect(figureState(source)).toBe('loading');
    expect(figuresReady(source)).toBe(false);
    reportFigureState(source, 'error');
    expect(figureState(source)).toBe('error');
    retryFigure(source);
    expect(figureState(source)).toBe('loading');
    expect(figureAttempt(source)).toBe(1);
    reportFigureState(source, 'ready', 0);
    expect(figureState(source)).toBe('loading');
    reportFigureState(source, 'ready', 1);
    expect(figuresReady(source)).toBe(true);
  });

  it('requires the new source to load after the figure changes', () => {
    reportFigureState('/old-source.png', 'ready');
    expect(figuresReady('/old-source.png')).toBe(true);
    expect(figuresReady('/replacement-source.png')).toBe(false);
    reportFigureState('/replacement-source.png', 'ready');
    expect(figuresReady('/replacement-source.png')).toBe(true);
    expect(figuresReady(undefined, '')).toBe(true);
  });
});
