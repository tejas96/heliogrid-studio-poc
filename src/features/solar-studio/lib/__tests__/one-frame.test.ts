// ─── Release gate §9.9: 2D editor, 3D scene and analytical coordinates agree ─
// The last design-integrity gate with no coverage. `frame-parity.test.ts`
// already proves the 2D editor agrees with the analytical model; nothing
// proved the SCENE does, because the matrix that places a module lived inside
// the renderer where no test could reach it.
//
// Why this gate and not another: every expensive bug in this project has been
// a scene-vs-model disagreement, and every one was caught by eye.
//   · a tree lifted half its height by a guessed GLB origin offset
//   · foundations floating one foundation-height above the roof
//   · the structure preview mirrored — the comment said the low edge was on
//     the left, the arithmetic put it on the right
// Each of those is a fixed offset or a flipped sign between two frames, which
// is exactly what comparing rendered corners to analytical corners detects.
//
// The comparison is deliberately in PLAN. Height is checked separately (a
// module must sit above its roof, never through it); the plan footprint is
// where rotation, foreshortening and the y/z sign flip all show up at once.
import { describe, expect, it } from 'vitest';
import { panelPlanCorners } from '../scene-frame';
import { panelPose } from '../panel-pose';
import { autoFillRoof, panelCornersOnRoof } from '../layout';
import { surfaceHeightAt, isSloped } from '../roof-plane';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import type { PlacedPanel, Project, Roof, XY } from '../../types';

const spec = PANEL_DB[0];

/**
 * Corner sets are the same ring, but may start at a different index or wind
 * the other way, so compare as SETS with a nearest-match — the gate is about
 * geometry, not array order.
 *
 * Checked in BOTH directions. A one-way "every rendered corner is near some
 * analytical corner" passes when the rendered shape collapses onto a subset of
 * the other, so a degenerate footprint would slip through.
 */
function cornersAgree(a: XY[], b: XY[], tolM: number): { ok: boolean; worst: number } {
  const oneWay = (from: XY[], to: XY[]) => {
    let worst = 0;
    for (const p of from) {
      let best = Infinity;
      for (const q of to) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
      worst = Math.max(worst, best);
    }
    return worst;
  };
  const worst = Math.max(oneWay(a, b), oneWay(b, a));
  return { ok: worst <= tolM, worst };
}

/**
 * Point every panel at a given azimuth.
 *
 * `FillOptions.azimuthDeg` does NOT reach the placed panels — they came back
 * at 180 regardless, which quietly made the "non-south azimuth" case below a
 * test of due south. Setting it on the panels is what actually exercises the
 * rotated path, and both frames read `panel.azimuthDeg`.
 */
function facing(project: Project, azimuthDeg: number): Project {
  return { ...project, panels: project.panels.map((p) => ({ ...p, azimuthDeg })) };
}

/**
 * Set the module tilt.
 *
 * `FillOptions` has no `tiltDeg` either — passing one type-errored, and before
 * that the "30° tilt" case was quietly running at the fill's own 10°. Tilt is
 * a property of the PLACED PANEL and both frames read it from there.
 */
function tilted(project: Project, tiltDeg: number): Project {
  return { ...project, panels: project.panels.map((p) => ({ ...p, tiltDeg })) };
}

function centroid(pts: XY[]): XY {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

/** Panels come back facing due south; use `facing()`/`tilted()` to change them. */
function flatProject(tiltDeg: number): { project: Project; roof: Roof } {
  const base = fixtureProject(0);
  const roof = fixtureRoof();
  const p: Project = { ...base, roofs: [roof] };
  const f = fillRoofAsSegment(p, roof, spec, { ...DEFAULT_FILL, maxPanels: 6 })!;
  const project = tilted({ ...p, segments: [f.segment], panels: f.panels }, tiltDeg);
  return { project, roof };
}

function pitchedProject(): { project: Project; roof: Roof } {
  const base = fixtureProject(0);
  const roof: Roof = {
    ...fixtureRoof(),
    pitchDeg: 22,
    slopeAzimuthDeg: 180,
    heightM: 3, // eave (low-side) height; the roof rises from here to the ridge
  };
  const p: Project = { ...base, roofs: [roof] };
  const panels = autoFillRoof(p, roof, spec, { ...DEFAULT_FILL, maxPanels: 6 });
  return { project: { ...p, panels }, roof };
}

/** Every panel's rendered plan footprint must match its analytical one. */
function assertFrameAgreement(project: Project, roof: Roof, tolM: number, label: string) {
  expect(project.panels.length, `${label}: fixture produced no panels`).toBeGreaterThan(0);
  // Guard against a fixture that does not do what its name says. Two of these
  // cases silently ran at the fill's own defaults — `FillOptions` has neither
  // `tiltDeg` nor `azimuthDeg`, so the values were dropped and "30° tilt at
  // 135°" was really "10° tilt due south". A gate that agrees about the wrong
  // geometry is worse than no gate.
  const p0 = project.panels[0];
  expect(
    project.panels.every((p) => p.tiltDeg === p0.tiltDeg && p.azimuthDeg === p0.azimuthDeg),
    `${label}: fixture is not uniform`,
  ).toBe(true);
  for (const panel of project.panels) {
    const pose = panelPose(project, panel, spec, roof);
    const rendered = panelPlanCorners(pose);
    const analytical = panelCornersOnRoof(panel, spec, roof);
    const { ok, worst } = cornersAgree(rendered, analytical, tolM);
    expect(ok, `${label}: panel ${panel.id} off by ${worst.toFixed(4)} m`).toBe(true);
  }
}

describe('the scene draws the module the model describes — FLAT roof', () => {
  it('untilted: rendered corners match the analytical footprint', () => {
    const { project, roof } = flatProject(0);
    assertFrameAgreement(project, roof, 1e-6, 'flat/untilted');
  });

  it('tilted: the plan footprint is foreshortened by cos(tilt), in BOTH frames', () => {
    // the renderer gets this from the rotation; the analytical corners compute
    // it directly. They must land on the same shorter rectangle.
    const { project, roof } = flatProject(15);
    assertFrameAgreement(project, roof, 1e-6, 'flat/15°');
  });

  it('steeply tilted stays in agreement', () => {
    const { project, roof } = flatProject(30);
    assertFrameAgreement(project, roof, 1e-6, 'flat/30°');
  });

  it('a non-south azimuth rotates BOTH frames the same way', () => {
    // this is the sign-flip trap: three's z runs opposite the model's y, so a
    // yaw that rotates the mesh one way rotates the footprint the other unless
    // the projection back to plan negates z. Due south (180°) cannot catch it —
    // ±180° are the same rotation — which is why this leans on `facing`.
    for (const az of [135, 90, 200, 45]) {
      const { project, roof } = flatProject(20);
      assertFrameAgreement(facing(project, az), roof, 1e-6, `flat/20°@${az}`);
    }
  });
});

describe('the scene draws the module the model describes — PITCHED roof', () => {
  it('flush modules on a slope match the analytical footprint', () => {
    const { project, roof } = pitchedProject();
    assertFrameAgreement(project, roof, 1e-6, 'pitched/22°');
  });

  it('the pitched footprint really IS foreshortened, not accidentally equal', () => {
    // guards the gate itself: if both frames ignored pitch the test above would
    // still pass. The plan depth must be shorter than the module's slant length.
    const { project, roof } = pitchedProject();
    const panel = project.panels[0];
    const pose = panelPose(project, panel, spec, roof);
    const rendered = panelPlanCorners(pose);
    const xs = rendered.map((p) => p.x);
    const ys = rendered.map((p) => p.y);
    const planDepth = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    );
    expect(planDepth).toBeLessThan(pose.d);
    expect(planDepth).toBeGreaterThan(pose.d * Math.cos((22 * Math.PI) / 180) - 0.01);
  });
});

