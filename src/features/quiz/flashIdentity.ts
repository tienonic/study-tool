import type { Flashcard } from '../../projects/types.ts';

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value: string): string {
  return decodeBasicEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function matchKey(value: string): string {
  return stripTags(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function leadingStrongText(html: string): string {
  const match = html.match(/^\s*<strong>(.*?)<\/strong>/i);
  return match ? stripTags(match[1]) : '';
}

function cueTarget(value: string): string {
  const text = stripTags(value);
  const match = text.match(/^what is the best id cue for\s+(.+?)\??$/i);
  return match ? match[1].trim() : '';
}

export function flashIdentityTitle(card: Flashcard, allCards: Flashcard[]): string {
  const ownTitle = leadingStrongText(card.back) || leadingStrongText(card.front);
  if (ownTitle) return ownTitle;

  const target = cueTarget(card.front) || cueTarget(card.back);
  const targetKey = matchKey(target);
  if (!targetKey) return '';

  for (const candidate of allCards) {
    const candidateTitle = leadingStrongText(candidate.back) || leadingStrongText(candidate.front);
    if (candidateTitle && matchKey(candidateTitle).includes(targetKey)) return candidateTitle;
  }

  return target;
}

export function stripDuplicateFlashTitle(html: string, title: string): string {
  if (!title) return html;
  const match = html.match(/^\s*<strong>(.*?)<\/strong>\s*(?:<br\s*\/?>)?/i);
  if (!match || matchKey(match[1]) !== matchKey(title)) return html;
  return html.slice(match[0].length);
}
