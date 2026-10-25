import { createSignal } from 'solid-js';

export interface HistoryEntry {
  idx: number;
  scenarioIdx?: number;
  questionIdx?: number;
  cardId: string;
  selected: string | null;
  correct: string;
  optionOrder: string[];
  isCorrect: boolean;
  skipped: boolean;
  explanation: string;
  passage: string;
}

export interface HistoryPosition {
  current: number;
  total: number;
  reviewing: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export function createHistoryNav() {
  let history: HistoryEntry[] = [];
  let histPos = -1;
  const [historyReview, setHistoryReview] = createSignal<HistoryEntry | null>(null);
  const [historyPosition, setHistoryPosition] = createSignal<HistoryPosition>({
    current: 0,
    total: 0,
    reviewing: false,
    canGoBack: false,
    canGoForward: false,
  });

  function updatePosition(reviewing = historyReview() !== null) {
    const total = history.length;
    setHistoryPosition({
      current: total > 0 && histPos >= 0 ? histPos + 1 : 0,
      total,
      reviewing,
      canGoBack: history.length > 0 && histPos > 0,
      canGoForward: history.length > 0 && histPos >= 0 && histPos < history.length - 1,
    });
  }

  function canGoBack(): boolean {
    return history.length > 0 && histPos > 0;
  }

  function canGoForward(): boolean {
    return history.length > 0 && histPos >= 0 && histPos < history.length - 1;
  }

  function push(entry: HistoryEntry) {
    history = history.slice(0, histPos + 1);
    history.push(entry);
    histPos = history.length - 1;
    updatePosition(false);
  }

  function goBack(onRestore: (entry: HistoryEntry) => void) {
    if (!canGoBack()) return;
    histPos--;
    const entry = history[histPos];
    if (!entry) return;
    setHistoryReview(entry);
    updatePosition(true);
    onRestore(entry);
  }

  function advance(onRestore: (entry: HistoryEntry) => void): boolean {
    if (!canGoForward()) return false;
    histPos++;
    const entry = history[histPos];
    if (!entry) {
      setHistoryReview(null);
      updatePosition(false);
      return false;
    }
    setHistoryReview(entry);
    updatePosition(true);
    onRestore(entry);
    return true;
  }

  function reset() {
    history = [];
    histPos = -1;
    setHistoryReview(null);
    updatePosition(false);
  }

  function getEntry(pos: number): HistoryEntry | undefined {
    return history[pos];
  }

  function getPos(): number {
    return histPos;
  }

  function clearReview() {
    setHistoryReview(null);
    updatePosition(false);
  }

  return {
    historyReview,
    historyPosition,
    canGoBack,
    canGoForward,
    push,
    goBack,
    advance,
    reset,
    clearReview,
    getEntry,
    getPos,
  };
}
