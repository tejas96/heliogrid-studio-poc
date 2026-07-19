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
import type { BomLine, Project } from '../../types';
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

export interface BomMoney {
  /** Σ buy cost, pre-margin, pre-tax */
  subtotal: number;
  /** Σ sale value, pre-tax */
  taxable: number;
  /** Σ GST, computed per line because rates differ per line */
  gst: number;
  /** Σ taxable + gst — the number on the quote */
  total: number;
  /** GST broken out by rate, for the invoice summary */
  gstByRate: { pct: number; taxable: number; gst: number }[];
}

export function bomMoney(lines: BomLine[], project: Project): BomMoney {
  const marginPct = marginOf(project);
  const byRate = new Map<number, { taxable: number; gst: number }>();
  let subtotal = 0;
  let taxable = 0;
  let gst = 0;

  for (const l of lines) {
    const m = lineMoney(l, marginPct);
    subtotal += m.base;
    taxable += m.taxable;
    gst += m.gst;
    if (m.taxable > 0) {
      const pct = l.gstPct ?? 0;
      const slot = byRate.get(pct) ?? { taxable: 0, gst: 0 };
      slot.taxable += m.taxable;
      slot.gst += m.gst;
      byRate.set(pct, slot);
    }
  }

  // Round ONCE, then add. `round(taxable + gst)` can differ by a rupee from
  // `round(taxable) + round(gst)`, and the second is what the quote prints —
  // a document whose stated components do not sum to its stated total is a
  // document someone has to explain.
  const taxableR = Math.round(taxable);
  const gstR = Math.round(gst);
  return {
    subtotal: Math.round(subtotal),
    taxable: taxableR,
    gst: gstR,
    total: taxableR + gstR,
    gstByRate: [...byRate.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pct, v]) => ({ pct, taxable: Math.round(v.taxable), gst: Math.round(v.gst) })),
  };
}
