import type { BomLine } from '../../../types';
import { PRICE_BOOK } from '../../../data/pricebook';
import { STRUCTURE_DISCLAIMER } from '../../structure';
import type { BomContext, SlopedCovering } from '../context';
import { line, soleSource } from '../line';

/**
 * Flush-mount hardware per covering. This table is the whole point of making
 * `roofType` carry the covering: before it, a pitched face always claimed to be
 * 'rcc_flat', so both lines below had to quote one blended price and describe
 * three possible products at once ("hooks (tile) or L-feet (sloped RCC/sheet)")
 * — an estimate of an unknown thing. Now the product is known and only the
 * anchor COUNT (rafter spacing) is estimated.
 */
const SLOPED_HARDWARE: Record<
  SlopedCovering,
  {
    covering: string;
    anchorItem: string;
    anchorSpec: string;
    anchorPrice: number;
    anchorNote: string;
    sealSpec: string;
    sealPrice: number;
    sealNote: string;
  }
> = {
  rcc_flat: {
    covering: 'sloped RCC slab',
    anchorItem: 'L-feet on chemical anchors',
    anchorSpec: 'HDG/SS L-feet + chemical anchors into the slab, flush mount',
    anchorPrice: PRICE_BOOK.slopedLFootSetPerPanel,
    anchorNote:
      'There is no rafter to reach on a slab, so the foot anchors directly into concrete. ' +
      'ESTIMATE — anchors per module (~4 assumed) depend on module size and the structural engineer’s pull-out check.',
    sealSpec: 'EPDM washers + PU sealant at every anchor',
    sealPrice: PRICE_BOOK.slopedSealRccPerPanel,
    sealNote:
      'Each anchor breaks the waterproofing layer and is sealed with an EPDM washer and a PU bead. No tile allowance — there are no tiles to lift.',
  },
  tile: {
    covering: 'Mangalore / clay tile',
    anchorItem: 'adjustable tile roof hooks',
    anchorSpec: 'HDG/SS adjustable tile roof hooks bolted to batten/rafter, flush mount',
    anchorPrice: PRICE_BOOK.tileHookSetPerPanel,
    anchorNote:
      'A tile hook reaches PAST the tile to the batten/rafter, so it must clear the tile profile and be height-adjustable. ' +
      'ESTIMATE — hooks per module (~4 assumed) are set by rafter spacing, which is not modelled; confirm at site survey.',
    sealSpec: 'Lead/EPDM flashing plate per hook + tile lifting & breakage allowance',
    sealPrice: PRICE_BOOK.tileFlashingPerPanel,
    sealNote:
      'Every hook lifts a tile, which is flashed and re-bedded. Tile breakage during install is an ALLOWANCE, not a count — tiles crack on lift and the rate is site- and age-dependent.',
  },
};

