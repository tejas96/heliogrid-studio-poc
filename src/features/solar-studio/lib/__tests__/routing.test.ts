// ─── Cable routing (Phase 10 task 28b) ──────────────────────────────────────
// The number this produces is quoted to a customer in metres of copper, so it
// must come from a path that exists — and the BOM line must say what it summed.
import { describe, expect, it } from 'vitest';
import {
  acCableFromRoutes,
  autoRouteAc,
  autoRouteStrings,
  dcCableFromRoutes,
  intraStringExtraM,
  inverterWorldPos,
  polylineLengthM,
  routeLengthM,
  routePath,
  routeBlockers,
  routeIssues,
  dropForRunM,
} from '../routing';
import { deriveBom } from '../bom';
import { designFp, layoutFp } from '../fingerprints';
import { cascadeDeletePanels } from '../cascade';
import { INDIA_RULES } from '../../data/rules/india';
import { fixtureProject, fixtureRoof, fixturePanels } from './fixtures/project';
import { CAPABILITY_PRESETS } from '../capabilities';
import type { CableRoute, Obstruction, Project, StringDef } from '../../types';

function project(over: Partial<Project> = {}): Project {
  const base = fixtureProject(0);
  return {
    ...base,
    roofs: [fixtureRoof()],
    inverterPlacements: [
      { id: 'ip1', roofId: fixtureRoof().id, edgeIndex: 0, t: 0.5, heightM: 1.5 },
    ],
    ...over,
  };
}

function stringOf(ids: string[]): StringDef {
  return { id: 'str_1', name: 'String 1', inverterIndex: 0, mpptIndex: 0, panelIds: ids, color: '#000' };
}

describe('geometry helpers', () => {
  it('polyline length sums the segments', () => {
    expect(polylineLengthM([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 9 }])).toBeCloseTo(10, 6);
  });

  it('an inverter on an edge resolves to a real plan position', () => {
    const p = project();
    const pos = inverterWorldPos(p)!;
    const a = p.roofs[0].polygon[0];
    const b = p.roofs[0].polygon[1];
    expect(pos.x).toBeCloseTo((a.x + b.x) / 2, 6); // t = 0.5
    expect(pos.y).toBeCloseTo((a.y + b.y) / 2, 6);
  });

  it('no placement ⇒ no position (and the router simply routes nothing)', () => {
    const p = project({ inverterPlacements: [] });
    expect(inverterWorldPos(p)).toBeNull();
    expect(autoRouteStrings(p)).toEqual([]);
  });

  it('route length = path + drop, then slack', () => {
    const r: CableRoute = {
      id: 'r', kind: 'string_homerun', fromRef: 's', toRef: 'inv',
      waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }], verticalDropM: 3, slackPct: 0.1,
    };
    expect(routeLengthM(r)).toBeCloseTo((10 + 3) * 1.1, 6); // 14.3
  });
});

