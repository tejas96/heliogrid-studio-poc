// ─── BOM money (Phase 22d) ──────────────────────────────────────────────────
// ⚠️ THE ORDER OF MARGIN AND GST IS NOT ARBITRARY. Read this before "fixing" it.
//
//     lineBase    = orderQty × unitPriceInr      (0 when the line is excluded)
//     lineTaxable = lineBase × (1 + marginPct)   ← margin FIRST
//     lineGst     = lineTaxable × gstPct
//     lineTotal   = lineTaxable + lineGst
//
// GST is charged on the SALE price, not on your cost. Margin therefore sits
// BELOW the tax: you mark the cost up, then tax what you are actually selling
// for.
//
// Note the trap here: both are plain multipliers, so the ORDER DOES NOT CHANGE
// THE TOTAL — cost × margin × gst == cost × gst × margin. It is tempting to
// conclude the order is therefore arbitrary. It is not. What changes is what
// the invoice DECLARES: taxing the cost first reports a taxable value of the
// cost rather than the sale price, and a tax amount to match. On ₹1000 at 20%
// margin and 5% GST that is a declared ₹1050 / ₹50 instead of the correct
// ₹1200 / ₹60 — same money collected, wrong GST return.
//
// Everything is computed LINE-WISE rather than as one subtotal × one rate,
// because rates differ per line — 5% on a module and 18% on the concrete beside
// it. Summing first and taxing once would be wrong the moment a quote carries
// both, which is every quote with civil work in it.
import type { BomLine, Project, QuoteDiscount } from '../../types';
import { DEFAULT_MARGIN_PCT } from '../../data/pricebook';
import { isDiscreteUnit } from './registry';

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * What to actually BUY: the calculated quantity plus its waste allowance,
 * rounded the way the unit is sold. Discrete units ceil — you cannot order
 * 0.15 of a module.
 */
export function orderQtyOf(line: BomLine): number {
  const waste = line.wastePct ?? 0;
  const raw = line.qty * (1 + waste / 100);
  return isDiscreteUnit(line.unit) ? Math.ceil(round2(raw)) : round2(raw);
}

export interface LineMoney {
  orderQty: number;
  /** what it costs to buy, before margin and tax. 0 when excluded. */
  base: number;
  /** what it is sold for, before tax */
  taxable: number;
  gst: number;
  total: number;
}

export function lineMoney(line: BomLine, marginPct: number): LineMoney {
  const orderQty = orderQtyOf(line);
  // An excluded line stays visible and keeps its numbers, but contributes
  // nothing — to base, to margin, and to GST. Zeroing only the subtotal would
  // leave phantom tax on something not being supplied.
  const included = line.included ?? true;
  const base = included ? orderQty * line.unitPriceInr : 0;
  const taxable = base * (1 + marginPct / 100);
  const gst = taxable * ((line.gstPct ?? 0) / 100);
  return { orderQty, base, taxable, gst, total: taxable + gst };
}

function marginOf(project: Project): number {
  return project.pricing?.marginPct ?? DEFAULT_MARGIN_PCT;
}

// ─── AND WHERE THE DISCOUNT SITS IS NOT ARBITRARY EITHER ────────────────────
// The note above says the margin/GST order does not change the total, only
// what is DECLARED. A discount is the opposite: its position genuinely moves
// money, so this one cannot be waved through.
//
//     before GST:  (taxable − discount) × (1 + gst)
//     after GST:   taxable × (1 + gst) − discount
//
// On ₹1,00,000 at 18% with a ₹10,000 discount that is ₹1,06,200 against
// ₹1,08,000 — the ₹1,800 difference is the GST charged on money nobody paid.
//
// Before is both correct and required: a discount given at the time of supply
// and recorded on the invoice is excluded from the taxable value (CGST Act
// s.15(3)(a)). Taxing it anyway overcharges the customer and overstates the
// installer's output-tax liability.
//
// SCOPE, stated plainly: this app issues a PROPOSAL, not a tax invoice. For
// s.15(3)(a) to actually apply, the discount must appear on the invoice the
// installer raises in their accounting system. Computing it correctly here
// makes the quote honest and the two documents agree; it does not by itself
// make anyone compliant.
//
// Because GST rates differ per line, one project-level discount has to be
// APPORTIONED across the rate buckets pro-rata to their taxable value — there
// is no single rate to reduce. Everything below computes the buckets first and
// derives the totals FROM them, so the rate summary and the quote total cannot
// drift apart.

