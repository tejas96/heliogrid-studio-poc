// ─── The gate: every walkway in the project is one draw call, standing exactly
// where its own <mesh> used to stand. Each run was a mesh with an inline box
// and an inline material (gap-report item 83, the half the rails left open).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Project, Walkway } from '../../types';
import { computeEaveRefs, surfaceHeightAt } from '../../lib/roof-plane';
import { fixtureProject } from '../../lib/__tests__/fixtures/project';
import { buildWalkwayMesh, walkwayFrameOf } from '../WalkwaysInstanced';

function walkway(id: string, ax: number, ay: number, bx: number, by: number): Walkway {
  return { id, roofId: 'roof_1', a: { x: ax, y: ay }, b: { x: bx, y: by }, widthMm: 600, heightMm: 50 };
}

describe('walkways, instanced', () => {
  it('twenty runs are one mesh, each instance where the old <mesh> stood', () => {
    const runs = Array.from({ length: 20 }, (_, i) =>
      // fanned out, so every yaw and length differs and a swapped axis would show
      walkway(`wk_${i}`, -7 + i * 0.5, -5, 6 - i * 0.6, -5 + i * 0.45),
    );
    const p: Project = { ...fixtureProject(0), walkways: runs };
    const roof = p.roofs[0];
    const eave = computeEaveRefs(p.roofs).get(roof.id);
    const mesh = buildWalkwayMesh(runs.map((w) => walkwayFrameOf(w, roof, eave)))!;
    expect(mesh.count).toBe(20);
    expect(buildWalkwayMesh([])).toBeNull();

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    runs.forEach((w, i) => {
      mesh.getMatrixAt(i, m);
      m.decompose(pos, q, scl);
      // the old per-walkway mesh, verbatim: position [cx, surface + 0.06, -cy],
      // rotation [0, -ang, 0], <boxGeometry args={[len, h, w]} />
      const cx = (w.a.x + w.b.x) / 2;
      const cy = (w.a.y + w.b.y) / 2;
      const ang = Math.atan2(-(w.b.y - w.a.y), w.b.x - w.a.x);
      const old = new THREE.Object3D();
      old.position.set(cx, surfaceHeightAt(roof, { x: cx, y: cy }, eave) + 0.06, -cy);
      old.rotation.set(0, -ang, 0);
      // the instance buffer is float32: a micron is the honest tolerance
      expect(pos.distanceTo(old.position)).toBeLessThan(1e-6);
      expect(Math.abs(q.dot(new THREE.Quaternion().setFromEuler(old.rotation)))).toBeCloseTo(1, 6);
      expect(scl.x).toBeCloseTo(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 5);
      expect(scl.y).toBeCloseTo(0.05, 5);
      expect(scl.z).toBeCloseTo(0.6, 5);
    });
  });
});