describe('the module sits ON its roof, never through it', () => {
  // the tree and the floating-foundation bugs in one assertion: a fixed offset
  // in either direction shows up here
  it('flat: every module centre is above the surface by the pose height', () => {
    const { project, roof } = flatProject(10);
    for (const panel of project.panels) {
      const pose = panelPose(project, panel, spec, roof);
      const surface = surfaceHeightAt(roof, panel.center);
      expect(pose.position[1] - surface).toBeCloseTo(pose.heightAboveSurfaceM, 9);
      expect(pose.heightAboveSurfaceM).toBeGreaterThan(0);
    }
  });

  it('pitched: flush modules ride the slope rather than a single height', () => {
    const { project, roof } = pitchedProject();
    expect(isSloped(roof)).toBe(true);
    const heights = project.panels.map((p) => panelPose(project, p, spec, roof).position[1]);
    // a sloped roof must produce a RANGE of module heights; one flat height
    // would mean the scene ignored the pitch
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.2);
    for (const panel of project.panels) {
      const pose = panelPose(project, panel, spec, roof);
      expect(pose.position[1]).toBeGreaterThan(surfaceHeightAt(roof, panel.center) - 1e-9);
    }
  });
});

describe('the plan/three axis convention', () => {
  it('three z is the NEGATIVE of model y — the sign that mirrored the preview', () => {
    const { project, roof } = flatProject(0);
    const panel = project.panels[0];
    const pose = panelPose(project, panel, spec, roof);
    expect(pose.position[0]).toBeCloseTo(panel.center.x, 9);
    expect(pose.position[2]).toBeCloseTo(-panel.center.y, 9);
  });

  it('the rendered footprint is centred on the panel centre, not offset from it', () => {
    // a constant offset between the frames — the exact shape of the floating
    // foundations bug — would move the centroid while keeping the shape
    const { project, roof } = flatProject(15);
    for (const panel of project.panels) {
      const c = centroid(panelPlanCorners(panelPose(project, panel, spec, roof)));
      expect(Math.hypot(c.x - panel.center.x, c.y - panel.center.y)).toBeLessThan(1e-9);
    }
  });
});

describe('the gate can actually fail', () => {
  // a gate nobody has seen fail is a gate nobody knows works
  it('a 5 cm offset in the pose is detected', () => {
    const { project, roof } = flatProject(0);
    const panel = project.panels[0];
    const pose = panelPose(project, panel, spec, roof);
    const shifted = { ...pose, position: [pose.position[0] + 0.05, pose.position[1], pose.position[2]] as [number, number, number] };
    const { ok } = cornersAgree(
      panelPlanCorners(shifted),
      panelCornersOnRoof(panel, spec, roof),
      1e-6,
    );
    expect(ok).toBe(false);
  });

  it('a flipped y/z sign is detected on an asymmetric layout', () => {
    // must be a yaw that is NOT a multiple of 180°, or negating it is a no-op
    // and the control proves nothing — which is exactly what it did at first
    const { project, roof } = (() => {
      const f = flatProject(20);
      return { project: facing(f.project, 135), roof: f.roof };
    })();
    const panel = project.panels[0];
    const pose = panelPose(project, panel, spec, roof);
    const mirrored = { ...pose, yawRad: -pose.yawRad };
    const { ok } = cornersAgree(
      panelPlanCorners(mirrored),
      panelCornersOnRoof(panel, spec, roof),
      1e-6,
    );
    expect(ok).toBe(false);
  });
});
