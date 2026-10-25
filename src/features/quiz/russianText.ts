const BREAK = /(<br\s*\/?>)/gi;
const BREAK_ONLY = /^<br\s*\/?>$/i;
const HTML_TOKEN = /(<[^>]+>)/g;
const CYRILLIC_WORD = /[\p{Script=Cyrillic}][\p{Script=Cyrillic}\p{M}'’‑-]*/gu;
const HAS_CYRILLIC = /\p{Script=Cyrillic}/u;
const COMBINING_MARK = /\p{M}/u;
const VOWELS = new Set('аеёиоуыэюя');
const TONE_COUNT = 7;

const VALID_ONSETS = new Set([
  'бл', 'бр', 'вл', 'вр', 'гл', 'гр', 'дв', 'дл', 'др', 'жд', 'жр', 'зв', 'зл', 'зн',
  'кл', 'кр', 'мл', 'мн', 'пл', 'пр', 'пс', 'ск', 'сл', 'см', 'сн', 'сп', 'ст', 'сф',
  'сх', 'тв', 'тр', 'фл', 'фр', 'хл', 'хр', 'цв', 'чв', 'шв', 'шк', 'шл', 'шм',
  'шп', 'шт', 'вск', 'всп', 'вст', 'здр', 'скр', 'спл', 'спр', 'стр', 'схв', 'шкр',
]);

const TRANSLITERATION: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: "'", э: 'e', ю: 'yu', я: 'ya',
};

interface PronunciationHint {
  form: string;
  guide: string;
  guideByWord: Map<string, string[]>;
}

export interface RussianStudyFormatOptions {
  interactive?: boolean;
  showPlainForm?: boolean;
  partOfSpeech?: string;
}

