import { describe, expect, it } from 'vitest';
import {
  cleanAnswerLabel,
  cleanExplanation,
  cleanFlashBack,
  cleanFlashFront,
  cleanProjectStudyCopy,
  cleanQuestionPrompt,
} from './studyCopy.ts';

describe('study copy cleanup', () => {
  it('removes final-deck question preambles without changing the clue', () => {
    expect(cleanQuestionPrompt(
      'Which ABT 150 final concept fits this clue: One standard-size drink raises BAC by a predictable amount.',
    )).toBe('One standard-size drink raises BAC by a predictable amount.');
  });

  it('removes source and chapter labels from question prompts', () => {
    expect(cleanQuestionPrompt(
      'Connect eBook Ch4: what did the Sarbanes-Oxley Act primarily respond to?',
    )).toBe('What did the Sarbanes-Oxley Act primarily respond to?');
    expect(cleanQuestionPrompt(
      'MGT Ch6 slide visual drill: under FOB shipping point, who owns goods while they are in transit?',
    )).toBe('Under FOB shipping point, who owns goods while they are in transit?');
  });

  it('replaces slide-source anchor prompts with a clean image prompt', () => {
    expect(cleanQuestionPrompt(
      'Which AHI slide object matches this source anchor: Visual ID label from AHI_SLIDE_001 slide 13?',
    )).toBe('Which slide object matches this image?');
    expect(cleanQuestionPrompt(
      'Which AHI visual detail matches this manually reviewed low-text slide: AHI_SLIDE_004 slide 11 manual low-text review?',
    )).toBe('Which visual detail matches this slide?');
    expect(cleanQuestionPrompt(
      'Exam relevance: ancestor memory, reliquary function, material brilliance, and colonial interpretation bias.',
    )).toBe('Ancestor memory, reliquary function, material brilliance, and colonial interpretation bias.');
  });

  it('removes generated answer prefixes and IDs', () => {
    expect(cleanAnswerLabel('Final guide: basic accounting equation')).toBe('basic accounting equation');
    expect(cleanAnswerLabel('AHI_FINAL_PRI_001: Kota Reliquary Figure')).toBe('Kota Reliquary Figure');
    expect(cleanAnswerLabel('Source: American Alliance of Museums')).toBe('American Alliance of Museums');
    expect(cleanAnswerLabel('Kota Reliquary, Gabon - source point 1')).toBe('Kota Reliquary, Gabon');
  });

  it('keeps AHI object prompts while dropping unit and coverage metadata', () => {
    expect(cleanQuestionPrompt(
      'AHI final-priority source item: Kota Reliquary Figure. Unit: Africa. Coverage: priority. Notes: Test mbulu ngulu reliquary context.',
    )).toBe('Kota Reliquary Figure. Test mbulu ngulu reliquary context.');
  });

  it('hides source-only explanations and trims source tails', () => {
    expect(cleanExplanation('Source-backed clue from ABT_FINAL_004.')).toBeUndefined();
    expect(cleanExplanation('Source-backed clue from MGT011A_FG_001; MGT_LIVE_007; MGT_LIVE_008.')).toBeUndefined();
    expect(cleanExplanation('Source: AHI_SLIDE_001 slide 3. This is generated from extracted slide text.')).toBeUndefined();
    expect(cleanExplanation('Anchor: AHI_SLIDE_001 slide 1. Use this as a visual-ID prompt.')).toBeUndefined();
    expect(cleanExplanation('A retrieval cue worth keeping. Source: ABT_FINAL_004')).toBe('A retrieval cue worth keeping.');
  });

  it('cleans flashcards into term and definition copy', () => {
    expect(cleanFlashFront('AHI_FINAL_PRI_001: Kota Reliquary Figure')).toBe('Kota Reliquary Figure');
    expect(cleanFlashFront('Identify this slide image (AHI_SLIDE_004 slide 1)')).toBe('Identify this slide image.');
    expect(cleanFlashFront('Kota Reliquary, Gabon - source point 1')).toBe('Kota Reliquary, Gabon');
    expect(cleanFlashBack(
      '<strong>Kota Reliquary Figure</strong><br>Wood and metal reliquary figure. <strong>Source:</strong> AHI_FINAL_PRI_001',
    )).toBe('<strong>Kota Reliquary Figure</strong><br>Wood and metal reliquary figure.');
    expect(cleanFlashBack(
      'Kota Reliquary Figure. Unit: Africa. Coverage: priority. Notes: Connect the figure to ancestor reliquary practice. <strong>Terms:</strong> mbulu ngulu',
    )).toBe('Kota Reliquary Figure. Connect the figure to ancestor reliquary practice.');
    expect(cleanFlashBack(
      'Manual low-text review: Map of Italy / Grand Tour route context<br><br>Visual ID label from AHI_SLIDE_004 slide 2<br><br><strong>Source:</strong> AHI_SLIDE_004 slide 2',
    )).toBe('Map of Italy / Grand Tour route context');
  });

  it('cleans or drops glossary metadata entries', () => {
    const cleaned = cleanProjectStudyCopy({
      name: 'Glossary Test',
      sections: [{ id: 's', name: 'S', type: 'mc-quiz', questions: [{ q: 'Q?', correct: 'A', wrong: ['B', 'C', 'D'] }] }],
      glossary: [
        { term: 'Source gap: final guide', def: 'Exam relevance: source-only note' },
        { term: 'Slide source', def: 'Visual ID label from AHI_SLIDE_001 slide 1' },
        { term: 'Fibonacci sequence', def: 'F_n = F_{n-1} + F_{n-2}. Terms: 1,1,2,3,5,8,13,...' },
      ],
    });

    expect(cleaned.glossary).toEqual([
      { term: 'final guide', def: 'source-only note' },
      { term: 'Fibonacci sequence', def: 'F_n = F_{n-1} + F_{n-2}. Terms: 1,1,2,3,5,8,13,...' },
    ]);
  });

  it('repairs answer choices when source-point suffixes would create duplicates', () => {
    const cleaned = cleanProjectStudyCopy({
      name: 'Duplicate Answer Repair Test',
      sections: [{
        id: 's',
        name: 'S',
        type: 'mc-quiz',
        questions: [
          {
            q: 'Ancestor memory and reliquary function.',
            correct: 'Kota Reliquary, Gabon - source point 1',
            wrong: [
              'Kota Reliquary, Gabon - source point 2',
              'Kota Reliquary, Gabon - source point 3',
              'Nkisi Nkondi Figure, Kongo Peoples - source point 1',
            ],
          },
          { q: 'Power figure.', correct: 'Nkisi Nkondi Figure, Kongo Peoples', wrong: ['Kota Reliquary, Gabon', 'Benin Bronzes', 'Starry Night'] },
          { q: 'Royal court plaques.', correct: 'Benin Bronzes', wrong: ['Kota Reliquary, Gabon', 'Starry Night', 'Cezanne, Basket of Apples'] },
          { q: 'Swirling sky.', correct: 'Starry Night', wrong: ['Kota Reliquary, Gabon', 'Benin Bronzes', 'Cezanne, Basket of Apples'] },
        ],
      }],
    });

    const first = cleaned.sections[0].questions?.[0];
    expect(first?.correct).toBe('Kota Reliquary, Gabon');
    expect(first?.wrong).toHaveLength(3);
    expect(first?.wrong).not.toContain('Kota Reliquary, Gabon');
    expect(first?.wrong.some(choice => /source point/i.test(choice))).toBe(false);
    expect(new Set(first?.wrong.map(choice => choice.toLocaleLowerCase()))).toHaveLength(3);
  });
});
