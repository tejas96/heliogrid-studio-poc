// ─── Shading-engine characterization (Phase 4 gate) ─────────────────────────
// The headless raycast engine behind per-panel solarAccess: directional
// obstruction effects, parapet edge shading, determinism.
import { describe, expect, it } from 'vitest';
import { buildSunSamples, computeSolarAccess, accessChanged } from '../shading';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Obstruction, Project } from '../../types';

const PUNE = { lat: 18.5204, lng: 73.8567 };

function located(p: Project): Project {
  return {
    ...p,
    location: {
      address: 'Pune',
      latLng: PUNE,
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

function tank(over: Partial<Obstruction>): Obstruction {
  return {
    id: 'obs_t',
    type: 'tank',
    label: 'WT1',
    roofId: 'roof_1',
    center: { x: 0, y: 0 },
    shape: 'rect',
    lengthM: 3,
    widthM: 3,
    diameterM: 0,
    heightM: 2.5,
    rotationDeg: 0,
    setbackM: 0.3,
    castsShadow: true,
    blocksPlacement: true,
    ...over,
  };
}

describe('buildSunSamples', () => {
  it('covers all 12 months (Phase 4 seasonal alignment) with daytime-only samples', () => {
    const samples = buildSunSamples(PUNE.lat, PUNE.lng);
    expect(samples.length).toBeGreaterThan(70); // 12 months × ~6-7 daylight hours
    for (const s of samples) {
      expect(s.dir.y).toBeGreaterThan(0); // above the horizon
      expect(s.weight).toBeGreaterThan(0);
    }
  });
});

describe('computeSolarAccess (headless raycast engine)', () => {
  it('on an open roof, nothing shades the front row', () => {
    // NOT "every panel" any more (v5/Tier-2): this fixture's rows sit ~7 cm
    // apart, and modules now cast on each other, so the back row IS shaded —
    // that is the physics, pinned in row-shading.test.ts. What an obstruction-
    // free roof guarantees is that the row with clear sky south of it is full.
    const p = located(fixtureProject(8));
    const access = computeSolarAccess(p);
    const frontY = Math.min(...p.panels.map((x) => x.center.y));
    const front = p.panels.filter((x) => x.center.y === frontY);
    expect(front.length).toBeGreaterThan(0);
    for (const x of front) expect(access.get(x.id)!).toBeGreaterThan(0.95);
  });

  it('samples the WHOLE daylight window — not just 08:00–17:00 (scrub parity)', () => {
    // The scrub shows real shadows at 06:30; if the engine never samples that
    // hour, a panel shaded only in the early morning reads 100% access while
    // the scene plainly shows it dark. Pin the window against the site's real
    // sunrise/sunset so the two can never disagree about which suns exist.
    const lat = 18.5204;
    const lng = 73.8567;
    const samples = buildSunSamples(lat, lng);
    // June 21 at Pune: sunrise ~06:00 solar. A sample must exist that early.
    const alts = samples.map((s) => Math.asin(Math.max(-1, Math.min(1, s.dir.y))));
    const lowSun = alts.filter((a) => a < (10 * Math.PI) / 180);
    expect(lowSun.length).toBeGreaterThan(0); // near-horizon sun is sampled
    // …and its weight reflects its real (small) beam value — no arbitrary floor
    const lowest = samples.reduce((m, s) => (s.dir.y < m.dir.y ? s : m));
    expect(lowest.weight).toBeLessThan(0.05);
    expect(lowest.weight).toBeGreaterThan(0);
  });

  it('a LONE tilted panel never shades itself (self-exclusion, Tier-2)', () => {
    // A module's own plate lies across the rays whenever the sun is behind its
    // plane. That is incidence — already priced by the POA transposition — not
    // shade. If self-exclusion regressed, this panel would read badly shaded
    // and every tilted array would be derated twice.
    const base = located(fixtureProject(8));
    const p: Project = { ...base, panels: [base.panels[0]], obstructions: [] };
    const access = computeSolarAccess(p);
    expect(access.get(p.panels[0].id)!).toBeGreaterThan(0.99);
  });

  it('a tall obstruction reduces access for its neighbours — directionally', () => {
    const base = located(fixtureProject(8));
    // panels sit on two rows around y=-4…-3 (fixture); tank due SOUTH of them
    // blocks the low winter sun; a tank due NORTH blocks almost nothing
    const south: Project = {
      ...base,
      obstructions: [tank({ center: { x: -3, y: -5.5 }, heightM: 3 })],
    };
    const north: Project = {
      ...base,
      obstructions: [tank({ center: { x: -3, y: 5.5 }, heightM: 3 })],
    };
    const clear = computeSolarAccess(base);
    const withSouth = computeSolarAccess(south);
    const withNorth = computeSolarAccess(north);
    const nearId = base.panels[0].id; // panel at (-6,-4), ~2.9m from the south tank
    expect(withSouth.get(nearId)!).toBeLessThan(clear.get(nearId)! - 0.05);
    // northern hemisphere: a same-size object to the NORTH costs far less
    expect(withNorth.get(nearId)!).toBeGreaterThan(withSouth.get(nearId)!);
  });

  it('castsShadow=false obstructions do not shade at all', () => {
    const base = located(fixtureProject(8));
    const decor: Project = {
      ...base,
      obstructions: [tank({ center: { x: -3, y: -5.5 }, heightM: 3, castsShadow: false })],
    };
    const clear = computeSolarAccess(base);
    const withDecor = computeSolarAccess(decor);
    for (const p of base.panels) {
      expect(withDecor.get(p.id)!).toBeCloseTo(clear.get(p.id)!, 6);
    }
  });

  it('an enabled parapet shades a wall-adjacent panel more than the roof centre', () => {
    const base = located(fixtureProject(2));
    // explicit positions: one panel dead centre, one 1.2 m from the south wall
    const panels = [
      { ...base.panels[0], id: 'pv_center', center: { x: 0, y: 0 } },
      { ...base.panels[1], id: 'pv_south', center: { x: 0, y: -4.5 } },
    ];
    const parapet = {
      enabled: true,
      direction: 'inward' as const,
      heightM: 1.5,
      widthM: 0.3,
      perEdge: null,
      suppressSharedEdges: true,
    };
    const clear = computeSolarAccess({ ...base, panels });
    const walled = computeSolarAccess({
      ...base,
      panels,
      roofs: [fixtureRoof({ parapet })],
    });
    // the wall-adjacent panel loses measurably vs its own clear-roof value…
    expect(walled.get('pv_south')!).toBeLessThan(clear.get('pv_south')! - 0.02);
    // …and ends up worse than the centre panel under the same parapet
    expect(walled.get('pv_south')!).toBeLessThan(walled.get('pv_center')!);
  });

  it('is deterministic and accessChanged respects its tolerance', () => {
    const p = located(fixtureProject(8));
    const a = computeSolarAccess(p);
    const b = computeSolarAccess(p);
    expect([...a.entries()]).toEqual([...b.entries()]);
    // identical values ⇒ no change; a 1% bump ⇒ change
    const same: Project = {
      ...p,
      panels: p.panels.map((x) => ({ ...x, solarAccess: a.get(x.id)! })),
    };
    expect(accessChanged(same, a)).toBe(false);
    expect(accessChanged(same, new Map([...a].map(([k, v]) => [k, v - 0.01])))).toBe(true);
  });
});
