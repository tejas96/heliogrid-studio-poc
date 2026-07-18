// ─── Grouping + auto-stringing (Phase 9 tasks 28b/28c) ──────────────────────
// The contract: never emit a string that cannot be built. Where the old engine
// silently produced 30-in-series on a 1100 V inverter, the planner must leave
// panels unstrung and SAY SO.
import { describe, expect, it } from 'vitest';
import { groupPanels, serpentine, shadeTierOf } from '../electrical/grouping';
import {
  autoStringPlan,
  mergeUndersizedGroups,
  parallelPerMppt,
  splitGroup,
} from '../electrical/autostring';
import { resolveDesignTemps } from '../electrical/temps';
import { stringSizing } from '../electrical/window';
import { validateSystem } from '../stringing';
import { fixtureProject, fixturePanels } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';
import type { PlacedPanel, Project, ValidationIssue } from '../../types';

const panel = PANEL_DB.find((p) => p.id === 'pnl_ada540')!;
const inverter = INVERTER_DB.find((i) => i.id === 'inv_gr10')!; // 2 MPPT, 1100 Vdc

function project(panels: PlacedPanel[]): Project {
  return {
    ...fixtureProject(0),
    panels,
    location: {
      address: 'Pune',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

const TEMPS = resolveDesignTemps(project([]));
const SIZING = stringSizing(panel, inverter, TEMPS);

describe('groupPanels — what may share a series string', () => {
  it('splits by ROOF: a string may never span two roofs', () => {
    const panels = fixturePanels(8);
    panels.slice(4).forEach((p) => (p.roofId = 'roof_2'));
    const groups = groupPanels(project(panels));
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.roofId)).size).toBe(2);
  });

  it('splits by ORIENTATION beyond tolerance, keeps near-identical together', () => {
    const near = fixturePanels(4);
    near[0].azimuthDeg = 182; // within ±5°
    expect(groupPanels(project(near))).toHaveLength(1);
    const far = fixturePanels(4);
    far[0].azimuthDeg = 270; // west vs south: different peak hour
    expect(groupPanels(project(far))).toHaveLength(2);
  });

  it('splits by TILT and by SHADE tier', () => {
    const tilt = fixturePanels(4);
    tilt[0].tiltDeg = 25;
    expect(groupPanels(project(tilt))).toHaveLength(2);
    const shade = fixturePanels(4);
    shade[0].solarAccess = 0.5; // heavy — would drag its whole string down
    expect(groupPanels(project(shade))).toHaveLength(2);
  });

  it('shade tiers reuse the SAME thresholds as the 3D access tint', () => {
    expect(shadeTierOf(1)).toBe('clear');
    expect(shadeTierOf(0.9)).toBe('light');
    expect(shadeTierOf(0.5)).toBe('heavy');
    expect(shadeTierOf(undefined)).toBe('clear'); // provisional = unshaded
  });

  it('excludes disabled panels entirely', () => {
    const panels = fixturePanels(6);
    panels[0].enabled = false;
    const groups = groupPanels(project(panels));
    expect(groups.flatMap((g) => g.panels)).toHaveLength(5);
  });

  it('is deterministic — same project, same groups, same order', () => {
    const panels = fixturePanels(8);
    const a = groupPanels(project(panels)).map((g) => g.key);
    const b = groupPanels(project([...panels].reverse())).map((g) => g.key);
    expect(a).toEqual(b);
  });
});

describe('serpentine order', () => {
  it('walks rows alternately so the cable follows the array', () => {
    const g = groupPanels(project(fixturePanels(8)))[0];
    const order = serpentine(g);
    expect(order).toHaveLength(8);
    expect(new Set(order.map((p) => p.id)).size).toBe(8); // every panel once
  });
});

describe('splitGroup — legal series lengths only', () => {
  it('balances strings when the window allows (sizes differ by ≤ 1)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const { chunks, tail } = splitGroup(ids, 5, 12);
    expect(tail).toEqual([]);
    expect(chunks).toHaveLength(2);
    expect(Math.max(...chunks.map((c) => c.length)) - Math.min(...chunks.map((c) => c.length))).toBeLessThanOrEqual(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(12);
  });

  it('a narrow window keeps full strings and reports the tail (no short string)', () => {
    // min 12 / max 18 with 20 panels: balanced would be 10+10, both ILLEGAL
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const { chunks, tail } = splitGroup(ids, 12, 18);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(18);
    expect(tail).toHaveLength(2); // honest remainder, not a 2-module string
  });

  it('too few panels for even one string ⇒ all tail, no chunks', () => {
    const { chunks, tail } = splitGroup(['a', 'b'], 5, 12);
    expect(chunks).toEqual([]);
    expect(tail).toHaveLength(2);
  });
});

