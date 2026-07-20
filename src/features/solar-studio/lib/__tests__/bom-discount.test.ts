// ─── Gate: the negotiated discount ──────────────────────────────────────────
// Adders were always expressible as custom BOM lines; deductions never were,
// because qty and rate are both floored at 0. So a quote could be marked up
// but never negotiated down — in a market where every rooftop job is haggled.
//
// The load-bearing rule is WHERE the deduction sits. Margin and GST commute,
// so their order only changes what the invoice declares. A discount does NOT
// commute: taxing before deducting charges GST on money nobody pays. Before is
// also what the law requires — a discount recorded on the invoice at the time
// of supply is excluded from the taxable value (CGST Act s.15(3)(a)).
import { describe, expect, it } from 'vitest';
import { bomMoney, discountAmount } from '../bom/money';
import type { BomLine, Project } from '../../types';

const line = (over: Partial<BomLine> = {}): BomLine => ({
  id: 'x',
  category: 'Modules',
  item: 'Module',
  spec: '',
  qty: 100,
  unit: 'nos',
  unitPriceInr: 10,
  formula: '',
  confidence: 'derived',
  auto: true,
  overridden: false,
  included: true,
  wastePct: 0,
  gstPct: 18,
  ...over,
});

const proj = (marginPct: number, discount?: Project['pricing']['discount']): Project =>
  ({ pricing: { marginPct, ...(discount ? { discount } : {}) } }) as Project;

describe('the discount is deducted BEFORE GST', () => {
  it('the hand-computed case: ₹1,00,000 taxable, 18%, ₹10,000 off', () => {
    // 1000 units × ₹100 = ₹1,00,000 cost, 0% margin so taxable == cost
    const lines = [line({ qty: 1000, unitPriceInr: 100, gstPct: 18 })];
    const m = bomMoney(lines, proj(0, { kind: 'amount', value: 10000 }));

    expect(m.taxableBeforeDiscount).toBe(100000);
    expect(m.discount).toBe(10000);
    expect(m.taxable).toBe(90000);
    expect(m.gst).toBe(16200); // 18% of 90,000 — NOT of 1,00,000
    expect(m.total).toBe(106200);
  });

  it('deducting AFTER GST would have charged ₹1,800 more', () => {
    // the number this whole design exists to avoid: GST on the discount
    const lines = [line({ qty: 1000, unitPriceInr: 100, gstPct: 18 })];
    const before = bomMoney(lines, proj(0, { kind: 'amount', value: 10000 })).total;
    const undiscounted = bomMoney(lines, proj(0)).total;
    const naiveAfterGst = undiscounted - 10000;
    expect(naiveAfterGst - before).toBe(1800);
  });

  it('a percentage discount is taken off the pre-discount taxable value', () => {
    const lines = [line({ qty: 1000, unitPriceInr: 100, gstPct: 18 })];
    const m = bomMoney(lines, proj(0, { kind: 'percent', value: 10 }));
    expect(m.discount).toBe(10000);
    expect(m.taxable).toBe(90000);
  });

  it('the discount comes out of MARGIN, not cost — subtotal is untouched', () => {
    const lines = [line({ qty: 1000, unitPriceInr: 100 })];
    const plain = bomMoney(lines, proj(20));
    const cut = bomMoney(lines, proj(20, { kind: 'percent', value: 10 }));
    expect(cut.subtotal).toBe(plain.subtotal);
    expect(cut.taxable).toBeLessThan(plain.taxable);
  });
});

