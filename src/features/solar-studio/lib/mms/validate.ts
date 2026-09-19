import type { Project, XY } from '../../types';
import { intersectPolygons, polygonArea, rectCorners, stripFootprint, pointSegDist } from '../geo';
import { isNoPenetrationRoof, surfaceHeightAt } from '../roof-plane';
import { refitShiftAfterTurn } from '../layout';
import { validateStructure, type SegmentStructure, type Member } from '../structure';
import { foundationFootprints } from './parts';
import type { MmsFinding } from './types';

/** Lowest clear height under a canopy that a car can actually use, m. Below
 *  this the first vehicle through takes the structure with it. */
const CARPORT_MIN_CLEAR_M = 2.2;

const resultCache = new WeakMap<Project, { structures: SegmentStructure[]; result: MmsFinding[] }>();
/** Central roof-aware validation. Result IDs are stable and refer to the rendered graph. */
export function validateMms(project: Project, structures: SegmentStructure[]): MmsFinding[] {
  const cached = resultCache.get(project); if (cached?.structures === structures) return cached.result;
  const out: MmsFinding[] = [];
  for (const s of structures) {
    const seg = project.segments.find(x => x.id === s.segmentId);
    const roof = project.roofs.find(x => x.id === seg?.roofId);
    if (!seg || !roof || !s.mms) continue;
    const cfg = s.mms;
    // Open ground is a boundary, not a roof. The geometry checks are the same;
    // what they are checking against is not, and saying "roof" there reads as a
    // bug on a free-field array.
    const ground = roof.roofType === 'ground';
    const add = (code: string, status: MmsFinding['status'], message: string, ids: string[] = []) => out.push({ id: `${seg.id}/${code}/${ids.join(',')}`, segmentId: seg.id, code, status, message, componentIds: ids });
    if (![cfg.railInsetRatio, cfg.attachmentSpacingM, cfg.edgeClearanceM, cfg.obstacleClearanceM].every(Number.isFinite) || cfg.railInsetRatio < 0 || cfg.railInsetRatio >= .45 || cfg.attachmentSpacingM < .15 || cfg.edgeClearanceM < 0) add('configuration', 'error', 'Invalid spacing or clamp inset configuration.');
    const zones: { id: string; label: string; poly: XY[]; bottom: number; top: number }[] = [];
    for (const o of project.obstructions.filter(o => o.roofId === roof.id || o.roofId === null)) {
      const poly = o.shape === 'circle' ? Array.from({ length: 32 }, (_, i) => ({ x: o.center.x + Math.cos(i * Math.PI / 16) * o.diameterM / 2, y: o.center.y + Math.sin(i * Math.PI / 16) * o.diameterM / 2 })) : rectCorners(o.center, o.lengthM, o.widthM, o.rotationDeg);
      const bottom = o.roofId ? surfaceHeightAt(roof, o.center) : 0;
      zones.push({ id: o.id, label: o.label, poly, bottom, top: bottom + o.heightM + cfg.obstacleClearanceM });
    }
    for (const k of project.keepouts.filter(k => k.roofId === roof.id && k.kind !== 'shade')) zones.push({ id: k.id, label: k.kind, poly: k.shape, bottom: roof.heightM, top: Infinity });
    for (const w of project.walkways.filter(w => w.roofId === roof.id)) zones.push({ id: w.id, label: 'walkway / access clearance', poly: stripFootprint(w.a, w.b, w.widthMm), bottom: roof.heightM, top: roof.heightM + w.heightMm / 1000 + 2.1 });
    if (roof.parapet.enabled) roof.polygon.forEach((a, i) => {
      if (roof.parapet.perEdge?.[i] === false) return;
      const b = roof.polygon[(i + 1) % roof.polygon.length];
      zones.push({ id: `parapet-${i}`, label: 'parapet', poly: stripFootprint(a, b, roof.parapet.widthM * 2000), bottom: roof.heightM, top: Math.max(surfaceHeightAt(roof, a), surfaceHeightAt(roof, b)) + roof.parapet.heightM });
    });
    // ON A WALL, "inside the boundary" is the wrong question ────────────────
    // Both tests below ask whether a component's PLAN footprint sits within the
    // roof polygon. A facade's components are bolted to the FACE of that
    // polygon and stand proud of it — the bracket, then the rail, then the
    // module — so every one of them is outside it by construction, and by an
    // amount that is exactly right. Left in, it reported 22 errors on a
    // perfectly built wall (caught in the browser), which is worse than no
    // check at all: it buries the real findings. What actually constrains a
    // facade is its ELEVATION, and `lib/drc.ts` judges the modules there.
    const wall = roof.roofType === 'facade';
    const checkFootprint = (id: string, poly: XY[], bottom: number, top: number, member?: Member) => {
      const area = Math.abs(polygonArea(poly));
      const inside = intersectPolygons(poly, roof.polygon).reduce((sum, p) => sum + Math.abs(polygonArea(p)), 0);
      if (!wall && area - inside > 1e-7) add('roof_boundary', 'error', `MMS component extends outside the ${ground ? 'array area' : 'roof'} boundary.`, [id]);
      else if (!wall && cfg.edgeClearanceM > 0 && poly.some(p => roof.polygon.some((a, i) => pointSegDist(p, a, roof.polygon[(i + 1) % roof.polygon.length]).d < cfg.edgeClearanceM))) add('edge_clearance', 'warning', `MMS is inside the requested ${ground ? 'boundary setback' : 'roof-edge'} clearance.`, [id]);
      for (const z of zones) {
        if (bottom >= z.top || top <= z.bottom) continue;
        const overlap = intersectPolygons(poly, z.poly).flat();
        if (!overlap.length) continue;
        if (member) {
          const dx = member.b.x - member.a.x, dy = member.b.y - member.a.y, d2 = dx * dx + dy * dy;
          const heights = overlap.map(p => member.a.z + (member.b.z - member.a.z) * (d2 ? Math.max(0, Math.min(1, ((p.x - member.a.x) * dx + (p.y - member.a.y) * dy) / d2)) : 0));
          if (d2 > 1e-8 && Math.min(...heights) - .04 >= z.top) continue;
        }
        add(`clash-${z.id}`, 'error', `MMS intersects ${z.label}.`, [id]);
      }
    };
    for (const m of s.members) {
      if (!Number.isFinite(m.lengthM) || m.lengthM < .01 || (m.kind.includes('leg') && m.b.z <= m.a.z)) { add('invalid_member', 'error', 'Member has invalid or non-positive buildable dimensions.', [m.id]); continue; }
      const width = (Math.max(m.profile?.dims?.h ?? 60, m.profile?.dims?.b ?? 40)) / 1000;
      const vertical = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y) < .001;
      checkFootprint(m.id, vertical ? rectCorners(m.a, width, width, 0) : stripFootprint(m.a, m.b, width * 1000), Math.min(m.a.z, m.b.z) - width / 2, Math.max(m.a.z, m.b.z) + width / 2, m);
    }
    for (const n of s.nodes.filter(n => n.kind === 'roof_anchor')) {
      for (const p of foundationFootprints(s, n).filter(p => ['ballast', 'plate', 'pedestal'].includes(p.part.bucket))) {
        checkFootprint(n.id, p.polygon, p.bottom, p.top);
      }
    }
    for (const message of validateStructure(s)) add('assembly', 'error', message);
    // When the table has been TURNED by its mounting system and still hangs off
    // the roof, the boundary errors above are true but not useful: they name
    // every member that is outside without saying why any of them is. The turn
    // is why. `refitShiftAfterTurn` has already slid it as far as it can, so a
    // null here means no slide exists — the table is longer than the roof is
    // wide in its new orientation, and what it needs is a re-fill, not a nudge.
    if (
      ['dual_tilt', 'tracker_hsat'].includes(seg.racking.kind) &&
      out.some((f) => f.segmentId === seg.id && f.code === 'roof_boundary') &&
      project.components.panel &&
      refitShiftAfterTurn(roof, project.components.panel, seg, project.panels) === null
    )
      add('turned_table_refit', 'error', `This system runs the table east–west, so the whole frame is turned — and turned, it is larger than ${roof.name} can hold. Re-fill this roof in the new orientation, or choose a system that keeps the table facing as it is.`);
    // A flush SHEET monorail has no footing at all: it carries rails on fixings
    // through the covering, and `foundation: 'anchor'` is only "the nearest
    // truth" the field can hold (structure.ts). Running the anchor checks on it
    // put "anchor embedment, substrate and certified capacities are incomplete"
    // on a roof with no anchors in it — a true-sounding sentence about a part
    // that is not in the design, in the panel an engineer reads for real ones.
    const hasFooting = s.nodes.some((n) => n.kind === 'roof_anchor');
    if (hasFooting && (s.foundation === 'anchor' || s.foundation === 'concrete')) {
      const a = cfg.anchor;
      // On a STONE SLAB the "anchor" is a bracket clamped to a steel joist, not
      // a chemical anchor drilled into a substrate: embedment means nothing and
      // the substrate is the beam. The certified capacity question is still real
      // — it is the clamp's — so the finding is reworded, not dropped.
      if (!a.embedmentMm || !a.substrate || !a.tensileCapacityKn || !a.shearCapacityKn) add('anchor_incomplete', 'warning', roof.roofType === 'stone_slab' ? 'Joist clamp certified tensile/shear capacity and the beam section it grips are not supplied — an embedment depth does not apply to a clamp.' : 'Anchor embedment, substrate and certified tensile/shear capacities are incomplete.');
      if (!Number.isInteger(a.count) || a.count < 2 || a.count > 16 || a.diameterMm <= 0 || a.spacingMm + a.diameterMm >= a.plateSizeMm || a.spacingMm <= 0 || a.plateThicknessMm <= 0) add('anchor_position', 'error', 'Invalid anchor count, spacing, diameter or base-plate edge distance.', s.nodes.filter(n => n.kind === 'roof_anchor').map(n => n.id));
    }
    if (s.foundation === 'ballast') {
      const b = cfg.ballast;
      if (![b.lengthM, b.widthM, b.heightM, b.massKg].every(v => Number.isFinite(v) && v > 0) || !Number.isInteger(b.blocksPerSupport) || b.blocksPerSupport < 1 || b.blocksPerSupport > 20) add('ballast_invalid', 'error', 'Ballast dimensions, mass and quantity must be positive; maximum 20 blocks per support.');
      add('ballast_resistance', 'not_calculated', 'Sliding, overturning and uplift: engineering verification required.');
    }
    // On a FACADE there is no roof profile, no seam and no purlin to confirm.
    // What has to be confirmed is the WALL: what it is built of and whether the
    // bracket lands on a column or on a panel spanning between them.
    if (seg.racking.kind === 'flush' && !cfg.attachmentVerified) add('attachment_unverified', 'warning', roof.roofType === 'facade' ? 'Confirm the wall construction, the column grid behind it and the bracket manufacturer’s capacity in that substrate at survey.' : 'Confirm roof profile, seam/purlin/rafter locations and manufacturer attachment capacity at survey.');
    // Waterproofing membrane. One rule, and it admits no exception.
    if (isNoPenetrationRoof(roof)) {
      if (!['membrane_ballast', 'aero_tray', 'custom'].includes(cfg.strategy))
        add('membrane_penetration', 'error', 'This mounting system fixes THROUGH the covering. Nothing penetrates a waterproofing membrane — a hole is a leak and a voided warranty. Use a ballasted system.');
      add('membrane_uplift', 'not_calculated', 'Ballast mass is set by WIND UPLIFT and limited by what the deck can carry, with more ballast at edges and corners (IS 875 Part 3). Neither the uplift nor the deck capacity is calculated here — the block count shown is a placeholder for an engineer’s check.');
      add('membrane_protection', 'warning', 'Every bearing point needs a protection layer. Concrete set straight onto bitumen abrades it, and in rooftop heat the bitumen softens and the block creeps and sinks into it.');
      add('membrane_warranty', 'warning', 'Loading the membrane voids its warranty unless the membrane manufacturer inspects and accepts the design in writing. Confirm before any material reaches the roof.');
    }
    // Floating. Everything here is about the water, because the array is not
    // attached to anything solid at all.
    if (roof.roofType === 'floating') {
      add('float_level_range', 'not_calculated', 'The WATER-LEVEL RANGE governs this design and is not modelled. On an Indian reservoir the level can move several metres between seasons, and that range sets every mooring line length. The mooring figures in the BOM are a placeholder for a mooring design, not a result.');
      add('float_bed', 'not_calculated', 'Whether an anchor can hold where it is drawn depends on the BED — silt, rock or weed — and on the depth. Both need a bathymetry and bed survey; neither is assumed here.');
      add('float_wind_wave', 'warning', 'Wind fetch across open water and the wave it raises drive the loads in the floats, the connectors and the mooring. Not calculated — an FPV structural design is a marine engineering exercise, not a rooftop one.');
      if (cfg.strategy !== 'float_raft')
        add('float_access', 'warning', 'Nobody walks on a pure float. Every cleaning visit, module swap and fault trace needs a floating walkway or a boat — check the O&M route exists before this layout is fixed.');
    }
    // Carport. Cars drive under it, so two of these are about people and metal
    // moving at speed, not about the array.
    if (roof.roofType === 'carport') {
      const clear = seg.racking.kind === 'flush' ? 0 : Math.max(seg.racking.frontLegM, seg.racking.clearanceM ?? 0);
      if (clear < CARPORT_MIN_CLEAR_M)
        add('carport_headroom', 'error', `Only ${clear.toFixed(2)} m of clear height under the canopy. A car needs about 2.1 m and an SUV or small van about 2.4 m — at this height the first vehicle through takes the structure with it.`);
      add('carport_uplift', 'not_calculated', 'Wind UPLIFT governs an open canopy, not dead load: the wind gets at both faces and the whole moment is taken at the post base. Nothing here is calculated — the frame, the footing and the hold-down are an engineer’s design (IS 875 Part 3).');
      add('carport_drainage', 'warning', 'The modules ARE this roof. The gutter and downpipes are counted, but the falls and the point the water discharges to — a surface drain, a soakaway, a storm connection — are not modelled and must be designed.');
      add('carport_bays', 'warning', 'Post positions come from the structural spacing, not from the car park’s bay layout. Check every post lands on a bay line and not in the middle of a bay or a drive aisle before anything is set in concrete.');
    }
    // Facade. The array hangs off a wall, so every one of these is about
    // something a rooftop design never has to answer.
    if (roof.roofType === 'facade') {
      add('facade_anchorage', 'not_calculated', 'The bracket count is derived; the HOLDING POWER is not. A wall may be RCC, solid brick, hollow block or an infill panel spanning between columns, and those differ by an order of magnitude — so whether a bracket lands on a column or on a panel matters as much as how many there are. On-site pull tests and a signed anchorage design are required before ordering.');
      add('facade_wind', 'not_calculated', 'Wind on a wall-mounted plane is a CLADDING pressure case, not a roof one: IS 875 Part 3 external pressure coefficients apply, they are worst at the corners and edges of the elevation, and they act both ways on a module standing off the wall. None of it is calculated here.');
      add('facade_fire', 'warning', 'The gap behind the modules is a CAVITY, and a cavity behind cladding is a chimney. NBC 2016 Part 4 requires it interrupted at every floor level — the BOM carries one run of cavity barrier and cannot know the floor count, so multiply it by the floors this band crosses. Combustibility of the module backsheet and of anything in the cavity is a fire-consultant question.');
      add('facade_yield', 'warning', 'A VERTICAL plane intercepts far less than an optimally tilted one at Indian latitudes, and it is shaded early and late by whatever stands opposite. The energy figures here do model that honestly — vertical tilt, half the sky, half the ground reflection — so read the yield before this is sold as a rooftop-equivalent array. A facade is usually chosen for the building, not for the kWh.');
      if (!['facade_rail', 'facade_spandrel'].includes(cfg.strategy))
        add('facade_wrong_fixing', 'error', 'This mounting system founds on a horizontal surface — legs, ballast or a cast footing. A wall has none of those. Use a wall-bracket rail system or a curtain-wall spandrel infill.');
    }
    // Stone slab on joists. Looks like a flat deck, is not one.
    if (roof.roofType === 'stone_slab') {
      add('stone_beam_line', 'not_calculated', 'Every leg must land on a JOIST, not on the slab between them. Joist size, spacing and corrosion are not modelled — where the beams actually run is a survey output, and it decides whether this table can be built where it is drawn.');
      add('stone_no_slab_fixing', 'warning', 'Nothing is fixed INTO the slab. A 30 mm limestone plate spanning between beams splits on a chemical anchor and cracks under a point load; brackets reach the joist through a mortar joint, which is re-pointed afterwards.');
      if (!['stone_beam_clamp', 'stone_spread_ballast', 'custom'].includes(cfg.strategy))
        add('stone_wrong_fixing', 'error', 'This mounting system bears on the deck. A stone slab is not a deck — the load has to reach the joist below, or be spread across several slabs on pads.');
    }
    // Asbestos-cement. These three are the reason this covering is not a metal
    // shed with a different texture, and they are about people before money.
    if (roof.roofType === 'ac_sheet') {
      add('fragile_roof', 'warning', 'FRAGILE ROOF. Nobody stands on asbestos-cement sheet. Crawling boards bearing on the purlins, a roof ladder and edge protection are required before anyone goes up.');
      add('asbestos_method', 'warning', 'Drilling asbestos-cement releases fibre. Wet-drill or reuse existing fixing holes, never cut or grind, bag the debris, and work to a written method statement with an authorised disposal route.');
      add('ac_sheet_condition', 'not_calculated', 'Sheet age, thickness, and purlin size, spacing and corrosion are not modelled. Whether this roof can carry a fixing at all is a fragile-roof survey and an engineer’s decision.');
      if (!['hook_bolt', 'ac_spreader', 'custom'].includes(cfg.strategy)) add('ac_wrong_fixing', 'error', 'This fixing bears on the sheet. Asbestos-cement carries nothing — the load path must reach the purlin, which means a hook bolt.');
    }
    if (cfg.strategy === 'direct_sheet') add('direct_sheet_capacity', 'warning', 'Direct-sheet mounting requires explicit sheet thickness, pull-out and manufacturer approval.');
    if (cfg.strategy === 'adjustable') add('adjustment_lock', 'warning', 'Selected tilt is modelled; slotted adjustment and locking hardware require manufacturer detail.');
    if (roof.pitchDeg > 0 && ['industrial_custom', 'custom', 'elevated', 'high_height'].includes(cfg.strategy)) add('pitched_elevation', 'warning', 'Pitched-roof elevated load path is not defined; roof-following rails are shown, not an engineered elevated frame.');
    add('clamp_zone', 'warning', 'Rail inset is configured; confirm against the module manufacturer’s permitted clamp zones.');
    if (ground) {
      // There is no slab to overload on open ground — lib/drc.ts makes the same
      // exclusion. What is unknown instead is the SOIL, and a driven pile's whole
      // capacity lives there.
      add('soil_capacity', 'not_calculated', 'Soil bearing, embedment depth and pile pull-out require a geotechnical survey and engineer sign-off.');
      if (seg.racking.kind === 'tracker_hsat') add('tracker_hardware', 'warning', 'Torque tube, bearings, drive and controller are manufacturer hardware. The model shows posts, tubes and modules — not a certified tracker assembly.');
      // Dual-axis. Four things a single-axis field never has to answer.
      if (seg.racking.kind === 'tracker_azel') {
        add('azel_hardware', 'warning', 'Mast, slew ring, linear actuator, drive and controller are manufacturer hardware, and the frame size assumed here is what sets how many of each you buy. The model shows masts, frames and modules — not a certified tracker assembly.');
        // A WARNING and not an error: `error` in this panel means the geometry
        // as drawn conflicts, and the BOM prefixes those with "GEOMETRIC
        // CONFLICT". A missing wind stow is not something the model can see in
        // the drawing — it is a requirement on the machine that is bought.
        add('azel_wind_stow', 'warning', 'A dual-axis frame MUST stow flat in high wind, and its structural rating assumes the stow works. Without a proven anemometer and stow chain this is a pointed sail on a single mast — the one failure that takes the whole unit and its pier with it. Confirm the stow wind speed, the power-failure behaviour and the manual override before this is built (IS 875 Part 3).');
        add('azel_spacing', 'not_calculated', 'A pointed frame cannot backtrack its way out of its own shadow the way a single-axis row can — only DISTANCE keeps one unit out of the next one\'s light, so a dual-axis field takes far more land per kWp. The spacing used here is an assumption; the shading figures come from raycasting this design as drawn, so read them before the land area is fixed.');
        add('azel_om', 'warning', 'Two driven axes per unit, and one unit per eight modules — this is an order of magnitude more moving parts than a fixed field, and every one of them is an annual service item and a failure mode. Price the O&M contract for it, not for a fixed array.');
      }
      if (cfg.strategy === 'ground_seasonal') add('seasonal_position', 'warning', 'One seasonal tilt position is modelled. Summer and winter angles, slotted travel and locking hardware require manufacturer detail.');
    } else if (roof.roofType === 'floating') {
      // There is no structure under a floating array to overload — it is on
      // water. What has to be checked is the float and the mooring, which
      // `float_wind_wave` and `float_level_range` above say outright.
    } else if (roof.roofType === 'carport') {
      // There is no roof under a canopy — it stands on its own footings in a
      // car park. Asking for "roof structural capacity" here names a structure
      // that is not in the design; what actually has to be checked is the frame
      // and the footing, which `carport_uplift` above says outright.
    } else if (roof.roofType === 'facade') {
      // Nothing is standing on a deck here — a facade hangs. "Roof structural
      // capacity in kPa" is the wrong question and the wrong unit: what carries
      // this array is the WALL in tension and shear at each bracket, which
      // `facade_anchorage` above asks for by name.
    } else if (!project.mmsEngineering?.roofCapacityKpa) add('roof_capacity', 'not_calculated', 'Roof structural capacity unavailable — engineering verification required.');
    if (!project.mmsEngineering?.basicWindSpeedMs || !project.mmsEngineering?.terrainCategory) add('wind_incomplete', 'warning', 'Wind configuration incomplete (IS 875 Part 3).');
    if (!out.some(f => f.segmentId === seg.id && f.status === 'error')) add('geometry_clear', 'pass', 'No geometric conflicts detected in the modelled members and attachments.');
  }
  const result = [...new Map(out.map(f => [f.id, f])).values()];
  resultCache.set(project, { structures, result });
  return result;
}