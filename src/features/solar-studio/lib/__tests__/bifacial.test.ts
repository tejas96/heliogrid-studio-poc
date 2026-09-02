import { describe, expect, it } from 'vitest';
import {
  buildRearGeometry,
  PHASE_BINS,
  rearIrradiance,
  surfaceAlbedo,
  type RearGeometryInput,
} from '../energy/bifacial';
import { hourlyEnergyCore, type EngineInput } from '../energy/hourly';
import { HOURS_PER_YEAR, type TmyYear } from '../energy/tmy';
import { sunPosition } from '../sun';
import { airMass } from '../energy/hourly';
import { bifacialIssues } from '../bifacial-check';
import { DEFAULT_PROFILE } from '../../data/profiles';
import { PANEL_DB } from '../../data/panels';
import { fixtureProject } from './fixtures/project';
import type { ArraySegment, Project } from '../../types';

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
    dni[h] = 950 * Math.exp(-0.09 * airMass(Math.PI / 2 - s.altitude));
    dhi[h] = 90 * Math.pow(sinA, 0.5);
    ghi[h] = dni[h] * sinA + dhi[h];
  }
  return { ghi, dni, dhi, tair, wind, timeOffsetH: 0.5 };
}

/** A ground row: 2.28 m modules at 20°, low edge 1 m up, rows 5 m apart. */
const GROUND: RearGeometryInput = { tiltDeg: 20, slantM: 2.28, lowEdgeM: 1.0, pitchM: 5 };
/** The same modules lying on a pitched roof: 10 cm of rail, rows touching. */
const FLUSH: RearGeometryInput = { tiltDeg: 20, slantM: 2.28, lowEdgeM: 0.1, pitchM: 0 };

describe('the rear side is a property of the MOUNTING, not of the module', () => {
  it('the view factors of a back account for the whole half-space', () => {
    for (const g of [buildRearGeometry(GROUND), buildRearGeometry(FLUSH)]) {
      const total = g.skyVf + g.groundVfTotal;
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(1.0001); // the rest ends on a neighbouring row
      expect(g.groundVf).toHaveLength(PHASE_BINS);
    }
  });

  it('agrees with the closed form: an all-but-isolated plane matches (1±cos β)/2', () => {
    // Put the neighbours far enough away to be genuinely out of sight (at a
    // steep tilt a row even 40 m off still clips the horizon), and the sweep
    // must reproduce the textbook view factors of a lone tilted plane. This is
    // the check that the ray sweep, its weights and its geometry are right —
    // not merely plausible.
    for (const tiltDeg of [10, 20, 30, 45]) {
      const g = buildRearGeometry({ tiltDeg, slantM: 2.28, lowEdgeM: 1, pitchM: 400 });
      const cosB = Math.cos((tiltDeg * Math.PI) / 180);
      expect(g.skyVf).toBeCloseTo((1 - cosB) / 2, 2);
      expect(g.groundVfTotal).toBeCloseTo((1 + cosB) / 2, 2);
    }
  });

  it('a back standing over open ground sees far more of it than one lying on a roof', () => {
    const open = buildRearGeometry(GROUND);
    const flat = buildRearGeometry(FLUSH);
    // a flush module's back is boxed in: less ground in view, and no sky at all
    expect(open.groundVfTotal).toBeGreaterThan(flat.groundVfTotal);
    expect(open.skyVf).toBeGreaterThan(flat.skyVf);
    // and the ground it sees is genuinely open to the sky, unlike under a flush array
    const meanOpen = [...open.binSkyVf].reduce((s, v) => s + v, 0) / PHASE_BINS;
    const meanFlat = [...flat.binSkyVf].reduce((s, v) => s + v, 0) / PHASE_BINS;
    expect(meanOpen).toBeGreaterThan(meanFlat * 2);
  });

  it('at noon the ground row collects real rear irradiance and the flush row almost none', () => {
    const noon = {
      dni: 900,
      dhi: 90,
      cosAzOffset: 1, // sun square on to the row
      sinAlt: Math.sin((70 * Math.PI) / 180),
      cosAlt: Math.cos((70 * Math.PI) / 180),
      cosThetaRear: 0,
      albedo: 0.2,
    };
    const open = rearIrradiance(buildRearGeometry(GROUND), noon);
    const flat = rearIrradiance(buildRearGeometry(FLUSH), noon);
    expect(open).toBeGreaterThan(30); // W/m² on the back — a real number
    expect(flat).toBeLessThan(open / 4);
  });

  it('a brighter surface gives a brighter back, in proportion', () => {
    const g = buildRearGeometry(GROUND);
    const hour = {
      dni: 900,
      dhi: 90,
      cosAzOffset: 1,
      sinAlt: 0.9,
      cosAlt: Math.sqrt(1 - 0.81),
      cosThetaRear: 0,
      albedo: 0.2,
    };
    const dark = rearIrradiance(g, hour);
    const bright = rearIrradiance(g, { ...hour, albedo: 0.5 });
    expect(bright).toBeGreaterThan(dark * 2);
    expect(surfaceAlbedo('tile')).toBeLessThan(surfaceAlbedo('rcc_flat'));
  });
});

