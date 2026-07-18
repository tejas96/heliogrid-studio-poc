import { describe, expect, it } from 'vitest';
import type {
  ArraySegment,
  Keepout,
  PanelSpec,
  PlacedPanel,
  Project,
  Roof,
  XY,
} from '../../types';
import { NUDGE_COARSE_M, NUDGE_M, movePanels, nudgeDelta } from '../panel-move';

const rect = (cx: number, cy: number, w: number, h: number): XY[] => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

function roof(id: string, poly: XY[]): Roof {
  return {
    id,
    name: id,
    polygon: poly,
    roofType: 'rcc_flat',
    heightM: 3,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 0.5,
    perEdgeSetbacksM: null,
    parapet: {
      enabled: false,
      direction: 'inward',
      heightM: 1,
      widthM: 0.3,
      perEdge: null,
      suppressSharedEdges: true,
    },
  };
}

const SPEC: PanelSpec = {
  id: 'p1', brand: 'T', model: 'T', watt: 500, tech: 'Mono PERC',
  lengthMm: 2000, widthMm: 1000, vocV: 50, vmpV: 42, iscA: 13, impA: 12,
  tempCoeffVocPct: -0.27, almm: true, dcr: true, priceInr: 1,
};

const panel = (
  id: string,
  center: XY,
  extra: Partial<PlacedPanel> = {},
): PlacedPanel => ({
  id, roofId: 'a', center, orientation: 'portrait', azimuthDeg: 180,
  tiltDeg: 0, solarAccess: 1, enabled: true, ...extra,
});

function project(
  panels: PlacedPanel[],
  segments: ArraySegment[] = [],
  keepouts: Keepout[] = [],
): Project {
  return {
    roofs: [roof('a', rect(0, 0, 20, 14))],
    obstructions: [], walkways: [], keepouts, panels, segments,
  } as unknown as Project;
}

const seg = (id: string, poly: XY[]): ArraySegment => ({
  id, roofId: 'a', label: 'A1', polygon: poly, rows: 1, cols: 2,
  orientation: 'portrait', azimuthDeg: 180,
  racking: { kind: 'flush', tiltDeg: 0 } as ArraySegment['racking'],
  moduleGapM: 0.05, removed: [],
});

describe('movePanels — a loose panel moves alone', () => {
  it('translates the selected panel by exactly the delta', () => {
    const p = project([panel('x', { x: 0, y: 0 })]);
    const r = movePanels(p, SPEC, ['x'], 0.5, -0.25);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.panels[0].center).toEqual({ x: 0.5, y: -0.25 });
    expect(r.movedCount).toBe(1);
  });

  it('leaves unselected panels untouched', () => {
    const p = project([panel('x', { x: -4, y: 0 }), panel('y', { x: 4, y: 0 })]);
    const r = movePanels(p, SPEC, ['x'], 0.5, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.panels.find((q) => q.id === 'y')!.center).toEqual({ x: 4, y: 0 });
  });

  it('does not collide with the space it is vacating (self-collision guard)', () => {
    // a 0.1 m nudge overlaps the panel's OWN previous footprint — if the
    // validator saw the stale copy, every small move would be refused
    const p = project([panel('x', { x: 0, y: 0 })]);
    expect(movePanels(p, SPEC, ['x'], NUDGE_M, 0).ok).toBe(true);
  });
});

