// ─── Phase 22o part 3 gates: the projections ────────────────────────────────
// A drawing is only useful if it can be MEASURED, so these pin the two
// properties that make that true: an isometric preserves equal lengths along
// each axis, and the fit preserves aspect. A view that stretches to fill its
// frame looks better and cannot be scaled off.
import { describe, expect, it } from 'vitest';
import { elevationProject, fitToBox, isoProject, projectMembers } from '../drawing-project';

const d = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(b.x - a.x, b.y - a.y);

describe('isometric', () => {
  it('the origin stays put', () => {
    expect(isoProject({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('height is vertical — z moves only screen-y, and UPWARD', () => {
    const p = isoProject({ x: 0, y: 0, z: 1 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(-1, 9); // screen y grows down, so up is negative
  });

  it('equal lengths along x and y draw equal — this is why it is measurable', () => {
    const ox = d(isoProject({ x: 0, y: 0, z: 0 }), isoProject({ x: 1, y: 0, z: 0 }));
    const oy = d(isoProject({ x: 0, y: 0, z: 0 }), isoProject({ x: 0, y: 1, z: 0 }));
    expect(ox).toBeCloseTo(oy, 9);
  });

  it('x and y rake in OPPOSITE screen directions, or it is not an isometric', () => {
    expect(isoProject({ x: 1, y: 0, z: 0 }).x).toBeGreaterThan(0);
    expect(isoProject({ x: 0, y: 1, z: 0 }).x).toBeLessThan(0);
  });

  it('is linear — a midpoint projects to the midpoint', () => {
    const a = { x: 2, y: -3, z: 1 };
    const b = { x: -4, y: 5, z: 3 };
    const mid = isoProject({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
    const pa = isoProject(a);
    const pb = isoProject(b);
    expect(mid.x).toBeCloseTo((pa.x + pb.x) / 2, 9);
    expect(mid.y).toBeCloseTo((pa.y + pb.y) / 2, 9);
  });
});

describe('side elevation', () => {
  it('south (down-tilt, −y) is to the LEFT, matching the thumbnail', () => {
    // the preview and the printed sheet must not disagree about which way the
    // array faces
    expect(elevationProject({ x: 0, y: -2, z: 0 }).x).toBeLessThan(
      elevationProject({ x: 0, y: 2, z: 0 }).x,
    );
  });

  it('height rises up the page', () => {
    expect(elevationProject({ x: 0, y: 0, z: 2 }).y).toBeLessThan(
      elevationProject({ x: 0, y: 0, z: 0 }).y,
    );
  });

  it('ignores the row axis — that is what makes it an elevation', () => {
    expect(elevationProject({ x: 99, y: 1, z: 1 })).toEqual(
      elevationProject({ x: -99, y: 1, z: 1 }),
    );
  });
});

describe('fitToBox', () => {
  const box = { x: 0, y: 0, w: 200, h: 100 };

  it('keeps everything inside the box', () => {
    const pts = [
      { x: -5, y: -5 },
      { x: 5, y: 5 },
    ];
    const t = fitToBox(pts, box, 10);
    for (const p of pts) {
      expect(t.toX(p.x)).toBeGreaterThanOrEqual(box.x + 10 - 1e-6);
      expect(t.toX(p.x)).toBeLessThanOrEqual(box.x + box.w - 10 + 1e-6);
      expect(t.toY(p.y)).toBeGreaterThanOrEqual(box.y + 10 - 1e-6);
      expect(t.toY(p.y)).toBeLessThanOrEqual(box.y + box.h - 10 + 1e-6);
    }
  });

  it('preserves ASPECT — a stretched drawing cannot be measured', () => {
    // a wide, short set of points in a wide, short box: if aspect were not
    // preserved the two axes would get different scales
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 1 },
    ];
    const t = fitToBox(pts, box, 10);
    const sx = (t.toX(10) - t.toX(0)) / 10;
    const sy = (t.toY(1) - t.toY(0)) / 1;
    expect(Math.abs(sx)).toBeCloseTo(Math.abs(sy), 6);
  });

  it('centres the drawing rather than jamming it into a corner', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 1 },
    ];
    const t = fitToBox(pts, box, 10);
    const left = t.toX(0) - box.x;
    const right = box.x + box.w - t.toX(10);
    expect(left).toBeCloseTo(right, 6);
  });

  it('unitsPerMetre is the scale a bar must draw', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const t = fitToBox(pts, box, 10);
    // a 1 m bar spans exactly one world unit on the sheet
    expect(t.toX(1) - t.toX(0)).toBeCloseTo(t.unitsPerMetre, 6);
  });

  it('survives an empty set and a degenerate one instead of dividing by zero', () => {
    expect(() => fitToBox([], box)).not.toThrow();
    const same = [{ x: 3, y: 3 }, { x: 3, y: 3 }];
    const t = fitToBox(same, box);
    expect(Number.isFinite(t.toX(3))).toBe(true);
    expect(Number.isFinite(t.toY(3))).toBe(true);
  });
});

describe('projectMembers', () => {
  it('keeps the kind so the sheet can style by member class', () => {
    const out = projectMembers(
      [{ a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, kind: 'rafter' }],
      isoProject,
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('rafter');
    expect(out[0].a).toEqual({ x: 0, y: 0 });
  });
});
