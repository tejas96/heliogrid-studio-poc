// ─── Gate: the same op over many tables lands on ALL of them ────────────────
// Every segment op returns a WHOLE rebuilt `segments` array. A caller looping
// previewOp against the SAME project — which is what a loop over `ops.run`
// inside one event handler does, because the render closure's project never
// changes mid-handler — rebuilds that array from the ORIGINAL each time, and
// the store's shallow merge keeps only the last patch. Twelve tables asked,
// one table changed, twelve undo entries spent. This test pins the difference.
import { describe, expect, it } from 'vitest';
import type { ArraySegment, Project } from '../../types';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { STRUCTURE_PROFILES } from '../segment-ops';
import { previewMany, previewOp } from '../ops/run';
import { segmentSetTilt } from '../ops/layout-ops';
import { fixtureProject, fixtureRoof } from './fixtures/project';

/** Two tilted tables on one roof, at different tilts, so "set all to 20" moves both. */
function twoTables(): Project {
  const base: Project = {
    ...fixtureProject(0),
    roofs: [fixtureRoof()],
    obstructions: [],
    walkways: [],
    keepouts: [],
    panels: [],
    segments: [],
    strings: [],
  };
  const a = fillRoofAsSegment(base, base.roofs[0], base.components.panel!, DEFAULT_FILL)!;
  // a second segment sharing the roof: same shape, its own id and its own panels
  const b = {
    segment: { ...a.segment, id: 'seg_b', label: 'B' },
    panels: a.panels.map((p, i) => ({ ...p, id: `pb_${i}`, segmentId: 'seg_b' })),
  };
  const tilted: ArraySegment[] = [a.segment, b.segment].map((s) => ({
    ...s,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 0,
      frontLegM: 0.3,
      backLegM: 0.7,
      profile: STRUCTURE_PROFILES[0],
    },
  }));
  return { ...base, segments: tilted, panels: [...a.panels, ...b.panels] };
}

const tiltsOf = (p: Project) =>
  p.segments.map((s) => (s.racking.kind !== 'flush' ? s.racking.tiltDeg : null));

describe('previewMany', () => {
  it('a naive loop against the SAME project changes only the last table', () => {
    const p = twoTables();
    // exactly what `for (const id of ids) ops.run(...)` does
    let merged: Partial<Project> = {};
    for (const id of ['seg_1', 'seg_b']) {
      const r = previewOp(p, segmentSetTilt, { segmentId: id, tiltDeg: 20 });
      if (r.ok) merged = { ...merged, ...r.patch };
    }
    const after = { ...p, ...merged } as Project;
    const changed = tiltsOf(after).filter((t) => t === 20).length;
    expect(changed).toBe(1); // the bug, pinned
  });

  it('previewMany chains, so every table lands — as ONE patch', () => {
    const p = twoTables();
    const ids = p.segments.map((s) => s.id);
    const r = previewMany(
      p,
      segmentSetTilt,
      ids.map((segmentId) => ({ segmentId, tiltDeg: 20 })),
      'Set tilt to 20°',
    );
    expect(r.ok).toBe(true);
    expect(r.applied).toBe(2);
    expect(r.refusals).toEqual([]);
    expect(tiltsOf(r.next)).toEqual([20, 20]);
    // one patch, one undo entry, one sentence
    expect(r.impact.label).toBe('Set tilt to 20°');
    const after = { ...p, ...r.patch } as Project;
    expect(tiltsOf(after)).toEqual([20, 20]);
  });

  it('reports refusals instead of swallowing them', () => {
    const p = twoTables();
    const r = previewMany(p, segmentSetTilt, [
      { segmentId: p.segments[0].id, tiltDeg: 20 },
      { segmentId: 'seg_missing', tiltDeg: 20 },
    ]);
    expect(r.ok).toBe(true); // one landed
    expect(r.applied).toBe(1);
    expect(r.refusals).toHaveLength(1);
    expect(r.refusals[0].index).toBe(1);
    expect(r.refusals[0].reason).toBeTruthy();
  });
});
