import type { BomLine } from '../../../types';
import type { BomContext } from '../context';
import { line } from '../line';
import { MATERIALS } from '../../mms/catalogue';
import { validateMms } from '../../mms/validate';

/** Detailed lines join the existing BOM registry/export/override pipeline. */
export function emitMms(ctx: BomContext): BomLine[] {
  const out: BomLine[] = [];
  const findings = validateMms(ctx.project, ctx.structures);
  for (const s of ctx.structures.filter(s => s.mms)) {
    const c = s.mms!;
    const seg = ctx.project.segments.find(seg => seg.id === s.segmentId)!;
    const notice = findings.some(f => f.segmentId === s.segmentId && f.status === 'error') ? 'GEOMETRIC CONFLICT — resolve before procurement. ' : '';
    const add = (key: string, item: string, spec: string, qty: number, unit: string, unitPriceInr: number, formula: string) => {
      if (!qty) return;
      out.push(line({ key: 'mech.mms_component', instance: `${s.segmentId}:${key}`, category: 'Mechanical BOS', item, spec: `${unitPriceInr === 0 ? 'UNPRICED · ' : ''}${spec}`, qty, unit, unitPriceInr, formula: `${notice}${formula}. PRELIMINARY — engineer verification required.${unitPriceInr === 0 ? ' UNPRICED: supplier quotation required; zero is not a free component.' : ' Catalogue rate is an estimate; confirm supplier pricing.'}`, sourceSegmentId: seg.id, sourceRoofId: seg.roofId, confidence: 'derived' }));
    };
    const groups = new Map<string, typeof s.members>();
    for (const m of s.members) { const key = `${m.kind}:${m.profileKey}`; const list = groups.get(key) ?? []; list.push(m); groups.set(key, list); }
    for (const [key, members] of groups) {
      const first = members[0];
      const length = members.reduce((sum, m) => sum + m.lengthM, 0);
      const weight = members.reduce((sum, m) => sum + m.lengthM * (m.profile?.kgPerM ?? 0), 0);
      const rate = c.material === 'galvanized_steel' ? ctx.pricebook.steelPerKg : 0;
      add(key, `MMS ${first.kind.replaceAll('_', ' ')} · ${seg.label}`, `${MATERIALS[c.material].label} · ${first.profile?.sectionMm ?? first.profileKey} · ${members.length} pieces · ${length.toFixed(3)} m · ${weight.toFixed(2)} kg`, Math.round(weight * 1000) / 1000, 'kg', rate, `Actual member graph; ${members.length} members, ${length.toFixed(3)} m total`);
    }
    const total = (key: keyof typeof s.nodes[number]['fastenerSpec']) => s.nodes.reduce((sum, n) => sum + (n.fastenerSpec[key] ?? 0), 0);
    const bases = s.nodes.filter(n => n.kind === 'roof_anchor').length;
    add('base_plate', `Base plates · ${seg.label}`, `${c.anchor.plateSizeMm} × ${c.anchor.plateSizeMm} × ${c.anchor.plateThicknessMm} mm`, total('plates'), 'nos', ctx.pricebook.basePlatePc, `${bases} support positions`);
    add('anchor', `${c.anchor.type} anchors · ${seg.label}`, `M${c.anchor.diameterMm} · embedment ${c.anchor.embedmentMm == null ? 'NOT SUPPLIED' : c.anchor.embedmentMm + ' mm'} · spacing ${c.anchor.spacingMm} mm`, total('anchors'), 'nos', ctx.pricebook.anchorBoltPc, `${c.anchor.count} per support, counted from connections; capacity NOT calculated`);
    // A precast block has a rate in the pricebook; a custom one is whatever the
    // site casts, so only the catalogue type may carry a price.
    add('ballast', `Ballast blocks · ${seg.label}`, `${c.ballast.type} · ${c.ballast.lengthM} × ${c.ballast.widthM} × ${c.ballast.heightM} m · ${c.ballast.massKg} kg/block`, total('ballast'), 'nos', c.ballast.type === 'precast_concrete' ? ctx.pricebook.ballastBlock : 0, `${c.ballast.blocksPerSupport} per support · ${total('ballast') * c.ballast.massKg} kg declared mass`);
    const attachment = ['standing_seam', 'clamp_mounted'].includes(c.strategy) ? 'Standing-seam clamps' : ['roof_hook', 'adjustable_hook'].includes(c.strategy) ? 'Roof hooks' : c.strategy === 'direct_sheet' ? 'Direct sheet fixings' : c.strategy === 'rafter_mounted' ? 'Rafter attachments' : c.strategy === 'purlin_mounted' ? 'Purlin clamps / L-brackets' : 'Sheet fixing / L-bracket';
    // The L-foot through a sheet crown is the one attachment the pricebook
    // rates per piece (`sheetStandoff`). A standing-seam clamp and a tile hook
    // are priced per PANEL there, not per node, so mapping them onto this count
    // would invent a number — they stay unpriced until a per-piece rate exists.
    const standoffRate = ['standing_seam', 'clamp_mounted', 'roof_hook', 'adjustable_hook'].includes(c.strategy) ? 0 : ctx.pricebook.sheetStandoff;
    add('attachment', `${attachment} · ${seg.label}`, `Nominal assembly · ${c.attachmentSpacingM} m centres · manufacturer approval required`, total('standoffs'), 'nos', standoffRate, 'Counted at rail-to-roof nodes; surveyed structure alignment not verified');
    // Clamps and bolts carry the SAME pricebook rates the pre-MMS mechanical
    // lines used. They were shipped at zero, so turning a table over to MMS
    // quietly took real money out of the quote: on a 2000-module C&I job the
    // clamps alone are over two lakh. "Manufacturer clamp zone to confirm" is
    // an engineering caveat about WHERE they go, never a reason to price the
    // part at nothing. What stays unpriced below is what the pricebook truly
    // has no rate for.
    for (const kind of ['panel_clamp_end', 'panel_clamp_mid'] as const) add(kind, `${kind === 'panel_clamp_end' ? 'End' : 'Mid'} clamps · ${seg.label}`, `Module clamp · manufacturer clamp zone to confirm`, s.nodes.filter(n => n.kind === kind).reduce((sum, n) => sum + (n.fastenerSpec.clamps ?? 0), 0), 'nos', kind === 'panel_clamp_end' ? ctx.pricebook.endClamp : ctx.pricebook.midClamp, 'Counted from module-support connections');
    add('bolts', `Connection bolts · ${seg.label}`, 'Nominal M10 / M12; connection schedule to confirm', total('bolts'), 'nos', ctx.pricebook.structureBoltPc, 'Counted at beam / rafter / rail / brace joints');
    for (const kind of ['rail_splice', 'bonding_lug', 'cable_clip'] as const) add(kind, `${kind.replaceAll('_', ' ')} · ${seg.label}`, 'Nominal hardware · manufacturer detail required', s.nodes.filter(n => n.kind === kind).length, 'nos', 0, 'Counted from the connection graph');
    if (!['standing_seam', 'clamp_mounted', 'roof_hook', 'adjustable_hook'].includes(c.strategy)) add('seals', `Sealing washers · ${seg.label}`, 'EPDM · penetration seal', total('sealingWashers'), 'nos', ctx.pricebook.sealingWasher, 'Counted at sheet penetrations');
  }
  return out;
}