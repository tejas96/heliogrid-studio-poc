// ─── Panel-layout → DXF (Phase 11 · task 30b) ───────────────────────────────
// The permit/engineering deliverable we lacked. Everything is drawn on named
// LAYERS so a drafter can freeze/plot what they need, and in TRUE METRES so
// dimensions taken in CAD equal the model (see lib/dxf.ts on units).
//
// This renders the DESIGN, not a picture of it: every polygon comes from the
// same canonical geometry the layout, shading and BOM engines consume
// (panelCornersOnRoof, roof polygons, obstruction footprints), so the drawing
// can never disagree with the quote.
import type { Project, XY } from '../types';
import { DxfBuilder } from './dxf';
import { panelCornersOnRoof } from './layout';
import { rectCorners, polygonCentroid } from './geo';
import { projectStructures } from './structure';
import { ruleFor } from './foundation';

export const DXF_LAYERS = {
  roof: 'PV-ROOF',
  panels: 'PV-MODULES',
  obstruction: 'PV-OBSTRUCTIONS',
  strings: 'PV-STRINGS',
  walkway: 'PV-WALKWAY',
  text: 'PV-TEXT',
  // ── cabling & earthing layout (task 29e) — one drawing set, layered, so a
  // drafter plots the electrical sheet by freezing the rest
  dcCable: 'PV-DC-CABLE',
  acCable: 'PV-AC-CABLE',
  earth: 'PV-EARTH',
  // ── mounting structure (Phase 22o). The DXF carried modules and roof
  // outlines but not one member, so the file a fabricator or site engineer
  // actually sets out from showed nothing to set out.
  structMembers: 'STRUCT-MEMBERS',
  structLegs: 'STRUCT-LEGS',
  structFootings: 'STRUCT-FOOTINGS',
  dims: 'DIMS',
} as const;

/** Route kind → the layer it is drawn on. */
const ROUTE_LAYER: Record<string, string> = {
  string_homerun: DXF_LAYERS.dcCable,
  inverter_ac: DXF_LAYERS.acCable,
  earth_conductor: DXF_LAYERS.earth,
};

/**
 * Build a DXF of the array layout. Pure — returns the file contents.
 * Disabled modules are excluded: they are not installed, so they are not drawn.
 */
export function layoutToDxf(project: Project): string {
  const d = new DxfBuilder();
  d.addLayer(DXF_LAYERS.roof, 7) // white/black
    .addLayer(DXF_LAYERS.panels, 5) // blue
    .addLayer(DXF_LAYERS.obstruction, 1) // red
    .addLayer(DXF_LAYERS.strings, 3) // green
    .addLayer(DXF_LAYERS.walkway, 8) // grey
    .addLayer(DXF_LAYERS.text, 7)
    .addLayer(DXF_LAYERS.dcCable, 1) // red — DC is the dangerous one
    .addLayer(DXF_LAYERS.acCable, 2) // yellow
    .addLayer(DXF_LAYERS.earth, 4) // cyan
    .addLayer(DXF_LAYERS.structMembers, 8) // grey — the frame
    .addLayer(DXF_LAYERS.structLegs, 6) // magenta — setting-out points
    .addLayer(DXF_LAYERS.structFootings, 30) // orange — what gets cast/placed
    .addLayer(DXF_LAYERS.dims, 7);

  // ── roof faces (each pitched face is its own closed outline) ──────────────
  for (const roof of project.roofs) {
    d.polyline(roof.polygon, DXF_LAYERS.roof, true);
    const c = polygonCentroid(roof.polygon);
    d.text(c, roof.name, DXF_LAYERS.text, 0.6);
  }

  // ── modules ───────────────────────────────────────────────────────────────
  const spec = project.components.panel;
  if (spec) {
    for (const p of project.panels) {
      if (!p.enabled) continue;
      const roof = project.roofs.find((r) => r.id === p.roofId);
      d.polyline(panelCornersOnRoof(p, spec, roof), DXF_LAYERS.panels, true);
    }
  }

  // ── obstructions (the real footprint the layout engine avoided) ───────────
  for (const ob of project.obstructions) {
    if (ob.shape === 'circle') {
      d.circle(ob.center, ob.diameterM / 2, DXF_LAYERS.obstruction);
    } else {
      d.polyline(
        rectCorners(ob.center, ob.lengthM, ob.widthM, ob.rotationDeg),
        DXF_LAYERS.obstruction,
        true,
      );
    }
    d.text(ob.center, ob.label, DXF_LAYERS.text, 0.4);
  }

  // ── walkways ──────────────────────────────────────────────────────────────
  for (const w of project.walkways) {
    d.line(w.a, w.b, DXF_LAYERS.walkway);
  }

  // ── string routes: an OPEN polyline through the modules in series order, so
  // the drawing shows the actual electrical path, not just where glass sits.
  // Each is labelled with its IDENTITY (task 30c: a string-numbering sheet must
  // let an installer find the exact run) — name, inverter/MPPT, module count.
  const byId = new Map(project.panels.map((p) => [p.id, p]));
  for (const s of project.strings) {
    const pts: XY[] = [];
    for (const id of s.panelIds) {
      const p = byId.get(id);
      if (p) pts.push(p.center);
    }
    if (pts.length >= 2) {
      d.polyline(pts, DXF_LAYERS.strings, false);
      d.text(
        pts[0],
        `${s.name} · INV${s.inverterIndex + 1}/MPPT${s.mpptIndex + 1} · ${s.panelIds.length} modules`,
        DXF_LAYERS.text,
        0.4,
      );
    }
  }

  // ── cabling & earthing (task 29e): the ROUTED polylines the BOM was costed
  // from — so the drawing, the cable schedule and the quote are one thing ────
  for (const r of project.cableRoutes ?? []) {
    const layer = ROUTE_LAYER[r.kind];
    if (!layer || r.waypoints.length < 2) continue;
    d.polyline(r.waypoints, layer, false);
  }

  // ── lightning arresters / earth electrodes ────────────────────────────────
  for (const a of project.arresters) {
    d.circle(a.pos, 0.25, DXF_LAYERS.earth);
    d.text(a.pos, 'LA', DXF_LAYERS.text, 0.3);
  }

  drawStructure(d, project);

  return d.toString();
}