describe('routePath — avoids only what it must', () => {
  it('a clear roof gets a straight line (no fabricated doglegs)', () => {
    expect(routePath({ x: 0, y: 0 }, { x: 10, y: 0 }, [])).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('detours AROUND a blocker on the straight line — the path never enters it', () => {
    const wall = [
      { x: 4, y: -2 }, { x: 6, y: -2 }, { x: 6, y: 2 }, { x: 4, y: 2 },
    ];
    const path = routePath({ x: 0, y: 0 }, { x: 10, y: 0 }, [wall]);
    // rounding a box takes at least two corners — asserting an exact node count
    // would just pin today's shape; what must hold is that the copper misses it
    expect(path.length).toBeGreaterThanOrEqual(3);
    expect(polylineLengthM(path)).toBeGreaterThan(10); // detours cost metres
    const inside = (q: { x: number; y: number }) =>
      q.x > 4 && q.x < 6 && q.y > -2 && q.y < 2;
    for (let i = 1; i < path.length; i++) {
      for (let t = 0; t <= 1; t += 0.02) {
        const q = {
          x: path[i - 1].x + (path[i].x - path[i - 1].x) * t,
          y: path[i - 1].y + (path[i].y - path[i - 1].y) * t,
        };
        expect(inside(q)).toBe(false);
      }
    }
  });

  it('a blocker off to the side changes nothing', () => {
    const away = [{ x: 4, y: 20 }, { x: 6, y: 20 }, { x: 6, y: 22 }, { x: 4, y: 22 }];
    expect(routePath({ x: 0, y: 0 }, { x: 10, y: 0 }, [away])).toHaveLength(2);
  });
});

describe('edge preference — cable follows the building, not the crow', () => {
  it('prefers the perimeter corridor over cutting across the open roof', () => {
    // a square roof: going corner-to-corner, the diagonal is shortest but no
    // installer lays a conductor across live modules
    const ring = [
      { x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 },
    ];
    const from = { x: -9.5, y: -9.5 };
    const to = { x: 9.5, y: 9.5 };
    const viaEdge = routePath(from, to, [], [{ pts: ring, closed: true }]);
    const straight = routePath(from, to, []);
    expect(straight).toHaveLength(2); // no corridor ⇒ the diagonal
    expect(viaEdge.length).toBeGreaterThan(2); // corridor ⇒ it turns a corner
    // and it is HONESTLY longer — the penalty steers, it must not be billed
    expect(polylineLengthM(viaEdge)).toBeGreaterThan(polylineLengthM(straight));
  });

  it('routes AROUND the array footprint rather than across module glass', () => {
    // inverter south of a panel block: the direct line crosses the array; with
    // the footprint priced, the run must detour to an aisle/edge instead
    const ring = { pts: [
      { x: -12, y: -12 }, { x: 12, y: -12 }, { x: 12, y: 12 }, { x: -12, y: 12 },
    ], closed: true };
    const footprint = [
      { x: -8, y: -6 }, { x: 8, y: -6 }, { x: 8, y: 6 }, { x: -8, y: 6 },
    ];
    const from = { x: 0, y: 5 }; // deep in the array
    const to = { x: 0, y: -11 }; // inverter on the far side
    const across = routePath(from, to, [], undefined); // no corridor/footprint
    const around = routePath(from, to, [ /*no hard blockers*/ ], [ring], footprint);
    expect(across).toHaveLength(2); // baseline: straight through
    expect(around.length).toBeGreaterThan(2); // detoured out of the field
    expect(polylineLengthM(around)).toBeGreaterThan(polylineLengthM(across));
  });

  it('still takes the direct line when the corridor would be absurd', () => {
    // neighbours on the same edge: the corridor IS the direct line
    const ring = [
      { x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 },
    ];
    const path = routePath({ x: -5, y: -9.6 }, { x: 5, y: -9.6 }, [], [{ pts: ring, closed: true }]);
    expect(polylineLengthM(path)).toBeLessThan(11); // ~10 m, no silly detour
  });
});

describe('vertical drops come from the model, not a constant', () => {
  it('DC drops from the roof to the inverter; AC drops the inverter to grade', () => {
    const roof = fixtureRoof({ heightM: 7 });
    const p = project({
      roofs: [roof],
      inverterPlacements: [{ id: 'ip1', roofId: roof.id, edgeIndex: 0, t: 0.5, heightM: 1.5 }],
    });
    expect(dropForRunM(p, 'dc')).toBeCloseTo(7 - 1.5, 6); // was a flat 3
    expect(dropForRunM(p, 'ac')).toBeCloseTo(1.5, 6);
  });

  it('a taller roof drops further (the flat 3 m under-counted it)', () => {
    const tall = fixtureRoof({ heightM: 20 });
    const p = project({
      roofs: [tall],
      inverterPlacements: [{ id: 'ip1', roofId: tall.id, edgeIndex: 0, t: 0.5, heightM: 1.5 }],
    });
    expect(dropForRunM(p, 'dc')).toBeGreaterThan(3);
  });
});

describe('routeIssues — voltage drop', () => {
  it('warns when a long thin run exceeds the design limit', () => {
    const panels = fixturePanels(6);
    const p0 = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const longRun: CableRoute = {
      id: 'r1', kind: 'string_homerun', fromRef: 'str_1', toRef: 'inverter',
      waypoints: [{ x: 0, y: 0 }, { x: 400, y: 0 }], // absurd on purpose
      verticalDropM: 3, slackPct: 0.1,
    };
    const p: Project = { ...p0, cableRoutes: [longRun] };
    const issues = routeIssues(p, p.components.panel);
    expect(issues[0]?.code).toBe('dc_voltage_drop');
    expect(issues[0]?.message).toMatch(/% DC voltage drop/);
    expect(issues[0]?.level).toBe('warn');
  });

  it('stays quiet on a sane run', () => {
    const panels = fixturePanels(6);
    const p0 = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const p: Project = { ...p0, cableRoutes: autoRouteStrings(p0) };
    expect(routeIssues(p, p.components.panel)).toEqual([]);
  });

  it('says nothing before anything is routed', () => {
    expect(routeIssues(project({ panels: fixturePanels(6) }), null)).toEqual([]);
  });
});

describe('routeBlockers — bridgeable objects do NOT block cable', () => {
  function obstruction(over: Partial<Obstruction>): Obstruction {
    return {
      id: 'o1', type: 'tank', label: 'WT1', roofId: fixtureRoof().id,
      center: { x: 0, y: 0 }, shape: 'rect', lengthM: 2, widthM: 2, diameterM: 2,
      heightM: 1.2, rotationDeg: 0, setbackM: 0.3, castsShadow: true, blocksPlacement: true,
      ...over,
    };
  }

  it('a chimney that must stay open to sky blocks the run', () => {
    const p = project({
      obstructions: [obstruction({ type: 'chimney', capabilities: { ...CAPABILITY_PRESETS.chimney } })],
    });
    expect(routeBlockers(p, p.roofs[0])).toHaveLength(1);
  });

  it('a bridgeable tank does not — cable runs under a raised array', () => {
    const p = project({
      obstructions: [obstruction({ capabilities: { ...CAPABILITY_PRESETS.tank } })],
    });
    expect(routeBlockers(p, p.roofs[0])).toEqual([]);
  });
});

describe('intraStringExtraM — adjacent modules cost NOTHING', () => {
  it('modules within lead reach cost nothing', () => {
    // real rows sit ~1.15 m apart (module width + gap) — inside the lead reach
    const panels = fixturePanels(6);
    panels.forEach((q, i) => (q.center = { x: i * 1.15, y: 0 }));
    const p = project({ panels });
    expect(intraStringExtraM(stringOf(panels.map((x) => x.id)), p)).toBe(0);
  });

  it('a long jump charges only the EXCESS beyond the leads', () => {
    const panels = fixturePanels(2);
    panels[1].center = { x: panels[0].center.x + 30, y: panels[0].center.y };
    const p = project({ panels });
    const extra = intraStringExtraM(stringOf(panels.map((x) => x.id)), p);
    expect(extra).toBeCloseTo(30 - INDIA_RULES.cable.moduleLeadReachM, 4);
  });
});

describe('autoRouteStrings', () => {
  it('routes BOTH conductors home — + from one end, − from the other', () => {
    const panels = fixturePanels(6);
    const p = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const routes = autoRouteStrings(p);
    expect(routes).toHaveLength(2);
    expect(routes.every((r) => r.kind === 'string_homerun')).toBe(true);
    expect(routes.every((r) => r.fromRef === 'str_1')).toBe(true);
    // each starts at a different end of the string
    expect(routes[0].waypoints[0]).not.toEqual(routes[1].waypoints[0]);
  });

  it('drops a hand-routed run whose string no longer exists (no orphan copper)', () => {
    // auto-string mints NEW string ids each run, so after a re-string a manual
    // route points at nothing. Live, this survived and was still billed:
    // 27 → 28 routes on a second Auto string.
    const panels = fixturePanels(6);
    const orphan: CableRoute = {
      id: 'old', kind: 'string_homerun', fromRef: 'str_DELETED', toRef: 'inverter',
      waypoints: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 1, y: 1 }],
      verticalDropM: 3, slackPct: 0.1, manual: true,
    };
    const p = project({
      panels,
      strings: [stringOf(panels.map((x) => x.id))], // id 'str_1' — not str_DELETED
      cableRoutes: [orphan],
    });
    const routes = autoRouteStrings(p);
    expect(routes.some((r) => r.id === 'old')).toBe(false);
    expect(routes).toHaveLength(2); // both conductors of the live string, nothing else
  });

  it('never stomps a hand-edited route', () => {
    const panels = fixturePanels(6);
    const manual: CableRoute = {
      id: 'mine', kind: 'string_homerun', fromRef: 'str_1', toRef: 'inverter',
      waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }], verticalDropM: 3, slackPct: 0.1, manual: true,
    };
    const p = project({ panels, strings: [stringOf(panels.map((x) => x.id))], cableRoutes: [manual] });
    const routes = autoRouteStrings(p);
    expect(routes).toContainEqual(manual);
    expect(routes.filter((r) => !r.manual)).toHaveLength(0); // user owns this string
  });
});

