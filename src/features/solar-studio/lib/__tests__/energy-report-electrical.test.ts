// ─── The gate: a loss that is printed is a loss that is deducted ────────────
//
// "Shading — electrical (strings)" used to be pushed into the report's loss
// waterfall and subtracted from nothing: annual kWh, PR and the total were all
// taken before it, in BOTH engines. A sheet could show a 6% row, a total that
// excluded it and an unchanged MWh headline above both. The only guard was
// `total < Σ rows`, which multiplicative composition satisfies trivially.
//
// This pins the strict identity instead: the survival factor behind the total
// equals the product of the printed rows' survival factors, and switching the
// string term on scales the energy and the PR by exactly that factor.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Roof, SiteTmy, StringDef } from '../../types';
import { PANEL_DB } from '../../data/panels';
import { newProject } from '../../store/store';
import { computeEnergyReport } from '../energy/report';
import { airMass } from '../energy/hourly';
import { HOURS_PER_YEAR, type TmyYear } from '../energy/tmy';
import { setShadeProfile, type ShadeProfile } from '../shade-profile-cache';
import { sunPosition } from '../sun';

const PIN = { lat: 18.52, lng: 73.86 };
const FP = 'electrical-gate-fp';

/** A clear-sky typical year from the engine's own sun, built once. */
let year: TmyYear | null = null;
function clearYear(): TmyYear {
  if (year) return year;
  const n = HOURS_PER_YEAR;
  const ghi = new Float32Array(n);
  const dni = new Float32Array(n);
  const dhi = new Float32Array(n);
  const start = Date.UTC(2019, 0, 1);
  for (let h = 0; h < n; h++) {
    const s = sunPosition(new Date(start + (h + 0.5) * 3_600_000), PIN.lat, PIN.lng);
    if (s.altitude <= 0) continue;
    const sinA = Math.sin(s.altitude);
    dni[h] = 950 * Math.exp(-0.09 * airMass(Math.PI / 2 - s.altitude));
    dhi[h] = 90 * Math.sqrt(sinA);
    ghi[h] = dni[h] * sinA + dhi[h];
  }
  year = { ghi, dni, dhi, tair: new Float32Array(n).fill(28), wind: new Float32Array(n).fill(2), timeOffsetH: 0.5 };
  return year;
}

// the hourly engine runs only when the pin's typical year is in memory; the
// real cache fills from the blob store, so hand it the synthetic year instead
vi.mock('../energy/tmy', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../energy/tmy')>();
  return { ...orig, peekTmy: (meta: SiteTmy | null | undefined) => (meta ? clearYear() : null) };
});

/** One string of two modules: `p0` clear all year, `p1` far enough below it
 *  to be bypassed every sample — in series that costs ~19% of the beam. */
function profile(): ShadeProfile {
  return {
    samples: [
      { month: 3, hour: 9, weight: 1 },
      { month: 3, hour: 12, weight: 1 },
    ],
    bySample: new Map([
      ['p0', Float32Array.from([1, 1])],
      ['p1', Float32Array.from([0.4, 0.4])],
    ]),
    byCaster: new Map(),
    access: new Map([
      ['p0', 1],
      ['p1', 0.4],
    ]),
  };
}

function fixture(hourly: boolean): Project {
  const p = newProject();
  const roof: Roof = {
    id: 'r1',
    name: 'r1',
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ],
    roofType: 'rcc_flat',
    heightM: 3,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 0.5,
    perEdgeSetbacksM: null,
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
  const tmy: SiteTmy = {
    source: 'pvgis-tmy',
    blobId: 'synthetic',
    forLatLng: PIN,
    radiationDb: 'synthetic',
    yearMin: null,
    yearMax: null,
    timeOffsetH: 0.5,
    elevationM: null,
    fetchedAt: 0,
  };
  return {
    ...p,
    location: {
      address: 't',
      latLng: PIN,
      confirmed: true,
      irradiance: 5.3,
      peakSunHours: 5.3,
      dataSource: 't',
      ...(hourly ? { tmy } : {}),
    } as Project['location'],
    roofs: [roof],
    components: { ...p.components, panel: PANEL_DB[0] },
    panels: Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      enabled: true,
      tiltDeg: 10,
      azimuthDeg: 180,
      solarAccess: 1,
      center: { x: i * 0.5, y: 0 },
      roofId: 'r1',
    })) as unknown as Project['panels'],
    strings: [{ id: 's1', panelIds: ['p0', 'p1'] } as unknown as StringDef],
    derived: { ...p.derived, solarAccessFp: FP },
  };
}

describe.each([
  ['monthly', false],
  ['hourly', true],
])('the electrical (string) loss is deducted — %s engine', (engine, hourly) => {
  beforeEach(() => {
    setShadeProfile(FP, profile());
  });

  it('switching the term on scales the energy and the PR by exactly the printed row, and the total is the product of every row', () => {
    // same profile, same beam shade by the hour — only the string is missing,
    // so the two runs differ by the string term and nothing else
    const off = computeEnergyReport({ ...fixture(hourly), strings: [] });
    expect(off.engine).toBe(engine);
    expect(off.losses.find((l) => l.key === 'shading_electrical')).toBeUndefined();

    const on = computeEnergyReport(fixture(hourly));
    expect(on.engine).toBe(engine);
    const row = on.losses.find((l) => l.key === 'shading_electrical')!;
    expect(row.pct).toBeGreaterThan(10);
    const factor = 1 - row.pct / 100;

    // the headline, the PR and the months all moved by the row
    expect(on.annualKwh).toBeCloseTo(off.annualKwh * factor, 3);
    expect(on.performanceRatio).toBeCloseTo(off.performanceRatio * factor, 0);
    expect(on.performanceRatio).toBeLessThan(off.performanceRatio);
    expect(on.monthlyKwh.reduce((s, v) => s + v, 0)).toBeCloseTo(on.annualKwh, -2);

    // and a reader who multiplies the rows out lands on the total
    // (each row is rounded to 0.1%, so allow their rounding to stack — the
    // old code missed by the whole string term, ~0.15)
    const survival = on.losses.reduce((acc, l) => acc * (1 - l.pct / 100), 1);
    expect(Math.abs(1 - on.totalLossPct / 100 - survival)).toBeLessThan(0.01);
  });
});
