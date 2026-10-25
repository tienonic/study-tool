import { describe, expect, test } from 'vitest';
import {
  coreFeatureScenarios,
  featureAxes,
  invariantDescriptions,
  isSupportedScenario,
  missingRequiredPairs,
  requiredPairs,
  scenarioValue,
  type FeatureAxis,
} from './featureMatrix.ts';

describe('quiz feature matrix', () => {
  test('scenario ids are unique and supported', () => {
    const ids = new Set<string>();

    for (const scenario of coreFeatureScenarios) {
      expect(ids.has(scenario.id), `Duplicate scenario id: ${scenario.id}`).toBe(false);
      ids.add(scenario.id);
      expect(isSupportedScenario(scenario), `Unsupported scenario: ${scenario.id}`).toBe(true);
    }
  });

  test('every declared axis value has at least one scenario', () => {
    for (const axis of Object.keys(featureAxes) as FeatureAxis[]) {
      for (const value of featureAxes[axis]) {
        const covered = coreFeatureScenarios.some(scenario => scenarioValue(scenario, axis) === value);
        expect(covered, `Missing scenario for ${axis}=${value}`).toBe(true);
      }
    }
  });

  test('required interaction pairs are covered', () => {
    expect(missingRequiredPairs()).toEqual([]);
  });

  test('required interaction pairs explain the bug class they cover', () => {
    for (const pair of requiredPairs) {
      expect(pair.reason.trim().length, `${pair.axes.join('+')} is missing a reason`).toBeGreaterThan(15);
    }
  });

  test('scenario invariants are known and non-empty', () => {
    for (const scenario of coreFeatureScenarios) {
      expect(scenario.mustHold.length, `${scenario.id} has no invariants`).toBeGreaterThan(0);
      for (const invariant of scenario.mustHold) {
        expect(invariantDescriptions[invariant], `${scenario.id} references unknown invariant ${invariant}`).toBeTruthy();
      }
    }
  });

  test('unsupported combinations stay explicit', () => {
    const flashPassage = {
      ...coreFeatureScenarios[0],
      id: 'invalid-flash-passage',
      studyMode: 'flash' as const,
      contentShape: 'passage' as const,
    };
    const flashRated = {
      ...coreFeatureScenarios[0],
      id: 'invalid-flash-rated',
      studyMode: 'flash' as const,
      progressState: 'rated' as const,
    };
    const cramBuried = {
      ...coreFeatureScenarios[0],
      id: 'invalid-cram-buried',
      scheduleMode: 'cram' as const,
      sessionSupply: 'buried' as const,
    };

    expect(isSupportedScenario(flashPassage)).toBe(false);
    expect(isSupportedScenario(flashRated)).toBe(false);
    expect(isSupportedScenario(cramBuried)).toBe(false);
  });
});
