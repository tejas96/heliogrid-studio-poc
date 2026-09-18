import type { ArraySegment, PanelSpec } from '../../types';
// the leaf, NOT '../structure': that file calls this one, and the pair
// importing each other is the import loop `npm run cycles` refuses
import type { Member, SegmentStructure, XYZ } from '../structure-model';
import { STRUCTURE_PROFILES } from '../../data/profiles';
import { MATERIALS } from './catalogue';

/** Extend, never replace, the existing deterministic member/node graph. */
export function enrichMmsStructure(s: SegmentStructure, seg: ArraySegment, _spec: PanelSpec): SegmentStructure {
  if (!seg.mms) return s;
  const mms = seg.mms;
  s.mms = mms;
  const rails = s.members.filter(m => m.kind === 'purlin');
  const legs = s.members.filter(m => m.kind === 'front_leg' || m.kind === 'back_leg');
  const rafters = s.members.filter(m => m.kind === 'rafter');
  const nodesFor = (id: string) => s.nodes.filter(n => n.memberIds.includes(id));
  const shifted = new Set<XYZ>();
  const lower = (p: XYZ, amount: number) => { if (!shifted.has(p)) { p.z -= amount; shifted.add(p); } };
  // Separate the stacked section axes. Modules retain their existing authoritative pose.
  for (const r of rafters) { r.a = { ...r.a }; r.b = { ...r.b }; lower(r.a, .065); lower(r.b, .065); }
  for (const l of legs) {
    // rafter endpoints can alias leg tops; avoid moving a shared point twice.
    if (!shifted.has(l.b)) lower(l.b, .065);
    l.b.z -= .065;
    l.lengthM = length(l.a, l.b);
  }
  // Carry rafters on longitudinal beams at the two leg lines, including custom stations.
  for (const kind of ['front_leg', 'back_leg'] as const) {
    const line = legs.filter(l => l.kind === kind);
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1].b, b = line[i].b;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rail = rails.find(r => Math.abs(dx * (r.b.y - r.a.y) - dy * (r.b.x - r.a.x)) < .001 && length(a, b) <= r.lengthM + .01 && pointLineDistance(a, r) < .05 && pointLineDistance(b, r) < .05);
      // Never bridge separate rows or holes: endpoints must project onto this run.
      if (!rail || pointLineDistance(a, rail) > .05 || pointLineDistance(b, rail) > .05) continue;
      const id = `${seg.id}/m/beam/${kind}/${i}`;
      s.members.push({ id, kind: 'beam', a: { ...a }, b: { ...b }, lengthM: length(a, b), profileKey: line[i].profileKey });
      for (const at of [a, b]) s.nodes.push({ id: `${id}/joint/${at === a ? 0 : 1}`, kind: 'leg_rafter', position: { ...at }, memberIds: [id], fastenerSpec: { bolts: 2 } });
    }
  }
  const railProfile = STRUCTURE_PROFILES.find(p => p.key === 'top_hat') ?? STRUCTURE_PROFILES[0];
  // Inset the rails and their attached clamps together, within the module clamp zone.
  const originalRails = rails.map(r => ({ a: { ...r.a }, b: { ...r.b } }));
  for (let i = 0; i < rails.length; i++) {
    const rail = rails[i];
    const count = seg.racking.kind === 'flush' ? 2 : Math.max(1, seg.racking.purlinCount ?? 2);
    const group = originalRails.slice(Math.floor(i / count) * count, Math.floor(i / count) * count + count);
    const front = group[0], back = group[group.length - 1];
    if (!front || !back) continue;
    // Cache original endpoints before any member is moved.
    const original = rail.a;
    const midpoint = { x: (front.a.x + back.a.x) / 2, y: (front.a.y + back.a.y) / 2, z: (front.a.z + back.a.z) / 2 };
    const k = mms.railInsetRatio * 2;
    const delta = { x: (midpoint.x - original.x) * k, y: (midpoint.y - original.y) * k, z: (midpoint.z - original.z) * k };
    const move = (p: XYZ): XYZ => ({ x: p.x + delta.x, y: p.y + delta.y, z: p.z + delta.z });
    rail.a = move(rail.a); rail.b = move(rail.b);
    rail.kind = 'rail'; rail.profileKey = railProfile.key;
    for (const n of nodesFor(rail.id)) n.position = move(n.position);
  }
  // Diagonal wind bracing, not a horizontal bar mislabeled as a brace.
  for (const brace of s.members.filter(m => m.kind === 'brace')) {
    const nearest = (p: XYZ) => legs.find(l => Math.hypot(l.a.x - p.x, l.a.y - p.y) < .01);
    const a = nearest(brace.a), b = nearest(brace.b);
    if (a && b) { brace.a = { ...a.a, z: a.a.z + .06 }; brace.b = { ...b.b, z: b.b.z - .06 }; }
    const ns = nodesFor(brace.id); ns.forEach((n, i) => { n.position = { ...(i ? brace.b : brace.a) }; });
  }
  for (const node of s.nodes.filter(n => n.kind === 'roof_anchor')) {
    if (s.foundation === 'ballast') node.fastenerSpec = { plates: 1, ballast: mms.ballast.blocksPerSupport };
    else if (s.foundation === 'anchor' || s.foundation === 'concrete') node.fastenerSpec.anchors = mms.anchor.count;
  }
  for (const node of s.nodes.filter(n => n.kind === 'panel_clamp_end' || n.kind === 'panel_clamp_mid')) node.fastenerSpec.bolts = 1;
  const profiles = seg.racking.kind === 'flush' ? undefined : seg.racking.profiles;
  const base = seg.racking.kind === 'flush' ? railProfile : seg.racking.profile;
  s.steelKg = 0;
  for (const value of Object.values(s.memberSummary)) { value.count = 0; value.totalM = 0; }
  for (const member of s.members) {
    const declared = member.kind === 'rail' ? railProfile : member.kind.includes('leg') ? profiles?.legs ?? base : member.kind === 'rafter' ? profiles?.rafters ?? base : profiles?.purlins ?? base;
    member.profile = { ...declared, kgPerM: declared.kgPerM * MATERIALS[mms.material].density / 7850, ...(mms.material === 'aluminium' || mms.material === 'stainless_steel' ? { isGrade: undefined, coating: undefined } : {}) };
    member.profileKey = declared.key;
    member.lengthM = length(member.a, member.b);
    const summary = s.memberSummary[member.kind] ?? (s.memberSummary[member.kind] = { count: 0, totalM: 0 });
    summary.count++; summary.totalM += member.lengthM;
    s.steelKg += member.lengthM * member.profile.kgPerM;
  }
  s.steelKg = Math.round(s.steelKg * 1000) / 1000;
  for (const rail of s.members.filter(m => m.kind === 'rail')) {
    const pitch = Math.max(.3, mms.railStockLengthM);
    const at = (u: number): XYZ => ({ x: rail.a.x + (rail.b.x - rail.a.x) * u, y: rail.a.y + (rail.b.y - rail.a.y) * u, z: rail.a.z + (rail.b.z - rail.a.z) * u });
    for (let i = 1; i * pitch < rail.lengthM; i++) s.nodes.push({ id: `${rail.id}/splice/${i}`, kind: 'rail_splice', position: at(i * pitch / rail.lengthM), memberIds: [rail.id], fastenerSpec: { bolts: 4 } });
    s.nodes.push({ id: `${rail.id}/bond`, kind: 'bonding_lug', position: at(.08), memberIds: [rail.id], fastenerSpec: { bolts: 1 } });
    s.nodes.push({ id: `${rail.id}/cable`, kind: 'cable_clip', position: at(.5), memberIds: [rail.id], fastenerSpec: {} });
  }
  s.warnings = s.warnings.filter(w => !w.includes('sheet fixings'));
  return s;
}
function length(a: XYZ, b: XYZ) { return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
function pointLineDistance(p: XYZ, m: Member) {
  const dx = m.b.x - m.a.x, dy = m.b.y - m.a.y, d2 = dx * dx + dy * dy;
  const t = d2 ? ((p.x - m.a.x) * dx + (p.y - m.a.y) * dy) / d2 : 0;
  if (t < -.001 || t > 1.001) return Infinity;
  return Math.hypot(p.x - m.a.x - t * dx, p.y - m.a.y - t * dy);
}