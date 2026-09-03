import { describe, expect, it } from 'vitest';
import { buildRoofSolidGeometry } from '../scene-model';
import type { Roof } from '../../types';

function plot(heightM: number, pitchDeg = 0): Roof {
  return {
    id: 'r1',
    name: 'Array Area A',
    polygon: [
      { x: -24.17, y: -20.67 },
      { x: 25.84, y: -20.67 },
      { x: 25.84, y: 22.81 },
      { x: -24.17, y: 22.81 },
    ],
    heightM,
    pitchDeg,
    slopeAzimuthDeg: 180,
    roofType: 'rcc',
    parapet: { enabled: false, heightM: 0, edges: [] },
  } as unknown as Roof;
}

/** every triangle, as a winding-independent key */
function triKeys(geo: ReturnType<typeof buildRoofSolidGeometry>): string[] {
  const p = geo.attributes.position.array;
  const n = geo.attributes.position.count;
  const out: string[] = [];
  for (let i = 0; i < n; i += 3) {
    const v: string[] = [];
    for (let k = 0; k < 3; k++) {
      const o = (i + k) * 3;
      v.push(`${p[o].toFixed(3)},${p[o + 1].toFixed(3)},${p[o + 2].toFixed(3)}`);
    }
    out.push(v.sort().join('|'));
  }
  return out;
}

/**
 * The gate for the flicker on every ground-mount site. A plot at ground level
 * was built as a SOLID, so its bottom cap landed on exactly the same plane as
 * its top and the two fought for the depth buffer — white blocks and dashed
 * stipple crawling over the ground as the camera moved.
 */
describe('a plot lying on the ground is a surface, not a solid', () => {
  it('emits the top face alone, with no coincident twin', () => {
    const keys = triKeys(buildRoofSolidGeometry(plot(0)));
    expect(keys).toHaveLength(2); // a rectangle is two triangles
    expect(new Set(keys).size).toBe(keys.length); // nothing coincident
  });

  it('leaves no zero-area triangle behind to wreck the normals', () => {
    const geo = buildRoofSolidGeometry(plot(0));
    const p = geo.attributes.position.array;
    for (let i = 0; i < geo.attributes.position.count; i += 3) {
      const o = i * 3;
      const ax = p[o + 3] - p[o];
      const az = p[o + 5] - p[o + 2];
      const bx = p[o + 6] - p[o];
      const bz = p[o + 8] - p[o + 2];
      expect(Math.abs(ax * bz - az * bx)).toBeGreaterThan(1e-6);
    }
  });

  it('still builds the full solid once the roof has height', () => {
    const keys = triKeys(buildRoofSolidGeometry(plot(3)));
    expect(keys).toHaveLength(12); // 2 top + 2 bottom + 4 walls × 2
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('still builds the full solid for a pitched roof at zero eave', () => {
    // the ridge rises above ground even when the eave sits on it
    expect(triKeys(buildRoofSolidGeometry(plot(0, 20))).length).toBeGreaterThan(2);
  });
});
