import { describe, expect, it } from 'vitest';
import { computeFinancials, subsidyInr } from '../finance';
import { computeEnergyReport } from '../solar';
import { bomSubtotal, bomTotal, mergedBom } from '../bom';
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
  it('systemCost equals mergedBom subtotal × persisted margin (the Step 9 total)', () => {
    const project = fixtureProject(8);
    const report = computeEnergyReport(project);
    const fin = computeFinancials(project, report);
    const lines = mergedBom(project);
    const step9Total = Math.round(
      bomSubtotal(lines) * (1 + project.pricing.marginPct / 100),
    );
    expect(fin.systemCostInr).toBe(step9Total);
    expect(fin.systemCostInr).toBe(bomTotal(lines, project));
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
    const marginFactor = 1 + project.pricing.marginPct / 100;
    expect(after - before).toBe(Math.round(modules.qty * 1000 * marginFactor));
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
    const sub = bomSubtotal(mergedBom(base));
    expect(at12).toBe(Math.round(sub * 1.12));
    expect(at20).toBe(Math.round(sub * 1.2));
  });
});
