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
  // ── Single-axis tracker hardware. ALL ASSUMED market rates: this tool has no
  // tracker supplier pricebook, and a real tender prices the whole system per
  // MW against a named vendor. Every line that uses these says so, so nobody
  // reads them as a quotation.
  trackerTubePerM: 2650, // HDG torque tube, section + fabrication
  trackerBearingPerPost: 3200, // bearing housing + fasteners at each post
  trackerDrivePerTube: 78000, // slew drive + motor + damper for one row
  trackerControllerPerPlant: 145000, // NCU, wind sensor, wiring, commissioning
  anchorBoltPc: 38, // chemical/expansion anchor per pc
  basePlatePc: 120, // HDG base plate per pc
  structureBoltPc: 14, // M10 SS bolt+nut+washer set per pc
  metalShedClampPerPanel: 420, // flush mount on metal shed: mini-rails + roof clamps per panel
  // ── Asbestos-cement (AC) sheet. A different roof from a metal shed, not a
  // recoloured one, and every figure below is why it needs its own lines.
  //
  // FIXING. A metal shed takes a self-drilling screw or an L-foot standing on
  // the crown: the sheet itself is structural. An AC sheet is not — it is a
  // brittle mineral board that carries only itself — so the fixing is a HOOK
  // BOLT (J-bolt) that reaches past the sheet, wraps the purlin underneath and
  // clamps the bracket down onto the crown from above. More steel, more labour
  // (one person under the roof on every bolt), and it cannot be shot from a gun.
  acHookBoltSetPerPanel: 890, // 4 × HDG J-bolt + crown bracket + nuts, per module
  acHookBoltPc: 240, // one hook-bolt assembly, for the member-model node count
  // SEALING. A hook bolt makes a hole at the highest point of a corrugation and
  // the sheet around it cannot be re-tightened later without cracking, so the
  // seal is a bitumen/EPDM washer pair under a dished GI cap, plus a mastic
  // bead. Dearer than a shed's plain EPDM washer for the same reason: you get
  // one attempt.
  acSheetSealPerPanel: 260, // bitumen + EPDM washer pair, GI cap and mastic, per module
  acSheetSealPc: 65, // the same seal per FIXING — 260 ÷ ~4 bolts, for the member model's node count
  // FRAGILE-ROOF ACCESS. Not optional and not a metal-shed cost: nobody may
  // stand on asbestos cement, so the crew works off crawling boards and roof
  // ladders spanning purlin to purlin, with edge protection. LUMP SUM per AC
  // roof and ESTIMATED — the real figure follows roof area, span and how many
  // crews work at once, none of which this tool models.
  acFragileAccessLumpsum: 28000, // crawling boards, roof ladders, edge protection
  // ── Waterproofing membrane (torch-on / APP bitumen, or single-ply). The
  // covering where NOTHING may be fixed through, so every rate here buys either
  // mass or protection — never a fixing.
  //
  // PROTECTION LAYER. A precast block set straight onto bitumen abrades it, and
  // in Indian rooftop heat the bitumen softens and the block creeps and sinks
  // into it. So every bearing point sits on a slip sheet / protection mat —
  // ordinarily a geotextile or recycled-rubber pad, sized larger than the block.
  membraneProtectionMatPc: 180, // slip sheet / rubber pad per bearing point
  // BALLASTED FRAME, per module: the table plus its blocks and pads, for panels
  // that are not in a member model. ESTIMATED — see the wind note below.
  membraneBallastSetPerPanel: 1180,
  // AERODYNAMIC TRAY, per module. A closed east–west tub whose back panel turns
  // uplift into downforce, so it needs far less concrete than an open ballasted
  // frame. Dearer per module in steel, cheaper in ballast and in roof load.
  // ASSUMED market rate — a real tender prices a named vendor's system.
  aeroTrayPerPanel: 1750,
  // MEMBRANE WARRANTY SIGN-OFF. Loading someone's waterproofing voids the
  // warranty unless the membrane manufacturer inspects and accepts the design.
  // LUMP SUM per membrane roof, ESTIMATED — the fee is the manufacturer's.
  membraneWarrantyLumpsum: 22000, // manufacturer inspection + written acceptance
  // ── Shahabad / Kota stone slab on steel joists. The slab is a 30 mm plate
  // spanning between beams, so nothing bears on the slab: the load reaches the
  // JOIST, or it is spread across several slabs on pads.
  //
  // BEAM CLAMP. A bracket that goes down through a pointed joint and clamps the
  // flange of the RSJ below — more steel and far more labour than a chemical
  // anchor into concrete, because the joint is opened, the beam located by hand
  // and the bracket set from underneath.
  stoneBeamClampSetPerPanel: 1240, // 4 × joist clamp bracket + bolts, per module
  stoneBeamClampPc: 330, // one clamp assembly, for the member model's node count
  // JOINT MAKE-GOOD. Every bracket opens a mortar joint between two slabs and
  // that joint is re-pointed afterwards. Cheap per unit, invisible if forgotten,
  // and the reason an old stone roof starts leaking the monsoon after a solar
  // install.
  stoneJointRepointPc: 85, // rake out and re-point one joint per fixing
  // SPREAD BALLAST pads: wider than a membrane pad, because the point of them
  // here is to bridge ACROSS slabs rather than to protect a surface.
  stoneSpreaderPadPc: 260, // load-spreading pad bearing over two or more slabs
  // SLAB SURVEY. Beam size, spacing and condition, and whether any slab is
  // already cracked, are not modelled and cannot be read off a photograph.
  // LUMP SUM per stone roof, ESTIMATED.
  stoneSlabSurveyLumpsum: 12500, // beam locating, slab condition survey, access
  // ── Carport / canopy. The steel is already priced by weight from the member
  // model; everything here is what a canopy needs and a ROOF never does.
  //
  // DRAINAGE. The modules are the roof, so their run-off lands on the cars
  // unless it is caught. Both are counted from real members with real lengths.
  carportGutterPerM: 940, // HDG/Al box gutter with brackets and end caps
  carportDownpipePerM: 620, // downpipe strapped to the post, plus shoe and outlet
  // FOOTING IN A CAR PARK. Not a ground-array pedestal: the pad is bigger
  // because an open canopy's overturning is taken at the base, and the paving
  // has to be cut, spoil carted away and the surface reinstated afterwards.
  carportFootingEach: 9800, // excavation through paving, RCC pad, backfill
  carportPavingReinstateEach: 2600, // saw-cut, re-lay and make good around each post
  // UNDER-CANOPY LIGHTING. A carport is a place people walk at night. Ordinary
  // scope on every canopy tender, and left out of a solar quote every time.
  carportLightPerBay: 3400, // LED luminaire, wiring and switching per bay
  // ANTI-CRASH. A post in a car park gets hit. Bollards or a kerb at the
  // exposed posts are cheap next to replacing a column and its footing.
  carportBollardEach: 4200, // HDG bollard set in concrete at an exposed post
  // ── Floating (FPV). Nothing here bears on anything: the array floats, and
  // what stops it drifting is the MOORING. Every figure is ASSUMED — a real FPV
  // tender prices a named vendor's float and a mooring designed against the
  // reservoir's own wind fetch and level range.
  //
  // FLOAT BODY, per module. UV-stabilised HDPE, marine grade throughout,
  // and the buoyancy is matched to the module and the wind case.
  floatPontoonPerPanel: 2450, // main float + secondary float + connecting pins
  floatRaftPerPanel: 3350, // steel raft on smaller floats — dearer, and walkable
  // WALKWAY. You cannot walk on a pure float, so O&M needs its own floating
  // path between rows. Per metre of walkway.
  floatWalkwayPerM: 3800, // HDPE walkway float with handrail
  // MOORING. The system that actually holds the plant in position. Line length
  // follows the water-level RANGE, which this tool does not know, so the line
  // is priced per metre and the count of anchor points is an assumption.
  floatMooringLinePerM: 410, // marine rope/chain with thimbles and shackles
  floatAnchorEach: 26000, // bed deadweight or helical anchor, set from a barge
  // CABLE ON WATER. Floating DC cable carried on buoys to a shore riser —
  // not the same product as a buried run.
  floatCablePerM: 780, // floating-grade cable with buoy supports
  // SURVEYS. Bathymetry and a bed survey decide where an anchor can go at all,
  // and the level range decides the mooring. LUMP SUM per water body.
  floatSurveyLumpsum: 185000, // bathymetry, bed survey, level-range records
  // ASBESTOS METHOD STATEMENT. Drilling releases fibre. A written method
  // statement, wet-drilling kit, PPE and bagged debris disposal are a legal
  // requirement, not a nicety. LUMP SUM per AC roof, ESTIMATED — disposal is
  // priced by the state's authorised handler.
  acAsbestosMethodLumpsum: 18500, // method statement, wet-drill kit, PPE, bagged disposal
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
  // ── battery storage (representative 2026 rates)
  /** 2 × 35 sq.mm Cu battery leads, per metre of pair */
  batteryCablePerM: 850,
  /** DC isolator + fuse between battery and inverter, per battery */
  batteryDcIsolator: 3200,
  /** AC-coupled battery inverter / interface kit, per kW of battery power */
  batteryAcInterfacePerKw: 9000,
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
type PriceBook = typeof PRICE_BOOK;

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
