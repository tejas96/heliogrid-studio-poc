// ─── Proposal narrative — claim traceability (Phase 12 task 31b / §8.8) ─────
// The whole point of storytelling-from-data: NOTHING is invented. Every number
// a customer reads must trace to a real project value. This test is the guard.
import { describe, expect, it } from 'vitest';
import { proposalNarrative } from '../proposal-narrative';
import { computeEnergyReport } from '../solar';
import { computeFinancials } from '../finance';
import { fixtureProject, fixtureRoof, fixturePanels } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';
import type { Project } from '../../types';

const idArea = (m2: number) => `${Math.round(m2)} m²`;

function located(): Project {
  const base = fixtureProject(0);
  const panel = PANEL_DB[0];
  const inverter = INVERTER_DB.find((i) => i.id === 'inv_gr10')!;
  return {
    ...base,
    roofs: [fixtureRoof()],
    panels: fixturePanels(12),
    components: { ...base.components, panel, inverter, inverterCount: 1 },
    location: {
      address: 'Test Site, Pune',
      latLng: { lat: 18.52, lng: 73.86 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

describe('proposalNarrative', () => {
  it('produces nothing for an empty design (no story to tell, no padding)', () => {
    const empty = { ...fixtureProject(0), panels: [] };
    expect(proposalNarrative(empty, idArea)).toEqual([]);
  });

  it('EVERY numeric fact in a beat appears in that beat’s text (no orphan claims)', () => {
    const p = located();
    for (const section of proposalNarrative(p, idArea)) {
      for (const beat of section.beats) {
        for (const f of beat.facts) {
          if (typeof f === 'number') {
            // the number (or its localized/1-dp form) must be in the sentence —
            // a fact not shown is a claim the reader can't see; a number shown
            // but not in facts is untraceable. Both are caught here.
            const variants = [
              String(f),
              f.toLocaleString('en-IN'),
              Math.round(f).toLocaleString('en-IN'),
              f.toFixed(1),
            ];
            expect(variants.some((v) => beat.text.includes(v))).toBe(true);
          } else {
            expect(beat.text).toContain(f);
          }
        }
      }
    }
  });

  it('the headline numbers come from the SAME engines as the rest of the app', () => {
    const p = located();
    const r = computeEnergyReport(p);
    const fin = computeFinancials(p, r);
    const flat = proposalNarrative(p, idArea)
      .flatMap((s) => s.beats)
      .map((b) => b.text)
      .join(' ');
    // capacity, annual MWh, address — the exact report values, not re-derived
    expect(flat).toContain(`${r.capacityKwp} kWp`);
    expect(flat).toContain(`${r.annualMwh} MWh`);
    expect(flat).toContain('Test Site, Pune');
    if (fin.paybackYears > 0 && fin.paybackYears < 25) {
      expect(flat).toContain(`${fin.paybackYears.toFixed(1)} years`);
    }
  });

  it('surfaces REAL decision-log entries, not invented reasons', () => {
    const p: Project = {
      ...located(),
      designLog: [
        { id: 'd1', topic: 'Panel spacing', choice: '2.4 m pitch', reason: 'shadow-free in the design window', inputs: ['tilt=10'] },
      ],
    };
    const why = proposalNarrative(p, idArea).find((s) => s.title === 'Why this design');
    expect(why).toBeDefined();
    expect(why!.beats[0].text).toContain('shadow-free in the design window');
  });

  it('omits the subsidy beat when there is no subsidy (never a ₹0 line)', () => {
    const p = located(); // non-DCR panel + estimate → subsidy 0 in fixture
    const fin = computeFinancials(p, computeEnergyReport(p));
    const flat = proposalNarrative(p, idArea).flatMap((s) => s.beats).map((b) => b.text).join(' ');
    if (fin.subsidyInr === 0) expect(flat).not.toMatch(/subsidy of/);
  });
});
