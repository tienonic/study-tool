import { describe, expect, it, vi } from 'vitest';
import { chooseMixedDefinitionFirst, presentFlashcard } from './flashPresentation.ts';

const vocabularyCard = {
  front: 'приве́т',
  back: '<strong>hello</strong><br>приве́т — pree-VYET<br>Informal greeting.<br>Interjection.',
  pronunciation_en: 'приве́т — pree-VYET',
  frontImage: 'front.png',
  backImage: 'back.png',
};

describe('flashcard presentation order', () => {
  it('leaves term-first cards unchanged', () => {
    expect(presentFlashcard(vocabularyCard, false)).toEqual({
      front: vocabularyCard.front,
      back: vocabularyCard.back,
      frontImage: 'front.png',
      backImage: 'back.png',
    });
  });

  it('moves pronunciation off a definition-first prompt and onto the revealed term', () => {
    expect(presentFlashcard(vocabularyCard, true)).toEqual({
      front: '<strong>hello</strong><br>Informal greeting.<br>Interjection.',
      back: 'приве́т<br>приве́т — pree-VYET',
      frontImage: 'back.png',
      backImage: 'front.png',
    });
  });

  it('keeps one random side choice per card so history does not change the cue', () => {
    const random = vi.fn().mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
    const choices = new Map<string, boolean>();

    expect(chooseMixedDefinitionFirst(choices, 'card-a', random)).toBe(true);
    expect(chooseMixedDefinitionFirst(choices, 'card-a', random)).toBe(true);
    expect(chooseMixedDefinitionFirst(choices, 'card-b', random)).toBe(false);
    expect(random).toHaveBeenCalledTimes(2);
  });
});
