import { describe, expect, it } from 'vitest';
import {
  deriveSldDefaults,
  diffSldOverrides,
  effectiveSld,
  acConductorLabels,
  dcConductorLabels,
} from '../sld';
import { normalizeProject } from '../../store/store';
import { dcCableSizeMm2, dcFuseA, dcIsolatorA } from '../electrical-sizing';
import { fixtureProject } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';
import type { Project, SldParams } from '../../types';

describe('deriveSldDefaults', () => {
  it('returns null without an inverter', () => {
    const p = fixtureProject();
    expect(
      deriveSldDefaults({ ...p, components: { ...p.components, inverter: null } }),
    ).toBeNull();
  });

  it('derives AC rating, breaker ladder and Isc-based DC ratings from components', () => {
    const p = fixtureProject();
    const inv = p.components.inverter!;
    const panel = p.components.panel!;
    const sld = deriveSldDefaults(p)!;
    expect(sld.inverterLabel).toBe(`${inv.brand} ${inv.model}`);
    expect(sld.acRatingKw).toBe(inv.acKw * p.components.inverterCount);
    // AC breaker ≥ 1.25 × full-load amps, from the standard ladder
    const amps =
      inv.phases === 3 ? (sld.acRatingKw * 1000) / (1.732 * 415) : (sld.acRatingKw * 1000) / 230;
    expect(sld.mccbA).toBeGreaterThanOrEqual(amps * 1.25);
    expect(sld.acIsolatorA).toBe(sld.mccbA);
    // DC side must match the shared Isc-based sizing module exactly
    expect(sld.dcFuseA).toBe(dcFuseA(panel));
    expect(sld.dcIsolatorA).toBe(dcIsolatorA(panel));
    expect(sld.dcCableSizeMm2).toBe(dcCableSizeMm2(panel));
  });

  it('tracks component changes — a bigger inverter changes the derived sheet', () => {
    const p = fixtureProject();
    const two = deriveSldDefaults({
      ...p,
      components: { ...p.components, inverterCount: 2 },
    })!;
    expect(two.acRatingKw).toBe(p.components.inverter!.acKw * 2);
    expect(two.mccbA).toBeGreaterThan(deriveSldDefaults(p)!.mccbA);
  });
});

describe('diffSldOverrides (migration + edit-save path)', () => {
  it('identical stored params ⇒ null (sheet stays fully live)', () => {
    const p = fixtureProject();
    const derived = deriveSldDefaults(p)!;
    expect(diffSldOverrides({ ...derived }, derived)).toBeNull();
  });

  it('keeps ONLY the fields that differ', () => {
    const p = fixtureProject();
    const derived = deriveSldDefaults(p)!;
    const stored: SldParams = { ...derived, dcFuseA: 32, standard: 'NEC 690 (US)' };
    expect(diffSldOverrides(stored, derived)).toEqual({
      dcFuseA: 32,
      standard: 'NEC 690 (US)',
    });
  });

  it('with no derivable baseline, the whole snapshot survives as overrides', () => {
    const p = fixtureProject();
    const stored = deriveSldDefaults(p)!;
    expect(diffSldOverrides(stored, null)).toEqual(stored);
  });
});

describe('normalizeProject sldParams migration', () => {
  it('migrates a legacy frozen snapshot into a minimal override diff', () => {
    const p = fixtureProject();
    const derived = deriveSldDefaults(p)!;
    // a real legacy payload predates `derived` entirely — model that exactly
    const legacy = {
      ...p,
      sldParams: { ...derived, mccbA: 125 }, // user had edited one rating
      derived: undefined,
    } as unknown as Project;
    const out = normalizeProject(legacy);
    expect(out.sldParams).toBeNull();
    expect(out.derived.sldOverrides).toEqual({ mccbA: 125 });
    expect(out.derived.sldIntroSeen).toBe(true); // snapshot existed ⇒ intro was seen
  });

  it('an untouched legacy snapshot migrates to NO overrides — sheet un-freezes', () => {
    const p = fixtureProject();
    const legacy: Project = { ...p, sldParams: deriveSldDefaults(p)! };
    const out = normalizeProject(legacy);
    expect(out.sldParams).toBeNull();
    expect(out.derived.sldOverrides).toBeNull();
  });

  it('never double-migrates: existing sldOverrides win over a lingering snapshot', () => {
    const p = fixtureProject();
    const legacy: Project = {
      ...p,
      sldParams: { ...deriveSldDefaults(p)!, mccbA: 125 },
      derived: { ...p.derived, sldOverrides: { dcFuseA: 25 }, sldIntroSeen: true },
    };
    const out = normalizeProject(legacy);
    expect(out.derived.sldOverrides).toEqual({ dcFuseA: 25 });
  });
});

