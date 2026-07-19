// ─── Characterization snapshot of the member/node graph (pre-22g) ───────────
// Written BEFORE the 22g parametric refactor and against the CURRENT code, so
// "the refactor changed nothing for a default segment" is something the suite
// proves rather than something I assert.
//
// The 22g gate is byte-identity: a segment carrying none of the new racking
// fields, on the `anchor` foundation, must produce exactly this graph and
// exactly this steelKg afterwards. Every number here — ids, coordinates,
// lengths, fastener counts — is part of the contract.
import { describe, expect, it } from 'vitest';
import { buildStructure, resolveRacking } from '../structure';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PlacedPanel, Project, RackingSpec } from '../../types';

const W = 1.134;
const GAP = 0.05;
const PROFILE = { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 };
const COL_STRIDE = 1000;

function segment(cells: number[], racking?: Partial<RackingSpec>, over: Partial<ArraySegment> = {}) {
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: 'roof_1',
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: 8,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 0,
      frontLegM: 0.3,
      backLegM: 0.3,
      profile: PROFILE,
      ...racking,
    } as RackingSpec,
    moduleGapM: GAP,
    removed: [],
    ...over,
  };
  const panels: PlacedPanel[] = cells.map((cell) => ({
    id: `pv_${cell}`,
    roofId: 'roof_1',
    center: { x: (cell % COL_STRIDE) * (W + GAP), y: Math.floor(cell / COL_STRIDE) * -3 },
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: cell,
  }));
  return { seg, panels };
}

/** `anchor` keeps foundH at 0, which is the state the gate is written against. */
function build(cells: number[], racking?: Partial<RackingSpec>) {
  const base = fixtureProject(0);
  const project: Project = {
    ...base,
    roofs: [fixtureRoof()],
    structureDefaults: { ...base.structureDefaults, foundation: 'anchor' },
  };
  const { seg, panels } = segment(cells, racking);
  const r = resolveRacking(project, project.roofs[0], seg, project.components.panel!)!;
  expect(r.foundation, 'gate is written against the anchor foundation').toBe('anchor');
  return buildStructure(seg, project.components.panel!, project.roofs[0], r, panels);
}

/** Stable, diffable text — a JSON blob makes a one-number change unreadable. */
function serialize(s: ReturnType<typeof build>): string {
  const n = (v: number) => v.toFixed(4);
  const xyz = (p: { x: number; y: number; z: number }) => `(${n(p.x)},${n(p.y)},${n(p.z)})`;
  return [
    `steelKg=${s.steelKg}`,
    `foundation=${s.foundation}/${s.foundationShape}`,
    `warnings=[${s.warnings.join(' | ')}]`,
    '--- memberSummary ---',
    ...Object.entries(s.memberSummary).map(([k, v]) => `${k}: count=${v.count} totalM=${v.totalM}`),
    '--- members ---',
    ...s.members.map((m) => `${m.id} ${m.kind} ${m.profileKey} ${xyz(m.a)}->${xyz(m.b)} L=${n(m.lengthM)}`),
    '--- nodes ---',
    ...s.nodes.map(
      (nd) => `${nd.id} ${nd.kind} ${xyz(nd.position)} members=[${nd.memberIds.join(',')}] ${JSON.stringify(nd.fastenerSpec)}`,
    ),
  ].join('\n');
}

describe('buildStructure golden graph (the 22g byte-identity contract)', () => {
  it('3-panel single row', () => {
    expect(serialize(build([0, 1, 2]))).toMatchSnapshot();
  });

  it('single panel — the degenerate run (1 bay, 2 stations)', () => {
    expect(serialize(build([0]))).toMatchSnapshot();
  });

  it('long run — several bays', () => {
    expect(serialize(build([0, 1, 2, 3, 4, 5]))).toMatchSnapshot();
  });

  it('a hole splits one row into two runs', () => {
    expect(serialize(build([0, 1, 3, 4]))).toMatchSnapshot();
  });

  it('two rows', () => {
    expect(serialize(build([0, 1, 2, COL_STRIDE, COL_STRIDE + 1]))).toMatchSnapshot();
  });

  it('rotated table (azimuth 90) — the lattice-alignment case', () => {
    const base = fixtureProject(0);
    const project: Project = {
      ...base,
      roofs: [fixtureRoof()],
      structureDefaults: { ...base.structureDefaults, foundation: 'anchor' },
    };
    const { seg, panels } = segment([0, 1, 2]);
    const rotated = { ...seg, azimuthDeg: 90 };
    const r = resolveRacking(project, project.roofs[0], rotated, project.components.panel!)!;
    expect(
      serialize(buildStructure(rotated, project.components.panel!, project.roofs[0], r, panels)),
    ).toMatchSnapshot();
  });

  it('steeper tilt changes rafter geometry', () => {
    expect(serialize(build([0, 1, 2], { tiltDeg: 25 }))).toMatchSnapshot();
  });

  it('wider leg spacing yields fewer stations', () => {
    expect(serialize(build([0, 1, 2, 3, 4, 5], { legSpacingM: 4 } as Partial<RackingSpec>))).toMatchSnapshot();
  });
});
