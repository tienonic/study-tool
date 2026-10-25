import { describe, expect, it } from 'vitest';
import { calculateAnchoredPosition, calculateViewportShift } from './anchoredPosition.ts';

const viewport = { left: 0, top: 0, width: 1000, height: 700 };
const anchor = { left: 100, top: 80, right: 300, bottom: 128, width: 200, height: 48 };

describe('calculateAnchoredPosition', () => {
  it('places a panel to the right when it fits', () => {
    expect(calculateAnchoredPosition(anchor, { width: 320, height: 400 }, viewport)).toEqual({
      left: 306, top: 80, horizontal: 'right', vertical: 'top',
    });
  });

  it('flips left and bottom before allowing viewport escape', () => {
    const edgeAnchor = { left: 850, top: 642, right: 950, bottom: 690, width: 100, height: 48 };
    expect(calculateAnchoredPosition(edgeAnchor, { width: 320, height: 400 }, viewport)).toEqual({
      left: 524, top: 290, horizontal: 'left', vertical: 'bottom',
    });
  });

  it('clamps a wide panel inside a narrow visual viewport', () => {
    const narrow = { left: 12, top: 200, width: 304, height: 360 };
    const position = calculateAnchoredPosition(anchor, { width: 288, height: 344 }, narrow);
    expect(position).toEqual({ left: 20, top: 208, horizontal: 'clamped', vertical: 'clamped' });
  });

  it('honors a visual viewport offset from zoom or an on-screen keyboard', () => {
    const visualViewport = { left: 140, top: 90, width: 500, height: 320 };
    const position = calculateAnchoredPosition(anchor, { width: 320, height: 300 }, visualViewport);
    expect(position.left).toBeGreaterThanOrEqual(148);
    expect(position.top).toBeGreaterThanOrEqual(98);
    expect(position.left + 320).toBeLessThanOrEqual(632);
    expect(position.top + 300).toBeLessThanOrEqual(402);
  });
});

describe('calculateViewportShift', () => {
  it('leaves a contained surface in place', () => {
    expect(calculateViewportShift(
      { left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200 },
      viewport,
    )).toEqual({ x: 0, y: 0 });
  });

  it('shifts an anchored menu back from the right and bottom edges', () => {
    expect(calculateViewportShift(
      { left: 830, top: 490, right: 1030, bottom: 730, width: 200, height: 240 },
      viewport,
    )).toEqual({ x: -38, y: -38 });
  });

  it('honors visual viewport offsets at the top and left edges', () => {
    expect(calculateViewportShift(
      { left: 120, top: 70, right: 320, bottom: 270, width: 200, height: 200 },
      { left: 140, top: 90, width: 500, height: 320 },
    )).toEqual({ x: 28, y: 28 });
  });

  it('rounds fractional corrections inward so scaled surfaces remain contained', () => {
    expect(calculateViewportShift(
      { left: 100, top: 100, right: 300.4, bottom: 692.4, width: 200.4, height: 592.4 },
      viewport,
    )).toEqual({ x: 0, y: -1 });
  });
});
