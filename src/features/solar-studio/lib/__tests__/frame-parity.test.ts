import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  autoFillRoof,
  panelCornersOnRoof,
  panelFitsAt,
  roofGridAngle,
} from '../layout';
import { layoutIssues } from '../drc';
import { buildShadowCasters, disposeGroup } from '../scene-model';
import { insetPolygonRobust, pointInPolygon, rectsOverlap } from '../geo';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import type { PanelOrientation, PlacedPanel, Project, Roof, XY } from '../../types';

const spec = PANEL_DB[0];

/** A 20°-pitched shed roof sloping down toward the south. */
function pitchedRoof(): Roof {
  return fixtureRoof({
    id: 'roof_pitched',
    roofType: 'metal_shed',
    pitchDeg: 20,
    slopeAzimuthDeg: 180,
  });
}

function projectWith(roof: Roof): Project {
  const base = fixtureProject(0);
  return { ...base, roofs: [roof], panels: [], strings: [] };
}

describe('frame unification: placement === DRC === corners (pitched-roof parity)', () => {
  it('every auto-filled panel on a PITCHED roof passes DRC with zero findings', () => {
    const roof = pitchedRoof();
    const project = projectWith(roof);
    const panels = autoFillRoof(project, roof, spec, {
      orientation: 'portrait',
      gapM: 0.05,
      grouped: true,
    });
    expect(panels.length).toBeGreaterThan(4); // the fill actually filled
    const designed: Project = { ...project, panels };
    const issues = layoutIssues(designed, spec);
    const layoutErrors = issues.filter(
      (i) => i.code === 'panel_overlap' || i.code === 'setback_breach',
    );
    // before unification, DRC rebuilt footprints in the WRONG frame (dominant
    // edge, no foreshortening) and reported false overlaps on any pitched roof
    expect(layoutErrors).toEqual([]);
  });

  it('canonical corners of filled panels stay inside the setback inset', () => {
    const roof = pitchedRoof();
    const project = projectWith(roof);
    const panels = autoFillRoof(project, roof, spec, {
      orientation: 'portrait',
      gapM: 0.05,
      grouped: true,
    });
    const inset = insetPolygonRobust(
      roof.polygon,
      roof.polygon.map(() => roof.setbackM),
    );
    for (const p of panels) {
      const corners = panelCornersOnRoof(p, spec, roof);
      expect(
        inset.some((reg) => corners.every((c) => pointInPolygon(c, reg))),
        `panel ${p.id} breaches the inset in the canonical frame`,
      ).toBe(true);
    }
  });

  it('canonical footprints of adjacent filled panels never overlap', () => {
    const roof = pitchedRoof();
    const project = projectWith(roof);
    const panels = autoFillRoof(project, roof, spec, {
      orientation: 'portrait',
      gapM: 0.05,
      grouped: true,
    });
    const shrink = (c: { x: number; y: number }[]) => {
      const cx = (c[0].x + c[2].x) / 2;
      const cy = (c[0].y + c[2].y) / 2;
      return c.map((p) => ({ x: cx + (p.x - cx) * 0.98, y: cy + (p.y - cy) * 0.98 }));
    };
    const all = panels.map((p) => panelCornersOnRoof(p, spec, roof));
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(rectsOverlap(shrink(all[i]), shrink(all[j]))).toBe(false);
      }
    }
  });

  it('foreshortening: pitched-roof plan footprint is cos(pitch) shorter on the downslope axis', () => {
    const flat = fixtureRoof();
    const pitched = pitchedRoof();
    const panel = {
      id: 'p1',
      roofId: 'x',
      center: { x: 0, y: 0 },
      orientation: 'portrait' as const,
      azimuthDeg: 180,
      tiltDeg: 20,
      solarAccess: 1,
      enabled: true,
    };
    const span = (c: { x: number; y: number }[], axisDeg: number) => {
      const rad = (-axisDeg * Math.PI) / 180;
      const xs = c.map((p) => p.x * Math.cos(rad) - p.y * Math.sin(rad));
      return Math.max(...xs) - Math.min(...xs);
    };
    // the FLAT reference must be UNtilted: a tilted flat-roof panel is now
    // itself plan-foreshortened (h·cos tilt, yawed to its azimuth) to match
    // the 3D plate — the raw-extent baseline is the tilt-0 grid cell
    const flatCorners = panelCornersOnRoof({ ...panel, tiltDeg: 0 }, spec, flat);
    const pitchedCorners = panelCornersOnRoof(panel, spec, pitched);
    const flatAxis = roofGridAngle(flat);
    const pitchAxis = roofGridAngle(pitched);
    // The ALONG-SLOPE axis carries the module's `h` (portrait ⇒ length) — the
    // same axis `panelPose` tilts about — and only that axis foreshortens.
    // On a flat roof `h` lies along local Y; on a pitched roof it lies along
    // local X, which is the down-slope direction. (Before the frame fix, the
    // pitched frame put `w` down-slope, i.e. the module was rotated 90° from
    // the plate the 3D view and the shading engine used.)
    expect(span(pitchedCorners, pitchAxis)).toBeCloseTo(
      span(flatCorners, flatAxis + 90) * Math.cos((20 * Math.PI) / 180),
      6,
    );
    // the across-slope axis is NOT foreshortened — it stays the module's `w`
    expect(span(pitchedCorners, pitchAxis + 90)).toBeCloseTo(
      span(flatCorners, flatAxis),
      6,
    );
  });

  /**
   * Plan-view (x, y) outline of the ACTUAL 3D plate scene-model builds for a
   * panel: the caster mesh's own geometry corners pushed through its world
   * matrix, then dropped to plan (three z = -plan y). No re-derivation — if
   * the pose or the scale order changes, this changes with it.
   */
  function platePlanCorners(project: Project, panelId: string): XY[] {
    const { group, meshes } = buildShadowCasters(project, { includePanels: true });
    const mesh = meshes.find(
      (m) => m.userData.casterKind === 'panel' && m.userData.casterId === panelId,
    ) as THREE.Mesh | undefined;
    expect(mesh, `no caster plate for panel ${panelId}`).toBeTruthy();
    group.updateMatrixWorld(true);
    const pos = mesh!.geometry.getAttribute('position');
    const seen = new Map<string, XY>();
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh!.matrixWorld);
      const p = { x: v.x, y: -v.z };
      seen.set(`${p.x.toFixed(6)},${p.y.toFixed(6)}`, p);
    }
    disposeGroup(group);
    return [...seen.values()];
  }

  const bbox = (c: XY[]) => ({
    ew: Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x)),
    ns: Math.max(...c.map((p) => p.y)) - Math.min(...c.map((p) => p.y)),
    cx: (Math.max(...c.map((p) => p.x)) + Math.min(...c.map((p) => p.x))) / 2,
    cy: (Math.max(...c.map((p) => p.y)) + Math.min(...c.map((p) => p.y))) / 2,
  });

  // THE regression gate for the 90°-frame split (S1). Everything 2D reads
  // panelCornersOnRoof; the 3D view and the Tier-2 shading casters read
  // panelPose via scene-model. On a PITCHED face those disagreed by 90°:
  // measured 2.382 × 1.065 in plan (2D) vs 1.133 × 2.238 (3D) for one portrait
  // module on a 20° south slope — so the rendered and SHADED modules were not
  // the modules the fill validated.
  for (const orientation of ['portrait', 'landscape'] as PanelOrientation[]) {
    it(`2D corners === plan projection of the 3D plate on a PITCHED face (${orientation})`, () => {
      const roof = pitchedRoof();
      const base = projectWith(roof);
      const panel: PlacedPanel = {
        id: 'pv_parity',
        roofId: roof.id,
        center: { x: 1.5, y: -2 },
        orientation,
        azimuthDeg: roof.slopeAzimuthDeg!,
        tiltDeg: roof.pitchDeg,
        solarAccess: 1,
        enabled: true,
      };
      // scene-model reads the module spec off the project — same spec both sides
      const project: Project = {
        ...base,
        panels: [panel],
        components: { ...base.components, panel: spec },
      };
      const twoD = bbox(panelCornersOnRoof(panel, spec, roof));
      const threeD = bbox(platePlanCorners(project, panel.id));
      expect(threeD.ew).toBeCloseTo(twoD.ew, 6);
      expect(threeD.ns).toBeCloseTo(twoD.ns, 6);
      expect(threeD.cx).toBeCloseTo(twoD.cx, 6);
      expect(threeD.cy).toBeCloseTo(twoD.cy, 6);
      // and the plan footprint really is foreshortened, not square-ish luck
      const cosP = Math.cos((roof.pitchDeg * Math.PI) / 180);
      const long = Math.max(spec.lengthMm, spec.widthMm) / 1000;
      const short = Math.min(spec.lengthMm, spec.widthMm) / 1000;
      // slope azimuth 180 ⇒ down-slope is the NS axis; portrait puts the
      // module's LONG axis there (up the slope, as rails are laid)
      const expected =
        orientation === 'portrait'
          ? { ns: long * cosP, ew: short }
          : { ns: short * cosP, ew: long };
      expect(twoD.ns).toBeCloseTo(expected.ns, 6);
      expect(twoD.ew).toBeCloseTo(expected.ew, 6);
    });
  }

  it('FLAT roofs are untouched by the pitched-frame fix', () => {
    const flat = fixtureRoof(); // pitch 0
    const base = projectWith(flat);
    for (const orientation of ['portrait', 'landscape'] as PanelOrientation[]) {
      const panel: PlacedPanel = {
        id: `pv_flat_${orientation}`,
        roofId: flat.id,
        center: { x: 0, y: 0 },
        orientation,
        azimuthDeg: 180,
        tiltDeg: 0,
        solarAccess: 1,
        enabled: true,
      };
      const c = bbox(panelCornersOnRoof(panel, spec, { ...base, panels: [panel] }.roofs[0]));
      const L = spec.lengthMm / 1000;
      const W = spec.widthMm / 1000;
      // no slope ⇒ no foreshortening and no axis swap: the raw module rect,
      // laid on the dominant-edge grid (0° for the fixture rectangle)
      expect(roofGridAngle(flat)).toBeCloseTo(0, 6);
      expect(c.ew).toBeCloseTo(orientation === 'portrait' ? W : L, 6);
      expect(c.ns).toBeCloseTo(orientation === 'portrait' ? L : W, 6);
    }
  });

  // FLAT-roof rotate/tilt parity (user bug: rotating or tilting a panel moved
  // the 3D plate but the 2D plate never changed). The 2D footprint is now the
  // plan projection of the tilted plate at the panel's OWN azimuth — verified
  // against the ACTUAL caster mesh, same method as the pitched gates above.
  for (const { azimuthDeg, tiltDeg } of [
    { azimuthDeg: 135, tiltDeg: 15 },
    { azimuthDeg: 180, tiltDeg: 10 }, // the default flat-fill pose
    { azimuthDeg: 250, tiltDeg: 25 },
  ]) {
    it(`2D corners === plan-projected 3D plate on a FLAT roof (az ${azimuthDeg}°, tilt ${tiltDeg}°)`, () => {
      const flat = fixtureRoof(); // pitch 0
      const base = projectWith(flat);
      const panel: PlacedPanel = {
        id: 'pv_flat_parity',
        roofId: flat.id,
        center: { x: 1.5, y: -2 },
        orientation: 'portrait',
        azimuthDeg,
        tiltDeg,
        solarAccess: 1,
        enabled: true,
      };
      const project: Project = {
        ...base,
        panels: [panel],
        components: { ...base.components, panel: spec },
      };
      const twoD = bbox(panelCornersOnRoof(panel, spec, flat));
      const threeD = bbox(platePlanCorners(project, panel.id));
      expect(threeD.ew).toBeCloseTo(twoD.ew, 6);
      expect(threeD.ns).toBeCloseTo(twoD.ns, 6);
      expect(threeD.cx).toBeCloseTo(twoD.cx, 6);
      expect(threeD.cy).toBeCloseTo(twoD.cy, 6);
      // independent derivation: w × h·cos(tilt), rotated to -azimuth in plan
      // (three yaw = -az·π/180 ≡ plan rotation by -azimuthDeg)
      const w = spec.widthMm / 1000; // portrait ⇒ width across
      const hProj = (spec.lengthMm / 1000) * Math.cos((tiltDeg * Math.PI) / 180);
      const az = (azimuthDeg * Math.PI) / 180;
      expect(twoD.ew).toBeCloseTo(w * Math.abs(Math.cos(az)) + hProj * Math.abs(Math.sin(az)), 6);
      expect(twoD.ns).toBeCloseTo(w * Math.abs(Math.sin(az)) + hProj * Math.abs(Math.cos(az)), 6);
    });
  }

  it('panelFitsAt agrees with the fill: refilling every filled center reports a collision', () => {
    const roof = pitchedRoof();
    const project = projectWith(roof);
    const panels = autoFillRoof(project, roof, spec, {
      orientation: 'portrait',
      gapM: 0.05,
      grouped: true,
    });
    const designed: Project = { ...project, panels };
    // every occupied slot must read as occupied in the same frame
    for (const p of panels.slice(0, 6)) {
      expect(panelFitsAt(designed, roof, spec, p.center, 'portrait')).toBe(false);
    }
  });
});
