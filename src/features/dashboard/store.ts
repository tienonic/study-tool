import { createSignal } from 'solid-js';

export type DashboardTab = 'create' | 'review' | 'stats' | 'parameters';

const [dashboardTab, setDashboardTab] = createSignal<DashboardTab>('review');
export { dashboardTab, setDashboardTab };