describe('effectiveSld', () => {
  it('merges overrides over live-derived values', () => {
    const p = fixtureProject();
    const withOverride: Project = {
      ...p,
      derived: { ...p.derived, sldOverrides: { dcFuseA: 32 } },
    };
    const sld = effectiveSld(withOverride)!;
    expect(sld.dcFuseA).toBe(32);
    expect(sld.mccbA).toBe(deriveSldDefaults(p)!.mccbA); // untouched field stays derived
  });
});

describe('max system voltage — the CEIG cold-Voc check (Phase 11 task 30)', () => {
  const panel = PANEL_DB.find((p) => p.id === 'pnl_ada540')!; // Voc 49.5, -0.27%/°C
  const inverter = INVERTER_DB.find((i) => i.id === 'inv_gr10')!; // maxDc 1100

  function withStrings(len: number): Project {
    const base = fixtureProject(0);
    return {
      ...base,
      components: { ...base.components, panel, inverter, inverterCount: 2 },
      location: {
        address: 'Pune', latLng: { lat: 18.52, lng: 73.86 }, confirmed: true,
        irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate',
      },
      strings: [
        { id: 's1', name: 'String 1', inverterIndex: 0, mpptIndex: 0, color: '#000',
          panelIds: Array.from({ length: len }, (_, i) => `p${i}`) },
      ],
    };
  }

  it('derives cold-Voc system voltage from the LONGEST real string', () => {
    const sld = deriveSldDefaults(withStrings(18))!;
    expect(sld.maxStringLength).toBe(18);
    // cold Voc > STC Voc, and ×18 must land in a sane hundreds-of-volts range
    expect(sld.maxSystemVdc).toBeGreaterThan(49.5 * 18); // temperature-lifted
    expect(sld.inverterMaxDcV).toBe(1100);
  });

  it('PASSES a legal string and FLAGS one that over-volts the inverter when cold', () => {
    expect(deriveSldDefaults(withStrings(18))!.voltageWithinLimit).toBe(true);
    // 26 modules cold would blow past 1100 V — the audit's 2794 V class
    const over = deriveSldDefaults(withStrings(26))!;
    expect(over.voltageWithinLimit).toBe(false);
    expect(over.maxSystemVdc).toBeGreaterThan(over.inverterMaxDcV);
  });

  it('is zero (not a crash) with no strings, and notes the inverter count', () => {
    const base = fixtureProject(0);
    const sld = deriveSldDefaults({
      ...base,
      components: { ...base.components, panel, inverter, inverterCount: 3 },
      strings: [],
    })!;
    expect(sld.maxSystemVdc).toBe(0);
    expect(sld.voltageWithinLimit).toBe(true); // nothing to over-volt
    expect(sld.inverterCount).toBe(3);
  });
})

// ─── 3-line diagram conductors (task 30d) ───────────────────────────────────
describe('acConductorLabels / dcConductorLabels', () => {
  it('3-phase draws three phases + neutral + earth (5 conductors)', () => {
    expect(acConductorLabels(3)).toEqual(['L1', 'L2', 'L3', 'N', 'PE']);
  });

  it('single-phase draws line + neutral + earth (3 conductors)', () => {
    expect(acConductorLabels(1)).toEqual(['L', 'N', 'PE']);
  });

  it('protective earth is ALWAYS present — its absence is a fault, not a style', () => {
    for (const ph of [1, 3] as const) expect(acConductorLabels(ph)).toContain('PE');
    expect(dcConductorLabels()).toContain('PE');
  });

  it('the DC side shows both poles', () => {
    expect(dcConductorLabels()).toEqual(['DC+', 'DC−', 'PE']);
  });
});
