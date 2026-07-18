// ─── Sibling roof faces stay one buildable roof (S5) ────────────────────────
// A gable/hip is several ADJACENT Roofs. They only describe a real roof while
// they share ONE eave height and ONE pitch. These tests pin what a per-face
// edit is allowed to do: pitch and eave height move the whole group, azimuth
// stays per-face, and a roof with no faceGroupId (every project ever stored)
// behaves exactly as it did before the field existed.
import { describe, expect, it } from 'vitest';
import {
  applyFaceGroupPatch,
  faceGroupMemberIds,
  sharedPart,
  FACE_GROUP_SHARED_KEYS,
} from '../roof-face-group';
import { gableFaces } from '../roof-gable';
import { hipFaces } from '../roof-hip';
import { surfaceHeightAt } from '../roof-plane';
import type { Roof, XY } from '../../types';

// 12 m (E-W) × 8 m (N-S)
const RECT: XY[] = [
  { x: -6, y: -4 },
  { x: 6, y: -4 },
  { x: 6, y: 4 },
  { x: -6, y: 4 },
];

function link(faces: readonly Roof[], faceGroupId = 'fg1'): Roof[] {
  return faces.map((f) => ({ ...f, faceGroupId }));
}

function gable(pitchDeg = 20, eaveHeightM = 3): Roof[] {
  const g = gableFaces({ footprint: RECT, existing: [], pitchDeg, eaveHeightM });
  if (!g.ok) throw new Error(g.reason);
  return link(g.faces);
}

function ridgeStep(faces: Roof[]): number {
  const peak = (f: Roof) =>
    f.polygon.reduce((hi, p) => Math.max(hi, surfaceHeightAt(f, p)), -Infinity);
  const peaks = faces.map(peak);
  return Math.max(...peaks) - Math.min(...peaks);
}

describe('faceGroup propagation', () => {
  it('propagates a pitch edit to every sibling face', () => {
    const faces = gable(20);
    const out = applyFaceGroupPatch(faces, faces[0].id, { pitchDeg: 30 });
    expect(out.roofs.map((r) => r.pitchDeg)).toEqual([30, 30]);
    expect(new Set(out.changedIds)).toEqual(new Set(faces.map((f) => f.id)));
    expect(out.changedIds[0]).toBe(faces[0].id); // target first
  });

  it('propagates an eave-height edit to every sibling face', () => {
    const faces = gable(20, 3);
    const out = applyFaceGroupPatch(faces, faces[1].id, { heightM: 5.5 });
    expect(out.roofs.map((r) => r.heightM)).toEqual([5.5, 5.5]);
    expect(out.changedIds).toHaveLength(2);
  });

  it('keeps the ridge level after a pitch edit — the whole point', () => {
    const faces = gable(20);
    expect(ridgeStep(faces)).toBeLessThan(0.05);
    // the defect: patching ONE face left a step at the ridge
    const oneFace = faces.map((r, i) => (i === 0 ? { ...r, pitchDeg: 30 } : r));
    expect(ridgeStep(oneFace)).toBeGreaterThan(0.5);
    // the fix
    const out = applyFaceGroupPatch(faces, faces[0].id, { pitchDeg: 30 });
    expect(ridgeStep(out.roofs)).toBeLessThan(0.05);
  });

  it('does NOT propagate azimuth — each face genuinely faces its own way', () => {
    const faces = gable(20);
    const before = faces.map((r) => r.slopeAzimuthDeg);
    expect(before[0]).not.toBe(before[1]); // a gable's halves oppose
    const out = applyFaceGroupPatch(faces, faces[0].id, { slopeAzimuthDeg: 95 });
    expect(out.roofs[0].slopeAzimuthDeg).toBe(95);
    expect(out.roofs[1].slopeAzimuthDeg).toBe(before[1]); // sibling untouched
    expect(out.changedIds).toEqual([faces[0].id]);
  });

  it('propagates pitch across all four faces of a hip', () => {
    const h = hipFaces({ footprint: RECT, existing: [], pitchDeg: 22, eaveHeightM: 3 });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const faces = link(h.faces);
    expect(faces).toHaveLength(4);
    const out = applyFaceGroupPatch(faces, faces[2].id, { pitchDeg: 35, heightM: 4 });
    expect(out.roofs.every((r) => r.pitchDeg === 35 && r.heightM === 4)).toBe(true);
    // azimuths still all differ — the hip did not collapse into one plane
    expect(new Set(out.roofs.map((r) => r.slopeAzimuthDeg)).size).toBe(4);
  });

  it('carries non-shared fields to the target face only', () => {
    const faces = gable(20);
    const out = applyFaceGroupPatch(faces, faces[0].id, { pitchDeg: 28, setbackM: 0.9 });
    expect(out.roofs[0].setbackM).toBe(0.9);
    expect(out.roofs[1].setbackM).toBe(faces[1].setbackM); // setback is per-face
    expect(out.roofs[1].pitchDeg).toBe(28);
  });

  it('does not cross groups', () => {
    const a = gable(20);
    const b = link(gable(20), 'fg2');
    const all = [...a, ...b];
    const out = applyFaceGroupPatch(all, a[0].id, { pitchDeg: 40 });
    expect(out.roofs.slice(0, 2).every((r) => r.pitchDeg === 40)).toBe(true);
    expect(out.roofs.slice(2).every((r) => r.pitchDeg === 20)).toBe(true);
  });
});

