import { describe, expect, it } from 'vitest';
import { flashRatingForNumberKey } from './flashRatingKeys.ts';

describe('flashcard number-key ratings', () => {
  it('keeps 1 as Again and 2 as Good in simple mode', () => {
    expect(flashRatingForNumberKey('1', true)).toBe(1);
    expect(flashRatingForNumberKey('2', true)).toBe(3);
    expect(flashRatingForNumberKey('3', true)).toBeNull();
  });

  it('adds Hard, Good, and Easy on 3, 4, and 5 in complex mode', () => {
    expect([1, 2, 3, 4, 5].map(key => flashRatingForNumberKey(String(key), false)))
      .toEqual([1, 3, 2, 3, 4]);
  });
});
