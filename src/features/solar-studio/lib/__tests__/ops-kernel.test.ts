import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { defineOp } from '../ops/types';
import { previewOp } from '../ops/run';
import { summarizeImpact } from '../ops/metrics';
import { syncElectrical } from '../derive/electrical-sync';

function proj(): Project {
  const p: Project = {
    ...fixtureProject(12),
    strings: [],
    location: {
      address: 'x',
      latLng: { lat: 18.5, lng: 73.8 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
    inverterPlacements: [{ id: 'invp_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }],
  };
  return syncElectrical(p)!.next;
}

const disableFirst = defineOp<{ n: number }>({
  id: 'test.disable',
  layer: 'layout',
  label: (a) => `Disable ${a.n} modules`,
  apply: (p, a) => ({ panels: p.panels.map((m, i) => (i < a.n ? { ...m, enabled: false } : m)) }),
});

describe('previewOp — the ops kernel gate', () => {
  it('applies the patch, re-derives strings/routes in the same patch, and reports the impact', () => {
    const p = proj();
    const r = previewOp(p, disableFirst, { n: 2 });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.next.panels.filter((m) => m.enabled).length).toBe(10);
    expect(r.impact.delta.modules).toBe(-2);
    expect(r.impact.delta.kwp).toBeLessThan(0);
    const enabled = new Set(r.next.panels.filter((m) => m.enabled).map((m) => m.id));
    expect(r.next.strings.every((s) => s.panelIds.every((id) => enabled.has(id)))).toBe(true);
    expect(r.impact.after.freshness.strings).toBe(true);
    expect(r.impact.after.freshness.routes).toBe(true);
    expect(r.patch.strings).toBeDefined();
    expect(summarizeImpact(r.impact)).toMatch(/Disable 2 modules · modules −2/);
  });
  it('refuses when validate says so and applies nothing', () => {
    const refusing = defineOp<Record<string, never>>({
      id: 'test.refuse',
      layer: 'layout',
      label: () => 'x',
      validate: () => ({ reason: 'locked' }),
      apply: () => ({ panels: [] }),
    });
    expect(previewOp(proj(), refusing, {}).ok).toBe(false);
  });
});
