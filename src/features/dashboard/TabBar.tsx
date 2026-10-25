import { dashboardTab, setDashboardTab, type DashboardTab } from './store.ts';

const tabs: { id: DashboardTab; label: string }[] = [
  { id: 'review', label: 'Review' },
  { id: 'create', label: 'Create' },
  { id: 'parameters', label: 'Parameters' },
  { id: 'stats', label: 'Stats' },
];

export function TabBar() {
  return (
    <nav class="db-tabs">
      {tabs.map(t => (
        <button
          type="button"
          class={`db-tab ${dashboardTab() === t.id ? 'db-tab--active' : ''}`}
          onClick={() => setDashboardTab(t.id)}
          onFocus={() => setDashboardTab(t.id)}
          onMouseEnter={() => setDashboardTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
