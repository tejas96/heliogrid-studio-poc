// ─── The gate: the shadow map covers what the eye sees, and no more ─────────
// One 4096 map over the whole shadow box was 46 mm a texel on a 188 m shed —
// the module gaps a row-shading review reads fell between texels. The fit
// must (a) be the old full box from an overview, so nothing regresses there,
// (b) shrink to a few metres on a close-up, with the point looked at inside
// it, and (c) never lose a caster between the light and what is seen.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { fitShadowCamera, MIN_EXTENT_M } from '../ShadowFit';

/** a 188 m shed: the box the map used to be stretched over, plus the sun */
function rig() {
  const half = 113; // max(20, 94 × 1.2 + 8 × 1.5) — Scene3D's rule for r = 94 m
  const box = new THREE.Box3(new THREE.Vector3(-half, -1, -half), new THREE.Vector3(half, 9, half));
  const light = new THREE.DirectionalLight();
  light.shadow.mapSize.set(4096, 4096);
  light.position.set(80, 120, -60); // a morning sun, from the south-east
  light.target.position.set(0, 0, 0);
  const view = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 3000);
  return { half, box, light, view };
}

/** true when a world point lands inside the shadow camera's lateral box */
function covers(light: THREE.DirectionalLight, p: THREE.Vector3): boolean {
  const sc = light.shadow.camera;
  const q = p.clone().applyMatrix4(sc.matrixWorldInverse);
  return q.x >= sc.left && q.x <= sc.right && q.y >= sc.bottom && q.y <= sc.top;
}

describe('fitShadowCamera', () => {
  it('an overview keeps the old full box — the wide shot renders as before', () => {
    const { half, box, light, view } = rig();
    view.position.set(0, 400, 500);
    view.lookAt(0, 0, 0);
    view.updateProjectionMatrix();
    const r = fitShadowCamera(light, view, box, half);
    expect(r.extentM).toBe(2 * half);
    expect(r.texelM * 1000).toBeCloseTo(55.2, 0); // the 46-ish mm the review complained of
    // the old square, centred on the light's target — byte-for-byte the old map
    const sc = light.shadow.camera;
    expect([sc.left, sc.right, sc.bottom, sc.top]).toEqual([-half, half, -half, half]);
  });

  it('a close-up on one row fits a few metres, on the ladder, around what is looked at', () => {
    const { half, box, light, view } = rig();
    // the review pose: a row from four metres up, looking down on it. A view
    // along the rows towards the horizon sees the far side of the box too and
    // must keep it — one map cannot drop the far rows' shadows — so it stays
    // near the full extent; that is the cascade's job, not this fit's.
    const at = new THREE.Vector3(30, 0.5, -20);
    view.position.set(at.x + 1.5, at.y + 4, at.z + 2.5);
    view.lookAt(at);
    view.updateProjectionMatrix();
    const r = fitShadowCamera(light, view, box, half);
    expect(r.extentM).toBeLessThanOrEqual(24);
    expect(r.extentM).toBeGreaterThanOrEqual(MIN_EXTENT_M);
    // on the √2 ladder from MIN_EXTENT_M, so the texel size is stable between steps
    const steps = Math.log(r.extentM / MIN_EXTENT_M) / Math.log(Math.SQRT2);
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
    expect(covers(light, at)).toBe(true);
    // (c) a caster standing between the sun and that point — a 6 m mast 12 m
    // up-sun of it — is still inside the map, because it shares the point's
    // light-space x/y; the depth range is the props' and is not fitted here
    const toSun = light.position.clone().sub(light.target.position).normalize();
    const mast = at.clone().add(toSun.multiplyScalar(12));
    expect(covers(light, mast)).toBe(true);
    // and the texel is an order of magnitude finer than the overview's
    expect(r.texelM).toBeLessThan(0.006);
  });

  it('looking away from the site falls back to the full box rather than an empty map', () => {
    const { half, box, light, view } = rig();
    view.position.set(0, 5, 300);
    view.lookAt(0, 5, 900);
    view.updateProjectionMatrix();
    const r = fitShadowCamera(light, view, box, half);
    expect(r.seen).toBe(0);
    expect(r.extentM).toBe(2 * half);
  });
});
