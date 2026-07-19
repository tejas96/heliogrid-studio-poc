// ─── Phase 22l gates: structure-3D view state and editor gating ─────────────
// Organised as POSITIVE (it does the thing), NEGATIVE (it refuses when it must)
// and EDGE (degenerate inputs that would otherwise crash or leak state).
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRUCTURE_VIEW,
  effectiveView,
  foundationOptionsFor,
  partitionPanels,
  shapeOptionsFor,
  structureEditorState,
  topologyOf,
  visibleStructureIds,
  type StructureViewState,
} from '../structure-view';
import { STRUCTURE_PROFILES } from '../../data/profiles';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PanelSpec, PlacedPanel, Project, Roof } from '../../types';

const SPEC: PanelSpec = {
  id: 'p', brand: 'T', model: 'M', watt: 550, tech: 'TOPCon',
  lengthMm: 2278, widthMm: 1134, vocV: 49, vmpV: 41, iscA: 14, impA: 13.5,
  tempCoeffVocPct: -0.25, almm: true, dcr: true, priceInr: 12000,
  warrantyYears: 25, weightKg: 27, availability: 'in_stock',
};

const rect = (cx: number, cy: number, w: number, h: number) => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

function seg(id: string, roofId: string, over: Partial<ArraySegment> = {}): ArraySegment {
  return {
    id, roofId, label: id.toUpperCase(), polygon: rect(0, 0, 10, 6),
    rows: 2, cols: 3, orientation: 'portrait', azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt', tiltDeg: 10, rowPitchM: 3,
      frontLegM: 0.3, backLegM: 0.7, profile: STRUCTURE_PROFILES[0],
    },
    moduleGapM: 0.05, removed: [],
    ...over,
  };
}

const flat = fixtureRoof({ id: 'r_flat', name: 'Flat' });
const shed = fixtureRoof({ id: 'r_shed', name: 'Shed', roofType: 'metal_shed' });
const tile = fixtureRoof({ id: 'r_tile', name: 'Tile', roofType: 'tile', pitchDeg: 22 });
const ground = fixtureRoof({ id: 'r_ground', name: 'Ground', roofType: 'ground', heightM: 0 });

const FLUSH = { kind: 'flush' } as ArraySegment['racking'];

function proj(roofs: Roof[], segments: ArraySegment[], panels: PlacedPanel[] = []): Project {
  return { ...fixtureProject(0), roofs, segments, panels };
}

const p = (id: string, segmentId?: string) => ({ id, segmentId }) as PlacedPanel;

