import { createRoot, createComputed, createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimer } from './useTimer.ts';

vi.mock('solid-js', async () => {
  const runtime = 'solid-js/dist/solid.js';
  return import(runtime);
});

describe('useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T20:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks elapsed wall-clock time when browser timer callbacks are delayed', () => {
    let timer!: ReturnType<typeof useTimer>;
    const dispose = createRoot((cleanup) => {
      timer = useTimer();
      return cleanup;
    });

    timer.start();
    vi.setSystemTime(new Date('2026-08-27T20:00:05Z'));
    vi.advanceTimersToNextTimer();

    expect(timer.seconds()).toBe(6);
    dispose();
  });

  it('does not create a paused timer when nothing is running', () => {
    let timer!: ReturnType<typeof useTimer>;
    const dispose = createRoot((cleanup) => {
      timer = useTimer();
      return cleanup;
    });

    timer.pause();

    expect(timer.paused()).toBe(false);
    dispose();
  });

  it('keeps a late async question timer suspended until the drill is visible', async () => {
    let timer!: ReturnType<typeof useTimer>;
    const dispose = createRoot((cleanup) => {
      timer = useTimer();
      return cleanup;
    });

    timer.setSuspended(true);
    await Promise.resolve().then(() => timer.start());
    vi.advanceTimersByTime(60_000);
    expect(timer.seconds()).toBe(0);
    expect(timer.paused()).toBe(true);

    timer.setSuspended(false);
    vi.advanceTimersByTime(5_000);
    expect(timer.stop()).toBe(5);
    dispose();
  });

  it('preserves elapsed time across workbook and map visits', () => {
    let timer!: ReturnType<typeof useTimer>;
    const dispose = createRoot((cleanup) => {
      timer = useTimer();
      return cleanup;
    });

    timer.start();
    vi.advanceTimersByTime(5_000);
    timer.setSuspended(true);
    vi.advanceTimersByTime(60_000);
    timer.setSuspended(true);
    vi.advanceTimersByTime(60_000);
    timer.setSuspended(false);
    vi.advanceTimersByTime(3_000);
    expect(timer.stop()).toBe(8);
    dispose();
  });

  it('preserves a manual pause when leaving a workspace view', () => {
    let timer!: ReturnType<typeof useTimer>;
    const dispose = createRoot((cleanup) => {
      timer = useTimer();
      return cleanup;
    });

    timer.start();
    vi.advanceTimersByTime(5_000);
    timer.pause();
    timer.setSuspended(true);
    vi.advanceTimersByTime(60_000);
    timer.setSuspended(false);
    vi.advanceTimersByTime(60_000);
    expect(timer.paused()).toBe(true);
    expect(timer.seconds()).toBe(5);

    timer.resume();
    vi.advanceTimersByTime(3_000);
    expect(timer.stop()).toBe(8);
    dispose();
  });

  it('does not restart a stopped or reset timer when the drill becomes visible', () => {
    let timer!: ReturnType<typeof useTimer>;
    const dispose = createRoot((cleanup) => {
      timer = useTimer();
      return cleanup;
    });

    for (const finish of [() => timer.stop(), () => timer.reset()]) {
      timer.setSuspended(true);
      timer.start();
      finish();
      timer.setSuspended(false);
      vi.advanceTimersByTime(60_000);
      expect(timer.seconds()).toBe(0);
      expect(timer.paused()).toBe(false);
    }
    dispose();
  });


  it('does not rerun section activation when workspace suspension changes', () => {
    let timer!: ReturnType<typeof useTimer>;
    const dispose = createRoot((cleanup) => {
      timer = useTimer();
      const [activeTab] = createSignal('motion');
      createComputed(() => {
        if (activeTab() === 'motion') timer.start();
      });
      return cleanup;
    });

    vi.advanceTimersByTime(5_000);
    timer.setSuspended(true);
    vi.advanceTimersByTime(60_000);
    timer.setSuspended(false);
    vi.advanceTimersByTime(3_000);
    expect(timer.stop()).toBe(8);
    dispose();
  });

});
