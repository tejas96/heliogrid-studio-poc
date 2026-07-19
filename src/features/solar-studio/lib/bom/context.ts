// ─── Everything the emitters share, computed once ───────────────────────────
// deriveBom used to compute all of this as ~90 lines of locals interleaved with
// the emission, so the panel buckets sat in the middle of the mechanical lines
// and the cable routing sat in the middle of the electrical ones. Pulling them
// here makes each emitter a pure function of the context.
import type { InverterSpec, PanelSpec, PlacedPanel, Project } from '../../types';
import type { CombinerPlan } from '../electrical/combiner';
import { combinerPlan } from '../electrical/combiner';
import type { SegmentStructure } from '../structure';
import { fastenerTotals, projectStructures } from '../structure';
import { estimateDcCableM } from '../stringing';
import { acCableFromRoutes, dcCableFromRoutes } from '../routing';
import { resolveRules } from '../../data/rules/india';
import type { MarketRules } from '../../data/rules/india';
import { isSloped } from '../roof-plane';

/** Inverter → meter run we cannot measure: the service entry is not modelled. */
export const AC_ALLOWANCE_M = 25;

/**
 * The coverings a flush-hardware, unstructured, non-ground, non-metal-shed
 * face can have: a PITCHED face (RCC slab or tile), or a FLAT tile deck —
 * tile always takes hook hardware, whatever the pitch. Metal shed and ground
 * keep their own buckets; RCC slab vs tile take genuinely different hardware.
 */
export type SlopedCovering = 'rcc_flat' | 'tile';

export interface BomContext {
  project: Project;
  /** enabled panels only — the BOM never bills a disabled module */
  panels: PlacedPanel[];
  n: number;
  kwp: number;
  spec: PanelSpec;
  inv: InverterSpec;
  invCount: number;
  rules: MarketRules;

  // ── Electrical
  routedDc: ReturnType<typeof dcCableFromRoutes>;
  routedAc: ReturnType<typeof acCableFromRoutes>;
  dcCableM: number;
  acRunM: number;
  conduitM: number;
  /** null unless central topology AND strings exist */
  combiner: CombinerPlan | null;

  // ── Mechanical
  structures: SegmentStructure[];
  fasteners: ReturnType<typeof fastenerTotals>;
  structuredPanelIds: Set<string>;
  /** the four DISJOINT panel buckets — they sum to `n` */
  nFlatRcc: number;
  nMetal: number;
  nGround: number;
  nSloped: number;
  nStructured: number;
  slopedByCovering: Map<SlopedCovering, number>;
  /** roof ids contributing to each pitched covering bucket, for source attribution */
  slopedRoofIdsByCovering: Map<SlopedCovering, string[]>;
  flatRccRoofIds: string[];
  metalRoofIdList: string[];
  groundRoofIdList: string[];
}

/**
 * Returns null for the early-exit condition deriveBom has always had: without a
 * panel spec, an inverter or a single enabled module there is nothing to bill.
 */
