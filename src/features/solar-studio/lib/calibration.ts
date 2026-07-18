// ─── Site calibration: one trusted measurement corrects all traced geometry ─
// Satellite imagery carries a few percent of scale error. The user measures
// one known distance (compound wall, terrace edge) with the measure tool and
// enters its true length; everything traced FROM that imagery — polygons,
// obstruction footprints, panel positions — rescales by k = known/measured
// about the origin, and the image projector span grows by the same factor so
// the corrected geometry still sits exactly on the imagery.
//
// What scales and what does NOT:
//   × plan positions/footprints (traced from the image): roof polygons,
//     obstruction centers + length/width/diameter, panel/segment/keepout/
//     walkway/rail/arrester coordinates
//   ✓ physical, user-entered dimensions stay: heights (roof, obstruction,
//     parapet), setbacks (regulatory), walkway widths, panel spec sizes
import type { Calibration, Project, XY } from '../types';

const scaleXY = (p: XY, k: number): XY => ({ x: p.x * k, y: p.y * k });

/**
 * Rescale every image-traced coordinate by k about the local origin.
 * Returns the patch to apply (undoable at the call site).
 */
export function rescaleProjectGeometry(project: Project, k: number): Partial<Project> {
  if (!Number.isFinite(k) || k <= 0) return {};
  return {
    roofs: project.roofs.map((r) => ({
      ...r,
      polygon: r.polygon.map((p) => scaleXY(p, k)),
    })),
    obstructions: project.obstructions.map((o) => ({
      ...o,
      center: scaleXY(o.center, k),
      lengthM: o.lengthM * k,
      widthM: o.widthM * k,
      diameterM: o.diameterM * k,
    })),
    panels: project.panels.map((p) => ({ ...p, center: scaleXY(p.center, k) })),
    segments: project.segments.map((s) => ({
      ...s,
      polygon: s.polygon.map((p) => scaleXY(p, k)),
    })),
    keepouts: project.keepouts.map((ko) => ({
      ...ko,
      shape: ko.shape.map((p) => scaleXY(p, k)),
    })),
    walkways: project.walkways.map((w) => ({
      ...w,
      a: scaleXY(w.a, k),
      b: scaleXY(w.b, k),
    })),
    rails: project.rails.map((r) => ({ ...r, a: scaleXY(r.a, k), b: scaleXY(r.b, k) })),
    arresters: project.arresters.map((a) => ({ ...a, pos: scaleXY(a.pos, k) })),
  };
}

/**
 * Full calibration patch for "this measured segment is really `knownM` long":
 * rescaled geometry + the updated projector factor + the reference record.
 */
export function applyKnownDistance(
  project: Project,
  a: XY,
  b: XY,
  knownM: number,
): Partial<Project> | null {
  const measured = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(measured > 0.05) || !(knownM > 0.05)) return null;
  const k = knownM / measured;
  const calibration: Calibration = {
    ...project.calibration,
    scaleFactor: project.calibration.scaleFactor * k,
    reference: { a: scaleXY(a, k), b: scaleXY(b, k), knownDistanceM: knownM },
  };
  return { ...rescaleProjectGeometry(project, k), calibration };
}
