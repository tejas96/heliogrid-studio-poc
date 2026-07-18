import { describe, expect, it } from 'vitest';
import { computeSolarAccess, computePanelShadeDetail } from '../shading';
import { fixtureProject } from './fixtures/project';
import type { PlacedPanel, Project, Roof } from '../../types';

// S2 (found by EPC review): rays were cast from 0.11 m above the face and the
// module's own ROOF solid was a caster. When the sun sits BEHIND the module's
// plane the ray descends into that roof and the hour scored as shaded — but
// solar.ts then multiplies by poaBeamRatio, which has already zeroed exactly
// those hours. The same physics was priced twice, worst on a gable's north
// face (which this tool produces on every gable).
//
// The invariant: solarAccess answers "of the hours that could light this
// module, how many are unshaded". Orientation is poaBeamRatio's job.

function face(id: string, az: number): Roof {
  return {
    id, name: id,
    polygon: [{ x: -6, y: -5 }, { x: 6, y: -5 }, { x: 6, y: 5 }, { x: -6, y: 5 }],
    roofType: 'rcc_flat', heightM: 3, pitchDeg: 25, slopeAzimuthDeg: az,
    setbackM: 0.3, perEdgeSetbacksM: null,
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
}

const panel = (id: string, roofId: string, az: number, tilt = 25): PlacedPanel => ({
  id, roofId, center: { x: 0, y: 0 }, orientation: 'portrait',
  azimuthDeg: az, tiltDeg: tilt, solarAccess: 1, enabled: true,
});

function sited(roofs: Roof[], panels: PlacedPanel[]): Project {
  return {
    ...fixtureProject(0),
    location: {
      address: 'Pune', latLng: { lat: 18.52, lng: 73.86 }, confirmed: true,
      irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate',
    } as Project['location'],
    roofs, panels, segments: [], strings: [], obstructions: [],
  };
}

describe('solar access is unshaded-fraction, NOT an orientation penalty', () => {
  for (const [name, az] of [['south', 180], ['east', 90], ['west', 270], ['north', 0]] as const) {
    it(`an unobstructed ${name}-facing 25° face reports full access`, () => {
      const p = sited([face('r', az)], [panel('p', 'r', az)]);
      expect(computeSolarAccess(p).get('p')!).toBeCloseTo(1, 6);
    });
  }

  it('holds across pitches, so long as the module is FLUSH to its face', () => {
    for (const pitch of [10, 25, 35]) {
      const f = { ...face('r', 0), pitchDeg: pitch };
      const p = sited([f], [panel('p', 'r', 0, pitch)]);
      expect(computeSolarAccess(p).get('p')!, `north @ ${pitch}°`).toBeCloseTo(1, 6);
    }
  });

  it('a module NOT flush to its roof is still shaded by that roof (real, not the bug)', () => {
    // 40° module on a 25° north face: the roof rises toward the ridge and
    // genuinely blocks southern sun. The fix must not paper over this.
    const p = sited([face('r', 0)], [panel('p', 'r', 0, 40)]);
    expect(computeSolarAccess(p).get('p')!).toBeLessThan(0.9);
  });

  it('real shade still registers — the fix must not blind the engine', () => {
    const p = sited([face('r', 180)], [panel('p', 'r', 180)]);
    const shaded: Project = {
      ...p,
      obstructions: [{
        id: 'o1', type: 'water_tank', label: 'WT1', roofId: 'r',
        center: { x: 0, y: -3 }, shape: 'rect', lengthM: 8, widthM: 4,
        diameterM: 2, heightM: 6, rotationDeg: 0, setbackM: 0.3,
        castsShadow: true, blocksPlacement: true,
      } as unknown as Project['obstructions'][number]],
    };
    expect(computeSolarAccess(shaded).get('p')!).toBeLessThan(0.95);
  });

  it('the per-panel inspector agrees with the bulk engine (one engine, two readouts)', () => {
    const p = sited([face('r', 0)], [panel('p', 'r', 0)]);
    const bulk = computeSolarAccess(p).get('p')!;
    expect(computePanelShadeDetail(p, 'p')!.access).toBeCloseTo(bulk, 10);
  });
});
