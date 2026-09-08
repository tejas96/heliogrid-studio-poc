// ─── Gate: a strip drawn OVER a finished array removes those modules ────────
// Placement-time avoidance already existed, but it only runs when a fill runs.
// Drawing the access route AFTER the layout is the normal order of work, and it
// was exactly when we said nothing: the buried modules stayed enabled and kept
// counting toward kWp, energy, the BOM and the quote. This gate is the money
// one — it asserts the impact the op reports, not just the flag it sets.
import { describe, expect, it } from 'vitest';
import type { Project, Walkway } from '../../types';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { previewOp } from '../ops/run';
import { walkwayAdd, walkwayRemove } from '../ops/site-ops';
import { fixtureProject, fixtureRoof } from './fixtures/project';

/** The fixture roof, filled edge to edge, with no obstruction on it. */
function filledRoof(): Project {
  const base: Project = {
    ...fixtureProject(0),
    roofs: [fixtureRoof()],
    obstructions: [],
    walkways: [],
    keepouts: [],
    panels: [],
    segments: [],
    strings: [],
  };
  const filled = fillRoofAsSegment(base, base.roofs[0], base.components.panel!, DEFAULT_FILL)!;
  return { ...base, segments: [filled.segment], panels: filled.panels };
}

/** A 1 m corridor straight across the middle of the roof. */
const corridor: Walkway = {
  id: 'wk_1',
  roofId: 'roof_1',
  a: { x: -20, y: 0 },
  b: { x: 20, y: 0 },
  widthMm: 1000,
  heightMm: 100, // the editor's own default for a walkway strip
};

const live = (p: Project) => p.panels.filter((x) => x.enabled).length;

describe('walkway drawn over a live array', () => {
  it('turns the buried modules off, and the op REPORTS the lost kWp', () => {
    const p = filledRoof();
    expect(live(p)).toBeGreaterThan(0);

    const r = previewOp(p, walkwayAdd, { walkway: corridor });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // the modules under the corridor are off ...
    expect(live(r.next)).toBeLessThan(live(p));
    // ... marked with what buried them, so removing it brings them back ...
    const buried = r.next.panels.filter((x) => x.blockedBy === corridor.id);
    expect(buried.length).toBe(live(p) - live(r.next));
    expect(buried.every((x) => !x.enabled)).toBe(true);
    // ... and the loss reaches every number the customer is shown. This is the
    // point of the item: before, the buried modules kept counting.
    expect(r.impact.delta.modules).toBe(-buried.length);
    expect(r.impact.delta.kwp).toBeLessThan(0);
    expect(r.impact.delta.annualKwh).toBeLessThan(0);
    expect(r.impact.delta.bomTotalInr).toBeLessThan(0);
  });

  it('removing the walkway restores exactly the modules it buried', () => {
    const p = filledRoof();
    const added = previewOp(p, walkwayAdd, { walkway: corridor });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    const removed = previewOp(added.next, walkwayRemove, { id: corridor.id });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;

    expect(live(removed.next)).toBe(live(p));
    expect(removed.next.panels.some((x) => x.blockedBy === corridor.id)).toBe(false);
  });

  it('a module the USER switched off is not switched back on', () => {
    const p = filledRoof();
    const victim = p.panels[0].id;
    const withOff: Project = {
      ...p,
      panels: p.panels.map((x) => (x.id === victim ? { ...x, enabled: false } : x)),
    };
    const r = previewOp(withOff, walkwayAdd, { walkway: corridor });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // no `blockedBy` means it was the user's call — the resolver leaves it alone
    expect(r.next.panels.find((x) => x.id === victim)!.enabled).toBe(false);
  });
});
