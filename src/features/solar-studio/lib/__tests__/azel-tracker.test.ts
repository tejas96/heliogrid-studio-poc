// ─── Gate: a dual-axis tracker POINTS, and costs one machine per frame ──────
// Two claims separate this from the single-axis tracker beside it, and both
// are easy to break quietly:
//
//   it points AT the sun, so incidence is zero inside the stops — and the
//   stops are real, so outside them it is not pointing and the loss is real
//   too; and
//
//   nothing is shared. A single-axis ROW is one tube, one drive and a line of
//   light piles; every dual-axis unit is its own mast, its own drive and its
//   own cast pier. Building it on the elevated-table model would quote a line
//   of legs and footings for a machine that has one of each — the same class
//   of error the carport and facade slices were each caught on.
import { describe, expect, it } from 'vitest';
import { resolveTrackerAxis, trackerPose, AZEL_DEFAULT_MAX_TILT_DEG, AZEL_DEFAULT_MIN_TILT_DEG, AZEL_DEFAULT_AZIMUTH_RANGE_DEG, AZEL_FRAME_MODULES } from '../energy/tracker';
import { projectStructures, topologyOf, allowedFoundations } from '../structure';
import { setSegmentRacking } from '../segment-ops';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PlacedPanel, Project, Roof } from '../../types';

const AZEL = resolveTrackerAxis({ kind: 'tracker_azel', rowPitchM: 8 }, 2.382, 180);

/** A 2 × 8 ground table — two whole frames' worth of modules, and no more. */
function field(): { project: Project; roof: Roof; seg: ArraySegment } {
  const base = fixtureProject(0);
  const roof: Roof = { ...fixtureRoof(), roofType: 'ground', heightM: 0, setbackM: 1.5 };
  const spec = base.components.panel!;
  const w = spec.widthMm / 1000;
  const h = spec.lengthMm / 1000;
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: roof.id,
    label: 'A1',
    polygon: [],
    rows: 2,
    cols: 8,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: { kind: 'fixed_tilt', tiltDeg: 20, rowPitchM: 8, frontLegM: 1.5, backLegM: 2.3, profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 } },
    moduleGapM: 0.05,
    removed: [],
  };
  const panels: PlacedPanel[] = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 8; c++)
      panels.push({
        id: `pv_${r}_${c}`,
        roofId: roof.id,
        center: { x: c * (w + 0.05), y: r * (h + 0.05) },
        orientation: 'portrait',
        azimuthDeg: 180,
        tiltDeg: 20,
        solarAccess: 1,
        enabled: true,
        segmentId: 'seg_t',
        cellIndex: r * 1000 + c,
      });
  const project: Project = { ...base, roofs: [roof], panels, segments: [seg] };
  const turned = setSegmentRacking(roof, spec, seg, panels, 'tracker_azel');
  return {
    project: { ...project, segments: [turned.segment], panels: turned.panels },
    roof,
    seg: turned.segment,
  };
}

describe('a dual-axis tracker points at the sun, within its stops', () => {
  it('inside the stops the frame faces the sun square on', () => {
    for (const [alt, az] of [[45, 180], [50, 140], [40, 220]] as const) {
      const p = trackerPose(AZEL, alt, az);
      expect(p.tiltDeg, `alt ${alt}`).toBeCloseTo(90 - alt, 6);
      expect(p.azimuthDeg, `az ${az}`).toBeCloseTo(az, 6);
      // zero incidence: the plane's normal IS the sun's direction
      const t = (p.tiltDeg * Math.PI) / 180;
      const a = (p.azimuthDeg * Math.PI) / 180;
      const sa = (alt * Math.PI) / 180;
      const sz = (az * Math.PI) / 180;
      const dot =
        Math.sin(t) * Math.sin(a) * (Math.cos(sa) * Math.sin(sz)) +
        Math.cos(t) * Math.sin(sa) +
        -Math.sin(t) * Math.cos(a) * (-Math.cos(sa) * Math.cos(sz));
      expect(dot).toBeCloseTo(1, 6);
    }
  });

  it('the stops are real — and outside them it is NOT pointing at the sun', () => {
    // a high sun would want a flatter frame than the hardware will lie
    expect(trackerPose(AZEL, 89, 180).tiltDeg).toBe(AZEL_DEFAULT_MIN_TILT_DEG);
    // a low sun would want it nearly upright
    expect(trackerPose(AZEL, 5, 180).tiltDeg).toBe(AZEL_DEFAULT_MAX_TILT_DEG);
    // and the slew runs out before the sun does on a long summer evening
    const late = trackerPose(AZEL, 10, 320);
    expect(Math.abs(((late.azimuthDeg - 180 + 540) % 360) - 180)).toBe(AZEL_DEFAULT_AZIMUTH_RANGE_DEG);
    // below the horizon it parks, it does not chase
    expect(trackerPose(AZEL, -1, 90).tiltDeg).toBe(AZEL_DEFAULT_MIN_TILT_DEG);
  });

  it('it never backtracks — spacing is the only thing keeping it out of its own shadow', () => {
    // the single-axis machine gives up incidence to keep the next row lit; a
    // pointed frame has nothing to give up, so this flag must stay false or a
    // dual-axis design would be silently flattened at every low sun
    expect(AZEL.backtracking).toBe(false);
    for (const alt of [5, 15, 30, 60]) expect(trackerPose(AZEL, alt, 180).backtracked).toBe(false);
  });
});

describe('a dual-axis unit is one mast, not a table of legs', () => {
  it('it builds a mast, a frame and a pier per unit — and nothing shared', () => {
    const { project, roof, seg } = field();
    expect(topologyOf(roof, seg)).toBe('azel_pedestal');
    const [s] = projectStructures(project);
    expect(s, 'a dual-axis field must build a structure').toBeTruthy();

    // 16 modules at 8 per frame = 2 units, so 2 masts and 2 piers
    const units = 16 / AZEL_FRAME_MODULES;
    expect(s.memberSummary.front_leg.count, 'one mast per unit').toBe(units);
    expect(s.nodes.filter((n) => n.kind === 'roof_anchor').length, 'one pier per unit').toBe(units);
    // THE money assertion: an elevated table of this size would stand a line of
    // legs along every row. There is no back leg on a mast at all.
    expect(s.memberSummary.back_leg.count).toBe(0);
    expect(s.memberSummary.brace.count).toBe(0);
    // and the pier is a CAST one, counted where the BOM reads it
    expect(s.nodes.reduce((t, n) => t + (n.fastenerSpec.pedestals ?? 0), 0)).toBe(units);
  });

  it('the mast is TALL enough that the frame clears the ground when it lifts', () => {
    const { project } = field();
    const [s] = projectStructures(project);
    const mast = s.members.find((m) => m.kind === 'front_leg')!;
    // half a 2-module frame lifted to the stop swings down by that much; the
    // mast must be taller than the swing, or the modules plough the field
    const frameHalf = (2 * 2.382 + 0.05) / 2;
    const swing = frameHalf * Math.sin((AZEL_DEFAULT_MAX_TILT_DEG * Math.PI) / 180);
    expect(mast.lengthM).toBeGreaterThan(swing);
    // it is derived, not the fixed table's leg height it started from
    expect(mast.lengthM).toBeGreaterThan(1.5);
  });

  it('a mast is cast in — one answer, so drawn and counted cannot differ', () => {
    const { roof, seg } = field();
    expect(allowedFoundations(roof, seg)).toEqual(['concrete']);
  });
});
