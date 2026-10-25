import { easyMode } from '../../core/store/app.ts';
import { isAnsweringState, isRatedState, isRevealedState, isReviewingHistoryState } from './sessionState.ts';
import type { McqView } from './types.ts';

type McqOptionClickView = Pick<McqView, 'state' | 'answer' | 'rate' | 'pickNextCard' | 'advanceFromHistory' | 'isCorrect'>;

export function handleMcqOptionClick(session: McqOptionClickView, option: string, isEasyMode = easyMode()) {
  const st = session.state();
  if (isAnsweringState(st)) {
    session.answer(option).catch(() => {});
    return;
  }
  if (isReviewingHistoryState(st)) {
    session.advanceFromHistory();
    return;
  }
  if (isRatedState(st)) {
    session.pickNextCard().catch(() => {});
    return;
  }
  if (isRevealedState(st) && isEasyMode) {
    session.rate(session.isCorrect() ? 3 : 1).catch(() => {});
  }
}
