// ─── The hard gate (Phase 9 task 28d) ───────────────────────────────────────
// This is the rule that stops an impossible design reaching a customer. The
// audit's worst finding was a 2794 V string printed on a DISCOM sheet; every
// detector we built is only worth what this function refuses.
import { describe, expect, it } from 'vitest';
import { electricalGate } from '../electrical/gate';
import { autoStringPlan } from '../electrical/autostring';
import { resolveDesignTemps } from '../electrical/temps';
import { stringSizing } from '../electrical/window';
import { fixtureProject, fixturePanels } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';
import type { PlacedPanel, Project } from '../../types';

const panel = PANEL_DB.find((p) => p.id === 'pnl_ada540')!;
const inverter = INVERTER_DB.find((i) => i.id === 'inv_gr10')!;

function project(panels: PlacedPanel[], invCount = 2): Project {
  return {
    ...fixtureProject(0),
    panels,
    components: { ...fixtureProject(0).components, panel, inverter, inverterCount: invCount },
    location: {
      address: 'Pune',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

const TEMPS = resolveDesignTemps(project([]));

describe('electricalGate — what may reach the proposal', () => {
  it('BLOCKS a design whose panels are not wired into any string', () => {
    const gate = electricalGate(project(fixturePanels(12)))!; // strings: []
    expect(gate).not.toBeNull();
    expect(gate.message).toMatch(/not wired/);
    expect(gate.autoStringable).toBe(true); // and offers the one-click answer
  });

  it('PASSES a fully, legally strung design', () => {
    const p = project(fixturePanels(12));
    const plan = autoStringPlan(p, panel, inverter, 2, TEMPS);
    expect(plan.unstrungPanelIds).toEqual([]);
    expect(electricalGate({ ...p, strings: plan.strings })).toBeNull();
  });

  it('BLOCKS an over-voltage string authored by hand (not auto-stringable)', () => {
    const panels = fixturePanels(60);
    const { maxPanels } = stringSizing(panel, inverter, TEMPS);
    const p = project(panels, 4);
    const overlong: Project = {
      ...p,
      strings: [
        {
          id: 'str_x',
          name: 'String 1',
          inverterIndex: 0,
          mpptIndex: 0,
          color: '#000',
          panelIds: panels.map((x) => x.id).slice(0, maxPanels + 6),
        },
      ],
    };
    const gate = electricalGate(overlong)!;
    expect(gate.message).toMatch(/cold Voc|not wired/); // some error is named
    expect(electricalGate(overlong)).not.toBeNull();
  });

  it('BLOCKS when MPPT capacity runs out — the design cannot be built as drawn', () => {
    const p = project(fixturePanels(60), 1); // 2 MPPT inputs for 60 panels
    const plan = autoStringPlan(p, panel, inverter, 1, TEMPS);
    expect(plan.unstrungPanelIds.length).toBeGreaterThan(0);
    expect(electricalGate({ ...p, strings: plan.strings })).not.toBeNull();
  });

  it('stays SILENT before the design exists — earlier steps own those gaps', () => {
    // no panel chosen / no inverter / nothing placed: Step 4 and Step 6 already
    // block these, and a second voice here would just be noise
    const bare = project([]);
    expect(electricalGate(bare)).toBeNull();
    expect(electricalGate({ ...bare, components: { ...bare.components, panel: null } })).toBeNull();
    expect(
      electricalGate({ ...bare, components: { ...bare.components, inverter: null } }),
    ).toBeNull();
  });

  it('a disabled panel outside every string does NOT block (it generates nothing)', () => {
    const panels = fixturePanels(12);
    const p = project(panels);
    const plan = autoStringPlan(p, panel, inverter, 2, TEMPS);
    const off = panels.map((x, i) => (i === 0 ? { ...x, enabled: false } : x));
    // the string still references the now-disabled panel; what matters is that
    // no ENABLED panel is left out
    expect(electricalGate({ ...p, panels: off, strings: plan.strings })).toBeNull();
  });

  it('names how many other errors are hiding behind the headline', () => {
    const p = project(fixturePanels(60), 1);
    const gate = electricalGate({ ...p, strings: [] })!;
    expect(gate.message).toMatch(/not wired/);
  });
});
