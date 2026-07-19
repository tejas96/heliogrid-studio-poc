// ─── Obstructions must stand ON the surface beneath them ────────────────────
// Reported with a screenshot of turbine vents hovering over a pitched roof.
//
// Root cause, in two parts:
//   1. `roofId` is captured once at PLACEMENT and never recomputed. Dragging,
//      arrow-nudging or duplicating an obstruction moves its centre and leaves
//      the anchor pointing at whatever roof it was first dropped on.
//   2. `surfaceHeightAt` extrapolates its plane with no bound, so a stale
//      anchor does not fail loudly — it quietly returns the OLD roof's plane
//      extended to the new position. On a pitched roof that plane climbs, so
//      the object hangs in the air above the surface actually drawn there.
//
// These pin the invariant for every roof shape, which is what stops the next
// roof type from reintroducing it.
import { describe, expect, it } from 'vitest';
import { surfaceHeightAt, isSloped } from '../roof-plane';
import { pickRoofAt } from '../roof-topology';
import { groundHeightAt, obstructionBaseY, resolveAnchorRoofId } from '../ground';
import { buildShadowCasters } from '../scene-model';
import { makeObstruction } from '../roof-factory';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Roof } from '../../types';

/** A 20 m × 20 m roof at `h`, pitched `pitch` degrees toward `az`. */
function roofAt(id: string, h: number, pitch: number, az = 180, shift = 0): Roof {
  return {
    ...fixtureRoof(),
    id,
    heightM: h,
    pitchDeg: pitch,
    slopeAzimuthDeg: az,
    polygon: [
      { x: shift + 0, y: 0 },
      { x: shift + 20, y: 0 },
      { x: shift + 20, y: 20 },
      { x: shift + 0, y: 20 },
    ],
  };
}

describe('the extrapolation that lets a stale anchor hide', () => {
  it('a pitched plane keeps climbing far outside its own polygon', () => {
    const roof = roofAt('r1', 3, 20);
    expect(isSloped(roof)).toBe(true);

    const onRoof = surfaceHeightAt(roof, { x: 10, y: 10 });
    const wayOff = surfaceHeightAt(roof, { x: 10, y: -200 });
    // 200 m upslope at 20° is ~70 m of climb — an object anchored here would
    // hang seventy metres over whatever is actually below it
    expect(Math.abs(wayOff - onRoof)).toBeGreaterThan(50);
  });
});

describe('groundHeightAt — resolve the surface from POSITION, not a stored id', () => {
  it('uses the roof actually beneath the point', () => {
    const roof = roofAt('r1', 3, 20);
    const p = { x: 10, y: 10 };
    expect(groundHeightAt(p, [roof])).toBeCloseTo(surfaceHeightAt(roof, p), 6);
  });

  it('a STALE anchor cannot lift an object — the position wins', () => {
    // the exact reported failure: anchored to a pitched roof, then moved off it
    const pitched = roofAt('r1', 3, 20);
    const off = { x: 10, y: -60 };
    const stale = surfaceHeightAt(pitched, off); // what the old code used
    // Unbounded in BOTH directions: extrapolating upslope floats the object,
    // downslope buries it. Either way the number is unrelated to what is
    // actually beneath it, which is the whole defect.
    expect(Math.abs(stale - surfaceHeightAt(pitched, { x: 10, y: 10 }))).toBeGreaterThan(15);
    expect(groundHeightAt(off, [pitched])).toBe(0); // nothing there ⇒ ground

    // and the obstruction-level helper heals the stale claim the same way
    expect(obstructionBaseY({ center: off, roofId: 'r1' }, [pitched])).toBe(0);
  });

  it('picks the higher roof when two overlap, matching pickRoofAt', () => {
    const low = roofAt('low', 3, 0);
    const high = { ...roofAt('high', 8, 0), polygon: roofAt('high', 8, 0).polygon };
    const p = { x: 10, y: 10 };
    expect(pickRoofAt(p, [low, high])?.id).toBe('high');
    expect(groundHeightAt(p, [low, high])).toBeCloseTo(8, 6);
  });

  it('returns ground level off every roof', () => {
    expect(groundHeightAt({ x: 500, y: 500 }, [roofAt('r1', 3, 20)])).toBe(0);
  });

  it('handles a project with no roofs at all', () => {
    expect(groundHeightAt({ x: 0, y: 0 }, [])).toBe(0);
  });
});

describe('obstructionBaseY — heal stale anchors WITHOUT destroying intent', () => {
  const roof = roofAt('r1', 5, 0);

  it('an explicit ground object stays on the ground, even under a roof', () => {
    // a tree beside a building whose trunk falls inside the footprint in plan.
    // Re-resolving this one by position would plant it on the roof.
    const tree = { center: { x: 10, y: 10 }, roofId: null };
    expect(pickRoofAt(tree.center, [roof])?.id).toBe('r1'); // a roof IS above it
    expect(obstructionBaseY(tree, [roof])).toBe(0); // …and it still stands on grade
  });

  it('a valid roof anchor is honoured', () => {
    expect(obstructionBaseY({ center: { x: 10, y: 10 }, roofId: 'r1' }, [roof])).toBeCloseTo(5, 6);
  });

  it('an anchor to a roof that no longer exists falls back to what is there', () => {
    expect(obstructionBaseY({ center: { x: 10, y: 10 }, roofId: 'deleted' }, [roof])).toBeCloseTo(
      5,
      6,
    );
  });

  it('moved from a HIGH roof onto a LOW one, it takes the low one', () => {
    const high = roofAt('high', 9, 0);
    const low = { ...roofAt('low', 3, 0), polygon: roofAt('low', 3, 0, 180, 40).polygon };
    // still claiming `high`, but now standing over `low`
    expect(obstructionBaseY({ center: { x: 50, y: 10 }, roofId: 'high' }, [high, low])).toBeCloseTo(
      3,
      6,
    );
  });
});

