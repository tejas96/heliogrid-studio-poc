// ─── Phase 22m gates: the Legs (2D) editor's decisions ──────────────────────
// The headline gate is parity: every mouse action must have a keyboard
// equivalent producing an IDENTICAL patch. That is only provable if both paths
// call the same function, which is why the decisions live in lib and the
// component only renders — the same split used for structure-view and bom/view.
import { describe, expect, it } from 'vitest';
import {
  NUDGE_FINE_M,
  NUDGE_M,
  addLeg,
  autoSeedPoints,
  buildableRegion,
  moveLeg,
  nudgeFor,
  planMode,
  planPoints,
  removeLeg,
  resetToAuto,
  validateLegPoint,
} from '../leg-plan-edit';
import { segmentFrameAngle } from '../segment-ops';
import { projectStructures } from '../structure';
import { layoutFp } from '../fingerprints';
import { rotate } from '../geo';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PlacedPanel, Project, XY } from '../../types';

const W = 1.134;
const GAP = 0.05;

function scene(opts: { legPlan?: { points: XY[] }; azimuthDeg?: number } = {}) {
  const base = fixtureProject(0);
  const roof = fixtureRoof();
  const az = opts.azimuthDeg ?? 180;
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: roof.id,
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: 8,
    orientation: 'portrait',
    azimuthDeg: az,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 0,
      frontLegM: 0.3,
      backLegM: 0.3,
      profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 },
    },
    moduleGapM: GAP,
    removed: [],
    ...(opts.legPlan ? { legPlan: opts.legPlan } : {}),
  };
  const angle = segmentFrameAngle(roof, seg, []);
  const panels: PlacedPanel[] = [0, 1, 2, 3].map((c) => ({
    id: `pv_${c}`,
    roofId: roof.id,
    center: rotate({ x: c * (W + GAP), y: 0 }, angle),
    orientation: 'portrait',
    azimuthDeg: az,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: c,
  }));
  const project: Project = { ...base, roofs: [roof], segments: [seg], panels };
  return { project, roof, seg, panels, angle };
}

/** apply a successful result and hand back the updated project + segment */
const apply = (p: Project, r: ReturnType<typeof addLeg>) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  const next = { ...p, ...r.patch } as Project;
  return { project: next, seg: next.segments[0] };
};

describe('add / remove / reset', () => {
  it('adding to an AUTO table seeds from the automatic stations, then adds one', () => {
    const { project, roof, seg, panels } = scene();
    expect(planMode(seg)).toBe('auto');
    const seeded = autoSeedPoints(roof, seg, panels, 2, project.components.panel!);
    expect(seeded.length).toBeGreaterThan(1);

    const r = apply(project, addLeg(project, roof, seg, panels, { x: 1, y: 0 }, 2, project.components.panel!));
    // the user adds to what they were LOOKING at — the automatic legs do not
    // vanish the moment the first custom one lands
    expect(planPoints(r.seg)).toHaveLength(seeded.length + 1);
    expect(planMode(r.seg)).toBe('custom');
  });

  it('adding to a CUSTOM table adds exactly one', () => {
    const { project, roof, seg, panels } = scene({ legPlan: { points: [{ x: 0, y: 0 }] } });
    const r = apply(project, addLeg(project, roof, seg, panels, { x: 1, y: 0 }, 2, project.components.panel!));
    expect(planPoints(r.seg)).toHaveLength(2);
  });

  it('removing takes exactly one away', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const { project, seg } = scene({ legPlan: { points: pts } });
    const r = apply(project, removeLeg(project, seg, 1));
    expect(planPoints(r.seg)).toHaveLength(2);
    expect(planPoints(r.seg).map((p) => p.x)).toEqual([0, 2]);
  });

  it('removing the LAST leg returns the table to AUTO, key and all', () => {
    const { project, seg } = scene({ legPlan: { points: [{ x: 0, y: 0 }] } });
    const r = apply(project, removeLeg(project, seg, 0));
    expect(planMode(r.seg)).toBe('auto');
    expect('legPlan' in r.seg).toBe(false); // removed, not undefined
  });

  it('reset drops the plan and the graph matches AUTO exactly', () => {
    const { project, roof, seg, panels } = scene();
    const auto = projectStructures(project);
    const planned = apply(
      project,
      addLeg(project, roof, seg, panels, { x: 1, y: 0 }, 2, project.components.panel!),
    ).project;
    expect(projectStructures(planned)[0].members.length).not.toBe(auto[0].members.length);

    const back = apply(planned, resetToAuto(planned, planned.segments[0])).project;
    expect('legPlan' in back.segments[0]).toBe(false);
    expect(projectStructures(back)).toEqual(auto);
    expect(layoutFp(back)).toBe(layoutFp(project)); // byte-identical again
  });

  it('removing a leg that is not there is refused with a reason', () => {
    const { project, seg } = scene({ legPlan: { points: [{ x: 0, y: 0 }] } });
    const r = removeLeg(project, seg, 7);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBeTruthy();
  });
});

