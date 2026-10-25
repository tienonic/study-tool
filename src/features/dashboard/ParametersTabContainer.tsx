import { createSignal } from 'solid-js';
import { ParametersTab } from './ParametersTab.tsx';
import { getGlobalFSRSDefaults, saveGlobalFSRSDefaults, type FSRSDefaults } from '../../core/store/config.ts';

export function ParametersTabContainer() {
  const [defaults, setDefaults] = createSignal(getGlobalFSRSDefaults());

  function handleSave(d: FSRSDefaults) {
    saveGlobalFSRSDefaults(d);
    setDefaults(d);
  }

  return <ParametersTab defaults={defaults()} onSaveDefaults={handleSave} />;
}
