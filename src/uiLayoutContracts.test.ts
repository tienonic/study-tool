import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const quizCss = readFileSync(resolve(process.cwd(), 'src/features/quiz/quiz.css'), 'utf8');
const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const settingsCss = readFileSync(resolve(process.cwd(), 'src/features/settings/settings.css'), 'utf8');
const anchoredDialog = readFileSync(resolve(process.cwd(), 'src/components/overlays/AnchoredDialog.tsx'), 'utf8');
const flashcardArea = readFileSync(resolve(process.cwd(), 'src/features/quiz/FlashcardArea.tsx'), 'utf8');
const keyboardHook = readFileSync(resolve(process.cwd(), 'src/core/hooks/useKeyboard.ts'), 'utf8');

function firstRuleBody(css: string, selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing CSS selector: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`Malformed CSS rule: ${selector}`);
  return css.slice(open + 1, close);
}

describe('study UI layout contracts', () => {
  it('keeps variable-length MCQ feedback in normal flow', () => {
    const body = firstRuleBody(quizCss, '.option-feedback {');
    expect(body).toMatch(/position:\s*static\s*;/);
    expect(body).not.toMatch(/position:\s*absolute\s*;/);
    expect(body).not.toMatch(/min-height:\s*100%\s*;/);
  });

  it('clamps portalled study panels inside a phone viewport', () => {
    const panel = firstRuleBody(settingsCss, '.anchored-dialog-panel {');
    expect(panel).toMatch(/position:\s*fixed\s*;/);
    expect(settingsCss).toMatch(/@media\s*\(max-width:\s*600px\)/);
    expect(settingsCss).toMatch(/\.settings-dropdown,\s*\.keybinds-modal\s*\{[^}]*width:\s*calc\(100vw\s*-\s*16px\)\s*;/s);
    expect(settingsCss).toMatch(/\.settings-dropdown\s*\{[^}]*overflow-y:\s*auto\s*;/s);
    expect(anchoredDialog).toMatch(/window\.visualViewport/);
    expect(anchoredDialog).toMatch(/viewport\.width\s*-\s*16/);
    expect(anchoredDialog).toMatch(/viewport\.height\s*-\s*16/);
  });

  it('keeps zen-mode flashcards at their configured width', () => {
    const zenContent = firstRuleBody(indexCss, '.zen main > div {');
    const flashcard = firstRuleBody(quizCss, '.flashcard-container {');
    const front = firstRuleBody(quizCss, '.flashcard-front {');
    const back = firstRuleBody(quizCss, '.flashcard-back {');
    expect(zenContent).toMatch(/width:\s*100%\s*;/);
    expect(zenContent).toMatch(/min-width:\s*0\s*;/);
    expect(flashcard).toMatch(/max-width:\s*420px\s*;/);
    expect(flashcard).toMatch(/width:\s*min\(100%,\s*420px\)\s*;/);
    expect(front).toMatch(/font-size:\s*1\.2rem\s*;/);
    expect(back).toMatch(/font-size:\s*1rem\s*;/);
  });

  it('uses an accessible transparent speaker instead of a pronunciation text button', () => {
    const speaker = firstRuleBody(quizCss, '.pronunciation-icon {');
    expect(speaker).toMatch(/position:\s*absolute\s*;/);
    expect(speaker).toMatch(/top:\s*2px\s*;/);
    expect(speaker).toMatch(/right:\s*2px\s*;/);
    expect(speaker).toMatch(/background:\s*transparent\s*;/);
    expect(speaker).toMatch(/opacity:\s*0\s*;/);
    expect(quizCss).toMatch(/\.pronunciation-icon:hover,[\s\S]*?opacity:\s*1\s*;/);
    expect(flashcardArea).toMatch(/class=\{`pronunciation-icon /);
    expect(flashcardArea).toMatch(/aria-label=\{pronunciationStatusLabel\(\)\}/);
    expect(flashcardArea).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(flashcardArea).not.toContain('class="action-sm pronunciation-btn"');
    expect(flashcardArea).not.toContain('Playing pronunciation…');
    expect(keyboardHook).toContain('session.playPronunciation().catch(() => {});');
    expect(keyboardHook).not.toContain("document.querySelector('.pronunciation-icon')");
  });

  it('loads and scopes a readable Cyrillic face for Russian decks', () => {
    const russianCard = firstRuleBody(quizCss, '.flashcard.russian-deck {');
    const russianFront = firstRuleBody(quizCss, '.flashcard.russian-deck .flashcard-front {');
    const russianBack = firstRuleBody(quizCss, '.flashcard.russian-deck .flashcard-back {');
    expect(indexCss).toContain('@import "@fontsource/inter/cyrillic-400.css";');
    expect(indexCss).toContain('@import "@fontsource/inter/cyrillic-600.css";');
    expect(indexCss).toContain('@import "@fontsource/inter/cyrillic-700.css";');
    expect(flashcardArea).toMatch(/locale\?\.toLowerCase\(\)\.startsWith\('ru'\)/);
    expect(flashcardArea).toMatch(/isRussianDeck\(\) \? ' russian-deck' : ''/);
    expect(russianCard).toMatch(/font-family:\s*'Inter'/);
    expect(russianCard).toMatch(/text-rendering:\s*optimizeLegibility\s*;/);
    expect(russianFront).toMatch(/font-size:\s*1\.25rem\s*;/);
    expect(russianFront).toMatch(/letter-spacing:\s*0\.01em\s*;/);
    expect(russianBack).toMatch(/font-size:\s*1\.05rem\s*;/);
    expect(russianBack).toMatch(/line-height:\s*1\.6\s*;/);
  });

  it('reveals back-side syllable colors only after activating a Russian word', () => {
    const normalBack = firstRuleBody(quizCss, '.flashcard.russian-deck .flashcard-back .russian-word .russian-syllable {');
    expect(normalBack).toMatch(/background:\s*transparent\s*;/);
    expect(normalBack).toMatch(/color:\s*inherit\s*;/);
    expect(quizCss).toContain('.flashcard.russian-deck .flashcard-back .russian-word.is-syllable-colored .russian-syllable {');
    expect(flashcardArea).toContain("closest<HTMLElement>('.russian-word')?.classList.add('is-syllable-colored')");
    expect(flashcardArea).toContain("'[data-russian-syllable-audio], [data-russian-audio]'");
    expect(firstRuleBody(quizCss, '.russian-pronunciation-form {')).toMatch(/order:\s*1\s*;/);
    expect(firstRuleBody(quizCss, '.russian-pronunciation-guide {')).toMatch(/order:\s*2\s*;/);
    expect(quizCss).toContain('.russian-pronunciation-plain {');
    expect(flashcardArea).toContain('readableHtml(title(), russianBackOptions(true))');
    expect(flashcardArea).toContain('russianBackOptions(!plainFormInTitle())');
  });
});
