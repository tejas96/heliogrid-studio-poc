import { describe, expect, it } from 'vitest';
import { metersPerStaticMap, zoomCovering } from '../maps';

describe('zoomCovering — the sharpest satellite tile that still covers the ground', () => {
  // the owner's London site: a 640 px static map spans 70 m at z20, 559 m at z17
  const lat = 42.98;

  it('picks the sharpest zoom whose tile covers what must be covered', () => {
    // tiles here span 559.2 / 279.6 / 139.8 / 69.9 m at z17 / z18 / z19 / z20
    expect(zoomCovering(lat, 300)).toBe(17);
    expect(zoomCovering(lat, 130)).toBe(19);
    expect(zoomCovering(lat, 60)).toBe(20);
    // exactly on a tile's span still counts as covered
    expect(zoomCovering(lat, metersPerStaticMap(lat, 19, 640))).toBe(19);
  });

  it('never returns a tile smaller than asked for', () => {
    for (const needed of [50, 120, 250, 300, 600]) {
      expect(metersPerStaticMap(lat, zoomCovering(lat, needed), 640)).toBeGreaterThanOrEqual(needed);
    }
  });

  it('clamps: never sharper than z20, and stops widening at z14', () => {
    expect(zoomCovering(lat, 1)).toBe(20);
    expect(zoomCovering(lat, 1e6)).toBe(14);
  });

  it('follows the latitude — a tile covers less ground near the poles', () => {
    // 300 m fits in one z18 tile at the equator (382 m) but needs z17 at 60°N
    // (z18 there is only 191 m), so the sharper zoom belongs to the equator
    expect(zoomCovering(0, 300)).toBe(18);
    expect(zoomCovering(60, 300)).toBe(17);
  });
});
