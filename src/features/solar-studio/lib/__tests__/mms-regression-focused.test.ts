import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import { DEFAULT_FILL, COL_STRIDE, fillRoofAsSegment } from '../layout';
import { configureMms } from '../mms/configure';
import { mmsEngineering } from '../mms/engineering';
import { validateMms } from '../mms/validate';
import { deriveBom } from '../bom';
import { layoutFp } from '../fingerprints';
import { growSegment } from '../segment-ops';
import { projectStructures } from '../structure';

function seededTableProject(): Project {
  const base = fixtureProject(0);
  const roof = fixtureRoof();
  const filled = fillRoofAsSegment({ ...base, roofs: [roof] }, roof, base.components.panel!, {
    ...DEFAULT_FILL,
    maxPanels: 12,
  })!;
  return {
    ...base,
    location: null,
    roofs: [roof],
    segments: [filled.segment],
    panels: filled.panels,
    structureDefaults: { ...base.structureDefaults, foundation: 'anchor' },
  };
}

function withMms(project: Project, strategy: Parameters<typeof configureMms>[2] = 'rcc_fixed', edit?: Parameters<typeof configureMms>[3]): Project {
  const segId = project.segments[0].id;
  const patch = configureMms(project, segId, strategy, edit);
  return { ...project, ...patch };
}

