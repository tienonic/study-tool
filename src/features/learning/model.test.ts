import { describe, expect, it } from 'vitest';
import { loadProject } from '../../projects/loader.ts';
import { parseLearningConfig, piEvidenceLabel, projectTopics, safeSourceLink, sectionCoverage, topicLayout, topicSections, workbookItems, workspaceProject } from './model.ts';

const project = loadProject({ name: 'Example science', sections: [
  { id: 'ratios', name: 'Ratios', type: 'mc-quiz', questions: [{ id: 'ratio', q: 'What is a ratio?', correct: 'A comparison.', wrong: ['A unit.'], image: '/figures/ratio.png', imageName: 'Search metadata' }], flashcards: [{ id: 'unit', front: 'Unit', back: 'A standard measure.', source_refs: ['https://example.org/units'] }] },
  { id: 'case', name: 'Case', type: 'passage-quiz', scenarios: [{ passage: 'An observation.', source: 'https://example.org/case', questions: [{ q: 'What follows?', correct: 'A claim.', wrong: ['An assumption.'] }] }] },
  { id: 'math', name: 'Math', type: 'math-gen', generators: ['percent', 'average'] },
] });
const config = () => parseLearningConfig({ topics: [
  { id: 'arithmetic', title: 'Arithmetic', section_ids: ['math'], requires: [] },
  { id: 'ratios', title: 'Ratios', section_ids: ['ratios'], requires: ['arithmetic'] },
] });

describe('topic workbook', () => {
  it('preserves question, passage, figure, answer, and source without mistaking search metadata for a figure', () => {
    const items = workbookItems(project.sections);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ id: 'ratios:question:ratio', question: 'What is a ratio?', answer: 'A comparison.', image: '/figures/ratio.png' });
    expect(items[1]).toMatchObject({ kind: 'flashcard', sources: ['https://example.org/units'] });
    expect(items[2]).toMatchObject({ passage: 'An observation.', sources: ['https://example.org/case'] });
  });
  it('separates prepared material from learning evidence', () => {
    expect(sectionCoverage(project.sections)).toEqual({ questions: 2, flashcards: 1, generators: ['percent', 'average'] });
    expect(projectTopics(project).every(topic => topic.requires.length === 0)).toBe(true);
  });
  it('keeps a scoped topic without matching deck content empty', () => {
    expect(topicSections(project, undefined, true)).toEqual([]);
    expect(topicSections(project, { id: 'physics', title: 'Physics', section_ids: [], requires: [] }, true)).toEqual([]);
    expect(topicSections(project, config().topics[0], true).map(section => section.id)).toEqual(['math']);
  });
  it('requires an exact deck binding before attaching sidecar content', () => {
    expect(workspaceProject(project, config(), true)).toBeNull();
    expect(workspaceProject(project, { ...config(), project_slug: 'other-project' }, true)).toBeNull();
    expect(workspaceProject(project, { ...config(), project_slug: project.slug }, true)).toBe(project);
  });
  it('shows only declared dependencies and places each prerequisite before its dependent', () => {
    const nodes = topicLayout(config().topics);
    expect(nodes.find(node => node.id === 'arithmetic')!.x).toBeLessThan(nodes.find(node => node.id === 'ratios')!.x);
    expect(nodes.find(node => node.id === 'ratios')!.requires).toEqual(['arithmetic']);
  });
  it('rejects missing prerequisites and cycles rather than drawing invented relationships', () => {
    expect(() => parseLearningConfig({ topics: [{ id: 'a', title: 'A', requires: ['missing'] }] })).toThrow(/missing/);
    expect(() => parseLearningConfig({ topics: [{ id: 'a', title: 'A', requires: ['b'] }, { id: 'b', title: 'B', requires: ['a'] }] })).toThrow(/cycle/);
  });
  it('keeps recorded, recall, coached, and independent Pi evidence distinct', () => {
    for (const evidence of ['recorded', 'recall', 'coached', 'independent']) {
      const parsed = parseLearningConfig({ ...config(), adaptiveRoute: { version: 1, graph: { nodes: [{ id: 'ratios', title: 'Ratios', scope: 'assessed', evidence, score: evidence === 'independent' ? 70 : null }], edges: [{ from: 'arithmetic', to: 'ratios', kind: 'prerequisite', observedBlocker: false }] } } });
      expect(parsed.adaptiveRoute!.graph.nodes[0].evidence).toBe(evidence);
      const label = piEvidenceLabel(parsed.adaptiveRoute!.graph.nodes[0]);
      if (evidence === 'recorded') expect(label).toBe('Recorded · grade unavailable');
      if (evidence === 'recall') expect(label).toBe('Recall evidence');
      if (evidence === 'coached') expect(label).toBe('Coached work');
      if (evidence === 'independent') expect(label).toBe('Independent · 70%');
    }
  });
  it('rejects executable links while keeping HTTP source links available', () => {
    expect(safeSourceLink('javascript:alert(1)')).toBeNull();
    expect(safeSourceLink('file:///private/notes')).toBeNull();
    expect(safeSourceLink('https://example.org/source')).toBe('https://example.org/source');
  });
});