describe('backwards compatibility — projects with no faceGroupId', () => {
  // Everything ever saved before this field existed. It must behave EXACTLY as
  // it did: a per-roof edit touches exactly one roof.
  function legacyPair(): Roof[] {
    const faces = gableFaces({ footprint: RECT, existing: [], pitchDeg: 20, eaveHeightM: 3 });
    if (!faces.ok) throw new Error(faces.reason);
    return faces.faces.map((f) => ({ ...f })); // no faceGroupId — as stored
  }

  it('a pitch edit touches only the edited roof', () => {
    const roofs = legacyPair();
    expect(roofs.every((r) => r.faceGroupId === undefined)).toBe(true);
    const out = applyFaceGroupPatch(roofs, roofs[0].id, { pitchDeg: 30 });
    expect(out.roofs[0].pitchDeg).toBe(30);
    expect(out.roofs[1].pitchDeg).toBe(20); // untouched, exactly as before
    expect(out.changedIds).toEqual([roofs[0].id]);
  });

  it('a height edit touches only the edited roof', () => {
    const roofs = legacyPair();
    const out = applyFaceGroupPatch(roofs, roofs[1].id, { heightM: 7 });
    expect(out.roofs[1].heightM).toBe(7);
    expect(out.roofs[0].heightM).toBe(3);
  });

  it('returns the identical object for every roof it did not edit', () => {
    const roofs = legacyPair();
    const out = applyFaceGroupPatch(roofs, roofs[0].id, { pitchDeg: 30 });
    expect(out.roofs[1]).toBe(roofs[1]); // same reference — nothing rewritten
  });

  it('adds no key to a roof that had none — stored shape is untouched', () => {
    const roofs = legacyPair();
    const before = JSON.stringify(roofs[1]);
    const out = applyFaceGroupPatch(roofs, roofs[0].id, { pitchDeg: 30, heightM: 4 });
    expect(JSON.stringify(out.roofs[1])).toBe(before);
    expect('faceGroupId' in out.roofs[0]).toBe(false);
  });

  it('a legacy roof is its own group of one', () => {
    const roofs = legacyPair();
    expect(faceGroupMemberIds(roofs, roofs[0].id)).toEqual([roofs[0].id]);
  });
});

describe('serialization is unchanged for stored projects', () => {
  it('an optional absent faceGroupId round-trips byte-identically', () => {
    const g = gableFaces({ footprint: RECT, existing: [], pitchDeg: 20, eaveHeightM: 3 });
    if (!g.ok) throw new Error(g.reason);
    // the factories do NOT stamp the field — only the Step 2 conversion does —
    // so nothing that already exists gains a key on save
    for (const f of g.faces) {
      expect(JSON.parse(JSON.stringify(f))).toEqual(f);
      expect(Object.keys(f)).not.toContain('faceGroupId');
    }
  });
});

describe('shared-key contract', () => {
  it('shares exactly pitch and eave height', () => {
    expect([...FACE_GROUP_SHARED_KEYS]).toEqual(['pitchDeg', 'heightM']);
  });

  it('sharedPart drops per-face fields and absent keys', () => {
    expect(sharedPart({ pitchDeg: 25, slopeAzimuthDeg: 180, setbackM: 0.5 })).toEqual({
      pitchDeg: 25,
    });
    expect(sharedPart({ polygon: RECT })).toEqual({});
  });

  it('an unknown roof id is a no-op', () => {
    const faces = gable(20);
    const out = applyFaceGroupPatch(faces, 'nope', { pitchDeg: 40 });
    expect(out.roofs).toBe(faces);
    expect(out.changedIds).toEqual([]);
  });
});
