// lib/__tests__/derive-memo.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { memoByKey } from '../derive/memo';

function proj(): Project {
  return { ...fixtureProject(8), location: { address: 'x', latLng: { lat: 18.5, lng: 73.8 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' } };
}

describe('memoByKey', () => {
  it('returns the same reference for the same key and recomputes on a new key', () => {
    let calls = 0;
    const f = memoByKey((p: Project) => String(p.panels.length), (p) => { calls++; return { n: p.panels.length }; });
    const a = proj();
    expect(f(a)).toBe(f({ ...a })); // structurally equal clone hits the cache
    expect(calls).toBe(1);
    f({ ...a, panels: a.panels.slice(1) });
    expect(calls).toBe(2);
  });
  it('keeps the last N keys (two projects alternating do not thrash)', () => {
    let calls = 0;
    const f = memoByKey((p: Project) => p.id, () => ++calls, 4);
    const a = proj();
    const b = { ...proj(), id: 'prj_other' };
    f(a); f(b); f(a); f(b);
    expect(calls).toBe(2);
  });
});
