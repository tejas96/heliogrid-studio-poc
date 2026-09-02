import { describe, expect, it } from 'vitest';
import { guessObstructionType, roofMapFit, roofRaisedObjects, roofsAdoptingMap } from '../roof-map-fit';
import type { SurroundHeights } from '../surround-geometry';
import { fixtureRoof } from './fixtures/project';

/** 60 × 60 m at 0.5 m; height from a function of plan (x, y). */
function grid(h: (x: number, y: number) => number): SurroundHeights {
  const cols = 120;
  const rows = 120;
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      heights[r * cols + c] = h(-30 + c * 0.5, 30 - r * 0.5);
    }
  }
  return { cols, rows, originEN: { x: -30, y: 30 }, stepCol: { x: 0.5, y: 0 }, stepRow: { x: 0, y: -0.5 }, heights };
}

const rect = {
  polygon: [
    { x: -10, y: -8 },
    { x: 10, y: -8 },
    { x: 10, y: 8 },
    { x: -10, y: 8 },
  ],
};

describe('roofMapFit — the traced roof as the height map sees it', () => {
  it('reads a flat roof: height = the median, no pitch', () => {
    const fit = roofMapFit(grid(() => 6.4), rect)!;
    expect(fit.heightM).toBe(6.4);
    expect(fit.pitchDeg).toBe(0);
    expect(fit.slopeAzimuthDeg).toBeNull();
    expect(fit.rmseM).toBeLessThan(0.05);
  });

  it('reads a pitched roof: eave at the low corner, pitch and the downslope facing', () => {
    // rises 0.2 m per metre eastward: low side west, slopes down toward the west (270°)
    const fit = roofMapFit(grid((x) => 5 + 0.2 * (x + 10)), rect)!;
    expect(fit.pitchDeg).toBe(11);
    expect(fit.slopeAzimuthDeg).toBe(270);
    expect(fit.heightM).toBeCloseTo(5, 0);
    // the calibration's north offset turns the facing to the compass
    expect(roofMapFit(grid((x) => 5 + 0.2 * (x + 10)), rect, 10)!.slopeAzimuthDeg).toBe(260);
  });

  it('ignores a tank when fitting and reports it as a raised object', () => {
    const tank = (x: number, y: number) => (Math.abs(x - 3) <= 1 && Math.abs(y + 2) <= 0.75 ? 2 : 0);
    const g = grid((x, y) => 6 + tank(x, y));
    const fit = roofMapFit(g, rect)!;
    expect(fit.heightM).toBe(6);
    expect(fit.pitchDeg).toBe(0);
    const objects = roofRaisedObjects(g, rect, fit);
    expect(objects).toHaveLength(1);
    expect(objects[0].heightM).toBeCloseTo(2, 1);
    expect(objects[0].center.x).toBeCloseTo(3, 0);
    expect(objects[0].center.y).toBeCloseTo(-2, 0);
    expect(objects[0].lengthM).toBeCloseTo(2.5, 0);
    expect(guessObstructionType(objects[0])).toBe('tank');
  });

  it('does not report the parapet as an object', () => {
    const parapet = (x: number, y: number) => (Math.abs(x) > 9.4 || Math.abs(y) > 7.4 ? 1 : 0);
    const g = grid((x, y) => 6 + parapet(x, y));
    const fit = roofMapFit(g, rect)!;
    expect(roofRaisedObjects(g, rect, fit)).toEqual([]);
  });
});

describe('roofsAdoptingMap — roofs not set by hand follow the map', () => {
  const g = grid(() => 6.4);
  const parent = fixtureRoof({ id: 'roof_1', polygon: rect.polygon, heightM: 3 });
  // a 2 × 2 m stair room on the parent, 1.5 m above it: too small for the map to read
  const mumty = fixtureRoof({
    id: 'roof_2',
    name: 'Mumty',
    polygon: [
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 3 },
      { x: 1, y: 3 },
    ],
    heightM: 4.5,
  });
  const mine = fixtureRoof({
    id: 'roof_3',
    polygon: [
      { x: -25, y: -25 },
      { x: -15, y: -25 },
      { x: -15, y: -15 },
      { x: -25, y: -15 },
    ],
    heightM: 3,
    heightSource: 'user',
  });

  it('takes the map height, keeps a stair room above its roof, leaves the user’s roof alone', () => {
    const out = roofsAdoptingMap([parent, mumty, mine], g)!;
    expect(out[0].heightM).toBe(6.4);
    expect(out[0].heightSource).toBe('aerial_map');
    expect(out[1].heightM).toBeCloseTo(7.9, 5); // 6.4 + the 1.5 m rise it had
    expect(out[1].heightSource).toBe('aerial_map');
    expect(out[2]).toBe(mine);
    // settled: a second pass changes nothing (the sync must not loop)
    expect(roofsAdoptingMap(out, g)).toBeNull();
  });
});
