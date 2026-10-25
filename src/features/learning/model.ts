import type { Project, Section } from '../../projects/types.ts';
import { CATEGORY_LABELS } from '../../data/math.ts';

export type LearningMode = 'exam' | 'depth';
export type StudyView = 'drill' | 'workbook' | 'map';
export interface LearningTopic {
  id: string;
  title: string;
  section_ids: string[];
  requires: string[];
  source_refs?: string[];
  reference?: string;
  prompts?: string[];
  sources?: { label: string; url: string; locator?: string }[];
}
export interface LearningConfig {
  mode?: LearningMode;
  goal?: string;
  topic_id?: string;
  project_slug?: string;
  topics: LearningTopic[];
  adaptiveRoute?: {
    version: 1;
    graph: {
      nodes: { id: string; title: string; scope: 'assessed' | 'prerequisite'; evidence: 'unassessed' | 'recorded' | 'coached' | 'recall' | 'independent'; score: number | null; recallScore?: number | null; recallQuestions?: number; attemptCount?: number; independentQuestions?: number; assistedAttempts?: number }[];
      edges: { from: string; to: string; kind: 'prerequisite'; observedBlocker: boolean }[];
    };
  };
}
export interface WorkbookItem {
  id: string;
  sectionId: string;
  kind: 'question' | 'flashcard';
  question: string;
  answer: string;
  explanation?: string;
  passage?: string;
  image?: string;
  answerImage?: string;
  sources: string[];
}

export function workbookItems(sections: Section[]): WorkbookItem[] {
  return sections.flatMap(section => [
    ...(section.questions ?? []).map((question, index): WorkbookItem => ({
      id: `${section.id}:question:${question.id ?? index}`, sectionId: section.id, kind: 'question',
      question: question.q, answer: question.correct, explanation: question.explanation,
      image: question.image, sources: [],
    })),
    ...(section.scenarios ?? []).flatMap((scenario, scenarioIndex) => scenario.questions.map((question, index): WorkbookItem => ({
      id: `${section.id}:passage:${question.id ?? `${scenarioIndex}:${index}`}`, sectionId: section.id, kind: 'question',
      question: question.q, answer: question.correct, explanation: question.explanation,
      passage: scenario.passage, image: question.image ?? scenario.image,
      sources: scenario.source ? [scenario.source] : [],
    }))),
    ...(section.flashcards ?? []).map((card, index): WorkbookItem => ({
      id: `${section.id}:flashcard:${card.id ?? index}`, sectionId: section.id, kind: 'flashcard',
      question: card.front, answer: card.back, image: card.frontImage, answerImage: card.backImage,
      sources: card.source_refs ?? [],
    })),
  ]);
}

