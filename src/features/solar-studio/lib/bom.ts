// ─── BOM automation: derive a full bill of materials from the design state ──
// Every line carries a human-readable formula so users can trust the numbers.
import type { BomLine, Project } from '../types';
import { PRICE_BOOK, DEFAULT_MARGIN_PCT } from '../data/pricebook';
import { combinerPlan } from './electrical/combiner';
import { fastenerTotals, projectStructures, STRUCTURE_DISCLAIMER } from './structure';
import { estimateDcCableM } from './stringing';
import { acCableFromRoutes, dcCableFromRoutes } from './routing';
import { resolveRules } from '../data/rules/india';

/** Inverter → meter run we cannot measure: the service entry is not modelled. */
const AC_ALLOWANCE_M = 25;
import { acBreakerA, acFullLoadA } from './electrical-sizing';
import { dist, polygonPerimeter } from './geo';
import { isSloped } from './roof-plane';

let lineSeq = 0;
function line(
  l: Omit<BomLine, 'id' | 'auto' | 'overridden' | 'confidence'> &
    Partial<Pick<BomLine, 'confidence'>>,
): BomLine {
  lineSeq += 1;
  // 'derived' is the honest default: a quantity computed from the design. Lines
  // that are a direct COUNT (stronger) or depend on unmodelled facts (weaker)
  // pass their own confidence.
  return { confidence: 'derived', ...l, id: `bom_${lineSeq}`, auto: true, overridden: false };
}

/**
 * The coverings a PITCHED, unstructured, non-ground, non-metal-shed face can
 * have. Metal shed and ground keep their own buckets, so what is left is an
 * RCC slab or a tile roof — and those take genuinely different hardware.
 */
type SlopedCovering = 'rcc_flat' | 'tile';

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

