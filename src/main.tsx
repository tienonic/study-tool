import { render } from 'solid-js/web';
import { App } from './App.tsx';
import './index.css';

async function clearLegacyServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch {
    // Best-effort cleanup only. The app should still boot if Safari blocks this.
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Best-effort cleanup only.
  }
}

clearLegacyServiceWorker().catch(() => {});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

render(() => <App />, root);
