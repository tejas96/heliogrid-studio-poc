import { describe, expect, it } from 'vitest';
import type { CableRoute, Project, StringDef } from '../../types';
import { acCableLossAtFullLoad, AC_ASSUMED_FRAC, dcCableLossAtStc, DC_ASSUMED_FRAC } from '../energy/cable-loss';
import { dcLoopResistanceOhm, sizeDcCable } from '../electrical-sizing';
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

  it('is I²R over each string’s loop at the size that string was given, power-weighted over the array', () => {
    const p: Project = { ...base, strings, cableRoutes: [leg('a+', 'str_a', 30), leg('a-', 'str_a', 30), leg('b+', 'str_b', 10), leg('b-', 'str_b', 10)] };
    const r = dcCableLossAtStc(p);
    const pString = 4 * spec.watt;
    const a = sizeDcCable(spec, 4, 60);
    const b = sizeDcCable(spec, 4, 20);
    const lossA = spec.impA * spec.impA * dcLoopResistanceOhm(60, a.mm2);
    const lossB = spec.impA * spec.impA * dcLoopResistanceOhm(20, b.mm2);
    expect(r.source).toBe('routes');
    expect(r.stringsRouted).toBe(2);
    expect(r.conductorM).toBe(80);
    expect(r.fraction).toBeCloseTo((lossA + lossB) / (2 * pString), 6);
    // the long loop on a short (low-voltage) string was sized UP for the drop;
    // the short loop stays on the fuse-rated size — and the label names both
    expect(a.governedBy).toBe('voltage-drop');
    expect(a.mm2).toBeGreaterThan(b.mm2);
    expect(r.sizes).toBe(`${b.mm2} + ${a.mm2}`);
  });

  it('a string with no run yet keeps the assumed figure for its share; no runs at all = assumed', () => {
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