describe('apportionment across GST rates', () => {
  // one project-level discount, two tax liabilities — taking it all off one
  // bucket would misstate the GST due on both
  const mixed = () => [
    line({ id: 'a', qty: 100, unitPriceInr: 100, gstPct: 5 }), // 10,000 @ 5%
    line({ id: 'b', qty: 100, unitPriceInr: 100, gstPct: 18 }), // 10,000 @ 18%
  ];

  it('splits pro-rata, so each rate keeps its share', () => {
    const m = bomMoney(mixed(), proj(0, { kind: 'amount', value: 4000 }));
    // 20,000 pre-discount, 4,000 off ⇒ each bucket keeps 80%
    expect(m.taxableBeforeDiscount).toBe(20000);
    expect(m.gstByRate).toEqual([
      { pct: 5, taxable: 8000, gst: 400 },
      { pct: 18, taxable: 8000, gst: 1440 },
    ]);
    expect(m.gst).toBe(1840);
  });

  it('the rate summary still sums to the stated totals', () => {
    for (const value of [0, 1500, 7777, 19999]) {
      const m = bomMoney(mixed(), proj(12, { kind: 'amount', value }));
      const sumTaxable = m.gstByRate.reduce((s, b) => s + b.taxable, 0);
      const sumGst = m.gstByRate.reduce((s, b) => s + b.gst, 0);
      // a document whose components do not sum to its total is one someone
      // has to explain
      expect(Math.abs(sumTaxable - m.taxable), `taxable @ ${value}`).toBeLessThanOrEqual(1);
      expect(Math.abs(sumGst - m.gst), `gst @ ${value}`).toBeLessThanOrEqual(1);
    }
  });

  it('a single-rate quote behaves exactly as the simple arithmetic says', () => {
    const m = bomMoney([line({ qty: 100, unitPriceInr: 100, gstPct: 18 })], proj(0, {
      kind: 'percent',
      value: 25,
    }));
    expect(m.taxable).toBe(7500);
    expect(m.gst).toBe(1350);
  });
});

