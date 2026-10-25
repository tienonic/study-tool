import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'solid-js';
import { createHistoryNav } from './historyNav.ts';

function makeEntry(cardId: string, answered: boolean = true) {
  return {
    idx: 0,
    cardId,
    selected: answered ? 'A' : null,
    correct: 'A',
    optionOrder: ['A', 'B', 'C'],
    isCorrect: answered,
    skipped: false,
    explanation: '',
    passage: '',
  };
}

describe('createHistoryNav', () => {
  it('canGoBack returns false when history is empty', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      expect(nav.canGoBack()).toBe(false);
      dispose();
    });
  });

  it('historyReview is null initially', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      expect(nav.historyReview()).toBeNull();
      dispose();
    });
  });

  it('push adds an entry', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      nav.push(makeEntry('sec1-0'));
      // After one push, can't go back (nothing before)
      expect(nav.canGoBack()).toBe(false);
      expect(nav.historyPosition()).toMatchObject({ current: 1, total: 1, canGoForward: false });
      dispose();
    });
  });

  it('canGoBack returns true after two pushes', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      nav.push(makeEntry('sec1-0'));
      nav.push(makeEntry('sec1-1'));
      expect(nav.canGoBack()).toBe(true);
      dispose();
    });
  });

  it('goBack calls onRestore with the previous entry', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      nav.push(makeEntry('sec1-0'));
      nav.push(makeEntry('sec1-1'));
      const onRestore = vi.fn();
      nav.goBack(onRestore);
      expect(onRestore).toHaveBeenCalledOnce();
      expect(onRestore.mock.calls[0][0].cardId).toBe('sec1-0');
      dispose();
    });
  });

  it('goBack sets historyReview', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      nav.push(makeEntry('sec1-0'));
      nav.push(makeEntry('sec1-1'));
      nav.goBack(vi.fn());
      expect(nav.historyReview()).not.toBeNull();
      expect(nav.historyReview()!.cardId).toBe('sec1-0');
      dispose();
    });
  });

  it('advance restores the next history entry', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      nav.push(makeEntry('sec1-0'));
      nav.push(makeEntry('sec1-1'));
      nav.goBack(vi.fn()); // now at sec1-0
      const onRestore = vi.fn();
      const advanced = nav.advance(onRestore);
      // Should advance to sec1-1 (which is answered), call onRestore
      expect(advanced).toBe(true);
      expect(onRestore).toHaveBeenCalledOnce();
      expect(onRestore.mock.calls[0][0].cardId).toBe('sec1-1');
      expect(nav.historyPosition()).toMatchObject({ current: 2, total: 2, canGoForward: false });
      dispose();
    });
  });

  it('advance at the end is a no-op', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      nav.push(makeEntry('sec1-0'));
      const onRestore = vi.fn();
      const advanced = nav.advance(onRestore);
      expect(advanced).toBe(false);
      expect(onRestore).not.toHaveBeenCalled();
      expect(nav.historyPosition()).toMatchObject({ current: 1, total: 1, canGoForward: false });
      dispose();
    });
  });

  it('advance restores unanswered entry without calling pickNext', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      nav.push(makeEntry('sec1-0'));
      nav.push(makeEntry('sec1-1', false)); // unanswered
      nav.goBack(vi.fn()); // back to sec1-0
      const onRestore = vi.fn();
      const advanced = nav.advance(onRestore);
      // sec1-1 is unanswered, should restore it
      expect(advanced).toBe(true);
      expect(onRestore).toHaveBeenCalledOnce();
      expect(onRestore.mock.calls[0][0].cardId).toBe('sec1-1');
      dispose();
    });
  });

  it('push after goBack truncates future entries', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      nav.push(makeEntry('sec1-0'));
      nav.push(makeEntry('sec1-1'));
      nav.push(makeEntry('sec1-2'));
      nav.goBack(vi.fn()); // at sec1-1
      nav.goBack(vi.fn()); // at sec1-0
      nav.push(makeEntry('sec1-new'));
      // sec1-1 and sec1-2 should be gone, replaced by sec1-new
      expect(nav.canGoBack()).toBe(true); // sec1-0 is before
      const onRestore = vi.fn();
      const advanced = nav.advance(onRestore);
      expect(advanced).toBe(false);
      expect(onRestore).not.toHaveBeenCalled();
      expect(nav.historyPosition()).toMatchObject({ current: 2, total: 2, canGoForward: false });
      dispose();
    });
  });

  it('reset clears everything', () => {
    createRoot(dispose => {
      const nav = createHistoryNav();
      nav.push(makeEntry('sec1-0'));
      nav.push(makeEntry('sec1-1'));
      nav.reset();
      expect(nav.canGoBack()).toBe(false);
      expect(nav.historyReview()).toBeNull();
      dispose();
    });
  });
});
