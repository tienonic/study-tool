import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createPopupMenu } from './createHoverMenu.ts';

describe('createPopupMenu', () => {
  it('keeps one parent-child branch open and closes a sibling branch', () => {
    createRoot(dispose => {
      const menu = createPopupMenu();
      menu.openBranch('ai', 'language');
      expect([...menu.openItems()]).toEqual(['ai', 'language']);

      menu.openBranch('ai', 'academic');
      expect([...menu.openItems()]).toEqual(['ai', 'academic']);
      expect(menu.isOpen('language')).toBe(false);
      dispose();
    });
  });
});