// ════════════════════════════════════════════════════════════ POSITIVE ══════
describe('POSITIVE — panel partition does what the control says', () => {
  const panels = [p('a', 's1'), p('b', 's1'), p('c', 's2'), p('d')];

  it('ghost puts only the selected table in the ghost bucket', () => {
    const r = partitionPanels(panels, 's1', { panelVis: 'ghost', scope: 'all' });
    expect(r.ghost.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.normal.map((x) => x.id)).toEqual(['c', 'd']);
    expect(r.hidden).toEqual([]);
  });

  it('hide removes the selected table only', () => {
    const r = partitionPanels(panels, 's1', { panelVis: 'hide', scope: 'all' });
    expect(r.hidden.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.normal.map((x) => x.id)).toEqual(['c', 'd']);
  });

  it('show draws everything normally', () => {
    const r = partitionPanels(panels, 's1', { panelVis: 'show', scope: 'all' });
    expect(r.normal).toHaveLength(4);
    expect(r.ghost).toEqual([]);
    expect(r.hidden).toEqual([]);
  });

  it('isolate hides every OTHER table', () => {
    const r = partitionPanels(panels, 's1', { panelVis: 'show', scope: 'isolate' });
    expect(r.normal.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.hidden.map((x) => x.id)).toEqual(['c', 'd']);
  });

  it('isolate + hide leaves nothing but the structure', () => {
    const r = partitionPanels(panels, 's1', { panelVis: 'hide', scope: 'isolate' });
    expect(r.normal).toEqual([]);
    expect(r.ghost).toEqual([]);
    expect(r.hidden).toHaveLength(4);
  });

  it('every panel lands in exactly one bucket, always', () => {
    for (const panelVis of ['show', 'ghost', 'hide'] as const)
      for (const scope of ['all', 'isolate'] as const) {
        const r = partitionPanels(panels, 's1', { panelVis, scope });
        expect(r.normal.length + r.ghost.length + r.hidden.length).toBe(panels.length);
        const ids = [...r.normal, ...r.ghost, ...r.hidden].map((x) => x.id).sort();
        expect(ids).toEqual(['a', 'b', 'c', 'd']);
      }
  });

  it('isolate narrows the drawn structures to the selection', () => {
    expect([...visibleStructureIds(['s1', 's2'], 's1', { panelVis: 'show', scope: 'isolate' })]).toEqual(['s1']);
    expect([...visibleStructureIds(['s1', 's2'], 's1', { panelVis: 'show', scope: 'all' })]).toEqual(['s1', 's2']);
  });

  it('a flat elevated table offers the three rooftop foundations', () => {
    expect(foundationOptionsFor(flat, seg('s1', 'r_flat'))).toEqual(['concrete', 'anchor', 'ballast']);
  });

  it('a ground array offers ground foundations', () => {
    expect(foundationOptionsFor(ground, seg('s1', 'r_ground'))).toEqual(['pile', 'concrete']);
  });

  it('only a cast pedestal offers a shape choice', () => {
    expect(shapeOptionsFor('concrete')).toEqual(['square', 'circular']);
    for (const k of ['anchor', 'ballast', 'pile'] as const) expect(shapeOptionsFor(k)).toEqual([]);
  });

  it('a healthy flat table is fully editable', () => {
    const s = seg('s1', 'r_flat');
    const st = structureEditorState(proj([flat], [s]), 's1', SPEC);
    expect(st.topology).toBe('elevated_table');
    expect(st.canEditMembers).toBe(true);
    expect(st.emptyReason).toBeNull();
    expect(st.racking).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════ NEGATIVE ══════
describe('NEGATIVE — it refuses where a control would be wrong', () => {
  // E1: the reason the card is gated at all
  it('a metal shed offers NO foundation — it mounts on standoffs through the sheet', () => {
    const s = seg('s1', 'r_shed', { racking: FLUSH });
    expect(topologyOf(shed, s)).toBe('sheet_monorail');
    expect(foundationOptionsFor(shed, s)).toEqual([]);
    const st = structureEditorState(proj([shed], [s]), 's1', SPEC);
    expect(st.foundationOptions).toEqual([]);
    expect(st.emptyReason).toMatch(/standoffs through the sheet/);
  });

  it('a pitched roof offers no foundation — you cannot cast a level pedestal on it', () => {
    const s = seg('s1', 'r_tile');
    expect(topologyOf(tile, s)).toBe('none');
    expect(foundationOptionsFor(tile, s)).toEqual([]);
    expect(structureEditorState(proj([tile], [s]), 's1', SPEC).canEditMembers).toBe(false);
  });

  it('a flush table explains itself instead of rendering blank cards (E18)', () => {
    const s = seg('s1', 'r_flat', { racking: FLUSH });
    const st = structureEditorState(proj([flat], [s]), 's1', SPEC);
    expect(st.topology).toBe('flush');
    expect(st.canEditMembers).toBe(false);
    expect(st.emptyReason).toMatch(/flush-mounted/);
    expect(st.emptyReason).toMatch(/elevated racking/); // tells you how to fix it
  });

  it('capture mode overrides a hidden array (E8)', () => {
    const hiddenIsolated: StructureViewState = { panelVis: 'hide', scope: 'isolate' };
    expect(effectiveView(hiddenIsolated, { captureMode: true })).toEqual({
      panelVis: 'show',
      scope: 'all',
    });
  });

  it('outside capture, the user’s choice stands', () => {
    const v: StructureViewState = { panelVis: 'hide', scope: 'isolate' };
    expect(effectiveView(v)).toEqual(v);
    expect(effectiveView(v, { captureMode: false })).toEqual(v);
  });

  it('no panel spec ⇒ inert with a reason, not a crash', () => {
    const st = structureEditorState(proj([flat], [seg('s1', 'r_flat')]), 's1', null);
    expect(st.segment).toBeNull();
    expect(st.emptyReason).toMatch(/Step 4/);
  });
});

// ════════════════════════════════════════════════════════════════ EDGE ══════
describe('EDGE — degenerate inputs', () => {
  it('no selection ⇒ everything normal, even with a stale view (state cannot leak)', () => {
    const panels = [p('a', 's1'), p('b', 's2')];
    const r = partitionPanels(panels, null, { panelVis: 'hide', scope: 'isolate' });
    expect(r.normal).toHaveLength(2);
    expect(r.hidden).toEqual([]);
  });

  it('no selection ⇒ every structure stays drawn', () => {
    expect([...visibleStructureIds(['s1', 's2'], null, { panelVis: 'hide', scope: 'isolate' })])
      .toEqual(['s1', 's2']);
  });

  it('empty panel list partitions to empty buckets', () => {
    const r = partitionPanels([], 's1', DEFAULT_STRUCTURE_VIEW);
    expect(r).toEqual({ normal: [], ghost: [], hidden: [] });
  });

  it('selecting a segment that no longer exists is inert, not a throw', () => {
    const st = structureEditorState(proj([flat], []), 'gone', SPEC);
    expect(st.segment).toBeNull();
    expect(st.emptyReason).toMatch(/no longer exists/);
  });

  it('a segment whose roof was deleted is inert, not a throw', () => {
    const st = structureEditorState(proj([], [seg('s1', 'r_missing')]), 's1', SPEC);
    expect(st.segment).toBeNull();
    expect(st.emptyReason).toMatch(/roof no longer exists/);
  });

  it('selecting nothing is not an error state — no reason to show', () => {
    const st = structureEditorState(proj([flat], []), null, SPEC);
    expect(st.emptyReason).toBeNull();
    expect(st.canEditMembers).toBe(false);
  });

  it('a panel with no segmentId is never claimed by a selection', () => {
    const r = partitionPanels([p('loose')], 's1', { panelVis: 'hide', scope: 'all' });
    expect(r.normal.map((x) => x.id)).toEqual(['loose']);
  });

  it('isolate DOES hide loose panels — they are not part of the table', () => {
    const r = partitionPanels([p('loose')], 's1', { panelVis: 'show', scope: 'isolate' });
    expect(r.hidden.map((x) => x.id)).toEqual(['loose']);
  });

  it('the default view is ghost + all, so entering shows the structure at once', () => {
    expect(DEFAULT_STRUCTURE_VIEW).toEqual({ panelVis: 'ghost', scope: 'all' });
  });

  it('every foundation option offered is one the assembly can actually build', () => {
    // guards against a surface offering a kind foundation-geometry cannot draw
    for (const [roof, s] of [
      [flat, seg('s1', 'r_flat')],
      [ground, seg('s2', 'r_ground')],
    ] as const) {
      for (const kind of foundationOptionsFor(roof, s)) {
        expect(['concrete', 'anchor', 'ballast', 'pile']).toContain(kind);
      }
    }
  });
});
