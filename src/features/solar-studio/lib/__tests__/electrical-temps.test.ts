// ─── Site design temperatures + the string window they produce (Phase 9) ────
// Hand-computed throughout: these numbers decide whether a real inverter sees
// over-voltage on a cold morning, so a test that merely re-runs the
// implementation would gate nothing.
import { describe, expect, it } from 'vitest';
import { pmaxCoeffPct, resolveDesignTemps, vmpAt, vocAt } from '../electrical/temps';
import { stringSizing } from '../stringing';
import { fixtureProject } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';
import { INDIA_RULES } from '../../data/rules/india';
import type { Project } from '../../types';

const panel = PANEL_DB.find((p) => p.id === 'pnl_ada540')!; // Voc 49.5, −0.27 %/°C
const inverter = INVERTER_DB.find((i) => i.id === 'inv_gr10')!; // maxDc 1100, MPPT 160–950

function at(lat: number): Project {
  return {
    ...fixtureProject(4),
    location: {
      address: 'test',
      latLng: { lat, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

describe('resolveDesignTemps — climate bands, honestly labelled', () => {
  it('picks the band containing the site latitude (Pune 18.5°N ⇒ Deccan)', () => {
    const t = resolveDesignTemps(at(18.52));
    expect(t.minAmbientC).toBe(8);
    expect(t.maxAmbientC).toBe(42);
    expect(t.maxCellC).toBe(42 + INDIA_RULES.temps.cellRiseC); // 72
  });

  it('a colder site gets a colder design minimum (Delhi 28.6°N ⇒ 0 °C)', () => {
    expect(resolveDesignTemps(at(28.61)).minAmbientC).toBe(0);
    expect(resolveDesignTemps(at(11.0)).minAmbientC).toBe(15); // deep south
    expect(resolveDesignTemps(at(34.0)).minAmbientC).toBe(-10); // himalayan
  });

  it('is labelled ASSUMED with its basis — never dressed up as measured', () => {
    const t = resolveDesignTemps(at(18.52));
    expect(t.source).toBe('assumed');
    expect(t.note).toMatch(/assumed/i);
  });

  it('cold Voc is checked at AMBIENT, not at a warmed cell', () => {
    // adding a cell rise to the cold check would quietly shrink the margin
    const t = resolveDesignTemps(at(18.52));
    expect(t.minCellC).toBe(t.minAmbientC);
  });

  it('an unlocated project still resolves (no crash, mid-latitude default)', () => {
    const t = resolveDesignTemps({ ...fixtureProject(4), location: null });
    expect(t.minAmbientC).toBeTypeOf('number');
    expect(t.source).toBe('assumed');
  });
});

describe('temperature coefficients — the Voc/Vmp mix-up that was shipping', () => {
  it('Pmax coeff falls back to the market rule and says it is ESTIMATED', () => {
    const c = pmaxCoeffPct(panel); // seed catalog has no Pmax coeff
    expect(c.pct).toBe(INDIA_RULES.temps.fallbackPmaxCoeffPct); // −0.35
    expect(c.estimated).toBe(true);
  });

  it('a datasheet value wins and is NOT flagged estimated', () => {
    const c = pmaxCoeffPct({ ...panel, tempCoeffPmaxPct: -0.29 });
    expect(c.pct).toBe(-0.29);
    expect(c.estimated).toBe(false);
  });

  it('hot Vmp uses the Pmax coeff — the Voc coeff would over-state the window', () => {
    // hand-check @70 °C cell: 41.3 V · (1 + (−0.0035)(70−25)) = 34.79 V
    expect(vmpAt(panel, 70)).toBeCloseTo(panel.vmpV * (1 - 0.0035 * 45), 4);
    // the OLD (wrong) maths used −0.27 %/°C and produced a HIGHER Vmp…
    const wrong = panel.vmpV * (1 + (panel.tempCoeffVocPct / 100) * 45);
    expect(wrong).toBeGreaterThan(vmpAt(panel, 70));
    // …which is why it under-counted the modules needed to hold the MPPT floor
    expect(Math.ceil(inverter.mppt.minV / vmpAt(panel, 70))).toBeGreaterThanOrEqual(
      Math.ceil(inverter.mppt.minV / wrong),
    );
  });

  it('cold Voc rises above STC (hand-check: 49.5 · (1 + 0.0027·20) @5 °C)', () => {
    expect(vocAt(panel, 5)).toBeCloseTo(49.5 * (1 + 0.0027 * 20), 3);
    expect(vocAt(panel, 25)).toBeCloseTo(49.5, 6);
  });
});

describe('stringSizing on real site temps', () => {
  it('a colder site allows FEWER modules in series (cold Voc is the ceiling)', () => {
    const pune = stringSizing(panel, inverter, resolveDesignTemps(at(18.52))); // 8 °C
    const leh = stringSizing(panel, inverter, resolveDesignTemps(at(34.0))); // −10 °C
    expect(leh.maxPanels).toBeLessThan(pune.maxPanels);
    // and the cold-site limit actually holds the inverter's DC ceiling
    expect(leh.maxPanels * vocAt(panel, -10)).toBeLessThanOrEqual(inverter.maxDcV);
  });

  it('carries its provenance so the UI can label the window', () => {
    const s = stringSizing(panel, inverter, resolveDesignTemps(at(18.52)));
    expect(s.temps.source).toBe('assumed');
    expect(s.pmaxEstimated).toBe(true); // seed catalog lacks the coefficient
  });

  it('an IMPOSSIBLE pairing is stated, not returned as min>max nonsense', () => {
    // an inverter whose MPPT floor is unreachable before the cold ceiling bites
    const narrow = { ...inverter, maxDcV: 300, mppt: { ...inverter.mppt, maxV: 300, minV: 280 } };
    const s = stringSizing(panel, narrow, resolveDesignTemps(at(18.52)));
    expect(s.impossible).toBeTruthy();
    expect(s.impossible).toMatch(/MPPT floor/);
  });

  it('a workable pairing reports no impossibility', () => {
    expect(stringSizing(panel, inverter, resolveDesignTemps(at(18.52))).impossible).toBeUndefined();
  });
});
