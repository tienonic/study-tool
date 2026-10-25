export const featureAxes = {
  studyMode: ['mcq', 'flash'],
  scheduleMode: ['normal', 'cram'],
  deckScope: ['single', 'merged'],
  contentShape: ['text', 'image', 'passage', 'artId'],
  progressState: ['answering', 'revealed', 'rated', 'history', 'done'],
  inputPath: ['mouse', 'keyboard'],
  activityPanel: ['graphOn', 'graphOff', 'optionsOpen'],
  sessionSupply: ['dueOnly', 'newOnly', 'mixed', 'empty', 'buried'],
} as const;

export type FeatureAxis = keyof typeof featureAxes;
export type FeatureAxisValue<K extends FeatureAxis> = (typeof featureAxes)[K][number];

export type StudyMode = FeatureAxisValue<'studyMode'>;
export type ScheduleMode = FeatureAxisValue<'scheduleMode'>;
export type DeckScope = FeatureAxisValue<'deckScope'>;
export type ContentShape = FeatureAxisValue<'contentShape'>;
export type ProgressState = FeatureAxisValue<'progressState'>;
export type InputPath = FeatureAxisValue<'inputPath'>;
export type ActivityPanel = FeatureAxisValue<'activityPanel'>;
export type SessionSupply = FeatureAxisValue<'sessionSupply'>;

export interface FeatureScenario {
  id: string;
  studyMode: StudyMode;
  scheduleMode: ScheduleMode;
  deckScope: DeckScope;
  contentShape: ContentShape;
  progressState: ProgressState;
  inputPath: InputPath;
  activityPanel: ActivityPanel;
  sessionSupply: SessionSupply;
  risk: 'baseline' | 'interaction' | 'regression';
  mustHold: InvariantId[];
}

export type InvariantId =
  | 'activeCardResolves'
  | 'historyIsReadOnly'
  | 'activityPanelLayoutOnly'
  | 'doneRecovery'
  | 'cramHardRemembered'
  | 'artIdStyleExplicit'
  | 'startupFallback';

export const invariantDescriptions: Record<InvariantId, string> = {
  activeCardResolves: 'Active answering/revealed/rated/history cards resolve inside the current deck scope.',
  historyIsReadOnly: 'History navigation restores UI state without rating, reviewing, or adding activity.',
  activityPanelLayoutOnly: 'Graph/options visibility cannot mutate review data, due counts, timers, or history.',
  doneRecovery: 'A stale done state can recover through override pick after adding/studying more cards.',
  cramHardRemembered: 'In cram mode, Again is the only rating that increments misses; Hard stays remembered.',
  artIdStyleExplicit: 'Art-history image IDs include style, movement, or culture when source material provides it.',
  startupFallback: 'Startup prefers valid recent/local projects and falls back cleanly when unavailable.',
};

export interface RequiredPair {
  axes: readonly [FeatureAxis, FeatureAxis];
  values: readonly [string, string];
  reason: string;
}

export function isSupportedScenario(scenario: FeatureScenario): boolean {
  if (scenario.studyMode === 'flash' && scenario.contentShape === 'passage') return false;
  if (scenario.studyMode === 'flash' && scenario.progressState === 'rated') return false;
  if (scenario.scheduleMode === 'cram' && scenario.sessionSupply === 'buried') return false;
  return true;
}

export function scenarioValue<K extends FeatureAxis>(scenario: FeatureScenario, axis: K): FeatureAxisValue<K> {
  return scenario[axis] as FeatureAxisValue<K>;
}

export function hasRequiredPair(scenarios: readonly FeatureScenario[], pair: RequiredPair): boolean {
  const [leftAxis, rightAxis] = pair.axes;
  const [leftValue, rightValue] = pair.values;
  return scenarios.some(scenario =>
    scenarioValue(scenario, leftAxis) === leftValue &&
    scenarioValue(scenario, rightAxis) === rightValue
  );
}

export function missingRequiredPairs(
  scenarios: readonly FeatureScenario[] = coreFeatureScenarios,
  pairs: readonly RequiredPair[] = requiredPairs,
): RequiredPair[] {
  return pairs.filter(pair => !hasRequiredPair(scenarios, pair));
}

