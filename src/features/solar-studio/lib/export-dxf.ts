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
    .addLayer(DXF_LAYERS.earth, 4); // cyan

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

  return d.toString();
}

/** Suggested filename for the layout drawing. */
export function dxfFileName(project: Project): string {
  const safe = (project.info.name || 'solar-design').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '');
  return `${safe || 'solar-design'}-layout.dxf`;
}
