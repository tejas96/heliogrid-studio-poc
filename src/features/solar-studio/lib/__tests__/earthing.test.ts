// ─── Earthing / LPS quantities (Phase 10 task 28c) ──────────────────────────
// The count of earth electrodes is a SOIL RESISTIVITY question (IS 3043) and
// LPS placement is a risk-class question (IS/IEC 62305). We have neither a soil
// measurement nor a risk assessment, so these lines may offer a convention —
// but they must say that is what they are, and they must at least follow the
// design that exists.
import { describe, expect, it } from 'vitest';
import { deriveBom } from '../bom';
import { INDIA_RULES } from '../../data/rules/india';
import { fixtureProject, fixtureRoof, fixturePanels } from './fixtures/project';
import type { LightningArrester, Project, Roof } from '../../types';

function project(over: Partial<Project> = {}): Project {
  const base = fixtureProject(0);
  return { ...base, roofs: [fixtureRoof()], panels: fixturePanels(6), ...over };
}

function arrester(roofId: string, id = 'la1'): LightningArrester {
  return { id, roofId, pos: { x: 0, y: 0 } } as LightningArrester;
}

const pit = (p: Project) => deriveBom(p).find((l) => l.item === 'Earthing Pits')!;
const strip = (p: Project) => deriveBom(p).find((l) => l.item.startsWith('Earthing Strip'))!;

describe('earthing pits — follow the design, and admit what they assume', () => {
  it('no arrester ⇒ NO LPS pit (it used to bill 3 regardless)', () => {
    const p = project({ arresters: [] });
    expect(pit(p).qty).toBe(INDIA_RULES.earthing.pitsForSystem); // 2: DC + AC
    expect(pit(p).formula).toMatch(/no arrester/);
  });

  it('an arrester adds the LPS pit', () => {
    const p = project({ arresters: [arrester(fixtureRoof().id)] });
    expect(pit(p).qty).toBe(
      INDIA_RULES.earthing.pitsForSystem + INDIA_RULES.earthing.pitsForLps,
    );
  });

  it('the count is labelled ASSUMED and names the measurement it lacks', () => {
    const f = pit(project({ arresters: [] })).formula;
    expect(f).toMatch(/ASSUMED/);
    expect(f).toMatch(/soil resistivity/i);
    expect(f).toMatch(/IS 3043/);
  });
});

describe('earthing strip — no hidden numbers', () => {
  it('states the interconnect allowance instead of burying it in "+ interconnects"', () => {
    const f = strip(project({ arresters: [] })).formula;
    expect(f).toMatch(new RegExp(`${INDIA_RULES.earthing.interconnectAllowanceM} m ASSUMED interconnect`));
    expect(f).not.toMatch(/\+ interconnects$/);
  });

  it('scales with the pits it actually serves', () => {
    const withLa = strip(project({ arresters: [arrester(fixtureRoof().id)] })).qty;
    const noLa = strip(project({ arresters: [] })).qty;
    expect(withLa).toBeGreaterThan(noLa);
  });
});

describe('LA down conductor — each arrester drops down ITS OWN roof', () => {
  it('a low-roof arrester is not priced off the tallest roof on site', () => {
    const low: Roof = fixtureRoof({ id: 'roof_low', heightM: 4 });
    const tall: Roof = fixtureRoof({
      id: 'roof_tall',
      heightM: 20,
      polygon: [
        { x: 30, y: -6 },
        { x: 42, y: -6 },
        { x: 42, y: 6 },
        { x: 30, y: 6 },
      ],
    });
    const p = project({ roofs: [low, tall], arresters: [arrester('roof_low')] });
    const dc = deriveBom(p).find((l) => l.item === 'LA Down Conductor')!;
    // its own 4 m roof + the ground run — NOT the 20 m mumty next door
    expect(dc.qty).toBe(4 + INDIA_RULES.earthing.laGroundRunM);
  });

  it('sums per arrester across different roofs', () => {
    const low: Roof = fixtureRoof({ id: 'roof_low', heightM: 4 });
    const tall: Roof = fixtureRoof({
      id: 'roof_tall',
      heightM: 12,
      polygon: [
        { x: 30, y: -6 },
        { x: 42, y: -6 },
        { x: 42, y: 6 },
        { x: 30, y: 6 },
      ],
    });
    const p = project({
      roofs: [low, tall],
      arresters: [arrester('roof_low', 'la1'), arrester('roof_tall', 'la2')],
    });
    const dc = deriveBom(p).find((l) => l.item === 'LA Down Conductor')!;
    expect(dc.qty).toBe(4 + 12 + 2 * INDIA_RULES.earthing.laGroundRunM);
  });

  it('the arrester line admits its coverage is assumed, not designed', () => {
    const p = project({ arresters: [arrester(fixtureRoof().id)] });
    const la = deriveBom(p).find((l) => l.item.startsWith('Lightning Arrester'))!;
    expect(la.formula).toMatch(/ASSUMED/);
    expect(la.formula).toMatch(/62305/);
  });
});
