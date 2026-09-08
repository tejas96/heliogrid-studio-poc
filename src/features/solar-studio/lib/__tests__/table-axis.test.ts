// ─── The direction a table's hardware has to face ────────────────────────────
// `StructureNodesInstanced` placed every clamp, plate and bolt with a
// never-assigned identity quaternion, so a table turned to any azimuth showed
// rotated rails held by unrotated hardware. `tableAxis` is the answer it now
// uses, read from the table's OWN members.
import { describe, expect, it } from 'vitest';
import { tableAxis, tableYawRad, type SegmentStructure } from '../structure';

type Member = SegmentStructure['members'][number];

const member = (kind: Member['kind'], ax: number, ay: number, bx: number, by: number): Member => ({
  id: `m/${kind}/${ax},${ay}`,
  kind,
  profileKey: 'c_channel',
  a: { x: ax, y: ay, z: 0 },
  b: { x: bx, y: by, z: 0 },
  lengthM: Math.hypot(bx - ax, by - ay),
});

const structure = (members: Member[]): SegmentStructure => ({
  segmentId: 'seg',
  members,
  nodes: [],
  foundation: 'concrete',
  foundationShape: 'square',
  steelKg: 0,
  memberSummary: {} as SegmentStructure['memberSummary'],
  warnings: [],
});

/** Signed angle between two unit vectors, in degrees — direction-agnostic. */
const axisDeg = (a: { x: number; y: number }) => (Math.atan2(a.y, a.x) * 180) / Math.PI;

describe('tableAxis', () => {
  it('follows the rails, not the world', () => {
    // a table turned 30° east of north-ish: rails at 30°
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const axis = tableAxis(structure([member('rail', 0, 0, 4 * c, 4 * s)]));
    expect(axisDeg(axis)).toBeCloseTo(30, 4);
  });

  it('averages rails stored head-to-tail without cancelling them', () => {
    // THE BUG A NAIVE AVERAGE HAS. These two rails are the same line; one is
    // simply stored end-first. Summing the raw vectors gives (0,0) and a table
    // whose hardware would snap back to the world axes. Doubling the angle
    // before averaging is what makes them agree.
    const axis = tableAxis(
      structure([
        member('rail', 0, 0, 3, 3),
        member('rail', 3, 3, 0, 0), // the identical line, reversed
      ]),
    );
    expect(Math.abs(axisDeg(axis)) % 180).toBeCloseTo(45, 4);
  });

  it('lets the long rail outvote a short one', () => {
    const axis = tableAxis(
      structure([
        member('rail', 0, 0, 10, 0), // 10 m due east
        member('rail', 0, 0, 0, 1), // 1 m due north
      ]),
    );
    // weighted toward east, and nowhere near the unweighted 45°
    expect(Math.abs(axisDeg(axis))).toBeLessThan(10);
  });

  it('ignores legs, which are vertical and say nothing in plan', () => {
    const leg = member('front_leg', 2, 2, 2, 2);
    const axis = tableAxis(structure([member('rail', 0, 0, 0, 5), leg]));
    expect(Math.abs(axisDeg(axis))).toBeCloseTo(90, 4);
  });

  it('falls back to purlins when a table has no rails', () => {
    const axis = tableAxis(structure([member('purlin', 0, 0, 5, 0)]));
    expect(axisDeg(axis)).toBeCloseTo(0, 4);
  });

  it('returns a stable answer rather than NaN for a structure with nothing to read', () => {
    expect(tableAxis(structure([]))).toEqual({ x: 1, y: 0 });
    expect(tableAxis(structure([member('front_leg', 1, 1, 1, 1)]))).toEqual({ x: 1, y: 0 });
  });
});

describe('tableYawRad', () => {
  /**
   * The convention this pins: the scene is EN(x east, y north, z up) mapped to
   * three(x, z, −y), and a part's LONG axis is its local +Z. So rotating +Z by
   * the returned angle about Y must land on the rail's direction in scene
   * coordinates, (dx, 0, −dy).
   *
   * A clamp turned 90° wrong still looks like a clamp, so a wrong sign here
   * would survive a glance at the screen. Rotate the vector and check.
   */
  const rotateZAxisBy = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

  const cases: [string, number, number][] = [
    ['due north', 0, 1],
    ['due east', 1, 0],
    ['due south', 0, -1],
    ['due west', -1, 0],
    ['north-east', Math.SQRT1_2, Math.SQRT1_2],
    ['a surveyed 23°', Math.sin(0.4014), Math.cos(0.4014)],
  ];

  for (const [name, dx, dy] of cases) {
    it(`points a part's long axis along a rail running ${name}`, () => {
      const yaw = tableYawRad(structure([member('rail', 0, 0, dx * 4, dy * 4)]));
      const got = rotateZAxisBy(yaw);
      // the scene direction the rail occupies
      const want = { x: dx, z: -dy };
      // a rail is a line: landing on it or on its reverse are both correct
      const forward = Math.abs(got.x - want.x) < 1e-6 && Math.abs(got.z - want.z) < 1e-6;
      const reversed = Math.abs(got.x + want.x) < 1e-6 && Math.abs(got.z + want.z) < 1e-6;
      expect(forward || reversed, `got (${got.x.toFixed(3)}, ${got.z.toFixed(3)}) want ±(${want.x.toFixed(3)}, ${want.z.toFixed(3)})`).toBe(true);
    });
  }

  it('is finite for a structure with nothing to read', () => {
    expect(Number.isFinite(tableYawRad(structure([])))).toBe(true);
  });
});
