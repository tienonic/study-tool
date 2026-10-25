import { createSignal } from 'solid-js';

export function createPopupMenu() {
  const [openItems, setOpenItems] = createSignal<Set<string>>(new Set());

  function open(key: string) {
    setOpenItems(prev => { const s = new Set(prev); s.add(key); return s; });
  }

  function openOnly(key: string) {
    setOpenItems(new Set([key]));
  }

  function toggleOnly(key: string) {
    setOpenItems(prev => prev.has(key) ? new Set<string>() : new Set([key]));
  }

  function openBranch(parentKey: string, childKey: string) {
    setOpenItems(new Set([parentKey, childKey]));
  }

  function close(key: string) {
    setOpenItems(prev => { const s = new Set(prev); s.delete(key); return s; });
  }

  function closeAll() {
    setOpenItems(new Set<string>());
  }

  function isOpen(key: string): boolean {
    return openItems().has(key);
  }

  return { openItems, open, openOnly, openBranch, toggleOnly, close, closeAll, isOpen };
}
