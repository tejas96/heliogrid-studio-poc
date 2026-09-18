import type { BomLine } from '../../../types';
import type { BomContext } from '../context';
import { line } from '../line';
import { MATERIALS } from '../../mms/catalogue';
import { validateMms } from '../../mms/validate';
import { foundationVolumeM3, ruleFor } from '../../foundation';
import { isNoPenetrationRoof } from '../../roof-plane';

/** Detailed lines join the existing BOM registry/export/override pipeline. */
export function emitMms(ctx: BomContext): BomLine[] {
  const out: BomLine[] = [];
  const findings = validateMms(ctx.project, ctx.structures);
  for (const s of ctx.structures.filter(s => s.mms)) {
    const c = s.mms!;
    const seg = ctx.project.segments.find(seg => seg.id === s.segmentId)!;
    const roof = ctx.project.roofs.find(r => r.id === seg.roofId);
    const notice =findings.some(f => f.segmentId === s.segmentId && f.status === 'error') ? 'GEOMETRIC CONFLICT — resolve before procurement. ' : '';
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
    // The plate the model actually DRAWS — `ruleFor` is what `foundationAssembly`
    // builds the plate part from, and it honours the MMS plate size only for the
    // kinds whose plate that setting governs. Naming `c.anchor.plateSizeMm`
    // unconditionally printed 200 × 200 against a pile whose drawn plate is
    // 140 × 140 and a pedestal whose drawn plate is 160 × 160.
    const plateRule = ruleFor(s.foundation, s.foundationShape, c);
    add('base_plate', `Base plates · ${seg.label}`, `${plateRule.plateMm} × ${plateRule.plateMm} × ${plateRule.plateThkMm} mm`, total('plates'), 'nos', ctx.pricebook.basePlatePc, `${bases} support positions`);
    add('anchor', `${c.anchor.type} anchors · ${seg.label}`, `M${c.anchor.diameterMm} · embedment ${c.anchor.embedmentMm == null ? 'NOT SUPPLIED' : c.anchor.embedmentMm + ' mm'} · spacing ${c.anchor.spacingMm} mm`, total('anchors'), 'nos', ctx.pricebook.anchorBoltPc, `${c.anchor.count} per support, counted from connections; capacity NOT calculated`);
    // A precast block has a rate in the pricebook; a custom one is whatever the
    // site casts, so only the catalogue type may carry a price.
    // On a membrane every block bears on the covering, so every block needs the
    // pad that keeps concrete off bitumen. Counted from the same node graph as
    // the blocks themselves, so the two can never disagree.
    if (roof && isNoPenetrationRoof(roof)) {
      add('membrane_pad', `Membrane protection pads · ${seg.label}`, 'Geotextile / recycled-rubber pad under every bearing point, oversized to the block', total('ballast'), 'nos', ctx.pricebook.membraneProtectionMatPc, 'One per ballast block. A block set straight onto bitumen abrades it, and in rooftop heat the bitumen softens and the block creeps into it');
      if (c.strategy === 'aero_tray') add('aero_tray', `Aerodynamic ballast tray · ${seg.label}`, 'Closed east–west tub; the back panel turns uplift into downforce', ctx.project.panels.filter(p => p.enabled && p.segmentId === seg.id).length, 'nos', ctx.pricebook.aeroTrayPerPanel, 'One tub per module. ASSUMED market rate — a real tender prices a named vendor. The downforce claim is the VENDOR’s and is not modelled here');
    }
    add('ballast', `Ballast blocks · ${seg.label}`, `${c.ballast.type} · ${c.ballast.lengthM} × ${c.ballast.widthM} × ${c.ballast.heightM} m · ${c.ballast.massKg} kg/block`, total('ballast'), 'nos', c.ballast.type === 'precast_concrete' ? ctx.pricebook.ballastBlock : 0, `${c.ballast.blocksPerSupport} per support · ${total('ballast') * c.ballast.massKg} kg declared mass`);
    // A GROUND table is founded in earth, and `emitMechanical` skips any segment
    // that carries an MMS (`if (st.mms) continue`) so the detailed graph is not
    // counted twice. Without the two lines below that skip took the foundations
    // out of the quote ENTIRELY — not at ₹0, but absent, which nothing flags. At
    // ₹1650 a pile that is about ₹5 lakh missing on a 300-pile farm.
    const pile = ruleFor('pile');
    add('pile', `Ground foundation — driven pile · ${seg.label}`, `HDG post · Ø${pile.d} mm · ${pile.embedMm} mm embedment ASSUMED`, total('piles'), 'nos', ctx.pricebook.pileFoundation, `1 pile per leg base, counted from the connection graph. Embedment and pull-out are SOIL-dependent — geotechnical survey and engineer sign-off required`);
    const pedestal = ruleFor('concrete', s.foundationShape);
    add('pedestal', `Concrete pedestal · ${seg.label}`, `${pedestal.shape} · ${foundationVolumeM3(pedestal).toFixed(3)} m³ each · size ASSUMED`, total('pedestals'), 'nos', ctx.pricebook.concretePedestal, `1 pedestal per leg base, counted from the connection graph. Plan size is NOT calculated from uplift or overturning`);
    // An AC hook bolt is its own part: it reaches PAST the sheet and wraps the
    // purlin, so it is neither an L-foot standing on a structural crown nor a
    // tile hook reaching a batten. Pricing it as `sheetStandoff` (₹210, a metal
    // shed's L-foot) under-buys it on every fixing of every module.
    const acHook = ['hook_bolt', 'ac_spreader'].includes(c.strategy);
    const attachment = ['standing_seam', 'clamp_mounted'].includes(c.strategy) ? 'Standing-seam clamps' : acHook ? `Hook bolts${c.strategy === 'ac_spreader' ? ' + load-spreading brackets' : ''} · AC sheet` : ['roof_hook', 'adjustable_hook'].includes(c.strategy) ? 'Roof hooks' : c.strategy === 'direct_sheet' ? 'Direct sheet fixings' : c.strategy === 'rafter_mounted' ? 'Rafter attachments' : c.strategy === 'purlin_mounted' ? 'Purlin clamps / L-brackets' : 'Sheet fixing / L-bracket';
    // The L-foot through a sheet crown is the one attachment the pricebook
    // rates per piece (`sheetStandoff`). A standing-seam clamp and a tile hook
    // are priced per PANEL there, not per node, so mapping them onto this count
    // would invent a number — they stay unpriced until a per-piece rate exists.
    const standoffRate = ['standing_seam', 'clamp_mounted', 'roof_hook', 'adjustable_hook'].includes(c.strategy) ? 0 : acHook ? ctx.pricebook.acHookBoltPc : ctx.pricebook.sheetStandoff;
    add('attachment', `${attachment} · ${seg.label}`, acHook ? `HDG J-bolt around purlin${c.strategy === 'ac_spreader' ? ' + load-spreading bracket' : ' + crown bracket'} · ${c.attachmentSpacingM} m centres` : `Nominal assembly · ${c.attachmentSpacingM} m centres · manufacturer approval required`, total('standoffs'), 'nos', standoffRate, acHook ? 'Counted at rail-to-purlin nodes. The bolt reaches PAST the sheet: the sheet carries nothing. Purlin spacing and sheet condition are NOT measured — fragile-roof survey required' : 'Counted at rail-to-roof nodes; surveyed structure alignment not verified');
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
    // An AC sheet's seal is not a shed's ₹12 EPDM washer. The hole is at the
    // crown of a brittle corrugation and cannot be re-tightened later without
    // cracking the sheet, so it is a bitumen + EPDM pair under a dished GI cap
    // with a mastic bead — made once, and priced accordingly.
    if (!['standing_seam', 'clamp_mounted', 'roof_hook', 'adjustable_hook'].includes(c.strategy)) add('seals', `${acHook ? 'Hook-bolt seal set' : 'Sealing washers'} · ${seg.label}`, acHook ? 'Bitumen + EPDM washer pair, dished GI cap and mastic bead' : 'EPDM · penetration seal', total('sealingWashers'), 'nos', acHook ? ctx.pricebook.acSheetSealPc : ctx.pricebook.sealingWasher, acHook ? 'Counted at sheet penetrations. Sheet breakage during fixing is NOT included — an old AC sheet cracks and the allowance is site- and age-dependent' : 'Counted at sheet penetrations');
  }
  return out;
}