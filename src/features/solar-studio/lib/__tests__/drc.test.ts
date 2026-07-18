import { describe, expect, it } from 'vitest';
import type { PanelSpec, PlacedPanel, Project, Roof, XY } from '../../types';
import { layoutIssues } from '../drc';
import { autoFillRoof } from '../layout';

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
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
}

const SPEC: PanelSpec = {
  id: 'p1', brand: 'T', model: 'T', watt: 500, tech: 'Mono PERC',
  lengthMm: 2000, widthMm: 1000, vocV: 50, vmpV: 42, iscA: 13, impA: 12,
  tempCoeffVocPct: -0.27, almm: true, dcr: true, priceInr: 1,
};

const panel = (roofId: string, center: XY, extra: Partial<PlacedPanel> = {}): PlacedPanel => ({
  id: Math.random().toString(36).slice(2),
  roofId, center, orientation: 'portrait', azimuthDeg: 180, tiltDeg: 10,
  solarAccess: 1, enabled: true, ...extra,
});

function project(roofs: Roof[], panels: PlacedPanel[]): Project {
  return { roofs, obstructions: [], walkways: [], keepouts: [], segments: [], panels } as unknown as Project;
}

describe('layoutIssues (DRC)', () => {
  const r = roof('a', rect(0, 0, 12, 8));

  it('a clean auto-filled layout has no layout issues', () => {
    const panels = autoFillRoof(project([r], []), r, SPEC);
    expect(layoutIssues(project([r], panels), SPEC)).toEqual([]);
  });

  it('flags overlapping panels as an error, pointing at the panels', () => {
    const panels = [panel('a', { x: 0, y: 0 }), panel('a', { x: 0.1, y: 0 })];
    const iss = layoutIssues(project([r], panels), SPEC);
    const o = iss.find((i) => i.code === 'panel_overlap');
    expect(o?.level).toBe('error');
    expect(o?.focusPanelIds?.length).toBe(2); // both offending panels are locatable
  });

  it('flags shaded panels (< 70% access) as a warning, pointing at them', () => {
    const shadedPanel = panel('a', { x: 0, y: 0 }, { solarAccess: 0.4 });
    const iss = layoutIssues(project([r], [shadedPanel]), SPEC);
    const s = iss.find((i) => i.code === 'shaded');
    expect(s?.level).toBe('warn');
    expect(s?.focusPanelIds).toEqual([shadedPanel.id]);
  });

  it('flags a panel breaching the roof setback', () => {
    // centre right at the roof edge → footprint spills past the 0.5 m inset
    const panels = [panel('a', { x: 5.9, y: 0 })];
    const iss = layoutIssues(project([r], panels), SPEC);
    expect(iss.some((i) => i.code === 'setback_breach')).toBe(true);
  });

  it('returns nothing without a panel spec or panels', () => {
    expect(layoutIssues(project([r], []), SPEC)).toEqual([]);
    expect(layoutIssues(project([r], [panel('a', { x: 0, y: 0 })]), null)).toEqual([]);
  });
});

// ─── no-build zones (keepout authoring, Phase 14) ───────────────────────────
// The fill only consults keepouts while it runs, so a zone drawn over EXISTING
// panels must be caught here or those panels silently keep earning capacity.
describe('layoutIssues — panels inside a drawn no-build zone', () => {
  const r = roof('a', rect(0, 0, 12, 8));

  const withKeepouts = (
    panels: PlacedPanel[],
    keepouts: unknown[],
  ): Project => ({ ...project([r], panels), keepouts } as unknown as Project);

  const zone = (id: string, shape: XY[], kind = 'fire_setback', roofId: string | null = 'a') =>
    ({ id, roofId, shape, heightM: 0, kind });

  it('flags a panel standing in the zone as an error', () => {
    const p = panel('a', { x: 0, y: 0 });
    const out = layoutIssues(withKeepouts([p], [zone('k1', rect(0, 0, 4, 4))]), SPEC);
    const hit = out.find((i) => i.code === 'panel_in_keepout')!;
    expect(hit).toBeDefined();
    expect(hit.level).toBe('error');
    expect(hit.focusPanelIds).toEqual([p.id]);
  });

  it('leaves panels clear of the zone alone', () => {
    const p = panel('a', { x: -4.5, y: 0 });
    const out = layoutIssues(withKeepouts([p], [zone('k1', rect(4, 0, 3, 3))]), SPEC);
    expect(out.some((i) => i.code === 'panel_in_keepout')).toBe(false);
  });

  it("a shade-only keepout does NOT forbid placement — same rule as layout.ts", () => {
    const p = panel('a', { x: 0, y: 0 });
    const out = layoutIssues(withKeepouts([p], [zone('k1', rect(0, 0, 4, 4), 'shade')]), SPEC);
    expect(out.some((i) => i.code === 'panel_in_keepout')).toBe(false);
  });

  it('a project-wide zone (roofId null) applies to every roof', () => {
    const p = panel('a', { x: 0, y: 0 });
    const out = layoutIssues(withKeepouts([p], [zone('k1', rect(0, 0, 4, 4), 'walkway', null)]), SPEC);
    expect(out.some((i) => i.code === 'panel_in_keepout')).toBe(true);
  });

  it('a zone on ANOTHER roof does not flag this roof', () => {
    const p = panel('a', { x: 0, y: 0 });
    const out = layoutIssues(withKeepouts([p], [zone('k1', rect(0, 0, 4, 4), 'walkway', 'b')]), SPEC);
    expect(out.some((i) => i.code === 'panel_in_keepout')).toBe(false);
  });

  it('disabled panels are outside the check — they earn nothing to begin with', () => {
    const p = panel('a', { x: 0, y: 0 }, { enabled: false });
    const out = layoutIssues(withKeepouts([p], [zone('k1', rect(0, 0, 4, 4))]), SPEC);
    expect(out.some((i) => i.code === 'panel_in_keepout')).toBe(false);
  });

  it('counts every affected panel, not just the first', () => {
    const ps = [panel('a', { x: -1, y: 0 }), panel('a', { x: 1, y: 0 })];
    const out = layoutIssues(withKeepouts(ps, [zone('k1', rect(0, 0, 8, 4))]), SPEC);
    expect(out.find((i) => i.code === 'panel_in_keepout')!.focusPanelIds).toHaveLength(2);
  });
});
