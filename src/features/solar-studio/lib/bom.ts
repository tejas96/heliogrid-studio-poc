// ─── BOM automation: derive a full bill of materials from the design state ──
// Every line carries a human-readable formula so users can trust the numbers.
//
// This file is the PUBLIC module — everything outside lib/bom/ imports from
// here. The derivation itself lives in lib/bom/: a registry of semantic line
// keys, one shared context, and one emitter per category. `deriveBom` is the
// orchestrator that wires them together.
import type { BomLine, Project } from '../types';
import { DEFAULT_MARGIN_PCT } from '../data/pricebook';
import { STRUCTURE_DISCLAIMER } from './structure';
import { buildContext } from './bom/context';
import { emitModules } from './bom/emitters/modules';
import { emitInverter } from './bom/emitters/inverter';
import { emitElectrical } from './bom/emitters/electrical';
import { emitMechanical } from './bom/emitters/mechanical';
import { emitSafety } from './bom/emitters/safety';
import { emitCivil } from './bom/emitters/civil';

import { _setDeriver, mergeBom, type MergedBomResult } from './bom/merge';
import { bomMoney, discountAmount, lineMoney, orderQtyOf } from './bom/money';

export { bomMoney, lineMoney, orderQtyOf, type BomMoney, type LineMoney } from './bom/money';
export { isDiscreteUnit, wastePctFor } from './bom/registry';

export { CATEGORY_ORDER } from './bom/registry';
export {
  clearFieldOverride,
  clearOverrides,
  migrateLegacyOverrides,
  OVERRIDABLE_FIELDS,
  setFieldOverride,
  type BomOrphan,
  type MergedBomResult,
  type OverridableField,
} from './bom/merge';
export type { LineKey } from './bom/registry';
export type { BomContext } from './bom/context';

/**
 * The emitters, in CATEGORY_ORDER. Each is a pure function of the context and
 * owns exactly one category, so the order lines appear in the table is this
 * array — not the order some `out.push` happened to be written in.
 */
const EMITTERS = [
  emitModules,
  emitInverter,
  emitElectrical,
  emitMechanical,
  emitSafety,
  emitCivil,
];

// merge.ts needs to re-derive once during migration but must not import this
// module at load time (that would be a cycle) — hand it the deriver instead.
_setDeriver((p) => deriveBom(p));

export function deriveBom(project: Project): BomLine[] {
  const ctx = buildContext(project);
  // No panel spec, no inverter, or nothing placed ⇒ nothing to bill.
  if (!ctx) return [];
  return EMITTERS.flatMap((emit) => emit(ctx));
}

/** Merge auto lines with user overrides/custom lines. */
export function mergedBom(project: Project): BomLine[] {
  return mergedBomResult(project).lines;
}

/**
 * Merged lines PLUS any saved edits that no longer match the design.
 *
 * `mergedBom` stays the thin wrapper so the six existing call sites are
 * untouched; the BOM screen uses this form to surface orphans instead of
 * dropping them on the floor, which is what the old whole-line model did.
 */
