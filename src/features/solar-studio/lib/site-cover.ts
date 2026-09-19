// ─── How much ground the editor has to show ──────────────────────────────────
// SatCanvas has a `coverM` prop that steps the basemap plane back until it
// holds the whole site. It was written, documented, and — measured across the
// repo — passed by NOBODY, so all three 2D editors ran at the default: zoom 20,
// one Static Maps tile, 84.8 m of ground at Indian latitudes. That is the
// number behind the reported defect. A ground-mount plot does not fit in 84.8 m,
// so the user could not trace one, and the largest design the app could hold
// was ~800 kWp however much land the customer had.
//
// This module answers the prop. One derivation, shared by every editor, so the
// three cannot disagree about how big the site is — a canvas that showed a
// different amount of ground per step would move the drawing under the cursor
// when the user walked the wizard.
import type { Project, XY } from '../types';

/**
 * Working margin around the site, as a fraction of its own extent.
 *
 * Not decoration: a boundary traced hard against the edge of the picture cannot
 * be adjusted, because the vertex handle and the setback ring both need ground
 * OUTSIDE the polygon to be drawn in. 35% is about one comfortable drag.
 */
const MARGIN_FRACTION = 0.35;

/**
 * Floor for a site that has nothing drawn on it yet, in metres.
 *
 * A rooftop project starts here and stays here: one zoom-20 tile, the sharpest
 * imagery Google serves, which is exactly the canvas every existing project was
 * drawn on. Keeping the floor at the old default is what makes this change
 * invisible to residential work.
 */
const ROOFTOP_FLOOR_M = 80;

/**
 * Floor for a GROUND MOUNT project with nothing drawn yet.
 *
 * The chicken-and-egg the defect report ran into: the plane is sized from what
 * has been drawn, but the user cannot draw a 6 ha plot they cannot see. A ground
 * mount project therefore OPENS wide, before any geometry exists. 600 m holds
 * about 36 ha — roughly 20 MW of fixed-tilt at Indian ground-cover ratios —
 * which is a working first view rather than a claim about the largest plant the
 * app can carry.
 */
const GROUND_FLOOR_M = 600;

function extend(b: { min: XY; max: XY } | null, p: XY): { min: XY; max: XY } {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return b ?? { min: p, max: p };
  if (!b) return { min: { ...p }, max: { ...p } };
  return {
    min: { x: Math.min(b.min.x, p.x), y: Math.min(b.min.y, p.y) },
    max: { x: Math.max(b.max.x, p.x), y: Math.max(b.max.y, p.y) },
  };
}

/**
 * Bounding box of everything the user has placed, in local metres, or null on
 * an empty project.
 *
 * Deliberately includes obstructions and keepouts and not only roofs: a tree
 * outside the building still has to be reachable to be moved, and a fire lane
 * traced past the roof edge is part of the drawing. Panel centres are included
 * because a segment can be nudged past its surface's boundary, and imagery that
 * stopped at the roof line would put those modules in the void.
 */
function siteBounds(
  project: Pick<Project, 'roofs' | 'keepouts' | 'obstructions' | 'panels'>,
): { min: XY; max: XY } | null {
  let b: { min: XY; max: XY } | null = null;
  for (const r of project.roofs) for (const p of r.polygon) b = extend(b, p);
  for (const k of project.keepouts ?? []) for (const p of k.shape) b = extend(b, p);
  for (const o of project.obstructions ?? []) {
    // the obstruction's own extent, not just its pin: a 12 m shed traced at the
    // edge of the site would otherwise sit half outside the picture
    const reach = Math.max(o.lengthM, o.widthM, o.diameterM) / 2 + o.setbackM;
    b = extend(b, { x: o.center.x - reach, y: o.center.y - reach });
    b = extend(b, { x: o.center.x + reach, y: o.center.y + reach });
  }
  for (const p of project.panels ?? []) b = extend(b, p.center);
  return b;
}

/**
 * Ground the 2D editors must cover for this project, in world metres.
 *
 * Square, because the canvas plane is square and its span is one number. Fed to
 * SatCanvas's `coverM`, which converts it to a basemap plane; `lib/mosaic.ts`
 * then keeps the DETAIL sharp inside that plane, so a bigger answer here costs
 * resolution nowhere. Before the mosaic existed it would have: widening the
 * plane meant one stretched picture at a coarser zoom, which is why nothing
 * dared pass the prop.
 */
export function siteCoverM(
  project: Pick<Project, 'roofs' | 'keepouts' | 'obstructions' | 'panels' | 'info'>,
): number {
  const floor = project.info.groundMount ? GROUND_FLOOR_M : ROOFTOP_FLOOR_M;
  const b = siteBounds(project);
  if (!b) return floor;
  // measured from the site's own centre, so a plot drawn off to one side of the
  // pin is fully held: the plane is centred on the pin, so its half-span must
  // reach the furthest vertex in EVERY direction
  const reach = Math.max(
    Math.abs(b.min.x),
    Math.abs(b.max.x),
    Math.abs(b.min.y),
    Math.abs(b.max.y),
  );
  return Math.max(floor, reach * 2 * (1 + MARGIN_FRACTION));
}
