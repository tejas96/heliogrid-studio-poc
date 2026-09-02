import { describe, expect, it } from 'vitest';
import { ACCESS_STOPS, accessHex } from '../shade-ramp';

/**
 * The gate for the defect this scale was written to fix: the legend drew a
 * smooth gradient while the modules were painted in three flat steps, so the
 * key promised something the picture never delivered.
 */
describe('the solar access scale', () => {
  it('lands exactly on the legend stops at the legend labels', () => {
    expect(accessHex(0.85)).toBe(ACCESS_STOPS[0]);
    expect(accessHex(0.95)).toBe(ACCESS_STOPS[1]);
    expect(accessHex(1)).toBe(ACCESS_STOPS[2]);
  });

  it('only ever moves one way — greener as the sun improves', () => {
    const green = (hex: string) => parseInt(hex.slice(3, 5), 16) - parseInt(hex.slice(1, 3), 16);
    let last = -Infinity;
    for (let a = 0.85; a <= 1.0001; a += 0.005) {
      const g = green(accessHex(a));
      expect(g).toBeGreaterThanOrEqual(last - 1);
      last = g;
    }
  });

  it('is a real ramp, not three steps', () => {
    // the old bug: everything from 0.86 to 0.95 was one flat colour
    expect(accessHex(0.87)).not.toBe(accessHex(0.93));
    expect(accessHex(0.96)).not.toBe(accessHex(0.99));
  });

  it('clamps below the scale rather than inventing a colour', () => {
    expect(accessHex(0.2)).toBe(ACCESS_STOPS[0]);
    expect(accessHex(Number.NaN)).toBe(ACCESS_STOPS[2]);
  });
});
