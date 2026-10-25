import { describe, expect, it } from 'vitest';
import { calculateHeaderMenuBounds } from './headerMenuBounds.ts';

describe('calculateHeaderMenuBounds', () => {
  it('contains the study menu in a visual viewport reduced by 200% zoom', () => {
    const bounds = calculateHeaderMenuBounds({ left: 0, top: 0, width: 400, height: 320 });

    expect(bounds).toEqual({
      triggerLeft: 4,
      triggerTop: 4,
      menuLeft: 8,
      menuTop: 60,
      menuWidth: 280,
      menuMaxHeight: 252,
    });
    expect(bounds.menuTop + bounds.menuMaxHeight).toBe(312);
  });

  it('tracks visual viewport offsets from zoom or an on-screen keyboard', () => {
    const bounds = calculateHeaderMenuBounds({ left: 140, top: 90, width: 500, height: 320 });

    expect(bounds.triggerLeft).toBe(144);
    expect(bounds.triggerTop).toBe(94);
    expect(bounds.menuLeft).toBe(148);
    expect(bounds.menuTop).toBe(150);
    expect(bounds.menuTop + bounds.menuMaxHeight).toBe(402);
  });

  it('shrinks the menu width without crossing narrow viewport margins', () => {
    const bounds = calculateHeaderMenuBounds({ left: 12, top: 0, width: 240, height: 320 });

    expect(bounds.menuLeft).toBe(20);
    expect(bounds.menuWidth).toBe(224);
    expect(bounds.menuLeft + bounds.menuWidth).toBe(244);
  });
});
