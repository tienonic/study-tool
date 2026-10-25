import './math.css';
import { Show, For, createEffect, onMount, onCleanup, untrack } from 'solid-js';
import type { Section } from '../../projects/types.ts';
import { createMathSession } from './store.ts';
import { sectionHandlers, bumpHandlerVersion } from '../../core/store/sections.ts';
import { forProject } from '../../core/hooks/useWorker.ts';
import { CATEGORY_LABELS } from '../../data/math.ts';
import { renderLatex } from '../../core/hooks/useLatex.ts';
import { activeProject, activeTab } from '../../core/store/app.ts';
import { getTimerConfig } from '../../core/timerConfig.ts';

export function MathSection(props: { section: Section }) {
  const session = createMathSession(props.section, forProject(activeProject()!.slug));
  const tc = () => getTimerConfig(activeProject()?.config, props.section.id, props.section.type);

  let inputRef: HTMLInputElement | undefined;
  let questionRef: HTMLSpanElement | undefined;
  let feedbackRef: HTMLDivElement | undefined;
  let stepsRef: HTMLDivElement | undefined;

  onMount(() => { sectionHandlers.set(props.section.id, { kind: 'math', session }); bumpHandlerVersion(); session.generateProblem(); });
  onCleanup(() => { sectionHandlers.delete(props.section.id); bumpHandlerVersion(); });

  // Reset timer when this section becomes the active tab — same fix as QuizSection
  createEffect(() => {
    if (activeTab() !== props.section.id) return;
    if (untrack(() => session.state()) === 'answering') session.timer.start();
  });

  createEffect(() => {
    const p = session.problem();
    if (questionRef) { questionRef.textContent = p?.q ?? ''; renderLatex(questionRef); }
  });

  createEffect(() => {
    if (session.state() === 'answering') {
      const id = setTimeout(() => inputRef?.focus(), 0);
      onCleanup(() => clearTimeout(id));
    }
  });

  createEffect(() => {
    const fb = session.feedback();
    if (feedbackRef && fb) { feedbackRef.innerHTML = fb.text; renderLatex(feedbackRef); }
  });

  createEffect(() => {
    if (session.showSteps() && stepsRef) {
      const id = setTimeout(() => { if (stepsRef) renderLatex(stepsRef); }, 0);
      onCleanup(() => clearTimeout(id));
    }
  });

  const submitAnswer = () => inputRef && session.checkAnswer(inputRef.value);

  const timerCls = () => { const s = session.timer.seconds(); const t = tc(); return `timer${s >= t.failAt ? ' skull' : s >= t.warnAt ? ' red' : ''}`; };
  const timerContent = () => { const s = session.timer.seconds(); return s >= tc().failAt ? '\u{1F480}' : s + 's'; };

  const feedbackCls = () => {
    const fb = session.feedback();
    if (!fb) return 'feedback';
    const kind = `${fb.type}-fb`;
    return `feedback show ${kind}`;
  };

  return (
    <div>
      <div class="mode-toggle mode-toggle-actions-only"><span class="mode-toggle-actions">
          <button type="button" class={`pause-btn${session.paused() ? ' active' : ''}`} onClick={() => session.togglePause()} title={session.paused() ? 'Resume timer' : 'Pause timer'}>{session.paused() ? '\u25B6' : '\u23F8'}</button>
          <button type="button" class="reset-btn" onClick={() => session.resetSection()} title="Reset score and streak">Reset</button>
        </span></div>

      <div class="math-category-btns"><button type="button" class={session.category() === 'all' ? 'active' : ''} onClick={() => session.setCategory('all')}>All</button><For each={props.section.generators ?? Object.keys(CATEGORY_LABELS)}>{(gen) => <button type="button" class={session.category() === gen ? 'active' : ''} onClick={() => session.setCategory(gen)}>{CATEGORY_LABELS[gen] ?? gen}</button>}</For></div>

      <div class="card">
        <div class="question-header">
          <span class="question-text" ref={questionRef} />
          <Show when={session.state() === 'answering'}><span class={timerCls()}>{timerContent()}</span></Show>
        </div>

        <Show when={session.state() === 'answering'}>
          <div class="math-input"><input type="text" ref={inputRef} placeholder="Your answer" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitAnswer(); } }} /><button type="button" onClick={submitAnswer}>Submit</button></div>
          <button type="button" class="dk-btn" onClick={() => session.skipProblem()}>Skip</button>
        </Show>

        <div class={feedbackCls()} ref={feedbackRef} />

        <Show when={session.state() === 'revealed'}>
          <button type="button" class="action-btn" onClick={() => session.nextProblem()}>Next Problem</button>
        </Show>

        <Show when={session.showSteps() && (session.problem()?.steps.length ?? 0) > 0}>
          <div class="math-steps" ref={stepsRef}>
            <h4>Step-by-Step Solution</h4>
            <ol><For each={session.problem()?.steps ?? []}>{(s) => <li innerHTML={s} />}</For></ol>
          </div>
        </Show>

      </div>
    </div>
  );
}
