// ─── `roofType` is the COVERING, and a shape change must not re-clad a roof ──
// `makeRoof` used to hardcode roofType:'rcc_flat', and the gable/hip/skeleton
// factories never overrode it. Two things were wrong at once:
//
//   1. every pitched face CLAIMED to be a flat RCC roof (fixed separately: the
//      BOM buckets read `isSloped`, not this field), and
//   2. converting a metal shed to a gable LOST the metal covering, silently
//      moving its panels from clamp pricing to hook pricing in the BOM.
//
// (2) is what this file guards. The tempting fix — adding a 'sloped_rcc'
// member and stamping it in the factories — would have made (2) permanent: it
// trades a wrong pitch for a wrong covering, which is a wrong NUMBER on a
// customer's quote rather than merely a wrong label. So the covering is the
// only thing `roofType` says, `isSloped()` answers pitch, and a conversion
// carries the covering through untouched.
import { describe, expect, it } from 'vitest';
import type { Project, Roof, RoofType, XY } from '../../types';
import { deriveBom } from '../bom';
import { PRICE_BOOK } from '../../data/pricebook';
import { gableFaces } from '../roof-gable';
import { hipFaces } from '../roof-hip';
import { skeletonFaces } from '../roof-skeleton';
import { makeRoof } from '../roof-factory';
import { isSloped } from '../roof-plane';
import { fixtureProject, fixturePanels } from './fixtures/project';

const HOOKS = 'Mounting Structure (pitched roof) — roof hooks / L-feet';
const FLASHING = 'Roof Penetration Flashing & Sealing';
const METAL = 'Mounting Structure (metal shed)';
const ELEVATED_RCC = 'Mounting Structure (elevated RCC)';

/** 16 × 10 m rectangle — gable-able, hip-able and skeleton-able alike. */
const RECT: XY[] = [
  { x: 0, y: 0 },
  { x: 16, y: 0 },
  { x: 16, y: 10 },
  { x: 0, y: 10 },
];
/** A hexagon: not a rectangle, so hipFaces refuses and the skeleton runs. */
const HEX: XY[] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2;
  return { x: Math.cos(a) * 9, y: Math.sin(a) * 9 };
});

/** Build a project whose ONLY roofs are `faces`, with 2 panels on each. */
function projectOn(faces: readonly Roof[]): Project {
  const base = fixtureProject(2);
  const panels = faces.flatMap((f) =>
    fixturePanels(2, f.id).map((p) => ({ ...p, id: `${f.id}_${p.id}` })),
  );
  return { ...base, roofs: [...faces], panels, strings: [] };
}

const qtyOf = (project: Project, item: string) =>
  deriveBom(project).find((l) => l.item === item)?.qty ?? 0;

describe('makeRoof: covering is an input, and its default is unchanged', () => {
  it('defaults to rcc_flat — every existing caller behaves exactly as before', () => {
    expect(makeRoof({ polygon: RECT, existing: [] }).roofType).toBe('rcc_flat');
  });

  it('honours an explicit covering', () => {
    for (const t of ['rcc_flat', 'metal_shed', 'tile', 'ground'] as RoofType[]) {
      expect(makeRoof({ polygon: RECT, existing: [], roofType: t }).roofType).toBe(t);
    }
  });

  it('covering and pitch are INDEPENDENT — a covering never implies flatness', () => {
    const r = makeRoof({ polygon: RECT, existing: [], roofType: 'metal_shed', pitchDeg: 25 });
    expect(r.roofType).toBe('metal_shed'); // still a metal shed…
    expect(isSloped(r)).toBe(true); // …and genuinely pitched
  });
});

describe('a shape conversion carries the covering through, on every factory', () => {
  const coverings: RoofType[] = ['rcc_flat', 'metal_shed', 'tile'];

  for (const covering of coverings) {
    it(`gable: ${covering} in ⇒ ${covering} on both faces`, () => {
      const g = gableFaces({ footprint: RECT, existing: [], pitchDeg: 22, roofType: covering });
      expect(g.ok).toBe(true);
      if (!g.ok) return;
      expect(g.faces.map((f) => f.roofType)).toEqual([covering, covering]);
      expect(g.faces.every(isSloped)).toBe(true); // pitch gained, covering kept
    });

    it(`hip: ${covering} in ⇒ ${covering} on all four faces`, () => {
      const h = hipFaces({ footprint: RECT, existing: [], pitchDeg: 22, roofType: covering });
      expect(h.ok).toBe(true);
      if (!h.ok) return;
      expect(h.faces.map((f) => f.roofType)).toEqual(Array(4).fill(covering));
    });

    it(`skeleton: ${covering} in ⇒ ${covering} on every face`, () => {
      const s = skeletonFaces({ footprint: HEX, existing: [], pitchDeg: 22, roofType: covering });
      expect(s.ok).toBe(true);
      if (!s.ok) return;
      expect(s.faces.length).toBeGreaterThanOrEqual(3);
      expect(s.faces.every((f) => f.roofType === covering)).toBe(true);
    });
  }

  it('omitting the covering still defaults to rcc_flat (no caller is forced to care)', () => {
    const g = gableFaces({ footprint: RECT, existing: [], pitchDeg: 22 });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.faces.every((f) => f.roofType === 'rcc_flat')).toBe(true);
  });
});

