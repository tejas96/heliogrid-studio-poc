// ─── Phase 22d gates: waste, order qty, GST, include/exclude ────────────────
// This arithmetic decides what a customer is asked to pay, so every rule gets a
// hand-computed case rather than a comparison against the implementation.
import { describe, expect, it } from 'vitest';
import { bomMoney, deriveBom, isDiscreteUnit, lineMoney, mergedBom, orderQtyOf } from '../bom';
import { editBomField, resetBomField } from '../bom/edit';
import { GST_EQUIPMENT_PCT, GST_SERVICE_PCT, gstPctFor } from '../../data/gst';
import { wastePctFor } from '../bom/registry';
import { fixtureProject } from './fixtures/project';
import type { BomLine, Project } from '../../types';

const mk = (over: Partial<BomLine> = {}): BomLine => ({
  id: 'test.line',
  category: 'Electrical BOS',
  item: 'Test',
  spec: '',
  qty: 100,
  unit: 'm',
  unitPriceInr: 10,
  formula: 'test',
  confidence: 'derived',
  auto: true,
  overridden: false,
  included: true,
  wastePct: 0,
  gstPct: 0,
  ...over,
});

// ══════════════════════════════════════════════════ ORDER QUANTITY ══════════
describe('order qty — you pay for what you BUY', () => {
  it('adds the waste allowance', () => {
    expect(orderQtyOf(mk({ qty: 100, wastePct: 8, unit: 'm' }))).toBe(108);
  });

  it('keeps two decimals on a continuous unit', () => {
    expect(orderQtyOf(mk({ qty: 504, wastePct: 8, unit: 'm' }))).toBe(544.32);
  });

  // The reference tool prints `116.15 Nos` of a module. You cannot buy 0.15 of
  // a panel; the order has to be a whole number or it is not an order.
  it('CEILS a discrete unit — no fractional modules', () => {
    // the reference tool prints 115 × 1% = "116.15 Nos"; needing 116.15 means
    // ordering 117, because the 117th panel is the one that makes 116.15 real
    expect(orderQtyOf(mk({ qty: 115, wastePct: 1, unit: 'Nos' }))).toBe(117);
    expect(orderQtyOf(mk({ qty: 10, wastePct: 5, unit: 'Set' }))).toBe(11);
    expect(orderQtyOf(mk({ qty: 47, wastePct: 3, unit: 'Pairs' }))).toBe(49);
  });

  it('ceils even a hair over — 100.01 modules is 101 modules', () => {
    expect(orderQtyOf(mk({ qty: 100, wastePct: 0.01, unit: 'Nos' }))).toBe(101);
  });

  it('an exact discrete quantity does NOT gain a spurious unit', () => {
    expect(orderQtyOf(mk({ qty: 12, wastePct: 0, unit: 'Nos' }))).toBe(12);
  });

  it('classifies units case- and space-insensitively', () => {
    for (const u of ['Nos', 'nos', ' NOS ', 'Set', 'pairs', 'Lot', 'kit']) {
      expect(isDiscreteUnit(u), u).toBe(true);
    }
    for (const u of ['m', 'm²', 'kg', 'Kg']) expect(isDiscreteUnit(u), u).toBe(false);
  });

  it('zero waste is the default for a counted item, not a quiet pad', () => {
    expect(wastePctFor('modules.panel')).toBe(0);
    expect(wastePctFor('inverter.unit')).toBe(0);
    expect(wastePctFor('elec.dcdb')).toBe(0);
  });

  it('cable and steel carry a real allowance', () => {
    expect(wastePctFor('elec.dc_cable')).toBe(8);
    expect(wastePctFor('mech.steel')).toBe(4);
    expect(wastePctFor('mech.steel:c_channel'), 'instance inherits its kind').toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════ GST ════════════
describe('GST — per line, because rates differ per line', () => {
  it('equipment categories default to 5%', () => {
    for (const c of ['Modules', 'Inverter', 'Electrical BOS', 'Mechanical BOS', 'Safety'] as const) {
      expect(gstPctFor(c, 'x.y')).toBe(GST_EQUIPMENT_PCT);
    }
  });

  it('civil and services default to 18%', () => {
    expect(gstPctFor('Civil & Misc', 'civil.installation')).toBe(GST_SERVICE_PCT);
  });

  it('a cast pedestal is work, not a device, even in a mech category', () => {
    expect(gstPctFor('Mechanical BOS', 'mech.pedestal')).toBe(GST_SERVICE_PCT);
    expect(gstPctFor('Mechanical BOS', 'mech.pedestal:roof')).toBe(GST_SERVICE_PCT);
  });

  it('a quote carrying both rates cannot be taxed with one rate', () => {
    const lines = [
      mk({ id: 'a', qty: 100, unitPriceInr: 100, gstPct: 5, unit: 'Nos' }),
      mk({ id: 'b', qty: 100, unitPriceInr: 100, gstPct: 18, unit: 'Nos' }),
    ];
    const m = bomMoney(lines, { pricing: { marginPct: 0 } } as Project);
    expect(m.taxable).toBe(20000);
    expect(m.gst).toBe(500 + 1800); // NOT 20000 × any single rate
  });

  it('breaks GST out by rate for the invoice summary', () => {
    const lines = [
      mk({ id: 'a', qty: 10, unitPriceInr: 100, gstPct: 5, unit: 'Nos' }),
      mk({ id: 'b', qty: 10, unitPriceInr: 100, gstPct: 5, unit: 'Nos' }),
      mk({ id: 'c', qty: 10, unitPriceInr: 100, gstPct: 18, unit: 'Nos' }),
    ];
    const m = bomMoney(lines, { pricing: { marginPct: 0 } } as Project);
    expect(m.gstByRate).toEqual([
      { pct: 5, taxable: 2000, gst: 100 },
      { pct: 18, taxable: 1000, gst: 180 },
    ]);
  });
});

// ═════════════════════════════════════════════ MARGIN BELOW GST ═════════════
describe('margin sits BELOW GST — tax is on the sale price, not the cost', () => {
  it('hand-computed: 100 × ₹10, 20% margin, 5% GST', () => {
    const m = lineMoney(mk({ qty: 100, unitPriceInr: 10, gstPct: 5, unit: 'Nos' }), 20);
    expect(m.base).toBe(1000); // cost
    expect(m.taxable).toBe(1200); // marked up
    expect(m.gst).toBeCloseTo(60, 6); // 5% OF THE SALE PRICE, not of cost
    expect(m.total).toBeCloseTo(1260, 6);
  });

  // Both multipliers commute, so the TOTAL is identical either way — the order
  // does not change what the customer pays. What it changes is what the invoice
  // DECLARES: the taxable value and the tax amount. A GST invoice must state
  // tax on the sale price; declaring ₹52.50 on a ₹1050 "taxable value" when you
  // sold for ₹1200 is a wrong return, even though the money collected matches.
  it('the total is the same either way — the DECLARED figures are not', () => {
    const line = mk({ qty: 100, unitPriceInr: 10, gstPct: 5, unit: 'Nos' });
    const correct = lineMoney(line, 20);

    const taxedCostFirst = { taxable: 1000 * 1.05, gst: 1000 * 0.05 };
    expect(correct.total).toBeCloseTo(taxedCostFirst.taxable * 1.2, 6); // same money

    expect(correct.taxable).toBe(1200); // the price actually sold at
    expect(taxedCostFirst.taxable).toBe(1050); // …would have been understated
    expect(correct.gst).toBeCloseTo(60, 6);
    expect(taxedCostFirst.gst).toBe(50); // …and the tax declared with it
  });

  it('raising the margin raises the tax with it', () => {
    const line = mk({ qty: 100, unitPriceInr: 10, gstPct: 18, unit: 'Nos' });
    expect(lineMoney(line, 30).gst).toBeGreaterThan(lineMoney(line, 10).gst);
  });
});

// ════════════════════════════════════════════════ INCLUDE / EXCLUDE ═════════
describe('an excluded line contributes NOTHING', () => {
  it('not to base, not to margin, not to GST', () => {
    const m = lineMoney(mk({ qty: 100, unitPriceInr: 10, gstPct: 18, included: false }), 20);
    expect(m.base).toBe(0);
    expect(m.taxable).toBe(0);
    expect(m.gst).toBe(0);
    expect(m.total).toBe(0);
  });

  it('but it keeps its order qty — the figure is still shown', () => {
    expect(orderQtyOf(mk({ qty: 100, wastePct: 8, included: false }))).toBe(108);
  });

  it('excluding a line drops the total by exactly that line’s total', () => {
    const a = mk({ id: 'a', qty: 10, unitPriceInr: 100, gstPct: 5, unit: 'Nos' });
    const b = mk({ id: 'b', qty: 5, unitPriceInr: 200, gstPct: 18, unit: 'Nos' });
    const project = { pricing: { marginPct: 15 } } as Project;
    const withBoth = bomMoney([a, b], project).total;
    const withoutB = bomMoney([a, { ...b, included: false }], project).total;
    expect(withBoth - withoutB).toBe(Math.round(lineMoney(b, 15).total));
  });

  it('an excluded line does not appear in the rate breakdown', () => {
    const m = bomMoney(
      [mk({ qty: 10, unitPriceInr: 100, gstPct: 18, included: false, unit: 'Nos' })],
      { pricing: { marginPct: 0 } } as Project,
    );
    expect(m.gstByRate).toEqual([]);
  });
});

// ═══════════════════════════════════════════════ INVOICE INTEGRITY ══════════
describe('the printed components sum to the printed total', () => {
  it('taxable + gst === total, exactly', () => {
    const project = fixtureProject(8);
    const m = bomMoney(mergedBom(project), project);
    expect(m.taxable + m.gst).toBe(m.total);
  });

  it('the rate breakdown sums to the reported GST', () => {
    const project = fixtureProject(8);
    const m = bomMoney(mergedBom(project), project);
    const summed = m.gstByRate.reduce((s, r) => s + r.gst, 0);
    expect(Math.abs(summed - m.gst)).toBeLessThanOrEqual(m.gstByRate.length);
  });

  it('every emitted line carries the three procurement fields', () => {
    for (const l of deriveBom(fixtureProject(8))) {
      expect(typeof l.included, l.id).toBe('boolean');
      expect(typeof l.wastePct, l.id).toBe('number');
      expect(typeof l.gstPct, l.id).toBe('number');
      expect(l.gstPct, l.id).toBeGreaterThan(0);
    }
  });

  it('everything is quoted EXCEPT the site-dependent prompts', () => {
    // this used to assert `included === true` for every line, which held only
    // because no emitter had ever shipped one excluded. The qty-0 prompts are
    // the deliberate exception, so pin exactly which lines may be excluded
    // rather than dropping the assertion.
    const excluded = deriveBom(fixtureProject(8))
      .filter((l) => l.included === false)
      .map((l) => l.id)
      .sort();
    expect(excluded).toEqual([
      'civil.civil_works',
      'civil.crane',
      'civil.scaffolding',
      'civil.trenching',
    ]);
  });

  it('the prompts cost nothing until someone gives them a quantity', () => {
    const lines = deriveBom(fixtureProject(8));
    const project = { pricing: { marginPct: 12 } } as Project;
    const withPrompts = bomMoney(lines, project);
    const withoutPrompts = bomMoney(
      lines.filter((l) => !l.id.startsWith('civil.') || l.included !== false),
      project,
    );
    expect(withPrompts).toEqual(withoutPrompts);
    // and no phantom GST bucket for a zero-taxable line
    expect(withPrompts.gstByRate.every((b) => b.taxable > 0)).toBe(true);
  });

  it('a zero-line BOM is zero everywhere, not NaN', () => {
    const m = bomMoney([], { pricing: { marginPct: 12 } } as Project);
    expect(m).toEqual({ subtotal: 0, taxable: 0, gst: 0, total: 0, gstByRate: [] });
  });
});

// ═══════════════════════════════════ EDIT PATH (22d fields via 22c) ═════════
// The screen that renders these controls is 22f. What must hold NOW is that the
// three new fields are editable through the SAME per-field override machinery
// as qty and price — otherwise 22f would arrive and find nowhere to write.
describe('the new fields round-trip through the override path', () => {
  const editedLine = (p: Project, key: string) => mergedBom(p).find((l) => l.id === key)!;

  it('excluding a line through the edit path lowers the quote', () => {
    const p = fixtureProject(8);
    const before = bomMoney(mergedBom(p), p).total;
    const next = { ...p, ...editBomField(p, 'elec.dc_cable', 'included', false) } as Project;

    expect(editedLine(next, 'elec.dc_cable').included).toBe(false);
    expect(bomMoney(mergedBom(next), next).total).toBeLessThan(before);
  });

  it('a hand-set waste % changes the order qty and the money', () => {
    const p = fixtureProject(8);
    const auto = editedLine(p, 'elec.dc_cable');
    const next = { ...p, ...editBomField(p, 'elec.dc_cable', 'wastePct', 50) } as Project;
    const line = editedLine(next, 'elec.dc_cable');

    expect(line.wastePct).toBe(50);
    expect(orderQtyOf(line)).toBeCloseTo(auto.qty * 1.5, 2);
    expect(bomMoney([line], next).total).toBeGreaterThan(bomMoney([auto], p).total);
  });

  it('a hand-set GST rate is what gets charged', () => {
    const p = fixtureProject(8);
    const next = { ...p, ...editBomField(p, 'elec.dc_cable', 'gstPct', 28) } as Project;
    const line = editedLine(next, 'elec.dc_cable');
    expect(line.gstPct).toBe(28);
    expect(bomMoney([line], next).gstByRate[0].pct).toBe(28);
  });

  it('resetting restores the auto value — including a boolean false', () => {
    const p = fixtureProject(8);
    const excluded = { ...p, ...editBomField(p, 'elec.dc_cable', 'included', false) } as Project;
    const reset = { ...excluded, ...resetBomField(excluded, 'elec.dc_cable', 'included') } as Project;
    // `false` is falsy, so a reset implemented with `??` or `||` would leave the
    // line excluded forever with no way back — the pin is that it comes back
    expect(editedLine(reset, 'elec.dc_cable').included).toBe(true);
    expect(bomMoney(mergedBom(reset), reset).total).toBe(bomMoney(mergedBom(p), p).total);
  });

  it('editing one field leaves the other two auto', () => {
    const p = fixtureProject(8);
    const next = { ...p, ...editBomField(p, 'elec.dc_cable', 'gstPct', 28) } as Project;
    const line = editedLine(next, 'elec.dc_cable');
    expect(line.overriddenFields).toEqual(['gstPct']);
    expect(line.wastePct).toBe(editedLine(p, 'elec.dc_cable').wastePct);
    expect(line.included).toBe(true);
  });
});
