// ─── Phase 22o gates: the structure reaches the DXF ─────────────────────────
// The export carried modules and roof outlines but not one member, so the file
// a fabricator or site engineer sets out from showed nothing to set out.
//
// Everything drawn here comes from `projectStructures` — the same graph the 3D
// scene draws and the BOM prices — so the drawing cannot disagree with either.
// These gates check that correspondence, not the DXF syntax.
import { describe, expect, it } from 'vitest';
import { DXF_LAYERS, layoutToDxf } from '../export-dxf';
import { projectStructures } from '../structure';
import { ruleFor } from '../foundation';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { FoundationKind, Project } from '../../types';

function tableProject(foundation: FoundationKind = 'concrete'): Project {
  const base = fixtureProject(0);
  const p: Project = { ...base, roofs: [fixtureRoof()] };
  const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
    ...DEFAULT_FILL,
    maxPanels: 8,
  })!;
  return {
    ...p,
    segments: [filled.segment],
    panels: filled.panels,
    structureDefaults: { ...p.structureDefaults, foundation },
  };
}

/** Entities on one layer, as raw DXF chunks. */
function onLayer(dxf: string, layer: string): string[] {
  return dxf
    .split(/^\s*0\s*$/m)
    .filter((chunk) => new RegExp(`^\\s*8\\s*\\n\\s*${layer}\\s*$`, 'm').test(chunk));
}
const count = (dxf: string, layer: string) => onLayer(dxf, layer).length;

describe('the structural layers exist and carry entities', () => {
  const dxf = layoutToDxf(tableProject());

  it('declares every structural layer', () => {
    for (const l of [
      DXF_LAYERS.structMembers,
      DXF_LAYERS.structLegs,
      DXF_LAYERS.structFootings,
      DXF_LAYERS.dims,
    ]) {
      expect(dxf, l).toContain(l);
    }
  });

  it('draws members, legs and footings', () => {
    expect(count(dxf, DXF_LAYERS.structMembers)).toBeGreaterThan(0);
    expect(count(dxf, DXF_LAYERS.structLegs)).toBeGreaterThan(0);
    expect(count(dxf, DXF_LAYERS.structFootings)).toBeGreaterThan(0);
  });

  it('a project with NO structure adds no structural entities', () => {
    const bare = fixtureProject(0);
    const empty = layoutToDxf({ ...bare, segments: [], roofs: [fixtureRoof()] });
    expect(count(empty, DXF_LAYERS.structMembers)).toBe(0);
    expect(count(empty, DXF_LAYERS.structFootings)).toBe(0);
  });
});

describe('what is drawn matches the member graph', () => {
  const p = tableProject();
  const dxf = layoutToDxf(p);
  const s = projectStructures(p)[0];

  it('one setting-out cross per leg base — two lines each', () => {
    const anchors = s.nodes.filter((n) => n.kind === 'roof_anchor').length;
    expect(anchors).toBeGreaterThan(0);
    expect(count(dxf, DXF_LAYERS.structLegs)).toBe(anchors * 2);
  });

  it('one footing per leg base', () => {
    const anchors = s.nodes.filter((n) => n.kind === 'roof_anchor').length;
    expect(count(dxf, DXF_LAYERS.structFootings)).toBe(anchors);
  });

  it('legs are NOT drawn as members — in plan a leg is a point', () => {
    const spanning = s.members.filter(
      (m) => m.kind !== 'front_leg' && m.kind !== 'back_leg',
    ).length;
    expect(count(dxf, DXF_LAYERS.structMembers)).toBe(spanning);
  });
});

describe('a footing is drawn at its TRUE footprint', () => {
  it('a square pedestal is a closed polyline, not a symbol', () => {
    const dxf = layoutToDxf(tableProject('concrete'));
    const first = onLayer(dxf, DXF_LAYERS.structFootings)[0];
    expect(first).toContain('LWPOLYLINE');
    // 300 mm nominal ⇒ half-extent 0.15 m appears in the coordinates
    const rule = ruleFor('concrete', 'square');
    expect(rule.l).toBe(300);
  });

  it('a circular pedestal is a CIRCLE at the rule radius', () => {
    const p = tableProject('concrete');
    const circular: Project = {
      ...p,
      structureDefaults: { ...p.structureDefaults, foundationShape: 'circular' },
    };
    const first = onLayer(layoutToDxf(circular), DXF_LAYERS.structFootings)[0];
    expect(first).toContain('CIRCLE');
    // radius in metres = d/2000 — the shape genuinely changes the geometry,
    // it is not a cosmetic label
    const r = (ruleFor('concrete', 'circular').d ?? 0) / 2000;
    expect(first).toContain(r.toFixed(3));
  });

  it('an anchored table still marks its plate, so there is something to set out', () => {
    expect(count(layoutToDxf(tableProject('anchor')), DXF_LAYERS.structFootings)).toBeGreaterThan(0);
  });
});

describe('dimensions are LINE + TEXT, not DIMENSION entities', () => {
  const dxf = layoutToDxf(tableProject());

  it('carries a typical leg spacing', () => {
    expect(count(dxf, DXF_LAYERS.dims)).toBeGreaterThan(0);
    expect(dxf).toMatch(/\d+\.\d\d m TYP/);
  });

  it('emits no DIMENSION entity — they need a DIMSTYLE table we do not write', () => {
    // a DIMENSION without its DIMSTYLE opens broken; lines and text open
    // correctly in every reader, which is the whole point of the trade-off
    expect(dxf).not.toContain('AcDbDimension');
    expect(dxf.split('\n').some((l) => l.trim() === 'DIMENSION')).toBe(false);
  });

  it('the stated spacing matches the real leg spacing', () => {
    const s = projectStructures(tableProject())[0];
    const legs = s.members.filter((m) => m.kind === 'front_leg');
    const span = Math.hypot(legs[1].a.x - legs[0].a.x, legs[1].a.y - legs[0].a.y);
    expect(dxf).toContain(`${span.toFixed(2)} m TYP`);
  });
});

describe('the drawing tracks the design', () => {
  it('more purlins ⇒ more member entities', () => {
    const base = tableProject();
    const denser: Project = {
      ...base,
      segments: base.segments.map((s) => ({
        ...s,
        racking: s.racking.kind === 'flush' ? s.racking : { ...s.racking, purlinCount: 4 },
      })),
    };
    expect(count(layoutToDxf(denser), DXF_LAYERS.structMembers)).toBeGreaterThan(
      count(layoutToDxf(base), DXF_LAYERS.structMembers),
    );
  });

  it('a hand-placed leg plan moves the setting-out crosses', () => {
    const base = tableProject();
    const planned: Project = {
      ...base,
      segments: base.segments.map((s) => ({
        ...s,
        legPlan: { points: [{ x: 0, y: 0 }, { x: 1.5, y: 0 }] },
      })),
    };
    expect(count(layoutToDxf(planned), DXF_LAYERS.structLegs)).not.toBe(
      count(layoutToDxf(base), DXF_LAYERS.structLegs),
    );
  });
});
