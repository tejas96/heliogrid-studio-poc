// ─── Installation mode (§8.9, Phase 16) ─────────────────────────────────────
// A work order DERIVED from the design — never authored. The sequence comes
// from the structural dependency graph that `lib/structure.ts` already emits:
// you cannot bolt a rafter to a leg that is not standing, and you cannot stand
// a leg on a foundation that has not been set. Encoding that as data (rather
// than as a hand-written list someone must remember to update) is what keeps
// the work order honest when the design changes.
//
// Everything here is PURE and deterministic: ids are structural, never random,
// so a plan regenerated after a reload is byte-identical and the installer's
// tick-boxes still line up with the steps they were ticked against.
import type { BomLine, Project } from '../types';
import { projectStructures } from './structure';
import { mergedBom } from './bom';

/** Coarse trade phases, in the only order they can physically happen. */
export type InstallPhase =
  | 'foundation'
  | 'legs'
  | 'rafters'
  | 'purlins'
  | 'modules'
  | 'stringing'
  | 'bos';

/** Lower rank must be completed before higher rank ON THE SAME SEGMENT. */
export const PHASE_RANK: Record<InstallPhase, number> = {
  foundation: 0,
  legs: 1,
  rafters: 2,
  purlins: 3,
  modules: 4,
  stringing: 5,
  bos: 6,
};

export const PHASE_LABEL: Record<InstallPhase, string> = {
  foundation: 'Set out & foundations',
  legs: 'Columns & legs',
  rafters: 'Rafters',
  purlins: 'Purlins & bracing',
  modules: 'Modules',
  stringing: 'Stringing',
  bos: 'Balance of system',
};

export interface InstallStep {
  /** structural id — `${scope}/install/${phase}`; stable across recomputes */
  id: string;
  phase: InstallPhase;
  title: string;
  detail: string;
  /** how many things this step installs (members, modules, strings…) */
  count: number;
  unit: string;
  roofId?: string;
  segmentId?: string;
  /** design objects to highlight in the scene — reuses the focus mechanism */
  focusIds: string[];
  /** BOM items the crew draws for this step */
  materials: string[];
}

function materialsFor(bom: BomLine[], segmentId?: string, roofId?: string): string[] {
  const hits = bom.filter(
    (l) =>
      (segmentId && l.sourceSegmentId === segmentId) ||
      (roofId && !l.sourceSegmentId && l.sourceRoofId === roofId),
  );
  return [...new Set(hits.map((l) => l.item))];
}

/**
 * The ordered work plan. Roof by roof (project order), each table taken from
 * the ground up, then the electrical work that can only follow the mechanical.
 */
