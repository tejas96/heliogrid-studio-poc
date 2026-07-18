// ─── Row spacing → row shading → energy (Tier-2, Phase 8) ───────────────────
// Inter-row self-shading used to be an ANALYTICAL derate (lib/row-shade.ts,
// Tier-1) multiplied on top of the raycast engine's obstruction shading. Since
// Phase 8 the modules are shadow casters in the engine itself, so row shading
// is measured, not modeled — and Tier-1 was deleted rather than left to price
// the same physics a second time. These gates pin the replacement.
import { describe, expect, it } from 'vitest';
import { autoFillRoof, fillRoofAsSegment, fillRowPitchM, DEFAULT_FILL } from '../layout';
import { computeSolarAccess } from '../shading';
import { computeEnergyReport } from '../solar';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Project } from '../../types';

const PUNE = { lat: 18.5204, lng: 73.8567 };

function locatedProject(): Project {
  return {
    ...fixtureProject(0),
    panels: [],
    strings: [],
    location: {
      address: 'Pune',
      latLng: PUNE,
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

describe('fill pitch defaults (layout)', () => {
  it('tilted flat-roof fills default to the shadow-free pitch (rows spread out)', () => {
    const project = locatedProject();
    const roof = fixtureRoof(); // rcc_flat ⇒ pose tilt 10°
    const panels = autoFillRoof(project, roof, project.components.panel!, DEFAULT_FILL);
    expect(panels.length).toBeGreaterThan(0);
    const pitch = fillRowPitchM(project, roof, project.components.panel!, DEFAULT_FILL)!;
    const L = project.components.panel!.lengthMm / 1000;
    expect(pitch).toBeGreaterThan(L + DEFAULT_FILL.gapM); // wider than the old 5cm packing
    // row centres actually advance by that pitch
    const ys = [...new Set(panels.map((p) => Math.round(p.center.y * 100) / 100))].sort(
      (a, b) => a - b,
    );
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeCloseTo(pitch, 2);
    }
  });

  it('metal-shed (flush, tilt 0) keeps the plain footprint+gap spacing', () => {
    const project = locatedProject();
    const roof = fixtureRoof({ roofType: 'metal_shed' });
    expect(fillRowPitchM(project, roof, project.components.panel!, DEFAULT_FILL)).toBeNull();
  });

  it('an explicit expert rowPitchM override wins (even tighter)', () => {
    const project = locatedProject();
    const roof = fixtureRoof();
    const spec = project.components.panel!;
    const L = spec.lengthMm / 1000;
    const tight = { ...DEFAULT_FILL, rowPitchM: L + 0.02 };
    expect(fillRowPitchM(project, roof, spec, tight)).toBeCloseTo(L + 0.02, 6);
  });

  it('fillRoofAsSegment records the pitch it used (no more rowPitchM: 0)', () => {
    const project = locatedProject();
    const roof = fixtureRoof();
    const filled = fillRoofAsSegment(project, roof, project.components.panel!, DEFAULT_FILL)!;
    const racking = filled.segment.racking;
    expect(racking.kind).toBe('fixed_tilt');
    if (racking.kind !== 'flush') expect(racking.rowPitchM).toBeGreaterThan(2);
  });
});

describe('Tier-2 row shading (the modules cast)', () => {
  /** Two rows of one panel each, `pitchM` apart on a bare flat roof. */
  function twoRows(pitchM: number): Project {
    const base = locatedProject();
    const roof = fixtureRoof();
    const spec = base.components.panel!;
    const filled = fillRoofAsSegment(base, roof, spec, {
      ...DEFAULT_FILL,
      rowPitchM: pitchM,
    })!;
    return { ...base, roofs: [roof], segments: [filled.segment], panels: filled.panels };
  }

  it('PHASE-8 GATE: at 5 cm spacing the back row gets less sun than the front', () => {
    const spec = locatedProject().components.panel!;
    const p = twoRows(spec.lengthMm / 1000 + 0.05);
    const access = computeSolarAccess(p);
    const ys = [...new Set(p.panels.map((x) => x.center.y))].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(1);
    // the sun is south (−y here): the southern-most row is the unshaded one
    const front = p.panels.filter((x) => x.center.y === ys[0]);
    const back = p.panels.filter((x) => x.center.y === ys[1]);
    const mean = (list: typeof front) =>
      list.reduce((s, x) => s + access.get(x.id)!, 0) / list.length;
    expect(mean(front)).toBeGreaterThan(0.95); // nothing in front of it
    expect(mean(back)).toBeLessThan(mean(front)); // its neighbour's plate blocks it
  });

  it('opening the rows to the shadow-free pitch restores the back row', () => {
    const tight = computeSolarAccess(twoRows(locatedProject().components.panel!.lengthMm / 1000 + 0.05));
    const wideProject = (() => {
      const base = locatedProject();
      const roof = fixtureRoof();
      const filled = fillRoofAsSegment(base, roof, base.components.panel!, DEFAULT_FILL)!;
      return { ...base, roofs: [roof], segments: [filled.segment], panels: filled.panels };
    })();
    const wide = computeSolarAccess(wideProject);
    const meanOf = (m: Map<string, number>) =>
      [...m.values()].reduce((s, v) => s + v, 0) / m.size;
    expect(meanOf(wide)).toBeGreaterThan(meanOf(tight));
    expect(meanOf(wide)).toBeGreaterThan(0.95); // shadow-free pitch earns its name
  });

  it('tight spacing yields LESS energy per panel than correct spacing (audit fiction, fixed)', () => {
    const base = locatedProject();
    const roof = fixtureRoof();
    const spec = base.components.panel!;
    const L = spec.lengthMm / 1000;

    const wide = fillRoofAsSegment(base, roof, spec, DEFAULT_FILL)!;
    const tight = fillRoofAsSegment(base, roof, spec, { ...DEFAULT_FILL, rowPitchM: L + 0.05 })!;
    // compare per-panel energy at the SAME panel count (truncate the tighter
    // fill's extra rows so capacity is equal)
    const n = Math.min(wide.panels.length, tight.panels.length);
    const mk = (f: typeof wide): Project => {
      const p: Project = {
        ...base,
        roofs: [roof],
        segments: [f.segment],
        panels: f.panels.slice(0, n),
      };
      // energy reads the STORED access — stamp it exactly like useDesignSync
      const access = computeSolarAccess(p);
      return { ...p, panels: p.panels.map((x) => ({ ...x, solarAccess: access.get(x.id) ?? 1 })) };
    };
    const rWide = computeEnergyReport(mk(wide));
    const rTight = computeEnergyReport(mk(tight));
    expect(rTight.annualMwh).toBeLessThan(rWide.annualMwh);
    // one measured beam-shading term now — no separate analytical row line
    expect(rTight.losses.some((l) => l.key === 'row_shading')).toBe(false);
    expect(rTight.losses.find((l) => l.key === 'shading')!.pct).toBeGreaterThan(
      rWide.losses.find((l) => l.key === 'shading')!.pct,
    );
  });
});