describe('movePanels — refusals are total, never partial', () => {
  it('refuses a move that breaches the roof setback', () => {
    const p = project([panel('x', { x: 8.5, y: 0 })]);
    const r = movePanels(p, SPEC, ['x'], 5, 0); // off the roof
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/doesn't fit/);
  });

  it('refuses a move onto another panel', () => {
    const p = project([panel('x', { x: -2, y: 0 }), panel('y', { x: 0.6, y: 0 })]);
    expect(movePanels(p, SPEC, ['x'], 2.6, 0).ok).toBe(false);
  });

  it('refuses a move into a no-build zone', () => {
    const ko: Keepout = {
      id: 'k', roofId: 'a', shape: rect(4, 0, 3, 3), heightM: 0, kind: 'fire_setback',
    };
    const p = project([panel('x', { x: 0, y: 0 })], [], [ko]);
    expect(movePanels(p, SPEC, ['x'], 4, 0).ok).toBe(false);
  });

  it('a refused move returns the ORIGINAL layout — nothing moves halfway', () => {
    const before = [panel('x', { x: -2, y: 0 }), panel('y', { x: 0.6, y: 0 })];
    const p = project(before);
    const r = movePanels(p, SPEC, ['x', 'y'], 20, 0);
    expect(r.ok).toBe(false);
    expect(p.panels.map((q) => q.center)).toEqual(before.map((q) => q.center));
  });
});

describe('movePanels — a segment moves as one table (structure stays coupled)', () => {
  it('moving ONE module of a segment moves every module in it', () => {
    const s = seg('s1', rect(0, 0, 3, 3));
    const p = project(
      [
        panel('x', { x: -0.6, y: 0 }, { segmentId: 's1' }),
        panel('y', { x: 0.6, y: 0 }, { segmentId: 's1' }),
      ],
      [s],
    );
    const r = movePanels(p, SPEC, ['x'], 0.5, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.movedCount).toBe(2);
    expect(r.panels[0].center.x).toBeCloseTo(-0.1, 6);
    expect(r.panels[1].center.x).toBeCloseTo(1.1, 6);
  });

  it("the segment's own polygon travels with its modules", () => {
    const s = seg('s1', rect(0, 0, 3, 3));
    const p = project([panel('x', { x: 0, y: 0 }, { segmentId: 's1' })], [s]);
    const r = movePanels(p, SPEC, ['x'], 1, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments[0].polygon).toEqual(
      s.polygon.map((v) => ({ x: v.x + 1, y: v.y + 2 })),
    );
  });

  it('a loose panel in the same selection still moves individually', () => {
    const s = seg('s1', rect(-4, 0, 3, 3));
    const p = project(
      [
        panel('x', { x: -4, y: 0 }, { segmentId: 's1' }),
        panel('loose', { x: 4, y: 0 }),
      ],
      [s],
    );
    const r = movePanels(p, SPEC, ['loose'], 0.5, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.movedCount).toBe(1);
    expect(r.segments[0].polygon).toEqual(s.polygon); // untouched segment
  });
});

describe('movePanels — guards', () => {
  it('refuses without a panel spec', () => {
    expect(movePanels(project([panel('x', { x: 0, y: 0 })]), null, ['x'], 1, 0).ok).toBe(false);
  });

  it('refuses an empty selection', () => {
    expect(movePanels(project([panel('x', { x: 0, y: 0 })]), SPEC, [], 1, 0).ok).toBe(false);
  });
});

describe('nudgeDelta', () => {
  it('maps the four arrows, with screen-up = north = −y', () => {
    expect(nudgeDelta('ArrowUp', false)).toEqual({ x: 0, y: -NUDGE_M });
    expect(nudgeDelta('ArrowDown', false)).toEqual({ x: 0, y: NUDGE_M });
    expect(nudgeDelta('ArrowLeft', false)).toEqual({ x: -NUDGE_M, y: 0 });
    expect(nudgeDelta('ArrowRight', false)).toEqual({ x: NUDGE_M, y: 0 });
  });

  it('Shift takes the coarse step', () => {
    expect(nudgeDelta('ArrowRight', true)).toEqual({ x: NUDGE_COARSE_M, y: 0 });
    expect(NUDGE_COARSE_M).toBeGreaterThan(NUDGE_M);
  });

  it('ignores every other key', () => {
    for (const k of ['a', 'Enter', 'Tab', 'Escape']) expect(nudgeDelta(k, false)).toBeNull();
  });
});
