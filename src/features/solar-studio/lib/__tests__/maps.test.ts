import { describe, expect, it } from 'vitest';
import { metersPerStaticMap, pickScaleBar } from '../maps';

describe('pickScaleBar (scale-bar geometry)', () => {
  it('bar px is EXACTLY meters × pxPerM — the bar can never lie about scale', () => {
    for (const pxPerM of [3, 7.5, 12, 30, 80]) {
      const { m, px } = pickScaleBar(pxPerM);
      expect(px).toBeCloseTo(m * pxPerM, 10);
    }
  });

  it('picks the smallest round length wider than the minimum', () => {
    // 10 px/m: 1m=10px, 2m=20px, 5m=50px, 10m=100px → first >56px is 10m
    expect(pickScaleBar(10).m).toBe(10);
    // 30 px/m: 2m=60px → 2m
    expect(pickScaleBar(30).m).toBe(2);
    // 60 px/m: 1m=60px → 1m
    expect(pickScaleBar(60).m).toBe(1);
  });

  it('falls back to the largest candidate when even it is short', () => {
    expect(pickScaleBar(0.5).m).toBe(50); // 50m × 0.5 = 25px, still the max
  });

  it('regression: the old viewport-height factor made a 20% error at 800px', () => {
    // SatCanvas frame at Pune (lat 18.52), zoom 20 tile, 640px, canvas 1000px, UI zoom 1.5
    const spanM = metersPerStaticMap(18.52, 20, 640);
    const pxPerM = (1000 / spanM) * 1.5; // = frame.pxPerM (hit-testing truth)
    const good = pickScaleBar(pxPerM);
    const oldBuggy = pickScaleBar(pxPerM * (800 / 1000)); // what :182 computed
    // the buggy pxPerM drew the SAME labeled length 20% shorter on screen
    expect(oldBuggy.px / oldBuggy.m).toBeCloseTo((good.px / good.m) * 0.8, 6);
  });
});

describe('metersPerStaticMap: the tile ladder is exactly a factor of two', () => {
  // SatCanvas widens its coverage by stepping the tile zoom back and doubling
  // the view zoom to match. That is only a free trade — same ruler, same
  // metres per screen pixel, every traced roof still the size it was — if one
  // zoom step is EXACTLY twice the ground. Bought a bigger picture and moved
  // the geometry if this ever fails.
  const lat = 18.5202; // Pune

  it('one zoom step out doubles the ground the same tile covers', () => {
    for (const z of [20, 19, 18, 17]) {
      expect(metersPerStaticMap(lat, z - 1, 640)).toBeCloseTo(
        metersPerStaticMap(lat, z, 640) * 2,
        9,
      );
    }
  });

  it('a wider tile at the matching view zoom is the same screen ruler', () => {
    // frame.pxPerM = (sizePx / spanM) · zoom, the number every hit test and
    // the scale bar are drawn from
    const pxPerM = (z: number, view: number) => (1000 / metersPerStaticMap(lat, z, 640)) * view;
    expect(pxPerM(19, 3.0)).toBeCloseTo(pxPerM(20, 1.5), 9); // the new default
    expect(pxPerM(17, 12)).toBeCloseTo(pxPerM(20, 1.5), 9); // a ground-mount field
  });
});
