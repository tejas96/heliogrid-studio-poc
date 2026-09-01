// lib/__tests__/freshness.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import {
  areRoutesFresh,
  designFreshness,
  isStringsFresh,
  routesInputFp,
  stringsInputFp,
} from '../derive/freshness';
import { normalizeProject } from '../persistence/normalize';

function proj(): Project {
  return {
    ...fixtureProject(8),
    location: {
      address: 'Pune, MH',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

describe('strings input fingerprint', () => {
  it('changes when a module is disabled, when the inverter changes, and when a shade tier crosses a threshold', () => {
    const base = proj();
    const a = stringsInputFp(base);
    const disabled = { ...base, panels: base.panels.map((p, i) => (i === 0 ? { ...p, enabled: false } : p)) };
    expect(stringsInputFp(disabled)).not.toBe(a);
    const inv = { ...base, components: { ...base.components, inverterCount: 2 } };
    expect(stringsInputFp(inv)).not.toBe(a);
    const shaded = { ...base, panels: base.panels.map((p, i) => (i === 0 ? { ...p, solarAccess: 0.5 } : p)) };
    expect(stringsInputFp(shaded)).not.toBe(a);
  });
  it('does NOT change when solar access moves within the same tier', () => {
    const base = proj();
    const a = stringsInputFp(base);
    const nudged = { ...base, panels: base.panels.map((p) => ({ ...p, solarAccess: 0.97 })) };
    expect(stringsInputFp(nudged)).toBe(a);
  });
  it('does NOT change when auto strings change, but DOES when a manual string is added', () => {
    const base = proj();
    const a = stringsInputFp(base);
    const restrung = { ...base, strings: [] };
    expect(stringsInputFp(restrung)).toBe(a);
    const manual = { ...base, strings: [{ ...base.strings[0], manual: true as const }] };
    expect(stringsInputFp(manual)).not.toBe(a);
  });
});

describe('routes input fingerprint', () => {
  it('changes when an inverter placement moves and when the meter is placed', () => {
    const base: Project = {
      ...proj(),
      inverterPlacements: [{ id: 'invp_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }],
    };
    const a = routesInputFp(base);
    const moved = { ...base, inverterPlacements: [{ ...base.inverterPlacements[0], t: 0.9 }] };
    expect(routesInputFp(moved)).not.toBe(a);
    const meter = { ...base, gridConnection: { pos: { x: 20, y: 20 } } };
    expect(routesInputFp(meter)).not.toBe(a);
  });
});

describe('freshness checks', () => {
  it('a project with no stamps is not fresh; a stamped one is', () => {
    const p = proj();
    expect(isStringsFresh(p)).toBe(false);
    expect(areRoutesFresh(p)).toBe(false);
    const stamped: Project = {
      ...p,
      derived: { ...p.derived, stringsFp: stringsInputFp(p), routesFp: routesInputFp(p) },
    };
    expect(isStringsFresh(stamped)).toBe(true);
    expect(areRoutesFresh(stamped)).toBe(true);
  });
  it('designFreshness.all needs shading, strings and routes together', () => {
    const p = proj();
    const f = designFreshness(p);
    expect(f.all).toBe(false);
    expect(f.strings).toBe(false);
  });
  it('a project without a panel or inverter is trivially fresh', () => {
    const p = { ...proj(), components: { ...proj().components, inverter: null } };
    expect(isStringsFresh(p)).toBe(true);
    expect(areRoutesFresh(p)).toBe(true);
  });
});

describe('normalize migration', () => {
  it('a saved project without the stamp fields keeps its strings and is stamped CURRENT', () => {
    const p = proj();
    const stored = JSON.parse(JSON.stringify(p));
    delete stored.derived.stringsFp;
    delete stored.derived.routesFp;
    const loaded = normalizeProject(stored);
    expect(loaded.strings).toEqual(p.strings);
    expect(loaded.derived.stringsFp).toBe(stringsInputFp(loaded));
    // no routes stored ⇒ nothing to trust ⇒ re-derive on first open
    expect(loaded.derived.routesFp).toBeNull();
  });
  it('a saved project that carries stringsFp: null stays null (it asked to re-derive)', () => {
    const stored = JSON.parse(JSON.stringify({ ...proj(), derived: { ...proj().derived, stringsFp: null, routesFp: null } }));
    const loaded = normalizeProject(stored);
    expect(loaded.derived.stringsFp).toBeNull();
  });
});