// ─── THE GATE: the BOM must not change hardware because the SHAPE changed ────
describe('BOM treatment survives a gable conversion', () => {
  it('a METAL SHED gabled keeps metal-shed clamps — never hooks or flashing', () => {
    const g = gableFaces({
      footprint: RECT,
      existing: [],
      pitchDeg: 22,
      roofType: 'metal_shed',
    });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const p = projectOn(g.faces);

    // 4 panels (2 per face) all billed as metal shed…
    expect(qtyOf(p, METAL)).toBe(4);
    // …and NOT as pitched-roof hooks, which is where they landed when the
    // conversion reset the covering to rcc_flat. That was a real price change:
    // clamps at ₹420/panel vs hooks+flashing at ₹970/panel.
    expect(qtyOf(p, HOOKS)).toBe(0);
    expect(qtyOf(p, FLASHING)).toBe(0);
    expect(qtyOf(p, ELEVATED_RCC)).toBe(0); // and never ballasted tilt legs
  });

  it('an RCC FLAT roof gabled DOES get hooks + flashing (the pitch is real)', () => {
    const g = gableFaces({ footprint: RECT, existing: [], pitchDeg: 22, roofType: 'rcc_flat' });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const p = projectOn(g.faces);

    expect(qtyOf(p, HOOKS)).toBe(4);
    expect(qtyOf(p, FLASHING)).toBe(4);
    expect(qtyOf(p, METAL)).toBe(0);
    // the whole point of the pitched bucket: no elevated tilt legs on a slope
    expect(qtyOf(p, ELEVATED_RCC)).toBe(0);
  });

  it('a TILE roof gabled is priced as tile hooks, not as slab L-feet', () => {
    const g = gableFaces({ footprint: RECT, existing: [], pitchDeg: 22, roofType: 'tile' });
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    const bom = deriveBom(projectOn(g.faces));

    const hooks = bom.find((l) => l.item === HOOKS)!;
    expect(hooks.qty).toBe(4);
    expect(hooks.unitPriceInr).toBe(PRICE_BOOK.tileHookSetPerPanel);
    expect(hooks.spec).toMatch(/tile/i);

    const flash = bom.find((l) => l.item === FLASHING)!;
    expect(flash.unitPriceInr).toBe(PRICE_BOOK.tileFlashingPerPanel);
    // a tile roof carries a breakage allowance an RCC slab does not
    expect(flash.spec).toMatch(/breakage/i);
  });

  it('tile and sloped-RCC are priced DIFFERENTLY — the covering moves money', () => {
    const build = (roofType: RoofType) => {
      const g = gableFaces({ footprint: RECT, existing: [], pitchDeg: 22, roofType });
      if (!g.ok) throw new Error('fixture failed to gable');
      const bom = deriveBom(projectOn(g.faces));
      return bom.find((l) => l.item === HOOKS)!.unitPriceInr;
    };
    expect(build('tile')).toBeGreaterThan(build('rcc_flat'));
  });

  it('a MIXED project bills each covering on its own line, and the bucket still totals', () => {
    const tile = gableFaces({ footprint: RECT, existing: [], pitchDeg: 22, roofType: 'tile' });
    const rcc = gableFaces({
      footprint: RECT.map((p) => ({ x: p.x + 40, y: p.y })),
      existing: [],
      pitchDeg: 22,
      roofType: 'rcc_flat',
    });
    expect(tile.ok && rcc.ok).toBe(true);
    if (!tile.ok || !rcc.ok) return;
    // distinct ids so the two gables cannot collide
    const faces = [
      ...tile.faces.map((f, i) => ({ ...f, id: `tile_${i}` })),
      ...rcc.faces.map((f, i) => ({ ...f, id: `rcc_${i}` })),
    ];
    const bom = deriveBom(projectOn(faces));

    const hookLines = bom.filter((l) => l.item === HOOKS);
    expect(hookLines).toHaveLength(2); // one per covering, each with its own price
    expect(new Set(hookLines.map((l) => l.unitPriceInr)).size).toBe(2);
    // 8 panels on pitched faces, split 4/4 — nothing double-billed or lost
    expect(hookLines.reduce((s, l) => s + l.qty, 0)).toBe(8);
    expect(
      bom.filter((l) => l.item === FLASHING).reduce((s, l) => s + l.qty, 0),
    ).toBe(8);
  });
});

describe('BOM treatment survives hip and skeleton conversions too', () => {
  it('hip: a metal shed stays on clamps', () => {
    const h = hipFaces({ footprint: RECT, existing: [], pitchDeg: 22, roofType: 'metal_shed' });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    const p = projectOn(h.faces);
    expect(qtyOf(p, METAL)).toBe(8); // 4 faces × 2 panels
    expect(qtyOf(p, HOOKS)).toBe(0);
  });

  it('skeleton: a tile roof stays on tile hooks', () => {
    const s = skeletonFaces({ footprint: HEX, existing: [], pitchDeg: 22, roofType: 'tile' });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const bom = deriveBom(projectOn(s.faces));
    const hooks = bom.find((l) => l.item === HOOKS)!;
    expect(hooks.qty).toBe(s.faces.length * 2);
    expect(hooks.unitPriceInr).toBe(PRICE_BOOK.tileHookSetPerPanel);
    expect(bom.find((l) => l.item === METAL)).toBeUndefined();
  });
});
