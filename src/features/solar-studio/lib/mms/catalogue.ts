import type { FoundationKind, RackingSpec, RoofType } from '../../types';
import type { MmsConfig, MountStrategy, StructuralMaterial } from './types';

export const MATERIALS: Record<StructuralMaterial, { label: string; density: number; color: string; roughness: number; metalness: number }> = {
  galvanized_steel: { label: 'Galvanized steel', density: 7850, color: '#aeb4b7', roughness: .48, metalness: .78 },
  aluminium: { label: 'Aluminium', density: 2700, color: '#c4c9ca', roughness: .35, metalness: .85 },
  stainless_steel: { label: 'Stainless steel', density: 8000, color: '#b7bdc1', roughness: .3, metalness: .88 },
  painted_steel: { label: 'Painted steel', density: 7850, color: '#596566', roughness: .62, metalness: .3 },
};
interface MountPreset {
  id: MountStrategy;
  label: string;
  roofs: RoofType[];
  flush?: boolean;
  heightM?: number;
  tilt?: number;
  /**
   * Racking kind this preset REQUIRES. Without it the configurator can only
   * guess between flush / dual_tilt / fixed_tilt, and nothing about a `flush`
   * flag or a tilt angle can ask for a torque tube — so a tracker was
   * unreachable from the catalogue however it was labelled.
   */
  racking?: RackingSpec['kind'];
  /**
   * Where the table lands. Previously the configurator wrote `anchor` for every
   * strategy but `rcc_ballast`, and `anchor` is not a foundation open ground
   * allows (`allowedFoundations`, lib/structure.ts) — so a ground table's
   * foundation would have been silently corrected back on the next read.
   */
  foundation?: FoundationKind;
}
const RCC: RoofType[] = ['rcc_flat'];
const METAL: RoofType[] = ['metal_shed'];
// Open ground had NO entry in this table at all. The consequence was three dead
// controls on a ground array: the MMS type dropdown rendered empty, picking a
// type returned `{}` from `configureMms`, and `Generate MMS` did nothing either
// because `defaultMms` handed back `rcc_fixed` — a strategy ground rejects.
//
// Nothing below is new machinery. Pile, pedestal and ballast are already
// `allowedFoundations` on ground, `foundation.ts` already draws all three,
// `tracker_hsat` racking already exists with its rotation limit and
// backtracking, and the pricebook already rates a pile and a pedestal. Only
// this table was missing.
//
// Tilt and clearance are deliberately ABSENT here: a ground table takes them
// from `resolveRules().defaults` at configure time — the same live source the
// ground structure presets read — so a project rule override cannot be honoured
// in one place and ignored in the other.
const GROUND: RoofType[] = ['ground'];
// Asbestos-cement sheet. Deliberately NOT sharing METAL's presets: every one of
// those fixings — trapezoidal clamp, standing seam, self-drilling direct-sheet —
// assumes the sheet itself carries load. An AC sheet does not. It is a brittle
// mineral board, so the load path goes AROUND it into the purlin, and the only
// two fixings that do that are below. Generic `flush` is withheld here for the
// same reason: on this covering "flush-mounted rails" does not say what is
// holding them, and the answer is the whole cost and the whole risk.
const AC: RoofType[] = ['ac_sheet'];
export const MOUNT_CATALOGUE: MountPreset[] = [
  { id: 'rcc_fixed', label: 'RCC · Standard fixed tilt', roofs: RCC, heightM: .45, tilt: 10 },
  { id: 'rcc_ballast', label: 'RCC · Ballasted', roofs: RCC, heightM: .45 },
  { id: 'rcc_anchor', label: 'RCC · Anchored / penetrative', roofs: RCC, heightM: .45 },
  { id: 'low_height', label: 'RCC · Low height', roofs: RCC, heightM: .3, tilt: 5 },
  { id: 'elevated', label: 'Elevated · Usable space', roofs: RCC, heightM: 1.8288 },
  { id: 'high_height', label: 'High height · Parking / utility', roofs: RCC, heightM: 2.4384 },
  { id: 'east_west', label: 'East–West · Low tilt', roofs: RCC, heightM: .45, tilt: 10 },
  { id: 'south_facing', label: 'South-facing', roofs: RCC, heightM: .45, tilt: 15 },
  { id: 'adjustable', label: 'Adjustable tilt', roofs: RCC, heightM: .6 },
  { id: 'obstacle_clearance', label: 'Custom obstacle clearance', roofs: RCC, heightM: 2.4384 },
  ...(['trapezoidal', 'corrugated', 'standing_seam', 'clamp_mounted', 'rail_mounted', 'purlin_mounted', 'rafter_mounted', 'direct_sheet'] as const).map(id => ({ id, label: id.replaceAll('_', ' '), roofs: METAL, flush: true })),
  { id: 'industrial_custom', label: 'Custom industrial structure', roofs: METAL, heightM: .6 },
  { id: 'hook_bolt', label: 'AC sheet · Hook bolt through crown', roofs: AC, flush: true },
  // For an old or thin sheet: the same J-bolt, but the load is spread over
  // several corrugations by a bracket instead of bearing on one crown.
  { id: 'ac_spreader', label: 'AC sheet · Hook bolt + load-spreading bracket', roofs: AC, flush: true },
  { id: 'roof_hook', label: 'Rail + roof hook', roofs: ['tile'], flush: true },
  { id: 'adjustable_hook', label: 'Adjustable roof hook', roofs: ['tile'], flush: true },
  { id: 'ground_pile', label: 'Ground · Driven pile', roofs: GROUND, foundation: 'pile' },
  { id: 'ground_pedestal', label: 'Ground · Cast concrete pedestal', roofs: GROUND, foundation: 'concrete' },
  // Ballast is what you use where you cannot excavate — rock, leased or
  // restored land. It stays offered here so that turning an existing ballasted
  // ground table over to MMS does not quietly re-found it on piles.
  { id: 'ground_ballast', label: 'Ground · Ballasted — no excavation', roofs: GROUND, foundation: 'ballast' },
  { id: 'ground_seasonal', label: 'Ground · Seasonal manual tilt', roofs: GROUND, foundation: 'pile' },
  { id: 'ground_tracker', label: 'Ground · Single-axis tracker (HSAT)', roofs: GROUND, foundation: 'pile', racking: 'tracker_hsat' },
  { id: 'flush', label: 'Flush-mounted rails', roofs: ['rcc_flat', 'metal_shed', 'tile'], flush: true },
  { id: 'custom', label: 'Custom structure', roofs: ['rcc_flat', 'metal_shed', 'ac_sheet', 'tile'] },
];
/** Nominal catalogue sizes, explicitly assumed until replaced by project data. */
export function defaultMms(roof: RoofType): MmsConfig {
  return {
    // Every branch must name a strategy the roof's own list contains, or the
    // panel opens on a value it cannot apply — which is what left `Generate MMS`
    // inert on a ground array. The mms-coverage gate asserts this.
    version: 1, strategy: roof === 'metal_shed' ? 'purlin_mounted' : roof === 'ac_sheet' ? 'hook_bolt' : roof === 'tile' ? 'roof_hook' : roof === 'ground' ? 'ground_pile' : 'rcc_fixed',
    material: 'galvanized_steel', railInsetRatio: .18, attachmentSpacingM: 1.2, railStockLengthM: 6,
    edgeClearanceM: .1, obstacleClearanceM: .05,
    ballast: { type: 'precast_concrete', lengthM: .6, widthM: .4, heightM: .15, massKg: 86.4, blocksPerSupport: 1 },
    anchor: { type: 'chemical', count: 4, diameterMm: 12, spacingMm: 120, plateSizeMm: 200, plateThicknessMm: 10 },
  };
}