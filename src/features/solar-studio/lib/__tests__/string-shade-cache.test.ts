// ─── The gate: the plant's electrical shading loss is CACHE-DEPENDENT ───────
//
// `electricalShadingLossPct` returns null whenever the full shade profile is
// not in memory, and lib/energy/report.ts then omits the "Shading — electrical
// (strings)" line from the report ENTIRELY — a real loss term, silently gone.
//
// The profile lives only in lib/shade-profile-cache (module-level, deliberately
// not persisted: it is one Float32Array per module per sun sample). So every
// full page load starts cold, and a screen that renders the report ONCE, from a
// cold cache, quotes a different annual yield for the same design and never
// heals — nothing on the project changes when the profile later lands, so React
// is never told to re-render.
//
// That shipped: /proposal opened by URL read 19.9 MWh where clicking through to
// it read 20.1 MWh, with no provisional marker on a customer-facing document.
// The fix is in ProposalView (useShadeProfileVersion + a shade note on the
// FreshnessBanner). This test pins the COUPLING that makes such a subscription
// mandatory: if it ever stops holding, the report has stopped depending on the
// cache and the subscription can go too.
import { describe, expect, it, beforeEach } from 'vitest';
import { electricalShadingLossPct } from '../string-shade';
import { setShadeProfile, type ShadeProfile } from '../shade-profile-cache';
import type { Project } from '../../types';

const FP = 'test-fingerprint';

/** Two modules on one string. `a` is clear all year, `b` is half shaded — in
 *  series that costs MORE than the average of the two, which is the whole
 *  point of the electrical (string) term. */
function profile(): ShadeProfile {
  const samples = [
    { month: 3, hour: 9, weight: 1 },
    { month: 3, hour: 12, weight: 1 },
  ];
  return {
    samples,
    bySample: new Map([
      ['a', Float32Array.from([1, 1])],
      ['b', Float32Array.from([0.4, 1])],
    ]),
    byCaster: new Map(),
    access: new Map([
      ['a', 1],
      ['b', 0.7],
    ]),
  };
}

const project = {
  derived: { solarAccessFp: FP },
  strings: [{ id: 's1', panelIds: ['a', 'b'] }],
  location: null,
} as unknown as Project;

describe('electricalShadingLossPct — cache-dependent, by design', () => {
  beforeEach(() => {
    // a fingerprint nothing asks for = the cold-cache state after a page load
    setShadeProfile('some-other-design', profile());
  });

  it('returns null when the profile for THIS design is not in memory', () => {
    expect(electricalShadingLossPct(project)).toBeNull();
  });

  it('returns a real loss once the profile lands — same project object', () => {
    setShadeProfile(FP, profile());
    const pct = electricalShadingLossPct(project);
    expect(pct).not.toBeNull();
    expect(pct!).toBeGreaterThan(0);
  });
});