describe('parallelPerMppt — current is the real ceiling', () => {
  it('honours the datasheet strings-per-MPPT when current allows', () => {
    const p = parallelPerMppt(panel, { ...inverter, mppt: { ...inverter.mppt, stringsPerMppt: 2, maxCurrentA: 60 } });
    expect(p.allowed).toBe(2);
    expect(p.limitedByCurrent).toBe(false);
  });

  it('Isc caps parallel strings BELOW the datasheet claim', () => {
    // Isc 13.85 ⇒ a 26 A MPPT fits one string, not the claimed two
    const p = parallelPerMppt(panel, { ...inverter, mppt: { ...inverter.mppt, stringsPerMppt: 2, maxCurrentA: 26 } });
    expect(p.allowed).toBe(1);
    expect(p.limitedByCurrent).toBe(true);
  });

  it('does NOT double-apply the 1.25 wiring factor (ordinary hardware must pass)', () => {
    // 13.85 A Isc on a 16 A MPPT is a standard pairing (e.g. GW5000-NS).
    // With 1.25 applied here it would read 17.3 A and be refused outright.
    const gw = INVERTER_DB.find((i) => i.id === 'inv_gw5')!;
    expect(gw.mppt.maxCurrentA).toBe(16);
    expect(panel.iscA).toBeLessThan(16);
    expect(parallelPerMppt(panel, gw).allowed).toBeGreaterThanOrEqual(1);
  });
});

describe('mergeUndersizedGroups — no dead-end singletons', () => {
  it('a lone off-tier panel joins its electrical twins instead of stranding', () => {
    // exactly the live case: 224 clear + 7 light + ONE at 82.7% in a tier alone
    const panels = fixturePanels(20);
    panels[0].solarAccess = 0.827; // 'heavy' — its own tier, one member
    const issues: ValidationIssue[] = [];
    const merged = mergeUndersizedGroups(groupPanels(project(panels)), 5, issues);
    expect(merged).toHaveLength(1); // folded in, nothing stranded
    expect(merged[0].panels).toHaveLength(20);
    const warn = issues.find((i) => i.code === 'shade_mismatch');
    expect(warn?.level).toBe('warn');
    expect(warn?.message).toMatch(/83% sun/); // names the real cost
    expect(warn?.focusPanelIds).toEqual([panels[0].id]);
  });

  it('a genuinely shaded ROW keeps its own string (tiering still does its job)', () => {
    const panels = fixturePanels(20);
    panels.slice(0, 8).forEach((p) => (p.solarAccess = 0.6)); // enough to stand alone
    const issues: ValidationIssue[] = [];
    const merged = mergeUndersizedGroups(groupPanels(project(panels)), 5, issues);
    expect(merged).toHaveLength(2);
    expect(issues).toHaveLength(0);
  });

  it('never merges across roofs or orientations (electrical compatibility first)', () => {
    const panels = fixturePanels(20);
    panels[0].solarAccess = 0.827;
    panels[0].roofId = 'roof_lonely'; // no compatible host
    const issues: ValidationIssue[] = [];
    const merged = mergeUndersizedGroups(groupPanels(project(panels)), 5, issues);
    expect(merged).toHaveLength(2); // stays separate; splitGroup reports the tail
    expect(issues).toHaveLength(0);
  });

  it('the live case end-to-end: every enabled panel gets strung', () => {
    const panels = fixturePanels(24);
    panels[0].solarAccess = 0.827;
    const plan = autoStringPlan(project(panels), panel, inverter, 4, TEMPS);
    expect(plan.unstrungPanelIds).toEqual([]);
    expect(plan.strings.flatMap((s) => s.panelIds)).toHaveLength(24);
    expect(plan.issues.some((i) => i.code === 'shade_mismatch')).toBe(true);
  });
});

