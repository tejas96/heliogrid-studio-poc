// ─── The propagation matrix — Phase 1's acceptance gate ─────────────────────
// One row per edit from the design-kernel census: what recomputes, what is
// flagged, and that nothing is silently wrong. If a row fails, fix the kernel,
// not the assertion.
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { PANEL_DB } from '../../data/panels';
import '../ops';
import { previewOp } from '../ops/run';
import { componentsSet } from '../ops/components-ops';
import { inverterPlace, inverterRemove, stringsAddManual } from '../ops/electrical-ops';
import { layoutAutoDesign, panelsSetEnabled, segmentSetTilt } from '../ops/layout-ops';
import { syncElectrical } from '../derive/electrical-sync';
import { designFreshness } from '../derive/freshness';
import { deriveBomResult, designIssues } from '../derive/outputs';
import { isCaptureFresh, layoutFp, shadingFp } from '../fingerprints';
import { inverterWorldPos } from '../routing';

function designed(): Project {
  const fx = fixtureProject(24);
  const base: Project = {
    ...fx,
    // the fixture's 5 kW inverter cannot take a max-roof design; six of them can
    components: { ...fx.components, inverterCount: 6 },
    strings: [],
    location: {
      address: 'x',
      latLng: { lat: 18.5, lng: 73.8 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
    inverterPlacements: [{ id: 'invp_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }],
  };
  const d = previewOp(syncElectrical(base)!.next, layoutAutoDesign, { objective: 'max_roof' });
  if (!d.ok) throw new Error('auto-design refused: ' + d.refusal.reason);
  // pretend shading has settled so freshness.all can be true
  const p = d.next;
  return { ...p, derived: { ...p.derived, solarAccessFp: shadingFp(p) } };
}

const dcMetres = (p: Project) => deriveBomResult(p).lines.find((l) => l.id === 'elec.dc_cable')?.qty ?? 0;

describe('propagation matrix', () => {
  it('baseline: a designed project is fresh on every layer and has no electrical errors', () => {
    const p = designed();
    expect(p.segments.length).toBeGreaterThan(0);
    expect(designFreshness(p)).toMatchObject({ strings: true, routes: true, shading: true, all: true });
    expect(designIssues(p).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('(a) disable modules → strings and routes re-derive; shading and money go provisional', () => {
    const p = designed();
    const ids = p.panels.slice(0, 3).map((m) => m.id);
    const r = previewOp(p, panelsSetEnabled, { ids, enabled: false });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.impact.delta.modules).toBe(-3);
    expect(r.next.strings.some((s) => s.panelIds.some((id) => ids.includes(id)))).toBe(false);
    expect(r.impact.after.freshness.strings && r.impact.after.freshness.routes).toBe(true);
    expect(r.impact.after.freshness.shading).toBe(false);
    expect(r.impact.after.freshness.all).toBe(false);
  });

  it('(b) tilt → steel moves; strings and routes stay attached and fresh', () => {
    const p = designed();
    const r = previewOp(p, segmentSetTilt, { segmentId: p.segments[0].id, tiltDeg: 20 });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.impact.delta.steelKg).not.toBe(0);
    expect(r.impact.after.freshness.strings).toBe(true);
    expect(r.impact.after.freshness.routes).toBe(true);
  });

  it('(d) move the inverter → routes end at the new wall and the BOM cable metres change, no button', () => {
    const p = designed();
    const before = dcMetres(p);
    const removed = previewOp(p, inverterRemove, { id: 'invp_1' });
    if (!removed.ok) throw new Error(removed.refusal.reason);
    const moved = previewOp(removed.next, inverterPlace, { roofId: 'roof_1', edgeIndex: 2, t: 0.5, heightM: 1.5 });
    if (!moved.ok) throw new Error(moved.refusal.reason);
    const target = inverterWorldPos(moved.next, 0)!;
    const runs = (moved.next.cableRoutes ?? []).filter((c) => c.kind === 'string_homerun');
    expect(runs.length).toBeGreaterThan(0);
    for (const route of runs) {
      const end = route.waypoints[route.waypoints.length - 1];
      expect(end.x).toBeCloseTo(target.x, 6);
      expect(end.y).toBeCloseTo(target.y, 6);
    }
    expect(dcMetres(moved.next)).not.toBe(before);
    expect(moved.impact.after.freshness.routes).toBe(true);
  });

  it('(f) panel swap → layout re-keys, captures go stale, strings re-derive, no overlaps', () => {
    const p = designed();
    const cap = { id: 'c', label: 'x', dateIso: '2026-06-21', hour: 12, mode: 'shadow' as const, imageBlobId: 'b', forLayoutFp: layoutFp(p) };
    const cur = p.components.panel!;
    const other = PANEL_DB.find((x) => x.id !== cur.id && (x.lengthMm !== cur.lengthMm || x.widthMm !== cur.widthMm))!;
    const r = previewOp({ ...p, captures: [cap] }, componentsSet, { panel: other });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.next.components.panel?.id).toBe(other.id);
    expect(isCaptureFresh(r.next, cap)).toBe(false);
    expect(r.impact.after.freshness.strings).toBe(true);
    expect(r.impact.after.errors).toBe(0);
    expect(r.impact.label).toMatch(/^Panel: /);
  });

  it('(h) a manual string survives other edits and is pruned, never silently dropped', () => {
    const p = designed();
    const manual = previewOp(p, stringsAddManual, { panelIds: p.strings[0].panelIds.slice(0, 5) });
    if (!manual.ok) throw new Error(manual.refusal.reason);
    const mine = manual.next.strings.find((s) => s.manual)!;
    const tilt = previewOp(manual.next, segmentSetTilt, { segmentId: manual.next.segments[0].id, tiltDeg: 12 });
    if (!tilt.ok) throw new Error(tilt.refusal.reason);
    expect(tilt.next.strings.find((s) => s.id === mine.id)?.manual).toBe(true);
    const victim = mine.panelIds[0];
    const disabled = previewOp(tilt.next, panelsSetEnabled, { ids: [victim], enabled: false });
    if (!disabled.ok) throw new Error(disabled.refusal.reason);
    const kept = disabled.next.strings.find((s) => s.id === mine.id)!;
    expect(kept).toBeTruthy();
    expect(kept.panelIds).not.toContain(victim);
    expect(disabled.next.strings.some((s) => s.panelIds.includes(victim))).toBe(false);
  });
});
