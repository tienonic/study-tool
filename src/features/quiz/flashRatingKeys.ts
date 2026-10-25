/** Fixed number-key layout shared by simple and complex flashcard review. */
export function flashRatingForNumberKey(key: string, simpleMode: boolean): number | null {
  if (key === '1') return 1; // Again
  if (key === '2') return 3; // Good
  if (simpleMode) return null;
  if (key === '3') return 2; // Hard
  if (key === '4') return 3; // Good
  if (key === '5') return 4; // Easy
  return null;
}
