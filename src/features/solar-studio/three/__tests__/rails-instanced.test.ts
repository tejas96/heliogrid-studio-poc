// ─── The gate: every rail in the project is two draw calls, and the two
// builders — the scene's instances and the engine's casters — place the same
// bars and posts. A 30 m rail used to be 23 separate meshes with 23 inline
// geometries and 23 inline materials (gap-report item 83).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Project, SafetyRail } from '../../types';
import { buildShadowCasters } from '../../lib/scene-model';
import { computeEaveRefs } from '../../lib/roof-plane';
import { fixtureProject } from '../../lib/__tests__/fixtures/project';
import { buildRailMeshes, railFrameOf, railParts } from '../RailsInstanced';

function rail(id: string, ax: number, ay: number, bx: number, by: number): SafetyRail {
  return { id, roofId: 'roof_1', a: { x: ax, y: ay }, b: { x: bx, y: by }, heightMm: 1100 };
}

function withRails(rails: SafetyRail[]): Project {
  return { ...fixtureProject(0), rails };
}

/** world translation of every instance of a mesh */
function instancePositions(m: THREE.InstancedMesh): THREE.Vector3[] {
  const mat = new THREE.Matrix4();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < m.count; i++) {
    m.getMatrixAt(i, mat);
    out.push(new THREE.Vector3().setFromMatrixPosition(mat));
  }
  return out;
}

describe('safety rails, instanced', () => {
  it('a 30 m rail is 23 parts drawn by exactly two meshes — not 23', () => {
    const p = withRails([rail('rl_1', -15, 0, 15, 0)]);
    const frames = p.rails.map((r) => railFrameOf(r, p.roofs[0], computeEaveRefs(p.roofs).get('roof_1')));
    expect(railParts(frames[0])).toHaveLength(23);
    const meshes = buildRailMeshes(frames)!;
    expect(meshes.bars.count).toBe(2);
    expect(meshes.posts.count).toBe(21);
    // the whole project shares the same two, however many rails it has
    const ten = buildRailMeshes(
      Array.from({ length: 10 }, (_, i) => railFrameOf(rail(`rl_${i}`, -8, -6 + i, 8, -6 + i), p.roofs[0], undefined)),
    )!;
    expect(Object.keys(ten)).toHaveLength(2);
    expect(ten.bars.count).toBe(20);
    expect(ten.posts.count).toBe(10 * 12);
  });

  it('scene = engine: the instances stand where lib/scene-model puts its casters', () => {
    // a diagonal rail, so a dropped sign or a swapped axis cannot hide
    const p = withRails([rail('rl_1', -6, -5, 5, 4)]);
    const eaveRefs = computeEaveRefs(p.roofs);
    const frame = railFrameOf(p.rails[0], p.roofs[0], eaveRefs.get('roof_1'));
    const meshes = buildRailMeshes([frame])!;
    const drawn = [...instancePositions(meshes.bars), ...instancePositions(meshes.posts)];

    const casters = buildShadowCasters(p).meshes.filter((m) => m.userData.casterKind === 'rail');
    expect(casters).toHaveLength(drawn.length);
    let worst = 0;
    for (const c of casters) {
      let best = Infinity;
      for (const d of drawn) best = Math.min(best, c.position.distanceTo(d));
      worst = Math.max(worst, best);
    }
    expect(worst).toBeLessThan(0.001);
    // and the bars are the engine's bars: same length, same section
    const bar = new THREE.Matrix4();
    meshes.bars.getMatrixAt(0, bar);
    const s = new THREE.Vector3().setFromMatrixScale(bar);
    const top = casters.find((m) => (m as THREE.Mesh).geometry instanceof THREE.BoxGeometry) as THREE.Mesh;
    const g = top.geometry as THREE.BoxGeometry;
    expect(s.x).toBeCloseTo(g.parameters.width, 6);
    expect(s.y).toBeCloseTo(g.parameters.height, 6);
  });
});