export function installationPlan(project: Project): InstallStep[] {
  const steps: InstallStep[] = [];
  const bom = mergedBom(project);
  const structures = projectStructures(project);
  const byRoof = new Map<string, typeof structures>();
  for (const s of structures) {
    const seg = project.segments.find((g) => g.id === s.segmentId);
    if (!seg) continue;
    const list = byRoof.get(seg.roofId);
    if (list) list.push(s);
    else byRoof.set(seg.roofId, [s]);
  }

  for (const roof of project.roofs) {
    const structs = byRoof.get(roof.id) ?? [];
    for (const st of structs) {
      const seg = project.segments.find((g) => g.id === st.segmentId)!;
      const label = `${roof.name} · table ${seg.label}`;
      const mats = materialsFor(bom, seg.id, roof.id);

      const anchors = st.nodes.filter((n) => n.kind === 'roof_anchor');
      if (anchors.length > 0)
        steps.push({
          id: `${seg.id}/install/foundation`,
          phase: 'foundation',
          title: `${label}: set out and fix ${anchors.length} bases`,
          detail:
            'Mark the leg positions from the layout drawing, then set every base before any steelwork goes up — a leg cannot be plumbed against a base that is still moving.',
          count: anchors.length,
          unit: 'bases',
          roofId: roof.id,
          segmentId: seg.id,
          focusIds: [seg.id],
          materials: mats,
        });

      const legs = st.members.filter(
        (m) => m.kind === 'front_leg' || m.kind === 'back_leg',
      );
      if (legs.length > 0)
        steps.push({
          id: `${seg.id}/install/legs`,
          phase: 'legs',
          title: `${label}: stand ${legs.length} legs`,
          detail: 'Erect and plumb the front and rear legs onto the fixed bases.',
          count: legs.length,
          unit: 'legs',
          roofId: roof.id,
          segmentId: seg.id,
          focusIds: [seg.id],
          materials: mats,
        });

      const rafters = st.members.filter((m) => m.kind === 'rafter');
      if (rafters.length > 0)
        steps.push({
          id: `${seg.id}/install/rafters`,
          phase: 'rafters',
          title: `${label}: fit ${rafters.length} rafters`,
          detail: 'Bolt the rafters across the leg pairs — this is what sets the array tilt.',
          count: rafters.length,
          unit: 'rafters',
          roofId: roof.id,
          segmentId: seg.id,
          focusIds: [seg.id],
          materials: mats,
        });

      const purlins = st.members.filter((m) => m.kind === 'purlin' || m.kind === 'brace');
      if (purlins.length > 0)
        steps.push({
          id: `${seg.id}/install/purlins`,
          phase: 'purlins',
          title: `${label}: fit ${purlins.length} purlins and braces`,
          detail: 'Run the purlins the modules clamp to, then brace the frame before loading it.',
          count: purlins.length,
          unit: 'members',
          roofId: roof.id,
          segmentId: seg.id,
          focusIds: [seg.id],
          materials: mats,
        });

      const mods = project.panels.filter((p) => p.enabled && p.segmentId === seg.id);
      if (mods.length > 0)
        steps.push({
          id: `${seg.id}/install/modules`,
          phase: 'modules',
          title: `${label}: mount ${mods.length} modules`,
          detail: 'Lay modules row by row onto the completed frame, clamping as you go.',
          count: mods.length,
          unit: 'modules',
          roofId: roof.id,
          segmentId: seg.id,
          focusIds: mods.map((m) => m.id),
          materials: mats,
        });
    }

    // modules that belong to this roof but sit outside any structure model
    // (flush / metal-shed / loose) still have to be installed
    const loose = project.panels.filter(
      (p) => p.enabled && p.roofId === roof.id && !structs.some((s) => s.segmentId === p.segmentId),
    );
    if (loose.length > 0)
      steps.push({
        id: `${roof.id}/install/modules`,
        phase: 'modules',
        title: `${roof.name}: mount ${loose.length} modules`,
        detail: 'Fix rails to the roof, then mount and clamp the modules.',
        count: loose.length,
        unit: 'modules',
        roofId: roof.id,
        focusIds: loose.map((m) => m.id),
        materials: materialsFor(bom, undefined, roof.id),
      });
  }

  // Electrical follows the mechanical, in the order the strings were designed.
  for (const s of project.strings)
    steps.push({
      id: `${s.id}/install/stringing`,
      phase: 'stringing',
      title: `Wire ${s.name} (${s.panelIds.length} modules)`,
      detail: `Series-connect the modules of ${s.name} and land it on inverter ${
        s.inverterIndex + 1
      }, MPPT ${s.mpptIndex + 1}. Verify open-circuit voltage before energising.`,
      count: s.panelIds.length,
      unit: 'modules',
      focusIds: s.panelIds,
      materials: [],
    });

  if (project.strings.length > 0)
    steps.push({
      id: 'project/install/bos',
      phase: 'bos',
      title: 'Balance of system',
      detail:
        'Mount the inverter and DCDB/ACDB, run the DC and AC cabling on the routed paths, complete earthing and the lightning protection, then commission.',
      count: 1,
      unit: 'set',
      focusIds: project.inverterPlacements.map((i) => i.id),
      materials: [
        ...new Set(
          bom
            .filter((l) => l.category === 'Electrical BOS' || l.category === 'Safety')
            .map((l) => l.item),
        ),
      ],
    });

  return steps;
}

/** Progress helper — pure, so the UI never counts by hand. */
export function installProgress(
  steps: InstallStep[],
  state: Record<string, boolean> | undefined,
): { done: number; total: number; pct: number } {
  const done = steps.filter((s) => state?.[s.id]).length;
  const total = steps.length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
