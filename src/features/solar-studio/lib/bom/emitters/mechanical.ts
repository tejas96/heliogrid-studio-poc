import type { BomLine, StructureProfile } from '../../../types';
import type { PriceKey } from '../../../data/pricebook';
import { STRUCTURE_PROFILES } from '../../../data/profiles';
import { STRUCTURE_DISCLAIMER, type SegmentStructure } from '../../structure';
import type { BomContext, SlopedCovering } from '../context';
import { line, soleSource } from '../line';
import { foundationDeadLoadKg, foundationVolumeM3, ruleFor } from '../../foundation';
import { resolveTrackerAxis, trackerRowsFrom } from '../../energy/tracker';
import { panelFootprintM } from '../../layout';
import { resolveRacking } from '../../structure';
import { fastenerTotals } from '../../structure';
import { emitMms } from './mms';
import { isNoPenetrationRoof } from '../../roof-plane';

/** Plural-safe member phrase, e.g. "12 legs 4.2m". Omits absent kinds. */
function memberBreakdown(st: SegmentStructure): string {
  const ms = st.memberSummary;
  const m1 = (v: number) => Math.round(v * 10) / 10;
  const parts: string[] = [];
  const legs = ms.front_leg.count + ms.back_leg.count;
  if (legs > 0) parts.push(`${legs} legs ${m1(ms.front_leg.totalM + ms.back_leg.totalM)}m`);
  for (const [kind, label] of [
    ['rafter', 'rafters'],
    ['purlin', 'purlins'],
    ['brace', 'braces'],
    ['rail', 'rails'],
  ] as const) {
    if (ms[kind].count > 0) parts.push(`${ms[kind].count} ${label} ${m1(ms[kind].totalM)}m`);
  }
  return parts.length > 0 ? parts.join(', ') : 'no members';
}

/**
 * The section a structure's members are made of, read from the members
 * themselves. A flush/monorail segment carries no `racking.profile` — the rail
 * section is chosen by the builder — so this is the only honest source for it.
 */
function profileOfMembers(st: SegmentStructure): StructureProfile | undefined {
  const key = st.members[0]?.profileKey;
  return key ? STRUCTURE_PROFILES.find((p) => p.key === key) : undefined;
}

/**
 * Pedestal count split by the surface it is cast on. Casting on a slab and
 * casting in the ground are different scopes of work, so they cannot share a
 * line — see the call site.
 */
function pedestalsBySurface(ctx: BomContext): [('roof' | 'ground'), number][] {
  const groundRoofIds = new Set(ctx.groundRoofIdList);
  let roof = 0;
  let ground = 0;
  for (const st of ctx.structures) {
    const seg = ctx.project.segments.find((s) => s.id === st.segmentId);
    const pedestals = st.nodes.reduce((n, nd) => n + (nd.fastenerSpec.pedestals ?? 0), 0);
    if (seg && groundRoofIds.has(seg.roofId)) ground += pedestals;
    else roof += pedestals;
  }
  return [
    ['roof', roof],
    ['ground', ground],
  ];
}

/**
 * Flush-mount hardware per covering. This table is the whole point of making
 * `roofType` carry the covering: before it, a pitched face always claimed to be
 * 'rcc_flat', so both lines below had to quote one blended price and describe
 * three possible products at once ("hooks (tile) or L-feet (sloped RCC/sheet)")
 * — an estimate of an unknown thing. Now the product is known and only the
 * anchor COUNT (rafter spacing) is estimated.
 *
 * Prices are held as price-book KEYS, not values. This table is module-level,
 * so reading `PRICE_BOOK.x` here would bind at import and freeze the rate for
 * the process lifetime — the catalog must be resolved per derivation.
 */
const SLOPED_HARDWARE: Record<
  SlopedCovering,
  {
    covering: string;
    anchorItem: string;
    anchorSpec: string;
    anchorPriceKey: PriceKey;
    anchorNote: string;
    sealSpec: string;
    sealPriceKey: PriceKey;
    sealNote: string;
  }
