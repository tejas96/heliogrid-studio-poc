// ─── Characterization tests: the money/electrical path (Phase 4 gate) ──────
// Written in Phase 4 to PIN CURRENT BEHAVIOR, including the known defects, so
// that Phase 9's rewrite had a before/after contract. Phase 9 has now landed:
// the two tests that pinned the over-long-string bug assert the FIX, and the
// refusal path lives in autostring.test.ts. `autoString` here is the legacy
// shim over lib/electrical/autostring.ts.
import { describe, expect, it } from 'vitest';
import { autoString, stringSizing, validateSystem, vocAtTemp } from '../stringing';
import type { DesignTemps } from '../electrical/temps';
import { fixturePanels } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';

// The legacy engine hardcoded 5 °C / 70 °C for every site on earth. These
// characterization tests were written against that pair, so pin it EXPLICITLY
// here: what they check (the window maths) is unchanged by Phase 9 sourcing
// real site temps — only where the numbers come from moved.
const TEMPS: DesignTemps = {
  minAmbientC: 5,
  maxAmbientC: 40,
  maxCellC: 70,
  minCellC: 5,
  source: 'assumed',
  note: 'legacy hardcoded pair (test fixture)',
};

const panel = PANEL_DB.find((p) => p.id === 'pnl_ada540')!; // Voc 49.5, −0.27%/°C
const inverter = INVERTER_DB.find((i) => i.id === 'inv_gr10')!; // maxDc 1100, MPPT 160–950V

describe('vocAtTemp / stringSizing (temperature window)', () => {
  it('cold Voc rises above STC (hand-check: 49.5V·(1+0.0027·20) = 52.17V @5°C)', () => {
    expect(vocAtTemp(panel, 5)).toBeCloseTo(49.5 * (1 + 0.0027 * 20), 3);
    expect(vocAtTemp(panel, 25)).toBeCloseTo(49.5, 6);
  });

  it('max string length respects BOTH inverter maxDcV and MPPT ceiling at cold Voc', () => {
    const s = stringSizing(panel, inverter, TEMPS);
    const vocCold = vocAtTemp(panel, 5);
    expect(s.maxPanels).toBe(Math.floor(Math.min(1100, 950) / vocCold)); // 18
    expect(s.maxPanels * vocCold).toBeLessThanOrEqual(1100);
    expect(s.minPanels).toBeGreaterThanOrEqual(1);
  });
});

describe('autoString (current behavior — Phase 9 rewrite contract)', () => {
  it('strings only ENABLED panels, covering each exactly once', () => {
    const panels = fixturePanels(12);
    panels[3].enabled = false;
    const strings = autoString(panels, panel, inverter, 1, TEMPS);
    const ids = strings.flatMap((s) => s.panelIds);
    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
    expect(ids).not.toContain(panels[3].id);
  });

  it('every string fits the temperature-derived max length when slots suffice', () => {
    const panels = fixturePanels(40);
    const strings = autoString(panels, panel, inverter, 2, TEMPS); // 4 MPPT slots
    const { maxPanels } = stringSizing(panel, inverter, TEMPS);
    for (const s of strings) expect(s.panelIds.length).toBeLessThanOrEqual(maxPanels);
    // MPPT assignment stays within the available slots
    for (const s of strings) {
      expect(s.inverterIndex).toBeLessThan(2);
      expect(s.mpptIndex).toBeLessThan(inverter.mppt.count);
    }
  });

  it('CLOSED (Phase 9): too few MPPT slots ⇒ legal strings only, never over-long', () => {
    // Was the pinned KNOWN LIMIT: 60 panels on ONE inverter (2 MPPT slots) made
    // 30-in-series — 1470 V cold on a 1100 V inverter — silently. The planner
    // now strings what fits and leaves the rest unstrung + errors (see
    // autostring.test.ts for the refusal itself).
    const panels = fixturePanels(60);
    const strings = autoString(panels, panel, inverter, 1, TEMPS);
    const { maxPanels } = stringSizing(panel, inverter, TEMPS);
    for (const s of strings) expect(s.panelIds.length).toBeLessThanOrEqual(maxPanels);
  });

  it('validateSystem still catches an over-voltage string authored BY HAND', () => {
    // the planner can no longer produce one, but a user dragging panels into a
    // manual string can — the live check must remain the backstop
    const panels = fixturePanels(60);
    const { maxPanels } = stringSizing(panel, inverter, TEMPS);
    const overlong = [
      {
        id: 'str_manual',
        name: 'String 1',
        inverterIndex: 0,
        mpptIndex: 0,
        color: '#000',
        panelIds: panels.slice(0, maxPanels + 5).map((p) => p.id),
      },
    ];
    const issues = validateSystem(overlong, panel, inverter, 1, 60, TEMPS);
    expect(issues.some((i) => i.level === 'error' && i.code === 'voc_high')).toBe(true);
  });

  it('a healthy design produces no error-level issues', () => {
    const panels = fixturePanels(12);
    const strings = autoString(panels, panel, inverter, 1, TEMPS);
    const issues = validateSystem(strings, panel, inverter, 1, 12, TEMPS);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });
});
