import { describe, expect, it } from 'vitest';
import { pvgisToWeather, isValidSiteWeather, DAYS_IN_MONTH, PVGIS_DB_LADDER, type PvgisResponse } from '../pvgis';
import type { SiteWeather } from '../../types';
import fixture from './fixtures/pvgis-mrcalc-pune.json';

// Real MRcalc response for Pune (18.52, 73.86) — 16 years × 12 months = 192 rows,
// each { year, month, "H(h)_m" (kWh/m²/month), Kd (0..1) }. The mapper must
// average each calendar month across all years.
const raw = fixture as unknown as PvgisResponse;

describe('pvgisToWeather (real Pune fixture)', () => {
  const w = pvgisToWeather(raw, 18.52, 73.86)!;

  it('produces valid 12-length arrays and pins the location', () => {
    expect(w).not.toBeNull();
    expect(w.monthlyGhi).toHaveLength(12);
    expect(w.monthlyDiffuseFrac).toHaveLength(12);
    expect(w.forLatLng).toEqual({ lat: 18.52, lng: 73.86 });
    expect(w.source).toBe('pvgis');
    expect(w.raddatabase).toBe('PVGIS-ERA5');
  });

  it('converts H(h)_m (monthly SUM) to kWh/m²/day by dividing by calendar days', () => {
    // hand-averaged from the fixture: July sum ≈ 96.141 kWh/m²/mo → /31 ≈ 3.101
    expect(w.monthlyGhi[6]).toBeCloseTo(3.101, 2); // July (idx 6)
    expect(w.monthlyGhi[3]).toBeCloseTo(7.022, 2); // April (idx 3) — pre-monsoon peak
    // every month = its averaged monthly sum / that month's day count
    for (let m = 0; m < 12; m++) {
      expect(w.monthlyGhi[m]).toBeGreaterThan(0);
      expect(w.monthlyGhi[m]).toBeLessThan(9);
    }
  });

  it('annualGhi is ΣmonthlySum / 365 and equals the day-weighted mean of monthlyGhi', () => {
    expect(w.annualGhi).toBeCloseTo(5.074, 2);
    const dayWeighted =
      w.monthlyGhi.reduce((s, g, m) => s + g * DAYS_IN_MONTH[m], 0) / 365;
    expect(dayWeighted).toBeCloseTo(w.annualGhi, 3);
  });

  it('takes the diffuse fraction from Kd — high in monsoon, low in dry season', () => {
    expect(w.monthlyDiffuseFrac[6]).toBeCloseTo(0.586, 2); // July: cloudy, diffuse-heavy
    expect(w.monthlyDiffuseFrac[3]).toBeCloseTo(0.214, 2); // April: clear, beam-heavy
    expect(w.monthlyDiffuseFrac[6]).toBeGreaterThan(w.monthlyDiffuseFrac[3]);
  });
});

describe('pvgisToWeather (rejects bad payloads — all-or-nothing)', () => {
  it('returns null for a short/empty monthly list', () => {
    expect(pvgisToWeather({ outputs: { monthly: [] } }, 18, 73)).toBeNull();
    expect(pvgisToWeather({}, 18, 73)).toBeNull();
  });

  it('returns null when a month is missing (fewer than 12 distinct months)', () => {
    const rows = Array.from({ length: 12 }, () => ({ month: 1, 'H(h)_m': 150, Kd: 0.3 }));
    expect(pvgisToWeather({ outputs: { monthly: rows } }, 18, 73)).toBeNull();
  });

  it('returns null on a non-finite H(h)_m or out-of-range Kd', () => {
    const good = Array.from({ length: 12 }, (_, m) => ({ month: m + 1, 'H(h)_m': 150, Kd: 0.3 }));
    const nan = good.map((r, i) => (i === 6 ? { ...r, 'H(h)_m': NaN } : r));
    expect(pvgisToWeather({ outputs: { monthly: nan } }, 18, 73)).toBeNull();
    const badKd = good.map((r, i) => (i === 6 ? { ...r, Kd: 0.98 } : r));
    expect(pvgisToWeather({ outputs: { monthly: badKd } }, 18, 73)).toBeNull();
  });

  it('accepts a clean synthetic 12-month payload', () => {
    const rows = Array.from({ length: 12 }, (_, m) => ({ month: m + 1, 'H(h)_m': 150, Kd: 0.3 }));
    const out = pvgisToWeather({ outputs: { monthly: rows } }, 18, 73);
    expect(out).not.toBeNull();
    expect(out!.monthlyGhi[0]).toBeCloseTo(150 / 31, 3);
  });
});

describe('isValidSiteWeather (shared guard for fetch + persistence)', () => {
  const good: SiteWeather = {
    monthlyGhi: Array.from({ length: 12 }, () => 5),
    monthlyDiffuseFrac: Array.from({ length: 12 }, () => 0.3),
    annualGhi: 5,
    forLatLng: { lat: 18, lng: 73 },
    source: 'pvgis',
    fetchedAt: 0,
  };

  it('accepts a well-formed SiteWeather', () => {
    expect(isValidSiteWeather(good)).toBe(true);
  });

  it('REJECTS a negative monthly GHI (corrupt persisted data → estimate)', () => {
    const bad = { ...good, monthlyGhi: good.monthlyGhi.map((v, i) => (i === 6 ? -3 : v)) };
    expect(isValidSiteWeather(bad)).toBe(false);
  });

  it('rejects short arrays, out-of-range diffuse, and bad source', () => {
    expect(isValidSiteWeather({ ...good, monthlyGhi: good.monthlyGhi.slice(0, 11) })).toBe(false);
    expect(isValidSiteWeather({ ...good, monthlyDiffuseFrac: good.monthlyDiffuseFrac.map((_, i) => (i ? 0.3 : 0.99)) })).toBe(false);
    expect(isValidSiteWeather({ ...good, source: 'estimate' })).toBe(false);
    expect(isValidSiteWeather(null)).toBe(false);
  });
});

// ─── Phase 4 gates: database ladder + record-length provenance ──────────────

describe('raddatabase ladder + provenance', () => {
  it('the ladder prefers satellite SARAH3 and falls back to global ERA5', () => {
    expect(PVGIS_DB_LADDER).toEqual(['PVGIS-SARAH3', 'PVGIS-ERA5']);
  });

  it('mapper surfaces the record length (fixture: 16 years, 2005–2020)', () => {
    const w = pvgisToWeather(fixture as unknown as PvgisResponse, 18.52, 73.86)!;
    expect(w.yearsOfRecord).toBe(16);
  });

  it('yearsOfRecord is optional — a payload without year fields still maps', () => {
    const noYears = {
      ...(fixture as unknown as PvgisResponse),
      outputs: {
        monthly: (fixture as unknown as { outputs: { monthly: Record<string, number>[] } }).outputs.monthly
          .slice(0, 12)
          .map((r, i) => ({ month: i + 1, 'H(h)_m': r['H(h)_m'], Kd: r.Kd })),
      },
    };
    const w = pvgisToWeather(noYears as PvgisResponse, 18.52, 73.86)!;
    expect(w).not.toBeNull();
    expect(w.yearsOfRecord).toBeUndefined();
  });
});