describe('autoStringPlan — the Phase-4 KNOWN LIMIT, closed', () => {
  it('THE FIX: too few MPPT slots ⇒ unstrung panels + an explicit error (never over-long strings)', () => {
    // 60 panels, ONE inverter (2 MPPT). The old engine emitted 30-in-series.
    const p = project(fixturePanels(60));
    const plan = autoStringPlan(p, panel, inverter, 1, TEMPS);
    for (const s of plan.strings) {
      expect(s.panelIds.length).toBeLessThanOrEqual(SIZING.maxPanels); // no over-voltage
    }
    expect(plan.unstrungPanelIds.length).toBeGreaterThan(0);
    const err = plan.issues.find((i) => i.code === 'mppt_capacity');
    expect(err?.level).toBe('error');
    expect(err?.message).toMatch(/unstrung/);
  });

  it('every emitted string fits the window and the slots it claims', () => {
    const p = project(fixturePanels(30));
    const plan = autoStringPlan(p, panel, inverter, 2, TEMPS);
    for (const s of plan.strings) {
      expect(s.panelIds.length).toBeGreaterThanOrEqual(SIZING.minPanels);
      expect(s.panelIds.length).toBeLessThanOrEqual(SIZING.maxPanels);
      expect(s.inverterIndex).toBeLessThan(2);
      expect(s.mpptIndex).toBeLessThan(inverter.mppt.count);
    }
  });

  it('strings never span groups (the global-Y-sort bug, closed)', () => {
    const panels = fixturePanels(24);
    panels.slice(12).forEach((p) => {
      p.roofId = 'roof_2';
      p.azimuthDeg = 270; // west-facing second roof
    });
    const plan = autoStringPlan(project(panels), panel, inverter, 4, TEMPS);
    const byId = new Map(panels.map((p) => [p.id, p]));
    for (const s of plan.strings) {
      const roofs = new Set(s.panelIds.map((id) => byId.get(id)!.roofId));
      const azes = new Set(s.panelIds.map((id) => byId.get(id)!.azimuthDeg));
      expect(roofs.size).toBe(1);
      expect(azes.size).toBe(1);
    }
  });

  it('never strings a disabled panel, and covers each enabled one at most once', () => {
    const panels = fixturePanels(20);
    panels[0].enabled = false;
    const plan = autoStringPlan(project(panels), panel, inverter, 2, TEMPS);
    const ids = plan.strings.flatMap((s) => s.panelIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(panels[0].id);
  });

  it('an impossible panel/inverter pair strings nothing and says why', () => {
    const narrow = { ...inverter, maxDcV: 300, mppt: { ...inverter.mppt, maxV: 300, minV: 280 } };
    const plan = autoStringPlan(project(fixturePanels(20)), panel, narrow, 2, TEMPS);
    expect(plan.strings).toEqual([]);
    expect(plan.issues[0].code).toBe('string_window_empty');
    expect(plan.unstrungPanelIds).toHaveLength(20);
  });

  it('a module whose Isc alone exceeds the MPPT input is refused, not wired', () => {
    const weak = { ...inverter, mppt: { ...inverter.mppt, maxCurrentA: 5 } };
    const plan = autoStringPlan(project(fixturePanels(12)), panel, weak, 1, TEMPS);
    expect(plan.strings).toEqual([]);
    expect(plan.issues[0].code).toBe('isc_high');
  });
});

describe('validateSystem — unstrung panels are an ERROR that outlives autostring', () => {
  it('flags enabled panels no string covers (however they were authored)', () => {
    const panels = fixturePanels(20);
    const plan = autoStringPlan(project(panels), panel, inverter, 1, TEMPS);
    const issues = validateSystem(
      plan.strings,
      panel,
      inverter,
      1,
      panels.length,
      TEMPS,
      panels.map((p) => p.id),
    );
    const orphan = issues.find((i) => i.code === 'unstrung_panels');
    if (plan.unstrungPanelIds.length > 0) {
      expect(orphan?.level).toBe('error');
    } else {
      expect(orphan).toBeUndefined();
    }
  });

  it('a fully strung design reports no unstrung error', () => {
    const panels = fixturePanels(12);
    const plan = autoStringPlan(project(panels), panel, inverter, 2, TEMPS);
    const issues = validateSystem(
      plan.strings,
      panel,
      inverter,
      2,
      panels.length,
      TEMPS,
      panels.map((p) => p.id),
    );
    expect(issues.some((i) => i.code === 'unstrung_panels')).toBe(false);
  });
});