describe('wiring: fingerprints + cascade', () => {
  it('a project with NO routes fingerprints byte-identically (no quote goes stale on upgrade)', () => {
    const p = project({ panels: fixturePanels(4) });
    const withEmpty: Project = { ...p, cableRoutes: [] };
    expect(designFp(withEmpty)).toBe(designFp(p));
    expect(designFp({ ...p, cableRoutes: undefined })).toBe(designFp(p));
  });

  it('routes re-key the DESIGN — they move cable metres, i.e. money', () => {
    const panels = fixturePanels(6);
    const p0 = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const routed: Project = { ...p0, cableRoutes: autoRouteStrings(p0) };
    expect(designFp(routed)).not.toBe(designFp(p0));
    // …but the LAYOUT is untouched: cable doesn't move a panel
    expect(layoutFp(routed)).toBe(layoutFp(p0));
  });

  it('deleting the panels kills the string AND its home runs (no dead copper in the quote)', () => {
    const panels = fixturePanels(6);
    const p0 = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const p: Project = { ...p0, cableRoutes: autoRouteStrings(p0) };
    expect(p.cableRoutes).toHaveLength(2);
    const after = cascadeDeletePanels(p, panels.map((x) => x.id));
    expect(after.strings).toEqual([]);
    expect(after.cableRoutes).toEqual([]);
  });
});

