// ─── Safety rails, instanced ─────────────────────────────────────────────────
// A guardrail is two bars and a line of posts. It used to be drawn that way
// LITERALLY: one <mesh> per bar and per post, each with its own inline
// geometry and its own inline material — so a 30 m rail was 23 draw calls, 23
// geometries and 23 materials, and a C&I deck with ten rails paid ~230 draw
// calls for furniture the customer never looks at (gap-report item 83).
//
// Now every rail in the project shares TWO meshes: one instanced unit box for
// all the bars, one instanced unit cylinder for all the posts. Scale lives on
// the instance matrix, so one geometry serves every length and height. Two
// draw calls for the whole project, however many rails it has.
//
// The parts are the ones lib/scene-model raycasts — top bar 50 mm at rail
// height, mid bar 35 mm at 55 % of it, 50 mm posts every ~1.5 m. That is the
// scene = engine rule: the shadow on the picture and the loss in the figure
// must come from the same object, and a test pins the two builders together.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { surfaceHeightAt } from '../lib/roof-plane';
import type { Roof, SafetyRail } from '../types';

export interface RailFrame {
  id: string;
  /** rail centre, plan metres (x east, y north) */
  cx: number;
  cy: number;
  /** roof surface height under the centre, metres */
  baseY: number;
  /** length along the rail, metres */
  len: number;
  /** rotation about three's Y that lays the rail along its own line, radians */
  yaw: number;
  /** rail height, metres */
  railH: number;
}

/** top bar section, metres */
const TOP_BAR_M = 0.05;
/** mid bar section, metres */
const MID_BAR_M = 0.035;
/** the mid bar sits at this fraction of the rail height */
const MID_BAR_AT = 0.55;
/** post radius, metres (a 50 mm tube) */
const POST_R_M = 0.025;
/** posts every ~1.5 m, and never fewer than one at each end */
const POST_PITCH_M = 1.5;

function railPostCount(len: number): number {
  return Math.max(2, Math.round(len / POST_PITCH_M) + 1);
}

/**
 * The frame a rail is drawn in: centred on the roof surface under its
 * midpoint, turned along its own line. Plan +y is world −z, so the bearing
 * is negated — the same line lib/scene-model uses to place its casters.
 */
export function railFrameOf(r: SafetyRail, roof: Roof | undefined, eaveProj: number | undefined): RailFrame {
  const cx = (r.a.x + r.b.x) / 2;
  const cy = (r.a.y + r.b.y) / 2;
  return {
    id: r.id,
    cx,
    cy,
    // a rail whose roof is gone still draws, at the default eave, rather than
    // vanishing without a word — the same fallback every other fixture uses
    baseY: roof ? surfaceHeightAt(roof, { x: cx, y: cy }, eaveProj) : 3,
    len: Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y),
    yaw: -Math.atan2(-(r.b.y - r.a.y), r.b.x - r.a.x),
    railH: r.heightMm / 1000,
  };
}

export interface RailPart {
  kind: 'bar' | 'post';
  /** world position, three.js frame (x, up, −north) */
  pos: [number, number, number];
  /** instance scale: bars scale the unit box, posts scale the unit cylinder's height */
  scale: [number, number, number];
  yaw: number;
}

/** The parts one rail is made of, as instance transforms. Pure, so a test can hold it against the engine. */
export function railParts(f: RailFrame): RailPart[] {
  const out: RailPart[] = [];
  const bar = (y: number, t: number) =>
    out.push({ kind: 'bar', pos: [f.cx, f.baseY + y, -f.cy], scale: [f.len, t, t], yaw: f.yaw });
  bar(f.railH, TOP_BAR_M);
  bar(f.railH * MID_BAR_AT, MID_BAR_M);
  const n = railPostCount(f.len);
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  for (let i = 0; i < n; i++) {
    // along the rail's own x, then turned by the yaw about Y — the same
    // transform the old per-rail <group> applied to its children
    const lx = -f.len / 2 + (i * f.len) / (n - 1);
    out.push({
      kind: 'post',
      pos: [f.cx + lx * c, f.baseY + f.railH / 2, -f.cy - lx * s],
      scale: [1, f.railH, 1],
      yaw: f.yaw,
    });
  }
  return out;
}

// One geometry and one material per part kind, for the whole project.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_POST = new THREE.CylinderGeometry(POST_R_M, POST_R_M, 1, 8);
const RAIL_PAINT = new THREE.MeshStandardMaterial({ color: '#c23b3b', metalness: 0.5, roughness: 0.5 });
const POST_STEEL = new THREE.MeshStandardMaterial({ color: '#a8a8a8', metalness: 0.7, roughness: 0.4 });

const UP = new THREE.Vector3(0, 1, 0);

/** Two instanced meshes for every rail given — bars and posts. Exported for the gate test. */
export function buildRailMeshes(rails: RailFrame[]): { bars: THREE.InstancedMesh; posts: THREE.InstancedMesh } | null {
  if (rails.length === 0) return null;
  const parts = rails.flatMap(railParts);
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const make = (kind: RailPart['kind'], geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const list = parts.filter((p) => p.kind === kind);
    const m = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((p, i) => {
      q.setFromAxisAngle(UP, p.yaw);
      pos.set(p.pos[0], p.pos[1], p.pos[2]);
      scl.set(p.scale[0], p.scale[1], p.scale[2]);
      mat.compose(pos, q, scl);
      m.setMatrixAt(i, mat);
    });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = true;
    // instances spread across the site — the unit-geometry bounds are wrong
    m.frustumCulled = false;
    m.userData = { shadowCaster: true };
    return m;
  };
  return { bars: make('bar', UNIT_BOX, RAIL_PAINT), posts: make('post', UNIT_POST, POST_STEEL) };
}

export function RailsInstanced({ rails }: { rails: RailFrame[] }) {
  const meshes = useMemo(() => buildRailMeshes(rails), [rails]);

  // InstancedMesh owns per-instance GPU buffers; the geometry and material are
  // module-level and shared, so only the mesh objects are released here
  useEffect(
    () => () => {
      meshes?.bars.dispose();
      meshes?.posts.dispose();
    },
    [meshes],
  );

  if (!meshes) return null;
  return (
    <>
      <primitive object={meshes.bars} />
      <primitive object={meshes.posts} />
    </>
  );
}
