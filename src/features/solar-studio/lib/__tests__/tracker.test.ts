import { describe, expect, it } from 'vitest';
import {
  resolveTrackerAxis,
  trackerGcr,
  trackerAxisFromSegment,
  trackerPose,
  TRACKER_DEFAULT_MAX_ROTATION_DEG,
  type TrackerAxis,
} from '../energy/tracker';
import { airMass, hourlyEnergyCore, type EngineInput } from '../energy/hourly';
import { HOURS_PER_YEAR, type TmyYear } from '../energy/tmy';
import { sunPosition } from '../sun';
import { segmentSetRacking } from '../ops/layout-ops';
import { mergedBom } from '../bom';
import { DEFAULT_PROFILE } from '../../data/profiles';
import { fixtureProject } from './fixtures/project';
import type { ArraySegment, Project } from '../../types';

const LAT = 16.85;
const LNG = 74.56;

/** A north–south tube with room between the rows: GCR 0.35, ±55°. */
const OPEN: TrackerAxis = { axisAzimuthDeg: 0, maxRotationDeg: 55, gcr: 0.35, backtracking: true };

describe('a single-axis tracker points where the sun is', () => {
  it('faces east in the morning, lies flat at noon, faces west in the evening', () => {
    // free of both limits, so the pointing itself is what is under test
    const noBacktrack: TrackerAxis = { ...OPEN, backtracking: false, maxRotationDeg: 90 };
    const morning = trackerPose(noBacktrack, 30, 90); // sun 30° up, due east
    expect(morning.rotationDeg).toBeCloseTo(60, 1);
    expect(morning.tiltDeg).toBeCloseTo(60, 1);
    expect(morning.azimuthDeg).toBe(90); // facing east

    const noon = trackerPose(noBacktrack, 70, 180); // sun high, due south
    expect(noon.rotationDeg).toBeCloseTo(0, 6); // a N–S tube cannot chase the south
    expect(noon.tiltDeg).toBeCloseTo(0, 6);

    const evening = trackerPose(noBacktrack, 30, 270); // sun 30° up, due west
    expect(evening.rotationDeg).toBeCloseTo(-60, 1);
    expect(evening.azimuthDeg).toBe(270); // facing west
  });

  it('stows flat once the sun is down', () => {
    expect(trackerPose(OPEN, -5, 90).tiltDeg).toBe(0);
    expect(trackerPose(OPEN, 0, 90).rotationDeg).toBe(0);
  });

  it('never turns past the hardware limit', () => {
    const tight: TrackerAxis = { ...OPEN, maxRotationDeg: 45, backtracking: false };
    const low = trackerPose(tight, 5, 90); // sun almost on the horizon, due east
    expect(low.rotationDeg).toBe(45);
    expect(low.tiltDeg).toBe(45);
  });

  it('backtracks only once a row would actually shade the next, and by the right amount', () => {
    // Shading starts at acos(gcr): with GCR 0.35 that is 69.5°, so a rotation
    // of 60° is still clear and must be left alone.
    const free: TrackerAxis = { ...OPEN, maxRotationDeg: 90 };
    const clear = trackerPose(free, 30, 90);
    expect(clear.backtracked).toBe(false);
    expect(clear.rotationDeg).toBeCloseTo(60, 1);

    // A lower sun wants more rotation than the rows allow, so the tube gives
    // back exactly enough to lay the shadow's edge on the next row's edge.
    const low = trackerPose(free, 10, 90);
    const ideal = trackerPose({ ...free, backtracking: false }, 10, 90);
    expect(ideal.rotationDeg).toBeCloseTo(80, 1);
    expect(low.backtracked).toBe(true);
    expect(low.rotationDeg).toBeLessThan(ideal.rotationDeg);

    // EXACT, from the geometry rather than from the formula that produced it:
    // a row of width w at rotation R, with the sun at profile angle p, throws a
    // shadow w·sin(R + p)/sin(p) wide. Backtracking should make that exactly
    // the row pitch, w/gcr — no more (rows shade) and no less (yield thrown away).
    const profileDeg = 90 - ideal.rotationDeg; // the sun, across the tube
    const shadow =
      Math.sin(((low.rotationDeg + profileDeg) * Math.PI) / 180) / Math.sin((profileDeg * Math.PI) / 180);
    expect(shadow).toBeCloseTo(1 / free.gcr, 6);

    // Packed rows backtrack sooner and harder than open ones.
    const packed = trackerPose({ ...free, gcr: 0.7 }, 10, 90);
    expect(packed.rotationDeg).toBeLessThan(low.rotationDeg);
  });

  it('turns the other way for a tube that is not north–south', () => {
    const ew: TrackerAxis = { ...OPEN, axisAzimuthDeg: 90, backtracking: false, maxRotationDeg: 90 };
    // an east–west tube cannot chase a sun due east; it can chase one due south
    expect(trackerPose(ew, 30, 90).rotationDeg).toBeCloseTo(0, 6);
    const south = trackerPose(ew, 30, 180);
    expect(south.tiltDeg).toBeCloseTo(60, 1);
    expect(south.azimuthDeg).toBe(180);
  });

  it('lays its tube along the table’s rows, not along a fixed compass bearing', () => {
    // The tube IS a row, so it runs across the table's facing. A table facing
    // the equator has east–west rows; facing EAST gives the north–south tubes
    // a utility field is actually built with.
    expect(trackerAxisFromSegment(180)).toBe(270); // faces south ⇒ east–west tubes
    expect(trackerAxisFromSegment(90)).toBe(180); // faces east ⇒ north–south tubes
    expect(resolveTrackerAxis({ rowPitchM: 6.5 }, 2.28, 90).axisAzimuthDeg).toBe(180);
    // an explicitly stored bearing still wins
    expect(resolveTrackerAxis({ rowPitchM: 6.5, axisAzimuthDeg: 20 }, 2.28, 90).axisAzimuthDeg).toBe(20);
  });

  it('reads its axis off the stored racking, filling the lazy fields', () => {
    const axis = resolveTrackerAxis({ rowPitchM: 6.5 }, 2.28, 90);
    expect(axis.axisAzimuthDeg).toBe(180);
    expect(axis.maxRotationDeg).toBe(TRACKER_DEFAULT_MAX_ROTATION_DEG);
    expect(axis.backtracking).toBe(true);
    expect(axis.gcr).toBeCloseTo(2.28 / 6.5, 6);
    expect(trackerGcr(2.28, 0)).toBe(1); // no pitch known ⇒ treat as packed
  });
});

