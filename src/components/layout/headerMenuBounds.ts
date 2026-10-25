import type { ViewportLike } from '../overlays/anchoredPosition.ts';

export interface HeaderMenuBounds {
  triggerLeft: number;
  triggerTop: number;
  menuLeft: number;
  menuTop: number;
  menuWidth: number;
  menuMaxHeight: number;
}

/** Keep the fixed study trigger and menu inside the current visual viewport. */
export function calculateHeaderMenuBounds(
  viewport: ViewportLike,
  preferredWidth = 280,
  margin = 8,
): HeaderMenuBounds {
  const triggerInset = 4;
  const triggerSize = 48;
  const triggerToMenuGap = 8;
  const triggerLeft = viewport.left + triggerInset;
  const triggerTop = viewport.top + triggerInset;
  const menuLeft = viewport.left + margin;
  const menuTop = triggerTop + triggerSize + triggerToMenuGap;
  const menuWidth = Math.max(0, Math.min(preferredWidth, viewport.width - margin * 2));
  const menuMaxHeight = Math.max(
    0,
    Math.floor(viewport.top + viewport.height - margin - menuTop),
  );

  return {
    triggerLeft: Math.round(triggerLeft),
    triggerTop: Math.round(triggerTop),
    menuLeft: Math.round(menuLeft),
    menuTop: Math.round(menuTop),
    menuWidth: Math.floor(menuWidth),
    menuMaxHeight,
  };
}
