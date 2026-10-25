const LS_KEY = 'fsrs-global-defaults';

const DEFAULTS = {
  desired_retention: 0.9,
  new_per_session: 20,
  leech_threshold: 8,
  max_interval: 90,
};

export type FSRSDefaults = typeof DEFAULTS;

function loadDefaults(): FSRSDefaults {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* */ }
  return { ...DEFAULTS };
}

export function saveGlobalFSRSDefaults(d: FSRSDefaults) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* */ }
}

export function getGlobalFSRSDefaults(): FSRSDefaults {
  return loadDefaults();
}
