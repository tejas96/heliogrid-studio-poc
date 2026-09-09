// ─── The gate: the diffuse half is derated by the right formula, per module ─
//
// Three errors in the hourly engine's diffuse half, fixed together:
//   · the sky-view factor was 1 − mean(sin β) with a 0.3 floor; the physics for
//     a horizontal plane under a uniform skyline at β is cos²β;
//   · the Perez horizon band and the ground-reflected term passed through with
//     no shading at all — the two parts of the sky a skyline blocks first;
//   · skyView was one number for the whole array, so a module against a
//     parapet and one in the open middle of the deck got identical diffuse.
import { describe, expect, it } from 'vitest';
import { hourlyEnergyCore, type EngineInput } from '../energy/hourly';
import { horizonBandView, moduleSkyViews, skyViewFromSkyline } from '../energy/sky-view';
import { clearYear } from './fixtures/clear-year';
import { fixtureProject, fixtureRoof } from './fixtures/project';

const LAT = 16.85;
const LNG = 74.56;

function input(panel: { skyView?: number; horizonView?: number; access: number }): EngineInput {
  return {
    lat: LAT,
    lng: LNG,
    panels: Array.from({ length: 10 }, () => ({
      tiltDeg: 17,
      azimuthDeg: 180,
      pstcW: 540,
      u0: 25,
      u1: 6.84,
      beamAccess: () => panel.access,
      skyView: panel.skyView,
      horizonView: panel.horizonView,
    })),
    // no inverter: a flat 97% — a huge one would sit at the bottom of its curve
    inverter: null,
    gammaPmaxPct: -0.35,
    soilingByMonth: new Array(12).fill(0),
    lidFrac: 0,
    mismatchFrac: 0,
    dcOhmicStcFrac: 0,
    acOhmicFrac: 0,
    albedo: 0.2,
    skyView: 1,
  };
}

describe('the diffuse sky, derated honestly', () => {
  it('a uniform skyline at β leaves cos²β of the sky — 0.75 at 30°, not 0.50 — and no floor hides a courtyard', () => {
    expect(skyViewFromSkyline(new Array(72).fill(0))).toBe(1);
    expect(skyViewFromSkyline(new Array(72).fill(30))).toBeCloseTo(0.75, 3);
    expect(skyViewFromSkyline(new Array(72).fill(15))).toBeCloseTo(0.933, 3);
    // the old 0.3 floor stopped here; an enclosed courtyard really is this dark
    expect(skyViewFromSkyline(new Array(72).fill(80))).toBeLessThan(0.05);
    // the horizon band: fully open at 0°, gone behind a 13° skyline
    expect(horizonBandView(new Array(72).fill(0))).toBe(1);
    expect(horizonBandView(new Array(72).fill(13))).toBe(0);
  });

  it('a module that sees no sky and no sun makes nothing — the horizon band and the ground term no longer leak through', () => {
    const tmy = clearYear(LAT, LNG);
    const open = hourlyEnergyCore(input({ access: 1 }), tmy);
    const dark = hourlyEnergyCore(input({ access: 0, skyView: 0, horizonView: 0 }), tmy);
    expect(open.annualKwh).toBeGreaterThan(0);
    expect(dark.annualKwh).toBeLessThan(open.annualKwh * 0.001);
    // and a half-open sky on the diffuse terms alone is a real, bounded loss
    const half = hourlyEnergyCore(input({ access: 1, skyView: 0.5, horizonView: 0.5 }), tmy);
    expect(half.annualKwh).toBeLessThan(open.annualKwh);
    expect(half.annualKwh).toBeGreaterThan(open.annualKwh * 0.8);
  });

  it('each module gets its own sky: the one against the parapet sees less than the one in the open', () => {
    const p = fixtureProject(2);
    const walled = {
      ...p,
      // the shared fixture has no pin; a skyline needs a site
      location: { address: 't', latLng: { lat: LAT, lng: LNG }, confirmed: true, irradiance: 5.3, peakSunHours: 5.3, dataSource: 't' } as typeof p.location,
      roofs: [fixtureRoof({ parapet: { ...fixtureRoof().parapet, enabled: true } })],
      panels: [
        { ...p.panels[0], id: 'edge', center: { x: -7.3, y: 0 } }, // 0.7 m from the west wall
        { ...p.panels[1], id: 'mid', center: { x: 0, y: 0 } },
      ],
    };
    const sky = moduleSkyViews(walled);
    const edge = sky.get('edge')!;
    const mid = sky.get('mid')!;
    expect(mid.skyView).toBeGreaterThan(0.9);
    expect(edge.skyView).toBeLessThan(0.85);
    expect(edge.skyView).toBeLessThan(mid.skyView);
    expect(edge.horizonView).toBeLessThan(mid.horizonView);
    // the same design asked twice is served from the cache, unchanged
    expect(moduleSkyViews(walled)).toBe(sky);
  });
});