describe('resolveAnchorRoofId — the same rule for placing and for moving', () => {
  const roof = roofAt('r1', 3, 20);

  it('over a roof ⇒ that roof', () => {
    expect(resolveAnchorRoofId({ x: 10, y: 10 }, [roof])).toBe('r1');
    expect(resolveAnchorRoofId({ x: 10, y: 10 }, [roof])).toBe(pickRoofAt({ x: 10, y: 10 }, [roof])!.id);
  });

  it('off every roof ⇒ ground', () => {
    expect(resolveAnchorRoofId({ x: 999, y: 999 }, [roof])).toBeNull();
  });
});

describe('every roof shape grounds its obstructions', () => {
  const CASES: { name: string; roof: Roof }[] = [
    { name: 'flat RCC', roof: roofAt('flat', 3, 0) },
    { name: 'shallow pitch 5°', roof: roofAt('p5', 3, 5) },
    { name: 'steep pitch 30°', roof: roofAt('p30', 3, 30) },
    { name: 'pitched, azimuth 90°', roof: roofAt('az90', 4, 20, 90) },
    { name: 'pitched, azimuth 0°', roof: roofAt('az0', 4, 20, 0) },
    { name: 'tall shed', roof: roofAt('shed', 6.5, 0) },
  ];

  for (const { name, roof } of CASES) {
    it(`${name}: an obstruction anywhere on it sits exactly on the surface`, () => {
      for (const p of [
        { x: 1, y: 1 },
        { x: 10, y: 10 },
        { x: 19, y: 19 },
        { x: 5, y: 15 },
      ]) {
        expect(groundHeightAt(p, [roof]), `${name} @ ${p.x},${p.y}`).toBeCloseTo(
          surfaceHeightAt(roof, p),
          6,
        );
      }
    });

    it(`${name}: never below the eave, never above the ridge`, () => {
      const ring = roof.polygon.map((q) => surfaceHeightAt(roof, q));
      const lo = Math.min(...ring);
      const hi = Math.max(...ring);
      for (const p of [
        { x: 2, y: 3 },
        { x: 12, y: 8 },
        { x: 18, y: 17 },
      ]) {
        const h = groundHeightAt(p, [roof]);
        expect(h, `${name} lower bound`).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(h, `${name} upper bound`).toBeLessThanOrEqual(hi + 1e-6);
      }
    });
  }

  it('a multi-face building grounds each face against ITS OWN plane', () => {
    // two faces of a gable, sloping opposite ways, meeting at a ridge
    const west = roofAt('w', 3, 20, 90);
    const east = { ...roofAt('e', 3, 20, 270, 20) };
    const roofs = [west, east];
    for (const [p, id] of [
      [{ x: 5, y: 10 }, 'w'],
      [{ x: 25, y: 10 }, 'e'],
    ] as const) {
      const owner = roofs.find((r) => r.id === id)!;
      expect(pickRoofAt(p, roofs)?.id, `${p.x},${p.y}`).toBe(id);
      expect(groundHeightAt(p, roofs)).toBeCloseTo(surfaceHeightAt(owner, p), 6);
    }
  });

  it('the SHADING caster is grounded identically to the visual mesh (§A0)', () => {
    // Not cosmetic: a mis-grounded caster shades panels it does not reach, and
    // that reaches the energy number. This builds the REAL caster scene and
    // reads the mesh back, rather than re-calling the helper and comparing it
    // to itself — which would pass no matter what scene-model did.
    const roof = roofAt('r1', 4, 20);
    const base = fixtureProject(0);
    const cases = [
      { id: 'ob_on', center: { x: 5, y: 5 }, roofId: 'r1' as string | null },
      { id: 'ob_ground', center: { x: 6, y: 6 }, roofId: null as string | null },
      { id: 'ob_stale', center: { x: 99, y: 99 }, roofId: 'r1' as string | null },
    ];
    const project = {
      ...base,
      roofs: [roof],
      obstructions: cases.map((c) => ({
        ...makeObstruction({ type: 'tank' as const, center: c.center, existing: [], roofId: c.roofId }),
        id: c.id,
      })),
    };

    const { meshes } = buildShadowCasters(project);
    for (const c of cases) {
      const o = project.obstructions.find((x) => x.id === c.id)!;
      const mesh = meshes.find((m) => m.userData?.casterId === o.id);
      // asserted present — a `continue` here would pass silently the day the
      // engine stops emitting the caster at all
      expect(mesh, `${c.id} must emit a caster`).toBeDefined();
      const expected = obstructionBaseY(o, project.roofs) + o.heightM / 2;
      expect(mesh!.position.y, `${c.id}`).toBeCloseTo(expected, 6);
    }

    // and the three cases must not all collapse to the same height, or the
    // assertion above would hold trivially
    const ys = cases.map((c) => meshes.find((m) => m.userData?.casterId === c.id)!.position.y);
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('the shared fixture project stays consistent', () => {
    const p = fixtureProject(8);
    for (const roof of p.roofs) {
      const c = roof.polygon
        .reduce((a, q) => ({ x: a.x + q.x / roof.polygon.length, y: a.y + q.y / roof.polygon.length }), { x: 0, y: 0 });
      expect(groundHeightAt(c, p.roofs)).toBeCloseTo(surfaceHeightAt(roof, c), 6);
    }
  });
});