> = {
  rcc_flat: {
    covering: 'sloped RCC slab',
    anchorItem: 'L-feet on chemical anchors',
    anchorSpec: 'HDG/SS L-feet + chemical anchors into the slab, flush mount',
    anchorPriceKey: 'slopedLFootSetPerPanel',
    anchorNote:
      'There is no rafter to reach on a slab, so the foot anchors directly into concrete. ' +
      'ESTIMATE — anchors per module (~4 assumed) depend on module size and the structural engineer’s pull-out check.',
    sealSpec: 'EPDM washers + PU sealant at every anchor',
    sealPriceKey: 'slopedSealRccPerPanel',
    sealNote:
      'Each anchor breaks the waterproofing layer and is sealed with an EPDM washer and a PU bead. No tile allowance — there are no tiles to lift.',
  },
  tile: {
    covering: 'Mangalore / clay tile',
    anchorItem: 'adjustable tile roof hooks',
    anchorSpec: 'HDG/SS adjustable tile roof hooks bolted to batten/rafter, flush mount',
    anchorPriceKey: 'tileHookSetPerPanel',
    anchorNote:
      'A tile hook reaches PAST the tile to the batten/rafter, so it must clear the tile profile and be height-adjustable. ' +
      'ESTIMATE — hooks per module (~4 assumed) are set by rafter spacing, which is not modelled; confirm at site survey.',
    sealSpec: 'Lead/EPDM flashing plate per hook + tile lifting & breakage allowance',
    sealPriceKey: 'tileFlashingPerPanel',
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
    nStructured,
    nFlatRcc,
    nGround,
    nSloped,
    nMetal,
    nAc,
    nMembrane,
    nStone,
    slopedByCovering,
    slopedRoofIdsByCovering,
    flatRccRoofIds,
    metalRoofIdList,
    acRoofIdList,
    acRoofCount,
    membraneRoofIdList,
    membraneRoofCount,
    stoneRoofIdList,
    stoneRoofCount,
    groundRoofIdList,
    pricebook: PRICE_BOOK,
  } = ctx;
  const out: BomLine[] = emitMms(ctx);
  const ft = fastenerTotals(structures.filter(s => !s.mms));

  const roofOfSegment = (segmentId: string) =>
    project.segments.find((sg) => sg.id === segmentId)?.roofId;
  // A STONE SLAB's leg bases are counted here and then REMOVED from the generic
  // plate-and-anchor line below. `ft` sums the whole project, and a stone table
  // resolves to `anchor` like a rooftop one — so without this subtraction the
  // quote would carry the joist clamps AND a chemical-anchor-into-concrete line
  // for the very same fixings: double-counted, and half of it the wrong part.
  const stone = { clamps: 0, plates: 0, roofIds: [] as string[] };
  for (const st of structures) {
    if (st.mms) continue; // the MMS emitter counts its own
    const roofId = roofOfSegment(st.segmentId);
    if (project.roofs.find((x) => x.id === roofId)?.roofType !== 'stone_slab') continue;
    for (const nd of st.nodes) {
      stone.clamps += nd.fastenerSpec.anchors ?? 0;
      stone.plates += nd.fastenerSpec.plates ?? 0;
    }
    if (roofId) stone.roofIds.push(roofId);
  }
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
        sectionMm?: string;
        isGrade?: string;
        coating?: string;
        segmentIds: string[];
        roofIds: (string | undefined)[];
      }
    >();
    for (const st of structures) {
      if (st.mms) continue; // detailed lines above already consume this graph
      const seg = project.segments.find((sg) => sg.id === st.segmentId);
      if (!seg) continue;
      // A MONORAIL segment is flush, so it has no `racking.profile` — its
      // section lives on the members themselves. Reading only `racking.profile`
      // skipped these structures entirely, which meant 22h modelled rails that
      // nothing ever billed.
      const profile =
        seg.racking.kind !== 'flush'
          ? seg.racking.profile
          : profileOfMembers(st) ?? null;
      if (!profile) continue;
      const cur =
        byProfile.get(profile.key) ??
        byProfile
          .set(profile.key, {
            kg: 0,
            parts: [],
            kgPerM: profile.kgPerM,
            label: profile.label,
            sectionMm: profile.sectionMm,
            isGrade: profile.isGrade,
            coating: profile.coating,
            segmentIds: [],
            roofIds: [],
          })
          .get(profile.key)!;
      cur.kg += st.steelKg;
      cur.segmentIds.push(st.segmentId);
      cur.roofIds.push(seg!.roofId);
      cur.parts.push(
        // describes the members this table ACTUALLY has. The old text always
        // listed legs/rafters/purlins/braces, which reads "0 legs, 0 rafters"
        // on a shed monorail — a breakdown that describes a table that is not
        // there is worse than no breakdown.
        `${seg.label}: ${memberBreakdown(st)}` +
          (st.warnings.some((w) => w.includes('dual-tilt')) ? ' (dual-tilt approximated)' : ''),
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
          // The internal profile key used to be appended here ("…, key
          // c_channel_80"). `instance` already makes the line unique, so the
          // key was doing nothing but printing a database identifier on a
          // customer's quote. Replaced with what a fabricator actually needs:
          // section, mass, steel grade and coating, each omitted when the
          // profile does not declare it rather than printed as "undefined".
          spec: [
            `HDG ${agg.label}`,
            agg.sectionMm,
            `${agg.kgPerM} kg/m`,
            agg.isGrade,
            agg.coating,
          ]
            .filter(Boolean)
            .join(' · '),
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
    // Stone's leg bases are bought as joist clamp brackets further down, so they
    // are taken out here — a chemical anchor into a 30 mm limestone plate is not
    // a cheaper way to do the same job, it is the wrong job.
    const plates = ft.plates - stone.plates;
    const anchors = Math.max(0, ft.anchors - stone.clamps);
    if (plates > 0)
      out.push(
        line({
          key: 'mech.base_plate',
          category: 'Mechanical BOS',
          item: anchors > 0 ? 'Base Plates + Anchors' : 'Base Plates',
          spec: anchors > 0 ? 'HDG plates, chemical/expansion anchors' : 'HDG base plates',
          qty: plates,
          unit: 'plate',
          unitPriceInr:
            PRICE_BOOK.basePlatePc + Math.round((anchors / plates) * PRICE_BOOK.anchorBoltPc),
          formula: `${plates} leg base plates × (plate + ${Math.round(anchors / plates)} anchors each) from the node graph. ${STRUCTURE_DISCLAIMER}`,
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
      // A pedestal on a SLAB and a pedestal in the GROUND are different work:
      // one is cast on the deck with shuttering, the other needs excavation and
      // backfill. This line used to say "Ground Foundation … incl. excavation"
      // unconditionally, which was harmless only while `concrete` was a
      // ground-only option. Making it the rooftop default (D12) exposed it —
      // a rooftop quote was describing excavating a roof slab.
      for (const [surface, count] of pedestalsBySurface(ctx)) {
        if (count <= 0) continue;
        const onGround = surface === 'ground';
        // the shape the tables actually resolved to — square and circular
        // differ by π/4, so quoting the wrong one under-buys concrete
        const shape = ctx.structures.find((st) => st.foundation === 'concrete')?.foundationShape;
        const r = ruleFor('concrete', shape);
        const each = foundationVolumeM3(r);
        const size =
          r.shape === 'circular' ? `Ø${r.d} × ${r.heightMm} mm` : `${r.l} × ${r.w} × ${r.heightMm} mm`;
        out.push(
          line({
            key: 'mech.pedestal',
            instance: surface,
            category: 'Mechanical BOS',
            item: onGround
              ? 'Ground Foundation — Concrete Pedestal'
              : 'PCC Pedestal (rooftop MMS)',
            spec: onGround
              ? `cast-in-situ ${size}, incl. excavation + backfill`
              : `PCC ${size} cast on slab, incl. shuttering + curing`,
            qty: count,
            unit: 'nos',
            unitPriceInr: PRICE_BOOK.concretePedestal,
            // The size is ASSUMED — it follows from uplift and overturning,
            // which we do not calculate (§F) — so the volume it implies is too.
            formula:
              `1 pedestal per leg base from the node graph. ` +
              `Nominal ${size} ⇒ ${(each * count).toFixed(2)} m³ concrete total (ASSUMED size — ` +
              `uplift and overturning are not calculated). ` +
              (onGround
                ? 'Volume and reinforcement are SOIL- and wind-dependent — engineer design required. '
                : `Adds ~${Math.round(foundationDeadLoadKg('concrete', shape) * count)} kg dead load to the roof — ` +
                  `roof capacity is NOT checked. `) +
              STRUCTURE_DISCLAIMER,
            confidence: 'assumed',
            ...fastenerSource,
          }),
        );
      }
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
        unitPriceInr: PRICE_BOOK[hw.anchorPriceKey],
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
        unitPriceInr: PRICE_BOOK[hw.sealPriceKey],
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
  // ── Asbestos-cement sheet. Four lines, and none of them is a metal-shed line
  // with a different label.
  //
  // A shed's `metalShedClampPerPanel` buys mini-rails and a clamp that stands on
  // a STRUCTURAL sheet. An AC sheet carries nothing: the fixing is a hook bolt
  // that reaches past the sheet and wraps the purlin, which is more steel and a
  // second person working underneath. Quoting the shed rate here under-prices
  // the fixing and then silently drops the two things the law requires before
  // anyone climbs onto a fragile asbestos roof at all.
  if (nAc > 0)
    out.push(
      line({
        key: 'mech.mms_ac_sheet',
        category: 'Mechanical BOS',
        item: 'Mounting Structure (AC sheet) — hook bolts',
        spec: 'HDG J-bolt around purlin + crown bracket, flush mount (mini-rails INCLUDED)',
        qty: nAc,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.acHookBoltSetPerPanel,
        confidence: 'estimated',
        formula:
          `${nAc} panels on asbestos-cement sheet × ~4 hook bolts each. The bolt reaches PAST the sheet and clamps the purlin — ` +
          `the sheet itself carries nothing and is never drilled to hold load. ESTIMATE: bolts per module follow PURLIN SPACING, which is not modelled; ` +
          `sheet age, thickness and purlin condition must be confirmed by a fragile-roof survey. ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: soleSource(acRoofIdList),
      }),
      line({
        key: 'mech.ac_sheet_seal',
        category: 'Mechanical BOS',
        item: 'AC Sheet Penetration Sealing',
        spec: 'Bitumen + EPDM washer pair, dished GI cap and mastic bead, per fixing',
        qty: nAc,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.acSheetSealPerPanel,
        confidence: 'estimated',
        formula:
          `${nAc} panels — every hook bolt makes a hole at the crown of a corrugation. An AC sheet cannot be re-tightened later without cracking, ` +
          `so the seal is made once, under a cap. ALLOWANCE for sheet breakage during fixing is NOT included; an old sheet cracks and the rate is site- and age-dependent.`,
        sourceRoofId: soleSource(acRoofIdList),
      }),
    );
  // Per ROOF, not per panel: you scaffold a roof once, whatever goes on it.
  // These two are the reason AC sheet is its own covering. Neither is optional
  // and neither appears on any other roof type in this app.
  if (acRoofCount > 0)
    out.push(
      line({
        key: 'mech.ac_fragile_access',
        category: 'Mechanical BOS',
        item: 'Fragile Roof Access (AC sheet)',
        spec: 'Crawling boards, roof ladders spanning purlin to purlin, edge protection',
        qty: acRoofCount,
        unit: 'lot',
        unitPriceInr: PRICE_BOOK.acFragileAccessLumpsum,
        confidence: 'assumed',
        formula:
          `${acRoofCount} asbestos-cement roof(s). NOBODY STANDS ON THE SHEET — it is a fragile roof, and a fall through one is the single most common ` +
          `fatality on this kind of job. The crew works off boards bearing on the purlins. ASSUMED LUMP SUM: the real figure follows roof area, purlin span ` +
          `and crew count, none of which this tool models. ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: soleSource(acRoofIdList),
      }),
      line({
        key: 'mech.ac_asbestos_method',
        category: 'Mechanical BOS',
        item: 'Asbestos Method Statement & Controlled Drilling',
        spec: 'Written method statement, wet-drilling kit, PPE, bagged debris disposal',
        qty: acRoofCount,
        unit: 'lot',
        unitPriceInr: PRICE_BOOK.acAsbestosMethodLumpsum,
        confidence: 'assumed',
        formula:
          `${acRoofCount} asbestos-cement roof(s). Drilling releases fibre: wet-drill or reuse existing fixing holes, never cut or grind, and bag the debris. ` +
          `ASSUMED LUMP SUM — disposal is priced by the state's authorised handler and the statement is written by a competent person, not by this tool.`,
        sourceRoofId: soleSource(acRoofIdList),
      }),
    );
  // ── Waterproofing membrane. The covering with no fixings at all, so what a
  // flat-RCC deck would have bought — a cast pedestal or a chemical anchor —
  // is replaced by MASS and by the layer that keeps that mass off the bitumen.
  if (nMembrane > 0)
    out.push(
      line({
        key: 'mech.mms_membrane',
        category: 'Mechanical BOS',
        item: 'Mounting Structure (membrane) — ballasted, non-penetrating',
        spec: 'HDG ballasted frame + precast blocks, NO roof penetration',
        qty: nMembrane,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.membraneBallastSetPerPanel,
        confidence: 'estimated',
        formula:
          `${nMembrane} panels on membrane × ballasted frame share. Nothing is drilled: a hole in the waterproofing is a leak and a voided warranty, ` +
          `so the array is held by MASS. The mass itself is a WIND calculation (IS 875 Part 3) with higher ballast at edges and corners — this tool does ` +
          `NOT compute it, so the block count here is a placeholder for an engineer's uplift check, not a result. ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: soleSource(membraneRoofIdList),
      }),
      line({
        key: 'mech.membrane_protection',
        category: 'Mechanical BOS',
        item: 'Membrane Protection Layer (slip sheets)',
        spec: 'Geotextile / recycled-rubber pad under every bearing point, oversized to the block',
        qty: nMembrane,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.membraneProtectionMatPc,
        confidence: 'estimated',
        formula:
          `${nMembrane} panels — a precast block set straight onto bitumen abrades it, and in Indian rooftop heat the bitumen softens and the block ` +
          `creeps and sinks into it. Every bearing point sits on a pad. ESTIMATE: pads per module follow the block layout, which the wind check sets.`,
        sourceRoofId: soleSource(membraneRoofIdList),
      }),
    );
  // Per ROOF: you get the manufacturer's acceptance once for the roof, not once
  // per module. Without it, loading the membrane voids its warranty — which is
  // the client's problem and therefore the EPC's.
  if (membraneRoofCount > 0)
    out.push(
      line({
        key: 'mech.membrane_warranty',
        category: 'Mechanical BOS',
        item: 'Membrane Warranty Inspection & Acceptance',
        spec: "Membrane manufacturer's inspection and written acceptance of the loaded design",
        qty: membraneRoofCount,
        unit: 'lot',
        unitPriceInr: PRICE_BOOK.membraneWarrantyLumpsum,
        confidence: 'assumed',
        formula:
          `${membraneRoofCount} membrane roof(s). Placing an array on someone else's waterproofing voids its warranty unless the manufacturer inspects ` +
          `and accepts the design in writing. ASSUMED LUMP SUM — the fee and the conditions are the manufacturer's, not this tool's.`,
        sourceRoofId: soleSource(membraneRoofIdList),
      }),
    );
  // ── Shahabad / Kota slab on steel joists. A flat deck to look at, a spanning
  // plate to build on. The RCC line would buy a pedestal cast on a 30 mm slab
  // and a chemical anchor into it; what goes in is a bracket clamped to the
  // JOIST below, reached through a mortar joint that is then re-pointed.
  if (nStone > 0)
    out.push(
      line({
        key: 'mech.mms_stone',
        category: 'Mechanical BOS',
        item: 'Mounting Structure (stone slab) — clamped to the joist',
        spec: 'HDG table + joist clamp brackets through the slab joints, NO fixing into the slab',
        qty: nStone,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.stoneBeamClampSetPerPanel,
        confidence: 'estimated',
        formula:
          `${nStone} panels on stone slab × ~4 joist clamps each. Nothing bears on the slab: a 30 mm limestone plate spanning between beams is brittle, ` +
          `so the load path reaches the RSJ underneath. ESTIMATE — clamps per module follow JOIST SPACING, which is not modelled and is a survey output. ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: soleSource(stoneRoofIdList),
      }),
      line({
        key: 'mech.stone_joint',
        category: 'Mechanical BOS',
        item: 'Slab Joint Make-Good (re-pointing)',
        spec: 'Rake out and re-point every joint opened for a bracket',
        qty: nStone,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.stoneJointRepointPc * 4,
        confidence: 'estimated',
        formula:
          `${nStone} panels × ~4 joints opened. Cheap per joint and invisible if forgotten — an unpointed joint is why an old stone roof starts leaking ` +
          `the monsoon after a solar install. Slab breakage during the work is NOT included: an aged slab cracks and the allowance is site-dependent.`,
        sourceRoofId: soleSource(stoneRoofIdList),
      }),
    );
  if (stoneRoofCount > 0)
    out.push(
      line({
        key: 'mech.stone_survey',
        category: 'Mechanical BOS',
        item: 'Joist Location & Slab Condition Survey',
        spec: 'Locate beams from below, record spacing and section, note cracked slabs',
        qty: stoneRoofCount,
        unit: 'lot',
        unitPriceInr: PRICE_BOOK.stoneSlabSurveyLumpsum,
        confidence: 'assumed',
        formula:
          `${stoneRoofCount} stone-slab roof(s). Beam size, spacing and corrosion, and whether a slab is already cracked, cannot be read off a photograph ` +
          `and are what every figure above depends on. ASSUMED LUMP SUM. ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: soleSource(stoneRoofIdList),
      }),
    );
  // The member-model equivalents. A real roof's panels are in a TABLE, so these
  // are the lines that actually fire — the per-panel pair above only covers
  // loose panels, which is the trap the AC and membrane slices both fell into.
  const stoneClamps = stone.clamps;
  const stoneNodeRoofIds = stone.roofIds;
  if (stoneClamps > 0)
    out.push(
      line({
        key: 'mech.stone_beam_clamp',
        category: 'Mechanical BOS',
        item: 'Joist Clamp Brackets (stone slab)',
        spec: 'HDG bracket clamped to the RSJ flange, set through a slab joint',
        qty: stoneClamps,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.stoneBeamClampPc,
        confidence: 'assumed',
        formula:
          `${stoneClamps} fixings from the structure node graph. Each one is set from BELOW onto the joist flange — not drilled into the slab, which would ` +
          `split it. ASSUMED joist spacing sets whether a leg lands on a beam at all; confirm at survey before anything is opened. ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: soleSource(stoneNodeRoofIds),
      }),
      line({
        key: 'mech.stone_joint_node',
        category: 'Mechanical BOS',
        item: 'Slab Joint Make-Good (re-pointing)',
        spec: 'Rake out and re-point every joint opened for a bracket',
        qty: stoneClamps,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.stoneJointRepointPc,
        confidence: 'derived',
        formula: `One per bracket — ${stoneClamps} brackets ⇒ ${stoneClamps} joints, counted from the same graph so the two cannot disagree.`,
        sourceRoofId: soleSource(stoneNodeRoofIds),
      }),
    );
  // rail applies ONLY to loose/flush RCC panels: structured segments carry
  // purlins in the member model; metal-shed bundles mini-rails (the old
  // all-panels rail line double-billed both)
  // module rails are needed on ground tables exactly as on RCC — and on a
  // pitched face too: the hooks/L-feet carry a rail, the modules clamp to it
  // Phase 22d: the 5% cutting allowance that used to be multiplied into this
  // quantity now lives in ONE place — wastePct on the line, applied by
  // orderQtyOf like every other line. `qty` is the length actually required;
  // ORDER QTY is what you buy. Baking waste into qty made the two indist-
  // inguishable and hid the allowance from the user.
  const railM = Math.round((nFlatRcc + nGround + nSloped) * (spec.lengthMm / 1000));
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
        formula: `${nFlatRcc + nGround + nSloped} unsegmented flat-RCC/ground/pitched-roof panels × panel length. Cutting waste is the line's waste %, not baked into this figure.`,
      }),
    );
  // panel clamps: structured segments count clamps from the node graph;
  // remaining panels keep the flat 2/panel + ends estimate
  // Mid and end clamps are DIFFERENT PARTS at different prices — an end clamp
  // is a wider casting because it grips one module instead of two. They used
  // to be one line priced entirely at `midClamp`, which left `endClamp` in the
  // price book unreferenced and quoted every end clamp 4 rupees light. The node
  // graph has always known which is which.
  // a loose panel's flat estimate is mid clamps; its 8 extras are the ends
  const midQty = ft.clampsMid + (n - nStructured) * 2;
  const endQty = ft.clampsEnd + (n - nStructured > 0 ? 8 : 0);
  // ── Metal-shed fixings (Phase 22h/22j) ───────────────────────────────────
  // Modelled by the monorail builder; billed here. Both figures come straight
  // off the node graph, and both carry the survey caveat: the standoff COUNT
  // follows an assumed purlin pitch, and whether each one lands on a crown
  // rather than in a valley follows an assumed rib pitch.
  // ── Sheet fixings, split by COVERING.
  //
  // `ft` sums the WHOLE project's node graph, so one blended pair of lines
  // priced every sheet roof as whichever covering the rates happened to name —
  // and they named the metal shed. On an asbestos roof that bought an L-foot
  // standing on a structural sheet (₹210) and a plain EPDM washer (₹12), when
  // what goes in is a hook bolt around the purlin (₹240) and a seal made once
  // under a cap (₹65). On a 69 kWp AC shed that is ~₹27,000 missing.
  //
  // AC takes its OWN keys rather than an `instance` suffix on these, so every
  // metal-shed project keeps its historical line ids and any override the user
  // has written on them.
  const sheetFixings = new Map<'metal_shed' | 'ac_sheet', { standoffs: number; washers: number; roofIds: string[] }>();
  for (const st of structures) {
    if (st.mms) continue; // the detailed MMS lines already consume this graph
    const roofId = roofOfSegment(st.segmentId);
    const covering = project.roofs.find((r) => r.id === roofId)?.roofType;
    if (covering !== 'metal_shed' && covering !== 'ac_sheet') continue;
    const bucket = sheetFixings.get(covering) ?? { standoffs: 0, washers: 0, roofIds: [] };
    for (const nd of st.nodes) {
      bucket.standoffs += nd.fastenerSpec.standoffs ?? 0;
      bucket.washers += nd.fastenerSpec.sealingWashers ?? 0;
    }
    if (roofId) bucket.roofIds.push(roofId);
    sheetFixings.set(covering, bucket);
  }
  // Every ballast block on a MEMBRANE needs the pad that keeps concrete off the
  // bitumen — and `ft.ballast` is a project-wide sum, so the pads have to be
  // counted from the membrane structures alone. Without this a TABLE on a
  // membrane bought its blocks and no protection at all: the per-panel line
  // above only fires for LOOSE panels, and a real roof's panels are in tables.
  let membraneBallast = 0;
  const membranePadRoofIds: string[] = [];
  for (const st of structures) {
    if (st.mms) continue; // the MMS emitter counts its own pads
    const roofId = roofOfSegment(st.segmentId);
    const r = project.roofs.find((x) => x.id === roofId);
    if (!r || !isNoPenetrationRoof(r)) continue;
    for (const nd of st.nodes) membraneBallast += nd.fastenerSpec.ballast ?? 0;
    if (roofId) membranePadRoofIds.push(roofId);
  }
  if (membraneBallast > 0)
    out.push(
      line({
        key: 'mech.membrane_pad',
        category: 'Mechanical BOS',
        item: 'Membrane Protection Pads',
        spec: 'Geotextile / recycled-rubber pad under every ballast block, oversized to the block',
        qty: membraneBallast,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.membraneProtectionMatPc,
        confidence: 'derived',
        formula:
          `One per ballast block — ${membraneBallast} blocks ⇒ ${membraneBallast} pads, counted from the same node graph as the blocks so the two ` +
          `cannot disagree. A block set straight onto bitumen abrades it, and in rooftop heat the bitumen softens and the block creeps into it.`,
        sourceRoofId: soleSource(membranePadRoofIds),
      }),
    );
  const metalFix = sheetFixings.get('metal_shed');
  if (metalFix && metalFix.standoffs > 0) {
    out.push(
      line({
        key: 'mech.sheet_standoff',
        category: 'Mechanical BOS',
        item: 'Sheet Standoffs (L-feet)',
        spec: 'HDG/SS L-foot, fixed through the sheet crown into the purlin',
        confidence: 'assumed',
        qty: metalFix.standoffs,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.sheetStandoff,
        formula: `${metalFix.standoffs} fixings from the structure node graph. ASSUMED purlin pitch sets the count and ASSUMED rib pitch decides whether each lands on a crown — confirm both at survey before drilling. ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: soleSource(metalFix.roofIds),
      }),
      line({
        key: 'mech.sealing_washer',
        category: 'Mechanical BOS',
        item: 'EPDM Sealing Washers',
        spec: 'bonded EPDM washer, one per sheet penetration',
        confidence: 'derived',
        qty: metalFix.washers,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.sealingWasher,
        // the count is not an estimate: it is one per hole, by definition
        formula: `One per sheet penetration — ${metalFix.standoffs} standoffs ⇒ ${metalFix.washers} washers. Every fixing is a hole in the roof.`,
        sourceRoofId: soleSource(metalFix.roofIds),
      }),
    );
  }
  const acFix = sheetFixings.get('ac_sheet');
  if (acFix && acFix.standoffs > 0) {
    out.push(
      line({
        key: 'mech.ac_hook_bolt',
        category: 'Mechanical BOS',
        item: 'Hook Bolts (AC sheet)',
        spec: 'HDG J-bolt around the purlin + crown bracket, nuts and washers',
        confidence: 'assumed',
        qty: acFix.standoffs,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.acHookBoltPc,
        formula:
          `${acFix.standoffs} fixings from the structure node graph. The bolt reaches PAST the sheet and clamps the purlin — asbestos cement carries nothing, ` +
          `so no fixing may bear on it. ASSUMED purlin pitch sets the count; sheet condition and purlin corrosion are a fragile-roof survey output. ${STRUCTURE_DISCLAIMER}`,
        sourceRoofId: soleSource(acFix.roofIds),
      }),
      line({
        key: 'mech.ac_hook_seal',
        category: 'Mechanical BOS',
        item: 'Hook-Bolt Seal Sets (AC sheet)',
        spec: 'Bitumen + EPDM washer pair, dished GI cap and mastic bead',
        confidence: 'derived',
        qty: acFix.washers,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.acSheetSealPc,
        formula:
          `One per sheet penetration — ${acFix.standoffs} hook bolts ⇒ ${acFix.washers} seal sets. The hole is at the crown of a brittle corrugation and ` +
          `cannot be re-tightened later without cracking the sheet, so the seal is made once, under a cap. Sheet breakage during fixing is NOT included.`,
        sourceRoofId: soleSource(acFix.roofIds),
      }),
    );
  }

  if (midQty > 0)
    out.push(
      line({
        key: 'mech.clamps_mid',
        category: 'Mechanical BOS',
        item: 'Mid Clamps',
        spec: 'Al with SS hardware — between adjacent modules',
        qty: midQty,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.midClamp,
        formula:
          ft.clampsMid > 0
            ? `${ft.clampsMid} from the structure node graph` +
              (n - nStructured > 0 ? ` + ${(n - nStructured) * 2} for ${n - nStructured} loose panels` : '')
            : `${n} panels × 2`,
      }),
    );
  if (endQty > 0)
    out.push(
      line({
        key: 'mech.clamps_end',
        category: 'Mechanical BOS',
        item: 'End Clamps',
        spec: 'Al with SS hardware — at each row end',
        qty: endQty,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.endClamp,
        formula:
          ft.clampsEnd > 0
            ? `${ft.clampsEnd} from the structure node graph` +
              (n - nStructured > 0 ? ' + 8 for the loose-panel rows' : '')
            : 'row ends',
      }),
    );
  out.push(
    line({
      key: 'mech.fasteners',
      category: 'Mechanical BOS',
      // NOT "Fasteners & Chemical Anchors". Its own formula has always said the
      // structure anchors are counted separately, so the name promised a part
      // this line does not contain — and on a MEMBRANE roof it named the one
      // fixing that must never be drilled, in a quote whose whole point is that
      // nothing penetrates. The key is unchanged, so existing overrides hold.
      item: 'Fasteners Kit (wiring / misc)',
      spec: 'SS304 kit — site miscellany; roof anchors are NOT in this line',
      qty: 1,
      unit: 'kit',
      unitPriceInr: PRICE_BOOK.fastenersKit,
      formula: 'Per site kit (wiring/misc — structure anchors and roof fixings are counted separately, from the node graph)',
    }),
  );

  // ── Single-axis trackers ─────────────────────────────────────────────────
  // The posts, steel and foundations above already carry a tracker's static
  // structure — it stands on the same table model. What a tracker adds is the
  // part that MOVES: a torque tube down each row, a bearing at every post, a
  // drive to turn it and a controller to tell it where the sun is. Left out,
  // the quote for a tracker plant is missing its most expensive mechanical
  // item, so they are emitted — and every one of them is priced at an ASSUMED
  // market rate, because this tool carries no tracker supplier's pricebook.
  if (spec) {
    const rows = { tubes: 0, tubeM: 0, posts: 0, modules: 0 };
    for (const seg of project.segments) {
      if (seg.racking.kind !== 'tracker_hsat') continue;
      const roof = project.roofs.find((r) => r.id === seg.roofId);
      if (!roof) continue;
      const resolved = resolveRacking(project, roof, seg, spec);
      if (!resolved) continue;
      const centres = project.panels.filter((p) => p.enabled && p.segmentId === seg.id).map((p) => p.center);
      if (centres.length === 0) continue;
      const axis = resolveTrackerAxis(seg.racking, panelFootprintM(spec, seg.orientation).h, seg.azimuthDeg);
      // along the tube the modules sit side by side, so it is their WIDTH that
      // fills it, not the dimension the tilt runs along
      const alongTubeM = panelFootprintM(spec, seg.orientation).w;
      const r = trackerRowsFrom(centres, axis.axisAzimuthDeg, alongTubeM, resolved.legSpacingM);
      rows.tubes += r.tubes;
      rows.tubeM += r.tubeM;
      rows.posts += r.posts;
      rows.modules += r.modules;
    }
    if (rows.tubes > 0) {
      const assumedNote =
        'ASSUMED market rate — no tracker supplier pricebook is loaded, and a real tender prices the tracker system per MW against a named vendor. Replace before quoting.';
      out.push(
        line({
          key: 'mech.tracker_tube',
          category: 'Mechanical BOS',
          item: 'Tracker Torque Tube',
          spec: 'HDG steel tube, single-axis tracker',
          qty: Math.round(rows.tubeM * 10) / 10,
          unit: 'm',
          unitPriceInr: PRICE_BOOK.trackerTubePerM,
          confidence: 'assumed',
          formula: `${rows.tubes} tracker row(s) carrying ${rows.modules} modules, measured end to end off where the modules stand. ${assumedNote}`,
        }),
        line({
          key: 'mech.tracker_bearing',
          category: 'Mechanical BOS',
          item: 'Tracker Bearing Assembly',
          spec: 'bearing housing + fasteners, one per post',
          qty: rows.posts,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.trackerBearingPerPost,
          confidence: 'assumed',
          formula: `One per post: ${rows.posts} posts over ${rows.tubes} row(s) at the structure's leg spacing. ${assumedNote}`,
        }),
        line({
          key: 'mech.tracker_drive',
          category: 'Mechanical BOS',
          item: 'Tracker Drive Unit',
          spec: 'slew drive + motor + damper',
          qty: rows.tubes,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.trackerDrivePerTube,
          confidence: 'assumed',
          formula: `One drive per independently driven row (${rows.tubes}). A shared driveline across rows would need fewer — vendor-dependent. ${assumedNote}`,
        }),
        line({
          key: 'mech.tracker_controller',
          category: 'Mechanical BOS',
          item: 'Tracker Control Unit',
          spec: 'NCU + wind sensor + commissioning',
          qty: 1,
          unit: 'set',
          unitPriceInr: PRICE_BOOK.trackerControllerPerPlant,
          confidence: 'assumed',
          formula: `One per plant, whatever the row count. ${assumedNote}`,
        }),
      );
    }
  }

  return out;
}
