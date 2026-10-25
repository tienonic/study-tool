import './settings.css';
import { Show, For, onCleanup, createSignal, createMemo, batch } from 'solid-js';
import { activeProject, setActiveProject, activePanel, setActivePanel, setHeaderLocked } from '../../core/store/app.ts';
import { getTimerConfig, TIMER_DEFAULTS } from '../../core/timerConfig.ts';
import { exportProjectData } from '../export/export.ts';
import { workerApi } from '../../core/hooks/useWorker.ts';
import { saveProjectConfig, openRecentProject } from '../launcher/store.ts';
import type { TimerConfig } from '../../projects/types.ts';
import type { StudyProgress } from '../../core/workers/protocol.ts';
import { buildExposurePlan, studyGoalQuotaKey } from '../goals/studyPlan.ts';
import { isCalendarDateKey, localCalendarDateKey } from '../../utils/calendarDate.ts';
import { AnchoredDialog } from '../../components/overlays/AnchoredDialog.tsx';

const PRESETS = [
  { label: 'Relaxed', retention: 0.80, maxInterval: 180 },
  { label: 'Balanced', retention: 0.90, maxInterval: 60 },
  { label: 'Tight', retention: 0.95, maxInterval: 30 },
] as const;

export function SettingsPanel() {
  const [retention, setRetention] = createSignal(0.9);
  const [newPerSession, setNewPerSession] = createSignal(20);
  const [leechThreshold, setLeechThreshold] = createSignal(8);
  const [maxInterval, setMaxInterval] = createSignal(90);
  const [playOnFlip, setPlayOnFlip] = createSignal(true);
  const [goalStartDate, setGoalStartDate] = createSignal('');
  const [goalTargetDate, setGoalTargetDate] = createSignal('');
  const [weekendMultiplier, setWeekendMultiplier] = createSignal(2);
  const [goalError, setGoalError] = createSignal<string | null>(null);
  const [studyProgress, setStudyProgress] = createSignal<StudyProgress | null>(null);
  const [progressLoading, setProgressLoading] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  let btnRef!: HTMLButtonElement;
  const [exportLabel, setExportLabel] = createSignal('Export');
  const [backupStatus, setBackupStatus] = createSignal<string | null>(null);
  let backupTimer: ReturnType<typeof setTimeout> | undefined;
  let backupInput!: HTMLInputElement;

  // Timer config per section
  const [selectedTimerSection, setSelectedTimerSection] = createSignal<string | null>(null);
  const [timerWarnAt, setTimerWarnAt] = createSignal(15);
  const [timerFailAt, setTimerFailAt] = createSignal(60);
  const [timerOverrides, setTimerOverrides] = createSignal<Record<string, TimerConfig>>({});

  let progressRequest = 0;

  async function refreshStudyProgress(project = activeProject()) {
    if (!project) return;
    const request = ++progressRequest;
    setProgressLoading(true);
    try {
      const result = await workerApi.getStudyProgress(
        project.slug,
        retention(),
        studyGoalQuotaKey(project.slug),
      );
      if (request === progressRequest && activeProject()?.slug === project.slug) setStudyProgress(result);
    } catch {
      if (request === progressRequest) setStudyProgress(null);
    } finally {
      if (request === progressRequest) setProgressLoading(false);
    }
  }

  const exposurePlan = createMemo(() => {
    const progress = studyProgress();
    if (!progress || !goalTargetDate()) return null;
    try {
      return buildExposurePlan({
        today: localCalendarDateKey(),
        startDate: goalStartDate() || undefined,
        targetDate: goalTargetDate(),
        weekendMultiplier: weekendMultiplier(),
        unseen: progress.unseen,
        introducedToday: progress.introducedToday,
        due: progress.due,
      });
    } catch {
      return null;
    }
  });

  function percent(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 100)}%`;
  }

  function activePreset(): string | null {
    const ret = retention();
    const mi = maxInterval();
    for (const p of PRESETS) {
      if (p.retention === ret && p.maxInterval === mi) return p.label;
    }
    return null;
  }

  function load() {
    const project = activeProject();
    if (!project) return;
    batch(() => {
      setRetention(project.config.desired_retention);
      setNewPerSession(project.config.new_per_session);
      setLeechThreshold(project.config.leech_threshold);
      setMaxInterval(project.config.max_interval);
      setPlayOnFlip(project.config.listening.play_on_flip !== false);
      setGoalStartDate(project.config.study_goal?.start_date ?? '');
      setGoalTargetDate(project.config.study_goal?.target_date ?? '');
      setWeekendMultiplier(project.config.study_goal?.weekend_multiplier ?? 2);
      setGoalError(null);
      setStudyProgress(null);
      setTimerOverrides(project.config.timerConfigs ? { ...project.config.timerConfigs } : {});
      setSelectedTimerSection(null);
    });
    refreshStudyProgress(project).catch(() => {});
  }

  function selectTimerSection(sectionId: string) {
    const project = activeProject();
    if (!project) return;
    setSelectedTimerSection(sectionId);
    const sec = project.sections.find(s => s.id === sectionId);
    const overrides = timerOverrides();
    const tc = overrides[sectionId] ?? getTimerConfig(project.config, sectionId, sec?.type ?? 'mc-quiz');
    batch(() => { setTimerWarnAt(tc.warnAt); setTimerFailAt(tc.failAt); });
  }

  function updateTimerField(field: 'warnAt' | 'failAt', value: number) {
    const secId = selectedTimerSection();
    if (!secId) return;
    const overrides = { ...timerOverrides() };
    const existing = overrides[secId] ?? { warnAt: timerWarnAt(), failAt: timerFailAt() };
    overrides[secId] = { ...existing, [field]: value };
    setTimerOverrides(overrides);
    if (field === 'warnAt') setTimerWarnAt(value);
    else setTimerFailAt(value);
  }

  function isTimerDefault() {
    const secId = selectedTimerSection();
    if (!secId) return true;
    const project = activeProject();
    if (!project) return true;
    const sec = project.sections.find(s => s.id === secId);
    const defaults = TIMER_DEFAULTS[sec?.type ?? 'mc-quiz'];
    return timerWarnAt() === defaults.warnAt && timerFailAt() === defaults.failAt;
  }

  function resetTimerToDefault() {
    const secId = selectedTimerSection();
    if (!secId) return;
    const project = activeProject();
    if (!project) return;
    const sec = project.sections.find(s => s.id === secId);
    const defaults = TIMER_DEFAULTS[sec?.type ?? 'mc-quiz'];
    const overrides = { ...timerOverrides() };
    delete overrides[secId];
    batch(() => { setTimerOverrides(overrides); setTimerWarnAt(defaults.warnAt); setTimerFailAt(defaults.failAt); });
  }

  function handleOpen() {
    if (activePanel() === 'settings') {
      close();
    } else {
      load();
      batch(() => { setActivePanel('settings'); setHeaderLocked(true); setSaved(false); });
    }
  }

  function close() { batch(() => { setActivePanel(null); setHeaderLocked(false); }); }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => { progressRequest += 1; if (saveTimer) clearTimeout(saveTimer); if (backupTimer) clearTimeout(backupTimer); });

  async function handleSave() {
    const project = activeProject();
    if (!project) return;

    const ret = Math.max(0.7, Math.min(0.99, retention()));
    const nps = Math.max(1, Math.min(10_000, Math.round(newPerSession())));
    const lt = Math.max(2, Math.min(30, Math.round(leechThreshold())));
    const mi = Math.max(1, Math.min(365, Math.round(maxInterval())));
    const weekend = Math.max(1, Math.min(4, weekendMultiplier()));
    const start = goalStartDate().trim();
    const target = goalTargetDate().trim();
    if ((start && !isCalendarDateKey(start)) || (target && !isCalendarDateKey(target))) {
      setGoalError('Use real calendar dates.');
      return;
    }
    if (start && target && start > target) {
      setGoalError('Start date must not be after target date.');
      return;
    }
    const studyGoal = start || target
      ? { start_date: start || undefined, target_date: target || undefined, weekend_multiplier: weekend }
      : undefined;

    const tc = Object.keys(timerOverrides()).length > 0 ? timerOverrides() : undefined;
    const listening = project.config.listening.enabled
      ? { ...project.config.listening, play_on_flip: playOnFlip() }
      : project.config.listening;
    const nextConfig = {
      ...project.config,
      desired_retention: ret,
      new_per_session: nps,
      leech_threshold: lt,
      max_interval: mi,
      timerConfigs: tc,
      study_goal: studyGoal,
      listening,
    };
    setActiveProject({ ...project, config: nextConfig });

    try {
      await workerApi.setFSRSParams(ret, lt, mi);
      saveProjectConfig(project.slug, {
        desired_retention: ret,
        new_per_session: nps,
        leech_threshold: lt,
        max_interval: mi,
        timerConfigs: tc,
        study_goal: studyGoal,
        listening,
      });
      batch(() => {
        setRetention(ret);
        setNewPerSession(nps);
        setLeechThreshold(lt);
        setMaxInterval(mi);
        setPlayOnFlip(listening.play_on_flip !== false);
        setWeekendMultiplier(weekend);
        setGoalError(null);
        setSaved(true);
      });
      await refreshStudyProgress({ ...project, config: nextConfig });
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { setSaved(false); saveTimer = undefined; }, 1500);
    } catch {
      // Keep local state changes; DB persistence failure is non-critical
    }
  }

  function applyPreset(preset: typeof PRESETS[number]) {
    batch(() => {
      setRetention(preset.retention);
      setMaxInterval(preset.maxInterval);
    });
  }

  async function handleExport() {
    const project = activeProject();
    if (!project) return;
    try {
      const { downloadBackup } = await import('../backup/backup.ts');
      await downloadBackup(project.slug);
      setBackupStatus('Exported!');
      if (backupTimer) clearTimeout(backupTimer);
      backupTimer = setTimeout(() => setBackupStatus(null), 1500);
    } catch {
      setBackupStatus('Export failed');
      if (backupTimer) clearTimeout(backupTimer);
      backupTimer = setTimeout(() => setBackupStatus(null), 2000);
    }
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const { validateBackupFile, restoreBackup } = await import('../backup/backup.ts');
      if (!validateBackupFile(data)) {
        setBackupStatus('Invalid backup file');
        if (backupTimer) clearTimeout(backupTimer);
        backupTimer = setTimeout(() => setBackupStatus(null), 2000);
        return;
      }
      const slug = await restoreBackup(data);
      close();
      openRecentProject(slug);
    } catch {
      setBackupStatus('Import failed');
      if (backupTimer) clearTimeout(backupTimer);
      backupTimer = setTimeout(() => setBackupStatus(null), 2000);
    }
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        class="tips-btn"
        title="FSRS settings"
        role="menuitem"
        aria-haspopup="dialog"
        aria-expanded={activePanel() === 'settings'}
        onClick={handleOpen}
      >Settings</button>
      <Show when={activePanel() === 'settings'}>
        <AnchoredDialog anchor={btnRef} class="settings-dropdown" label="Settings" onDismiss={close}>
              <div class="settings-dialog-header"><span>Settings</span><button type="button" class="keybinds-close" aria-label="Close settings" onClick={close}>&times;</button></div>
              <button type="button" class="settings-export-btn" disabled={exportLabel() !== 'Export'} onClick={async () => {
                const p = activeProject();
                if (!p) return;
                setExportLabel('Exporting…');
                try {
                  const ok = await exportProjectData(p);
                  setExportLabel(ok ? 'Exported!' : 'Failed');
                } catch { setExportLabel('Failed'); }
                setTimeout(() => setExportLabel('Export'), 1500);
              }}>{exportLabel()}</button>
              <div class="settings-backup-divider" />
              <div class="preset-row">
                {PRESETS.map(p => (
                  <button type="button" class={`preset-btn${activePreset() === p.label ? ' active' : ''}`} onMouseEnter={() => applyPreset(p)} onClick={() => applyPreset(p)}>{p.label}</button>
                ))}
              </div>
              <div class="settings-hint">Desired retention is the recall-probability target used by FSRS. Raising it increases review work; it is not a progress percentage.</div>
              <label class="settings-field"><span>Desired retention</span><input type="number" min="0.7" max="0.99" step="0.01" value={retention()} onInput={e => { const v = parseFloat(e.currentTarget.value); setRetention(isNaN(v) ? 0.9 : v); }} /></label>
              <label class="settings-field"><span>Max interval (days)</span><input type="number" min="1" max="365" step="1" value={maxInterval()} onInput={e => { const v = parseInt(e.currentTarget.value, 10); setMaxInterval(isNaN(v) ? 90 : v); }} /></label>
              <label class="settings-field"><span>New cards / day</span><input type="number" min="1" max="10000" step="1" value={newPerSession()} onInput={e => { const v = parseInt(e.currentTarget.value, 10); setNewPerSession(isNaN(v) ? 20 : v); }} /></label>
              <label class="settings-field"><span>Leech threshold</span><input type="number" min="2" max="30" step="1" value={leechThreshold()} onInput={e => { const v = parseInt(e.currentTarget.value, 10); setLeechThreshold(isNaN(v) ? 8 : v); }} /></label>
              <Show when={activeProject()?.config.listening.enabled}>
                <div class="settings-backup-divider" />
                <div class="settings-section-title">Language audio</div>
                <label class="settings-check"><input type="checkbox" checked={playOnFlip()} onChange={e => setPlayOnFlip(e.currentTarget.checked)} /><span>Play the word after every flip</span></label>
              </Show>
              <div class="settings-backup-divider" />
              <div class="settings-section-title">Study window</div>
              <div class="settings-hint">A target date adjusts unseen-card exposure. Due FSRS reviews still come first, and changing this window does not rewrite review history.</div>
              <label class="settings-field settings-date-field"><span>Start date</span><input type="date" value={goalStartDate()} onInput={e => { setGoalStartDate(e.currentTarget.value); setGoalError(null); }} /></label>
              <label class="settings-field settings-date-field"><span>Target date</span><input type="date" value={goalTargetDate()} onInput={e => { setGoalTargetDate(e.currentTarget.value); setGoalError(null); }} /></label>
              <label class="settings-field"><span>Weekend intensity</span><input type="number" min="1" max="4" step="0.25" value={weekendMultiplier()} onInput={e => { const v = parseFloat(e.currentTarget.value); setWeekendMultiplier(isNaN(v) ? 2 : v); setGoalError(null); }} /></label>
              <div class="settings-hint">1 means an even daily load. 2 assigns twice the unseen-card exposure to Saturday and Sunday.</div>
              <Show when={goalTargetDate() && (activeProject()?.sections.length ?? 0) > 1}>
                <div class="settings-hint">Use Merge to apply deck priority across all compatible sections. The daily allowance remains project-wide even when you study one section.</div>
              </Show>
              <Show when={goalError()}><div class="settings-goal-error" role="alert">{goalError()}</div></Show>
              <Show when={progressLoading()}><div class="settings-hint">Calculating deck progress…</div></Show>
              <Show when={studyProgress()} keyed>{progress => (
                <div class="settings-progress" aria-label="Deck progress">
                  <div><span>Unseen</span><strong>{progress.unseen}</strong></div>
                  <div><span>Exposed</span><strong>{progress.exposed}</strong></div>
                  <div><span>Recognized</span><strong>{progress.recognized}</strong></div>
                  <div><span>Due for review</span><strong>{progress.due}</strong></div>
                  <div><span>Estimated retrievability</span><strong>{percent(progress.estimatedRetrievability)}</strong></div>
                  <div><span>Durable retention</span><strong>{progress.durableRetention}</strong></div>
                </div>
              )}</Show>
              <div class="settings-hint">Exposed means seen at least once. Recognized means the card reached FSRS review state. Durable retention requires repeated reviews, a 7-day interval, and estimated retrievability at the desired target.</div>
              <Show when={exposurePlan()} keyed>{plan => (
                <div class={`settings-plan settings-plan-${plan.workload}`}>
                  <Show when={plan.status === 'active'}>
                    Today: {plan.recommendedNew} new + {plan.dueReviews} due ({plan.recommendedTotal} total).
                  </Show>
                  <Show when={plan.status === 'before-start'}>
                    The window starts {plan.startDate}. First-day plan: {plan.firstDayNew} new. Reviews due now: {plan.dueReviews}.
                  </Show>
                  <Show when={plan.status === 'deadline-passed'}>
                    The target date has passed. Update it to recalculate exposure; the daily setting remains the fallback.
                  </Show>
                  <Show when={plan.status === 'complete'}>
                    All active cards have been exposed. Continue due reviews; exposure alone does not mean durable retention.
                  </Show>
                  <Show when={plan.workload === 'high'}><span> This is a high daily workload.</span></Show>
                  <Show when={plan.workload === 'extreme'}><span> This is an extreme daily workload.</span></Show>
                </div>
              )}</Show>
              <button type="button" class="settings-save-btn" onClick={handleSave}>{saved() ? 'Saved' : 'Save'}</button>
              <div class="settings-backup-divider" />
              <div class="settings-hint" style={{ "margin-bottom": "4px" }}>Timer per section</div>
              <div class="preset-row settings-timer-sections">
                <For each={activeProject()?.sections ?? []}>
                  {(sec) => <button type="button" class={`preset-btn${selectedTimerSection() === sec.id ? ' active' : ''}`} onClick={() => selectTimerSection(sec.id)}>{sec.name}</button>}
                </For>
              </div>
              <Show when={selectedTimerSection()}>
                <label class="settings-field"><span>Warn at (s)</span><input type="number" min="5" max="600" step="5" value={timerWarnAt()} onInput={e => { const v = parseInt(e.currentTarget.value, 10); if (!isNaN(v)) updateTimerField('warnAt', v); }} /></label>
                <label class="settings-field"><span>Fail at (s)</span><input type="number" min="10" max="600" step="5" value={timerFailAt()} onInput={e => { const v = parseInt(e.currentTarget.value, 10); if (!isNaN(v)) updateTimerField('failAt', v); }} /></label>
                <Show when={!isTimerDefault()}><button type="button" class="settings-backup-btn" onClick={resetTimerToDefault}>Reset to default</button></Show>
              </Show>
              <div class="settings-backup-divider" />
              <button type="button" class="settings-backup-btn" onClick={handleExport}>Export Backup</button>
              <button type="button" class="settings-backup-btn" onClick={() => backupInput.click()}>Import Backup</button>
              <input ref={backupInput} type="file" accept=".json" class="hidden" onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) { handleImportFile(f); e.currentTarget.value = ''; } }} />
              <Show when={backupStatus()}><div class="settings-backup-status">{backupStatus()}</div></Show>
        </AnchoredDialog>
      </Show>
    </>
  );
}
