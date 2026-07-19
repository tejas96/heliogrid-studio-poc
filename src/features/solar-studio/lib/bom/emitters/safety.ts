import type { BomLine } from '../../../types';
import { dist, polygonPerimeter } from '../../geo';
import type { BomContext } from '../context';
import { line, soleSource } from '../line';

export function emitSafety(ctx: BomContext): BomLine[] {
  const { project, rules, pricebook: PRICE_BOOK } = ctx;
  const out: BomLine[] = [];

  const walkwayM2 = project.walkways.reduce((s, w) => s + dist(w.a, w.b) * (w.widthMm / 1000), 0);
  if (walkwayM2 > 0)
    out.push(
      line({
        key: 'safety.walkway',
        category: 'Safety',
        item: 'Walkway',
        spec: 'GRP anti-slip 800mm',
        qty: Math.ceil(walkwayM2),
        unit: 'm²',
        unitPriceInr: PRICE_BOOK.walkwayPerM2,
        formula: `${project.walkways.length} walkway(s), drawn length × width`,
        sourceRoofId: soleSource(project.walkways.map((w) => w.roofId)),
      }),
    );
  const railLenM = project.rails.reduce((s, r) => s + dist(r.a, r.b), 0);
  if (railLenM > 0)
    out.push(
      line({
        key: 'safety.rail',
        category: 'Safety',
        item: 'Safety Rail',
        spec: 'GI 1100mm guard rail',
        qty: Math.ceil(railLenM),
        unit: 'm',
        unitPriceInr: PRICE_BOOK.safetyRailPerM,
        formula: 'Drawn rail length',
        sourceRoofId: soleSource(project.rails.map((r) => r.roofId)),
      }),
    );

  const earth = rules.earthing;
  const roofH = Math.max(3, ...project.roofs.map((r) => r.heightM));
  if (project.arresters.length > 0) {
    // Each arrester drops down ITS OWN roof, not the tallest one on site: on a
    // multi-level building the old max-height rule priced every down conductor
    // as if it fell from the mumty.
    const dropM = project.arresters.reduce((sum, a) => {
      const h = project.roofs.find((r) => r.id === a.roofId)?.heightM ?? roofH;
      return sum + Math.max(3, h) + earth.laGroundRunM;
    }, 0);
    const laRoofId = soleSource(project.arresters.map((a) => a.roofId));
    out.push(
      line({
        key: 'safety.arrester',
        category: 'Safety',
        item: 'Lightning Arrester (ESE)',
        spec: '2m mast, 60m radius',
        qty: project.arresters.length,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.laUnit,
        // ASSUMED coverage: a real LPS layout is IS/IEC 62305 risk-class work
        formula: `${project.arresters.length} placed on canvas — ASSUMED coverage; LPS class/placement per IS/IEC 62305 needs engineer verification`,
        sourceRoofId: laRoofId,
      }),
      line({
        key: 'safety.down_conductor',
        category: 'Safety',
        item: 'LA Down Conductor',
        spec: 'Cu strip 25×3',
        qty: Math.round(dropM),
        unit: 'm',
        unitPriceInr: PRICE_BOOK.downConductorPerM,
        formula: `Σ per arrester (its roof height + ${earth.laGroundRunM} m to pit) over ${project.arresters.length} LA`,
        sourceRoofId: laRoofId,
      }),
    );
  }

  // Earthing serves the whole system (DC + AC + LPS), so no source roof.
  const pits = earth.pitsForSystem + (project.arresters.length > 0 ? earth.pitsForLps : 0);
  out.push(
    line({
      key: 'safety.earth_pit',
      category: 'Safety',
      item: 'Earthing Pits',
      confidence: 'assumed',
      // pits follow what actually needs earthing: DC + AC always, LPS only if
      // an arrester exists (it used to bill 3 even with no arrester on site)
      spec: 'Chemical earthing, 3m electrode',
      qty: pits,
      unit: 'nos',
      unitPriceInr: PRICE_BOOK.earthingPit,
      // The COUNT is a soil-resistivity question (IS 3043) we have no site
      // measurement for. Offer the convention, labelled — never as a derivation.
      formula:
        `${earth.pitsForSystem} system (DC + AC)` +
        (project.arresters.length > 0
          ? ` + ${earth.pitsForLps} LPS`
          : ' (no arrester ⇒ no LPS pit)') +
        ` — ASSUMED convention; electrode count depends on measured soil resistivity (IS 3043), engineer to confirm`,
    }),
    line({
      key: 'safety.earth_strip',
      category: 'Safety',
      item: 'Earthing Strip / Wire',
      spec: 'GI 25×3 + 6 sq.mm Cu',
      confidence: 'assumed',
      qty: Math.round(roofH * earth.stripRunsPerPit * pits + earth.interconnectAllowanceM),
      unit: 'm',
      unitPriceInr: PRICE_BOOK.earthingStripPerM,
      // the old text said "+ interconnects" and hid the number; state it
      formula: `${pits} runs × ${roofH} m roof height + ${earth.interconnectAllowanceM} m ASSUMED interconnect allowance`,
    }),
    line({
      key: 'safety.signage',
      category: 'Safety',
      item: 'Danger Boards & Signage',
      spec: 'CEIG-compliant set',
      qty: 1,
      unit: 'kit',
      unitPriceInr: PRICE_BOOK.signageKit,
      formula: 'Per site kit',
    }),
  );

  // ── Free-field site works (Phase 20c). Only when a ground array exists.
  // A rooftop system is inside a building envelope that already provides the
  // security boundary and the earthing path down the structure; open ground
  // has neither, so both are billed here rather than assumed away.
  const groundAreas = project.roofs.filter((r) => r.roofType === 'ground');
  if (groundAreas.length > 0) {
    const perimeterM = Math.round(
      groundAreas.reduce((sum, r) => sum + polygonPerimeter(r.polygon), 0),
    );
    const groundRoofId = soleSource(groundAreas.map((r) => r.id));
    const defaults = rules.defaults;
    if (defaults.groundFenceEnabled && perimeterM > 0) {
      out.push(
        line({
          key: 'safety.fence',
          category: 'Safety',
          item: 'Perimeter Fencing',
          spec: 'chain-link on HDG posts',
          qty: perimeterM,
          unit: 'm',
          unitPriceInr: PRICE_BOOK.perimeterFencePerM,
          confidence: 'assumed',
          formula: `${perimeterM} m measured around ${groundAreas.length} array boundary${groundAreas.length > 1 ? 'ies' : ''}. Fence type/height is a CLIENT decision — ASSUMED.`,
          sourceRoofId: groundRoofId,
        }),
        line({
          key: 'safety.gate',
          category: 'Safety',
          item: 'Fence Gate',
          spec: 'single vehicle gate',
          qty: groundAreas.length * defaults.groundGatesPerArea,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.fenceGate,
          confidence: 'assumed',
          formula: `${defaults.groundGatesPerArea} per array area — ASSUMED; access strategy is a site decision.`,
          sourceRoofId: groundRoofId,
        }),
      );
    }
    // The strip line above runs conductor DOWN a building (roof height × pits).
    // A ground array has no height to run down — it needs a ring AROUND the
    // array instead. Without this the free-field earthing would bill ~nothing.
    out.push(
      line({
        key: 'safety.ground_earth_ring',
        category: 'Safety',
        item: 'Ground Array Earthing Ring',
        spec: 'GI strip, buried ring around the array',
        qty: perimeterM,
        unit: 'm',
        unitPriceInr: PRICE_BOOK.earthingStripPerM,
        confidence: 'assumed',
        formula: `${perimeterM} m ring following the array boundary. A ground array has no building to run conductor down — ASSUMED convention; ring sizing per IS 3043 and measured soil resistivity, engineer to confirm.`,
        sourceRoofId: groundRoofId,
      }),
    );
  }

  return out;
}
