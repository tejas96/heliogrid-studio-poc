import { describe, expect, it } from 'vitest';
import { applyKnownDistance, rescaleProjectGeometry } from '../calibration';
import { buildSunSamples } from '../shading';
import { polygonArea } from '../geo';
import { computeEnergyReport } from '../solar';
import { deriveBom } from '../bom';
import { geometryFp } from '../fingerprints';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';

function proj(): Project {
  return {
    ...fixtureProject(8),
    location: {
      address: 'Pune, MH',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

describe('known-distance calibration (round-trip gate)', () => {
  // the plan's canonical scenario: a drawn 9.60 m edge is REALLY 10.00 m
  const a = { x: 0, y: 0 };
  const b = { x: 9.6, y: 0 };
  const k = 10 / 9.6;

  it('rescales every traced coordinate by k; physical dimensions stay', () => {
    const p: Project = {
      ...proj(),
      obstructions: [
        {
          id: 'obs_1',
          type: 'tank',
          label: 'WT1',
          roofId: 'roof_1',
          center: { x: 4, y: 2 },
          shape: 'circle',
          lengthM: 0,
          widthM: 0,
          diameterM: 1.5,
          heightM: 1.2,
          rotationDeg: 0,
          setbackM: 0.3,
          castsShadow: true,
          blocksPlacement: true,
        },
      ],
    };
    const patch = applyKnownDistance(p, a, b, 10)!;
    const roof = patch.roofs![0];
    // polygon scaled by k about the origin
    expect(roof.polygon[1].x).toBeCloseTo(p.roofs[0].polygon[1].x * k, 9);
    // areas scale by k²
    expect(polygonArea(roof.polygon)).toBeCloseTo(polygonArea(p.roofs[0].polygon) * k * k, 6);
    // traced obstruction footprint scales; HEIGHT (physical) does not
    const o = patch.obstructions![0];
    expect(o.center.x).toBeCloseTo(4 * k, 9);
    expect(o.diameterM).toBeCloseTo(1.5 * k, 9);
    expect(o.heightM).toBe(1.2);
    // regulatory setbacks and parapet dims stay
    expect(roof.setbackM).toBe(p.roofs[0].setbackM);
    expect(roof.parapet.heightM).toBe(p.roofs[0].parapet.heightM);
    // panel centers scale, count unchanged
    expect(patch.panels!.length).toBe(p.panels.length);
    expect(patch.panels![0].center.x).toBeCloseTo(p.panels[0].center.x * k, 9);
    // projector factor accumulates and the reference is recorded (rescaled)
    expect(patch.calibration!.scaleFactor).toBeCloseTo(k, 9);
    expect(patch.calibration!.reference!.knownDistanceM).toBe(10);
    const ref = patch.calibration!.reference!;
    expect(Math.hypot(ref.b.x - ref.a.x, ref.b.y - ref.a.y)).toBeCloseTo(10, 9);
  });

  it('capacity is unchanged; roof area & energy recalculate consistently', () => {
    const p = proj();
    const before = computeEnergyReport(p);
    const after = computeEnergyReport({ ...p, ...applyKnownDistance(p, a, b, 10) });
    expect(after.capacityKwp).toBe(before.capacityKwp); // count × watt, not area
    expect(after.panelCount).toBe(before.panelCount);
    // the report rounds areas to whole m² — allow that rounding
    expect(after.roofAreaM2).toBeCloseTo(before.roofAreaM2 * k * k, 0);
  });

  it('BOM quantities re-derive from the rescaled geometry without error', () => {
    const p = proj();
    const rescaled = { ...p, ...applyKnownDistance(p, a, b, 10) } as Project;
    const bom = deriveBom(rescaled);
    expect(bom.length).toBeGreaterThan(5);
    for (const line of bom) expect(Number.isFinite(line.qty)).toBe(true);
  });

  it('calibration invalidates geometryFp (everything downstream recalculates)', () => {
    const p = proj();
    const rescaled = { ...p, ...applyKnownDistance(p, a, b, 10) } as Project;
    expect(geometryFp(rescaled)).not.toBe(geometryFp(p));
  });

  it('a second calibration composes: factors multiply', () => {
    const p = proj();
    const once = { ...p, ...applyKnownDistance(p, a, b, 10) } as Project;
    const twice = {
      ...once,
      ...applyKnownDistance(once, { x: 0, y: 0 }, { x: 10, y: 0 }, 10.5),
    } as Project;
    expect(twice.calibration.scaleFactor).toBeCloseTo(k * 1.05, 9);
  });

  it('rejects degenerate input', () => {
    const p = proj();
    expect(applyKnownDistance(p, a, a, 10)).toBeNull(); // zero-length segment
    expect(applyKnownDistance(p, a, b, 0)).toBeNull();
    expect(rescaleProjectGeometry(p, NaN)).toEqual({});
    expect(rescaleProjectGeometry(p, -1)).toEqual({});
  });
});

describe('north-offset propagation (gate)', () => {
  it('rotates every engine sun sample by exactly the offset about the vertical', () => {
    const base = buildSunSamples(18.52, 73.86, 0);
    const rotated = buildSunSamples(18.52, 73.86, 90);
    expect(rotated.length).toBe(base.length);
    for (let i = 0; i < base.length; i++) {
      const b0 = base[i].dir;
      const r0 = rotated[i].dir;
      // azimuth + 90° in the scene mapping (x=cosAlt·sin az, z=−cosAlt·cos az):
      // x' = −z, z' = x ; altitude (y) unchanged; weight unchanged
      expect(r0.x).toBeCloseTo(-b0.z, 10);
      expect(r0.z).toBeCloseTo(b0.x, 10);
      expect(r0.y).toBeCloseTo(b0.y, 10);
      expect(rotated[i].weight).toBeCloseTo(base[i].weight, 12);
    }
  });

  it('offset 0 is exactly the uncalibrated engine (no behavior drift)', () => {
    const a0 = buildSunSamples(18.52, 73.86);
    const b0 = buildSunSamples(18.52, 73.86, 0);
    expect(a0.length).toBe(b0.length);
    for (let i = 0; i < a0.length; i++) {
      expect(a0[i].dir.toArray()).toEqual(b0[i].dir.toArray());
    }
  });
});
