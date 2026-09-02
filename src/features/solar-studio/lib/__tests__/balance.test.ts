// ─── Gate: strings spread across inverters the way a plant is actually sized ─
// The planner used to fill inverter 1 to its last input before touching
// inverter 2 (one unit at Pnom ratio 1.9 beside idle ones). PVsyst balances a
// sub-array's strings over its inverters and checks each inverter's ratio.
import { describe, expect, it } from 'vitest';
import { autoStringPlan } from '../electrical/autostring';
import { assignStrings } from '../electrical/balance';
import { resolveDesignTemps } from '../electrical/temps';
import { stringSizing } from '../electrical/window';
import { validateSystem } from '../stringing';
import { fixtureProject, fixturePanels } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';
import type { PlacedPanel, Project, StringDef } from '../../types';

const panel = PANEL_DB.find((p) => p.id === 'pnl_ada540')!;
const inverter = INVERTER_DB.find((i) => i.id === 'inv_gr10')!; // 2 MPPT

function project(panels: PlacedPanel[]): Project {
  return {
    ...fixtureProject(0),
    panels,
    location: {
      address: 'Pune',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}
const TEMPS = resolveDesignTemps(project([]));
const SIZING = stringSizing(panel, inverter, TEMPS);

describe('inverter balancing (PVsyst-style)', () => {
  it('spreads equal strings evenly, one tracker per string while trackers are free', () => {
    // 6 full-length strings, 3 inverters × 2 MPPT → 2 strings per inverter, each on its own MPPT
    const panels = fixturePanels(6 * SIZING.maxPanels);
    const res = autoStringPlan(project(panels), panel, inverter, 3, TEMPS);
    expect(res.strings).toHaveLength(6);
    const perInverter = [0, 1, 2].map((i) => res.strings.filter((s) => s.inverterIndex === i));
    expect(perInverter.map((x) => x.length)).toEqual([2, 2, 2]);
    for (const list of perInverter) {
      expect(new Set(list.map((s) => s.mpptIndex)).size).toBe(list.length);
    }
  });

  it('largest strings first: an odd string count still leaves loads within one string of each other', () => {
    const planned = [7, 7, 7, 7, 7].map((n, k) => ({
      ids: Array.from({ length: n }, (_, j) => `p${k}_${j}`),
      groupKey: 'g',
    }));
    const { inverterKwp } = assignStrings(planned, panel, inverter, 2, 2);
    expect(Math.max(...inverterKwp) - Math.min(...inverterKwp)).toBeLessThanOrEqual((7 * panel.watt) / 1000 + 1e-9);
  });

  it('validateSystem flags one overloaded inverter even when the fleet total looks fine', () => {
    const ids = fixturePanels(4 * SIZING.maxPanels).map((p) => p.id);
    const chunk = (k: number) => ids.slice(k * SIZING.maxPanels, (k + 1) * SIZING.maxPanels);
    // every string crammed on inverter 1 of 3
    const strings: StringDef[] = [0, 1, 2, 3].map((k) => ({
      id: `s${k}`,
      name: `String ${k + 1}`,
      inverterIndex: 0,
      mpptIndex: k % 2,
      panelIds: chunk(k),
      color: '#000',
    }));
    const issues = validateSystem(strings, panel, inverter, 3, ids.length, TEMPS);
    expect(issues.some((i) => i.code === 'inverter_dc_ac_high')).toBe(true);
    expect(issues.some((i) => i.code === 'inverter_unused')).toBe(true);
  });
});
