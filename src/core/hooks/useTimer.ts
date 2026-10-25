import { createSignal, batch, onCleanup, untrack } from 'solid-js';

export function useTimer() {
  const [seconds, setSeconds] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const [active, setActive] = createSignal(false);
  const [suspended, setSuspendedState] = createSignal(false);
  let interval: ReturnType<typeof setInterval> | null = null;
  let startedAt: number | null = null;
  let elapsedMs = 0;

  function updateElapsed() {
    const runningMs = startedAt === null ? 0 : Math.max(0, Date.now() - startedAt);
    setSeconds(Math.floor((elapsedMs + runningMs) / 1000));
  }

  function clearTicking(captureElapsed: boolean) {
    if (startedAt !== null) {
      if (captureElapsed) elapsedMs += Math.max(0, Date.now() - startedAt);
      startedAt = null;
    }
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  }

  function beginTicking() {
    startedAt = Date.now();
    interval = setInterval(updateElapsed, 1000);
  }

  function start() {
    clearTicking(false);
    elapsedMs = 0;
    batch(() => {
      setSeconds(0);
      setPaused(false);
      setActive(true);
      if (!untrack(suspended)) beginTicking();
    });
  }

  function stop(): number {
    updateElapsed();
    clearTicking(true);
    batch(() => { setActive(false); setPaused(false); });
    return seconds();
  }

  function pause() {
    if (!active() || paused()) return;
    updateElapsed();
    clearTicking(true);
    setPaused(true);
  }

  function resume() {
    if (!paused()) return;
    setPaused(false);
    if (!untrack(suspended)) beginTicking();
  }

  function reset() {
    clearTicking(false);
    elapsedMs = 0;
    batch(() => { setSeconds(0); setPaused(false); setActive(false); });
  }

  function setSuspended(value: boolean) {
    if (suspended() === value) return;
    if (value) {
      updateElapsed();
      clearTicking(true);
    }
    setSuspendedState(value);
    if (!value && active() && !paused()) beginTicking();
  }

  function togglePause() { paused() ? resume() : pause(); }

  onCleanup(() => clearTicking(false));

  return { seconds, start, stop, reset, pause, resume, setSuspended,
    paused: () => paused() || (active() && suspended()), togglePause };
}