// ═══════════════════════════════ E4 ═════════════════════════════════════════
describe('a leg must land on buildable roof (E4)', () => {
  it('inside the setback is accepted', () => {
    const { roof, angle } = scene();
    const inside = rotate(buildableRegion(roof)[0], -angle);
    // nudge inward from the corner so we are safely inside
    expect(validateLegPoint({ x: inside.x + 1, y: inside.y + 1 }, roof, angle)).toBeNull();
  });

  it('outside the roof is REFUSED, with a reason a person can act on', () => {
    const { roof, angle } = scene();
    const bad = validateLegPoint({ x: 9999, y: 9999 }, roof, angle);
    expect(bad?.ok).toBe(false);
    expect(bad && !bad.ok && bad.reason).toMatch(/setback|buildable/i);
  });

  it('a drag that would leave the roof is rejected and changes NOTHING', () => {
    const { project, roof, seg, panels } = scene({ legPlan: { points: [{ x: 0, y: 0 }] } });
    const r = moveLeg(project, roof, seg, panels, 0, { x: 9999, y: 0 });
    expect(r.ok).toBe(false);
    expect(planPoints(seg)).toEqual([{ x: 0, y: 0 }]); // untouched
  });

  it('an ADD outside the roof is refused too — not just a drag', () => {
    const { project, roof, seg, panels } = scene();
    expect(addLeg(project, roof, seg, panels, { x: -9999, y: 0 }, 2, project.components.panel!).ok).toBe(false);
  });

  it('the check is in WORLD space — a rotated table is not a loophole', () => {
    // on a rotated table a local point maps somewhere quite different in world
    // space; validating in local coordinates would let legs off the roof
    for (const az of [180, 90, 0, 270]) {
      const { roof, angle } = scene({ azimuthDeg: az });
      expect(validateLegPoint({ x: 9999, y: 9999 }, roof, angle)?.ok, `az ${az}`).toBe(false);
    }
  });
});

// ═════════════════════════ KEYBOARD PARITY (D11) ════════════════════════════
describe('every mouse action has an identical keyboard equivalent', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1.5, y: 0 }];

  it('arrow-nudge and drag produce the SAME patch', () => {
    const { project, roof, seg, panels } = scene({ legPlan: { points: pts } });
    const delta = nudgeFor('ArrowRight', false)!;

    const byKeyboard = moveLeg(project, roof, seg, panels, 1, delta);
    const byDrag = moveLeg(project, roof, seg, panels, 1, { x: NUDGE_M, y: 0 });

    expect(byKeyboard.ok && byDrag.ok).toBe(true);
    if (byKeyboard.ok && byDrag.ok) {
      // identical because they are the same call, not two implementations
      expect(byKeyboard.patch).toEqual(byDrag.patch);
      expect(byKeyboard.announce).toEqual(byDrag.announce);
    }
  });

  it('all four arrows move in the right direction', () => {
    expect(nudgeFor('ArrowRight', false)).toEqual({ x: NUDGE_M, y: 0 });
    expect(nudgeFor('ArrowLeft', false)).toEqual({ x: -NUDGE_M, y: 0 });
    expect(nudgeFor('ArrowUp', false)).toEqual({ x: 0, y: NUDGE_M });
    expect(nudgeFor('ArrowDown', false)).toEqual({ x: 0, y: -NUDGE_M });
  });

  it('Shift is the fine step', () => {
    expect(nudgeFor('ArrowRight', true)).toEqual({ x: NUDGE_FINE_M, y: 0 });
    expect(NUDGE_FINE_M).toBeLessThan(NUDGE_M);
  });

  it('a non-arrow key is not a nudge', () => {
    for (const k of ['Enter', 'a', 'Tab', 'Escape']) expect(nudgeFor(k, false)).toBeNull();
  });

  it('every successful action announces something for a screen reader', () => {
    const { project, roof, seg, panels } = scene({ legPlan: { points: pts } });
    const results = [
      addLeg(project, roof, seg, panels, { x: 2, y: 0 }, 2, project.components.panel!),
      moveLeg(project, roof, seg, panels, 0, { x: NUDGE_M, y: 0 }),
      removeLeg(project, seg, 0),
      resetToAuto(project, seg),
    ];
    for (const r of results) {
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.announce.length).toBeGreaterThan(0);
    }
  });

  it('a refusal carries a reason, so it is never a silent no-op', () => {
    const { project, roof, seg, panels } = scene({ legPlan: { points: pts } });
    const r = moveLeg(project, roof, seg, panels, 0, { x: 9999, y: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
  });
});

describe('the edits reach the structure', () => {
  it('an added leg becomes a real leg in the member graph', () => {
    const { project, roof, seg, panels } = scene();
    const before = projectStructures(project)[0].memberSummary.front_leg.count;
    const after = apply(project, addLeg(project, roof, seg, panels, { x: 1, y: 0 }, 2, project.components.panel!)).project;
    expect(projectStructures(after)[0].memberSummary.front_leg.count).toBe(before + 1);
  });

  it('a moved leg moves the steel, so the fingerprint moves too', () => {
    const { project, roof, seg, panels } = scene({
      legPlan: { points: [{ x: 0, y: 0 }, { x: 1.5, y: 0 }] },
    });
    const moved = apply(
      project,
      moveLeg(project, roof, seg, panels, 1, { x: NUDGE_M, y: 0 }),
    ).project;
    expect(layoutFp(moved)).not.toBe(layoutFp(project));
  });
});
