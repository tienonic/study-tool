import { Show, onMount, onCleanup, createSignal } from 'solid-js';
import { appPhase, setAppPhase } from './core/store/app.ts';
import { initWorker, terminateWorker } from './core/hooks/useWorker.ts';
import { openProjectFileFromProjects, openStartupProject } from './features/launcher/store.ts';
import { Dashboard } from './features/dashboard/Dashboard.tsx';
import { StudyApp } from './components/layout/StudyApp.tsx';

export function App() {
  const [startupNotice, setStartupNotice] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      await initWorker();
    } catch {
      // Worker init failed — dashboard will show with empty state
    }
    const params = new URLSearchParams(window.location.search);
    const projectFile = params.get('projectFile') ?? params.get('openProjectFile');
    if (projectFile) {
      const reminder = params.get('studyReminder');
      if (reminder) {
        setStartupNotice(`${reminder}: start with the weakest cards, then hit scenarios.`);
        window.setTimeout(() => setStartupNotice(null), 9000);
      }
      await openProjectFileFromProjects(projectFile, {
        preferredSectionId: params.get('section') ?? undefined,
        forceProjectConfig: params.get('forceProjectConfig') === '1',
      });
    } else if (params.has('learningFile')) {
      setAppPhase('study');
    } else {
      await openStartupProject();
    }
  });
  onCleanup(() => terminateWorker());

  return (
    <>
      <Show when={startupNotice()}>
        {(notice) => <div class="startup-reminder" onClick={() => setStartupNotice(null)}>{notice()}</div>}
      </Show>
      <Show when={appPhase() === 'launcher'}>
        <Dashboard />
      </Show>
      <Show when={appPhase() === 'study'}>
        <StudyApp />
      </Show>
    </>
  );
}
