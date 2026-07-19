// ─── Procedural steel-section geometry (Phase 22a) ──────────────────────────
// Exact extruded cross-sections built from `SectionDims`. Nothing here is
// authored or AI-generated: a steel section is SPECIFIED, so its vertices are
// known, and generating them keeps the rendered member, the picker preview and
// the SVG glyph all reading from one set of numbers (§A0).
//
// TWO RULES THAT MUST NOT BE RELAXED
//
//  1. `bevelEnabled: false`. A bevel would round the corners and shrink the
//     section — and this geometry is the visual counterpart of a mass we quote.
//
//  2. Geometry is extruded to UNIT length and stretched by scaling the
//     extrusion axis ONLY. The previous renderer drew every member as a scaled
//     unit box, where non-uniform scale is harmless. A C-channel is not: scale
//     it on a cross-section axis and the web thins while the flanges stay put,
//     so the model stops matching the section. Building one ExtrudeGeometry per
//     member instead would allocate thousands of geometries on a large roof.
//     One geometry per profile + per-instance Y scale is the only combination
//     that is both correct and affordable.
import * as THREE from 'three';
import type { SectionDims } from '../types';

const MM = 0.001; // sections are specified in mm; the scene works in metres
const CHS_SEGMENTS = 48;

export interface SectionOutline {
  /** closed ring, mm, CCW */
  outer: { x: number; y: number }[];
  /** inner rings for hollow sections, mm */
  holes: { x: number; y: number }[][];
}

function ring(pts: [number, number][]): { x: number; y: number }[] {
  return pts.map(([x, y]) => ({ x, y }));
}

function circle(r: number, segs = CHS_SEGMENTS): { x: number; y: number }[] {
  return Array.from({ length: segs }, (_, i) => {
    const a = (i / segs) * Math.PI * 2;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

/**
 * THE outline. Every other representation derives from this one function, so a
 * glyph can never show a different section from the model beside it.
 */
export function sectionOutline(d: SectionDims): SectionOutline {
  const { h, t } = d;
  const b = d.b ?? h;
  const lip = d.lip ?? 0;

  switch (d.shape) {
    case 'c': // lipped channel: web + two flanges + two return lips
      return {
        outer: ring([
          [0, 0], [b, 0], [b, lip], [b - t, lip], [b - t, t], [t, t],
          [t, h - t], [b - t, h - t], [b - t, h - lip], [b, h - lip], [b, h], [0, h],
        ]),
        holes: [],
      };

    case 'u': // plain channel: no return lips
      return {
        outer: ring([
          [0, 0], [b, 0], [b, t], [t, t], [t, h - t], [b, h - t], [b, h], [0, h],
        ]),
        holes: [],
      };

    case 'l': // equal angle, legs h × h
      return {
        outer: ring([[0, 0], [h, 0], [h, t], [t, t], [t, h], [0, h]]),
        holes: [],
      };

    case 'z': // flanges oppose across the web
      return {
        outer: ring([
          [0, 0], [b, 0], [b, t], [t, t], [t, h - t], [t - b, h - t], [t - b, h], [0, h],
        ]),
        holes: [],
      };

    case 'hat': // crown on top, two webs down, brims turned out at the base
      return {
        outer: ring([
          [-lip, 0], [t, 0], [t, h - t], [b - t, h - t], [b - t, 0], [b + lip, 0],
          [b + lip, t], [b, t], [b, h], [0, h], [0, t], [-lip, t],
        ]),
        holes: [],
      };

    case 'rhs': // rectangular hollow section
      return {
        outer: ring([[0, 0], [b, 0], [b, h], [0, h]]),
        holes: [ring([[t, t], [t, h - t], [b - t, h - t], [b - t, t]])],
      };

    case 'chs': // round tube — h is the OUTSIDE diameter
      return {
        outer: circle(h / 2),
        holes: [circle(h / 2 - t).slice().reverse()],
      };
  }
}

/** Signed area of a ring (mm²), positive CCW. */
function ringArea(r: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** True enclosed area of the drawn section (mm²) — outer minus holes. */
export function outlineAreaMm2(d: SectionDims): number {
  const o = sectionOutline(d);
  return Math.abs(ringArea(o.outer)) - o.holes.reduce((s, hr) => s + Math.abs(ringArea(hr)), 0);
}

/** Bounding box of the outline, mm — used to centre the section on its axis. */
function outlineBBox(o: SectionOutline) {
  const xs = o.outer.map((p) => p.x);
  const ys = o.outer.map((p) => p.y);
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    w: Math.max(...xs) - Math.min(...xs),
    hh: Math.max(...ys) - Math.min(...ys),
  };
}

/** `THREE.Shape` in METRES, centred on the section's bounding box. */
export function sectionShape(d: SectionDims): THREE.Shape {
  const o = sectionOutline(d);
  const { cx, cy } = outlineBBox(o);
  const toShape = (r: { x: number; y: number }[]) => {
    const path = new THREE.Path();
    r.forEach((p, i) => {
      const x = (p.x - cx) * MM;
      const y = (p.y - cy) * MM;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    path.closePath();
    return path;
  };
  const shape = new THREE.Shape();
  const outer = toShape(o.outer);
  shape.curves = outer.curves;
  shape.holes = o.holes.map(toShape);
  return shape;
}

/**
 * UNIT-LENGTH member geometry, extruded along +Y so it matches the existing
 * `UP → axis` quaternion convention in StructureInstanced. Stretch by scaling
 * Y only (see rule 2 at the top of this file).
 */
export function profileGeometry(d: SectionDims): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(sectionShape(d), { depth: 1, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // extrusion +Z → +Y
  // CENTRE ON THE AXIS. ExtrudeGeometry runs 0 → depth, so after the rotation
  // the geometry spans y ∈ [0, 1] — whereas the BoxGeometry this replaced was
  // centred on the origin. The instancer positions each member at its MIDPOINT,
  // so without this every member renders shifted half its own length along its
  // own axis: purlins visibly shot past the end of the array. Caught by looking
  // at the scene, not by the tests — the unit-length assertion held either way,
  // which is why `isCentredOnAxis` below now pins it.
  g.translate(0, -0.5, 0);
  return g;
}

/** SVG path data for the glyph, in a 0-origin viewBox of `outlineBBox` size. */
export function sectionSvgPath(d: SectionDims): { path: string; w: number; h: number } {
  const o = sectionOutline(d);
  const xs = o.outer.map((p) => p.x);
  const ys = o.outer.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const hh = Math.max(...ys) - minY;
  // SVG y grows downward; flip so the section reads the same way as in 3D
  const draw = (r: { x: number; y: number }[]) =>
    r.map((p, i) => `${i ? 'L' : 'M'}${(p.x - minX).toFixed(2)},${(hh - (p.y - minY)).toFixed(2)}`).join(' ') + ' Z';
  return { path: [o.outer, ...o.holes].map(draw).join(' '), w, h: hh };
}

/** Cache: one geometry per profile key. Callers must NOT dispose these. */
const cache = new Map<string, THREE.ExtrudeGeometry>();

export function cachedProfileGeometry(key: string, d: SectionDims): THREE.ExtrudeGeometry {
  let g = cache.get(key);
  if (!g) {
    g = profileGeometry(d);
    cache.set(key, g);
  }
  return g;
}

/** Release every cached geometry — call on full scene teardown only. */
export function disposeProfileGeometryCache(): void {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