describe('dcCableFromRoutes → the BOM line', () => {
  it('reports nothing routed before routing has run', () => {
    expect(dcCableFromRoutes(project()).routed).toBe(false);
  });

  it('sums home runs + long hops, with slack', () => {
    const panels = fixturePanels(6);
    const p0 = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const p: Project = { ...p0, cableRoutes: autoRouteStrings(p0) };
    const dc = dcCableFromRoutes(p);
    expect(dc.routed).toBe(true);
    expect(dc.meters).toBe(dc.homeRunM + dc.intraM);
    // two home runs, each = path + 3 m drop, +10% slack
    const expected = p.cableRoutes!.reduce((s, r) => s + routeLengthM(r), 0);
    expect(dc.homeRunM).toBe(Math.round(expected));
  });

  it('BOM: the formula states what was actually summed (it used to claim slack it never applied)', () => {
    const panels = fixturePanels(6);
    const p0 = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const p: Project = { ...p0, cableRoutes: autoRouteStrings(p0) };
    const dcLine = deriveBom(p).find((l) => l.item.startsWith('DC Solar Cable'))!;
    expect(dcLine.formula).toMatch(/Routed home runs/);
    expect(dcLine.formula).toMatch(/10% slack/);
    expect(dcLine.qty).toBe(dcCableFromRoutes(p).meters);
  });

  it('BOM: with NO meter placed the AC run is an ASSUMED allowance, and says why', () => {
    const panels = fixturePanels(6);
    const p0 = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const p: Project = { ...p0, cableRoutes: autoRouteStrings(p0) };
    const ac = deriveBom(p).find((l) => l.item === 'AC Cable')!;
    // routing the DC runs must NOT make the AC line look measured
    expect(ac.formula).toMatch(/ASSUMED/);
    expect(ac.formula).toMatch(/no meter\/service entry placed/);
    expect(ac.qty).toBe(25);
  });

  it('BOM: placing the meter turns the AC run into a MEASURED length', () => {
    const panels = fixturePanels(6);
    const p0: Project = {
      ...project({ panels, strings: [stringOf(panels.map((x) => x.id))] }),
      gridConnection: { pos: { x: 40, y: -30 } },
    };
    const p: Project = { ...p0, cableRoutes: [...autoRouteStrings(p0), ...autoRouteAc(p0)] };
    const ac = deriveBom(p).find((l) => l.item === 'AC Cable')!;
    expect(ac.formula).toMatch(/Routed inverter → meter/);
    expect(ac.formula).not.toMatch(/ASSUMED/);
    expect(ac.qty).toBe(acCableFromRoutes(p).meters);
    // a real 40 m-away service entry costs more than the 25 m allowance
    expect(ac.qty).toBeGreaterThan(25);
  });

  it('autoRouteAc: no meter ⇒ no AC route (the length is genuinely unknown)', () => {
    const p = project({ panels: fixturePanels(6) });
    expect(autoRouteAc(p)).toEqual([]);
    expect(acCableFromRoutes(p).routed).toBe(false);
  });

  it('BOM: conduit is DUCT length (one duct per string), not conductor metres', () => {
    const panels = fixturePanels(6);
    const p0 = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const p: Project = { ...p0, cableRoutes: autoRouteStrings(p0) };
    const duct = dcCableFromRoutes(p).ductM;
    const conduit = deriveBom(p).find((l) => l.item.startsWith('Conduit'))!;
    // a string's + and − share ONE duct: conduit < cable metres
    expect(duct).toBeLessThan(dcCableFromRoutes(p).homeRunM);
    expect(conduit.qty).toBe(duct + 25);
    expect(conduit.formula).toMatch(/Routed DC runs/);
    expect(conduit.formula).toMatch(/one duct carries/);
  });

  it('BOM: with no inverter placed, the fallback says THAT is the blocker', () => {
    const panels = fixturePanels(6);
    const p = project({ panels, strings: [stringOf(panels.map((x) => x.id))], inverterPlacements: [] });
    const dcLine = deriveBom(p).find((l) => l.item.startsWith('DC Solar Cable'))!;
    expect(dcLine.formula).toMatch(/Place the inverter/);
  });

  it('BOM: an unrouted design says ESTIMATE and names the fix — never a fake routed figure', () => {
    const panels = fixturePanels(6);
    const p = project({ panels, strings: [stringOf(panels.map((x) => x.id))] });
    const dcLine = deriveBom(p).find((l) => l.item.startsWith('DC Solar Cable'))!;
    expect(dcLine.formula).toMatch(/ESTIMATE/);
    expect(dcLine.formula).toMatch(/Auto string/); // names the fix, not just the fault
    expect(dcLine.formula).not.toMatch(/15% slack incl/); // the old lie
  });
});