describe('a tracker belongs on open ground, and brings its own hardware', () => {
  function groundProject(kind: 'tracker_hsat' | 'fixed_tilt', roofType: 'ground' | 'rcc_flat' = 'ground'): Project {
    const base = fixtureProject(12);
    const spec = base.components.panel!;
    // Three tubes of four modules. The tube runs NORTH–SOUTH, so its modules
    // stand side by side along y at their own width, and the tubes are set
    // apart east–west at the row pitch.
    const panels = base.panels.map((p, i) => ({
      ...p,
      segmentId: 'seg_1',
      tiltDeg: 0,
      center: { x: -6.5 + Math.floor(i / 4) * 6.5, y: -1.8 + (i % 4) * 1.2 },
    }));
    const seg: ArraySegment = {
      id: 'seg_1',
      roofId: 'roof_1',
      label: 'A1',
      polygon: base.roofs[0].polygon,
      rows: 3,
      cols: 4,
      orientation: 'portrait',
      azimuthDeg: 90,
      racking:
        kind === 'tracker_hsat'
          ? { kind, tiltDeg: 0, rowPitchM: 6.5, frontLegM: 1.5, backLegM: 1.5, profile: DEFAULT_PROFILE }
          : { kind, tiltDeg: 15, rowPitchM: 6.5, frontLegM: 0.3, backLegM: 0.9, profile: DEFAULT_PROFILE },
      moduleGapM: 0.02,
      removed: [],
    };
    void spec;
    return { ...base, roofs: [{ ...base.roofs[0], roofType }], panels, segments: [seg] };
  }

  it('refuses to go on a roof, however the request arrives', () => {
    const onRoof = groundProject('fixed_tilt', 'rcc_flat');
    expect(segmentSetRacking.validate?.(onRoof, { segmentId: 'seg_1', kind: 'tracker_hsat' })).toEqual({
      reason: 'A tracker needs open ground, not a roof',
    });
    const onGround = groundProject('fixed_tilt', 'ground');
    expect(segmentSetRacking.validate?.(onGround, { segmentId: 'seg_1', kind: 'tracker_hsat' })).toBeNull();
  });

  it('counts a tube per row, a bearing per post and a drive per row — none of it on a fixed table', () => {
    const fixedLines = mergedBom(groundProject('fixed_tilt'));
    expect(fixedLines.find((l) => l.id.startsWith('mech.tracker'))).toBeUndefined();

    const lines = mergedBom(groundProject('tracker_hsat'));
    const byId = new Map(lines.map((l) => [l.id, l]));
    const tube = byId.get('mech.tracker_tube')!;
    const bearing = byId.get('mech.tracker_bearing')!;
    const drive = byId.get('mech.tracker_drive')!;
    const controller = byId.get('mech.tracker_controller')!;
    expect(drive.qty).toBe(3); // three rows ⇒ three tubes ⇒ three drives
    expect(controller.qty).toBe(1); // one per plant, whatever the row count
    expect(tube.qty).toBeGreaterThan(3 * 3.6); // 4 modules across each row, plus one width
    expect(bearing.qty).toBeGreaterThanOrEqual(3 * 2); // at least two posts a row
    // priced honestly: nobody may read these as a quotation
    for (const l of [tube, bearing, drive, controller]) {
      expect(l.confidence).toBe('assumed');
      expect(l.formula).toContain('ASSUMED market rate');
    }
  });
});

