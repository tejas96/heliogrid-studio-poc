import { describe, expect, it } from 'vitest';
import type { CableRoute, Project, StringDef } from '../../types';
import { acCableLossAtFullLoad, AC_ASSUMED_FRAC, dcCableLossAtStc, DC_ASSUMED_FRAC } from '../energy/cable-loss';
import { dcCableSizeMm2 } from '../electrical-sizing';
import { fixtureProject } from './fixtures/project';

function leg(id: string, from: string, lengthM: number): CableRoute {
  return {
    id,
    kind: 'string_homerun',
    fromRef: from,
    toRef: 'inverter/0',
    waypoints: [
      { x: 0, y: 0 },
      { x: lengthM, y: 0 },
    ],
    verticalDropM: 0,
    slackPct: 0,
  };
}

describe('cable loss from the real runs', () => {
  const base = fixtureProject(8);
  const spec = base.components.panel!;
  const strings: StringDef[] = [
    { id: 'str_a', name: 'String 1', inverterIndex: 0, mpptIndex: 0, panelIds: base.panels.slice(0, 4).map((p) => p.id), color: '#000' },
    { id: 'str_b', name: 'String 2', inverterIndex: 0, mpptIndex: 1, panelIds: base.panels.slice(4, 8).map((p) => p.id), color: '#000' },
  ];

  it('is I²R over both conductors against the string power, power-weighted over the array', () => {
    const p: Project = { ...base, strings, cableRoutes: [leg('a+', 'str_a', 30), leg('a-', 'str_a', 30), leg('b+', 'str_b', 10), leg('b-', 'str_b', 10)] };
    const r = dcCableLossAtStc(p);
    const mm2 = dcCableSizeMm2(spec);
    const rho = 0.0172 * (1 + 0.00393 * 25);
    const pString = 4 * spec.watt;
    const lossA = spec.impA * spec.impA * ((rho * 60) / mm2);
    const lossB = spec.impA * spec.impA * ((rho * 20) / mm2);
    expect(r.source).toBe('routes');
    expect(r.stringsRouted).toBe(2);
    expect(r.conductorM).toBe(80);
    expect(r.fraction).toBeCloseTo((lossA + lossB) / (2 * pString), 6);
    // a longer run loses more: the 30 m string alone is three times the 10 m one
    expect(lossA / lossB).toBeCloseTo(3, 6);
  });

  it('a string without both legs keeps the assumed figure for its share; no runs at all = assumed', () => {
    const p: Project = { ...base, strings, cableRoutes: [leg('a+', 'str_a', 30), leg('a-', 'str_a', 30)] };
    const r = dcCableLossAtStc(p);
    expect(r.stringsRouted).toBe(1);
    expect(r.fraction).toBeGreaterThan(0);
    const none = dcCableLossAtStc({ ...base, strings, cableRoutes: [] });
    expect(none.source).toBe('assumed');
    expect(none.fraction).toBe(DC_ASSUMED_FRAC);
    expect(acCableLossAtFullLoad({ ...base, cableRoutes: [] })).toEqual({ fraction: AC_ASSUMED_FRAC, source: 'assumed', runs: 0 });
  });
});
