import type { BomLine } from '../../../types';
import { acBreakerA, acFullLoadA, dcCableSizeMm2 } from '../../electrical-sizing';
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

  out.push(
    line({
      key: 'elec.dc_cable',
      category: 'Electrical BOS',
      // The size lives in `spec`, where it is DERIVED. It used to be baked into
      // this item name as a flat "4 sq.mm" that contradicted the derived spec
      // beside it on any high-Isc module. Safe to change now: since 22c the
      // override key is the LineKey, not the item text, so renaming an item no
      // longer orphans a user's saved edit.
      item: 'DC Solar Cable',
      // The conductor is SIZED, not assumed: smallest standard mm² whose
      // ampacity carries the string fuse (IEC 62548), from the module's own
      // Isc. This is the SAME dcCableSizeMm2 the SLD sheet prints, so the two
      // documents can no longer quote different cable for one system — the BOM
      // used to state a flat 4 sq.mm here and would have contradicted the SLD
      // on any high-Isc module.
      spec: `${dcCableSizeMm2(ctx.spec)} sq.mm Cu · 1.1kV, UV-resistant, red+black pair`,
      // A surveyed run the user typed in is THEIR measurement of the real site,
      // so it outranks our estimator — but it is still not the routed geometry,
      // which is why the three sources get three different labels rather than
      // collapsing to routed/not-routed.
      confidence:
        dcSource === 'routed' ? 'derived' : dcSource === 'input' ? 'measured' : 'estimated',
      qty: dcCableM,
      unit: 'm',
      unitPriceInr: PRICE_BOOK.dcCablePerM,
      // The old text claimed "(+15% slack incl.)" on a figure that had no slack
      // in it — the traceability line is the one thing a reviewer trusts, so it
      // now states exactly what was summed.
      formula:
        dcSource === 'routed'
          ? `Routed home runs ${routedDc.homeRunM} m` +
            (routedDc.intraM > 0 ? ` + ${routedDc.intraM} m inter-row hops` : '') +
            ` (incl. ${Math.round(rules.cable.slackPct * 100)}% slack, ${rules.cable.defaultVerticalDropM} m drop/run)`
          : dcSource === 'input'
            ? `YOUR SURVEYED RUN — ${project.bom!.inputs!.avgDcRunM} m average × ${Math.max(1, project.strings.length)} string(s) × 2 conductors, +${Math.round(rules.cable.slackPct * 100)}% slack. Routing the runs in Step 6 would replace this with measured geometry.`
            : `ESTIMATE — ${project.strings.length} strings × module-to-module + 15 m home run × 2 conductors, floored at 30 m (reads HIGH: it charges for module links the panel leads already cover). ` +
              (project.inverterPlacements.length === 0
                ? 'Place the inverter (Step 6 → Mount inverter), then Auto string, to route the real runs.'
                : 'Run Auto string to route the real runs.'),
    }),
    line({
      key: 'elec.ac_cable',
      category: 'Electrical BOS',
      item: 'AC Cable',
      spec: inv.phases === 3 ? '4-core 10 sq.mm Cu' : '3-core 6 sq.mm Cu',
      confidence:
        acSource === 'routed' ? 'derived' : acSource === 'input' ? 'measured' : 'assumed',
      // `acRunM`, not a second copy of the same ternary. This line used to
      // recompute its own quantity from `routedAc`, which meant the context's
      // figure and the printed figure were two expressions that merely happened
      // to agree — a third source would have moved one and not the other.
      qty: acRunM,
      unit: 'm',
      unitPriceInr: PRICE_BOOK.acCablePerM,
      // Measured only when the service entry has actually been placed. Until
      // then the length is genuinely unknown, so it is an ALLOWANCE and says
      // so — never an assumption dressed as a calculation.
      formula:
        acSource === 'routed'
          ? `Routed inverter → meter ${routedAc.meters} m (incl. ${Math.round(rules.cable.slackPct * 100)}% slack, ${rules.cable.defaultVerticalDropM} m drop)`
          : acSource === 'input'
            ? `YOUR SURVEYED RUN — ${project.bom!.inputs!.avgAcRunM} m inverter → LT panel, +${Math.round(rules.cable.slackPct * 100)}% slack. Placing the meter in Step 6 would replace this with measured geometry.`
            : `ASSUMED ${AC_ALLOWANCE_M} m allowance — no meter/service entry placed, so this run cannot be measured. Place it (Step 6 → Mount inverter → Meter), enter your surveyed run above, or edit the quantity.`,
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
