import { describe, expect, it } from 'vitest';
import { computeFinancials, subsidyInr } from '../finance';
import { computeEnergyReport } from '../solar';
import { bomMoney, bomSubtotal, bomTotal, mergedBom, orderQtyOf } from '../bom';
import { fixtureProject } from './fixtures/project';
import type { BomLine } from '../../types';

describe('subsidyInr — PM Surya Ghar slabs, DCR-gated, capped not zeroed', () => {
  it('follows the official slab for small systems', () => {
    expect(subsidyInr(1, true, true)).toBe(30000);
    expect(subsidyInr(2, true, true)).toBe(60000);
    expect(subsidyInr(3, true, true)).toBe(78000);
  });

  it('caps at ₹78k for ≥3 kW — including systems above 10 kW', () => {
    expect(subsidyInr(5, true, true)).toBe(78000);
    expect(subsidyInr(10.5, true, true)).toBe(78000);
    expect(subsidyInr(12, true, true)).toBe(78000);
  });

  it('is residential-only and DCR-gated', () => {
    expect(subsidyInr(3, false, true)).toBe(0);
    expect(subsidyInr(3, true, false)).toBe(0);
    expect(subsidyInr(0, true, true)).toBe(0);
  });
});

describe('single money path — financials === BOM table', () => {
  // The invariant is unchanged — the financials and the Step-9 table must be
  // the same number from the same lines. Phase 22d only changed HOW that
  // number is built (line-wise, with per-line GST).
  it('systemCost is exactly the Step 9 quote total', () => {
    const project = fixtureProject(8);
    const report = computeEnergyReport(project);
    const fin = computeFinancials(project, report);
    const lines = mergedBom(project);
    expect(fin.systemCostInr).toBe(bomTotal(lines, project));
    expect(fin.systemCostInr).toBe(bomMoney(lines, project).total);
  });

  it('a price override flows into the financials', () => {
    const base = fixtureProject(8);
    const auto = mergedBom(base);
    const modules = auto.find((l) => l.category === 'Modules')!;
    const overridden: BomLine = {
      ...modules,
      unitPriceInr: modules.unitPriceInr + 1000,
      confidence: 'derived',
      overridden: true,
    };
    const project = { ...base, bomOverrides: [overridden] };
    const report = computeEnergyReport(project);
    const before = computeFinancials(base, report).systemCostInr;
    const after = computeFinancials(project, report).systemCostInr;
    // the extra ₹1000/module is marked up, THEN taxed at the module rate
    const marginFactor = 1 + project.pricing.marginPct / 100;
    const gstFactor = 1 + (modules.gstPct ?? 0) / 100;
    const orderQty = orderQtyOf(modules);
    expect(after - before).toBeCloseTo(orderQty * 1000 * marginFactor * gstFactor, 0);
  });

  it('a custom line flows into the financials', () => {
    const base = fixtureProject(8);
    const custom: BomLine = {
      id: 'bomc_test',
      category: 'Civil & Misc',
      item: 'Extra civil work',
      spec: '',
      qty: 1,
      unit: 'lot',
      unitPriceInr: 200000,
      formula: 'Added manually',
      auto: false,
      confidence: 'derived',
      overridden: false,
    };
    const project = { ...base, bomOverrides: [custom] };
    const report = computeEnergyReport(project);
    const before = computeFinancials(base, report).systemCostInr;
    const after = computeFinancials(project, report).systemCostInr;
    expect(after - before).toBe(
      Math.round(200000 * (1 + project.pricing.marginPct / 100)),
    );
  });

  it('changing the persisted margin changes the quote total', () => {
    const base = fixtureProject(8);
    const report = computeEnergyReport(base);
    const at12 = computeFinancials(
      { ...base, pricing: { marginPct: 12 } },
      report,
    ).systemCostInr;
    const at20 = computeFinancials(
      { ...base, pricing: { marginPct: 20 } },
      report,
    ).systemCostInr;
    expect(at12).toBe(bomTotal(mergedBom(base), { ...base, pricing: { marginPct: 12 } }));
    expect(at20).toBe(bomTotal(mergedBom(base), { ...base, pricing: { marginPct: 20 } }));
    expect(at20).toBeGreaterThan(at12);
    // margin sits BELOW GST, so raising it raises the tax too — the ratio is
    // the margin ratio, not the margin difference
    expect(at20 / at12).toBeCloseTo(1.2 / 1.12, 3);
  });
});
