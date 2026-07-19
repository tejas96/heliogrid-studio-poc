// ─── The renderer's assumptions about each GLB, checked against the GLB ──────
// ObstructionMesh scales every model by `heightM` and drops it at the roof
// surface. That is only correct if the asset is 1 m tall with its origin at the
// base — a claim the code states in a comment and, for `tree`, got wrong: that
// model is authored at 1.9 m with its origin at the bbox CENTRE, so every tree
// rendered half-buried until the renderer began compensating.
//
// A comment cannot enforce that. This reads the actual POSITION accessor bounds
// out of each .glb, so re-exporting an asset at a different scale or origin
// fails here instead of silently sinking or floating it in someone's scene.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'public/models/obstructions');

/** Authored bounding box, in the GLB's own units. */
function bbox(path: string) {
  const buf = readFileSync(path);
  expect(buf.readUInt32LE(0), 'glb magic').toBe(0x46546c67);
  let off = 12;
  let json: Record<string, never[]> | null = null;
  while (off < buf.length && !json) {
    const len = buf.readUInt32LE(off);
    if (buf.readUInt32LE(off + 4) === 0x4e4f534a) {
      json = JSON.parse(buf.subarray(off + 8, off + 8 + len).toString('utf8'));
    }
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  const g = json as unknown as {
    meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[];
    accessors?: { min?: number[]; max?: number[] }[];
  };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const m of g.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      const a = g.accessors?.[p.attributes?.POSITION ?? -1];
      if (!a?.min || !a?.max) continue;
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], a.min[i]);
        hi[i] = Math.max(hi[i], a.max[i]);
      }
    }
  }
  return { minY: lo[1], maxY: hi[1], height: hi[1] - lo[1], x: hi[0] - lo[0], z: hi[2] - lo[2] };
}

/** What ObstructionMesh believes about each model. */
const EXPECTED: Record<string, { height: number; minY: number; x?: number; z?: number }> = {
  chimney: { height: 1, minY: 0, x: 0.89661, z: 0.76548 },
  dish: { height: 1, minY: 0, x: 0.62657, z: 0.60935 },
  'solar-wh': { height: 1, minY: 0, x: 2.18336, z: 2.33074 },
  tank: { height: 1, minY: 0, x: 0.73888, z: 0.73929 },
  'turbine-vent': { height: 1, minY: 0, x: 1.05162, z: 1.05168 },
  // the exception, compensated for explicitly in TreeAsset
  tree: { height: 1.89677, minY: -0.9508, x: 1.2623, z: 1.21922 },
};

describe('obstruction GLBs match what the renderer assumes', () => {
  const dirs = existsSync(ROOT) ? readdirSync(ROOT) : [];

  it('the model directory is present', () => {
    expect(dirs.length, `no models under ${ROOT}`).toBeGreaterThan(0);
  });

  for (const [name, exp] of Object.entries(EXPECTED)) {
    const p = join(ROOT, name, `${name}.glb`);
    it(`${name}: authored height and origin are unchanged`, () => {
      if (!existsSync(p)) {
        // an asset that is not shipped renders procedurally; say so rather than
        // passing silently as if it had been checked
        expect(dirs, `${name}.glb missing — is it still shipped?`).not.toContain(name);
        return;
      }
      const b = bbox(p);
      expect(b.height, `${name} authored height`).toBeCloseTo(exp.height, 3);
      expect(b.minY, `${name} origin offset — a non-zero minY must be compensated`).toBeCloseTo(
        exp.minY,
        3,
      );
      if (exp.x !== undefined) expect(b.x, `${name} x extent`).toBeCloseTo(exp.x, 3);
      if (exp.z !== undefined) expect(b.z, `${name} z extent`).toBeCloseTo(exp.z, 3);
    });
  }

  it('every shipped model is covered by this table', () => {
    // a new asset added without an entry would otherwise go unverified
    const shipped = dirs.filter((d) => existsSync(join(ROOT, d, `${d}.glb`)));
    for (const d of shipped) expect(Object.keys(EXPECTED)).toContain(d);
  });
});