describe('MMS focused regressions', () => {
  it('is deterministic and does not mutate input project graph', () => {
    const p = seededTableProject();
    const before = structuredClone(p);
    const configured = withMms(p, 'rcc_fixed');
    expect(p).toEqual(before);

    const a = projectStructures(configured);
    const b = projectStructures(configured);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);

    const hacked = structuredClone(a);
    hacked[0].members[0].a.z += 10;
    expect(projectStructures(configured)[0]).toEqual(b[0]);
  });

  it('generates buildable members (positive lengths), beams and diagonal braces', () => {
    const s = projectStructures(withMms(seededTableProject(), 'rcc_fixed'))[0];
    expect(s.members.length).toBeGreaterThan(0);
    expect(s.members.every(m => Number.isFinite(m.lengthM) && m.lengthM > 0)).toBe(true);
    expect(s.members.filter(m => m.kind === 'beam').length).toBeGreaterThan(0);
    expect(s.members.filter(m => m.kind === 'brace').some(m => Math.abs(m.b.z - m.a.z) > 0.01)).toBe(true);
  });

  it('insets paired rails symmetrically around the row centre', () => {
    const s = projectStructures(withMms(seededTableProject(), 'rcc_fixed'))[0];
    const rails = s.members.filter(m => m.kind === 'rail');
    expect(rails.length).toBeGreaterThanOrEqual(2);
    const [r1, r2] = rails.slice(0, 2);
    const midY = (r1.a.y + r2.a.y) / 2;
    expect(Math.abs(r1.a.y - midY)).toBeCloseTo(Math.abs(r2.a.y - midY), 6);
    expect(Math.abs(r1.b.y - ((r1.b.y + r2.b.y) / 2))).toBeCloseTo(Math.abs(r2.b.y - ((r1.b.y + r2.b.y) / 2)), 6);
  });

  it('anchor/ballast counts match physical support nodes exactly', () => {
    const anchored = projectStructures(withMms(seededTableProject(), 'rcc_anchor', { anchor: { type: 'chemical', count: 6, diameterMm: 12, spacingMm: 120, plateSizeMm: 200, plateThicknessMm: 10 } }))[0];
    const supportNodesA = anchored.nodes.filter(n => n.kind === 'roof_anchor');
    expect(supportNodesA.length).toBeGreaterThan(0);
    expect(supportNodesA.every(n => n.fastenerSpec.anchors === 6)).toBe(true);
    expect(supportNodesA.reduce((s, n) => s + (n.fastenerSpec.anchors ?? 0), 0)).toBe(supportNodesA.length * 6);

    const ballasted = projectStructures(withMms(seededTableProject(), 'rcc_ballast', { ballast: { type: 'precast_concrete', lengthM: 0.6, widthM: 0.4, heightM: 0.15, massKg: 90, blocksPerSupport: 3 } }))[0];
    const supportNodesB = ballasted.nodes.filter(n => n.kind === 'roof_anchor');
    expect(supportNodesB.every(n => n.fastenerSpec.ballast === 3)).toBe(true);
    expect(supportNodesB.reduce((s, n) => s + (n.fastenerSpec.ballast ?? 0), 0)).toBe(supportNodesB.length * 3);
  });

  it('east-west keeps alternating azimuths and remains synchronized after grow/reindex', () => {
    const p = withMms(seededTableProject(), 'east_west');
    const roof = p.roofs[0];
    const seg = p.segments[0];
    const grown = growSegment(p, roof, p.components.panel!, seg, 'row', 'top', 1);
    const next: Project = {
      ...p,
      segments: p.segments.map(s => (s.id === seg.id ? grown.segment : s)),
      panels: [...p.panels.filter(x => x.segmentId !== seg.id), ...grown.panels],
    };
    const expectedEven = next.segments[0].azimuthDeg;
    const expectedOdd = (expectedEven + 180) % 360;
    for (const panel of next.panels.filter(pp => pp.segmentId === seg.id && pp.cellIndex != null)) {
      const row = Math.floor(panel.cellIndex! / COL_STRIDE);
      expect(panel.azimuthDeg).toBe(row % 2 ? expectedOdd : expectedEven);
    }
    expect(new Set(next.panels.filter(pp => pp.segmentId === seg.id).map(pp => pp.azimuthDeg)).size).toBeGreaterThanOrEqual(2);
  });

  it('validation returns component-linked clash ids and warns incomplete anchors', () => {
    const p = withMms(seededTableProject(), 'rcc_anchor', {
      anchor: { type: 'chemical', count: 4, diameterMm: 12, spacingMm: 200, plateSizeMm: 200, plateThicknessMm: 10 },
    });
    const roof = p.roofs[0];
    const keepoutPoly = [
      { x: roof.polygon[0].x + 0.5, y: roof.polygon[0].y + 0.5 },
      { x: roof.polygon[1].x - 0.5, y: roof.polygon[0].y + 0.5 },
      { x: roof.polygon[1].x - 0.5, y: roof.polygon[2].y - 0.5 },
      { x: roof.polygon[0].x + 0.5, y: roof.polygon[2].y - 0.5 },
    ];
    const conflicted: Project = {
      ...p,
      // 'obstruction', not 'service': there is no such KeepoutKind (types.ts),
      // and the cast hid it. What this case needs is only a keepout the array
      // runs into, and any kind clashes the same way.
      keepouts: [{ id: 'ko_1', roofId: roof.id, kind: 'obstruction', shape: keepoutPoly, heightM: 2 }],
    };
    const findings = validateMms(conflicted, projectStructures(conflicted));
    const clashes = findings.filter(f => f.code.startsWith('clash-') && f.status === 'error');
    expect(clashes.length).toBeGreaterThan(0);
    expect(clashes.some(f => f.componentIds.length > 0)).toBe(true);
    expect(findings.some(f => f.code === 'anchor_incomplete' && f.status === 'warning')).toBe(true);
  });

  it('engineering remains honest: checks not calculated and 0.6Vz² only when fully supplied', () => {
    const p = withMms(seededTableProject(), 'rcc_fixed');
    const e0 = mmsEngineering({ ...p, location: null }, projectStructures(p));
    expect(e0.referencePressureKpa).toBeNull();
    expect(e0.checks.every(c => c.status === 'not_calculated')).toBe(true);

    const e1 = mmsEngineering({
      ...p,
      mmsEngineering: {
        basicWindSpeedMs: 44,
        riskFactorK1: 1,
        terrainHeightFactorK2: 1,
        topographyFactorK3: 1,
        importanceFactorK4: 1,
      },
    }, projectStructures(p));
    expect(e1.referencePressureKpa).toBeCloseTo(0.6 * 44 * 44 / 1000, 6);
  });

  it('BOM uses MMS component lines, keeps unpriced parts explicit, and avoids legacy steel fallback', () => {
    const p = withMms(seededTableProject(), 'rcc_ballast', {
      material: 'aluminium',
      ballast: { type: 'custom', lengthM: 0.6, widthM: 0.4, heightM: 0.15, massKg: 100, blocksPerSupport: 2 },
    });
    const lines = deriveBom(p);
    const mmsLines = lines.filter(l => l.id.startsWith('mech.mms_component'));
    expect(mmsLines.length).toBeGreaterThan(0);
    expect(lines.some(l => l.id.startsWith('mech.steel'))).toBe(false);
    expect(mmsLines.some(l => /UNPRICED/i.test(l.formula))).toBe(true);
  });

  it('fingerprint changes on MMS edit and serialized export graph has no NaN/Infinity', () => {
    const p = withMms(seededTableProject(), 'rcc_fixed');
    const edited = withMms(p, undefined, { railStockLengthM: 7.2 });
    expect(layoutFp(edited)).not.toBe(layoutFp(p));

    const model = {
      structures: projectStructures(edited),
      validation: validateMms(edited, projectStructures(edited)),
      engineering: mmsEngineering(edited, projectStructures(edited)),
    };
    const json = JSON.stringify(model);
    expect(json.includes('NaN')).toBe(false);
    expect(json.includes('Infinity')).toBe(false);
  });
});