describe('the design says so when a bifacial premium is being wasted', () => {
  const bifacialSpec = PANEL_DB.find((p) => p.bifacialityPct)!;

  /**
   * `rowPitchM` on the racking is what the solver ASKED for; where the modules
   * actually stand is the design. So the rows here are laid out at the pitch
   * each case is meant to test, not just declared.
   */
  function projectOn(racking: ArraySegment['racking'], roofOver = {}, pitchM = 1.2): Project {
    const base = fixtureProject(12);
    const panels = base.panels.map((p, i) => ({
      ...p,
      segmentId: 'seg_1',
      center: { x: -6 + (i % 6) * 2.4, y: -4 + Math.floor(i / 6) * pitchM },
    }));
    const seg: ArraySegment = {
      id: 'seg_1',
      roofId: 'roof_1',
      label: 'A1',
      polygon: base.roofs[0].polygon,
      rows: 2,
      cols: 6,
      orientation: 'portrait',
      azimuthDeg: 180,
      racking,
      moduleGapM: 0.02,
      removed: [],
    };
    return {
      ...base,
      roofs: [{ ...base.roofs[0], ...roofOver }],
      panels,
      segments: [seg],
      components: { ...base.components, panel: bifacialSpec },
    };
  }

  it('says nothing about a mono-facial module, whatever it is bolted to', () => {
    const mono = PANEL_DB.find((p) => !p.bifacialityPct)!;
    const p = projectOn({ kind: 'flush' }, { pitchDeg: 20, roofType: 'tile' });
    expect(bifacialIssues({ ...p, components: { ...p.components, panel: mono } })).toEqual([]);
  });

  it('flags a bifacial array lying flush on a roof — its back sees nothing', () => {
    const issues = bifacialIssues(projectOn({ kind: 'flush' }, { pitchDeg: 20, roofType: 'tile' }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('bifacial_wasted');
    expect(issues[0].level).toBe('warn');
    expect(issues[0].message).toContain(bifacialSpec.model);
    expect(issues[0].focusPanelIds?.length).toBe(12);
  });

  it('stays quiet once the same modules are raised on a table with room between the rows', () => {
    const raised = projectOn(
      { kind: 'fixed_tilt', tiltDeg: 20, rowPitchM: 5, frontLegM: 1.2, backLegM: 2, profile: DEFAULT_PROFILE },
      {},
      5,
    );
    expect(bifacialIssues(raised)).toEqual([]);
  });

  it('flags a raised table whose rows are packed too tight to let light under', () => {
    // the racking DECLARES 5 m; the modules stand 1.2 m apart. The design wins.
    const packed = projectOn(
      { kind: 'fixed_tilt', tiltDeg: 20, rowPitchM: 5, frontLegM: 1.2, backLegM: 2, profile: DEFAULT_PROFILE },
      {},
      1.2,
    );
    expect(packed.segments[0].racking).toMatchObject({ rowPitchM: 5 });
    expect(bifacialIssues(packed)[0]?.code).toBe('bifacial_wasted');
  });
});

describe('the engine turns that into an honest year', () => {
  const tmy = clearYear();
  function input(over: Partial<EngineInput> & { rear?: RearGeometryInput | null; bif?: number } = {}): EngineInput {
    const { rear = GROUND, bif = 0.7, ...rest } = over;
    const geom = rear ? buildRearGeometry(rear) : null;
    return {
      lat: LAT,
      lng: LNG,
      panels: Array.from({ length: 40 }, () => ({
        tiltDeg: 20,
        azimuthDeg: 180,
        pstcW: 550,
        u0: 25,
        u1: 6.84,
        beamAccess: () => 1,
        bifaciality: bif,
        rear: geom,
      })),
      inverter: { acW: 1e9, count: 1, etaMax: 0.98 },
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

  it('a mono-facial module gains exactly nothing, and its year is unchanged', () => {
    const mono = hourlyEnergyCore(input({ bif: 0 }), tmy);
    expect(mono.rearGainPct).toBe(0);
    expect(mono.rearKwhM2).toBe(0);
  });

  it('a bifacial ground row gains a believable amount — and the flush roof one barely any', () => {
    const mono = hourlyEnergyCore(input({ bif: 0 }), tmy);
    const ground = hourlyEnergyCore(input({ rear: GROUND }), tmy);
    const flush = hourlyEnergyCore(input({ rear: FLUSH }), tmy);
    // the published range for a raised bifacial row over ordinary ground
    expect(ground.rearGainPct).toBeGreaterThan(3);
    expect(ground.rearGainPct).toBeLessThan(15);
    expect(ground.annualKwh).toBeGreaterThan(mono.annualKwh);
    // lying on a roof, the same module and the same factor are worth almost nothing
    expect(flush.rearGainPct).toBeLessThan(ground.rearGainPct / 3);
    expect(flush.rearKwhM2).toBeLessThan(ground.rearKwhM2);
  });

  it('a brighter surface under the array is worth more energy', () => {
    const dark = hourlyEnergyCore(input({ albedo: 0.15 }), tmy);
    const bright = hourlyEnergyCore(input({ albedo: 0.5 }), tmy);
    expect(bright.rearGainPct).toBeGreaterThan(dark.rearGainPct * 2);
    expect(bright.annualKwh).toBeGreaterThan(dark.annualKwh);
  });
});
