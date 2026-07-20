// Org price book used by the BOM engine (₹). Editable per line in the UI.
export const PRICE_BOOK = {
  // Cable is priced BY CONDUCTOR SIZE. Both cable specs are DERIVED — DC from
  // the string fuse (22b), AC from the breaker — so a single flat rate would
  // quote a 25 sq.mm run at the 6 sq.mm price and understate the job by more
  // than the margin on it. The size the spec prints is the size that is billed.
  dcCablePerMBySize: { 4: 68, 6: 96, 10: 152, 16: 235 } as Record<number, number>,
  acCablePerMBySize: {
    4: 150,
    6: 210,
    10: 320,
    16: 470,
    25: 690,
    35: 930,
    50: 1280,
    70: 1750,
    95: 2320,
    120: 2900,
    150: 3550,
    185: 4350,
    240: 5600,
  } as Record<number, number>,
  mc4PairPrice: 95,
  conduitPerM: 55,
  earthingStripPerM: 92,
  railPerM: 320, // mounting rail
  midClamp: 38,
  endClamp: 42, // wider casting — an end clamp grips one module, not two
  // metal-shed fixings (Phase 22h): an L-foot through the sheet crown, and the
  // EPDM washer that keeps the hole it made from leaking
  sheetStandoff: 210,
  sealingWasher: 12,
  structureLegPerPanel: 950, // fallback: elevated RCC per panel (segments WITHOUT a member model)
  // Ground array per panel: taller table + a driven/​cast foundation instead of
  // rooftop ballast. ESTIMATED — foundation type is site-dependent (20b/20c).
  structureGroundPerPanel: 1450,
  // Ground foundations, per leg. ESTIMATED — the real figure is soil-dependent
  // (bearing capacity, water table, rock) and is a site-survey output.
  pileFoundation: 1650, // driven/rammed HDG post
  concretePedestal: 2400, // cast-in-situ pedestal incl. excavation + concrete
  // Free-field site works, ESTIMATED — fence spec and gate size are client
  // decisions; the ring conductor follows the array boundary.
  perimeterFencePerM: 850, // chain-link on HDG posts
  fenceGate: 14000, // single vehicle gate
  steelPerKg: 92, // HDG structural steel, fabricated — drives member-model tonnage lines
  anchorBoltPc: 38, // chemical/expansion anchor per pc
  basePlatePc: 120, // HDG base plate per pc
  structureBoltPc: 14, // M10 SS bolt+nut+washer set per pc
  metalShedClampPerPanel: 420, // flush mount on metal shed: mini-rails + roof clamps per panel
  // ── Pitched (sloped) roof flush mounting. A pitched roof takes NO ballasted
  // tilt legs: the modules sit flush on the pitch, carried by anchors that go
  // through the covering into the rafter or slab. Assumes ~4 anchors/module.
  //
  // These used to be ONE blended pair of numbers because the covering was not
  // modelled — every roof claimed to be 'rcc_flat', so the price could not
  // depend on what was actually on top. `Roof.roofType` now carries the
  // covering (and survives a gable/hip conversion), so the hardware is chosen
  // rather than averaged. What remains genuinely unknown is RAFTER SPACING,
  // which sets anchors per module — so these stay ESTIMATES, but of a specific
  // product, not of an unknown one.
  //
  // Sloped RCC slab: no rafters to reach, so L-feet on chemical anchors, and
  // sealing is a bead of PU at each penetration — the cheapest of the three.
  slopedLFootSetPerPanel: 780, // 4 × HDG/SS L-foot + chemical anchor
  slopedSealRccPerPanel: 190, // EPDM washer + PU sealant per module
  // Mangalore/clay tile: an ADJUSTABLE hook that reaches past the tile to the
  // batten/rafter, so more steel and more adjustment than an L-foot. Sealing is
  // a lead/EPDM flashing plate per hook, plus a tile lifting + breakage
  // allowance (tiles crack on lift; that is an allowance, never a count).
  tileHookSetPerPanel: 980, // 4 × adjustable HDG/SS tile roof hook + bolts
  tileFlashingPerPanel: 340, // flashing plate per hook + tile breakage allowance
  ballastBlock: 240,
  walkwayPerM2: 1450,
  safetyRailPerM: 1150,
  laUnit: 4800,
  downConductorPerM: 140,
  earthingPit: 2650,
  dcdb: 4200,
  acdb: 5200,
  combinerBox: 8500, // string combiner box (SCB/AJB) with busbar + isolator + SPD
  stringFuse: 120, // gPV string fuse (per pole)
  dcOptimizer: 3400, // per-module DC optimiser (MLPE)
  spdDc: 1900,
  spdAc: 2200,
  netMeter: 6500,
  generationMeter: 3200,
  fastenersKit: 1800,
  signageKit: 950,
  installationPerKw: 2500, // labour
  transportLumpsum: 6000,
  // Site-dependent rates. These back the qty-0 prompt lines: the rate is a
  // representative figure so that typing a quantity immediately produces a
  // number, but the QUANTITY is the surveyor's to give — nothing in the model
  // can see whether a crane can reach the roof.
  cranePerDay: 12000, // hydra / crane hire incl. operator
  scaffoldingPerDay: 3500,
  civilWorksLumpsum: 15000, // pedestal PCC, chasing, waterproofing touch-up
  trenchingPerM: 450, // excavate, sand-bed, backfill for buried LT run
};

/**
 * The shape of a price book. Consumers should take prices from
 * `resolveCatalog().pricebook` (or `BomContext.pricebook`) and use this type for
 * their signatures, so an imported book substitutes cleanly for the bundled one.
 */
export type PriceBook = typeof PRICE_BOOK;

/**
 * Keys whose value is a plain ₹ rate.
 *
 * Not every entry is one any more: the by-size cable tables are lookups, not
 * rates. A line that prices itself as `PRICE_BOOK[someKey]` may only point at
 * a scalar, and saying so in the type is what stopped the compiler from
 * letting a line quote an OBJECT as its unit price.
 */
export type PriceKey = {
  [K in keyof PriceBook]: PriceBook[K] extends number ? K : never;
}[keyof PriceBook];

/**
 * Rate for a derived conductor size.
 *
 * Falls UP to the next size the book prices, never down: quoting a 25 sq.mm
 * run at the 16 sq.mm rate would understate the job, and understating is the
 * failure that costs the installer money. Past the end of the book it returns
 * the dearest rung — still an understatement, but the size ladder itself tops
 * out at 240 mm², so this is only reachable via a hand-edited price book.
 */
export function cableRatePerM(table: Record<number, number>, mm2: number): number {
  const sizes = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  const hit = sizes.find((s) => s >= mm2);
  return table[hit ?? sizes[sizes.length - 1]];
}

export const DEFAULT_MARGIN_PCT = 12;