export function mergedBomResult(project: Project): MergedBomResult {
  const auto = deriveBom(project);
  const legacyCustom = (project.bomOverrides ?? []).filter((o) => !o.auto);
  const r = mergeBom(auto, project);
  // legacy custom lines survive until the project migrates (normalize.ts)
  return project.bom
    ? r
    : { lines: [...r.lines, ...legacyCustom], orphans: r.orphans };
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
    // An EXCLUDED line is not in the quote, so it cannot set the quote's
    // confidence. This used to count everything, which meant excluding the
    // uncertain item left its "site verification required" warning behind —
    // and would have made the qty-0 prompt lines mark every quote PRELIMINARY
    // forever, since they ship excluded by design.
    if (l.included === false) continue;
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

/**
 * Buy cost before margin and tax — Σ (ORDER qty × price) over INCLUDED lines.
 * Order quantity, not calculated quantity: you pay for what you buy, waste and
 * all.
 */
export function bomSubtotal(lines: BomLine[], project?: Project): number {
  // `project` is optional so the existing call sites keep compiling; margin
  // does not enter the subtotal, so a zero-margin stub is safe.
  return bomMoney(lines, project ?? ({ pricing: { marginPct: 0 } } as Project)).subtotal;
}

/**
 * The ONE quote total: Σ per-line (sale value + that line's own GST).
 *
 * Computed line-wise because rates differ per line — 5% on a module, 18% on the
 * concrete beside it — so one subtotal times one rate would be wrong on every
 * quote that carries civil work. See lib/bom/money.ts for why margin sits below
 * the tax.
 */
export function bomTotal(lines: BomLine[], project: Project): number {
  return bomMoney(lines, project).total;
}

/**
 * The BOM as CSV — the file someone actually raises a purchase order from.
 *
 * It therefore has to carry ORDER QTY, not just the design quantity. Exporting
 * `qty` alone (as this did) hands procurement a number that is short by the
 * waste allowance on every cable and steel line, and an Amount that ignores
 * both the allowance and whether the line is even included. The columns now
 * match the Step-9 table, and the money comes from the same `lineMoney` the
 * screen and the proposal read.
 *
 * `project` supplies the margin. It is optional so the older call sites keep
 * compiling; without it the taxable/total columns are computed at zero margin
 * and the header says so, rather than quietly printing cost as if it were price.
 *
 * A DISCOUNT is applied to the sell-side columns only. `Amount` is what you pay
 * the supplier and a customer's negotiated deduction does not change it — but
 * Taxable/GST/Total are the QUOTE, and leaving them undiscounted meant the
 * Total column summed to a figure that no longer matched Step 9 or the
 * proposal. Same failure as the proposal equation that printed a sum which did
 * not hold; it is only less visible here because the file has no total row.
 */
export function bomToCsv(lines: BomLine[], project?: Project): string {
  const p = project ?? ({ pricing: { marginPct: 0 } } as Project);
  const marginPct = p.pricing?.marginPct ?? 0;
  // Pro-rata share each line keeps after the project-level discount — the same
  // apportionment bomMoney does across GST buckets, so the columns reconcile
  // with the quote instead of merely looking plausible.
  const taxableBefore = lines.reduce((s, l) => s + lineMoney(l, marginPct).taxable, 0);
  const cut = discountAmount(p.pricing?.discount, taxableBefore);
  const keep = taxableBefore > 0 ? (taxableBefore - cut) / taxableBefore : 1;
  const COLS = [
    'Category',
    'Item',
    // Brand is editable on the Step-9 row but had nowhere to land here, so a
    // make/model someone typed never reached the person ordering the parts.
    'Brand',
    'Spec',
    'Included',
    'Qty',
    'Waste %',
    'Order Qty',
    'Unit',
    'Unit Price (INR)',
    'Amount (INR)',
    `Taxable @ ${marginPct}% margin (INR)`,
    'GST %',
    'GST (INR)',
    'Total (INR)',
    'Confidence',
    'Derivation',
  ];
  // quoted like every data row — a header that quotes differently is the kind
  // of inconsistency that trips naive parsers on the receiving end
  const head = COLS.map((c) => `"${c}"`).join(',');
  const rows = lines.map((l) => {
    const m = lineMoney(l, marginPct);
    return [
      l.category,
      l.item,
      l.brand ?? '',
      l.spec,
      (l.included ?? true) ? 'yes' : 'NO — supplied by others',
      l.qty,
      l.wastePct ?? 0,
      m.orderQty,
      l.unit,
      l.unitPriceInr,
      // buy-side: what the supplier is paid, NEVER discounted
      Math.round(m.base),
      // sell-side: the customer's quote, so the deduction applies
      Math.round(m.taxable * keep),
      l.gstPct ?? 0,
      Math.round(m.gst * keep),
      Math.round(m.total * keep),
      l.overridden ? 'measured' : l.confidence,
      l.formula,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });
  const out = [head, ...rows];
  // notes travel WITH the exported quote (plan §F/§F3 gates). The padding is
  // derived from COLS so adding a column cannot silently misalign them.
  const note = (t: string) => `"NOTE","${t}"${',""'.repeat(COLS.length - 2)}`;
  if (lines.some((l) => l.formula.includes(STRUCTURE_DISCLAIMER))) {
    out.push(note(STRUCTURE_DISCLAIMER));
  }
  // A deduction spread silently across every line reads as mispriced rows.
  // Say it happened, and say it did NOT touch what the supplier is owed.
  if (cut > 0) {
    const d = p.pricing!.discount!;
    out.push(
      note(
        `DISCOUNT ${d.kind === 'percent' ? `${d.value}%` : `₹${d.value.toLocaleString('en-IN')}`}` +
          `${d.label ? ` (${d.label})` : ''} — ₹${Math.round(cut).toLocaleString('en-IN')} deducted pro-rata` +
          ` from the Taxable/GST/Total columns BEFORE tax. Amount (INR) is the supplier cost and is NOT discounted.`,
      ),
    );
  }
  const conf = bomConfidence(lines);
  if (conf.preliminary) {
    out.push(
      note(`PRELIMINARY — site verification required for: ${conf.needsVerification.join('; ')}`),
    );
  }
  return out.join('\n');
}
