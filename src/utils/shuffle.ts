/** Fisher-Yates shuffle - returns a new array */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sameOrder<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => Object.is(item, b[index]));
}

function fallbackDifferentOrder<T>(arr: readonly T[], previous: readonly T[]): T[] | null {
  for (let i = 0; i < arr.length - 1; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (Object.is(arr[i], arr[j])) continue;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      if (!sameOrder(next, previous)) return next;
    }
  }
  return null;
}

/** Shuffle while avoiding the previous order when a different order is possible. */
export function shuffleAvoidingPrevious<T>(arr: T[], previous?: readonly T[]): T[] {
  if (!previous || previous.length !== arr.length) return shuffle(arr);

  for (let attempt = 0; attempt < 8; attempt++) {
    const next = shuffle(arr);
    if (!sameOrder(next, previous)) return next;
  }

  return fallbackDifferentOrder(arr, previous) ?? shuffle(arr);
}
