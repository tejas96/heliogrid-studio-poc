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

const MM = 0.001;

/**
 * Parts for one node, positioned relative to the node point.
 *
 * `roof_anchor` is deliberately absent: it is the foundation, and
 * `foundationAssembly` already owns it. Returning [] here for it keeps the two
 * from ever drawing the same thing twice.
 */
export function nodeHardware(kind: NodeKind): FoundationPart[] {
  switch (kind) {
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
