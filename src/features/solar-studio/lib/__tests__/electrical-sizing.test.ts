import { describe, expect, it } from 'vitest';
import { acBreakerA, acFullLoadA, dcCableSizeMm2, dcFuseA, dcIsolatorA } from '../electrical-sizing';
import { deriveSldDefaults } from '../sld';
import { mergedBom } from '../bom';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';
import { fixtureProject } from './fixtures/project';
import type { PanelSpec } from '../../types';

const panelWithIsc = (iscA: number): PanelSpec => ({
  ...PANEL_DB[0],
  iscA,
});

describe('DC protective-device sizing from module Isc (IEC 62548 ≥1.5×Isc)', () => {
  it('a 15.7A module needs a 25A fuse, not the old 20A default', () => {
    // 15.7 × 1.56 = 24.5 → next standard = 25A
    expect(dcFuseA(panelWithIsc(15.7))).toBe(25);
  });

  it('a 13.9A module (catalog minimum) still exceeds 20A', () => {
    // 13.9 × 1.56 = 21.7 → 25A
    expect(dcFuseA(panelWithIsc(13.9))).toBe(25);
  });

  it('small legacy modules get smaller fuses', () => {
    // 9.0 × 1.56 = 14.0 → 15A
    expect(dcFuseA(panelWithIsc(9))).toBe(15);
  });

  it('isolator is the next standard rating ≥ the fuse', () => {
    expect(dcIsolatorA(panelWithIsc(15.7))).toBe(25);
    expect(dcIsolatorA(panelWithIsc(17))).toBe(32); // fuse 30 → isolator 32
  });

  it('cable ampacity covers the fuse rating', () => {
    expect(dcCableSizeMm2(panelWithIsc(15.7))).toBe(4); // 25A ≤ 32A (4mm²)
    expect(dcCableSizeMm2(panelWithIsc(22))).toBe(6); // fuse 40 → 6mm² (42A)
  });

  it('every catalog panel gets a fuse ≥ 1.5×Isc — none fall back to under-protection', () => {
    for (const p of PANEL_DB) {
      expect(dcFuseA(p)).toBeGreaterThanOrEqual(p.iscA * 1.5);
    }
  });
});

describe('AC breaker sizing (ONE shared path for BOM and SLD)', () => {
  it('sizes from exact amps, no premature rounding (72 kW 3φ boundary case)', () => {
    // 72 kW 3φ: 100.17 A × 1.25 = 125.21 A — the old BOM path rounded amps
    // to 100 first and printed a 125 A breaker BELOW its own 1.25× rule
    expect(acFullLoadA(72, 3)).toBeCloseTo(100.17, 2);
    expect(acBreakerA(72, 3)).toBe(160);
  });

  it('never rates a breaker below the load current for large systems', () => {
    // 150 kW 3φ = 208.7 A → required 260.9 A → 320 A (the old SLD ladder
    // silently fell back to a 200 A device UNDER the continuous current)
    expect(acBreakerA(150, 3)).toBe(320);
    // every inverter × any count 1..10 must get a breaker ≥ 1.25 × amps
    for (const inv of INVERTER_DB) {
      for (let n = 1; n <= 10; n++) {
        const kw = inv.acKw * n;
        expect(acBreakerA(kw, inv.phases)).toBeGreaterThanOrEqual(
          acFullLoadA(kw, inv.phases) * 1.25,
        );
      }
    }
  });

  it('the SLD sheet and the BOM ACDB line print the SAME rating', () => {
    for (const count of [1, 2, 4, 6, 10]) {
      const p = fixtureProject();
      const proj = { ...p, components: { ...p.components, inverterCount: count } };
      const sld = deriveSldDefaults(proj)!;
      const acdb = mergedBom(proj).find((l) => l.item === 'ACDB');
      expect(acdb, `ACDB line missing at count=${count}`).toBeTruthy();
      expect(acdb!.spec).toContain(`${sld.mccbA}A`);
    }
  });
});
