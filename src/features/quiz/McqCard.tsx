import { sanitizeStudyHtml } from '../../utils/studyHtml.ts';
import { Show, For, createSignal } from 'solid-js';
import type { McqView } from './types.ts';
import { easyMode } from '../../core/store/app.ts';
import { getLabel } from '../settings/keybinds.ts';
import { LatexText } from '../../components/LatexText.tsx';
import { SourceFigure } from './SourceFigure.tsx';
import { figuresReady } from './sourceFigures.ts';
import { handleMcqOptionClick } from './mcqOptionClick.ts';
import { cleanAnswerLabel, cleanExplanation, cleanPassageHtml, cleanQuestionPrompt } from '../../projects/studyCopy.ts';

const RATING_CSS: Record<number, string> = { 1: 'rating-again', 2: 'rating-hard', 3: 'rating-good', 4: 'rating-easy' };
const RATING_NAMES: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

export function AddNewCards(props: { session: Pick<McqView, 'increaseNewCards' | 'dueCount' | 'studyMore'> }) {
  const [count, setCount] = createSignal(5);
  const canAddAll = () => props.session.dueCount().due > 0 || props.session.dueCount().newCount > 0;
  function addAll() {
    const due = props.session.dueCount();
    if (due.newCount > 0) return props.session.increaseNewCards(due.newCount);
    return props.session.studyMore();
  }
  return (
    <div class="done-add-new">
      <input type="number" value={count()} min="1" class="new-cards-input"
        onInput={(e) => setCount(Math.max(1, parseInt(e.currentTarget.value, 10) || 1))} />
      <button type="button" class="action-sm"
        onClick={() => props.session.increaseNewCards(count()).catch(() => {})}>Add New</button>
      <button type="button" class="action-sm" disabled={!canAddAll()}
        onClick={() => addAll().catch(() => {})}>Add all</button>
    </div>
  );
}

export function McqCard(props: { session: McqView; isPassage?: boolean }) {
  const s = props.session;
  const figureReady = () => figuresReady(s.question()?.image);
  const answerBlocked = () => !figureReady() && (s.state() === 'answering' || s.state() === 'revealed');

  function optionClass(opt: string): string {
    const st = s.state(); const q = s.question();
    if (st === 'answering' || st === 'idle' || !q) return 'option-btn';
    return `option-btn answered${opt === q.correct ? ' correct' : ''}${opt === s.selected() && !s.isCorrect() ? ' wrong' : ''}`;
  }

  function feedbackFor(opt: string) {
    const st = s.state(); const q = s.question();
    if (st === 'answering' || st === 'idle' || !q) return null;
    const text = cleanAnswerLabel(q.correct) ?? q.correct;
    const explanation = cleanExplanation(q.explanation);
    if (s.skipped() && opt === q.correct) return { text, cls: 'option-feedback skip-fb', explanation };
    if (opt === s.selected()) return s.isCorrect() ? { text, cls: 'option-feedback correct-fb', explanation } : { text, cls: 'option-feedback wrong-fb', explanation };
    return null;
  }

  return (
    <div class="card">
      <Show when={s.state() === 'idle'}>
        <div class="card-loading">Loading...</div>
      </Show>
      <Show when={s.isCorrect() && (s.state() === 'revealed' || (s.state() === 'rated' && !s.cramMode()))}>
        <button type="button" class="card-flag-btn" disabled={!figureReady()} title="Mark as wrong for extra practice" onClick={() => s.flagWrong().catch(() => {})}>&times;</button>
      </Show>
      <Show when={props.isPassage ? cleanPassageHtml(s.passage()) : undefined}>{(passage) => <div class="passage" innerHTML={sanitizeStudyHtml(passage())} />}</Show>
      <Show when={s.question()}>{(q) => <>
        <Show when={q().image}>{image => <SourceFigure source={image()} class="card-image" />}</Show>
        <div class="question-header"><LatexText text={cleanQuestionPrompt(q().q) ?? q().q} class="question-text" /></div>
      </>}</Show>

      <div class="options">
        <For each={s.options()}>
          {(opt) => {
            const fb = () => feedbackFor(opt);
            return (
              <div class="option-wrapper">
                <button type="button" class={optionClass(opt)} disabled={answerBlocked()} onClick={() => handleMcqOptionClick(s, opt)}><LatexText text={cleanAnswerLabel(opt) ?? opt} /></button>
                <Show when={fb()}>
                  {(fbd) => <div class={fbd().cls}><Show when={fbd().text}><LatexText text={fbd().text} /></Show><Show when={fbd().explanation}><LatexText text={fbd().explanation} class="explanation" /></Show></div>}
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={s.state() === 'revealed' && !easyMode()}>
        <div class="rating-area">
          <For each={[1, 2, 3, 4]}>
            {(rating) => <button type="button" class={`rating-btn ${RATING_CSS[rating]}`} disabled={!figureReady()} onClick={() => s.rate(rating).catch(() => {})}><span class="rating-label">{RATING_NAMES[rating]}</span><span class="rating-interval">{s.ratingLabels()[rating] ?? ''}</span></button>}
          </For>
        </div>
        <div class="card-actions"><button type="button" class="action-sm" onClick={() => s.suspend().catch(() => {})}>Suspend</button><button type="button" class="action-sm" onClick={() => s.bury().catch(() => {})}>Bury</button></div>
      </Show>

      <Show when={s.state() === 'rated' && !s.cramMode()}>
        <div class="card-actions continue-actions">
          <button type="button" class="action-sm continue-btn" onClick={() => s.pickNextCard().catch(() => {})}>Next question</button>
          <button type="button" class="action-sm" onClick={() => s.undo().catch(() => {})}>Undo</button>
        </div>
      </Show>

      <Show when={s.leechWarning()}>
        <span class="explanation leech-warning">This card is a leech (frequently forgotten). Consider reviewing the material.</span>
      </Show>

      <Show when={s.state() === 'reviewing-history'}>
        <div class="key-hints">History {s.historyPosition().current}/{s.historyPosition().total} — <kbd>{getLabel('goBack')}</kbd>/<kbd>&larr;</kbd> back, <kbd>{getLabel('forward')}</kbd>/<kbd>&rarr;</kbd> forward</div>
      </Show>

      <Show when={s.state() === 'done'}>
        <div class="done-screen">
          <h3 class="done-title">Session Complete</h3>
          <Show when={s.score().attempted > 0}>
            <div class="done-stats"><span class="done-stat">{s.score().correct} / {s.score().attempted} correct</span><span class="done-stat">{Math.round((s.score().correct / s.score().attempted) * 100)}% accuracy</span></div>
          </Show>
          <div class="done-due"><span>{s.dueCount().due} due now</span><span>{s.dueCount().newCount} new remaining</span><span>{s.dueCount().total} total cards</span></div>
          <div class="done-actions">
            <button type="button" class="action-sm" onClick={() => s.studyMore().catch(() => {})}>Study More</button>
            <button type="button" class="action-sm cram-btn" onClick={() => s.startCram().catch(() => {})}>Cram</button>
            <AddNewCards session={s} />
            <button type="button" class="action-sm" onClick={() => s.unburyAll().catch(() => {})}>Unbury Cards</button>
          </div>
        </div>
      </Show>
    </div>
  );
}
