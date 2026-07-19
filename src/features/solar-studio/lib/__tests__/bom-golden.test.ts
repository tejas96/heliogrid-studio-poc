// ─── Phase 22b GOLDEN SNAPSHOT — written BEFORE the refactor ────────────────
// `deriveBom` is one 658-line function. Splitting it into a registry plus
// per-category emitters is a pure mechanical extraction, and the only way to
// prove that is to pin its exact output first and diff after.
//
// The contract for the refactor:
//   • every field of every line is unchanged EXCEPT
//   • `id`, which stops being a positional counter (`bom_7`) and becomes a
//     stable semantic key, and
//   • `sourceRoofId` / `sourceSegmentId`, which are declared in the type today
//     but never written — which is why installation's materialsFor() always
//     returns [] and BOM↔3D is impossible.
//
// The fixture is deliberately RICH. The shared fixtureProject has no segments,
// so it never reaches the member model, the foundation hardware, the sloped
// covering table, ground site works or the safety lines — most of what the
// refactor touches. A thin fixture would have let a regression through.
import { describe, expect, it } from 'vitest';
import { deriveBom } from '../bom';
import { STRUCTURE_PROFILES } from '../../data/profiles';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PlacedPanel, Project, Roof } from '../../types';

const COL_STRIDE = 1000;

function rect(cx: number, cy: number, w: number, h: number) {
  return [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ];
}

function segment(id: string, roofId: string, label: string): ArraySegment {
  return {
    id,
    roofId,
    label,
    polygon: rect(0, 0, 10, 6),
    rows: 2,
    cols: 3,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 3,
      frontLegM: 0.3,
      backLegM: 0.7,
      profile: STRUCTURE_PROFILES[0],
    },
    moduleGapM: 0.05,
    removed: [],
  };
}

function gridPanels(
  roofId: string,
  segmentId: string | undefined,
  rows: number,
  cols: number,
  originX: number,
  over: Partial<PlacedPanel> = {},
): PlacedPanel[] {
  const out: PlacedPanel[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        id: `${roofId}_p${r}_${c}`,
        roofId,
        center: { x: originX + c * 1.2, y: -3 + r * 3 },
        orientation: 'portrait',
        azimuthDeg: 180,
        tiltDeg: 10,
        solarAccess: 1,
        enabled: true,
        ...(segmentId ? { segmentId, cellIndex: r * COL_STRIDE + c } : {}),
        ...over,
      });
    }
  }
  return out;
}

/** Four roof types, a real member model, safety kit and site works. */
function richProject(): Project {
  const base = fixtureProject(0);

  const flat: Roof = fixtureRoof({ id: 'roof_flat', name: 'Flat RCC' });
  const shed: Roof = fixtureRoof({
    id: 'roof_shed',
    name: 'Metal shed',
    roofType: 'metal_shed',
    polygon: rect(30, 0, 14, 10),
  });
  const tile: Roof = fixtureRoof({
    id: 'roof_tile',
    name: 'Tile pitched',
    roofType: 'tile',
    pitchDeg: 22,
    slopeAzimuthDeg: 195,
    polygon: rect(-30, 0, 12, 9),
  });
  const ground: Roof = fixtureRoof({
    id: 'roof_ground',
    name: 'Ground array',
    roofType: 'ground',
    heightM: 0,
    setbackM: 1.5,
    polygon: rect(0, 40, 20, 14),
  });

  const seg = segment('seg_A1', 'roof_flat', 'A1');

  const panels = [
    ...gridPanels('roof_flat', 'seg_A1', 2, 3, -4),
    ...gridPanels('roof_shed', undefined, 2, 3, 27, { tiltDeg: 0 }),
    ...gridPanels('roof_tile', undefined, 2, 2, -33, { tiltDeg: 22, azimuthDeg: 195 }),
    ...gridPanels('roof_ground', undefined, 2, 3, -4, { tiltDeg: 20 }),
  ];

  return {
    ...base,
    roofs: [flat, shed, tile, ground],
    segments: [seg],
    panels,
    strings: [
      { id: 'str_1', name: 'String 1', inverterIndex: 0, mpptIndex: 0, color: '#f59e0b',
        panelIds: panels.slice(0, 6).map((p) => p.id) },
      { id: 'str_2', name: 'String 2', inverterIndex: 0, mpptIndex: 1, color: '#3b82f6',
        panelIds: panels.slice(6, 12).map((p) => p.id) },
    ],
    walkways: [
      { id: 'wk_1', roofId: 'roof_flat', a: { x: -7, y: 0 }, b: { x: 7, y: 0 }, widthMm: 800, heightMm: 0 },
    ],
    rails: [
      { id: 'rl_1', roofId: 'roof_flat', a: { x: -7, y: 5 }, b: { x: 7, y: 5 }, heightMm: 1100 },
    ],
    arresters: [{ id: 'la_1', roofId: 'roof_flat', pos: { x: 6, y: 5 }, heightMm: 3000 }],
    components: { ...base.components, inverterCount: 2 },
  };
}

