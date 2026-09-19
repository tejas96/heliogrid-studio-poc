// ─── Gate: a facade is laid out in ELEVATION, not in plan ───────────────────
// Every other mounting surface in this app answers "how high is it here?" from
// its plan position. A wall cannot: in plan it is a LINE, so two modules one
// above the other are the same plan point at different heights.
//
// That single fact is what every check below pins, because getting it wrong does
// not throw — it produces a facade that looks plausible and is wrong in three
// separate ways at once:
//
//   · the plan fill places ONE course and rejects the rest as collisions,
//   · the DRC reports every course above the first as overlapping the one under
//     it, and every module as breaching the boundary (they hang off the face by
//     design), and
//   · every module renders and is ray-sampled at the same height, so a 40 m
//     facade is shaded as though it were all at the sill.
//
// None of the three is visible in a number a test would otherwise look at.
import { describe, expect, it } from 'vitest';
import { autoFillRoof, COL_STRIDE, fillRoofAsSegment } from '../layout';
import { panelPose } from '../panel-pose';
import { layoutIssues } from '../drc';
import { projectStructures } from '../structure';
import { reindexSegment } from '../segment-ops';
import { facadeSillM } from '../facade';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Project, Roof } from '../../types';

/** A 16 m south-facing wall, 12 m to the top, clad from 3.6 m up. */
function facadeRoof(): Roof {
  return fixtureRoof({
    roofType: 'facade',
    // a wall strip: 16 m long on its south face, 0.35 m of masonry behind it
    polygon: [
      { x: -8, y: -6 },
      { x: 8, y: -6 },
      { x: 8, y: -5.65 },
      { x: -8, y: -5.65 },
    ],
    heightM: 12,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 0,
    facade: { sillM: 3.6 },
  });
}

/** The wall, clad, with nothing else on it. */
function cladWall(): { project: Project; roof: Roof } {
  const base = fixtureProject(0);
  const roof = facadeRoof();
  const spec = base.components.panel!;
  const filled = fillRoofAsSegment({ ...base, roofs: [roof], panels: [] }, roof, spec, {
    orientation: 'portrait',
    gapM: 0.02,
    grouped: true,
  });
  expect(filled, 'the wall must clad').not.toBeNull();
  return {
    project: { ...base, roofs: [roof], panels: filled!.panels, segments: [filled!.segment] },
    roof,
  };
}