export interface BomMoney {
  /** Σ buy cost, pre-margin, pre-tax. A discount never touches this: cost is
   *  cost, and the deduction comes out of margin. */
  subtotal: number;
  /** Σ sale value pre-tax, BEFORE any discount */
  taxableBeforeDiscount: number;
  /** rupees actually deducted — clamped to the taxable value, never negative */
  discount: number;
  /** Σ sale value, pre-tax, AFTER the discount — the GST base */
  taxable: number;
  /** Σ GST, computed per line because rates differ per line */
  gst: number;
  /** Σ taxable + gst — the number on the quote */
  total: number;
  /** GST broken out by rate, for the invoice summary — post-discount */
  gstByRate: { pct: number; taxable: number; gst: number }[];
  /**
   * true ⇒ the discount has pushed the sale price below what the kit costs to
   * buy. Reported rather than blocked: selling at a loss is occasionally a
   * deliberate commercial decision, but it should never happen by accident.
   */
  belowCost: boolean;
}

/** Rupees to deduct, clamped so a discount can never invert the quote. */
export function discountAmount(
  discount: QuoteDiscount | undefined,
  taxableBeforeDiscount: number,
): number {
  if (!discount || taxableBeforeDiscount <= 0) return 0;
  const raw =
    discount.kind === 'percent'
      ? (taxableBeforeDiscount * discount.value) / 100
      : discount.value;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // A 120% discount, or a flat figure larger than the quote, gives the job
  // away — it does not start paying the customer.
  return Math.min(raw, taxableBeforeDiscount);
}

export function bomMoney(lines: BomLine[], project: Project): BomMoney {
  const marginPct = marginOf(project);
  const byRate = new Map<number, number>(); // pct → taxable, pre-discount
  let subtotal = 0;
  let taxableBefore = 0;

  for (const l of lines) {
    const m = lineMoney(l, marginPct);
    subtotal += m.base;
    taxableBefore += m.taxable;
    if (m.taxable > 0) {
      const pct = l.gstPct ?? 0;
      byRate.set(pct, (byRate.get(pct) ?? 0) + m.taxable);
    }
  }

  // Apportion the deduction pro-rata across the rate buckets. Taking it all
  // off one rate would change the GST due — the customer's 5% module bucket
  // and the 18% civil bucket are different tax liabilities, and a discount on
  // the whole job reduces both in proportion.
  const discount = discountAmount(project.pricing?.discount, taxableBefore);
  const keep = taxableBefore > 0 ? (taxableBefore - discount) / taxableBefore : 1;

  let taxable = 0;
  let gst = 0;
  const buckets: { pct: number; taxable: number; gst: number }[] = [];
  for (const [pct, taxablePre] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
    const t = taxablePre * keep;
    const g = t * (pct / 100);
    taxable += t;
    gst += g;
    buckets.push({ pct, taxable: Math.round(t), gst: Math.round(g) });
  }

  // Round ONCE, then add. `round(taxable + gst)` can differ by a rupee from
  // `round(taxable) + round(gst)`, and the second is what the quote prints —
  // a document whose stated components do not sum to its stated total is a
  // document someone has to explain.
  const taxableR = Math.round(taxable);
  const gstR = Math.round(gst);
  const subtotalR = Math.round(subtotal);
  return {
    subtotal: subtotalR,
    taxableBeforeDiscount: Math.round(taxableBefore),
    discount: Math.round(discount),
    taxable: taxableR,
    gst: gstR,
    total: taxableR + gstR,
    gstByRate: buckets,
    belowCost: taxableR < subtotalR,
  };
}
