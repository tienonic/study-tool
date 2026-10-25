import type { Flashcard } from '../../projects/types.ts';

export interface FlashPresentation {
  front: string;
  back: string;
  frontImage: string;
  backImage: string;
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function plainText(value: string): string {
  return decodeBasicEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function movePronunciationToTerm(card: Flashcard): { definition: string; term: string } {
  const pronunciation = card.pronunciation_en?.trim();
  if (!pronunciation) return { definition: card.back, term: card.front };

  const lines = card.back.split(/<br\s*\/?>/i);
  const pronunciationIndex = lines.findIndex(line => plainText(line) === pronunciation);
  if (pronunciationIndex < 0) return { definition: card.back, term: card.front };

  lines.splice(pronunciationIndex, 1);
  const definition = lines.join('<br>').replace(/^(?:<br>)+|(?:<br>)+$/gi, '');
  const term = plainText(card.front).includes(pronunciation)
    ? card.front
    : `${card.front.replace(/(?:\s*<br\s*\/?>\s*)+$/gi, '')}<br>${pronunciation}`;
  return { definition, term };
}

export function presentFlashcard(card: Flashcard, definitionFirst: boolean): FlashPresentation {
  if (!definitionFirst) {
    return {
      front: card.front,
      back: card.back,
      frontImage: card.frontImage ?? '',
      backImage: card.backImage ?? '',
    };
  }

  const moved = movePronunciationToTerm(card);
  return {
    front: moved.definition,
    back: moved.term,
    frontImage: card.backImage ?? '',
    backImage: card.frontImage ?? '',
  };
}

export function chooseMixedDefinitionFirst(
  choices: Map<string, boolean>,
  cardId: string,
  random: () => number = Math.random,
): boolean {
  const existing = choices.get(cardId);
  if (existing !== undefined) return existing;
  const selected = random() < 0.5;
  choices.set(cardId, selected);
  return selected;
}
