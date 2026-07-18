// ─── MLPE: per-module optimisers relax series-string grouping ───────────────
// The point of the feature: a multi-face roof (hip/gable) may put every face on
// one string, instead of stranding a face for want of an MPPT.
import { describe, expect, it } from 'vitest';
import { groupPanels, orderGroup } from '../electrical/grouping';
import { fixtureProject } from './fixtures/project';
import type { PlacedPanel, Project, Roof } from '../../types';

// four faces of a hip: same roofs, four different azimuths
const AZ = [180, 90, 0, 270];
function hipProject(mlpe: 'none' | 'optimizer'): Project {
  const base = fixtureProject(0);
  const roofs: Roof[] = AZ.map((az, i) => ({
    ...(base.roofs[0] ?? ({} as Roof)),
    id: `roof_${i}`,
    name: `Face ${i}`,
    polygon: [
      { x: i * 20, y: 0 },
      { x: i * 20 + 10, y: 0 },
      { x: i * 20 + 10, y: 10 },
      { x: i * 20, y: 10 },
    ],
    heightM: 3,
    pitchDeg: 20,
    slopeAzimuthDeg: az,
  }));
  const panels: PlacedPanel[] = [];
  AZ.forEach((az, i) => {
    for (let k = 0; k < 6; k++) {
      panels.push({
        id: `p_${i}_${k}`,
        roofId: `roof_${i}`,
        center: { x: i * 20 + 1 + k * 1.2, y: 5 },
        orientation: 'portrait',
        tiltDeg: 20,
        azimuthDeg: az,
        solarAccess: 1,
        enabled: true,
        cellIndex: k,
        segmentId: `seg_${i}`,
      } as PlacedPanel);
    }
  });
  return { ...base, roofs, panels, components: { ...base.components, mlpe } };
}

describe('groupPanels with MLPE', () => {
  it('without optimisers, four faces split into four groups (a face can strand)', () => {
    const g = groupPanels(hipProject('none'));
    expect(g.length).toBe(4);
    expect(new Set(g.map((x) => x.roofId)).size).toBe(4);
  });

  it('WITH optimisers, the whole array is ONE group — every face can share a string', () => {
    const g = groupPanels(hipProject('optimizer'));
    expect(g.length).toBe(1);
    expect(g[0].panels.length).toBe(24); // all four faces, 6 each
    expect(g[0].key).toBe('mlpe|all');
  });

  it('disabled modules never enter the MLPE group', () => {
    const p = hipProject('optimizer');
    const panels = p.panels.map((x, i) => (i < 3 ? { ...x, enabled: false } : x));
    const g = groupPanels({ ...p, panels });
    expect(g[0].panels.length).toBe(21);
    expect(g[0].panels.every((x) => x.enabled)).toBe(true);
  });
});

describe('orderGroup (multi-face walk)', () => {
  it('walks face-by-face — each roof’s panels stay contiguous, none lost', () => {
    const p = hipProject('optimizer');
    const [group] = groupPanels(p);
    const ordered = orderGroup(group, p.roofs);
    expect(ordered.length).toBe(24);
    // every roof's panels form ONE contiguous run (no hopping between faces)
    const runs: string[] = [];
    for (const panel of ordered) {
      if (runs[runs.length - 1] !== panel.roofId) runs.push(panel.roofId);
    }
    expect(runs.length).toBe(4); // exactly one run per face
    expect(new Set(runs).size).toBe(4);
  });

  it('a single-roof group behaves exactly like the plain serpentine', () => {
    const p = hipProject('none');
    const [group] = groupPanels(p);
    const ordered = orderGroup(group, p.roofs);
    expect(ordered.length).toBe(group.panels.length);
    expect(new Set(ordered.map((x) => x.roofId)).size).toBe(1);
  });
});