export function emitMechanical(ctx: BomContext): BomLine[] {
  const {
    project,
    spec,
    n,
    structures,
    fasteners: ft,
    nStructured,
    nFlatRcc,
    nGround,
    nSloped,
    nMetal,
    slopedByCovering,
    slopedRoofIdsByCovering,
    flatRccRoofIds,
    metalRoofIdList,
    groundRoofIdList,
  } = ctx;
  const out: BomLine[] = [];

  const roofOfSegment = (segmentId: string) =>
    project.segments.find((sg) => sg.id === segmentId)?.roofId;
  /** Every structure's segment/roof — the source pool for the fastener lines. */
  const allStructureSegmentIds = structures.map((st) => st.segmentId);
  const allStructureRoofIds = structures.map((st) => roofOfSegment(st.segmentId));

  if (structures.length > 0) {
    // one line per PROFILE (stable override keys; per-segment breakdown in formula)
    const byProfile = new Map<
      string,
      {
        kg: number;
        parts: string[];
        kgPerM: number;
        label: string;
        segmentIds: string[];
        roofIds: (string | undefined)[];
      }
    >();
    for (const st of structures) {
      const seg = project.segments.find((sg) => sg.id === st.segmentId);
      const profile = seg && seg.racking.kind !== 'flush' ? seg.racking.profile : null;
      if (!profile) continue;
      const cur =
        byProfile.get(profile.key) ??
        byProfile
          .set(profile.key, {
            kg: 0,
            parts: [],
            kgPerM: profile.kgPerM,
            label: profile.label,
            segmentIds: [],
            roofIds: [],
          })
          .get(profile.key)!;
      cur.kg += st.steelKg;
      cur.segmentIds.push(st.segmentId);
      cur.roofIds.push(seg!.roofId);
      const ms = st.memberSummary;
      cur.parts.push(
        `${seg!.label}: ${ms.front_leg.count + ms.back_leg.count} legs ${Math.round((ms.front_leg.totalM + ms.back_leg.totalM) * 10) / 10}m, ${ms.rafter.count} rafters ${Math.round(ms.rafter.totalM * 10) / 10}m, ${ms.purlin.count} purlins ${Math.round(ms.purlin.totalM * 10) / 10}m, ${ms.brace.count} braces ${Math.round(ms.brace.totalM * 10) / 10}m` +
          (st.warnings.length > 0 ? ' (dual-tilt approximated)' : ''),
      );
    }
    for (const [key, agg] of [...byProfile.entries()].sort()) {
      out.push(
        line({
          key: 'mech.steel',
          // the SAME profile can be shared by several segments, so the profile
          // key — not the segment — is what makes this line unique
          instance: key,
          category: 'Mechanical BOS',
          item: `Structure Steel — ${agg.label}`,
          spec: `HDG ${agg.label} (${agg.kgPerM} kg/m), key ${key}`,
          qty: Math.round(agg.kg * 10) / 10,
          unit: 'kg',
          unitPriceInr: PRICE_BOOK.steelPerKg,
          formula: `Member model: ${agg.parts.join('; ')}. ${STRUCTURE_DISCLAIMER}`,
          sourceSegmentId: soleSource(agg.segmentIds),
          sourceRoofId: soleSource(agg.roofIds),
        }),
      );
    }
    // The fastener lines are Σ over the node graph of EVERY structure, so they
    // only name a segment when there is exactly one to name.
    const fastenerSource = {
      sourceSegmentId: soleSource(allStructureSegmentIds),
      sourceRoofId: soleSource(allStructureRoofIds),
    };
    if (ft.plates > 0)
      out.push(
        line({
          key: 'mech.base_plate',
          category: 'Mechanical BOS',
          item: ft.anchors > 0 ? 'Base Plates + Anchors' : 'Base Plates',
          spec: ft.anchors > 0 ? 'HDG plates, chemical/expansion anchors' : 'HDG base plates',
          qty: ft.plates,
          unit: 'plate',
          unitPriceInr:
            PRICE_BOOK.basePlatePc + Math.round((ft.anchors / ft.plates) * PRICE_BOOK.anchorBoltPc),
          formula: `${ft.plates} leg base plates × (plate + ${Math.round(ft.anchors / ft.plates)} anchors each) from the node graph. ${STRUCTURE_DISCLAIMER}`,
          ...fastenerSource,
        }),
      );
    if (ft.ballast > 0)
      out.push(
        line({
          key: 'mech.ballast',
          category: 'Mechanical BOS',
          item: 'Ballast Blocks',
          spec: 'precast concrete, on-slab (no roof penetration)',
          qty: ft.ballast,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.ballastBlock,
          formula: `1 block per leg base from the node graph. ${STRUCTURE_DISCLAIMER}`,
          ...fastenerSource,
        }),
      );
    if (ft.piles > 0)
      out.push(
        line({
          key: 'mech.pile',
          category: 'Mechanical BOS',
          item: 'Ground Foundation — Driven Pile',
          spec: 'HDG rammed post, embedment per soil survey',
          qty: ft.piles,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.pileFoundation,
          formula: `1 pile per leg base from the node graph. Embedment depth and pull-out capacity are SOIL-dependent — site survey required. ${STRUCTURE_DISCLAIMER}`,
          confidence: 'assumed',
          ...fastenerSource,
        }),
      );
    if (ft.pedestals > 0)
      out.push(
        line({
          key: 'mech.pedestal',
          category: 'Mechanical BOS',
          item: 'Ground Foundation — Concrete Pedestal',
          spec: 'cast-in-situ, incl. excavation + backfill',
          qty: ft.pedestals,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.concretePedestal,
          formula: `1 pedestal per leg base from the node graph. Volume and reinforcement are SOIL- and wind-dependent — engineer design required. ${STRUCTURE_DISCLAIMER}`,
          confidence: 'assumed',
          ...fastenerSource,
        }),
      );
    if (ft.bolts > 0)
      out.push(
        line({
          key: 'mech.bolts',
          category: 'Mechanical BOS',
          item: 'Structure Bolts (M10 SS)',
          spec: 'bolt + nut + washers per joint',
          qty: ft.bolts,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.structureBoltPc,
          formula: 'Σ joint nodes × bolts (leg-rafter 2, rafter-purlin 1, brace ends 1)',
          ...fastenerSource,
        }),
      );
  }

  if (nFlatRcc > 0)
    out.push(
      line({
        key: 'mech.mms_rcc',
        category: 'Mechanical BOS',
        item: 'Mounting Structure (elevated RCC)',
        spec: 'HDG steel, 10° tilt legs + purlins',
        qty: nFlatRcc,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.structureLegPerPanel,
        formula: `${nFlatRcc} loose/unsegmented FLAT-RCC panels × structure share (pitched faces are billed flush hardware instead). ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: soleSource(flatRccRoofIds),
      }),
    );
  if (nGround > 0)
    out.push(
      line({
        key: 'mech.mms_ground',
        category: 'Mechanical BOS',
        item: 'Ground Mount Structure',
        spec: 'HDG steel table, tilt legs + foundation',
        qty: nGround,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.structureGroundPerPanel,
        formula: `${nGround} unsegmented ground-array panels × structure share (foundation type site-dependent — assumed). ${STRUCTURE_DISCLAIMER}`,
        confidence: 'assumed',
        sourceRoofId: soleSource(groundRoofIdList),
      }),
    );
  // ── Pitched faces: FLUSH hardware, never tilt legs. Two lines, because the
  // anchor and the weatherproofing are separately priced (and separately
  // wrong-able) items on a real quote.
  // ONE pair of lines per covering present. In the ordinary single-covering
  // project this emits exactly the two lines it always did, under the same item
  // names — the covering appears in the spec and the formula, which is where a
  // reader checks it against the site.
  for (const covering of ['rcc_flat', 'tile'] as const) {
    const nCov = slopedByCovering.get(covering) ?? 0;
    if (nCov === 0) continue;
    const hw = SLOPED_HARDWARE[covering];
    // Both coverings emit the SAME item string, which is exactly why the old
    // `category|item` override key was broken. The covering is the instance.
    const roofId = soleSource(slopedRoofIdsByCovering.get(covering) ?? []);
    out.push(
      line({
        key: 'mech.mms_sloped',
        instance: covering,
        category: 'Mechanical BOS',
        item: 'Mounting Structure (pitched roof) — roof hooks / L-feet',
        spec: hw.anchorSpec,
        qty: nCov,
        unit: 'panel-set',
        unitPriceInr: hw.anchorPrice,
        confidence: 'estimated',
        // The covering is now KNOWN, so name the hardware and say why. What is
        // still unknown is the anchor COUNT — name that, and nothing else.
        formula:
          `${nCov} panels on ${hw.covering} faces × ~4 anchor points each, priced as ${hw.anchorItem}. ` +
          `Modules sit FLUSH on the covering — no tilt legs, no ballast. ${hw.anchorNote} ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: roofId,
      }),
      line({
        key: 'mech.sloped_flashing',
        instance: covering,
        category: 'Mechanical BOS',
        item: 'Roof Penetration Flashing & Sealing',
        spec: hw.sealSpec,
        qty: nCov,
        unit: 'panel-set',
        unitPriceInr: hw.sealPrice,
        confidence: 'estimated',
        formula:
          `${nCov} panels on ${hw.covering} faces — every anchor penetrates the covering and must be weatherproofed. ` +
          hw.sealNote,
        sourceRoofId: roofId,
      }),
    );
  }
  if (nMetal > 0)
    out.push(
      line({
        key: 'mech.mms_metal_shed',
        category: 'Mechanical BOS',
        item: 'Mounting Structure (metal shed)',
        spec: 'Al mini-rails + roof clamps, flush mount (rails INCLUDED)',
        qty: nMetal,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.metalShedClampPerPanel,
        formula: `${nMetal} panels on metal shed roofs × clamp share (mini-rails bundled — no separate rail line)`,
        sourceRoofId: soleSource(metalRoofIdList),
      }),
    );
  // rail applies ONLY to loose/flush RCC panels: structured segments carry
  // purlins in the member model; metal-shed bundles mini-rails (the old
  // all-panels rail line double-billed both)
  // module rails are needed on ground tables exactly as on RCC — and on a
  // pitched face too: the hooks/L-feet carry a rail, the modules clamp to it
  const railM = Math.round((nFlatRcc + nGround + nSloped) * (spec.lengthMm / 1000) * 1.05);
  if (railM > 0)
    out.push(
      line({
        key: 'mech.rail',
        category: 'Mechanical BOS',
        item: 'Mounting Rail',
        spec: 'Al 6005-T5 40×40',
        qty: railM,
        unit: 'm',
        unitPriceInr: PRICE_BOOK.railPerM,
        formula: `${nFlatRcc + nGround + nSloped} unsegmented flat-RCC/ground/pitched-roof panels × panel length × 1.05 waste`,
      }),
    );
  // panel clamps: structured segments count clamps from the node graph;
  // remaining panels keep the flat 2/panel + ends estimate
  const structClamps = ft.clamps;
  const looseClampQty = (n - nStructured) * 2 + (n - nStructured > 0 ? 8 : 0);
  out.push(
    line({
      key: 'mech.clamps',
      category: 'Mechanical BOS',
      item: 'Mid + End Clamps',
      spec: 'Al with SS hardware',
      qty: structClamps + looseClampQty,
      unit: 'nos',
      unitPriceInr: PRICE_BOOK.midClamp,
      formula:
        structClamps > 0
          ? `${structClamps} from structure node graph + ${looseClampQty} for ${n - nStructured} loose panels`
          : `${n} panels × 2 + ends`,
    }),
    line({
      key: 'mech.fasteners',
      category: 'Mechanical BOS',
      item: 'Fasteners & Chemical Anchors',
      spec: 'SS304 kit',
      qty: 1,
      unit: 'kit',
      unitPriceInr: PRICE_BOOK.fastenersKit,
      formula: 'Per site kit (wiring/misc — structure anchors counted separately)',
    }),
  );

  return out;
}