describe('a facade is clad in courses, and every course knows its own height', () => {
  it('the fill lays courses UP the wall, not one row across it', () => {
    const { project, roof } = cladWall();
    const rows = new Set(project.panels.map((p) => Math.floor((p.cellIndex ?? 0) / COL_STRIDE)));
    const cols = new Set(project.panels.map((p) => (p.cellIndex ?? 0) % COL_STRIDE));
    // THE assertion: more than one course. A plan lattice can only ever produce
    // one, because every further course collides with the first in plan.
    expect(rows.size, 'courses up the wall').toBeGreaterThan(1);
    expect(cols.size, 'columns along the wall').toBeGreaterThan(1);
    expect(project.panels.length).toBe(rows.size * cols.size);

    // every course sits at its own height, and the band stays between sill and
    // top of wall — a course above the parapet line would be hanging in the air
    const sill = facadeSillM(roof);
    const heights = [...rows].map((r) => {
      const p = project.panels.find((q) => Math.floor((q.cellIndex ?? 0) / COL_STRIDE) === r)!;
      return roof.heightM + (p.mountHeightM ?? 0);
    });
    expect(new Set(heights.map((z) => z.toFixed(3))).size, 'distinct course heights').toBe(rows.size);
    for (const z of heights) {
      expect(z).toBeGreaterThan(sill);
      expect(z).toBeLessThan(roof.heightM);
    }
  });

  it('a course is a HEIGHT, so the plan point repeats and the pose does not', () => {
    const { project, roof } = cladWall();
    const spec = project.components.panel!;
    const col0 = project.panels
      .filter((p) => (p.cellIndex ?? 0) % COL_STRIDE === 0)
      .sort((a, b) => (a.cellIndex ?? 0) - (b.cellIndex ?? 0));
    expect(col0.length).toBeGreaterThan(1);
    // one column = one plan point, whatever the course
    for (const p of col0) {
      expect(p.center.x).toBeCloseTo(col0[0].center.x, 6);
      expect(p.center.y).toBeCloseTo(col0[0].center.y, 6);
    }
    // ...and the pose still puts them at different heights, because the height
    // comes from the MODULE. This is the one line the whole slice rests on.
    const ys = col0.map((p) => panelPose(project, p, spec, roof).position[1]);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
    // and it is genuinely vertical, not a flat plate lifted up the wall
    expect(panelPose(project, col0[0], spec, roof).tiltRad).toBeCloseTo(Math.PI / 2, 6);
  });

  it('the DRC finds no overlap and no breach on a correctly clad wall', () => {
    const { project } = cladWall();
    const spec = project.components.panel!;
    const codes = layoutIssues(project, spec).map((i) => i.code);
    // Both of these fire in PLAN for every module on a facade — the courses
    // share a footprint, and the modules hang in front of the polygon. A wall
    // has to be judged on its elevation or the user opens the studio to one
    // error per module on a design that is perfectly correct.
    expect(codes).not.toContain('panel_overlap');
    expect(codes).not.toContain('setback_breach');
  });

  it('the wall carries rails on brackets — not legs, and not nothing', () => {
    const { project } = cladWall();
    const [s] = projectStructures(project);
    expect(s, 'a clad wall must build a structure').toBeTruthy();
    expect(s.memberSummary.rail.count).toBeGreaterThan(0);
    expect(s.nodes.some((n) => n.kind === 'wall_bracket')).toBe(true);
    // nothing stands on anything: a leg or a footing here would be a table
    // somebody tried to build on a vertical surface
    expect(s.members.some((m) => m.kind === 'front_leg' || m.kind === 'back_leg')).toBe(false);
    expect(s.nodes.some((n) => n.kind === 'roof_anchor')).toBe(false);
    // the brackets are counted where the BOM reads them, not only drawn
    const brackets = s.nodes.reduce((t, n) => t + (n.fastenerSpec.brackets ?? 0), 0);
    expect(brackets).toBe(s.nodes.filter((n) => n.kind === 'wall_bracket').length);
  });

  // ─── The grid survives a reindex ──────────────────────────────────────────
  // `reindexSegment` derives (row, col) from PLAN positions, and it runs on
  // every auto-design and every table edit. On a wall that read the course off
  // a coordinate every course shares, so a 5 × 15 elevation came back as
  // "1 × 15" with 75 modules crushed onto 15 cell indices — and the structure
  // builder, which groups by cellIndex, then split the wall into 75 one-module
  // runs carrying two short rails each instead of 10 rails across it. Nothing
  // looked wrong in 3D, because a module's height rides on the module; only
  // the member graph and the BOM were wrong.
  it('a reindex keeps the courses — the grid is not re-read off plan positions', () => {
    const { project, roof } = cladWall();
    const spec = project.components.panel!;
    const before = project.segments[0];
    const re = reindexSegment(roof, spec, before, project.panels);
    expect(re.segment.rows, 'courses survive').toBe(before.rows);
    expect(re.segment.cols, 'columns survive').toBe(before.cols);
    expect(re.segment.removed, 'a full wall has no holes').toEqual([]);
    // every module keeps a cell of its own — the flattening showed up as 75
    // modules sharing 15 indices
    expect(new Set(re.panels.map((p) => p.cellIndex)).size).toBe(re.panels.length);
    // and the structure built from the reindexed grid is still 2 rails per
    // course, not two per module
    const s = projectStructures({ ...project, segments: [re.segment], panels: re.panels })[0];
    expect(s.memberSummary.rail.count).toBe(before.rows * 2);
  });

  it('a wall with no band to clad claims nothing', () => {
    const base = fixtureProject(0);
    const spec = base.components.panel!;
    // sill at the top of the wall: there is no band, so there is no array —
    // NOT a silently half-placed one, and not a crash
    const roof = { ...facadeRoof(), facade: { sillM: 11.9 } };
    expect(autoFillRoof({ ...base, roofs: [roof], panels: [] }, roof, spec, {
      orientation: 'portrait',
      gapM: 0.02,
      grouped: true,
    })).toEqual([]);
  });
});
