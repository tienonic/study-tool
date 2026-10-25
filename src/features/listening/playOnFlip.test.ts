import { describe, expect, it } from 'vitest';
import { createManualPronunciationGate, shouldPlayAfterFlashFlip } from './playOnFlip.ts';

describe('language audio after flashcard flips', () => {
  it('defaults on for listening-enabled language decks in either flip direction', () => {
    const config = { enabled: true, locale: 'ru-RU' };
    expect(shouldPlayAfterFlashFlip(config, false, true)).toBe(true);
    expect(shouldPlayAfterFlashFlip(config, true, false)).toBe(true);
  });

  it('stays off outside language mode or when explicitly disabled', () => {
    expect(shouldPlayAfterFlashFlip({ enabled: false }, false, true)).toBe(false);
    expect(shouldPlayAfterFlashFlip({ enabled: true, play_on_flip: false }, false, true)).toBe(false);
    expect(shouldPlayAfterFlashFlip({ enabled: true }, false, false)).toBe(false);
  });

  it('suppresses exactly the next flip after manual playback on that card', () => {
    const gate = createManualPronunciationGate();
    gate.mark('card-a');
    expect(gate.consume('card-a')).toBe(true);
    expect(gate.consume('card-a')).toBe(false);
    gate.mark('card-a');
    expect(gate.consume('card-b')).toBe(false);
  });
});
