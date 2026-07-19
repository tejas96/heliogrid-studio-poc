import type { BomLine, StructureProfile } from '../../../types';
import type { PriceBook } from '../../../data/pricebook';
import { STRUCTURE_PROFILES } from '../../../data/profiles';
import { STRUCTURE_DISCLAIMER, type SegmentStructure } from '../../structure';
import type { BomContext, SlopedCovering } from '../context';
import { line, soleSource } from '../line';
import { foundationDeadLoadKg, foundationVolumeM3, ruleFor } from '../../foundation';

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
    anchorPriceKey: keyof PriceBook;
    anchorNote: string;
    sealSpec: string;
    sealPriceKey: keyof PriceBook;
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
    pricebook: PRICE_BOOK,
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
        sectionMm?: string;
        isGrade?: string;
        coating?: string;
        segmentIds: string[];
        roofIds: (string | undefined)[];
      }
    >();
    for (const st of structures) {
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
  if (ft.standoffs > 0) {
    out.push(
      line({
        key: 'mech.sheet_standoff',
        category: 'Mechanical BOS',
        item: 'Sheet Standoffs (L-feet)',
        spec: 'HDG/SS L-foot, fixed through the sheet crown into the purlin',
        confidence: 'assumed',
        qty: ft.standoffs,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.sheetStandoff,
        formula: `${ft.standoffs} fixings from the structure node graph. ASSUMED purlin pitch sets the count and ASSUMED rib pitch decides whether each lands on a crown — confirm both at survey before drilling. ${STRUCTURE_DISCLAIMER}`,
      }),
      line({
        key: 'mech.sealing_washer',
        category: 'Mechanical BOS',
        item: 'EPDM Sealing Washers',
        spec: 'bonded EPDM washer, one per sheet penetration',
        confidence: 'derived',
        qty: ft.sealingWashers,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.sealingWasher,
        // the count is not an estimate: it is one per hole, by definition
        formula: `One per sheet penetration — ${ft.standoffs} standoffs ⇒ ${ft.sealingWashers} washers. Every fixing is a hole in the roof.`,
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