export function buildContext(project: Project): BomContext | null {
  const spec = project.components.panel;
  const inv = project.components.inverter;
  const panels = project.panels.filter((p) => p.enabled);
  const n = panels.length;
  if (!spec || !inv || n === 0) return null;

  const rules = resolveRules();
  const kwp = (n * spec.watt) / 1000;
  const invCount = project.components.inverterCount;

  // ── Cable comes from ROUTED geometry when routes exist (plan §F2/task 29):
  // home runs + only the intra-string hops too long for the module leads, plus
  // real slack. The legacy estimator is the labelled fallback for designs that
  // predate routing — it double-counts module links and floors at 30 m, so it
  // reads HIGH; never present it as a routed quantity.
  const routedDc = dcCableFromRoutes(project);
  const dcCableM = routedDc.routed
    ? routedDc.meters
    : Math.max(30, estimateDcCableM(project.strings, project.panels));
  const routedAc = acCableFromRoutes(project);
  const acRunM = routedAc.routed ? routedAc.meters : AC_ALLOWANCE_M;
  const conduitM = Math.round((routedDc.routed ? routedDc.ductM : dcCableM / 2) + acRunM);

  // ── DC collection: central/C&I topology adds fused string-combiner boxes
  // (30e). Only when the user selects it AND strings exist (else the SLD/BOM
  // would invent hardware for a residential string-inverter system).
  const central =
    (project.components.inverterTopology ?? 'string') === 'central' && project.strings.length > 0;
  const plan = central ? combinerPlan(project.strings, spec) : null;

  // ── Mechanical BOS — structured (elevated) segments get REAL tonnage from
  // the member/node graph (lib/structure.ts); flat per-panel prices remain
  // only for what the model does not cover (metal-shed flush, loose panels).
  const structures = projectStructures(project);
  const structuredPanelIds = new Set(
    structures.flatMap((st) => {
      const seg = project.segments.find((sg) => sg.id === st.segmentId);
      return project.panels
        .filter((pp) => pp.enabled && pp.segmentId === seg?.id)
        .map((pp) => pp.id);
    }),
  );
  const metalRoofIds = new Set(
    project.roofs.filter((r) => r.roofType === 'metal_shed').map((r) => r.id),
  );
  // DISJOINT buckets: a structured panel is billed ONLY via the member model,
  // even on a metal shed; the remainder never goes negative
  const nStructured = panels.filter((p) => structuredPanelIds.has(p.id)).length;
  const metalPanels = panels.filter(
    (p) => metalRoofIds.has(p.roofId) && !structuredPanelIds.has(p.id),
  );
  const nMetal = metalPanels.length;
  // A ground array is NOT rooftop RCC: different table, different foundation,
  // different price. Without its own bucket a loose ground panel would print
  // "elevated RCC, 10° tilt legs" on the customer's quote.
  const groundRoofIds = new Set(
    project.roofs.filter((r) => r.roofType === 'ground').map((r) => r.id),
  );
  const groundPanels = panels.filter(
    (p) => groundRoofIds.has(p.roofId) && !structuredPanelIds.has(p.id),
  );
  const nGround = groundPanels.length;
  // A PITCHED face is not an elevated flat deck. makeRoof stamps every roof
  // 'rcc_flat' and the gable/hip/skeleton factories only set pitchDeg, so a
  // sloped roof used to land in nFlatRcc and get quoted ballasted 10° tilt
  // legs it will never receive — wrong price AND wrong spec on a customer
  // document. It needs flush hardware (hooks/L-feet + rail + flashing).
  // `isSloped` (lib/roof-plane) is the codebase's single pitch predicate — the
  // same one layout.ts follows when it sets racking {kind:'flush'} here.
  // A FLAT tile deck belongs here too: defaultPanelPose mounts it FLUSH (you
  // hook through tile, you don't ballast a structure on it), so its panels take
  // the tile hook/flashing lines — never the elevated-RCC tilt legs it used to
  // fall into via nFlatRcc.
  const slopedRoofIds = new Set(
    project.roofs.filter((r) => isSloped(r) || r.roofType === 'tile').map((r) => r.id),
  );
  // Bucket order is precedence: metal-shed and ground keep their existing
  // treatment even when pitched (a metal shed is already flush-clamped, and a
  // ground table sets its own tilt), so this claims only what USED to be
  // mis-billed as elevated RCC.
  const slopedPanels = panels.filter(
    (p) =>
      slopedRoofIds.has(p.roofId) &&
      !structuredPanelIds.has(p.id) &&
      !metalRoofIds.has(p.roofId) &&
      !groundRoofIds.has(p.roofId),
  );
  const nSloped = slopedPanels.length;
  // Split the pitched bucket by COVERING — the bucket total is unchanged (so
  // the four buckets stay disjoint and still sum to the enabled count), but the
  // hardware inside it is now chosen instead of averaged. Metal shed and ground
  // are excluded above, so only RCC slab and tile can appear here.
  const coveringById = new Map(project.roofs.map((r) => [r.id, r.roofType]));
  const slopedByCovering = new Map<SlopedCovering, number>();
  const slopedRoofIdsByCovering = new Map<SlopedCovering, string[]>();
  for (const p of slopedPanels) {
    const cov: SlopedCovering = coveringById.get(p.roofId) === 'tile' ? 'tile' : 'rcc_flat';
    slopedByCovering.set(cov, (slopedByCovering.get(cov) ?? 0) + 1);
    slopedRoofIdsByCovering.set(cov, [...(slopedRoofIdsByCovering.get(cov) ?? []), p.roofId]);
  }
  const nFlatRcc = Math.max(0, n - nMetal - nStructured - nGround - nSloped); // loose/flush on FLAT RCC
  // The flat-RCC bucket is a REMAINDER, not a filter, so it has no panel list of
  // its own; reconstruct the roofs it drew from the same exclusions.
  const flatRccRoofIds = panels
    .filter(
      (p) =>
        !structuredPanelIds.has(p.id) &&
        !metalRoofIds.has(p.roofId) &&
        !groundRoofIds.has(p.roofId) &&
        !slopedRoofIds.has(p.roofId),
    )
    .map((p) => p.roofId);

  return {
    project,
    panels,
    n,
    kwp,
    spec,
    inv,
    invCount,
    rules,
    routedDc,
    routedAc,
    dcCableM,
    acRunM,
    conduitM,
    combiner: plan,
    structures,
    fasteners: fastenerTotals(structures),
    structuredPanelIds,
    nFlatRcc,
    nMetal,
    nGround,
    nSloped,
    nStructured,
    slopedByCovering,
    slopedRoofIdsByCovering,
    flatRccRoofIds,
    metalRoofIdList: metalPanels.map((p) => p.roofId),
    groundRoofIdList: groundPanels.map((p) => p.roofId),
  };
}
