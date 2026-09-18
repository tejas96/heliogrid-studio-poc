import type { Project, XY } from '../../types';
import { intersectPolygons, polygonArea, rectCorners, stripFootprint, pointSegDist } from '../geo';
import { surfaceHeightAt } from '../roof-plane';
import { validateStructure, type SegmentStructure, type Member } from '../structure';
import { foundationFootprints } from './parts';
import type { MmsFinding } from './types';

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
    const checkFootprint = (id: string, poly: XY[], bottom: number, top: number, member?: Member) => {
      const area = Math.abs(polygonArea(poly));
      const inside = intersectPolygons(poly, roof.polygon).reduce((sum, p) => sum + Math.abs(polygonArea(p)), 0);
      if (area - inside > 1e-7) add('roof_boundary', 'error', `MMS component extends outside the ${ground ? 'array area' : 'roof'} boundary.`, [id]);
      else if (cfg.edgeClearanceM > 0 && poly.some(p => roof.polygon.some((a, i) => pointSegDist(p, a, roof.polygon[(i + 1) % roof.polygon.length]).d < cfg.edgeClearanceM))) add('edge_clearance', 'warning', `MMS is inside the requested ${ground ? 'boundary setback' : 'roof-edge'} clearance.`, [id]);
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
    if (s.foundation === 'anchor' || s.foundation === 'concrete') {
      const a = cfg.anchor;
      if (!a.embedmentMm || !a.substrate || !a.tensileCapacityKn || !a.shearCapacityKn) add('anchor_incomplete', 'warning', 'Anchor embedment, substrate and certified tensile/shear capacities are incomplete.');
      if (!Number.isInteger(a.count) || a.count < 2 || a.count > 16 || a.diameterMm <= 0 || a.spacingMm + a.diameterMm >= a.plateSizeMm || a.spacingMm <= 0 || a.plateThicknessMm <= 0) add('anchor_position', 'error', 'Invalid anchor count, spacing, diameter or base-plate edge distance.', s.nodes.filter(n => n.kind === 'roof_anchor').map(n => n.id));
    }
    if (s.foundation === 'ballast') {
      const b = cfg.ballast;
      if (![b.lengthM, b.widthM, b.heightM, b.massKg].every(v => Number.isFinite(v) && v > 0) || !Number.isInteger(b.blocksPerSupport) || b.blocksPerSupport < 1 || b.blocksPerSupport > 20) add('ballast_invalid', 'error', 'Ballast dimensions, mass and quantity must be positive; maximum 20 blocks per support.');
      add('ballast_resistance', 'not_calculated', 'Sliding, overturning and uplift: engineering verification required.');
    }
    if (seg.racking.kind === 'flush' && !cfg.attachmentVerified) add('attachment_unverified', 'warning', 'Confirm roof profile, seam/purlin/rafter locations and manufacturer attachment capacity at survey.');
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
      if (cfg.strategy === 'ground_seasonal') add('seasonal_position', 'warning', 'One seasonal tilt position is modelled. Summer and winter angles, slotted travel and locking hardware require manufacturer detail.');
    } else if (!project.mmsEngineering?.roofCapacityKpa) add('roof_capacity', 'not_calculated', 'Roof structural capacity unavailable — engineering verification required.');
    if (!project.mmsEngineering?.basicWindSpeedMs || !project.mmsEngineering?.terrainCategory) add('wind_incomplete', 'warning', 'Wind configuration incomplete (IS 875 Part 3).');
    if (!out.some(f => f.segmentId === seg.id && f.status === 'error')) add('geometry_clear', 'pass', 'No geometric conflicts detected in the modelled members and attachments.');
  }
  const result = [...new Map(out.map(f => [f.id, f])).values()];
  resultCache.set(project, { structures, result });
  return result;
}