function stripStress(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

function wordKey(value: string): string {
  return stripStress(value).toLowerCase();
}

function graphemes(word: string): string[] {
  const units: string[] = [];
  for (const character of word.normalize('NFD')) {
    if (COMBINING_MARK.test(character) && units.length > 0) units[units.length - 1] += character;
    else units.push(character);
  }
  return units.map(unit => unit.normalize('NFC'));
}

function baseLetter(unit: string): string {
  return stripStress(unit).toLowerCase();
}

function isVowel(unit: string): boolean {
  return VOWELS.has(baseLetter(unit));
}

function fallbackBoundary(units: string[], currentVowel: number, nextVowel: number): number {
  const cluster = units.slice(currentVowel + 1, nextVowel).map(baseLetter);
  if (cluster.length === 0) return nextVowel;

  const lastSign = Math.max(cluster.lastIndexOf('ь'), cluster.lastIndexOf('ъ'));
  if (lastSign >= 0) return currentVowel + 2 + lastSign;

  for (let length = Math.min(3, cluster.length); length >= 2; length--) {
    if (VALID_ONSETS.has(cluster.slice(-length).join(''))) return nextVowel - length;
  }
  return nextVowel - 1;
}

function fallbackSyllables(word: string): string[] {
  const units = graphemes(word);
  const vowels = units.flatMap((unit, index) => isVowel(unit) ? [index] : []);
  if (vowels.length <= 1) return [word];

  const result: string[] = [];
  let start = 0;
  for (let index = 0; index < vowels.length - 1; index++) {
    const boundary = fallbackBoundary(units, vowels[index], vowels[index + 1]);
    result.push(units.slice(start, boundary).join('').normalize('NFC'));
    start = boundary;
  }
  result.push(units.slice(start).join('').normalize('NFC'));
  return result.filter(Boolean);
}

function transliterate(value: string): string {
  return graphemes(value).map(unit => TRANSLITERATION[baseLetter(unit)] ?? baseLetter(unit)).join('');
}

function phoneticKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/shch/g, 'Q')
    .replace(/zh/g, 'J')
    .replace(/kh/g, 'X')
    .replace(/ts/g, 'C')
    .replace(/ch/g, 'H')
    .replace(/sh/g, 'S')
    .replace(/([aeiouy])h/g, '$1')
    .replace(/[aeiouy]+/g, 'V')
    .replace(/[fv]/g, 'F')
    .replace(/[bp]/g, 'B')
    .replace(/[gk]/g, 'G')
    .replace(/[dt]/g, 'D')
    .replace(/[zs]/g, 'Z')
    .replace(/[^a-zA-Z'QJXCHS]/g, '');
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function segmentScore(segment: string, guide: string): number {
  const left = phoneticKey(transliterate(segment));
  const right = phoneticKey(guide);
  return editDistance(left, right) / Math.max(1, left.length, right.length);
}

function guidedSyllables(word: string, guideSegments: string[]): string[] | null {
  const units = graphemes(word);
  const vowels = units.flatMap((unit, index) => isVowel(unit) ? [index] : []);
  if (vowels.length === 0 || vowels.length !== guideSegments.length) return null;

  const memo = new Map<string, { score: number; segments: string[] } | null>();
  function solve(syllableIndex: number, start: number): { score: number; segments: string[] } | null {
    const cacheKey = `${syllableIndex}:${start}`;
    if (memo.has(cacheKey)) return memo.get(cacheKey) ?? null;

    if (syllableIndex === vowels.length - 1) {
      const segment = units.slice(start).join('').normalize('NFC');
      const answer = { score: segmentScore(segment, guideSegments[syllableIndex]), segments: [segment] };
      memo.set(cacheKey, answer);
      return answer;
    }

    const preferred = fallbackBoundary(units, vowels[syllableIndex], vowels[syllableIndex + 1]);
    let best: { score: number; segments: string[] } | null = null;
    for (let boundary = vowels[syllableIndex] + 1; boundary <= vowels[syllableIndex + 1]; boundary++) {
      const rest = solve(syllableIndex + 1, boundary);
      if (!rest) continue;
      const segment = units.slice(start, boundary).join('').normalize('NFC');
      const tieBreaker = Math.abs(boundary - preferred) * 0.001;
      const score = segmentScore(segment, guideSegments[syllableIndex]) + rest.score + tieBreaker;
      if (!best || score < best.score) best = { score, segments: [segment, ...rest.segments] };
    }
    memo.set(cacheKey, best);
    return best;
  }

  return solve(0, 0)?.segments ?? null;
}

export function splitRussianSyllables(word: string, guideSegments?: string[]): string[] {
  return (guideSegments?.length ? guidedSyllables(word, guideSegments) : null) ?? fallbackSyllables(word);
}

function parsePronunciation(value: string | undefined): PronunciationHint | null {
  if (!value) return null;
  const divider = value.indexOf(' — ');
  if (divider < 0) return null;
  const form = value.slice(0, divider).trim();
  const guide = value.slice(divider + 3).trim();
  if (!form || !guide || !HAS_CYRILLIC.test(form)) return null;

  const formWords = form.match(CYRILLIC_WORD) ?? [];
  const guideWords = guide.split(/\s+/).filter(Boolean);
  const guideByWord = new Map<string, string[]>();
  if (formWords.length === guideWords.length) {
    formWords.forEach((word, index) => {
      const segments = guideWords[index].split('-').filter(Boolean);
      if (segments.length > 0) guideByWord.set(wordKey(word), segments);
    });
  }
  return { form, guide, guideByWord };
}

function syllableInteraction(syllable: string, interactive: boolean): string {
  if (!interactive || !syllable) return '';
  const audio = stripStress(syllable).normalize('NFC');
  return ` data-russian-syllable-audio="${audio}" role="button" tabindex="0" aria-label="Play syllable ${audio}"`;
}

function syllableMarkup(syllables: string[], interactive: boolean): string {
  return syllables
    .map((syllable, index) => `<span class="russian-syllable syllable-tone-${index % TONE_COUNT}"${syllableInteraction(syllable, interactive)}>${syllable}</span>`)
    .join('');
}

function wordMarkup(word: string, hint: PronunciationHint | null, interactive: boolean): string {
  const syllables = splitRussianSyllables(word, hint?.guideByWord.get(wordKey(word)));
  const audio = stripStress(word).normalize('NFC');
  const interaction = interactive ? ` data-russian-audio="${audio}"` : '';
  return `<span class="russian-word" lang="ru"${interaction}>${syllableMarkup(syllables, interactive)}</span>`;
}

function markCyrillicText(text: string, hint: PronunciationHint | null, interactive: boolean): string {
  return text.replace(CYRILLIC_WORD, word => wordMarkup(word, hint, interactive));
}

function markTextNodes(html: string, hint: PronunciationHint | null, interactive: boolean): string {
  return html
    .split(HTML_TOKEN)
    .map(token => token.startsWith('<') ? token : markCyrillicText(token, hint, interactive))
    .join('');
}

function pronunciationAudioSyllables(hint: PronunciationHint): string[] {
  const formWords = hint.form.match(CYRILLIC_WORD) ?? [];
  return formWords.flatMap(word => (
    splitRussianSyllables(word, hint.guideByWord.get(wordKey(word)))
      .map(syllable => stripStress(syllable).normalize('NFC'))
  ));
}

function guideMarkup(guide: string, audioSyllables: string[], interactive: boolean): string {
  let tone = 0;
  let audioIndex = 0;
  return guide
    .split(/(\s+|-)/)
    .map(part => {
      if (!part) return '';
      if (/^\s+$/.test(part)) {
        tone = 0;
        return part;
      }
      if (part === '-') return '<span class="pronunciation-divider">-</span>';
      const audio = audioSyllables[audioIndex++] ?? '';
      const markup = `<span class="pronunciation-syllable syllable-tone-${tone % TONE_COUNT}"${syllableInteraction(audio, interactive)}>${part}</span>`;
      tone++;
      return markup;
    })
    .join('');
}

function partOfSpeechGroup(value: string | undefined): string {
  const words = value?.toLowerCase().split(/[^a-z]+/).filter(Boolean) ?? [];
  const known = [
    'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction',
    'numeral', 'interjection', 'particle',
  ];
  return known.find(group => words.includes(group)) ?? 'other';
}

function plainFormMarkup(hint: PronunciationHint, options: RussianStudyFormatOptions): string {
  if (!options.showPlainForm) return '';
  const audio = stripStress(hint.form).normalize('NFC');
  const interaction = options.interactive
    ? ` data-russian-audio="${audio}" role="button" tabindex="0" aria-label="Play ${audio}"`
    : '';
  return `<span class="russian-pronunciation-plain russian-pos-${partOfSpeechGroup(options.partOfSpeech)}" lang="ru"${interaction}>${hint.form}</span>`;
}

function pronunciationLine(
  html: string,
  options: RussianStudyFormatOptions,
): string | null {
  if (html.includes('<')) return null;
  const hint = parsePronunciation(html);
  if (!hint || /[A-Za-z]/.test(hint.form) || !/[A-Za-z]/.test(hint.guide)) return null;
  const audioSyllables = pronunciationAudioSyllables(hint);
  const interactive = options.interactive === true;

  return [
    '<span class="russian-pronunciation-line">',
    `<span class="russian-pronunciation-form" lang="ru">${markCyrillicText(hint.form, hint, interactive)}</span>`,
    `<span class="russian-pronunciation-guide">${guideMarkup(hint.guide, audioSyllables, interactive)}</span>`,
    '</span>',
  ].join('');
}

function comparablePlainText(value: string): string {
  return wordKey(value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
}

function removeDuplicatePlainForm(parts: string[], showPlainForm: boolean): string[] {
  if (!showPlainForm) return parts;
  const result = [...parts];
  for (let index = 2; index < result.length; index++) {
    const pronunciation = parsePronunciation(result[index]);
    if (!pronunciation || !BREAK_ONLY.test(result[index - 1])) continue;
    if (comparablePlainText(result[index - 2]) !== comparablePlainText(pronunciation.form)) continue;
    result.splice(index - 2, 2);
    index -= 2;
  }
  return result;
}

/** Presentation-only syllable markup. Source deck copy remains unchanged. */
export function formatRussianStudyHtml(
  html: string | undefined,
  pronunciation: string | undefined,
  options: boolean | RussianStudyFormatOptions = false,
): string {
  if (!html) return '';
  const resolved = typeof options === 'boolean' ? { interactive: options } : options;
  const hint = parsePronunciation(pronunciation);
  const formatted = removeDuplicatePlainForm(html.split(BREAK), resolved.showPlainForm === true)
    .map(part => {
      if (BREAK_ONLY.test(part)) return part;
      return pronunciationLine(part, resolved) ?? markTextNodes(part, hint, resolved.interactive === true);
    })
    .join('');
  return hint ? `${plainFormMarkup(hint, resolved)}${formatted}` : formatted;
}
