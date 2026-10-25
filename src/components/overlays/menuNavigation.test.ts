import { describe, expect, it } from 'vitest';
import { nextMenuIndex, typeaheadMenuIndex } from './menuNavigation.ts';

describe('menu keyboard navigation', () => {
  it('wraps arrow movement and supports Home and End', () => {
    expect(nextMenuIndex('ArrowDown', 3, 4)).toBe(0);
    expect(nextMenuIndex('ArrowUp', 0, 4)).toBe(3);
    expect(nextMenuIndex('Home', 2, 4)).toBe(0);
    expect(nextMenuIndex('End', 1, 4)).toBe(3);
    expect(nextMenuIndex('Tab', 1, 4)).toBeNull();
  });

  it('cycles typeahead after the current item', () => {
    const labels = ['Home', 'Settings', 'Sections', 'Study tips'];
    expect(typeaheadMenuIndex(labels, 's', 1)).toBe(2);
    expect(typeaheadMenuIndex(labels, 'st', 2)).toBe(3);
    expect(typeaheadMenuIndex(labels, 'z', 0)).toBeNull();
  });
});
