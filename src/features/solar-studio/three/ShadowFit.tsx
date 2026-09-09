// ─── The shadow map follows the eye ──────────────────────────────────────────
// One 4096 map was stretched over the whole shadow box — design, neighbours
// and the shadow they throw — whatever the camera was looking at. On a 188 m
// C&I shed that is 46 mm per texel: the ~20 mm gaps between modules, which
// are exactly what a row-shading review reads, fell between texels and the
// array rendered as one grey slab. The map was sharpest on the one view
// nobody reviews shading from — the overview — and coarsest up close.
//
// Every rendered frame, the orthographic shadow camera is fitted to the part
// of the shadow box the view camera can actually see: the box's corners that
// sit inside the view frustum, plus where a grid of view rays enters and
// leaves the box, all taken into the light's own frame. An occluder that
// shades a visible point lies on that point's line towards the light, so it
// lands at the same light-space x/y — the lateral fit loses no caster, and the
// depth range is left as the props set it, covering the whole box. Zoomed
// out, the fit is the old full box, so the overview is unchanged; zoomed in
// on a row, the same 4096 texels cover a few metres and the gaps come back.
//
// Two things stop it shimmering as the camera moves: the extent steps up a
// √2 ladder rather than tracking the view continuously, so the texel size (and
// with it the kernel) only changes at a step, and the box centre snaps to
// whole texels, so a pan slides the map by whole texels and never resamples
// a shadow edge between two.
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Penumbra width in metres — the whole rationale is with the kernel note in Scene3D. */
const SHADOW_PENUMBRA_M = 0.03;

/** Texels of kernel for a given shadow-camera half-extent, clamped to sane bounds. */
export function shadowRadiusTexels(shadowHalfM: number, mapPx = 4096): number {
  const texelM = (2 * shadowHalfM) / mapPx;
  return Math.max(1, Math.min(8, SHADOW_PENUMBRA_M / texelM));
}

/** view rays per axis; 49 box tests a frame is nothing */
const GRID = 7;
/**
 * The smallest box the map is ever fitted to. 6 m over 4096 texels is 1.5 mm
 * a texel — three times finer than the sharpest real penumbra on a roof, and
 * still well above the depth bias, which starts to eat contact shadows when a
 * texel gets much smaller than that.
 */
export const MIN_EXTENT_M = 6;
/** the extent steps by this factor, so the texel size is stable between steps */
const LADDER = Math.SQRT2;
/** past the box on any view ray — the shadow box is never this deep */
const FAR_M = 1e5;

const frustum = new THREE.Frustum();
const projView = new THREE.Matrix4();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const reversed = new THREE.Ray();
const tmp = new THREE.Vector3();
const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const points = Array.from({ length: 8 + GRID * GRID * 2 }, () => new THREE.Vector3());

export interface ShadowFitResult {
  /** side of the square the map covers, metres */
  extentM: number;
  /** metres per texel */
  texelM: number;
  /** how many points of the box the view could see (0 = looking away; the full box was used) */
  seen: number;
}

/**
 * Fit `light`'s shadow camera to what `view` can see of `box`. `halfM` is the
 * old fixed half-extent — the fit never grows past it, and the box centre is
 * kept inside it, so the overview renders exactly as before.
 */
export function fitShadowCamera(
  light: THREE.DirectionalLight,
  view: THREE.Camera,
  box: THREE.Box3,
  halfM: number,
): ShadowFitResult {
  const sc = light.shadow.camera;
  // pose the shadow camera the way three will when it renders the map, so
  // its inverse is the light frame the fit is measured in
  light.updateMatrixWorld();
  light.target.updateMatrixWorld();
  sc.position.setFromMatrixPosition(light.matrixWorld);
  sc.lookAt(tmp.setFromMatrixPosition(light.target.matrixWorld));
  sc.updateMatrixWorld(true);

  view.updateMatrixWorld();
  projView.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projView);

  let n = 0;
  for (let i = 0; i < 8; i++) {
    corners[i].set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    if (frustum.containsPoint(corners[i])) points[n++].copy(corners[i]);
  }
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      ndc.set(((i + 0.5) / GRID) * 2 - 1, ((j + 0.5) / GRID) * 2 - 1);
      raycaster.setFromCamera(ndc, view);
      const ray = raycaster.ray;
      // where the ray enters the box (or the eye itself, when it is inside)…
      if (!ray.intersectBox(box, points[n])) continue;
      n++;
      // …and where it leaves: the same line walked back from far beyond
      reversed.origin.copy(ray.direction).multiplyScalar(FAR_M).add(ray.origin);
      reversed.direction.copy(ray.direction).negate();
      if (reversed.intersectBox(box, points[n])) n++;
    }
  }
  const seen = n;
  if (n === 0) for (let i = 0; i < 8; i++) points[n++].copy(corners[i]);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < n; k++) {
    tmp.copy(points[k]).applyMatrix4(sc.matrixWorldInverse);
    if (tmp.x < minX) minX = tmp.x;
    if (tmp.x > maxX) maxX = tmp.x;
    if (tmp.y < minY) minY = tmp.y;
    if (tmp.y > maxY) maxY = tmp.y;
  }

  const full = 2 * halfM;
  // a little room for the kernel and for the step between frames
  const pad = 0.3 + 0.03 * Math.max(maxX - minX, maxY - minY);
  let extent = Math.max(MIN_EXTENT_M, Math.max(maxX - minX, maxY - minY) + 2 * pad);
  if (extent >= full) extent = full;
  else extent = Math.min(full, MIN_EXTENT_M * Math.pow(LADDER, Math.ceil(Math.log(extent / MIN_EXTENT_M) / Math.log(LADDER))));

  const mapPx = light.shadow.mapSize.x;
  const texelM = extent / mapPx;
  const half = extent / 2;
  // centre on what is seen, kept inside the old full box, then on whole texels
  const clamp = (c: number) => (extent >= full ? 0 : Math.min(halfM - half, Math.max(-halfM + half, c)));
  const cx = Math.round(clamp((minX + maxX) / 2) / texelM) * texelM;
  const cy = Math.round(clamp((minY + maxY) / 2) / texelM) * texelM;

  sc.left = cx - half;
  sc.right = cx + half;
  sc.top = cy + half;
  sc.bottom = cy - half;
  sc.updateProjectionMatrix();
  light.shadow.radius = shadowRadiusTexels(half, mapPx);
  const result = { extentM: extent, texelM, seen };
  light.userData.shadowFit = result;
  return result;
}

/**
 * Keeps `light`'s shadow map fitted to what the camera sees of `box`, every
 * frame that renders. `halfM` is the full half-extent the props set.
 */
export function ShadowFit({
  light,
  box,
  halfM,
}: {
  light: React.RefObject<THREE.DirectionalLight | null>;
  box: THREE.Box3;
  halfM: number;
}) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const l = light.current;
    if (l) fitShadowCamera(l, camera, box, halfM);
  });
  return null;
}
