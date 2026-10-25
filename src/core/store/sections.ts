import { createSignal } from 'solid-js';
import { setActiveTab } from './app.ts';
import type { QuizSession } from '../../features/quiz/types.ts';
import type { MathSession } from '../../features/math/store.ts';

export type SessionEntry =
  | { kind: 'quiz'; session: QuizSession }
  | { kind: 'math'; session: MathSession };

export const sectionHandlers = new Map<string, SessionEntry>();
// Version signal to make sectionHandlers reads reactive in SolidJS
const [handlerVersion, setHandlerVersion] = createSignal(0);
export { handlerVersion };
export function bumpHandlerVersion() { setHandlerVersion(v => v + 1); }

export async function switchToSection(sectionId: string) {
  setActiveTab(sectionId);
  const entry = sectionHandlers.get(sectionId);
  if (entry?.kind === 'quiz') await entry.session.pickNextCard();
}
