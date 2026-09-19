// ─── Gate: pressing "Design it" must not freeze the browser ─────────────────
// The auto-designer scores every candidate POSITION with the real shading
// engine before placing, so a budget keeps the best-lit positions instead of
// the first ones. That is worth doing on a roof and ruinous on a field, and it
// runs inside the click handler, so its cost is frozen browser.
//
// Measured at Bhadla with a neighbourhood height map loaded — the condition
// that matters, since without one there is nothing to raycast and the pass is
// free:
//
//     candidates      scorer
//        768           800 ms
//      3,136         2,983 ms
//     13,200        11,708 ms
//     40,480        30,712 ms
//
// A 23 ha field offers ~58,000 positions. Pressing "Design it" there blocked
// the main thread past 30 s and the tab answered nothing at all.
//
// TIME IS NOT THE GATE. In a test runner there is no height map in the cache,
// so the same scorer costs nothing and a stopwatch assertion would pass while
// the real browser hangs. This pins the DECISION instead: past the limit the
// scorer is not handed to the fill, and the design log says why.
import { describe, expect, it } from 'vitest';
import { autoDesign } from '../auto-design';
import { PANEL_DB } from '../../data/panels';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Project, Roof } from '../../types';

/** A square ground field of `side` metres with a real location, at Bhadla. */
function field(side: number, targetKwp: number): Project {
  const base = fixtureProject(0);
  const panel = PANEL_DB.find((p) => p.widthMm === 1133 && p.lengthMm === 2382) ?? PANEL_DB[0];
  const roof: Roof = {
    ...fixtureRoof(),
    id: 'roof_1',
    roofType: 'ground',
    heightM: 0,
    setbackM: 1.5,
    polygon: [
      { x: -side / 2, y: -side / 2 },
      { x: side / 2, y: -side / 2 },
      { x: side / 2, y: side / 2 },
      { x: -side / 2, y: side / 2 },
    ],
  };
  return {
    ...base,
    location: {
      ...(base.location ?? ({} as NonNullable<Project['location']>)),
      latLng: { lat: 27.49, lng: 71.91 },
    } as NonNullable<Project['location']>,
    info: { ...base.info, groundMount: true },
    components: { ...base.components, panel, targetKwp },
    roofs: [roof],
    panels: [],
    segments: [],
    obstructions: [],
    keepouts: [],
  };
}

describe('a budget on a ROOF still keeps the best-lit positions', () => {
  it('a small site is scored candidate by candidate, as it always was', () => {
    // ~30 m square is a few hundred positions — under a second of scoring, and
    // exactly the case the scorer was written for
    const p = field(30, 40);
    const d = autoDesign(p, 'target_kwp');
    expect(d.panels.length).toBeGreaterThan(0);
    // no "filled in row order" note: the scorer was used
    expect(d.decisions.some((x) => x.id.startsWith('budget-order:'))).toBe(false);
  });
});

describe('a budget on a FIELD does not freeze the browser to do it', () => {
  it('past the limit the scorer is skipped', () => {
    // a 420 m field is ~40,000 positions — 30,712 ms of scoring, measured
    const p = field(420, 5000);
    const d = autoDesign(p, 'target_kwp');
    expect(d.panels.length).toBeGreaterThan(0);
    expect(d.decisions.some((x) => x.id.startsWith('budget-order:'))).toBe(true);
  }, 120_000);

  it('the skip is EXPLAINED, not silent', () => {
    // "every automated decision explainable" — the log is rendered verbatim by
    // the "why this layout?" sheet, so a layout chosen by position rather than
    // by sun has to say so, and has to say what to do about it
    const d = autoDesign(field(420, 5000), 'target_kwp');
    const note = d.decisions.find((x) => x.id.startsWith('budget-order:'));
    expect(note).toBeTruthy();
    expect(note!.choice).toMatch(/row order/i);
    // it must name the numbers behind the decision, not just assert it
    expect(note!.inputs.join(' ')).toMatch(/candidates=\d+/);
    expect(note!.inputs.join(' ')).toMatch(/scoringLimit=\d+/);
    // and point at the recourse
    expect(note!.reason).toMatch(/provisional|heat map/i);
  }, 120_000);

  it('a field the budget does NOT truncate is never flagged', () => {
    // nothing is discarded, so nothing had to be chosen — the note would be a
    // warning about a decision that was never taken
    const p = field(420, 999_999);
    const d = autoDesign(p, 'target_kwp');
    expect(d.decisions.some((x) => x.id.startsWith('budget-order:'))).toBe(false);
  }, 120_000);

  it('skipping the scorer still fills to the budget', () => {
    // the guard must change WHICH positions are kept, never HOW MANY
    const spec = PANEL_DB.find((x) => x.widthMm === 1133 && x.lengthMm === 2382) ?? PANEL_DB[0];
    const targetKwp = 5000;
    const d = autoDesign(field(420, targetKwp), 'target_kwp');
    const budgetPanels = Math.floor((targetKwp * 1000) / spec.watt);
    expect(d.panels.length).toBe(budgetPanels);
  }, 120_000);
});
