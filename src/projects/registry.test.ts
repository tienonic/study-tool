import { describe, expect, it } from 'vitest';
import { buildProjectRegistry, parseLocalProjectBindings, selectGeneratedProject } from './registry.ts';
import type { ProjectData } from './types.ts';

function projectData(name: string): ProjectData {
  return {
    name,
    sections: [{
      id: 'section',
      name: 'Section',
      type: 'mc-quiz',
      questions: [{ q: 'Question?', correct: 'Answer', wrong: ['Wrong'] }],
    }],
  };
}

describe('selectGeneratedProject', () => {
  it('prefers the active generated deck when stale generated JSON files exist', () => {
    const stale = projectData('Stale Generated Deck');
    const active = projectData('Active Generated Deck');

    expect(selectGeneratedProject({
      './generated/stale.json': stale,
      './generated/active-project.json': active,
    })).toBe(active);
  });
});

describe('buildProjectRegistry', () => {
  it('uses the generated deck as the only registry entry in single-deck mode', async () => {
    const generated = projectData('Generated Deck');
    const registry = buildProjectRegistry(generated, true);

    expect(registry).toHaveLength(1);
    expect(registry[0].name).toBe('Generated Deck');
    expect(registry[0].slug).toBe('generated-deck');
    expect(registry[0].folder).toBe('generated');
    await expect(registry[0].loader()).resolves.toBe(generated);
  });

  it('returns no fallback deck in single-deck mode without a generated deck', () => {
    expect(buildProjectRegistry(undefined, true)).toEqual([]);
  });

  it('keeps the sanitized example deck available outside single-deck mode', async () => {
    const registry = buildProjectRegistry(undefined, false);

    expect(registry).toHaveLength(1);
    expect(registry[0].name).toBe('Example Art History Drill');
    expect(registry[0].slug).toBe('example-art-history-drill');
    expect(registry[0].folder).toBe('');
    await expect(registry[0].loader()).resolves.toMatchObject({ name: 'Example Art History Drill' });
  });

  it('does not let local generated deck files override the normal app registry', async () => {
    const registry = buildProjectRegistry(projectData('Generated Deck'), false);

    expect(registry).toHaveLength(1);
    expect(registry[0].name).toBe('Example Art History Drill');
    await expect(registry[0].loader()).resolves.toMatchObject({ name: 'Example Art History Drill' });
  });

  it('uses local project bindings as the direct normal app registry', () => {
    const registry = buildProjectRegistry(undefined, false, [
      { name: 'Local Practice Deck', file: 'local-practice.json' },
      { name: 'Local Review Deck', file: 'local-review.json' },
    ]);

    expect(registry.map(entry => entry.name)).toEqual([
      'Local Practice Deck',
      'Local Review Deck',
    ]);
    expect(registry.map(entry => entry.slug)).toEqual([
      'local-practice-deck',
      'local-review-deck',
    ]);
    expect(registry.every(entry => entry.folder === '')).toBe(true);
  });
});

describe('parseLocalProjectBindings', () => {
  it('parses semicolon-delimited local project bindings', () => {
    expect(parseLocalProjectBindings('Local Practice|local-practice.json;Local Review|local-review.json')).toEqual([
      { name: 'Local Practice', file: 'local-practice.json' },
      { name: 'Local Review', file: 'local-review.json' },
    ]);
  });

  it('drops invalid local project file names', () => {
    expect(parseLocalProjectBindings('Good Deck|good.json;Bad Path|../bad.json;Bad Type|bad.txt')).toEqual([
      { name: 'Good Deck', file: 'good.json' },
    ]);
  });
});
