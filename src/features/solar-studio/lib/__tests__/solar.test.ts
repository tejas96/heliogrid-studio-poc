import { describe, expect, it } from 'vitest';
import type { Project, SiteWeather } from '../../types';
import { activeWeather, computeEnergyReport } from '../solar';
import { pvgisToWeather, type PvgisResponse } from '../pvgis';
import fixture from './fixtures/pvgis-mrcalc-pune.json';

const PIN = { lat: 18.52, lng: 73.86 };
const weather = pvgisToWeather(fixture as unknown as PvgisResponse, PIN.lat, PIN.lng)!;

function project(w?: SiteWeather): Project {
  return {
    location: {
      address: 't',
      latLng: PIN,
      confirmed: true,
      irradiance: w?.annualGhi ?? 5.3,
      peakSunHours: w?.annualGhi ?? 5.3,
      dataSource: 't',
      weather: w,
    },
    roofs: [
      {
        id: 'r1',
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 6 },
          { x: 0, y: 6 },
        ],
      },
    ],
    components: { panel: { watt: 550 } },
    panels: Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      enabled: true,
      tiltDeg: 10,
      azimuthDeg: 180,
      solarAccess: 1,
      center: { x: i, y: 0 },
      roofId: 'r1',
    })),
  } as unknown as Project;
}

describe('activeWeather (stale-pin guard)', () => {
  it('honors weather fetched for the current pin', () => {
    expect(activeWeather(project(weather).location)).toBeTruthy();
  });

  it('ignores weather whose forLatLng no longer matches the pin', () => {
    const stale: SiteWeather = { ...weather, forLatLng: { lat: 28.6, lng: 77.2 } }; // Delhi
    const p = project(stale);
    expect(activeWeather(p.location)).toBeUndefined();
  });
});

describe('computeEnergyReport — weather path', () => {
  it('labels the source PVGIS and sums months to the annual total', () => {
    const r = computeEnergyReport(project(weather));
    expect(r.irradianceSource).toBe('PVGIS');
    const summed = r.monthlyKwh.reduce((s, v) => s + v, 0);
    expect(summed / 1000).toBeCloseTo(r.annualMwh, 1); // Σ months ≈ annual (rounding)
  });

  it('shows a real monsoon dip — July well below April', () => {
    const r = computeEnergyReport(project(weather));
    expect(r.monthlyKwh[6]).toBeLessThan(r.monthlyKwh[3] * 0.6); // Jul << Apr
  });

  it('falls back to the estimate when weather is absent', () => {
    const r = computeEnergyReport(project(undefined));
    expect(r.irradianceSource).toBe('estimate');
    expect(r.annualMwh).toBeGreaterThan(0);
  });

  it('falls back (and relabels) when weather is for a different pin', () => {
    const stale: SiteWeather = { ...weather, forLatLng: { lat: 28.6, lng: 77.2 } };
    const r = computeEnergyReport(project(stale));
    expect(r.irradianceSource).toBe('estimate');
  });

  it('is deterministic', () => {
    const a = computeEnergyReport(project(weather));
    const b = computeEnergyReport(project(weather));
    expect(a.monthlyKwh).toEqual(b.monthlyKwh);
    expect(a.annualMwh).toBe(b.annualMwh);
  });
});

// ─── Phase 4 gates: loss composition + unified shading metric ───────────────

describe('loss model (multiplicative, clamped — PVWatts convention)', () => {
  function withAccess(access: number, w?: SiteWeather): Project {
    const p = project(w);
    return { ...p, panels: p.panels.map((x) => ({ ...x, solarAccess: access })) };
  }

  it('PR stays within (0,1] even at ZERO beam access (old additive model went negative)', () => {
    for (const access of [0, 0.1, 0.5, 0.9, 1]) {
      for (const w of [weather, undefined]) {
        const r = computeEnergyReport(withAccess(access, w));
        expect(r.performanceRatio).toBeGreaterThan(0);
        expect(r.performanceRatio).toBeLessThanOrEqual(100);
        expect(r.totalLossPct).toBeLessThan(100);
        expect(r.annualMwh).toBeGreaterThan(0); // diffuse floor keeps energy > 0
      }
    }
  });

  it('losses compose multiplicatively — total < the arithmetic sum', () => {
    const r = computeEnergyReport(withAccess(0.8, weather));
    const sum = r.losses.reduce((s, l) => s + l.pct, 0);
    expect(r.totalLossPct).toBeLessThan(sum);
    expect(r.totalLossPct).toBeGreaterThan(0);
  });

  it('inverter loss comes from the selected inverter datasheet efficiency', () => {
    const p = withAccess(1, weather);
    const withInv: Project = {
      ...p,
      components: {
        ...p.components,
        inverter: { efficiencyPct: 98.4 } as Project['components']['inverter'],
      },
    };
    const line = computeEnergyReport(withInv).losses.find((l) => l.key === 'inverter')!;
    expect(line.pct).toBeCloseTo(1.6, 5);
    // fallback without an inverter
    const fallback = computeEnergyReport(p).losses.find((l) => l.key === 'inverter')!;
    expect(fallback.pct).toBe(3.0);
  });

  it('energy is monotonically increasing in beam access', () => {
    let prev = 0;
    for (const access of [0, 0.25, 0.5, 0.75, 1]) {
      const r = computeEnergyReport(withAccess(access, weather));
      expect(r.annualMwh).toBeGreaterThanOrEqual(prev);
      prev = r.annualMwh;
    }
  });

  it('unified access metric: diffuse-floored (= heatmap definition), not raw beam', () => {
    // estimate path: floor is DIFFUSE_SHARE = 0.35
    const rZero = computeEnergyReport(withAccess(0, undefined));
    expect(rZero.avgSolarAccessPct).toBe(35);
    const rFull = computeEnergyReport(withAccess(1, undefined));
    expect(rFull.avgSolarAccessPct).toBe(100);
    // weather path: SAME fixed floor (the metric is a comparability score;
    // the energy math underneath uses the real monthly Kd)
    const rZeroW = computeEnergyReport(withAccess(0, weather));
    expect(rZeroW.avgSolarAccessPct).toBe(35);
  });

  it('shading loss line reflects the BEAM-only effect, never 100%', () => {
    const r = computeEnergyReport(withAccess(0, weather));
    const shading = r.losses.find((l) => l.key === 'shading')!;
    expect(shading.pct).toBeGreaterThan(30);
    expect(shading.pct).toBeLessThan(90); // diffuse survives full beam shade
  });
});
