// ─── One tree.glb, many trees — the variation must be stable and size-safe ──
// Two things are being pinned here, and the second matters more than the first.
//
// 1. The character is DERIVED FROM THE ID, so a tree keeps its own lean, yaw,
//    colour and sway phase across reloads. A `Math.random()` would re-roll on
//    every remount and read as a glitch.
// 2. The character CANNOT CHANGE THE TREE'S SIZE. Height and footprint are
//    surveyed values: the user typed them and `lib/scene-model.ts` builds the
//    shading solid from them. Jittering the drawn size would put the picture
//    and the kWh in disagreement, which CLAUDE.md's one-frame rule forbids.
//    The key-set assertion is the guard — add a `scale` to TreeCharacter later
//    and this test stops you.
import { describe, expect, it } from 'vitest';
import { treeCharacter, TREE_LEAN_MAX } from '../ObstructionMesh';

const IDS = [
  'ob_ca8937ea-5001-4c83-ad7b-29ea0283bafd',
  'ob_9288dd07-b191-464e-9afb-d5db581381c4',
  'ob_58991c54-72ad-480f-9ef8-9bf71c8bc09f',
  'ob_4dcde415-b863-46a2-938f-e8e6b8c3cfca',
  'ob_3216b397-1143-4a5f-a992-22102eeca01e',
];

describe('treeCharacter', () => {
  it('varies NOTHING that a surveyor measured', () => {
    // the whole allow-list: yaw, lean, sway and colour. No size, no position.
    expect(Object.keys(treeCharacter(IDS[0])).sort()).toEqual(
      ['leanX', 'leanZ', 'phaseX', 'phaseZ', 'rate', 'tint', 'yaw'].sort(),
    );
  });

  it('gives the same id the same character every time', () => {
    const a = treeCharacter(IDS[0]);
    const b = treeCharacter(IDS[0]);
    expect(a.yaw).toBe(b.yaw);
    expect(a.leanX).toBe(b.leanX);
    expect(a.tint.getHex()).toBe(b.tint.getHex());
  });

  it('gives five trees five different sway phases — the clone-army fix', () => {
    const phases = IDS.map((id) => treeCharacter(id).phaseZ);
    expect(new Set(phases).size).toBe(IDS.length);
  });

  it('gives five trees five different yaws and five different tints', () => {
    expect(new Set(IDS.map((id) => treeCharacter(id).yaw)).size).toBe(IDS.length);
    expect(new Set(IDS.map((id) => treeCharacter(id).tint.getHex())).size).toBe(IDS.length);
  });

  it('keeps every tree standing: lean within the cap, rate positive', () => {
    for (const id of IDS) {
      const c = treeCharacter(id);
      expect(Math.abs(c.leanX)).toBeLessThanOrEqual(TREE_LEAN_MAX);
      expect(Math.abs(c.leanZ)).toBeLessThanOrEqual(TREE_LEAN_MAX);
      expect(c.rate).toBeGreaterThan(0);
    }
  });

  it('keeps the foliage tint a MULTIPLIER, not a repaint', () => {
    // it multiplies the model's own albedo map, so a channel far from 1 would
    // stop reading as a species and start reading as a broken material
    for (const id of IDS) {
      const { r, g, b } = treeCharacter(id).tint;
      for (const ch of [r, g, b]) {
        expect(ch).toBeGreaterThan(0.7);
        expect(ch).toBeLessThan(1.3);
      }
    }
  });
});
