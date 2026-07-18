// ─── Shared scene model: ONE geometry source for renderer AND engine ────────
// The 3D view and the shading engine must never disagree about what exists.
// Everything the shading calculation "sees" is built here; the renderer may
// add decoration (context buildings, sun path, labels) but decoration is
// explicitly excluded from engineering results.
import * as THREE from 'three';
import type { Project, Roof, XY } from '../types';
import { computeEaveRefs, isSloped, surfaceHeightAt } from './roof-plane';
import {
  differencePolygons,
  insetPolygonRobust,
  outsetPolygonRobust,
  polygonArea,
  polygonCentroid,
} from './geo';
import { effectiveParapetEdges } from './roof-topology';
import { panelPose } from './panel-pose';
import { castsAnalyticalShadow } from './capabilities';

/**
 * Parapet bands for a roof as extrudable THREE.Shapes, one entry per distinct
 * wall height (per-edge overrides can differ). Respects per-edge enablement
 * and shared-wall suppression (an edge shared with a higher/equal adjacent
 * roof drops its wall — the neighbour's slab IS the wall there).
 *
 * Band construction uses the robust per-edge offsets (insetPolygonRobust /
 * outsetPolygonRobust) — NOT a naive centroid pull, which collapses on
 * concave/L-shaped roofs and buried panels under a full-slab "parapet".
 * Shared by the renderer and the shadow model so the wall a customer sees
 * matches the wall that casts shade.
 */
/**
 * The roof solid as a world-space BufferGeometry: a sloped (or flat) top face
 * over vertical walls down to the ground. Replaces the old flat-only
 * `ExtrudeGeometry(depth: heightM)` — a scalar depth can't tilt the top.
 * World convention: plan (x,y) → (x, heightUp, -y). Flat roofs (pitch 0) yield
 * exactly the old flat box. Shared by the renderer and the shadow model.
 */
export function buildRoofSolidGeometry(roof: Roof, eaveProj?: number): THREE.BufferGeometry {
  const poly = roof.polygon;
  const n = poly.length;
  const top = poly.map(
    (p) => new THREE.Vector3(p.x, surfaceHeightAt(roof, p, eaveProj), -p.y),
  );
  const ground = poly.map((p) => new THREE.Vector3(p.x, 0, -p.y));

  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);

  // top + bottom caps share the plan triangulation
  const contour = poly.map((p) => new THREE.Vector2(p.x, p.y));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [i, j, k] of faces) {
    tri(top[i], top[k], top[j]); // top: up-facing
    tri(ground[i], ground[j], ground[k]); // bottom: down-facing
  }
  // vertical walls, one quad per edge
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(top[i], top[j], ground[j]);
    tri(top[i], ground[j], ground[i]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** World-space outline of the roof TOP ring (for the edge highlight lines). */
export function roofTopRing(roof: Roof, eaveProj?: number): Array<[number, number, number]> {
  return roof.polygon.map((p) => [p.x, surfaceHeightAt(roof, p, eaveProj), -p.y]);
}

export function buildParapetGeometries(
  roof: Roof,
  allRoofs: Roof[],
): Array<{ shape: THREE.Shape; heightM: number }> {
  const p = roof.parapet;
  // A parapet is a flat band at eave height; on a pitched roof the surface
  // rises above it toward the ridge and would swallow the wall. Pitched roofs
  // (metal shed / gable) don't carry parapets anyway, so skip them entirely.
  if (!p.enabled || roof.polygon.length < 3 || isSloped(roof)) return [];
  const edges = effectiveParapetEdges(roof, allRoofs);

  // group enabled edges by their resolved wall height
  const groups = new Map<number, number[]>();
  edges.forEach((e, i) => {
    if (!e.enabled) return;
    const key = Math.round(e.heightM * 1000);
    const arr = groups.get(key) ?? [];
    arr.push(i);
    groups.set(key, arr);
  });

  const toShape = (band: { outer: XY[]; holes: XY[][] }): THREE.Shape => {
    const shape = new THREE.Shape(band.outer.map((q) => new THREE.Vector2(q.x, q.y)));
    for (const h of band.holes) {
      shape.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q.x, q.y))));
    }
    return shape;
  };

  const out: Array<{ shape: THREE.Shape; heightM: number }> = [];
  for (const [key, edgeIdxs] of groups) {
    const heightM = key / 1000;
    const widths = roof.polygon.map((_, i) => (edgeIdxs.includes(i) ? p.widthM : 0));
    // Build the band as a clean boolean difference rather than a THREE.Shape
    // with a hole: when an edge has zero width (suppressed/disabled) the inset
    // touches the outline, and a hole touching the boundary makes THREE emit a
    // spurious spanning triangle across the roof. The difference has no such hole.
    let bands: Array<{ outer: XY[]; holes: XY[][] }>;
    if (p.direction === 'outward') {
      const outset = outsetPolygonRobust(roof.polygon, widths);
      if (outset.length === 0) continue;
      const outer = outset.reduce((a, b) => (polygonArea(a) >= polygonArea(b) ? a : b));
      bands = differencePolygons(outer, [roof.polygon]);
    } else {
      const interior = insetPolygonRobust(roof.polygon, widths);
      bands = differencePolygons(roof.polygon, interior);
    }
    for (const band of bands) out.push({ shape: toShape(band), heightM });
  }
  return out;
}

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ContextBuilding {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tint: string;
}

