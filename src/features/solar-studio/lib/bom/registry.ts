// ─── BOM line registry — the semantic identity of every line deriveBom emits ─
// Before this, a line's `id` was `bom_${n}` off a counter reset on every call,
// so an id meant "the 7th line of whatever this design happened to produce".
// Adding a roof shifted every id after it, which is why overrides had to be
// keyed on `category|item` instead — a key that COLLIDES (the two pitched
// coverings emit identical item names) and that breaks the moment a user edits
// an item string.
//
// A LineKey is instead what the line MEANS. It is stable across designs, it
// survives renaming an item, and it is unique per derivation once per-instance
// lines suffix their source (`mech.steel:c_channel`).
import type { BomCategory } from '../../types';

export type LineKey =
  // ── Modules
  | 'modules.panel'
  // ── Inverter
  | 'inverter.unit'
  // ── Electrical BOS
  | 'elec.dc_cable'
  | 'elec.ac_cable'
  | 'elec.mc4'
  | 'elec.dcdb'
  | 'elec.acdb'
  | 'elec.conduit'
  | 'elec.meters'
  | 'elec.optimizer'
  | 'elec.combiner'
  | 'elec.string_fuse'
  // ── Mechanical BOS
  /** per structural PROFILE — suffixed with the profile key */
  | 'mech.steel'
  | 'mech.base_plate'
  | 'mech.ballast'
  | 'mech.pile'
  | 'mech.pedestal'
  | 'mech.bolts'
  | 'mech.mms_rcc'
  | 'mech.mms_ground'
  /** per roof COVERING — suffixed with the covering, so the two pitched
   *  coverings (which share one item string) can never collide */
  | 'mech.mms_sloped'
  | 'mech.sloped_flashing'
  | 'mech.mms_metal_shed'
  | 'mech.rail'
  | 'mech.clamps'
  | 'mech.fasteners'
  // ── Safety
  | 'safety.walkway'
  | 'safety.rail'
  | 'safety.arrester'
  | 'safety.down_conductor'
  | 'safety.earth_pit'
  | 'safety.earth_strip'
  | 'safety.signage'
  | 'safety.fence'
  | 'safety.gate'
  | 'safety.ground_earth_ring'
  // ── Civil & Misc
  | 'civil.installation'
  | 'civil.transport';

/**
 * The order deriveBom emits categories in — and therefore the order the BOM
 * table and the CSV present them. This is the single source of truth; the
 * hardcoded duplicate in screens/Step9Bom.tsx is superseded by it.
 */
export const CATEGORY_ORDER: BomCategory[] = [
  'Modules',
  'Inverter',
  'Electrical BOS',
  'Mechanical BOS',
  'Safety',
  'Civil & Misc',
];

/**
 * Default cutting/pulling waste per line, as a percentage of the calculated
 * quantity (Phase 22d).
 *
 * These are PROCUREMENT allowances, not engineering margins: cable is pulled
 * with slack and trimmed, steel is cut to length off stock, strip is bent and
 * lapped. A discrete item that is simply counted — a module, an inverter, a
 * DCDB — has no waste, and a default of 0 says so rather than quietly padding
 * the count.
 *
 * Keyed by LineKey PREFIX, so per-instance lines (`mech.steel:c_channel`)
 * inherit their kind's allowance.
 */
export const WASTE_PCT_BY_LINE: Record<string, number> = {
  'elec.dc_cable': 8,
  'elec.ac_cable': 8,
  'elec.conduit': 5,
  'mech.steel': 4,
  // absorbs the hardcoded × 1.05 that used to be baked into the rail quantity
  'mech.rail': 5,
  'safety.earth_strip': 5,
  'safety.down_conductor': 5,
};

export function wastePctFor(lineKey: string): number {
  return WASTE_PCT_BY_LINE[lineKey.split(':')[0]] ?? 0;
}

/**
 * Units bought as whole things. You cannot order 0.15 of a module, so an order
 * quantity in one of these units CEILS; a continuous unit (m, m², kg) keeps two
 * decimals. The reference tool prints `116.15 Nos` — this is the fix.
 */
const DISCRETE_UNITS = new Set(['nos', 'no', 'set', 'sets', 'pair', 'pairs', 'lot', 'kit', 'ea']);

export function isDiscreteUnit(unit: string): boolean {
  return DISCRETE_UNITS.has(unit.trim().toLowerCase());
}