export const requiredPairs: RequiredPair[] = [
  { axes: ['studyMode', 'scheduleMode'], values: ['flash', 'cram'], reason: 'Flash cram uses a distinct rating and picker path.' },
  { axes: ['studyMode', 'scheduleMode'], values: ['mcq', 'cram'], reason: 'MCQ cram has separate weak-first behavior.' },
  { axes: ['deckScope', 'progressState'], values: ['merged', 'history'], reason: 'History restore must resolve cards across sections.' },
  { axes: ['activityPanel', 'progressState'], values: ['graphOff', 'history'], reason: 'Graph visibility must stay layout-only during history review.' },
  { axes: ['activityPanel', 'contentShape'], values: ['optionsOpen', 'passage'], reason: 'Options UI must not crowd passage review.' },
  { axes: ['activityPanel', 'progressState'], values: ['graphOff', 'done'], reason: 'Hidden graph still needs done/add-more affordances.' },
  { axes: ['contentShape', 'studyMode'], values: ['artId', 'flash'], reason: 'Flash image IDs need title/style handling.' },
  { axes: ['contentShape', 'studyMode'], values: ['artId', 'mcq'], reason: 'MCQ image IDs need balanced answers and style feedback.' },
  { axes: ['sessionSupply', 'progressState'], values: ['newOnly', 'done'], reason: 'Add all must recover from stale done when new cards remain.' },
  { axes: ['inputPath', 'progressState'], values: ['keyboard', 'history'], reason: 'A/D and arrow keys must not rate history cards.' },
  { axes: ['contentShape', 'progressState'], values: ['image', 'revealed'], reason: 'Image-heavy revealed cards drive the largest layout changes.' },
  { axes: ['activityPanel', 'scheduleMode'], values: ['graphOff', 'cram'], reason: 'Graph hiding must not perturb cram scheduling.' },
];