/** Compact, order-stable serialisation of everything the refactor must preserve. */
function serialize(project: Project): string {
  return deriveBom(project)
    .map((l) =>
      [
        l.category,
        l.item,
        l.spec,
        l.qty,
        l.unit,
        l.unitPriceInr,
        l.confidence,
        l.auto,
        l.overridden,
        l.formula,
      ].join(' | '),
    )
    .join('\n');
}

describe('deriveBom golden output (pre-22b refactor contract)', () => {
  it('rich four-roof project', () => {
    expect(serialize(richProject())).toMatchSnapshot();
  });

  it('with module-level optimisers', () => {
    const p = richProject();
    expect(
      serialize({ ...p, components: { ...p.components, mlpe: 'optimizer' } } as Project),
    ).toMatchSnapshot();
  });

  it('with central-inverter combiner topology', () => {
    const p = richProject();
    expect(
      serialize({ ...p, components: { ...p.components, inverterTopology: 'central' } } as Project),
    ).toMatchSnapshot();
  });

  it('minimal shared fixture (no segments, no site works)', () => {
    expect(serialize(fixtureProject(8))).toMatchSnapshot();
  });

  it('unstrung project', () => {
    expect(serialize({ ...richProject(), strings: [] })).toMatchSnapshot();
  });
});

describe('the fixture actually reaches the emitters it claims to', () => {
  const lines = deriveBom(richProject());
  const has = (frag: string) =>
    lines.some((l) => (l.item + l.spec).toLowerCase().includes(frag.toLowerCase()));

  it('reaches the member model, not just the flat per-panel fallback', () => {
    // Structure Steel only appears when buildStructure emitted members, which
    // needs a segment whose panels carry cellIndex.
    expect(has('Structure Steel')).toBe(true);
  });

  it('reaches foundation hardware', () => {
    expect(has('Base Plates')).toBe(true);
  });

  it('reaches every roof covering path', () => {
    expect(has('metal shed')).toBe(true);
    expect(has('pitched roof')).toBe(true);
    expect(has('Ground')).toBe(true);
  });

  it('reaches the safety lines', () => {
    expect(has('Walkway')).toBe(true);
    expect(has('Safety Rail')).toBe(true);
    expect(has('Lightning Arrester')).toBe(true);
    expect(has('Earthing')).toBe(true);
  });

  it('covers a wide slice of the registry', () => {
    expect(lines.length).toBeGreaterThan(20);
  });
});

