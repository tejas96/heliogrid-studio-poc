// ─── The gate: one selection model — tables, lasso, subtract, and no toggling ─
import { describe, expect, it } from 'vitest';
import type { PlacedPanel } from '../../types';
import {
  applySelection,
  extendLasso,
  gestureMode,
  panelsInRegion,
  regionIsTap,
  tableOf,
  tapSelection,
} from '../plan-select';

/** Two 2×2 tables side by side plus one loose module: t1 at x 0–1, t2 at x 4–5, loose at (10, 0). */
const panels: PlacedPanel[] = [
  ...[0, 1].flatMap((r) =>
    [0, 1].map((c) => ({ id: `a${r}${c}`, segmentId: 't1', center: { x: c, y: r } })),
  ),
  ...[0, 1].flatMap((r) =>
    [0, 1].map((c) => ({ id: `b${r}${c}`, segmentId: 't2', center: { x: 4 + c, y: r } })),
  ),
  { id: 'loose', center: { x: 10, y: 0 } },
].map((p) => ({ roofId: 'r', orientation: 'portrait', azimuthDeg: 180, tiltDeg: 10, solarAccess: 1, enabled: true, ...p }) as PlacedPanel);

describe('regions', () => {
  it('a box takes modules by centre; a lasso takes what its polygon encloses', () => {
    expect(panelsInRegion(panels, { kind: 'box', a: { x: -0.5, y: -0.5 }, b: { x: 0.5, y: 1.5 } })).toEqual(['a00', 'a10']);
    // a triangle around the left column of t2 only
    const lasso = { kind: 'lasso' as const, points: [{ x: 3.5, y: -0.5 }, { x: 4.5, y: -0.5 }, { x: 4.5, y: 1.5 }, { x: 3.5, y: 1.5 }] };
    expect(panelsInRegion(panels, lasso)).toEqual(['b00', 'b10']);
  });

  it('with the tables target, clipping one corner of a table takes the whole table — and a loose module stays itself', () => {
    const clip = { kind: 'box' as const, a: { x: -0.5, y: -0.5 }, b: { x: 0.5, y: 0.5 } }; // only a00
    expect(panelsInRegion(panels, clip, 'tables').sort()).toEqual(['a00', 'a01', 'a10', 'a11']);
    expect(tableOf(panels, 'b11').sort()).toEqual(['b00', 'b01', 'b10', 'b11']);
    expect(tableOf(panels, 'loose')).toEqual(['loose']);
  });

  it('a tiny box or a two-point lasso is a tap on empty canvas; a lasso grows only with travel', () => {
    expect(regionIsTap({ kind: 'box', a: { x: 0, y: 0 }, b: { x: 0.1, y: 0.1 } })).toBe(true);
    expect(regionIsTap({ kind: 'lasso', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] })).toBe(true);
    const pts = extendLasso(extendLasso([{ x: 0, y: 0 }], { x: 0.05, y: 0 }), { x: 0.5, y: 0 });
    expect(pts).toEqual([{ x: 0, y: 0 }, { x: 0.5, y: 0 }]);
  });
});

describe('modes', () => {
  it('add and subtract are idempotent — the same box twice is the same selection (the 3D bridge used to toggle)', () => {
    const once = applySelection([], ['a00', 'a01'], 'add');
    const twice = applySelection(once, ['a00', 'a01'], 'add');
    expect(twice).toEqual(['a00', 'a01']);
    expect(applySelection(twice, ['a01', 'zzz'], 'subtract')).toEqual(['a00']);
    expect(applySelection(twice, ['b00'], 'replace')).toEqual(['b00']);
  });

  it('a tap toggles in add mode, clears on re-tap in replace mode, and Alt beats Shift beats the sticky mode', () => {
    expect(tapSelection(['a00'], ['a00'], 'add')).toEqual([]);
    expect(tapSelection(['a00'], ['a01'], 'add')).toEqual(['a00', 'a01']);
    expect(tapSelection(['a00'], ['a00'], 'replace')).toEqual([]);
    expect(tapSelection(['a00', 'a01'], ['a00'], 'replace')).toEqual(['a00']);
    expect(tapSelection(['a00', 'a01'], ['a00'], 'subtract')).toEqual(['a01']);
    expect(gestureMode('replace', { shiftKey: true })).toBe('add');
    expect(gestureMode('add', { altKey: true, shiftKey: true })).toBe('subtract');
    expect(gestureMode('subtract', {})).toBe('subtract');
  });
});