describe('what a tracker is worth over a year', () => {
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

  function input(over: Partial<EngineInput> & { tracker?: TrackerAxis | null; tilt?: number } = {}): EngineInput {
    const { tracker = null, tilt = 17, ...rest } = over;
    return {
      lat: LAT,
      lng: LNG,
      panels: Array.from({ length: 40 }, () => ({
        tiltDeg: tracker ? 0 : tilt,
        azimuthDeg: tracker ? 90 : 180,
        pstcW: 550,
        u0: 25,
        u1: 6.84,
        beamAccess: () => 1,
        tracker,
      })),
      // A REAL inverter. Sizing it enormously to "switch clipping off" would
      // park it at a thousandth of a percent load, where its efficiency curve
      // is near zero and non-linear — which silently rewrites any comparison
      // of two designs' annual energy. 30 kW on 22 kWp clips nothing.
      inverter: { acW: 30_000, count: 1, etaMax: 0.98 },
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

  const tmy = clearYear();

  it('beats a fixed array facing the equator, by the margin the market quotes', () => {
    const fixed = hourlyEnergyCore(input({ tracker: null, tilt: 17 }), tmy);
    const tracked = hourlyEnergyCore(input({ tracker: OPEN }), tmy);
    const gain = tracked.annualKwh / fixed.annualKwh - 1;
    // Indian utility practice puts a backtracking HSAT 15–30% above fixed tilt;
    // this clear-sky test year is beam-rich, so it sits at the top of that band
    expect(gain).toBeGreaterThan(0.15);
    expect(gain).toBeLessThan(0.4);
    // and it collects more in-plane irradiation to do it
    expect(tracked.poaKwhM2).toBeGreaterThan(fixed.poaKwhM2);
  });

  it('loses ground when the rows are packed, because backtracking gives more away', () => {
    const open = hourlyEnergyCore(input({ tracker: OPEN }), tmy);
    const packed = hourlyEnergyCore(input({ tracker: { ...OPEN, gcr: 0.8 } }), tmy);
    expect(packed.annualKwh).toBeLessThan(open.annualKwh);
  });

  it('a tighter rotation limit collects less', () => {
    const wide = hourlyEnergyCore(input({ tracker: OPEN }), tmy);
    const narrow = hourlyEnergyCore(input({ tracker: { ...OPEN, maxRotationDeg: 30 } }), tmy);
    expect(narrow.annualKwh).toBeLessThan(wide.annualKwh);
  });
});
