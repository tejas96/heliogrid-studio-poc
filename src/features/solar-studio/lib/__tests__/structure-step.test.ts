// ─── Gate: Structure & BOM keeps its two promises ───────────────────────────
// 1. Its type cards change what holds a table up, never where the modules
//    point — tilt is the editor's.
// 2. The cut list and the take-off weigh the SAME steel the BOM prices.
import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { applyStructChoice } from '../structure-edit';
import { projectStructures } from '../structure';
import { cutList, steelTakeoff } from '../structure-step';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { fixtureProject, fixtureRoof } from './fixtures/project';

function tiltedProject(tiltDeg: number): Project {
  const p = { ...fixtureProject(0), roofs: [fixtureRoof()] };
  const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, { ...DEFAULT_FILL, maxPanels: 6 })!;
  const base = { ...p, segments: [filled.segment], panels: filled.panels };
  const lifted = applyStructChoice(base, filled.segment.id, { kind: 'preset', preset: 'standard' })!;
  const atTilt = applyStructChoice({ ...base, ...lifted }, filled.segment.id, { kind: 'tilt', tiltDeg })!;
  return { ...base, ...lifted, ...atTilt };
}

describe('Structure & BOM', () => {
  it('walk-under raises the table and keeps the editor’s tilt', () => {
    const p = tiltedProject(15);
    const r = applyStructChoice(p, p.segments[0].id, { kind: 'height', height: 'walkunder' })!;
    const seg = r.segments[0];
    expect(seg.racking.kind).toBe('fixed_tilt');
    if (seg.racking.kind !== 'flush') {
      expect(seg.racking.tiltDeg).toBe(15);
      expect(seg.racking.clearanceM).toBe(2.2);
    }
  });

  it('the cut list sums to the net steel the BOM weighs', () => {
    const p = tiltedProject(10);
    const structures = projectStructures(p);
    const net = steelTakeoff(structures).netKg;
    const cut = cutList(structures).reduce((a, r) => a + r.kg, 0);
    expect(net).toBeGreaterThan(0);
    // steelKg is rounded per table; the cut list is not
    expect(Math.abs(cut - net)).toBeLessThan(0.1);
  });
});