describe('what a discount must never do', () => {
  it('cannot invert the quote — a 200% discount gives it away, not more', () => {
    const m = bomMoney([line({ qty: 100, unitPriceInr: 100 })], proj(0, {
      kind: 'percent',
      value: 200,
    }));
    expect(m.discount).toBe(10000);
    expect(m.taxable).toBe(0);
    expect(m.gst).toBe(0);
    expect(m.total).toBe(0);
  });

  it('a flat figure larger than the quote is clamped, not negative', () => {
    const m = bomMoney([line({ qty: 100, unitPriceInr: 100 })], proj(0, {
      kind: 'amount',
      value: 999999,
    }));
    expect(m.total).toBe(0);
    expect(m.taxable).toBeGreaterThanOrEqual(0);
  });

  it('a negative or nonsense discount is ignored, not applied backwards', () => {
    // Infinity is ignored rather than clamped to "the whole quote". Garbage in
    // should not silently give the job away — a corrupt field is far more
    // likely than someone genuinely meaning to discount by infinity.
    for (const value of [-500, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const m = bomMoney([line({ qty: 100, unitPriceInr: 100 })], proj(0, {
        kind: 'amount',
        value,
      }));
      expect(m.discount, `value ${value}`).toBe(0);
      expect(m.total, `total @ ${value}`).toBe(11800);
    }
  });

  it('an empty BOM does not divide by zero', () => {
    const m = bomMoney([], proj(12, { kind: 'percent', value: 10 }));
    expect(m).toMatchObject({ subtotal: 0, taxable: 0, gst: 0, total: 0, discount: 0 });
  });

  it('excluded lines are not discounted into existence', () => {
    const m = bomMoney([line({ included: false })], proj(0, { kind: 'percent', value: 10 }));
    expect(m.taxableBeforeDiscount).toBe(0);
    expect(m.discount).toBe(0);
  });
});

describe('selling below cost is reported, not blocked', () => {
  it('flags when the deduction eats past the margin', () => {
    // 20% margin then 50% off is well under cost
    const m = bomMoney([line({ qty: 100, unitPriceInr: 100 })], proj(20, {
      kind: 'percent',
      value: 50,
    }));
    expect(m.subtotal).toBe(10000);
    expect(m.taxable).toBe(6000);
    expect(m.belowCost).toBe(true);
  });

  it('a discount inside the margin is not flagged', () => {
    const m = bomMoney([line({ qty: 100, unitPriceInr: 100 })], proj(20, {
      kind: 'percent',
      value: 5,
    }));
    expect(m.belowCost).toBe(false);
  });

  it('an undiscounted quote with margin is never below cost', () => {
    expect(bomMoney([line()], proj(12)).belowCost).toBe(false);
  });
});

describe('no discount ⇒ nothing changes', () => {
  it('the money is identical to before the feature existed', () => {
    const lines = [line({ gstPct: 5 }), line({ id: 'b', gstPct: 18 })];
    const m = bomMoney(lines, proj(12));
    expect(m.discount).toBe(0);
    expect(m.taxable).toBe(m.taxableBeforeDiscount);
    expect(m.total).toBe(m.taxable + m.gst);
  });

  it('discountAmount is 0 for an absent rule', () => {
    expect(discountAmount(undefined, 50000)).toBe(0);
  });
});

// ─── The bug the money tests could not see ──────────────────────────────────
// Every test above passed while the discount was being silently erased on
// load. `normalizeProject` REBUILDS `pricing` rather than spreading it, so a
// field added to PricingSettings without touching that function saves fine and
// then vanishes on the next normalize pass — which is exactly what a route
// change triggers. Caught by driving the app, not by the suite.
describe('the discount survives persistence', () => {
  it('normalizeProject keeps it — it used to rebuild pricing and drop it', async () => {
    const { normalizeProject } = await import('../persistence/normalize');
    const p = {
      ...(proj(18, { kind: 'amount', value: 50000 }) as Project),
    } as Project;
    expect(normalizeProject(p).pricing.discount).toEqual({ kind: 'amount', value: 50000 });
    expect(normalizeProject(p).pricing.marginPct).toBe(18);
  });

  it('a project with no discount SERIALIZES without the key', async () => {
    // the invariant is the stored BYTES, not the in-memory key. normalizePricing
    // always mentions `discount` (that is what makes forgetting it a compile
    // error) but an absent rule is `undefined`, and JSON.stringify drops it —
    // so a project that never discounted persists byte-identically and its
    // captures stay fresh.
    const { normalizeProject } = await import('../persistence/normalize');
    const out = normalizeProject(proj(12) as Project);
    expect(out.pricing.discount).toBeUndefined();
    expect(JSON.stringify(out.pricing)).toBe('{"marginPct":12}');
  });

  it('a corrupt or zero rule is dropped, not carried', async () => {
    const { normalizeProject } = await import('../persistence/normalize');
    for (const bad of [
      { kind: 'percent', value: 0 },
      { kind: 'percent', value: -5 },
      { kind: 'amount', value: Number.NaN },
      null,
      'nonsense',
    ]) {
      const out = normalizeProject({
        pricing: { marginPct: 12, discount: bad },
      } as unknown as Project);
      expect(out.pricing.discount, JSON.stringify(bad)).toBeUndefined();
      expect(JSON.stringify(out.pricing), JSON.stringify(bad)).toBe('{"marginPct":12}');
    }
  });

  it('an absurd percentage is clamped to 100, not stored raw', async () => {
    const { normalizeProject } = await import('../persistence/normalize');
    const out = normalizeProject({
      pricing: { marginPct: 12, discount: { kind: 'percent', value: 5000 } },
    } as unknown as Project);
    expect(out.pricing.discount).toEqual({ kind: 'percent', value: 100 });
  });

  it('an unknown kind falls back to percent rather than being trusted', async () => {
    const { normalizeProject } = await import('../persistence/normalize');
    const out = normalizeProject({
      pricing: { marginPct: 12, discount: { kind: 'bananas', value: 10 } },
    } as unknown as Project);
    expect(out.pricing.discount).toEqual({ kind: 'percent', value: 10 });
  });
});
