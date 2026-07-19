// ─── Characterization tests: BOM derivation (Phase 4 gate) ──────────────────
// Pins current behavior — including known Phase-10 targets (fixed cable
// estimates, flat ₹/panel structures). These are the rewrite contract.
import { describe, expect, it } from 'vitest';
import { bomConfidence, bomSubtotal, bomToCsv, bomTotal, deriveBom, mergedBom } from '../bom';
import { PRICE_BOOK } from '../../data/pricebook';
import { fixtureProject, fixtureRoof, fixturePanels } from './fixtures/project';
import type { BomLine, Project } from '../../types';

describe('deriveBom (traceability contract)', () => {
  const project = fixtureProject(8);
  const bom = deriveBom(project);

  it('module line counts ONLY enabled panels', () => {
    const disabledOne: Project = {
      ...project,
      panels: project.panels.map((p, i) => (i === 0 ? { ...p, enabled: false } : p)),
    };
    const modules = deriveBom(disabledOne).find((l) => l.category === 'Modules')!;
    expect(modules.qty).toBe(7);
  });

  it('every auto line carries a human-readable formula and finite money', () => {
    for (const line of bom) {
      expect(line.auto).toBe(true);
      expect(line.formula.length).toBeGreaterThan(3);
      expect(Number.isFinite(line.qty)).toBe(true);
      expect(line.qty).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(line.unitPriceInr)).toBe(true);
    }
  });

  it('inverter line follows the selected inverter and count', () => {
    const two: Project = {
      ...project,
      components: { ...project.components, inverterCount: 2 },
    };
    const inv = deriveBom(two).find((l) => l.category === 'Inverter')!;
    expect(inv.qty).toBe(2);
  });

  it('mergedBom: an override wins on qty but keeps the calculated line identity', () => {
    const target = bom.find((l) => l.category === 'Electrical BOS')!;
    const withOverride: Project = {
      ...project,
      bomOverrides: [{ ...target, qty: target.qty + 10, overridden: true } as BomLine],
    };
    const merged = mergedBom(withOverride);
    const line = merged.find((l) => l.id === target.id)!;
    expect(line.qty).toBe(target.qty + 10);
    expect(merged.filter((l) => l.id === target.id)).toHaveLength(1);
  });

  it('bomTotal = subtotal + persisted margin (single money path, Phase 1)', () => {
    const subtotal = bomSubtotal(mergedBom(project));
    const total = bomTotal(mergedBom(project), project);
    expect(total).toBeCloseTo(
      Math.round(subtotal * (1 + project.pricing.marginPct / 100)),
      0,
    );
  });

  it('KNOWN LIMIT (Phase 10 target): zero-string project still quotes DC cable + MC4', () => {
    const unstrung: Project = { ...project, strings: [] };
    const lines = deriveBom(unstrung);
    const dcCable = lines.find((l) => l.item.toLowerCase().includes('dc') && l.unit === 'm');
    const mc4 = lines.find((l) => l.item.includes('MC4'));
    // current behavior: floored estimates instead of a blocked quote
    expect((dcCable?.qty ?? 0) > 0 || (mc4?.qty ?? 0) > 0).toBe(true);
  });
});

describe('confidence propagation (Phase 10 §F3)', () => {
  const project = fixtureProject(8);

  it('every line carries a confidence tier', () => {
    for (const l of deriveBom(project)) {
      expect(['measured', 'derived', 'estimated', 'assumed']).toContain(l.confidence);
    }
  });

  it('a placed count is MEASURED; an unmodelled input is ASSUMED', () => {
    const bom = deriveBom(project);
    expect(bom.find((l) => l.category === 'Modules')!.confidence).toBe('measured');
    // no cable routes on this fixture ⇒ AC allowance is assumed, DC est.
    expect(bom.find((l) => l.item === 'Earthing Pits')!.confidence).toBe('assumed');
    expect(bom.find((l) => l.item.startsWith('DC Solar Cable'))!.confidence).toBe('estimated');
  });

  it('bomConfidence takes the WORST tier and lists what needs verifying', () => {
    const c = bomConfidence(deriveBom(project));
    expect(c.tier).toBe('assumed'); // earthing pits drag it down
    expect(c.preliminary).toBe(true);
    expect(c.needsVerification).toContain('Earthing Pits');
    expect(c.counts.measured).toBeGreaterThan(0); // modules/inverter
  });

  it('overriding a line counts it as measured — a human owns that number', () => {
    const bom = deriveBom(project);
    const pit = bom.find((l) => l.item === 'Earthing Pits')!;
    const withOverride: Project = {
      ...project,
      bomOverrides: [{ ...pit, qty: 4, auto: true, overridden: true }],
    };
    const merged = mergedBom(withOverride);
    const mergedPit = merged.find((l) => l.item === 'Earthing Pits')!;
    expect(mergedPit.overridden).toBe(true);
    // it was 'assumed', but the user set it ⇒ bomConfidence treats it as measured
    const c = bomConfidence(merged);
    expect(c.needsVerification).not.toContain('Earthing Pits');
  });
})

