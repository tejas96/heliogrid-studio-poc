// ─── The gate: the editor's roof fill is additive, capped, and sun-first ────
import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { planRoofFill } from '../roof-fill';
import type { HeatmapResult } from '../solar-heatmap';
import { fixtureProject } from './fixtures/project';

describe('planRoofFill', () => {
  it('fills around the modules already there — never over them, never replacing them', () => {
    const p = fixtureProject(6);
    const spec = p.components.panel!;
    const plan = planRoofFill(p, p.roofs[0], spec)!;
    expect(plan).not.toBeNull();
    expect(plan.count).toBeGreaterThan(10);
    const existing = new Set(p.panels.map((x) => x.id));
    expect(plan.panels.every((x) => !existing.has(x.id))).toBe(true);
    // no new module shares a centre with an old one (the fill avoided them)
    for (const n of plan.panels) {
      for (const o of p.panels) {
        expect(Math.hypot(n.center.x - o.center.x, n.center.y - o.center.y)).toBeGreaterThan(0.5);
      }
    }
    expect(plan.kwp).toBeCloseTo((plan.count * spec.watt) / 1000, 2);
    expect(plan.bestFirst).toBe(false);
  });

  it('a kWp cap keeps the sunniest positions when the roof heatmap is cached, else lattice order', () => {
    const p: Project = { ...fixtureProject(0), panels: [] };
    const spec = p.components.panel!;
    const cap = (4 * spec.watt) / 1000; // exactly four modules
    // a map that is dark on the west half of the roof and bright on the east
    const cells: HeatmapResult['cells'] = [];
    for (let x = -7.75; x <= 7.75; x += 0.5) {
      for (let y = -5.75; y <= 5.75; y += 0.5) {
        cells.push({ world: [x, 0.05, -y], yawRad: 0, monthly: new Array(12).fill(x < 0 ? 0.4 : 1) });
      }
    }
    const heat: HeatmapResult = {
      cells,
      stepM: 0.5,
      monthlyRoofAvg: new Array(12).fill(0.7),
      monthlyRoofHours: new Array(12).fill(6),
      surroundIncluded: false,
    };
    const sunny = planRoofFill(p, p.roofs[0], spec, { capKwp: cap, heat })!;
    expect(sunny.count).toBe(4);
    expect(sunny.bestFirst).toBe(true);
    expect(sunny.panels.every((x) => x.center.x > 0)).toBe(true);
    const blind = planRoofFill(p, p.roofs[0], spec, { capKwp: cap })!;
    expect(blind.count).toBe(4);
    expect(blind.bestFirst).toBe(false);
  });
});