/**
 * Deterministic DECORATIVE neighbourhood (seeded by location).
 * Visual context only — never part of shading/energy calculations.
 * Real neighbour shading must be modeled by the user as a 'building'
 * obstruction, which IS an engineering object.
 */
export function contextBuildings(project: Project): ContextBuilding[] {
  const loc = project.location;
  if (!loc) return [];
  const seed = Math.abs(Math.sin(loc.latLng.lat * 1000) * 10000);
  const rnd = mulberry32(Math.floor(seed));
  const tints = ['#8d8579', '#9a9287', '#7f7a70', '#948b7d'];
  const out: ContextBuilding[] = [];
  for (let i = 0; i < 14; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = 18 + rnd() * 26;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const w = 5 + rnd() * 9;
    const d = 5 + rnd() * 9;
    const h = 3 + rnd() * 7;
    const tint = tints[Math.floor(rnd() * tints.length)];
    const clear = project.roofs.every((r) => {
      const c = polygonCentroid(r.polygon);
      return Math.hypot(x - c.x, z + c.y) > 14;
    });
    if (!clear) continue;
    out.push({ x, z, w, d, h, tint });
  }
  return out;
}

/**
 * Build the ENGINEERING shadow-caster meshes for a project:
 * roof volumes, parapet rings, and obstructions that cast (per the capability
 * model — castsAnalyticalShadow, not the raw legacy boolean).
 * Obstructions are approximated by their bounding solid (box / cylinder of
 * full height) — conservative for trees, exact for tanks/boxes.
 * Caller must dispose via disposeGroup().
 *
 * `includePanels` (Phase 8 Tier-2) adds the modules themselves as thin slabs
 * at their canonical pose, each tagged `userData.panelId` so a panel's own
 * slab can be excluded from its own rays. OPT-IN per consumer, deliberately:
 *   · shading engine → ON: row-on-row self-shading is real energy loss, and
 *     the scene already draws these shadows (castShadow=true) — off would mean
 *     the render and the numbers disagree.
 *   · roof heatmap  → OFF: it answers "how much sun reaches this ROOF SURFACE"
 *     (a placement question). Counting the panels standing on it would paint
 *     the array's own footprint dark and make the map useless for placement.
 */
