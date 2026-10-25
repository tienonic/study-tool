import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { LatexText } from '../../components/LatexText.tsx';
import { activeProject, activeTab, setActiveTab, studyView, setStudyView } from '../../core/store/app.ts';
import { workerApi } from '../../core/hooks/useWorker.ts';
import { SourceFigure } from '../quiz/SourceFigure.tsx';
import { CATEGORY_LABELS } from '../../data/math.ts';
import { checkWorkbookMath, makeWorkbookMath, type MathCategory } from './workbookMath.ts';
import { parseLearningConfig, piEvidenceLabel, projectTopics, safeSourceLink, sectionCoverage, topicLayout, topicSections, workbookItems, workspaceProject, type LearningConfig, type LearningMode } from './model.ts';
import './workspace.css';

interface Draft { reasoning: string; answer: string; revealed: boolean; hint: boolean; feedback?: { kind: string; message: string } }
const emptyDraft = (): Draft => ({ reasoning: '', answer: '', revealed: false, hint: false });

export function LearningWorkspace() {
  const params = new URLSearchParams(window.location.search);
  const learningFile = params.get('learningFile');
  const scoped = !!learningFile || !!params.get('learningTopic');
  const [remoteConfig, setRemoteConfig] = createSignal<LearningConfig | null>(null);
  const [loadError, setLoadError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [updated, setUpdated] = createSignal('');
  const [selected, setSelected] = createSignal(params.get('learningTopic') ?? '');
  const [returnStack, setReturnStack] = createSignal<string[]>([]);
  const [modeOverride, setModeOverride] = createSignal<LearningMode | null>(params.get('learningMode') === 'depth' ? 'depth' : params.get('learningMode') === 'exam' ? 'exam' : null);
  const [itemIndex, setItemIndex] = createSignal(0);
  const [drafts, setDrafts] = createSignal<Record<string, Draft>>({});
  const [saveStatus, setSaveStatus] = createSignal('');
  const [mathCategory, setMathCategory] = createSignal<MathCategory>('decimal');
  const [difficulty, setDifficulty] = createSignal<1 | 2 | 3>(1);
  const [example, setExample] = createSignal(0);
  const [mathChosen, setMathChosen] = createSignal(false);
  const [evidence, setEvidence] = createSignal<{ scores: { section_id: string; correct: number; attempted: number }[]; reviews: { section_id: string; reps: number }[] } | null>(null);
  let pendingRefresh: Promise<void> | null = null;
  let disposed = false;
  let refreshVersion = 0;

  const inlineConfig = createMemo(() => {
    const value = activeProject()?.config.learning;
    if (!value) return null;
    try { return parseLearningConfig(value); } catch { return null; }
  });
  const config = () => learningFile ? remoteConfig() : inlineConfig();
  const topics = () => config()?.topics ?? (scoped ? [] : projectTopics(activeProject()));
  const topic = () => topics().find(topic => topic.id === selected());
  const mode = () => modeOverride() ?? config()?.mode ?? 'exam';
  const goal = () => params.get('learningGoal') ?? config()?.goal;
  const boundProject = () => workspaceProject(activeProject(), config(), !!learningFile);
  const sections = () => topicSections(boundProject(), topic(), scoped);
  const items = createMemo(() => workbookItems(sections()));
  const item = () => items()[Math.min(itemIndex(), Math.max(0, items().length - 1))];
  const coverage = () => sectionCoverage(sections());
  const generators = () => coverage().generators.filter(key => ['decimal', 'average', 'percent', 'conversion'].includes(key)) as MathCategory[];
  const mathProblem = createMemo(() => makeWorkbookMath(mathCategory(), difficulty(), example()));
  const useMath = () => generators().length > 0 && (mathChosen() || items().length === 0);
  const draftKey = () => useMath() ? `${selected()}:${mathProblem().id}` : item()?.id ?? `reference:${selected()}`;
  const draft = () => drafts()[draftKey()] ?? emptyDraft();
  const patchDraft = (patch: Partial<Draft>) => {
    const key = draftKey();
    setDrafts(previous => ({ ...previous, [key]: { ...(previous[key] ?? emptyDraft()), ...patch } }));
    setSaveStatus('');
  };
  const score = () => {
    if (!evidence()) return null;
    const ids = new Set(sections().map(section => section.id));
    return evidence()!.scores.filter(row => ids.has(row.section_id)).reduce((sum, row) => ({ correct: sum.correct + row.correct, attempted: sum.attempted + row.attempted }), { correct: 0, attempted: 0 });
  };
  const recallCount = () => {
    if (!evidence()) return null;
    const ids = new Set(sections().map(section => section.id));
    return evidence()!.reviews.filter(row => ids.has(row.section_id)).reduce((sum, row) => sum + row.reps, 0);
  };
  const piEvidence = () => config()?.adaptiveRoute?.graph.nodes.find(node => node.id === selected());

  createEffect(() => {
    const list = topics();
    if (!list.length || list.some(topic => topic.id === selected())) return;
    const wanted = params.get('learningTopic') ?? config()?.topic_id ?? activeTab();
    setSelected(wanted && list.some(topic => topic.id === wanted) ? wanted : list[0].id);
  });
  createEffect(() => {
    const available = generators();
    if (available.length && !available.includes(mathCategory())) setMathCategory(available[0]);
  });

  async function loadContext() {
    const version = ++refreshVersion;
    const project = boundProject();
    setLoading(true);
    try {
      if (learningFile) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*\.json$/.test(learningFile)) throw new Error('The learning file name is invalid. Open the topic again from Pi.');
        const response = await fetch(`/api/learning/${encodeURIComponent(learningFile)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('The topic snapshot is unavailable. Refresh it from Pi, then try again.');
        const receipt = await response.json();
        const next = parseLearningConfig(receipt.workspace);
        if (disposed || version !== refreshVersion) return;
        setRemoteConfig(next);
        setUpdated(typeof receipt.generatedAt === 'string' ? receipt.generatedAt : typeof receipt.updated_at === 'string' ? receipt.updated_at : '');
      }
      const currentProject = boundProject();
      if (currentProject) {
        const [scores, reviews] = await Promise.all([workerApi.getScores(currentProject.slug), workerApi.getPerformanceCards(currentProject.slug)]);
        if (!disposed && version === refreshVersion && currentProject === boundProject()) setEvidence({ scores, reviews: reviews.filter(row => row.card_type === 'flashcard') });
      } else if (!disposed) setEvidence(null);
      if (!disposed && version === refreshVersion) setLoadError('');
    } catch (error) {
      if (!disposed && version === refreshVersion) setLoadError(error instanceof Error ? error.message : 'Could not refresh the learning context.');
    } finally {
      if (!disposed && version === refreshVersion) setLoading(false);
    }
  }
  function refresh() {
    if (pendingRefresh) return;
    pendingRefresh = loadContext().finally(() => { pendingRefresh = null; });
  }
  onMount(() => { refresh(); window.addEventListener('focus', refresh); });
  onCleanup(() => { disposed = true; window.removeEventListener('focus', refresh); });

  function selectTopic(id: string, follow = false) {
    if (follow && selected()) setReturnStack(stack => [...stack, selected()]);
    else if (!follow) setReturnStack([]);
    setSelected(id);
    setItemIndex(0);
    setSaveStatus('');
  }
  function goBack() {
    const stack = returnStack();
    if (!stack.length) return;
    setSelected(stack[stack.length - 1]);
    setReturnStack(stack.slice(0, -1));
    setItemIndex(0);
  }
  function openDrill() {
    if (studyView() === 'drill') return;
    const first = sections()[0];
    if (!first) return;
    if (!sections().some(section => section.id === activeTab())) setActiveTab(first.id);
    setStudyView('drill');
  }
  async function saveNote() {
    const project = boundProject();
    if (!project || !draft().reasoning.trim()) return;
    setSaveStatus('Saving...');
    try {
      await workerApi.addNote(project.slug, `${topic()?.title ?? project.name}\n${useMath() ? mathProblem().question : item()?.question ?? 'Reference notes'}\n\n${draft().reasoning}`);
      setSaveStatus('Saved to project notes.');
    } catch { setSaveStatus('Could not save the note. Your work remains here.'); }
  }
  function downloadDraft() {
    const text = `${topic()?.title ?? 'Workbook'}\n${useMath() ? mathProblem().question : item()?.question ?? 'Reference notes'}\n\n${draft().reasoning}\n\nAnswer: ${draft().answer}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `workbook-${selected() || 'notes'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <section class="learning-workspace" aria-label="Learning workspace">
    <nav class="learning-view-nav" aria-label="Study view">
      <button type="button" aria-pressed={studyView() === 'drill'} disabled={!activeProject() || scoped && !sections().length} onClick={openDrill}>Drill</button>
      <button type="button" aria-pressed={studyView() === 'workbook'} onClick={() => setStudyView('workbook')}>Workbook</button>
      <button type="button" aria-pressed={studyView() === 'map'} onClick={() => setStudyView('map')}>Topic map</button>
    </nav>
    <div class={studyView() === 'drill' ? 'hidden' : ''}>
      <header class="learning-heading">
        <div><h1>{params.get('learningTopicLabel') ?? (scoped ? topic()?.title ?? 'Learning' : activeProject()?.name ?? 'Learning')}</h1><Show when={goal()}><p>{goal()}</p></Show></div>
        <button type="button" disabled={loading()} onClick={refresh}>{loading() ? 'Refreshing...' : 'Refresh'}</button>
      </header>
      <Show when={loadError()}><p class="learning-notice learning-error" role="alert">{loadError()} {remoteConfig() ? 'The last loaded snapshot remains visible.' : ''}</p></Show>
      <Show when={updated()}><p class="learning-caption">Pi snapshot · {updated()}</p></Show>
      <div class="learning-controls">
        <label>Topic<select value={selected()} onChange={event => selectTopic(event.currentTarget.value)}><For each={topics()}>{topic => <option value={topic.id} selected={selected() === topic.id}>{topic.title}</option>}</For></select></label>
        <fieldset><legend>Learning goal</legend><button type="button" aria-pressed={mode() === 'exam'} onClick={() => setModeOverride('exam')}>Exam</button><button type="button" aria-pressed={mode() === 'depth'} onClick={() => setModeOverride('depth')}>Depth</button></fieldset>
      </div>
      <Show when={topics().length} fallback={<p class="learning-notice">Open a topic from Pi with <code>/learn workbook</code> or load a project to use its workbook.</p>}>
        <div class="learning-evidence" aria-label="Separate learning evidence">
          <span><strong>Prepared</strong> {coverage().questions} questions · {coverage().flashcards} cards · {coverage().generators.length} generators</span>
          <span><strong>Quiz practice</strong> {score() ? `${score()!.correct}/${score()!.attempted} correct` : 'Unavailable'}</span>
          <span><strong>Recall</strong> {recallCount() === null ? 'Unavailable' : `${recallCount()} reviews`}</span>
          <span><strong>Pi</strong> {piEvidenceLabel(piEvidence())}<Show when={piEvidence()?.attemptCount !== undefined}><small>{piEvidence()?.attemptCount} attempts · {piEvidence()?.independentQuestions ?? 0} independent questions</small></Show></span>
        </div>
        <Show when={studyView() === 'map'}>
          <TopicMap topics={topics()} selected={selected()} select={id => selectTopic(id)} evidence={config()?.adaptiveRoute?.graph.nodes ?? []} />
          <p class="learning-caption">Arrows point from a declared prerequisite to the topic that uses it. Topics without arrows have no declared dependencies. Open any topic to read it.</p>
          <button type="button" class="learning-primary" onClick={() => setStudyView('workbook')}>Open selected topic</button>
        </Show>
        <div class={studyView() === 'workbook' ? 'learning-workbook' : 'hidden'}>
          <aside class="learning-reference">
            <Show when={returnStack().length}><button type="button" onClick={goBack}>← Back to previous topic</button></Show>
            <h2>{topic()?.title ?? 'Reference'}</h2>
            <Show when={topic()?.requires.length}><h3>Prerequisites</h3><ul><For each={topic()?.requires}>{id => <li><button type="button" class="learning-text-button" onClick={() => selectTopic(id, true)}>{topics().find(topic => topic.id === id)?.title ?? id}</button></li>}</For></ul></Show>
            <Show when={topic()?.reference} fallback={<p class="learning-caption">No explanation is included in this snapshot. Use the sources below or ask Pi about this topic.</p>}><p class="learning-reference-text"><LatexText text={topic()?.reference} /></p></Show>
            <Show when={topic()?.prompts?.length}><h3>Questions to explain</h3><ul><For each={topic()?.prompts}>{prompt => <li><LatexText text={prompt} /></li>}</For></ul></Show>
            <Show when={topic()?.source_refs?.length || item()?.sources.length}><h3>Sources</h3><ul class="learning-sources"><For each={[...new Set([...(topic()?.source_refs ?? []), ...(item()?.sources ?? [])])]}>{source => <li><Show when={safeSourceLink(source)} fallback={<span>{source}</span>}>{url => <a href={url()} target="_blank" rel="noopener noreferrer">{source}</a>}</Show></li>}</For></ul></Show>
            <Show when={topic()?.sources?.length}><ul class="learning-sources"><For each={topic()?.sources}>{source => <li><Show when={safeSourceLink(source.url)} fallback={<span>{source.label}</span>}>{url => <a href={url()} target="_blank" rel="noopener noreferrer">{source.label}</a>}</Show><Show when={source.locator}><span> · {source.locator}</span></Show></li>}</For></ul></Show>
          </aside>
          <article class="learning-paper">
            <div class="learning-paper-heading"><h2>{useMath() ? 'Math practice' : item() ? 'Work through it' : 'Reasoning notes'}</h2><Show when={items().length}><span>{Math.min(itemIndex() + 1, items().length)} / {items().length}</span></Show></div>
            <p class="learning-caption">{mode() === 'exam' ? 'Solve from memory, then check. There is no time cutoff.' : 'Explain the method, inspect a hint when needed, then try a fresh example.'}</p>
            <Show when={generators().length && items().length}><fieldset class="learning-exercise-kind"><legend>Practice</legend><button type="button" aria-pressed={!useMath()} onClick={() => setMathChosen(false)}>Deck questions</button><button type="button" aria-pressed={useMath()} onClick={() => setMathChosen(true)}>Generated math</button></fieldset></Show>
            <Show when={useMath()}>
              <div class="learning-controls"><label>Category<select value={mathCategory()} onChange={event => { setMathCategory(event.currentTarget.value as MathCategory); setExample(0); }}><For each={generators()}>{key => <option value={key}>{CATEGORY_LABELS[key]}</option>}</For></select></label><label>Difficulty<select value={difficulty()} onChange={event => setDifficulty(Number(event.currentTarget.value) as 1 | 2 | 3)}><option value="1">1 · Foundation</option><option value="2">2 · Variation</option><option value="3">3 · Transfer</option></select></label></div>
              <p class="learning-question"><LatexText text={mathProblem().question} /></p>
              <Show when={mode() === 'depth'}><p><LatexText text={mathProblem().reasoning} /></p><button type="button" onClick={() => patchDraft({ hint: true })}>Show a hint</button><Show when={draft().hint}><p class="learning-notice">{mathProblem().hint}</p></Show></Show>
            </Show>
            <Show when={!useMath() && item()}>
              <Show when={item()?.passage}><blockquote class="learning-passage"><LatexText text={item()?.passage} /></blockquote></Show>
              <Show when={item()?.image}>{source => <SourceFigure source={source()} class="learning-source-figure" />}</Show>
              <p class="learning-question"><LatexText text={item()?.question} /></p>
              <Show when={mode() === 'depth'}><p class="learning-caption">Explain why this answer follows. Name an assumption and a case where the answer would change.</p></Show>
            </Show>
            <Show when={!useMath() && !item()}><p class="learning-notice">This topic has no linked deck questions. Read its sources and use this space to reason. Continue with Pi for a checked attempt.</p></Show>
            <label class="learning-reasoning">Your reasoning<textarea rows="9" value={draft().reasoning} onInput={event => patchDraft({ reasoning: event.currentTarget.value })} placeholder="Write the setup, each step, and a check of your result." /></label>
            <Show when={useMath()}><label class="learning-answer">Numeric answer<input type="text" inputmode="decimal" value={draft().answer} onInput={event => patchDraft({ answer: event.currentTarget.value, feedback: undefined })} onKeyDown={event => { if (event.key === 'Enter') patchDraft({ feedback: checkWorkbookMath(mathProblem(), draft().answer) }); }} /><span>{mathProblem().unit}</span></label><button type="button" class="learning-primary" onClick={() => patchDraft({ feedback: checkWorkbookMath(mathProblem(), draft().answer) })}>Check answer</button></Show>
            <Show when={draft().feedback}><p class={`learning-notice learning-check-${draft().feedback!.kind}`} role="status">{draft().feedback!.message}</p></Show>
            <div class="learning-actions"><Show when={useMath() || item()}><button type="button" onClick={() => patchDraft({ revealed: !draft().revealed })}>{draft().revealed ? 'Hide worked answer' : 'Reveal worked answer'}</button></Show><Show when={boundProject()}><button type="button" disabled={!draft().reasoning.trim() || saveStatus() === 'Saving...'} onClick={saveNote}>Save to project notes</button></Show><button type="button" disabled={!draft().reasoning.trim() && !draft().answer.trim()} onClick={downloadDraft}>Download work</button></div>
            <Show when={saveStatus()}><p role="status">{saveStatus()}</p></Show>
            <Show when={draft().revealed}>
              <div class="learning-worked"><h3>Worked answer</h3><Show when={useMath()} fallback={<><LatexText text={item()?.answer} /><Show when={item()?.answerImage}>{source => <SourceFigure source={source()} class="learning-source-figure" />}</Show><Show when={item()?.explanation}><p><LatexText text={item()?.explanation} /></p></Show></>}><ol><For each={mathProblem().steps}>{step => <li><LatexText text={step} /></li>}</For></ol></Show><p class="learning-caption">Compare the reasoning with your attempt. Reading or revealing an answer adds no learning evidence.</p></div>
            </Show>
            <div class="learning-actions"><Show when={items().length > 1}><button type="button" disabled={itemIndex() === 0} onClick={() => setItemIndex(index => Math.max(0, index - 1))}>Previous</button><button type="button" disabled={itemIndex() >= items().length - 1} onClick={() => setItemIndex(index => Math.min(items().length - 1, index + 1))}>Next question</button></Show><Show when={useMath()}><button type="button" onClick={() => setExample(value => value + 1)}>{draft().feedback?.kind === 'incorrect' ? 'Try a fresh repair example' : 'New example'}</button></Show><Show when={sections().length}><button type="button" onClick={openDrill}>Continue in Drill</button></Show></div>
            <p class="learning-caption">Workbook checks stay in this view. Drill records browser review. Pi records independent attempts.</p>
          </article>
        </div>
      </Show>
    </div>
  </section>;
}

function TopicMap(props: { topics: ReturnType<typeof projectTopics>; selected: string; select: (id: string) => void; evidence: NonNullable<LearningConfig['adaptiveRoute']>['graph']['nodes'] }) {
  const nodes = createMemo(() => topicLayout(props.topics));
  const width = () => Math.max(280, ...nodes().map(node => node.x + 250));
  const height = () => Math.max(120, ...nodes().map(node => node.y + 90));
  return <div class="learning-map-scroll" role="region" aria-label="Topic prerequisite graph" tabindex="0">
    <svg class="learning-map" width={width()} height={height()} viewBox={`0 0 ${width()} ${height()}`} role="group" aria-label="Select a topic to inspect its reference and evidence">
      <defs><marker id="learning-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
      <For each={nodes()}>{node => <For each={node.requires}>{id => {
        const from = () => nodes().find(node => node.id === id)!;
        return <path class="learning-map-edge" marker-end="url(#learning-arrow)" d={`M ${from().x + 232} ${from().y + 34} C ${from().x + 264} ${from().y + 34}, ${node.x - 32} ${node.y + 34}, ${node.x} ${node.y + 34}`}><title>{from().title} is a prerequisite for {node.title}</title></path>;
      }}</For>}</For>
      <For each={nodes()}>{node => <g class={`learning-map-node${props.selected === node.id ? ' selected' : ''}`} role="button" tabindex="0" aria-pressed={props.selected === node.id} aria-label={`${node.title}, ${props.evidence.find(value => value.id === node.id)?.evidence ?? 'unassessed'}`} transform={`translate(${node.x} ${node.y})`} onClick={() => props.select(node.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.select(node.id); } }}>
        <rect width="232" height="74" rx="3" /><foreignObject x="12" y="8" width="208" height="39"><div class="learning-map-title">{node.title}</div></foreignObject><text x="12" y="62">{props.evidence.find(value => value.id === node.id)?.evidence ?? 'unassessed'}</text>
      </g>}</For>
    </svg>
  </div>;
}
