import type { TimerConfig, ProjectConfig, Section } from '../projects/types.ts';

export type { TimerConfig };

export const TIMER_DEFAULTS: Record<Section['type'], TimerConfig> = {
  'mc-quiz':      { warnAt: 15,  failAt: 60 },
  'passage-quiz': { warnAt: 25,  failAt: 90 },
  'math-gen':     { warnAt: 60,  failAt: 180 },
};

export function getTimerConfig(
  config: ProjectConfig | undefined,
  sectionId: string,
  sectionType: Section['type'],
): TimerConfig {
  return config?.timerConfigs?.[sectionId] ?? TIMER_DEFAULTS[sectionType];
}
