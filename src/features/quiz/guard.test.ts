import { describe, it, expect, vi } from 'vitest';
import { createGuard } from './guard.ts';

describe('createGuard', () => {
  it('runs the function and returns its result', async () => {
    const guard = createGuard();
    const result = await guard.withActing(async () => 42);
    expect(result).toBe(42);
  });

  it('blocks concurrent calls (second returns undefined)', async () => {
    const guard = createGuard();
    let resolve1!: () => void;
    const blocker = new Promise<void>(r => { resolve1 = r; });

    const call1 = guard.withActing(async () => { await blocker; return 'first'; });
    const call2 = guard.withActing(async () => 'second');

    // call2 should resolve immediately with undefined (blocked)
    expect(await call2).toBeUndefined();

    // unblock call1
    resolve1();
    expect(await call1).toBe('first');
  });

  it('releases the guard after function completes', async () => {
    const guard = createGuard();
    await guard.withActing(async () => 'done');

    // Should run fine now
    const result = await guard.withActing(async () => 'next');
    expect(result).toBe('next');
  });

  it('releases the guard even if function throws', async () => {
    const guard = createGuard();
    await guard.withActing(async () => { throw new Error('boom'); }).catch(() => {});

    // Guard should be released
    const result = await guard.withActing(async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('isActing returns true while function is running', async () => {
    const guard = createGuard();
    let insideValue = false;
    let resolve1!: () => void;
    const blocker = new Promise<void>(r => { resolve1 = r; });

    const call1 = guard.withActing(async () => {
      insideValue = guard.isActing();
      await blocker;
    });

    // Wait a tick for the async function body to start
    await new Promise(r => setTimeout(r, 0));
    expect(insideValue).toBe(true);
    expect(guard.isActing()).toBe(true);

    resolve1();
    await call1;
    expect(guard.isActing()).toBe(false);
  });

  it('logs errors to console.error and re-throws', async () => {
    const guard = createGuard();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(guard.withActing(async () => { throw new Error('test error'); })).rejects.toThrow('test error');
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
