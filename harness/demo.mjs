import assert from 'node:assert/strict';
import { buildAdaptiveLearningRoute } from './learning-workspace.mjs';

const topic = {
  id: 'motion-exam',
  title: 'Motion exam',
  root: '.',
  mapSource: 'scope.md',
  concepts: [
    { id: 'algebra', title: 'Algebra', source: 'algebra.md', dependsOn: [] },
    { id: 'motion', title: 'Motion', source: 'motion.md', dependsOn: ['algebra'] },
  ],
  examBlueprint: {
    version: 1,
    scopeSource: 'scope.md',
    scopeConfirmed: true,
    gradingAssumptions: ['Original points.'],
    domains: [{ id: 'motion', title: 'Motion', requiredConceptIds: ['motion'] }],
    weighting: { kind: 'fixed', weights: { motion: 1 } },
  },
};

const route = buildAdaptiveLearningRoute(topic, [], 'exam', Date.parse('2026-10-23T18:00:00Z'));
assert.equal(route.next.conceptId, 'motion');
assert.equal(route.goal.targetPercent, 80);
assert.deepEqual(route.scope.assessedConceptIds, ['motion']);
assert.deepEqual(route.scope.prerequisiteOnlyIds, ['algebra']);
assert.ok(route.graph.nodes.every(node => node.evidence === 'unassessed' && node.score === null));
const deeper = buildAdaptiveLearningRoute(topic, [], 'fundamentals', Date.parse('2026-10-23T18:00:00Z'));
assert.deepEqual(deeper.scope.assessedConceptIds, ['algebra', 'motion']);
console.log(JSON.stringify({ status: 'passed', nextExamConcept: route.next.conceptId,
  targetPercent: route.goal.targetPercent, evidence: 'unassessed', deeperScope: deeper.scope.assessedConceptIds }));