export function deriveBom(project: Project): BomLine[] {
  lineSeq = 0;
  const out: BomLine[] = [];
  const spec = project.components.panel;
  const inv = project.components.inverter;
  const panels = project.panels.filter((p) => p.enabled);
  const n = panels.length;
  if (!spec || !inv || n === 0) return out;
  const kwp = (n * spec.watt) / 1000;
  const invCount = project.components.inverterCount;

  // ── Modules
  out.push(
    line({
      category: 'Modules',
      confidence: 'measured',
      item: `${spec.brand} ${spec.model}`,
      spec: `${spec.watt}Wp ${spec.tech}${spec.almm ? ' · ALMM' : ''}${spec.dcr ? ' · DCR' : ''}`,
      qty: n,
      unit: 'nos',
      unitPriceInr: spec.priceInr,
      formula: `${n} enabled panels on canvas`,
    }),
  );

  // ── Inverter
  out.push(
    line({
      category: 'Inverter',
      confidence: 'measured',
      item: `${inv.brand} ${inv.model}`,
      spec: `${inv.acKw}kW · ${inv.phases}φ · ${inv.mppt.count} MPPT`,
      qty: invCount,
      unit: 'nos',
      unitPriceInr: inv.priceInr,
      formula: 'Selected in Components step',
    }),
  );

  // ── Electrical BOS
  // Cable comes from ROUTED geometry when routes exist (plan §F2/task 29):
  // home runs + only the intra-string hops too long for the module leads, plus
  // real slack. The legacy estimator is the labelled fallback for designs that
  // predate routing — it double-counts module links and floors at 30 m, so it
  // reads HIGH; never present it as a routed quantity.
  const routedDc = dcCableFromRoutes(project);
  const dcCableM = routedDc.routed
    ? routedDc.meters
    : Math.max(30, estimateDcCableM(project.strings, project.panels));
  const routedAc = acCableFromRoutes(project);
  const acRunM = routedAc.routed ? routedAc.meters : AC_ALLOWANCE_M;
  const conduitM = Math.round((routedDc.routed ? routedDc.ductM : dcCableM / 2) + acRunM);
  out.push(
    line({
      category: 'Electrical BOS',
      item: 'DC Solar Cable 4 sq.mm',
      spec: '1.1kV, UV-resistant, red+black pair',
      confidence: routedDc.routed ? 'derived' : 'estimated',
      qty: dcCableM,
      unit: 'm',
      unitPriceInr: PRICE_BOOK.dcCablePerM,
      // The old text claimed "(+15% slack incl.)" on a figure that had no slack
      // in it — the traceability line is the one thing a reviewer trusts, so it
      // now states exactly what was summed.
      formula: routedDc.routed
        ? `Routed home runs ${routedDc.homeRunM} m` +
          (routedDc.intraM > 0 ? ` + ${routedDc.intraM} m inter-row hops` : '') +
          ` (incl. ${Math.round(resolveRules().cable.slackPct * 100)}% slack, ${resolveRules().cable.defaultVerticalDropM} m drop/run)`
        : `ESTIMATE — ${project.strings.length} strings × module-to-module + 15 m home run × 2 conductors, floored at 30 m (reads HIGH: it charges for module links the panel leads already cover). ` +
          (project.inverterPlacements.length === 0
            ? 'Place the inverter (Step 6 → Mount inverter), then Auto string, to route the real runs.'
            : 'Run Auto string to route the real runs.'),
    }),
    line({
      category: 'Electrical BOS',
      item: 'AC Cable',
      spec: inv.phases === 3 ? '4-core 10 sq.mm Cu' : '3-core 6 sq.mm Cu',
      confidence: routedAc.routed ? 'derived' : 'assumed',
      qty: routedAc.routed ? routedAc.meters : AC_ALLOWANCE_M,
      unit: 'm',
      unitPriceInr: PRICE_BOOK.acCablePerM,
      // Measured only when the service entry has actually been placed. Until
      // then the length is genuinely unknown, so it is an ALLOWANCE and says
      // so — never an assumption dressed as a calculation.
      formula: routedAc.routed
        ? `Routed inverter → meter ${routedAc.meters} m (incl. ${Math.round(resolveRules().cable.slackPct * 100)}% slack, ${resolveRules().cable.defaultVerticalDropM} m drop)`
        : `ASSUMED ${AC_ALLOWANCE_M} m allowance — no meter/service entry placed, so this run cannot be measured. Place it (Step 6 → Mount inverter → Meter) or edit the quantity to the surveyed length.`,
    }),
    line({
      category: 'Electrical BOS',
      item: 'MC4 Connector Pairs',
      spec: '1000V 30A',
      qty: project.strings.length * 2 + 4,
      unit: 'pairs',
      unitPriceInr: PRICE_BOOK.mc4PairPrice,
      formula: `${project.strings.length} strings × 2 + 4 spare`,
    }),
    line({
      category: 'Electrical BOS',
      item: 'DCDB',
      spec: `${project.strings.length}-in ${inv.mppt.count}-out, fuses + Type-II SPD`,
      qty: invCount,
      unit: 'nos',
      unitPriceInr: PRICE_BOOK.dcdb + PRICE_BOOK.spdDc,
      formula: 'One per inverter, sized from string count',
    }),
    line({
      category: 'Electrical BOS',
      item: 'ACDB',
      spec: `${mcbFor(inv.acKw * invCount, inv.phases)}A MCB + Type-II SPD`,
      qty: 1,
      unit: 'nos',
      unitPriceInr: PRICE_BOOK.acdb + PRICE_BOOK.spdAc,
      formula: `AC current ${acAmps(inv.acKw * invCount, inv.phases)}A × 1.25 safety`,
    }),
    line({
      category: 'Electrical BOS',
      item: 'Conduit + Cable Tray',
      spec: '25mm HDPE / GI tray',
      confidence: routedDc.routed ? 'derived' : 'estimated',
      // Conduit carries the RUN, not each conductor: the + and − of a string
      // share one duct, so this is route length — not cable metres. The old
      // `dcCableM / 2 + 25` happened to halve the conductor count to get back
      // to a route, then bolted on the AC allowance, while its formula claimed
      // to be "DC route + AC route lengths". It now is exactly that.
      qty: conduitM,
      unit: 'm',
      unitPriceInr: PRICE_BOOK.conduitPerM,
      formula: routedDc.routed
        ? `Routed DC runs ${routedDc.ductM} m + ${acRunM} m AC ${routedAc.routed ? 'run' : 'allowance'} (one duct carries a string's + and −)`
        : `ESTIMATE — DC runs not routed yet: ${Math.round(dcCableM / 2)} m implied + ${acRunM} m AC ${routedAc.routed ? 'run' : 'allowance'}`,
    }),
    line({
      category: 'Electrical BOS',
      item: 'Net Meter + Generation Meter',
      spec: 'DISCOM-approved bidirectional',
      qty: 1,
      unit: 'set',
      unitPriceInr: PRICE_BOOK.netMeter + PRICE_BOOK.generationMeter,
      formula: 'Required for net metering',
    }),
  );

  // ── MLPE: one DC optimiser per module. Bought per panel, so the quantity is
  // a direct COUNT of what's placed (measured), like the modules themselves.
  if ((project.components.mlpe ?? 'none') === 'optimizer') {
    out.push(
      line({
        category: 'Electrical BOS',
        item: 'DC Optimiser (per module)',
        spec: 'Module-level MPPT + rapid shutdown',
        confidence: 'measured',
        qty: n,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.dcOptimizer,
        formula: `One per enabled module (${n}) — lets mixed-orientation faces share a string`,
      }),
    );
  }

  // ── DC collection: central/C&I topology adds fused string-combiner boxes
  // (30e). Only when the user selects it AND strings exist (else the SLD/BOM
  // would invent hardware for a residential string-inverter system).
  if ((project.components.inverterTopology ?? 'string') === 'central' && project.strings.length > 0) {
    const plan = combinerPlan(project.strings, spec);
    if (plan.ok) {
      const maxIn = resolveRules().combiner.maxStringsPerBox;
      out.push(
        line({
          category: 'Electrical BOS',
          item: 'String Combiner Box (SCB)',
          spec: `up to ${maxIn}-in · ${plan.stringFuseA}A fuses + isolator + Type-II SPD`,
          qty: plan.boxes.length,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.combinerBox + PRICE_BOOK.spdDc,
          formula: `${plan.totalStrings} strings ÷ ${maxIn}/box = ${plan.boxes.length} combiner${plan.boxes.length > 1 ? 's' : ''} (central topology)`,
        }),
        line({
          category: 'Electrical BOS',
          item: 'String Fuses (gPV)',
          spec: `${plan.stringFuseA}A 1000V DC`,
          qty: plan.totalStrings * 2,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.stringFuse,
          formula: `${plan.totalStrings} strings × 2 poles (+ and −), fused in the combiner`,
        }),
      );
    }
  }

  // ── Mechanical BOS — structured (elevated) segments get REAL tonnage from
  // the member/node graph (lib/structure.ts); flat per-panel prices remain
  // only for what the model does not cover (metal-shed flush, loose panels).
  // Every structure line carries the engineering disclaimer (plan §F).
  const structures = projectStructures(project);
  const structuredPanelIds = new Set(
    structures.flatMap((st) => {
      const seg = project.segments.find((sg) => sg.id === st.segmentId);
      return project.panels
        .filter((pp) => pp.enabled && pp.segmentId === seg?.id)
        .map((pp) => pp.id);
    }),
  );
  const metalRoofIds = new Set(
    project.roofs.filter((r) => r.roofType === 'metal_shed').map((r) => r.id),
  );
  // DISJOINT buckets: a structured panel is billed ONLY via the member model,
  // even on a metal shed; the remainder never goes negative
  const nStructured = panels.filter((p) => structuredPanelIds.has(p.id)).length;
  const nMetal = panels.filter(
    (p) => metalRoofIds.has(p.roofId) && !structuredPanelIds.has(p.id),
  ).length;
  // A ground array is NOT rooftop RCC: different table, different foundation,
  // different price. Without its own bucket a loose ground panel would print
  // "elevated RCC, 10° tilt legs" on the customer's quote.
  const groundRoofIds = new Set(
    project.roofs.filter((r) => r.roofType === 'ground').map((r) => r.id),
  );
  const nGround = panels.filter(
    (p) => groundRoofIds.has(p.roofId) && !structuredPanelIds.has(p.id),
  ).length;
  // A PITCHED face is not an elevated flat deck. makeRoof stamps every roof
  // 'rcc_flat' and the gable/hip/skeleton factories only set pitchDeg, so a
  // sloped roof used to land in nFlatRcc and get quoted ballasted 10° tilt
  // legs it will never receive — wrong price AND wrong spec on a customer
  // document. It needs flush hardware (hooks/L-feet + rail + flashing).
  // `isSloped` (lib/roof-plane) is the codebase's single pitch predicate — the
  // same one layout.ts follows when it sets racking {kind:'flush'} here.
  const slopedRoofIds = new Set(project.roofs.filter(isSloped).map((r) => r.id));
  // Bucket order is precedence: metal-shed and ground keep their existing
  // treatment even when pitched (a metal shed is already flush-clamped, and a
  // ground table sets its own tilt), so this claims only what USED to be
  // mis-billed as elevated RCC.
  const slopedPanels = panels.filter(
    (p) =>
      slopedRoofIds.has(p.roofId) &&
      !structuredPanelIds.has(p.id) &&
      !metalRoofIds.has(p.roofId) &&
      !groundRoofIds.has(p.roofId),
  );
  const nSloped = slopedPanels.length;
  // Split the pitched bucket by COVERING — the bucket total is unchanged (so
  // the four buckets stay disjoint and still sum to the enabled count), but the
  // hardware inside it is now chosen instead of averaged. Metal shed and ground
  // are excluded above, so only RCC slab and tile can appear here.
  const coveringById = new Map(project.roofs.map((r) => [r.id, r.roofType]));
  const slopedByCovering = new Map<SlopedCovering, number>();
  for (const p of slopedPanels) {
    const cov: SlopedCovering = coveringById.get(p.roofId) === 'tile' ? 'tile' : 'rcc_flat';
    slopedByCovering.set(cov, (slopedByCovering.get(cov) ?? 0) + 1);
  }
  const nFlatRcc = Math.max(0, n - nMetal - nStructured - nGround - nSloped); // loose/flush on FLAT RCC

  if (structures.length > 0) {
    // one line per PROFILE (stable override keys; per-segment breakdown in formula)
    const byProfile = new Map<string, { kg: number; parts: string[]; kgPerM: number; label: string }>();
    for (const st of structures) {
      const seg = project.segments.find((sg) => sg.id === st.segmentId);
      const profile = seg && seg.racking.kind !== 'flush' ? seg.racking.profile : null;
      if (!profile) continue;
      const cur =
        byProfile.get(profile.key) ??
        byProfile.set(profile.key, { kg: 0, parts: [], kgPerM: profile.kgPerM, label: profile.label }).get(profile.key)!;
      cur.kg += st.steelKg;
      const ms = st.memberSummary;
      cur.parts.push(
        `${seg!.label}: ${ms.front_leg.count + ms.back_leg.count} legs ${Math.round((ms.front_leg.totalM + ms.back_leg.totalM) * 10) / 10}m, ${ms.rafter.count} rafters ${Math.round(ms.rafter.totalM * 10) / 10}m, ${ms.purlin.count} purlins ${Math.round(ms.purlin.totalM * 10) / 10}m, ${ms.brace.count} braces ${Math.round(ms.brace.totalM * 10) / 10}m` +
          (st.warnings.length > 0 ? ' (dual-tilt approximated)' : ''),
      );
    }
    for (const [key, agg] of [...byProfile.entries()].sort()) {
      out.push(
        line({
          category: 'Mechanical BOS',
          item: `Structure Steel — ${agg.label}`,
          spec: `HDG ${agg.label} (${agg.kgPerM} kg/m), key ${key}`,
          qty: Math.round(agg.kg * 10) / 10,
          unit: 'kg',
          unitPriceInr: PRICE_BOOK.steelPerKg,
          formula: `Member model: ${agg.parts.join('; ')}. ${STRUCTURE_DISCLAIMER}`,
        }),
      );
    }
    const ft = fastenerTotals(structures);
    if (ft.plates > 0)
      out.push(
        line({
          category: 'Mechanical BOS',
          item: ft.anchors > 0 ? 'Base Plates + Anchors' : 'Base Plates',
          spec: ft.anchors > 0 ? 'HDG plates, chemical/expansion anchors' : 'HDG base plates',
          qty: ft.plates,
          unit: 'plate',
          unitPriceInr:
            PRICE_BOOK.basePlatePc +
            Math.round((ft.anchors / ft.plates) * PRICE_BOOK.anchorBoltPc),
          formula: `${ft.plates} leg base plates × (plate + ${Math.round(ft.anchors / ft.plates)} anchors each) from the node graph. ${STRUCTURE_DISCLAIMER}`,
        }),
      );
    if (ft.ballast > 0)
      out.push(
        line({
          category: 'Mechanical BOS',
          item: 'Ballast Blocks',
          spec: 'precast concrete, on-slab (no roof penetration)',
          qty: ft.ballast,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.ballastBlock,
          formula: `1 block per leg base from the node graph. ${STRUCTURE_DISCLAIMER}`,
        }),
      );
    if (ft.piles > 0)
      out.push(
        line({
          category: 'Mechanical BOS',
          item: 'Ground Foundation — Driven Pile',
          spec: 'HDG rammed post, embedment per soil survey',
          qty: ft.piles,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.pileFoundation,
          formula: `1 pile per leg base from the node graph. Embedment depth and pull-out capacity are SOIL-dependent — site survey required. ${STRUCTURE_DISCLAIMER}`,
          confidence: 'assumed',
        }),
      );
    if (ft.pedestals > 0)
      out.push(
        line({
          category: 'Mechanical BOS',
          item: 'Ground Foundation — Concrete Pedestal',
          spec: 'cast-in-situ, incl. excavation + backfill',
          qty: ft.pedestals,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.concretePedestal,
          formula: `1 pedestal per leg base from the node graph. Volume and reinforcement are SOIL- and wind-dependent — engineer design required. ${STRUCTURE_DISCLAIMER}`,
          confidence: 'assumed',
        }),
      );
    if (ft.bolts > 0)
      out.push(
        line({
          category: 'Mechanical BOS',
          item: 'Structure Bolts (M10 SS)',
          spec: 'bolt + nut + washers per joint',
          qty: ft.bolts,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.structureBoltPc,
          formula: 'Σ joint nodes × bolts (leg-rafter 2, rafter-purlin 1, brace ends 1)',
        }),
      );
  }
  if (nFlatRcc > 0)
    out.push(
      line({
        category: 'Mechanical BOS',
        item: 'Mounting Structure (elevated RCC)',
        spec: 'HDG steel, 10° tilt legs + purlins',
        qty: nFlatRcc,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.structureLegPerPanel,
        formula: `${nFlatRcc} loose/unsegmented FLAT-RCC panels × structure share (pitched faces are billed flush hardware instead). ${STRUCTURE_DISCLAIMER}`,
      }),
    );
  if (nGround > 0)
    out.push(
      line({
        category: 'Mechanical BOS',
        item: 'Ground Mount Structure',
        spec: 'HDG steel table, tilt legs + foundation',
        qty: nGround,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.structureGroundPerPanel,
        formula: `${nGround} unsegmented ground-array panels × structure share (foundation type site-dependent — assumed). ${STRUCTURE_DISCLAIMER}`,
        confidence: 'assumed',
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
    out.push(
      line({
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
          `${nCov} panels on pitched ${hw.covering} faces × ~4 anchor points each, priced as ${hw.anchorItem}. ` +
          `Modules sit FLUSH on the pitch — no tilt legs, no ballast. ${hw.anchorNote} ${STRUCTURE_DISCLAIMER}`,
      }),
      line({
        category: 'Mechanical BOS',
        item: 'Roof Penetration Flashing & Sealing',
        spec: hw.sealSpec,
        qty: nCov,
        unit: 'panel-set',
        unitPriceInr: hw.sealPrice,
        confidence: 'estimated',
        formula:
          `${nCov} panels on pitched ${hw.covering} faces — every anchor penetrates the covering and must be weatherproofed. ` +
          hw.sealNote,
      }),
    );
  }
  if (nMetal > 0)
    out.push(
      line({
        category: 'Mechanical BOS',
        item: 'Mounting Structure (metal shed)',
        spec: 'Al mini-rails + roof clamps, flush mount (rails INCLUDED)',
        qty: nMetal,
        unit: 'panel-set',
        unitPriceInr: PRICE_BOOK.metalShedClampPerPanel,
        formula: `${nMetal} panels on metal shed roofs × clamp share (mini-rails bundled — no separate rail line)`,
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
  const structClamps = fastenerTotals(structures).clamps;
  const looseClampQty = (n - nStructured) * 2 + (n - nStructured > 0 ? 8 : 0);
  out.push(
    line({
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
      category: 'Mechanical BOS',
      item: 'Fasteners & Chemical Anchors',
      spec: 'SS304 kit',
      qty: 1,
      unit: 'kit',
      unitPriceInr: PRICE_BOOK.fastenersKit,
      formula: 'Per site kit (wiring/misc — structure anchors counted separately)',
    }),
  );

  // ── Safety
  const walkwayM2 = project.walkways.reduce(
    (s, w) => s + dist(w.a, w.b) * (w.widthMm / 1000),
    0,
  );
  if (walkwayM2 > 0)
    out.push(
      line({
        category: 'Safety',
        item: 'Walkway',
        spec: 'GRP anti-slip 800mm',
        qty: Math.ceil(walkwayM2),
        unit: 'm²',
        unitPriceInr: PRICE_BOOK.walkwayPerM2,
        formula: `${project.walkways.length} walkway(s), drawn length × width`,
      }),
    );
  const railLenM = project.rails.reduce((s, r) => s + dist(r.a, r.b), 0);
  if (railLenM > 0)
    out.push(
      line({
        category: 'Safety',
        item: 'Safety Rail',
        spec: 'GI 1100mm guard rail',
        qty: Math.ceil(railLenM),
        unit: 'm',
        unitPriceInr: PRICE_BOOK.safetyRailPerM,
        formula: 'Drawn rail length',
      }),
    );
  const earth = resolveRules().earthing;
  const roofH = Math.max(3, ...project.roofs.map((r) => r.heightM));
  if (project.arresters.length > 0) {
    // Each arrester drops down ITS OWN roof, not the tallest one on site: on a
    // multi-level building the old max-height rule priced every down conductor
    // as if it fell from the mumty.
    const dropM = project.arresters.reduce((sum, a) => {
      const h = project.roofs.find((r) => r.id === a.roofId)?.heightM ?? roofH;
      return sum + Math.max(3, h) + earth.laGroundRunM;
    }, 0);
    out.push(
      line({
        category: 'Safety',
        item: 'Lightning Arrester (ESE)',
        spec: '2m mast, 60m radius',
        qty: project.arresters.length,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.laUnit,
        // ASSUMED coverage: a real LPS layout is IS/IEC 62305 risk-class work
        formula: `${project.arresters.length} placed on canvas — ASSUMED coverage; LPS class/placement per IS/IEC 62305 needs engineer verification`,
      }),
      line({
        category: 'Safety',
        item: 'LA Down Conductor',
        spec: 'Cu strip 25×3',
        qty: Math.round(dropM),
        unit: 'm',
        unitPriceInr: PRICE_BOOK.downConductorPerM,
        formula: `Σ per arrester (its roof height + ${earth.laGroundRunM} m to pit) over ${project.arresters.length} LA`,
      }),
    );
  }
  const pits =
    earth.pitsForSystem + (project.arresters.length > 0 ? earth.pitsForLps : 0);
  out.push(
    line({
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
        (project.arresters.length > 0 ? ` + ${earth.pitsForLps} LPS` : ' (no arrester ⇒ no LPS pit)') +
        ` — ASSUMED convention; electrode count depends on measured soil resistivity (IS 3043), engineer to confirm`,
    }),
    line({
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
    const rules = resolveRules().defaults;
    if (rules.groundFenceEnabled && perimeterM > 0) {
      out.push(
        line({
          category: 'Safety',
          item: 'Perimeter Fencing',
          spec: 'chain-link on HDG posts',
          qty: perimeterM,
          unit: 'm',
          unitPriceInr: PRICE_BOOK.perimeterFencePerM,
          confidence: 'assumed',
          formula: `${perimeterM} m measured around ${groundAreas.length} array boundary${groundAreas.length > 1 ? 'ies' : ''}. Fence type/height is a CLIENT decision — ASSUMED.`,
        }),
        line({
          category: 'Safety',
          item: 'Fence Gate',
          spec: 'single vehicle gate',
          qty: groundAreas.length * rules.groundGatesPerArea,
          unit: 'nos',
          unitPriceInr: PRICE_BOOK.fenceGate,
          confidence: 'assumed',
          formula: `${rules.groundGatesPerArea} per array area — ASSUMED; access strategy is a site decision.`,
        }),
      );
    }
    // The strip line above runs conductor DOWN a building (roof height × pits).
    // A ground array has no height to run down — it needs a ring AROUND the
    // array instead. Without this the free-field earthing would bill ~nothing.
    out.push(
      line({
        category: 'Safety',
        item: 'Ground Array Earthing Ring',
        spec: 'GI strip, buried ring around the array',
        qty: perimeterM,
        unit: 'm',
        unitPriceInr: PRICE_BOOK.earthingStripPerM,
        confidence: 'assumed',
        formula: `${perimeterM} m ring following the array boundary. A ground array has no building to run conductor down — ASSUMED convention; ring sizing per IS 3043 and measured soil resistivity, engineer to confirm.`,
      }),
    );
  }

  // ── Civil & Misc
  out.push(
    line({
      category: 'Civil & Misc',
      item: 'Installation & Commissioning',
      spec: 'Labour, testing, net-meter liaison',
      qty: Math.round(kwp * 10) / 10,
      unit: 'kW',
      unitPriceInr: PRICE_BOOK.installationPerKw,
      formula: `${kwp.toFixed(1)} kWp × ₹${PRICE_BOOK.installationPerKw}/kW`,
    }),
    line({
      category: 'Civil & Misc',
      item: 'Transport & Handling',
      spec: 'To site',
      qty: 1,
      unit: 'lot',
      unitPriceInr: PRICE_BOOK.transportLumpsum,
      formula: 'Lumpsum',
    }),
  );

  return out;
}

// display-only rounding; the breaker itself is sized from EXACT amps by the
// shared acBreakerA so the BOM can never disagree with the SLD sheet
function acAmps(acKw: number, phases: 1 | 3): number {
  return Math.round(acFullLoadA(acKw, phases));
}
function mcbFor(acKw: number, phases: 1 | 3): number {
  return acBreakerA(acKw, phases);
}

/** Merge auto lines with user overrides/custom lines. */
export function mergedBom(project: Project): BomLine[] {
  const auto = deriveBom(project);
  const overrides = new Map(
    project.bomOverrides.filter((o) => !o.auto).map((o) => [o.id, o]),
  );
  const byKey = new Map(
    project.bomOverrides
      .filter((o) => o.auto && o.overridden)
      .map((o) => [o.category + '|' + o.item, o]),
  );
  const merged = auto.map((l) => byKey.get(l.category + '|' + l.item) ?? l);
  return [...merged, ...overrides.values()];
}

/**
 * The BOM's overall trustworthiness (plan §F3). A quote is only as strong as
 * its weakest line, so the header state is the WORST tier present. An
 * overridden line counts as 'measured' — a human took ownership of that number.
 */
export function bomConfidence(lines: BomLine[]): {
  /** worst tier present — the header badge */
  tier: BomLine['confidence'];
  counts: Record<BomLine['confidence'], number>;
  /** lines an engineer/surveyor must still confirm, by item */
  needsVerification: string[];
  /** true ⇒ the proposal must carry a site-verification warning */
  preliminary: boolean;
} {
  const order: BomLine['confidence'][] = ['measured', 'derived', 'estimated', 'assumed'];
  const counts = { measured: 0, derived: 0, estimated: 0, assumed: 0 };
  const needs: string[] = [];
  let worst = 0;
  for (const l of lines) {
    const c = l.overridden ? 'measured' : l.confidence;
    counts[c] += 1;
    worst = Math.max(worst, order.indexOf(c));
    if ((c === 'estimated' || c === 'assumed') && !needs.includes(l.item)) needs.push(l.item);
  }
  return {
    tier: order[worst] ?? 'derived',
    counts,
    needsVerification: needs,
    preliminary: counts.estimated > 0 || counts.assumed > 0,
  };
}

export function bomSubtotal(lines: BomLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.qty * l.unitPriceInr, 0));
}

/** Grand total incl. the project's persisted margin — the ONE quote total. */
export function bomTotal(lines: BomLine[], project: Project): number {
  const marginPct = project.pricing?.marginPct ?? DEFAULT_MARGIN_PCT;
  const sub = bomSubtotal(lines);
  return Math.round(sub * (1 + marginPct / 100));
}

export function bomToCsv(lines: BomLine[]): string {
  const head =
    'Category,Item,Spec,Qty,Unit,Unit Price (INR),Amount (INR),Confidence,Derivation';
  const rows = lines.map((l) =>
    [
      l.category,
      l.item,
      l.spec,
      l.qty,
      l.unit,
      l.unitPriceInr,
      Math.round(l.qty * l.unitPriceInr),
      l.overridden ? 'measured' : l.confidence,
      l.formula,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  const out = [head, ...rows];
  // notes travel WITH the exported quote (plan §F/§F3 gates). 9 columns now.
  const note = (t: string) => `"NOTE","${t}","","","","","","",""`;
  if (lines.some((l) => l.formula.includes(STRUCTURE_DISCLAIMER))) {
    out.push(note(STRUCTURE_DISCLAIMER));
  }
  const conf = bomConfidence(lines);
  if (conf.preliminary) {
    out.push(
      note(`PRELIMINARY — site verification required for: ${conf.needsVerification.join('; ')}`),
    );
  }
  return out.join('\n');
}
