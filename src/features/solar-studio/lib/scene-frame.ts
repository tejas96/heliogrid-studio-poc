// ─── The ONE frame: where a module actually is, in three's coordinates ──────
// §A0 says the canonical model is the single source of engineering truth and
// the visual mesh is never one. `panelPose` already gives the canonical pose;
// what lived only inside the renderer was the MATRIX built from it — so the
// scene's idea of a module's footprint could drift from `panelCornersOnRoof`
// (the analytical/2D truth) with nothing to notice.
//
// That drift is not hypothetical. It is the most expensive bug class in this
// project, and every instance was caught by EYE rather than by a test:
//   · a tree GLB lifted half its own height by a guessed origin offset
//   · foundations floating one foundation-height above the roof
//   · the structure preview mirrored — the comment said the low edge was on
//     the left, the arithmetic put it on the right
//
// The composition lives here so the renderer and the gate run the SAME code.
// A test that re-derived the matrix would be a second implementation, free to
// agree with itself while both drifted from the model — which is precisely the
// failure it is meant to catch.
import * as THREE from 'three';
import type { XY } from '../types';
import type { PanelPose } from './panel-pose';

const T = new THREE.Matrix4();
const R = new THREE.Matrix4();
const S = new THREE.Matrix4();

/** The subset of a pose the instance matrix needs. */
export interface InstancePose {
  position: [number, number, number];
  yawRad: number;
  tiltRad: number;
}

/**
 * M = T(pos) · Ry(yaw) [· Rx(−tilt)] · T(offset) · S(scale)
 *
 * Reproduces the per-panel mesh nesting exactly; `out` is written in place and
 * returned so hot loops can reuse one Matrix4.
 */
export function panelInstanceMatrix(
  out: THREE.Matrix4,
  p: InstancePose,
  tilt: boolean,
  offset: [number, number, number],
  scale: [number, number, number],
): THREE.Matrix4 {
  out.makeTranslation(p.position[0], p.position[1], p.position[2]);
  out.multiply(R.makeRotationY(p.yawRad));
  if (tilt) out.multiply(R.makeRotationX(-p.tiltRad));
  out.multiply(T.makeTranslation(offset[0], offset[1], offset[2]));
  out.multiply(S.makeScale(scale[0], scale[1], scale[2]));
  return out;
}

/** Corners of the unit box's mid-plane, in the module's own frame. */
const UNIT_CORNERS: [number, number, number][] = [
  [-0.5, 0, -0.5],
  [0.5, 0, -0.5],
  [0.5, 0, 0.5],
  [-0.5, 0, 0.5],
];

/**
 * The four corners of the rendered module, projected back to PLAN (the frame
 * `panelCornersOnRoof` works in).
 *
 * three's z runs opposite the model's y — `panelPose` writes `-center.y` into
 * the position — so the trip back is `y = -z`. Getting that sign wrong is what
 * mirrored the structure preview.
 *
 * A tilted module's plan footprint is SHORTER than its slant length by
 * cos(tilt), which falls out of the rotation rather than being applied by
 * hand: that foreshortening is exactly what the analytical corners carry, and
 * comparing the two is the point of the gate.
 */
export function panelPlanCorners(pose: PanelPose): XY[] {
  const m = panelInstanceMatrix(new THREE.Matrix4(), pose, true, [0, 0, 0], [
    pose.w,
    1,
    pose.d,
  ]);
  const v = new THREE.Vector3();
  return UNIT_CORNERS.map((c) => {
    v.set(c[0], c[1], c[2]).applyMatrix4(m);
    return { x: v.x, y: -v.z };
  });
}
