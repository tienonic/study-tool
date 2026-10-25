import { describe, expect, it } from 'vitest';
import { formatRussianStudyHtml, splitRussianSyllables } from './russianText.ts';

describe('Russian study text formatting', () => {
  it('uses the pronunciation guide to align Russian and Latin syllables', () => {
    expect(splitRussianSyllables('образ', ['OB', 'raz'])).toEqual(['об', 'раз']);
    expect(splitRussianSyllables('внимательно', ['vni', 'MA', "tel'", 'no']))
      .toEqual(['вни', 'ма', 'тель', 'но']);
  });

  it('falls back to readable vowel-centered syllables without a guide', () => {
    expect(splitRussianSyllables('молоко')).toEqual(['мо', 'ло', 'ко']);
    expect(splitRussianSyllables('знать')).toEqual(['знать']);
  });

  it('colors corresponding form and pronunciation segments with the same tones', () => {
    const pronunciation = 'приве́т — pree-VYET';
    const formatted = formatRussianStudyHtml(pronunciation, pronunciation);
    expect(formatted).toContain('syllable-tone-0">при</span>');
    expect(formatted).toContain('syllable-tone-1">ве́т</span>');
    expect(formatted).toContain('syllable-tone-0">pree</span>');
    expect(formatted).toContain('syllable-tone-1">VYET</span>');
    expect(formatted).not.toContain(' — ');
  });

  it('maps both colored scripts to the matching spoken Russian syllable', () => {
    const pronunciation = 'приве́т — pree-VYET';
    const formatted = formatRussianStudyHtml(pronunciation, pronunciation, true);
    expect(formatted.match(/data-russian-syllable-audio="при"/g)).toHaveLength(2);
    expect(formatted.match(/data-russian-syllable-audio="вет"/g)).toHaveLength(2);
  });

  it('adds one unsegmented part-of-speech form left of the English definition', () => {
    const pronunciation = "позволя́ть — poz-vol-YAT'";
    const formatted = formatRussianStudyHtml(`<strong>to allow, to permit</strong><br>${pronunciation}`, pronunciation, {
      interactive: true,
      showPlainForm: true,
      partOfSpeech: 'verb',
    });
    expect(formatted).toContain('class="russian-pronunciation-plain russian-pos-verb"');
    expect(formatted).toContain("data-russian-audio=\"позволять\"");
    expect(formatted).toContain(">позволя́ть</span>");
    expect(formatted.match(/class="russian-pronunciation-plain/g)).toHaveLength(1);
    expect(formatted.indexOf('russian-pronunciation-plain')).toBeLessThan(formatted.indexOf('<strong>to allow'));
    expect(formatted.indexOf('<strong>to allow')).toBeLessThan(formatted.indexOf('russian-pronunciation-line'));
  });

  it('removes the duplicate standalone term when the plain form is rendered below the row', () => {
    const pronunciation = 'приве́т — pree-VYET';
    const formatted = formatRussianStudyHtml(`приве́т<br>${pronunciation}`, pronunciation, {
      showPlainForm: true,
      partOfSpeech: 'interjection',
    });
    expect(formatted.match(/>приве́т<\/span>/g)).toHaveLength(1);
    expect(formatted).toContain('russian-pos-interjection');
  });

  it('makes every highlighted back-side Russian word an audio target without tooltips', () => {
    const html = '<strong>thank you</strong><br>Use спасибо за + accusative.';
    const formatted = formatRussianStudyHtml(html, 'спаси́бо — spah-SEE-bah', true);
    expect(formatted).toContain('data-russian-audio="спасибо"');
    expect(formatted).toContain('data-russian-audio="за"');
    expect(formatted).toContain('data-russian-syllable-audio="спа" role="button" tabindex="0"');
    expect(formatted).toContain('data-russian-syllable-audio="за" role="button" tabindex="0"');
    expect(formatted).not.toContain('is-syllable-colored');
    expect(formatted).not.toContain('title=');
  });
});