export function safeSourceLink(source: string): string | null {
  try {
    const url = new URL(source);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function parseLearningConfig(value: unknown): LearningConfig {
  if (!value || typeof value !== 'object') throw new Error('Learning context is missing. Refresh the topic from Pi.');
  const raw = value as Record<string, unknown>;
  if (raw.mode !== undefined && raw.mode !== 'exam' && raw.mode !== 'depth') throw new Error('The learning mode must be exam or depth.');
  if (!Array.isArray(raw.topics)) throw new Error('Learning context needs a topic list.');
  const topics: LearningTopic[] = raw.topics.map(value => {
    if (!value || typeof value !== 'object') throw new Error('A learning topic is invalid.');
    const topic = value as Record<string, unknown>;
    const strings = (field: string): string[] => {
      const list = topic[field] ?? [];
      if (!Array.isArray(list) || list.some(item => typeof item !== 'string')) throw new Error(`Topic ${field} must contain text values.`);
      return list as string[];
    };
    if (typeof topic.id !== 'string' || !topic.id || typeof topic.title !== 'string') throw new Error('Each topic needs an ID and title.');
    return {
      id: topic.id, title: topic.title, section_ids: strings('section_ids'), requires: strings('requires'),
      source_refs: strings('source_refs'), prompts: strings('prompts'),
      reference: typeof topic.reference === 'string' ? topic.reference : undefined,
      sources: Array.isArray(topic.sources) ? topic.sources.filter((source): source is { label: string; url: string; locator?: string } => !!source && typeof source === 'object' && typeof source.label === 'string' && typeof source.url === 'string') : [],
    };
  });
  const ids = new Set(topics.map(topic => topic.id));
  if (ids.size !== topics.length) throw new Error('Learning topic IDs must be unique.');
  for (const topic of topics) {
    if (topic.requires.some(id => !ids.has(id))) throw new Error(`A prerequisite for ${topic.title} is missing from the topic list.`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('The topic prerequisites contain a cycle.');
    if (visited.has(id)) return;
    visiting.add(id);
    topics.find(topic => topic.id === id)?.requires.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  topics.forEach(topic => visit(topic.id));
  const config: LearningConfig = {
    mode: raw.mode as LearningMode | undefined,
    goal: typeof raw.goal === 'string' ? raw.goal : undefined,
    topic_id: typeof raw.topic_id === 'string' ? raw.topic_id : undefined,
    project_slug: typeof raw.project_slug === 'string' ? raw.project_slug : undefined,
    topics,
  };
  if (raw.adaptiveRoute && typeof raw.adaptiveRoute === 'object') {
    const route = raw.adaptiveRoute as Record<string, unknown>;
    const graph = route.graph as Record<string, unknown> | undefined;
    if (route.version !== 1 || !graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('The learning evidence format is unsupported.');
    const nodes = graph.nodes.map(value => {
      const node = value as Record<string, unknown>;
      if (!node || typeof node.id !== 'string' || !ids.has(node.id) || typeof node.title !== 'string'
        || !['assessed', 'prerequisite'].includes(String(node.scope))
        || !['unassessed', 'recorded', 'coached', 'recall', 'independent'].includes(String(node.evidence))
        || !(node.score === null || typeof node.score === 'number' && Number.isFinite(node.score))) throw new Error('A learning evidence node is invalid.');
      return node as unknown as NonNullable<LearningConfig['adaptiveRoute']>['graph']['nodes'][number];
    });
    const edges = graph.edges.map(value => {
      const edge = value as Record<string, unknown>;
      if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string' || !ids.has(edge.from) || !ids.has(edge.to)
        || edge.kind !== 'prerequisite' || typeof edge.observedBlocker !== 'boolean'
        || !topics.find(topic => topic.id === edge.to)?.requires.includes(edge.from)) throw new Error('A learning prerequisite edge is invalid.');
      return edge as unknown as NonNullable<LearningConfig['adaptiveRoute']>['graph']['edges'][number];
    });
    config.adaptiveRoute = { version: 1, graph: { nodes, edges } };
  }
  return config;
}

export function projectTopics(project: Project | null): LearningTopic[] {
  return project?.sections.map(section => ({ id: section.id, title: section.name, section_ids: [section.id], requires: [] })) ?? [];
}

export function topicSections(project: Project | null, topic: LearningTopic | undefined, scoped: boolean): Section[] {
  if (!project) return [];
  if (!topic) return scoped ? [] : project.sections;
  return project.sections.filter(section => topic.section_ids.includes(section.id));
}

export function workspaceProject(project: Project | null, config: LearningConfig | null, sidecar: boolean): Project | null {
  return sidecar && (!config?.project_slug || config.project_slug !== project?.slug) ? null : project;
}

export function piEvidenceLabel(node: NonNullable<LearningConfig['adaptiveRoute']>['graph']['nodes'][number] | undefined): string {
  if (!node) return 'Unassessed';
  if (node.evidence === 'independent') return node.score === null ? 'Independent evidence' : `Independent · ${node.score}%`;
  if (node.evidence === 'recall') return node.recallScore === null || node.recallScore === undefined ? 'Recall evidence' : `Recall · ${node.recallScore}%`;
  if (node.evidence === 'coached') return 'Coached work';
  if (node.evidence === 'recorded') return 'Recorded · grade unavailable';
  return 'Unassessed';
}

export function sectionCoverage(sections: Section[]) {
  return {
    questions: sections.reduce((sum, section) => sum + (section.questions?.length ?? 0) + (section.scenarios ?? []).reduce((count, scenario) => count + scenario.questions.length, 0), 0),
    flashcards: sections.reduce((sum, section) => sum + (section.flashcards?.length ?? 0), 0),
    generators: [...new Set(sections.flatMap(section => section.type === 'math-gen' ? section.generators ?? Object.keys(CATEGORY_LABELS) : []))],
  };
}

export function topicLayout(topics: LearningTopic[]) {
  const levels = new Map<string, number>();
  const depth = (id: string): number => {
    if (levels.has(id)) return levels.get(id)!;
    const requires = topics.find(topic => topic.id === id)?.requires ?? [];
    const level = requires.length ? 1 + Math.max(...requires.map(depth)) : 0;
    levels.set(id, level);
    return level;
  };
  topics.forEach(topic => depth(topic.id));
  const rows = new Map<number, number>();
  return topics.map(topic => {
    const column = levels.get(topic.id)!;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return { ...topic, x: column * 280 + 16, y: row * 106 + 20 };
  });
}
