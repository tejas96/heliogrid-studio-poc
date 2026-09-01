// lib/__tests__/electrical-sync.test.ts
//
// Minimal coverage per owner directive: two cases only (unstamped-project
// derivation + stamping, and inverter-move re-routing without re-stringing).
// The brief's fuller suite (manual-string survival, resetStringsToAuto,
// idempotent re-stamping) is intentionally not included here.
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { syncElectrical } from '../derive/electrical-sync';
import { areRoutesFresh, isStringsFresh } from '../derive/freshness';
import { inverterWorldPos } from '../routing';

function proj(): Project {
  const p = fixtureProject(12);
  return {
    ...p,
    strings: [],
    location: { address: 'Pune', latLng: { lat: 18.52, lng: 73.85 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' },
    inverterPlacements: [{ id: 'invp_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }],
  };
}

describe('syncElectrical', () => {
  it('derives strings and routes for an unstamped project and stamps both', () => {
    const p = proj();
    const r = syncElectrical(p)!;
    expect(r).not.toBeNull();
    expect(r.next.strings.length).toBeGreaterThan(0);
    expect((r.next.cableRoutes ?? []).length).toBe(r.next.strings.length * 2);
    expect(isStringsFresh(r.next)).toBe(true);
    expect(areRoutesFresh(r.next)).toBe(true);
    expect(r.report).toMatchObject({ restrung: true, rerouted: true });
  });
  it('moving the inverter re-routes without re-stringing', () => {
    const fresh = syncElectrical(proj())!.next;
    const moved: Project = { ...fresh, inverterPlacements: [{ ...fresh.inverterPlacements[0], edgeIndex: 2 }] };
    const r = syncElectrical(moved)!;
    expect(r.report.restrung).toBe(false);
    expect(r.report.rerouted).toBe(true);
    const target = inverterWorldPos(moved, 0)!;
    const end = r.next.cableRoutes![0].waypoints.at(-1)!;
    expect(end.x).toBeCloseTo(target.x, 6);
    expect(end.y).toBeCloseTo(target.y, 6);
  });
});
