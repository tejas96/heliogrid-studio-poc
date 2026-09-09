// ─── Walkways, instanced ─────────────────────────────────────────────────────
// Every walkway was its own <mesh> with its own inline box geometry and its
// own inline material — one draw call, one geometry and one material per run,
// on the C&I decks that have twenty of them (gap-report item 83, the half
// that the rails commit left open).
//
// Now every walkway in the project is ONE instanced unit box over one shared
// material; length, height and width live on the instance matrix. Twenty
// runs, one draw call. The placement is exactly the old mesh's — centre on
// the roof surface plus the deck lift, turned along its own line — and a test
// holds the instances against that arithmetic. The engine has no walkway
// caster (a 50 mm tread shades nothing), so there is no scene = engine pair to
// keep here; the slab still casts in the picture, as it always did.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { surfaceHeightAt } from '../lib/roof-plane';
import type { Roof, Walkway } from '../types';

export interface WalkwayFrame {
  id: string;
  /** slab centre, plan metres (x east, y north) */
  cx: number;
  cy: number;
  /** slab centre height, metres — the deck under it plus DECK_LIFT_M */
  y: number;
  /** length along the run, metres */
  len: number;
  /** rotation about three's Y that lays the run along its own line, radians */
  yaw: number;
  /** slab height, metres */
  h: number;
  /** slab width, metres */
  w: number;
}

/**
 * The slab's CENTRE sits this far above the deck. Inherited from the old
 * per-walkway mesh (`surfAt(...) + 0.06`): it keeps the tread clear of the
 * roof texture it lies on, and moving it would change every existing picture.
 */
const DECK_LIFT_M = 0.06;

/** The frame a walkway is drawn in — the old <mesh>'s position, rotation and box, as numbers. */
export function walkwayFrameOf(wk: Walkway, roof: Roof | undefined, eaveProj: number | undefined): WalkwayFrame {
  const cx = (wk.a.x + wk.b.x) / 2;
  const cy = (wk.a.y + wk.b.y) / 2;
  return {
    id: wk.id,
    cx,
    cy,
    // a run whose roof is gone still draws, at the default eave, like the rails
    y: (roof ? surfaceHeightAt(roof, { x: cx, y: cy }, eaveProj) : 3) + DECK_LIFT_M,
    len: Math.hypot(wk.b.x - wk.a.x, wk.b.y - wk.a.y),
    // plan +y is world −z, so the bearing is negated
    yaw: -Math.atan2(-(wk.b.y - wk.a.y), wk.b.x - wk.a.x),
    h: wk.heightMm / 1000,
    w: wk.widthMm / 1000,
  };
}

// one geometry and one material for every walkway in the project
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const TREAD = new THREE.MeshStandardMaterial({ color: '#d9a410', roughness: 0.75 });

const UP = new THREE.Vector3(0, 1, 0);

/** One instanced mesh for every walkway given. Exported for the gate test. */
export function buildWalkwayMesh(walkways: WalkwayFrame[]): THREE.InstancedMesh | null {
  if (walkways.length === 0) return null;
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const m = new THREE.InstancedMesh(UNIT_BOX, TREAD, walkways.length);
  walkways.forEach((f, i) => {
    q.setFromAxisAngle(UP, f.yaw);
    pos.set(f.cx, f.y, -f.cy);
    scl.set(f.len, f.h, f.w);
    mat.compose(pos, q, scl);
    m.setMatrixAt(i, mat);
  });
  m.instanceMatrix.needsUpdate = true;
  m.castShadow = true;
  m.receiveShadow = true;
  // instances spread across the site — the unit-geometry bounds are wrong
  m.frustumCulled = false;
  return m;
}

export function WalkwaysInstanced({ walkways }: { walkways: WalkwayFrame[] }) {
  const mesh = useMemo(() => buildWalkwayMesh(walkways), [walkways]);

  // the mesh owns per-instance GPU buffers; geometry and material are shared
  useEffect(() => () => mesh?.dispose(), [mesh]);

  return mesh ? <primitive object={mesh} /> : null;
}
