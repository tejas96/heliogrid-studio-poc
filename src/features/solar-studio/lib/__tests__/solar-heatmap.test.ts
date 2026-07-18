import { describe, expect, it } from 'vitest';
import type { Obstruction, Project, Roof, SiteWeather, XY } from '../../types';
import { accessLabel, computeHeatmap, generateHeatGrid, heatColor } from '../solar-heatmap';
import { pointInPolygon } from '../geo';
import { DIFFUSE_SHARE } from '../poa';
import { DAYS_IN_MONTH, pvgisToWeather, type PvgisResponse } from '../pvgis';
import { solarHourDate, sunPosition } from '../solar';
import fixture from './fixtures/pvgis-mrcalc-pune.json';

const rect = (cx: number, cy: number, w: number, h: number): XY[] => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

function roof(id: string, poly: XY[]): Roof {
  return {
    id,
    name: id,
    polygon: poly,
    roofType: 'rcc_flat',
    heightM: 3,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 0.5,
    perEdgeSetbacksM: null,
    parapet: {
      enabled: false,
      direction: 'inward',
      heightM: 1,
      widthM: 0.3,
      perEdge: null,
      suppressSharedEdges: true,
    },
  };
}

function tallBox(id: string, roofId: string, center: XY): Obstruction {
  return {
    id,
    type: 'building',
    label: id,
    roofId,
    center,
    shape: 'rect',
    lengthM: 4,
    widthM: 4,
    diameterM: 4,
    heightM: 8,
    rotationDeg: 0,
    setbackM: 0.5,
    castsShadow: true,
    blocksPlacement: true,
  };
}