// ─── Phase 22b behaviour changes A + B ──────────────────────────────────────
describe('stable semantic line ids', () => {
  const projects: [string, Project][] = [
    ['rich', richProject()],
    ['optimisers', { ...richProject(), components: { ...richProject().components, mlpe: 'optimizer' } } as Project],
    ['central', { ...richProject(), components: { ...richProject().components, inverterTopology: 'central' } } as Project],
    ['minimal', fixtureProject(8)],
    ['unstrung', { ...richProject(), strings: [] }],
  ];

  it.each(projects)('%s: every id in one derivation is unique', (_name, project) => {
    const ids = deriveBom(project).map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ids are semantic keys, not positional counters', () => {
    const ids = deriveBom(richProject()).map((l) => l.id);
    expect(ids).toContain('modules.panel');
    expect(ids).toContain('inverter.unit');
    expect(ids).toContain('civil.transport');
    expect(ids.every((id) => !/^bom_\d+$/.test(id))).toBe(true);
  });

  it('per-instance lines suffix their source, so the two pitched coverings cannot collide', () => {
    // Both coverings emit the SAME item string — the old `category|item`
    // override key could not tell them apart. Force both buckets to exist.
    const p = richProject();
    const slab: Roof = fixtureRoof({
      id: 'roof_slab',
      name: 'Sloped RCC',
      pitchDeg: 18,
      slopeAzimuthDeg: 180,
      polygon: rect(60, 0, 12, 9),
    });
    const withBoth: Project = {
      ...p,
      roofs: [...p.roofs, slab],
      panels: [...p.panels, ...gridPanels('roof_slab', undefined, 2, 2, 57, { tiltDeg: 18 })],
    };
    const ids = deriveBom(withBoth).map((l) => l.id);
    expect(ids).toContain('mech.mms_sloped:tile');
    expect(ids).toContain('mech.mms_sloped:rcc_flat');
    expect(ids).toContain('mech.sloped_flashing:tile');
    expect(ids).toContain('mech.sloped_flashing:rcc_flat');
    expect(new Set(ids).size).toBe(ids.length);
    // and the item strings really are identical, which is the point
    const sloped = deriveBom(withBoth).filter((l) => l.id.startsWith('mech.mms_sloped'));
    expect(sloped).toHaveLength(2);
    expect(sloped[0].item).toBe(sloped[1].item);
  });

  it('the member-model steel line is keyed by profile', () => {
    expect(deriveBom(richProject()).map((l) => l.id)).toContain('mech.steel:c_channel');
  });
});

describe('sourceRoofId / sourceSegmentId attribution', () => {
  const lines = deriveBom(richProject());
  const byId = new Map(lines.map((l) => [l.id, l]));

  it('names the segment and roof a structure line came from', () => {
    expect(byId.get('mech.steel:c_channel')?.sourceSegmentId).toBe('seg_A1');
    expect(byId.get('mech.steel:c_channel')?.sourceRoofId).toBe('roof_flat');
    // fastener lines are Σ over the node graph — one structure here, so nameable
    expect(byId.get('mech.base_plate')?.sourceSegmentId).toBe('seg_A1');
  });

  it('names the roof a per-covering mounting line came from', () => {
    expect(byId.get('mech.mms_sloped:tile')?.sourceRoofId).toBe('roof_tile');
    expect(byId.get('mech.sloped_flashing:tile')?.sourceRoofId).toBe('roof_tile');
    expect(byId.get('mech.mms_metal_shed')?.sourceRoofId).toBe('roof_shed');
    expect(byId.get('mech.mms_ground')?.sourceRoofId).toBe('roof_ground');
  });

  it('names the roof safety work sits on', () => {
    expect(byId.get('safety.walkway')?.sourceRoofId).toBe('roof_flat');
    expect(byId.get('safety.rail')?.sourceRoofId).toBe('roof_flat');
    expect(byId.get('safety.arrester')?.sourceRoofId).toBe('roof_flat');
    expect(byId.get('safety.down_conductor')?.sourceRoofId).toBe('roof_flat');
    expect(byId.get('safety.fence')?.sourceRoofId).toBe('roof_ground');
    expect(byId.get('safety.ground_earth_ring')?.sourceRoofId).toBe('roof_ground');
  });

  it('leaves project-wide lines unattributed', () => {
    for (const id of [
      'modules.panel',
      'inverter.unit',
      'elec.dc_cable',
      'elec.ac_cable',
      'elec.meters',
      'mech.rail',
      'mech.clamps',
      'safety.earth_pit',
      'civil.installation',
      'civil.transport',
    ]) {
      expect(byId.get(id)?.sourceRoofId, id).toBeUndefined();
      expect(byId.get(id)?.sourceSegmentId, id).toBeUndefined();
    }
  });

  it('refuses to name one source when a line aggregates several', () => {
    // Two walkways on different roofs: the single line cannot honestly claim one.
    const p = richProject();
    const two: Project = {
      ...p,
      walkways: [
        ...p.walkways,
        { id: 'wk_2', roofId: 'roof_shed', a: { x: 24, y: 0 }, b: { x: 36, y: 0 }, widthMm: 800, heightMm: 0 },
      ],
    };
    const wk = deriveBom(two).find((l) => l.id === 'safety.walkway');
    expect(wk?.qty).toBeGreaterThan(0);
    expect(wk?.sourceRoofId).toBeUndefined();
  });
});
