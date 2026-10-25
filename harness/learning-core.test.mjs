import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMode, parseCardPolicy, parseLearningArgs, assertRecallCardQuality, retirementFor, isCardRetired, parsePreparedCards } from './learning-core.mjs';

test('learning modes and card choices stay independent', () => {
  assert.equal(parseMode('1'), 'tree');
  assert.equal(parseMode('2'), 'exam');
  assert.equal(parseMode('3'), 'fundamentals');
  assert.equal(parseCardPolicy('off'), 'off');
  assert.equal(parseCardPolicy('on'), 'needed');
  assert.deepEqual(parseLearningArgs('example --mode exam --cards off'), {
    action: 'practice', topic: 'example', concept: undefined, mode: 'exam', cards: 'off',
  });
  assert.throws(() => parseMode('unknown'));
});

test('card preparation rejects oversized or unsupported recall targets', () => {
  assert.doesNotThrow(() => assertRecallCardQuality('What is speed?', 'Distance traveled per unit time.'));
  assert.throws(() => assertRecallCardQuality('word '.repeat(30), 'Answer.'));
  const snapshot = { attempts: [{ id: 'a1', conceptId: 'speed' }], sources: ['example.md'], inspectionRevision: 'r1' };
  const card = { action: 'create', conceptId: 'speed', objectiveId: 'speed-definition', needReason: 'Definition gap', attemptId: 'a1', source: 'example.md', front: 'What is speed?', back: 'Distance traveled per unit time.' };
  assert.equal(parsePreparedCards(JSON.stringify({ cards: [card] }), snapshot).length, 1);
  assert.throws(() => parsePreparedCards(JSON.stringify({ cards: [{ ...card, source: 'unapproved.md' }] }), snapshot));
});

test('retirement needs repeated independent evidence and reverses after a later gap', () => {
  const card = { sectionId: 'motion', rawCardId: 'speed', front: 'What is speed?', back: 'Distance traveled per unit time.', conceptIds: ['speed'] };
  const attempts = ['2030-01-01', '2030-01-04', '2030-01-09'].map((date, index) => ({
    id: `a${index}`, conceptId: 'speed', at: `${date}T12:00:00Z`, assessment: 'correct',
    assistance: 'independent', independentlyGraded: true, prompt: `Distinct practice question ${index}`,
  }));
  const request = { reason: 'Repeated independent success', attemptIds: attempts.map(a => a.id) };
  assert.equal(retirementFor(card, request, attempts.slice(0, 1), new Date('2030-01-10')), undefined);
  const retirement = retirementFor(card, request, attempts, new Date('2030-01-10'));
  assert.ok(retirement);
  assert.equal(isCardRetired(card, [retirement], [...attempts, {
    ...attempts[0], id: 'later-gap', at: '2030-01-11T12:00:00Z', assessment: 'incorrect',
  }]), false);
});