function project(roofs: Roof[], obstructions: Obstruction[] = []): Project {
  return {
    location: {
      latLng: { lat: 18.52, lng: 73.86 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      address: 'test',
      dataSource: 'test',
    },
    roofs,
    obstructions,
    panels: [],
    walkways: [],
    rails: [],
    arresters: [],
    inverterPlacements: [],
  } as unknown as Project;
}

const syncYield = () => Promise.resolve();

describe('generateHeatGrid', () => {
  it('samples inside the roof polygon and respects the step', () => {
    const poly = rect(0, 0, 10, 6);
    const { points, stepM } = generateHeatGrid(project([roof('a', poly)]), {
      targetStepM: 0.5,
    });
    expect(points.length).toBeGreaterThan(100);
    expect(stepM).toBeGreaterThanOrEqual(0.5);
    for (const p of points) expect(pointInPolygon(p.plan, poly)).toBe(true);
  });

  it('caps the point count for a large roof by growing the step', () => {
    const { points, stepM } = generateHeatGrid(
      project([roof('big', rect(0, 0, 120, 120))]),
      { targetStepM: 0.5, maxPoints: 1800 },
    );
    expect(points.length).toBeLessThanOrEqual(1800);
    expect(stepM).toBeGreaterThan(0.5); // grew to hit the budget
  });
});

describe('computeHeatmap', () => {
  it('gives an open roof ~100% access and positive sun-hours every month', async () => {
    const res = await computeHeatmap(project([roof('a', rect(0, 0, 10, 6))]), {
      yieldFn: syncYield,
    });
    expect(res.cells.length).toBeGreaterThan(0);
    for (const c of res.cells) {
      for (let m = 0; m < 12; m++) {
        expect(c.monthly[m]).toBeGreaterThan(0.99); // fully clear → access ≈ 1
        expect(c.monthly[m]).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
    for (let m = 0; m < 12; m++) expect(res.monthlyRoofHours[m]).toBeGreaterThan(6);
  });

  it('reduces access under a tall obstruction but never below the diffuse floor', { timeout: 30_000 }, async () => {
    const poly = rect(0, 0, 14, 14);
    const open = await computeHeatmap(project([roof('a', poly)]), { yieldFn: syncYield });
    const shaded = await computeHeatmap(
      project([roof('a', poly)], [tallBox('ob', 'a', { x: 0, y: 0 })]),
      { yieldFn: syncYield },
    );
    const avg = (r: Awaited<ReturnType<typeof computeHeatmap>>) =>
      r.monthlyRoofAvg.reduce((s, v) => s + v, 0) / 12;
    // the obstruction blocks direct sun on part of the roof → lower average access
    expect(avg(shaded)).toBeLessThan(avg(open));
    // but no cell ever drops below the diffuse floor (shaded ≠ 0)
    for (const c of shaded.cells) {
      for (let m = 0; m < 12; m++) {
        expect(c.monthly[m]).toBeGreaterThanOrEqual(DIFFUSE_SHARE - 1e-9);
        expect(c.monthly[m]).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
  });

  it('returns empty when there is no location or no roofs', async () => {
    const noRoof = await computeHeatmap(project([]), { yieldFn: syncYield });
    expect(noRoof.cells).toHaveLength(0);
    const noLoc = { ...project([roof('a', rect(0, 0, 10, 6))]), location: null } as Project;
    const r2 = await computeHeatmap(noLoc, { yieldFn: syncYield });
    expect(r2.cells).toHaveLength(0);
  });

  it('is deterministic', async () => {
    const p = project([roof('a', rect(0, 0, 8, 8))], [tallBox('ob', 'a', { x: 2, y: 2 })]);
    const a = await computeHeatmap(p, { yieldFn: syncYield });
    const b = await computeHeatmap(p, { yieldFn: syncYield });
    expect(a.monthlyRoofAvg).toEqual(b.monthlyRoofAvg);
    expect(a.cells.length).toBe(b.cells.length);
  });
});

describe('solarHourDate (timezone-independent sampling)', () => {
  it('puts the sun at its daily peak at solar noon', () => {
    const lat = 18.52;
    const lng = 73.86;
    const alt = (h: number) => sunPosition(solarHourDate(2026, 5, 21, h, lng), lat, lng).altitude;
    // solar noon (h=12) is higher than an hour either side
    expect(alt(12)).toBeGreaterThan(alt(11));
    expect(alt(12)).toBeGreaterThan(alt(13));
  });

  it('is a pure function of its inputs (no machine-local Date)', () => {
    const a = solarHourDate(2026, 5, 21, 12, 73.86).getTime();
    const b = solarHourDate(2026, 5, 21, 12, 73.86).getTime();
    expect(a).toBe(b);
    // solar noon at 73.86°E ≈ 12:00 − 73.86/15 h UTC = 07:04:34 UTC
    expect(new Date(a).getUTCHours()).toBe(7);
  });
});

// Pune fixture pin matches project()'s location (18.52, 73.86)
const PUNE_WEATHER = pvgisToWeather(fixture as unknown as PvgisResponse, 18.52, 73.86)!;
const withWeather = (p: Project, w: SiteWeather): Project =>
  ({ ...p, location: { ...p.location, weather: w } }) as Project;

describe('computeHeatmap — real PVGIS kWh layer', () => {
  it('has no kWh layer without weather, and one with weather', async () => {
    const bare = await computeHeatmap(project([roof('a', rect(0, 0, 10, 6))]), { yieldFn: syncYield });
    expect(bare.monthlyRoofKwh).toBeUndefined();
    for (const c of bare.cells) expect(c.monthlyKwhReceived).toBeUndefined();

    const wet = await computeHeatmap(withWeather(project([roof('a', rect(0, 0, 10, 6))]), PUNE_WEATHER), {
      yieldFn: syncYield,
    });
    expect(wet.monthlyRoofKwh).toHaveLength(12);
    expect(wet.cells[0].monthlyKwhReceived).toHaveLength(12);
  });

  it('a fully-sunny flat roof receives ≈ the horizontal monthly total (no double-count)', async () => {
    const res = await computeHeatmap(withWeather(project([roof('a', rect(0, 0, 10, 6))]), PUNE_WEATHER), {
      yieldFn: syncYield,
    });
    for (let m = 0; m < 12; m++) {
      const hMonth = PUNE_WEATHER.monthlyGhi[m] * DAYS_IN_MONTH[m]; // flat beamRatio = 1
      // open roof → beamFrac ≈ 1 → received ≈ H(h)_m (diffuse + beam, once each)
      expect(res.monthlyRoofKwh![m]).toBeGreaterThan(hMonth * 0.95);
      expect(res.monthlyRoofKwh![m]).toBeLessThan(hMonth * 1.02);
    }
  });

  it('shading lowers received energy but never below the diffuse-only floor', { timeout: 30_000 }, async () => {
    const poly = rect(0, 0, 14, 14);
    const open = await computeHeatmap(withWeather(project([roof('a', poly)]), PUNE_WEATHER), {
      yieldFn: syncYield,
    });
    const shaded = await computeHeatmap(
      withWeather(project([roof('a', poly)], [tallBox('ob', 'a', { x: 0, y: 0 })]), PUNE_WEATHER),
      { yieldFn: syncYield },
    );
    for (let m = 0; m < 12; m++) {
      const hMonth = PUNE_WEATHER.monthlyGhi[m] * DAYS_IN_MONTH[m];
      const kd = PUNE_WEATHER.monthlyDiffuseFrac[m];
      expect(shaded.monthlyRoofKwh![m]).toBeLessThan(open.monthlyRoofKwh![m]);
      // diffuse is always received, so a partly-shaded roof keeps at least ~kd·H
      expect(shaded.monthlyRoofKwh![m]).toBeGreaterThan(hMonth * kd * 0.85);
    }
  });

  it('keeps the colour/% metric on the FIXED floor (stable shadow contrast)', async () => {
    // The access % must NOT adopt the real (high-in-monsoon) diffuse fraction —
    // that would wash shadows out. It stays month-invariant on DIFFUSE_SHARE, so
    // the SAME geometry reads identically in July and April.
    const poly = rect(0, 0, 8, 8);
    const res = await computeHeatmap(
      withWeather(project([roof('a', poly)], [tallBox('ob', 'a', { x: 0, y: 0 })]), PUNE_WEATHER),
      { yieldFn: syncYield },
    );
    for (const c of res.cells) {
      for (let m = 0; m < 12; m++) {
        expect(c.monthly[m]).toBeGreaterThanOrEqual(DIFFUSE_SHARE - 1e-9);
      }
    }
    // The regression was July reading ≥ its real diffuse fraction (0.59),
    // washing out shadows. With the fixed floor a shadowed cell drops toward
    // DIFFUSE_SHARE (0.35) — well BELOW 0.59 — so contrast is preserved.
    const minJul = Math.min(...res.cells.map((c) => c.monthly[6]));
    expect(minJul).toBeLessThan(0.5);
    expect(minJul).toBeGreaterThan(DIFFUSE_SHARE - 1e-9);
  });

  it('the ENERGY layer (not the %) reflects the real monthly diffuse', async () => {
    // Same shaded geometry, but received-kWh floor tracks real Kd: a fully
    // shadowed spot keeps a LARGER share of H in monsoon (Kd≈0.59) than in the
    // dry season (Kd≈0.21).
    const poly = rect(0, 0, 8, 8);
    const res = await computeHeatmap(
      withWeather(project([roof('a', poly)], [tallBox('ob', 'a', { x: 0, y: 0 })]), PUNE_WEATHER),
      { yieldFn: syncYield },
    );
    const ratio = (m: number) => {
      const k = Math.min(...res.cells.map((c) => c.monthlyKwhReceived![m]));
      return k / (PUNE_WEATHER.monthlyGhi[m] * DAYS_IN_MONTH[m]); // received / H
    };
    expect(ratio(6)).toBeGreaterThan(ratio(3)); // July diffuse floor > April
  });
});

describe('accessLabel', () => {
  it('bands the normalised access value and clamps', () => {
    expect(accessLabel(0.2)).toBe('Poor');
    expect(accessLabel(0.6)).toBe('Moderate');
    expect(accessLabel(0.8)).toBe('Good');
    expect(accessLabel(0.95)).toBe('Excellent');
    expect(accessLabel(-1)).toBe('Poor');
    expect(accessLabel(5)).toBe('Excellent');
  });
});

describe('heatColor', () => {
  it('ramps low→high red→amber→green and clamps', () => {
    expect(heatColor(-1).getHexString()).toBe(heatColor(0).getHexString());
    expect(heatColor(2).getHexString()).toBe(heatColor(1).getHexString());
    expect(heatColor(0).getHexString()).toBe('dc2626');
    expect(heatColor(1).getHexString()).toBe('16a34a');
  });
});
