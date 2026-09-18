// ─── Node hardware: what a joint LOOKS like ─────────────────────────────────
// Everything under a leg has been drawn since 22k (foundationAssembly). Nothing
// ELSE was: clamps, bolted joints and sheet standoffs were modelled, counted
// and BILLED — the quote lists 28 mid clamps and 16 end clamps off the node
// graph — but never rendered. So ghosting the modules to inspect the structure
// showed rails with nothing holding anything to them, which is the one thing
// that view exists to show.
//
// Same shape as FoundationPart so the renderer keeps ONE loop, and same rule:
// dimensions here are nominal hardware sizes, not calculated ones. They are
// representation, not engineering — no quantity is ever read back from them.
import type { FoundationPart } from './foundation';
import type { NodeKind } from './structure';
import type { MmsConfig } from './mms/types';

const MM = 0.001;

/**
 * Parts for one node, positioned relative to the node point.
 *
 * `roof_anchor` is deliberately absent: it is the foundation, and
 * `foundationAssembly` already owns it. Returning [] here for it keeps the two
 * from ever drawing the same thing twice.
 */
export function nodeHardware(kind: NodeKind, mms?: MmsConfig, boltCount?: number): FoundationPart[] {
  const parts = nominalNodeHardware(kind, mms);
  if (!mms || boltCount === undefined) return parts;
  const filtered = parts.filter(p => p.bucket !== 'bolt');
  const count = Math.min(16, Math.max(0, boltCount));
  for (let i = 0; i < count; i++) filtered.push({ bucket: 'bolt', geometry: 'cylinder', size: { x: .012, y: .018, z: .012 }, offset: { x: count === 1 ? 0 : (i % 2 ? .024 : -.024), y: kind.startsWith('panel_clamp') ? .044 : .016, z: count > 2 ? (Math.floor(i / 2) ? .012 : -.012) : 0 } });
  return filtered;
}
function nominalNodeHardware(kind: NodeKind, mms?: MmsConfig): FoundationPart[] {
  if (kind === 'sheet_standoff' && mms) {
    const base: FoundationPart = { bucket: 'standoff', geometry: 'box', size: { x: .05, y: .08, z: .012 }, offset: { x: 0, y: .05, z: 0 } };
    if (['standing_seam', 'clamp_mounted'].includes(mms.strategy)) return [
      { ...base, size: { x: .026, y: .05, z: .065 }, offset: { x: -.021, y: .035, z: 0 } },
      { ...base, size: { x: .026, y: .05, z: .065 }, offset: { x: .021, y: .035, z: 0 } },
      { bucket: 'bolt', geometry: 'cylinder', size: { x: .012, y: .03, z: .012 }, offset: { x: 0, y: .08, z: 0 } },
    ];
    // AC hook bolt: the J-bolt reaches PAST the sheet and hooks the purlin, so
    // what you see from above is a bracket on the crown, the threaded shank
    // standing proud of it, and the dished cap and nut that seal the hole. An
    // L-foot standing on the sheet would draw the wrong load path, which is the
    // one thing an installer must not read off this picture.
    if (['hook_bolt', 'ac_spreader'].includes(mms.strategy)) return [
      // the bracket on the crown — wider on the spreader variant, which is the
      // whole difference between the two
      { ...base, size: { x: mms.strategy === 'ac_spreader' ? .28 : .09, y: .008, z: .05 }, offset: { x: 0, y: .004, z: 0 } },
      // shank standing proud, then cap + nut
      { bucket: 'bolt', geometry: 'cylinder', size: { x: .012, y: .07, z: .012 }, offset: { x: 0, y: .043, z: 0 } },
      { ...base, size: { x: .034, y: .01, z: .034 }, offset: { x: 0, y: .013, z: 0 } },
      { bucket: 'clamp', geometry: 'box', size: { x: .019, y: .012, z: .019 }, offset: { x: 0, y: .078, z: 0 } },
    ];
    if (['roof_hook', 'adjustable_hook'].includes(mms.strategy)) return [
      { ...base, size: { x: .12, y: .006, z: .035 }, offset: { x: -.035, y: .006, z: 0 } },
      { ...base, size: { x: .006, y: .085, z: .035 }, offset: { x: .025, y: .05, z: 0 } },
      { ...base, size: { x: .05, y: .006, z: .035 }, offset: { x: 0, y: .095, z: 0 } },
    ];
  }
  switch (kind) {
    case 'rail_splice':
      return [{ bucket: 'plate', geometry: 'box', size: { x: .2, y: .003, z: .035 }, offset: { x: 0, y: -.02, z: 0 } }];
    case 'bonding_lug':
      return [{ bucket: 'clamp', geometry: 'box', size: { x: .025, y: .01, z: .02 }, offset: { x: 0, y: -.02, z: .025 } }];
    case 'cable_clip':
      return [{ bucket: 'clamp', geometry: 'box', size: { x: .015, y: .025, z: .006 }, offset: { x: 0, y: -.02, z: .025 } }];
    // A mid clamp bridges two modules and sits ON the rail, so it straddles the
    // node rather than hanging under it.
    case 'panel_clamp_mid':
      return [
        {
          bucket: 'clamp',
          geometry: 'box',
          size: { x: 32 * MM, y: 34 * MM, z: 46 * MM },
          offset: { x: 0, y: 20 * MM, z: 0 },
        },
      ];
    // An end clamp grips ONE module, so it is the wider casting — the same
    // distinction the BOM prices separately.
    case 'panel_clamp_end':
      return [
        {
          bucket: 'clamp',
          geometry: 'box',
          size: { x: 40 * MM, y: 34 * MM, z: 52 * MM },
          offset: { x: 0, y: 20 * MM, z: 0 },
        },
      ];
    // Bolted joints: leg→rafter and rafter→purlin. A small plate with the bolt
    // head proud of it — enough to read as a connection at inspection zoom.
    case 'leg_rafter':
      return [
        {
          bucket: 'plate',
          geometry: 'box',
          size: { x: 70 * MM, y: 8 * MM, z: 70 * MM },
          offset: { x: 0, y: 0, z: 0 },
        },
        {
          bucket: 'bolt',
          geometry: 'cylinder',
          size: { x: 12 * MM, y: 28 * MM, z: 12 * MM },
          offset: { x: 0, y: 14 * MM, z: 0 },
        },
      ];
    case 'rafter_purlin':
      return [
        {
          bucket: 'bolt',
          geometry: 'cylinder',
          size: { x: 10 * MM, y: 26 * MM, z: 10 * MM },
          offset: { x: 0, y: 8 * MM, z: 0 },
        },
      ];
    case 'brace_bolt':
      return [
        {
          bucket: 'bolt',
          geometry: 'cylinder',
          size: { x: 10 * MM, y: 22 * MM, z: 10 * MM },
          offset: { x: 0, y: 0, z: 0 },
        },
      ];
    // The L-foot that carries a rail on a metal shed. It stands ON the sheet,
    // so it rises from the node rather than straddling it, and it is the height
    // the monorail builder lifts its rails by.
    case 'sheet_standoff':
      return [
        {
          bucket: 'standoff',
          geometry: 'box',
          size: { x: 50 * MM, y: 100 * MM, z: 8 * MM },
          offset: { x: 0, y: 50 * MM, z: 0 },
        },
        {
          bucket: 'plate',
          geometry: 'box',
          size: { x: 60 * MM, y: 6 * MM, z: 60 * MM },
          offset: { x: 0, y: 3 * MM, z: 0 },
        },
      ];
    default:
      return []; // roof_anchor — foundationAssembly owns it
  }
}
