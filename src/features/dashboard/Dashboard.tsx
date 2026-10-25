import { Switch, Match, Show } from 'solid-js';
import { dashboardTab } from './store.ts';
import { TabBar } from './TabBar.tsx';
import { ReviewTabContainer } from './ReviewTabContainer.tsx';
import { StatsTabContainer } from './StatsTabContainer.tsx';
import { ParametersTabContainer } from './ParametersTabContainer.tsx';
import { CreateTab } from './CreateTab.tsx';
import { loadError, failedSlug } from '../launcher/store.ts';
import './dashboard.css';

export function Dashboard() {
  return (
    <div class="db-root">
      <header class="db-header">
        <h1 class="db-logo"><img src="/favicon.svg" alt="" width="48" height="48" />Study Tool</h1>
        <p class="db-subtitle">Practice what matters.</p>
        <TabBar />
      </header>
      <Show when={loadError() && !failedSlug()}>
        <div class="db-error">{loadError()}</div>
      </Show>
      <div class="db-content">
        <Switch>
          <Match when={dashboardTab() === 'review'}>
            <ReviewTabContainer />
          </Match>
          <Match when={dashboardTab() === 'stats'}>
            <StatsTabContainer />
          </Match>
          <Match when={dashboardTab() === 'create'}>
            <CreateTab />
          </Match>
          <Match when={dashboardTab() === 'parameters'}>
            <ParametersTabContainer />
          </Match>
        </Switch>
      </div>
    </div>
  );
}
