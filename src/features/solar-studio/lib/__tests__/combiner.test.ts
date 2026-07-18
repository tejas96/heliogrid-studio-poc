// ─── String-combiner planning for central / C&I topology (30e-model) ────────
import { describe, expect, it } from 'vitest';
import { combinerPlan } from '../electrical/combiner';
import { dcFuseA } from '../electrical-sizing';
import { PANEL_DB } from '../../data/panels';
import type { StringDef } from '../../types';

const panel = PANEL_DB[0];
const mkStrings = (n: number): StringDef[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `str_${i}`,
    name: `S${i + 1}`,
    inverterIndex: 0,
    mpptIndex: 0,
    panelIds: [`p${i}`],
    color: '#000',
  }));

describe('combinerPlan', () => {
  it('refuses when there are no strings', () => {
    expect(combinerPlan([], panel).ok).toBe(false);
  });

  it('a small array fits ONE combiner; every string is assigned once', () => {
    const p = combinerPlan(mkStrings(8), panel);
    expect(p.ok).toBe(true);
    expect(p.boxes.length).toBe(1);
    expect(p.boxes[0].inputCount).toBe(8);
    expect(p.boxes.reduce((s, b) => s + b.inputCount, 0)).toBe(8); // Σ inputs === strings
  });

  it('splits into balanced boxes past the per-box limit (28 strings, 12/box ⇒ 3 boxes)', () => {
    const p = combinerPlan(mkStrings(28), panel);
    expect(p.ok).toBe(true);
    expect(p.boxes.length).toBe(3); // ceil(28/12)
    expect(p.boxes.every((b) => b.inputCount <= 12)).toBe(true);
    expect(p.boxes.reduce((s, b) => s + b.inputCount, 0)).toBe(28); // reconciles
    // balanced: no box holds more than one extra string vs another
    const counts = p.boxes.map((b) => b.inputCount);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('fuses each string at the gPV ladder rating and sizes the combined output', () => {
    const p = combinerPlan(mkStrings(6), panel);
    expect(p.stringFuseA).toBe(dcFuseA(panel));
    // output current = strings × Isc × 1.25 (continuous duty)
    expect(p.boxes[0].outputCurrentA).toBeCloseTo(6 * panel.iscA * 1.25, 1);
  });
});