export function buildShadowCasters(
  project: Project,
  opts: { includePanels?: boolean } = {},
): {
  group: THREE.Group;
  meshes: THREE.Object3D[];
} {
  const group = new THREE.Group();
  const meshes: THREE.Object3D[] = [];
  // DoubleSide is load-bearing: Raycaster culls by material.side, and rays
  // leaving a panel can exit through BACKFACES (parapet inner walls, roof
  // undersides) — FrontSide silently missed those hits, under-counting shade
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  // shared eave line keeps adjacent same-slope roofs on one continuous plane
  const eaveRefs = computeEaveRefs(project.roofs);

  for (const roof of project.roofs) {
    if (roof.polygon.length < 3) continue;
    const mesh = new THREE.Mesh(buildRoofSolidGeometry(roof, eaveRefs.get(roof.id)), mat);
    // identity travels with every caster: the per-panel inspector attributes
    // each blocked ray to WHAT stopped it (nearest hit), not just "something"
    mesh.userData = { casterKind: 'roof', casterId: roof.id, casterLabel: roof.name };
    group.add(mesh);
    meshes.push(mesh);

    for (const band of buildParapetGeometries(roof, project.roofs)) {
      const pg = new THREE.ExtrudeGeometry(band.shape, {
        depth: band.heightM,
        bevelEnabled: false,
      });
      pg.rotateX(-Math.PI / 2);
      pg.translate(0, roof.heightM, 0);
      const pm = new THREE.Mesh(pg, mat);
      pm.userData = {
        casterKind: 'parapet',
        casterId: roof.id,
        casterLabel: `${roof.name} parapet`,
      };
      group.add(pm);
      meshes.push(pm);
    }
  }

  for (const o of project.obstructions) {
    // the capability model owns this — NOT the legacy boolean (which is only
    // its default). The scene reads the SAME predicate, so what you see cast
    // a shadow is what the numbers priced.
    if (!castsAnalyticalShadow(o)) continue;
    const roof = project.roofs.find((r) => r.id === o.roofId);
    const baseY = roof ? surfaceHeightAt(roof, o.center, eaveRefs.get(roof.id)) : 0;
    let geom: THREE.BufferGeometry;
    if (o.shape === 'circle') {
      geom = new THREE.CylinderGeometry(o.diameterM / 2, o.diameterM / 2, o.heightM, 14);
    } else {
      geom = new THREE.BoxGeometry(o.lengthM, o.heightM, o.widthM);
    }
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(o.center.x, baseY + o.heightM / 2, -o.center.y);
    mesh.rotation.y = (-o.rotationDeg * Math.PI) / 180;
    mesh.userData = { casterKind: 'obstruction', casterId: o.id, casterLabel: o.label };
    group.add(mesh);
    meshes.push(mesh);
  }

  // ── Tier-2: the modules themselves (Phase 8) ─────────────────────────────
  const spec = opts.includePanels ? project.components?.panel : null;
  if (spec) {
    // ONE unit plate, scaled per panel: the plate is the module's real glass
    // outline at its canonical pose (§A0 — same source as the rendered mesh)
    const plate = new THREE.PlaneGeometry(1, 1);
    plate.rotateX(-Math.PI / 2); // lie in the XZ plane, +Y normal
    for (const p of project.panels) {
      if (!p.enabled) continue;
      const roof = project.roofs.find((r) => r.id === p.roofId);
      const surfaceY = roof
        ? surfaceHeightAt(roof, p.center, eaveRefs.get(roof.id))
        : undefined;
      const pose = panelPose(project, p, spec, roof, surfaceY);
      const mesh = new THREE.Mesh(plate, mat);
      mesh.position.set(...pose.position);
      mesh.rotation.set(0, pose.yawRad, 0);
      mesh.rotateX(-pose.tiltRad); // local tilt, exactly as PanelsInstanced composes it
      mesh.scale.set(pose.w, 1, pose.d);
      mesh.userData = {
        panelId: p.id,
        casterKind: 'panel',
        casterId: p.id,
        casterLabel: 'Another panel',
      };
      group.add(mesh);
      meshes.push(mesh);
    }
  }

  group.updateMatrixWorld(true);
  return { group, meshes };
}

export function disposeGroup(group: THREE.Group) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
    }
  });
}
