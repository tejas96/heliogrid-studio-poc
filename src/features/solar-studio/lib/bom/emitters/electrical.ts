import type { BomLine } from '../../../types';
import { acBreakerA, acFullLoadA, dcCableSizeMm2, sizeAcCable } from '../../electrical-sizing';
import { dcCableBySize, type DcCableBySize } from '../../electrical/dc-cable';
import { cableRatePerM } from '../../../data/pricebook';
import type { BomContext } from '../context';
import { AC_ALLOWANCE_M } from '../context';
import { line } from '../line';

// display-only rounding; the breaker itself is sized from EXACT amps by the
// shared acBreakerA so the BOM can never disagree with the SLD sheet
function acAmps(acKw: number, phases: 1 | 3): number {
  return Math.round(acFullLoadA(acKw, phases));
}
function mcbFor(acKw: number, phases: 1 | 3): number {
  return acBreakerA(acKw, phases);
}

/**
 * All project-wide: cable, protection and metering serve the SYSTEM. A home run
 * crosses roofs and the DCDB sits at the inverter, so none of these lines carry
 * a source roof/segment — attributing them to one roof would be a lie.
 */
export function emitElectrical(ctx: BomContext): BomLine[] {
  const {
    project,
    inv,
    invCount,
    n,
    rules,
    routedDc,
    routedAc,
    dcCableM,
    acRunM,
    conduitM,
    dcSource,
    acSource,
    pricebook: PRICE_BOOK,
  } = ctx;
  const out: BomLine[] = [];
  // `inv.acKw * invCount` — the SAME expression the ACDB breaker line uses, so
  // the cable and the device protecting it are sized from one number. Two
  // copies of this product would be two things that merely happen to agree.
  const acSystemKw = inv.acKw * invCount;
  // Sized against the RUN, because voltage drop usually governs it. `acRunM`
  // is the same length this line bills, so the cable is sized for the cable
  // that is actually quoted.
  const acCable = sizeAcCable(acSystemKw, inv.phases, acRunM);
  const acSizeMm2 = acCable.mm2;

  // The DC conductor is SIZED, not assumed — and once the runs are routed it is
  // sized PER STRING against both the fuse it carries (IEC 62548) and the drop
  // over its real loop (`sizeDcCable`), the same answer the SLD, the cable
  // schedule and the energy engine read. Different strings can land on
  // different sizes, so the routed quantity is one line PER SIZE; the size
  // carrying the most metres keeps the plain key (and any saved edit on it).
  const dcSpec = (mm2: number) => `${mm2} sq.mm Cu · 1.1kV, UV-resistant, red+black pair`;
  const dcSlackNote = `(incl. ${Math.round(rules.cable.slackPct * 100)}% slack, ${rules.cable.defaultVerticalDropM} m drop/run)`;
  const dcSizingNote = (row: DcCableBySize) =>
    ` · Conductor ${row.mm2} sq.mm for ${row.strings.length} string${row.strings.length === 1 ? '' : 's'}: ` +
    (row.dropGoverned > 0
      ? `governed by VOLTAGE DROP on ${row.dropGoverned} of them (longest loop ${Math.round(row.longestLoopM)} m → ${row.worstDropPct.toFixed(1)}%, limit ${rules.cable.maxDcDropPct}% at STC)`
      : `governed by the string fuse (longest loop ${Math.round(row.longestLoopM)} m → ${row.worstDropPct.toFixed(1)}%, inside the ${rules.cable.maxDcDropPct}% limit)`) +
    '.';
  const dcSizes = dcSource === 'routed' ? dcCableBySize(project) : [];
  const dcMain = dcSizes.length ? dcSizes.reduce((a, b) => (b.meters > a.meters ? b : a)) : null;
  if (dcMain) {
    for (const row of dcSizes) {
      out.push(
        line({
          key: 'elec.dc_cable',
          ...(row === dcMain ? {} : { instance: String(row.mm2) }),
          category: 'Electrical BOS',
          item: 'DC Solar Cable',
          spec: dcSpec(row.mm2),
          confidence: 'derived',
          qty: row.meters,
          unit: 'm',
          unitPriceInr: cableRatePerM(PRICE_BOOK.dcCablePerMBySize, row.mm2),
          formula:
            `Routed home runs ${row.homeRunM} m` +
            (row.intraM > 0 ? ` + ${row.intraM} m inter-row hops` : '') +
            ` ${dcSlackNote}` +
            dcSizingNote(row),
        }),
      );
    }
  } else {
    out.push(
      line({
        key: 'elec.dc_cable',
        category: 'Electrical BOS',
        item: 'DC Solar Cable',
        spec: dcSpec(dcCableSizeMm2(ctx.spec)),
        // A surveyed run the user typed in is THEIR measurement of the real
        // site, so it outranks our estimator — but it is still not the routed
        // geometry, which is why the two sources get two different labels.
        confidence: dcSource === 'input' ? 'measured' : 'estimated',
        qty: dcCableM,
        unit: 'm',
        unitPriceInr: cableRatePerM(PRICE_BOOK.dcCablePerMBySize, dcCableSizeMm2(ctx.spec)),
        formula:
          (dcSource === 'input'
            ? `YOUR SURVEYED RUN — ${project.bom!.inputs!.avgDcRunM} m average × ${Math.max(1, project.strings.length)} string(s) × 2 conductors, +${Math.round(rules.cable.slackPct * 100)}% slack. Routing the runs in Step 6 would replace this with measured geometry.`
            : `ESTIMATE — ${project.strings.length} strings × (2 × 15 m home runs + hops beyond the ${rules.cable.moduleLeadReachM} m module leads), +${Math.round(rules.cable.slackPct * 100)}% slack, floored at 30 m. ` +
              (project.inverterPlacements.length === 0
                ? 'Place the inverter (Step 6 → Mount inverter), then Auto string, to route the real runs.'
                : 'Run Auto string to route the real runs.')) +
          ` · Conductor ${dcCableSizeMm2(ctx.spec)} sq.mm carries the string fuse; the ${rules.cable.maxDcDropPct}% drop sizing runs once the runs are routed.`,
      }),
    );
  }

  out.push(
    line({
      key: 'elec.ac_cable',
      category: 'Electrical BOS',
      item: 'AC Cable',
      // SIZED, not asserted. This was `phases === 3 ? '10 sq.mm' : '6 sq.mm'`
      // — a fixed pair that ignored system size, so any three-phase system past
      // roughly 30 kW was quoted a cable that could not carry its own breaker.
      spec: `${inv.phases === 3 ? 4 : 3}-core ${acSizeMm2} sq.mm Cu`,
      confidence:
        acSource === 'routed' ? 'derived' : acSource === 'input' ? 'measured' : 'assumed',
      // `acRunM`, not a second copy of the same ternary. This line used to
      // recompute its own quantity from `routedAc`, which meant the context's
      // figure and the printed figure were two expressions that merely happened
      // to agree — a third source would have moved one and not the other.
      qty: acRunM,
      unit: 'm',
      unitPriceInr: cableRatePerM(PRICE_BOOK.acCablePerMBySize, acSizeMm2),
      // Measured only when the service entry has actually been placed. Until
      // then the length is genuinely unknown, so it is an ALLOWANCE and says
      // so — never an assumption dressed as a calculation.
      // Two independent stories on this line — how LONG and how THICK — so the
      // formula carries both. The conductor caveat is not boilerplate: ampacity
      // alone does not size an AC run, and an installer reading "10 sq.mm"
      // without knowing voltage drop was skipped could under-build the job.
      formula:
        (acSource === 'routed'
          ? `Routed inverter → meter ${routedAc.meters} m (incl. ${Math.round(rules.cable.slackPct * 100)}% slack, ${rules.cable.defaultVerticalDropM} m drop)`
          : acSource === 'input'
            ? `YOUR SURVEYED RUN — ${project.bom!.inputs!.avgAcRunM} m inverter → LT panel, +${Math.round(rules.cable.slackPct * 100)}% slack. Placing the meter in Step 6 would replace this with measured geometry.`
            : `ASSUMED ${AC_ALLOWANCE_M} m allowance — no meter/service entry placed, so this run cannot be measured. Place it (Step 6 → Mount inverter → Meter), enter your surveyed run above, or edit the quantity.`) +
        ` · Conductor ${acSizeMm2} sq.mm from ${acAmps(acSystemKw, inv.phases)} A full load, carrying the ${mcbFor(acSystemKw, inv.phases)} A breaker. Governed by ${
          acCable.governedBy === 'voltage-drop'
            ? `VOLTAGE DROP (${acCable.voltDropPct.toFixed(1)}% over ${Math.round(acRunM)} m, limit ${rules.acSizing.voltDropLimitPct}% — ampacity alone would have allowed ${acCable.ampacityMm2} sq.mm)`
            : `AMPACITY (drop ${acCable.voltDropPct.toFixed(1)}% over ${Math.round(acRunM)} m, inside the ${rules.acSizing.voltDropLimitPct}% limit)`
        }.${
          acCable.singleRunAdequate
            ? ''
            : ' NO SINGLE CABLE CARRIES THIS BREAKER — parallel runs or a busbar are required; engineer to size.'
        } Grouping, ambient above 40 °C and installation method are NOT modelled — engineer to verify.`,
    }),
    line({
      key: 'elec.mc4',
      category: 'Electrical BOS',
      item: 'MC4 Connector Pairs',
      spec: '1000V 30A',
      qty: project.strings.length * 2 + 4,
      unit: 'pairs',
      unitPriceInr: PRICE_BOOK.mc4PairPrice,
      formula: `${project.strings.length} strings × 2 + 4 spare`,
    }),
    line({
      key: 'elec.dcdb',
      category: 'Electrical BOS',
      item: 'DCDB',
      spec: `${project.strings.length}-in ${inv.mppt.count}-out, fuses + Type-II SPD`,
      qty: invCount,
      unit: 'nos',
      unitPriceInr: PRICE_BOOK.dcdb + PRICE_BOOK.spdDc,
      formula: 'One per inverter, sized from string count',
    }),
    line({
      key: 'elec.acdb',
      category: 'Electrical BOS',
      item: 'ACDB',
      spec: `${mcbFor(inv.acKw * invCount, inv.phases)}A MCB + Type-II SPD`,
      qty: 1,
      unit: 'nos',
      unitPriceInr: PRICE_BOOK.acdb + PRICE_BOOK.spdAc,
      formula: `AC current ${acAmps(inv.acKw * invCount, inv.phases)}A × 1.25 safety`,
    }),
    line({
      key: 'elec.conduit',
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
      key: 'elec.meters',
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
        key: 'elec.optimizer',
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

  // ── DC collection: central/C&I topology adds fused string-combiner boxes.
  const plan = ctx.combiner;
  if (plan?.ok) {
    const maxIn = rules.combiner.maxStringsPerBox;
    out.push(
      line({
        key: 'elec.combiner',
        category: 'Electrical BOS',
        item: 'String Combiner Box (SCB)',
        spec: `up to ${maxIn}-in · ${plan.stringFuseA}A fuses + isolator + Type-II SPD`,
        qty: plan.boxes.length,
        unit: 'nos',
        unitPriceInr: PRICE_BOOK.combinerBox + PRICE_BOOK.spdDc,
        formula: `${plan.totalStrings} strings ÷ ${maxIn}/box = ${plan.boxes.length} combiner${plan.boxes.length > 1 ? 's' : ''} (central topology)`,
      }),
      line({
        key: 'elec.string_fuse',
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

  return out;
}
