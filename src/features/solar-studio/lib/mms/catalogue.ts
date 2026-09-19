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
  /**
   * Facing this preset REQUIRES, degrees from north. East–west systems need it,
   * and it was written as `strategy === 'east_west' ? 90 : ...` in the
   * configurator — a list of names that every new east–west preset would have
   * had to be added to, silently facing south until someone noticed.
   */
  azimuth?: number;
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
// Waterproofing membrane. ONE preset that is membrane-only, and one it shares
// with an RCC deck. Neither may penetrate, which is why `flush` and every
// anchored RCC preset are withheld here: on this covering there is no such
// thing as a fixing, only mass.
const MEMBRANE: RoofType[] = ['membrane'];
// Shahabad / Kota slab on steel joists. Both presets answer the same question —
// where does the load land? — and neither answer is "the slab". Reach the joist
// through a pointed joint, or spread mass across several slabs on pads. The RCC
// presets are withheld: every one of them founds on the deck, and this deck is a
// 30 mm plate that cracks.
const STONE: RoofType[] = ['stone_slab'];
// Carport. The three frames are not styling choices — they are three answers to
// "where may a post stand?", which on a car park is the only question that
// matters. A cantilever keeps one whole bay row clear of columns and pays for
// it in steel; a portal puts posts on both sides and spans the aisle between;
// a butterfly runs one central post line for two bay rows and drains inward, so
// the run-off never reaches the edge where people walk.
const CARPORT: RoofType[] = ['carport'];
// Floating. Tilt stays LOW — 10° or so — because an array on open water has
// nothing sheltering it and every degree is more sail and more wave-induced
// motion in the mooring. The two systems differ in what carries the module: a
// pure-float pontoon body, or a steel raft sitting on smaller floats, which
// costs more and is the only one you can walk on.
const FLOATING: RoofType[] = ['floating'];
// Facade. The two are not variants of one product — they are two different
// TRADES, and which one a job is decides who builds it and what the module is.
//
// Rails on brackets is the retrofit: an ordinary framed module, an ordinary
// clamp, on an aluminium rail bolted to a wall that is already finished and
// already weathertight. The solar contractor does all of it.
//
// Spandrel infill is cladding: the module IS the wall, glazed into a curtain
// wall's mullions with structural gaskets, and it has to satisfy the facade
// system's weather line as well as make power. The facade contractor owns the
// interface, the module is usually a made-to-size glass-glass laminate, and the
// two costs are nothing like each other.
//
// Neither is offered on any other roof and nothing else is offered here: every
// rooftop preset in this table founds on a horizontal surface, and there is not
// one of them whose ballast, pedestal or tilt frame means anything on a wall.
const FACADE: RoofType[] = ['facade'];
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
  { id: 'membrane_ballast', label: 'Membrane · Ballasted frame on protection mats', roofs: MEMBRANE, heightM: .45, tilt: 10, foundation: 'ballast' },
  // The east–west TUB, and the answer to "`east_west` is a tilt, not a tray".
  // `east_west` sets two facings and leaves the table on legs; this is a closed
  // aerodynamic tray whose back panel turns uplift into downforce, which is what
  // lets a ballasted array carry far less concrete. Offered on an RCC deck too:
  // it is a wind solution, not a membrane one, and a heavy flat roof wants it
  // for the same reason.
  { id: 'aero_tray', label: 'Aerodynamic ballast tray · East–West', roofs: ['membrane', 'rcc_flat'], heightM: .3, tilt: 10, foundation: 'ballast', racking: 'dual_tilt', azimuth: 90 },
  { id: 'stone_beam_clamp', label: 'Stone slab · Clamped to the joist below', roofs: STONE, heightM: .45, tilt: 10, foundation: 'anchor' },
  { id: 'stone_spread_ballast', label: 'Stone slab · Spread ballast on pads', roofs: STONE, heightM: .45, tilt: 10, foundation: 'ballast' },
  // Seasonal tilt BEYOND RCC. `adjustable` was rooftop-slab only; a low-pitch
  // metal shed takes the same slotted frame on purlin brackets, which is
  // ordinary on north-Indian sheds where the winter sun is low enough to pay
  // for the labour twice a year.
  //
  // Deliberately NOT offered on tile, AC sheet or membrane. A seasonal frame is
  // a MOMENT frame — it stands the array up and hands the roof a lever — and
  // none of those three can take it: a tile hook reaches a batten, an asbestos
  // sheet carries nothing at all, and a membrane may not be fixed through.
  // Inventing a product for them would be worse than leaving the gap.
  { id: 'shed_seasonal', label: 'Metal shed · Seasonal manual tilt', roofs: METAL, heightM: .5, tilt: 15, foundation: 'anchor' },
  // Tilt stays LOW on a canopy: it is an open frame in the wind, and every
  // degree of tilt is another degree of sail over somebody's car.
  { id: 'carport_cantilever', label: 'Carport · Single-post cantilever', roofs: CARPORT, heightM: 2.5, tilt: 5, foundation: 'concrete' },
  { id: 'carport_portal', label: 'Carport · Two-post portal over the aisle', roofs: CARPORT, heightM: 2.5, tilt: 5, foundation: 'concrete' },
  { id: 'carport_butterfly', label: 'Carport · Butterfly, central posts', roofs: CARPORT, heightM: 2.7, tilt: 7, foundation: 'concrete' },
  // No tilt and no height: a facade's angle is 90° by definition (the pose
  // sets it) and its "height" is the wall's, which the roof already holds.
  // Writing either here would be inventing a second answer for both.
  { id: 'facade_rail', label: 'Facade · Rails on wall brackets (retrofit)', roofs: FACADE, flush: true, foundation: 'anchor' },
  { id: 'facade_spandrel', label: 'Facade · BIPV spandrel infill in curtain wall', roofs: FACADE, flush: true, foundation: 'anchor' },
  { id: 'float_pontoon', label: 'Floating · HDPE pontoon (pure float)', roofs: FLOATING, heightM: .3, tilt: 10, foundation: 'float' },
  { id: 'float_raft', label: 'Floating · Steel raft on floats (walkable)', roofs: FLOATING, heightM: .45, tilt: 10, foundation: 'float' },
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
  // A custom structure on a membrane is still held by mass — the foundation is
  // pinned so "custom" cannot become the back door to an anchor.
  { id: 'custom', label: 'Custom structure', roofs: ['rcc_flat', 'metal_shed', 'ac_sheet', 'membrane', 'stone_slab', 'tile'] },
];
/** Nominal catalogue sizes, explicitly assumed until replaced by project data. */
export function defaultMms(roof: RoofType): MmsConfig {
  return {
    // Every branch must name a strategy the roof's own list contains, or the
    // panel opens on a value it cannot apply — which is what left `Generate MMS`
    // inert on a ground array. The mms-coverage gate asserts this.
    version: 1, strategy: roof === 'metal_shed' ? 'purlin_mounted' : roof === 'ac_sheet' ? 'hook_bolt' : roof === 'membrane' ? 'membrane_ballast' : roof === 'stone_slab' ? 'stone_beam_clamp' : roof === 'carport' ? 'carport_cantilever' : roof === 'floating' ? 'float_pontoon' : roof === 'facade' ? 'facade_rail' : roof === 'tile' ? 'roof_hook' : roof === 'ground' ? 'ground_pile' : 'rcc_fixed',
    material: 'galvanized_steel', railInsetRatio: .18, attachmentSpacingM: 1.2, railStockLengthM: 6,
    edgeClearanceM: .1, obstacleClearanceM: .05,
    ballast: { type: 'precast_concrete', lengthM: .6, widthM: .4, heightM: .15, massKg: 86.4, blocksPerSupport: 1 },
    anchor: { type: 'chemical', count: 4, diameterMm: 12, spacingMm: 120, plateSizeMm: 200, plateThicknessMm: 10 },
  };
}