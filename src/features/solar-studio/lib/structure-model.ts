// ─── What a built table IS: members, nodes, and the structure they form ──────
// These types lived in `structure.ts`, next to the code that derives them. That
// worked until the MMS generator arrived: `structure.ts` calls
// `mms/generate.enrichMmsStructure`, and the generator needs `Member` and
// `SegmentStructure` to say what it returns — so the two files imported each
// other and `npm run cycles`, a hard gate here, went red.
//
// The fix is the one CLAUDE.md asks for: move the code, never weaken the rule.
// The SHAPE of a structure is a leaf — it depends on nothing but the canonical
// model — so it lives here and both files read it. `structure.ts` re-exports
// every name below, so the forty modules that already import them from there
// are untouched and there is still one front door.
import type { FoundationKind, FoundationShape, StructureProfile } from '../types';
import type { MmsConfig } from './mms/types';

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export type MemberKind =
  | 'front_leg'
  | 'back_leg'
  | 'rafter'
  | 'purlin'
  | 'brace'
  | 'beam'
  /** metal-shed monorail: a rail running along a module row, on standoffs */
  | 'rail'
  /**
   * Carport drainage. On a canopy the MODULES are the roof, so the water they
   * shed lands on whatever is parked underneath unless something catches it.
   * These are real members with a real length and a real price — not a note in
   * a formula — because a carport quoted without them is a carport that rains
   * on the customer's cars.
   */
  | 'gutter'
  | 'downpipe';
export type NodeKind =
  | 'roof_anchor' // leg base: base plate + anchors (or ballast block)
  | 'leg_rafter' // leg top → rafter bolt joint
  | 'rafter_purlin' // purlin resting on a rafter
  | 'panel_clamp_end'
  | 'panel_clamp_mid'
  | 'brace_bolt'
  /** L-foot through the sheet crown into the purlin, with a sealing washer */
  | 'sheet_standoff'
  | 'rail_splice'
  | 'bonding_lug'
  | 'cable_clip';

export interface Member {
  id: string; // `${seg.id}/m/<kind>/<idx>` — structural, deterministic
  kind: MemberKind;
  profileKey: string;
  profile?: StructureProfile;
  a: XYZ;
  b: XYZ;
  lengthM: number;
}

export interface StructureNode {
  id: string; // `${seg.id}/n/<kind>/<idx>`
  kind: NodeKind;
  position: XYZ;
  memberIds: string[];
  /** hardware at this node — Σ over nodes = the fastener BOM */
  fastenerSpec: {
    anchors?: number;
    plates?: number;
    bolts?: number;
    clamps?: number;
    ballast?: number;
    /** driven/rammed galvanised post (ground) */
    piles?: number;
    /** cast-in-situ concrete pedestal (ground) */
    pedestals?: number;
    /** HDPE pontoon under a leg base — floating arrays. Not a footing: it
     *  bears on nothing and carries no dead load anywhere. */
    floats?: number;
    /** metal shed: L-foot fixed through the sheet into the purlin below */
    standoffs?: number;
    /** EPDM washer under every sheet penetration — the waterproofing */
    sealingWashers?: number;
  };
}

export interface SegmentStructure {
  segmentId: string;
  mms?: MmsConfig;
  members: Member[];
  nodes: StructureNode[];
  /** the resolved foundation this table stands on — stamped here so the
   *  renderer, the DRC and the BOM all read ONE answer (§A0) rather than each
   *  re-deriving it from fastenerSpec and drifting */
  foundation: FoundationKind;
  foundationShape: FoundationShape;
  steelKg: number;
  /** total member metres per kind — the BOM formula breakdown */
  /** total member metres per kind — the BOM formula breakdown. The kinds that
   *  only SOME topologies produce are optional, following `beam`: a rooftop
   *  table has no gutter and a carport has no sheet rail, and requiring either
   *  would make every existing structure fixture invalid. */
  memberSummary: Record<Exclude<MemberKind, 'beam' | 'gutter' | 'downpipe'>, { count: number; totalM: number }> &
    Partial<Record<'beam' | 'gutter' | 'downpipe', { count: number; totalM: number }>>;
  warnings: string[];
}