// ─── S4: a pitched face is flush-mounted, not ballasted ─────────────────────
// makeRoof stamps EVERY roof 'rcc_flat' and only pitchDeg distinguishes a
// gable/hip/skeleton face, so the mechanical buckets must read the PITCH.
describe('mechanical buckets: pitched roofs get flush hardware, not tilt legs', () => {
  const ELEVATED_RCC = 'Mounting Structure (elevated RCC)';
  const HOOKS = 'Mounting Structure (pitched roof) — roof hooks / L-feet';
  const FLASHING = 'Roof Penetration Flashing & Sealing';

  /** `count` panels on a single roof of the given shape. */
  function onRoof(over: Partial<Project['roofs'][number]>, count = 8): Project {
    const base = fixtureProject(count);
    return { ...base, roofs: [fixtureRoof(over)] };
  }

  it('a FLAT rcc roof is unchanged — still elevated tilt legs, no flush lines', () => {
    const bom = deriveBom(onRoof({ pitchDeg: 0 }));
    expect(bom.find((l) => l.item === ELEVATED_RCC)!.qty).toBe(8);
    expect(bom.find((l) => l.item === HOOKS)).toBeUndefined();
    expect(bom.find((l) => l.item === FLASHING)).toBeUndefined();
  });

  it('a PITCHED face bills hooks + flashing and NEVER elevated tilt legs', () => {
    const bom = deriveBom(onRoof({ pitchDeg: 22 }));
    // the defect: this line used to appear, quoting ballasted 10° legs
    expect(bom.find((l) => l.item === ELEVATED_RCC)).toBeUndefined();
    expect(bom.find((l) => l.item === HOOKS)!.qty).toBe(8);
    expect(bom.find((l) => l.item === FLASHING)!.qty).toBe(8);
    // and the spec a customer reads must not promise tilt legs
    for (const l of bom.filter((x) => x.category === 'Mechanical BOS')) {
      expect(l.spec).not.toMatch(/tilt legs/i);
    }
  });

  it('rail still applies to a pitched face (hooks carry a rail)', () => {
    const flat = deriveBom(onRoof({ pitchDeg: 0 })).find((l) => l.item === 'Mounting Rail')!;
    const pitched = deriveBom(onRoof({ pitchDeg: 22 })).find((l) => l.item === 'Mounting Rail')!;
    expect(pitched.qty).toBe(flat.qty);
  });

  it('the pitch threshold is isSloped (0.5°) — not a second definition', () => {
    // just below: still a flat deck
    expect(deriveBom(onRoof({ pitchDeg: 0.4 })).find((l) => l.item === ELEVATED_RCC)).toBeDefined();
    // at the predicate's threshold: flush
    expect(deriveBom(onRoof({ pitchDeg: 0.5 })).find((l) => l.item === HOOKS)).toBeDefined();
  });

  it('metal shed and ground keep their own treatment even when pitched', () => {
    const metal = deriveBom(onRoof({ roofType: 'metal_shed', pitchDeg: 15 }));
    expect(metal.find((l) => l.item === 'Mounting Structure (metal shed)')!.qty).toBe(8);
    expect(metal.find((l) => l.item === HOOKS)).toBeUndefined();

    const ground = deriveBom(onRoof({ roofType: 'ground', pitchDeg: 15 }));
    expect(ground.find((l) => l.item === 'Ground Mount Structure')!.qty).toBe(8);
    expect(ground.find((l) => l.item === HOOKS)).toBeUndefined();
  });

  it('the four per-panel buckets stay DISJOINT and sum to the enabled count', () => {
    // one roof of each kind — plus a FLAT TILE deck, which now takes tile-hook
    // hardware, not tilt legs — 4 panels each ⇒ every bucket non-empty at once
    const base = fixtureProject(4);
    const roofs = [
      fixtureRoof({ id: 'r_flat', pitchDeg: 0 }),
      fixtureRoof({ id: 'r_pitch', pitchDeg: 25 }),
      fixtureRoof({ id: 'r_metal', roofType: 'metal_shed' }),
      fixtureRoof({ id: 'r_ground', roofType: 'ground' }),
      fixtureRoof({ id: 'r_tile', roofType: 'tile', pitchDeg: 0 }),
    ];
    const panels = roofs.flatMap((r) =>
      fixturePanels(4, r.id).map((p) => ({ ...p, id: `${r.id}_${p.id}` })),
    );
    // one disabled panel: the buckets must track ENABLED panels, not placed ones
    panels[0] = { ...panels[0], enabled: false };
    const mixed: Project = { ...base, roofs, panels, strings: [] };

    const n = mixed.panels.filter((p) => p.enabled).length;
    expect(n).toBe(19);

    const bom = deriveBom(mixed);
    const qty = (item: string) => bom.find((l) => l.item === item)?.qty ?? 0;
    // HOOKS/FLASHING appear once per COVERING (sloped RCC + tile here) — the
    // bucket is the SUM of those lines
    const qtyAll = (item: string) =>
      bom.filter((l) => l.item === item).reduce((s, l) => s + l.qty, 0);
    const buckets = {
      flatRcc: qty(ELEVATED_RCC),
      covering: qtyAll(HOOKS), // pitched RCC (4) + flat tile deck (4)
      metal: qty('Mounting Structure (metal shed)'),
      ground: qty('Ground Mount Structure'),
    };
    expect(buckets).toEqual({ flatRcc: 3, covering: 8, metal: 4, ground: 4 });
    const sum = Object.values(buckets).reduce((a, b) => a + b, 0);
    expect(sum).toBe(n); // disjoint AND complete — no panel billed twice or lost
    // flashing tracks the covering bucket exactly (one set per penetrating panel)
    expect(qtyAll(FLASHING)).toBe(buckets.covering);
  });

  // A FLAT roof with 'tile' covering is physically incompatible with ballasted
  // tilt legs (you hook through tile; you don't stand an elevated RCC structure
  // on it), yet the UI can produce one — it used to land in the elevated-RCC
  // bucket and price legs + rails it can never receive.
  it('a FLAT tile deck bills tile hooks + flashing — never ballasted tilt legs', () => {
    const bom = deriveBom(onRoof({ roofType: 'tile', pitchDeg: 0 }));
    expect(bom.find((l) => l.item === ELEVATED_RCC)).toBeUndefined();
    const hooks = bom.find((l) => l.item === HOOKS)!;
    expect(hooks.qty).toBe(8);
    expect(hooks.unitPriceInr).toBe(PRICE_BOOK.tileHookSetPerPanel);
    expect(hooks.formula).toMatch(/tile/i);
    const flash = bom.find((l) => l.item === FLASHING)!;
    expect(flash.qty).toBe(8);
    expect(flash.unitPriceInr).toBe(PRICE_BOOK.tileFlashingPerPanel);
    // the spec a customer reads must not promise tilt legs anywhere
    for (const l of bom.filter((x) => x.category === 'Mechanical BOS')) {
      expect(l.spec).not.toMatch(/tilt legs/i);
    }
  });

  // WAS "…and say the roof covering is unknown". The covering is no longer
  // unknown: `roofType` carries it and survives a gable/hip conversion, so both
  // lines now NAME the covering and price its actual hardware. They stay
  // ESTIMATED because the anchor COUNT still depends on rafter spacing, which
  // is not modelled — the honest residual, and the only one left to disclose.
  it('flush lines are ESTIMATED but now NAME the covering they priced', () => {
    const rcc = deriveBom(onRoof({ pitchDeg: 22 }));
    for (const item of [HOOKS, FLASHING]) {
      const l = rcc.find((x) => x.item === item)!;
      expect(l.confidence).toBe('estimated');
      expect(l.formula).toMatch(/sloped RCC slab/i);
      // and it must not still be hedging across every possible covering
      expect(l.formula).not.toMatch(/Mangalore/i);
    }
    // the anchor line still discloses the one thing that remains unmodelled
    expect(rcc.find((x) => x.item === HOOKS)!.formula).toMatch(/ESTIMATE/);

    const tile = deriveBom(onRoof({ roofType: 'tile', pitchDeg: 22 }));
    for (const item of [HOOKS, FLASHING]) {
      const l = tile.find((x) => x.item === item)!;
      expect(l.confidence).toBe('estimated');
      expect(l.formula).toMatch(/tile/i);
      expect(l.formula).not.toMatch(/RCC slab/i);
    }
    expect(tile.find((x) => x.item === HOOKS)!.formula).toMatch(/rafter spacing/i);
  });
});

describe('CSV carries confidence + the preliminary note (a quote is a quote wherever read)', () => {
  it('has a Confidence column and a PRELIMINARY note row', () => {
    const csv = bomToCsv(deriveBom(fixtureProject(8)));
    expect(csv.split('\n')[0]).toContain('Confidence');
    expect(csv).toMatch(/PRELIMINARY — site verification required/);
    // every data row has the same column count as the header (the disclaimer
    // NOTE row once had one fewer, which corrupts a spreadsheet import)
    const cols = csv.split('\n').map((r) => r.split(',').length);
    const header = cols[0];
    for (const c of cols) expect(c).toBeGreaterThanOrEqual(header);
  });
});
