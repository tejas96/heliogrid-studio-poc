import { describe, expect, it } from 'vitest';
import { airMass, hourlyEnergyCore, inverterCurve, type EngineInput } from '../energy/hourly';
import { HOURS_PER_YEAR, type TmyYear } from '../energy/tmy';
import { sunPosition } from '../sun';

const LAT = 16.85;
const LNG = 74.56;

/** A clear-sky typical year built from the same sun the engine uses. */
function clearYear(): TmyYear {
  const n = HOURS_PER_YEAR;
  const ghi = new Float32Array(n);
  const dni = new Float32Array(n);
  const dhi = new Float32Array(n);
  const tair = new Float32Array(n).fill(28);
  const wind = new Float32Array(n).fill(2);
  const start = Date.UTC(2019, 0, 1);
  for (let h = 0; h < n; h++) {
    const s = sunPosition(new Date(start + (h + 0.5) * 3_600_000), LAT, LNG);
    if (s.altitude <= 0) continue;
    const sinA = Math.sin(s.altitude);
    const am = airMass(Math.PI / 2 - s.altitude);
    dni[h] = 950 * Math.exp(-0.09 * am);
    dhi[h] = 90 * Math.pow(sinA, 0.5);
    ghi[h] = dni[h] * sinA + dhi[h];
  }
  return { ghi, dni, dhi, tair, wind, timeOffsetH: 0.5 };
}

function input(over: Partial<EngineInput> & { tilt?: number; az?: number; count?: number; acW?: number } = {}): EngineInput {
  const { tilt = 0, az = 180, count = 40, acW = 10_000, ...rest } = over;
  return {
    lat: LAT,
    lng: LNG,
    panels: Array.from({ length: count }, () => ({
      tiltDeg: tilt,
      azimuthDeg: az,
      pstcW: 540,
      u0: 25,
      u1: 6.84,
      beamAccess: () => 1,
    })),
    inverter: { acW, count: 1, etaMax: 0.98 },
    gammaPmaxPct: -0.35,
    soilingByMonth: new Array(12).fill(0),
    lidFrac: 0,
    mismatchFrac: 0,
    dcOhmicStcFrac: 0,
    acOhmicFrac: 0,
    albedo: 0.2,
    skyView: 1,
    ...rest,
  };
}

describe('hourly engine — the physics holds together', () => {
  const tmy = clearYear();

  it('a horizontal plane sees the horizontal irradiation (transposition ≈ 0)', () => {
    const r = hourlyEnergyCore(input({ tilt: 0, acW: 1e9 }), tmy);
    expect(Math.abs(r.transpositionGainPct)).toBeLessThan(2);
    expect(r.ghiKwhM2).toBeGreaterThan(1500); // a clear year in the Deccan
  });

  it('a south-facing tilt near the latitude gains in-plane irradiation', () => {
    const flat = hourlyEnergyCore(input({ tilt: 0, acW: 1e9 }), tmy);
    const tilted = hourlyEnergyCore(input({ tilt: 17, az: 180, acW: 1e9 }), tmy);
    expect(tilted.poaKwhM2).toBeGreaterThan(flat.poaKwhM2 * 1.03);
    // and a north-facing one loses
    const north = hourlyEnergyCore(input({ tilt: 17, az: 0, acW: 1e9 }), tmy);
    expect(north.poaKwhM2).toBeLessThan(flat.poaKwhM2);
  });

  it('every stage only takes away: AC ≤ DC, temperature and IAM are real losses, nothing at night', () => {
    const r = hourlyEnergyCore(input({ tilt: 17, acW: 1e9 }), tmy);
    expect(r.annualKwh).toBeGreaterThan(0);
    expect(r.annualKwh).toBeLessThan(r.dcKwh);
    const by = Object.fromEntries(r.losses.map((l) => [l.key, l.pct]));
    expect(by.temperature).toBeGreaterThan(3);
    expect(by.temperature).toBeLessThan(15);
    expect(by.iam).toBeGreaterThan(0.5);
    expect(by.iam).toBeLessThan(6);
    expect(by.clipping).toBe(0);
    expect(r.monthlyKwh).toHaveLength(12);
    expect(r.monthlyKwh.reduce((s, v) => s + v, 0)).toBeCloseTo(r.annualKwh, -2);
  });

  it('an inverter half the size of the array clips, and the clipped hours are counted', () => {
    // 40 × 540 W = 21.6 kWp on a 10 kW inverter: DC:AC 2.16
    const r = hourlyEnergyCore(input({ tilt: 17, acW: 10_000 }), tmy);
    const by = Object.fromEntries(r.losses.map((l) => [l.key, l.pct]));
    expect(by.clipping).toBeGreaterThan(5);
    expect(r.clippingHours).toBeGreaterThan(500);
    expect(r.clippedKwh).toBeGreaterThan(0);
    // a right-sized inverter (DC:AC 1.2) barely clips
    const ok = hourlyEnergyCore(input({ tilt: 17, acW: 18_000 }), tmy);
    const byOk = Object.fromEntries(ok.losses.map((l) => [l.key, l.pct]));
    expect(byOk.clipping).toBeLessThan(1.5);
  });

  it('shade on the beam costs energy in proportion', () => {
    const open = hourlyEnergyCore(input({ tilt: 17, acW: 1e9 }), tmy);
    const half = hourlyEnergyCore(
      input({ tilt: 17, acW: 1e9, panels: input({ tilt: 17 }).panels.map((p) => ({ ...p, beamAccess: () => 0.5 })) }),
      tmy,
    );
    const by = Object.fromEntries(half.losses.map((l) => [l.key, l.pct]));
    expect(by.shading).toBeGreaterThan(30);
    expect(half.annualKwh).toBeLessThan(open.annualKwh * 0.7);
  });

  it('the inverter curve is weak at low load and peaks mid-range', () => {
    expect(inverterCurve(0)).toBe(0);
    expect(inverterCurve(0.1)).toBeLessThan(inverterCurve(0.5));
    expect(inverterCurve(0.5)).toBe(1);
    expect(inverterCurve(1)).toBeLessThan(1);
  });
});