/**
 * The mounting structure, in PLAN (Phase 22o).
 *
 * Everything here comes from `projectStructures` — the same member/node graph
 * the 3D scene draws and the BOM prices, so the drawing cannot disagree with
 * either (§A0). Three layers because a drafter plots them separately:
 *
 *   STRUCT-FOOTINGS  what gets cast or placed, at its true footprint
 *   STRUCT-LEGS      setting-out crosses — the points marked on the roof
 *   STRUCT-MEMBERS   rafters, purlins, braces, rails in plan
 *
 * Members are projected to plan: this is a layout drawing, and a leg is a point
 * from above. The elevation that shows leg heights is a separate sheet.
 */
function drawStructure(d: DxfBuilder, project: Project): void {
  for (const s of projectStructures(project)) {
    // members first, so the setting-out marks sit on top of them
    for (const m of s.members) {
      if (m.kind === 'front_leg' || m.kind === 'back_leg') continue; // a point in plan
      d.line({ x: m.a.x, y: m.a.y }, { x: m.b.x, y: m.b.y }, DXF_LAYERS.structMembers);
    }

    const anchors = s.nodes.filter((n) => n.kind === 'roof_anchor');
    const rule = ruleFor(s.foundation, s.foundationShape);
    for (const n of anchors) {
      const c = { x: n.position.x, y: n.position.y };

      // FOOTING at true size — this is the thing someone marks out and casts,
      // so drawing it nominally would be worse than not drawing it at all.
      if (rule.shape === 'circular' && rule.d) {
        d.circle(c, rule.d / 2000, DXF_LAYERS.structFootings);
      } else if (rule.l) {
        d.polyline(
          rectCorners(c, rule.l / 1000, (rule.w ?? rule.l) / 1000, 0),
          DXF_LAYERS.structFootings,
          true,
        );
      }

      // SETTING-OUT cross at the leg centre
      const t = 0.15;
      d.line({ x: c.x - t, y: c.y }, { x: c.x + t, y: c.y }, DXF_LAYERS.structLegs);
      d.line({ x: c.x, y: c.y - t }, { x: c.x, y: c.y + t }, DXF_LAYERS.structLegs);
    }

    // ── DIMS: leg spacing, as LINE + TEXT ────────────────────────────────────
    // Deliberately NOT real DIMENSION entities. Those need a DIMSTYLE table and
    // block references — a large chunk of the DXF spec for no gain here, since
    // lines and text open correctly in every reader.
    const legs = s.members.filter((m) => m.kind === 'front_leg');
    if (legs.length >= 2) {
      const a = { x: legs[0].a.x, y: legs[0].a.y };
      const b = { x: legs[1].a.x, y: legs[1].a.y };
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      if (span > 0.05) {
        d.line(a, b, DXF_LAYERS.dims);
        d.text(
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          `${span.toFixed(2)} m TYP`,
          DXF_LAYERS.dims,
          0.3,
        );
      }
    }
  }
}

/** Suggested filename for the layout drawing. */
export function dxfFileName(project: Project): string {
  const safe = (project.info.name || 'solar-design').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'solar-design'}-layout.dxf`;
}