export const coreFeatureScenarios: FeatureScenario[] = [
  {
    id: 'mcq-normal-single-answering',
    studyMode: 'mcq',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'text',
    progressState: 'answering',
    inputPath: 'mouse',
    activityPanel: 'graphOn',
    sessionSupply: 'mixed',
    risk: 'baseline',
    mustHold: ['activeCardResolves'],
  },
  {
    id: 'mcq-normal-keyboard-rated',
    studyMode: 'mcq',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'text',
    progressState: 'rated',
    inputPath: 'keyboard',
    activityPanel: 'graphOn',
    sessionSupply: 'dueOnly',
    risk: 'interaction',
    mustHold: ['activeCardResolves'],
  },
  {
    id: 'mcq-merged-done-add-all-new',
    studyMode: 'mcq',
    scheduleMode: 'normal',
    deckScope: 'merged',
    contentShape: 'text',
    progressState: 'done',
    inputPath: 'mouse',
    activityPanel: 'graphOn',
    sessionSupply: 'newOnly',
    risk: 'regression',
    mustHold: ['doneRecovery'],
  },
  {
    id: 'mcq-cram-keyboard',
    studyMode: 'mcq',
    scheduleMode: 'cram',
    deckScope: 'single',
    contentShape: 'text',
    progressState: 'answering',
    inputPath: 'keyboard',
    activityPanel: 'graphOn',
    sessionSupply: 'mixed',
    risk: 'regression',
    mustHold: ['activeCardResolves', 'cramHardRemembered'],
  },
  {
    id: 'mcq-cram-merged-history-graph-off',
    studyMode: 'mcq',
    scheduleMode: 'cram',
    deckScope: 'merged',
    contentShape: 'text',
    progressState: 'history',
    inputPath: 'keyboard',
    activityPanel: 'graphOff',
    sessionSupply: 'mixed',
    risk: 'interaction',
    mustHold: ['activeCardResolves', 'historyIsReadOnly', 'activityPanelLayoutOnly', 'cramHardRemembered'],
  },
  {
    id: 'mcq-passage-options-open',
    studyMode: 'mcq',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'passage',
    progressState: 'answering',
    inputPath: 'mouse',
    activityPanel: 'optionsOpen',
    sessionSupply: 'dueOnly',
    risk: 'interaction',
    mustHold: ['activeCardResolves', 'activityPanelLayoutOnly'],
  },
  {
    id: 'mcq-merged-image-history',
    studyMode: 'mcq',
    scheduleMode: 'normal',
    deckScope: 'merged',
    contentShape: 'image',
    progressState: 'history',
    inputPath: 'keyboard',
    activityPanel: 'graphOn',
    sessionSupply: 'dueOnly',
    risk: 'interaction',
    mustHold: ['activeCardResolves', 'historyIsReadOnly'],
  },
  {
    id: 'mcq-art-id-rated',
    studyMode: 'mcq',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'artId',
    progressState: 'rated',
    inputPath: 'mouse',
    activityPanel: 'graphOn',
    sessionSupply: 'mixed',
    risk: 'regression',
    mustHold: ['activeCardResolves', 'artIdStyleExplicit'],
  },
  {
    id: 'flash-normal-front',
    studyMode: 'flash',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'text',
    progressState: 'answering',
    inputPath: 'mouse',
    activityPanel: 'graphOn',
    sessionSupply: 'mixed',
    risk: 'baseline',
    mustHold: ['activeCardResolves'],
  },
  {
    id: 'flash-image-revealed-options-open',
    studyMode: 'flash',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'image',
    progressState: 'revealed',
    inputPath: 'mouse',
    activityPanel: 'optionsOpen',
    sessionSupply: 'dueOnly',
    risk: 'interaction',
    mustHold: ['activeCardResolves', 'activityPanelLayoutOnly'],
  },
  {
    id: 'flash-merged-art-history-graph-off',
    studyMode: 'flash',
    scheduleMode: 'normal',
    deckScope: 'merged',
    contentShape: 'artId',
    progressState: 'history',
    inputPath: 'keyboard',
    activityPanel: 'graphOff',
    sessionSupply: 'mixed',
    risk: 'regression',
    mustHold: ['activeCardResolves', 'historyIsReadOnly', 'activityPanelLayoutOnly', 'artIdStyleExplicit'],
  },
  {
    id: 'flash-cram-keyboard',
    studyMode: 'flash',
    scheduleMode: 'cram',
    deckScope: 'single',
    contentShape: 'text',
    progressState: 'answering',
    inputPath: 'keyboard',
    activityPanel: 'graphOn',
    sessionSupply: 'mixed',
    risk: 'regression',
    mustHold: ['activeCardResolves', 'cramHardRemembered'],
  },
  {
    id: 'flash-cram-merged-image-history',
    studyMode: 'flash',
    scheduleMode: 'cram',
    deckScope: 'merged',
    contentShape: 'image',
    progressState: 'history',
    inputPath: 'keyboard',
    activityPanel: 'graphOff',
    sessionSupply: 'mixed',
    risk: 'interaction',
    mustHold: ['activeCardResolves', 'historyIsReadOnly', 'activityPanelLayoutOnly', 'cramHardRemembered'],
  },
  {
    id: 'flash-done-empty-graph-off',
    studyMode: 'flash',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'text',
    progressState: 'done',
    inputPath: 'mouse',
    activityPanel: 'graphOff',
    sessionSupply: 'empty',
    risk: 'interaction',
    mustHold: ['activityPanelLayoutOnly'],
  },
  {
    id: 'mcq-done-buried-graph-off',
    studyMode: 'mcq',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'text',
    progressState: 'done',
    inputPath: 'mouse',
    activityPanel: 'graphOff',
    sessionSupply: 'buried',
    risk: 'interaction',
    mustHold: ['activityPanelLayoutOnly', 'doneRecovery'],
  },
  {
    id: 'mcq-merged-passage-history-options-open',
    studyMode: 'mcq',
    scheduleMode: 'normal',
    deckScope: 'merged',
    contentShape: 'passage',
    progressState: 'history',
    inputPath: 'keyboard',
    activityPanel: 'optionsOpen',
    sessionSupply: 'mixed',
    risk: 'interaction',
    mustHold: ['activeCardResolves', 'historyIsReadOnly', 'activityPanelLayoutOnly'],
  },
  {
    id: 'flash-art-id-revealed-keyboard',
    studyMode: 'flash',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'artId',
    progressState: 'revealed',
    inputPath: 'keyboard',
    activityPanel: 'graphOn',
    sessionSupply: 'newOnly',
    risk: 'regression',
    mustHold: ['activeCardResolves', 'artIdStyleExplicit'],
  },
  {
    id: 'mcq-cram-image-graph-off',
    studyMode: 'mcq',
    scheduleMode: 'cram',
    deckScope: 'single',
    contentShape: 'image',
    progressState: 'answering',
    inputPath: 'mouse',
    activityPanel: 'graphOff',
    sessionSupply: 'newOnly',
    risk: 'interaction',
    mustHold: ['activeCardResolves', 'activityPanelLayoutOnly', 'cramHardRemembered'],
  },
  {
    id: 'startup-local-fallback',
    studyMode: 'mcq',
    scheduleMode: 'normal',
    deckScope: 'single',
    contentShape: 'text',
    progressState: 'done',
    inputPath: 'mouse',
    activityPanel: 'graphOn',
    sessionSupply: 'empty',
    risk: 'regression',
    mustHold: ['startupFallback'],
  },
];
