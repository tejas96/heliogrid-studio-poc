// ─── Cascade deletion: no entity may outlive the object it depends on ───────
// Roof reshape has a full dependency-review dialog, but deletion previously
// removed ONLY the roof: its panels kept counting in capacity/energy/BOM, its
// obstructions became ground-level shadow casters, and strings kept dead panel
// ids. These pure helpers return ONE atomic Partial<Project> patch so a delete
// (applied via the normal undoable update) can never leave orphans.
import type { PlacedPanel, Project, StringDef } from '../types';
import { reindexAll } from './segment-ops';

/** Drop dead panel ids from every string; a string with no panels left is removed. */
/**
 * A home run serving a string that no longer exists is dead copper: it would
 * still be counted, priced and quoted. Routes die with the strings they serve.
 * Conditional so a project without routes is returned untouched (and keeps its
 * byte-identical fingerprint).
 */
function pruneRoutes(project: Project, survivingStrings: StringDef[]): Partial<Project> {
  if (!project.cableRoutes) return {};
  const alive = new Set(survivingStrings.map((s) => s.id));
  return {
    cableRoutes: project.cableRoutes.filter(
      (r) => r.kind !== 'string_homerun' || alive.has(r.fromRef),
    ),
  };
}

function pruneStrings(strings: StringDef[], deadPanelIds: Set<string>): StringDef[] {
  return strings
    .map((s) => ({ ...s, panelIds: s.panelIds.filter((id) => !deadPanelIds.has(id)) }))
    .filter((s) => s.panelIds.length > 0);
}

/** Reindex segment grids for the surviving panels (drops emptied tables). */
function reindexed(
  project: Project,
  segments: Project['segments'],
  panels: PlacedPanel[],
): { segments: Project['segments']; panels: PlacedPanel[] } {
  const spec = project.components.panel;
  if (!spec) return { segments, panels };
  return reindexAll(project.roofs, spec, segments, panels);
}

/**
 * Delete a roof and EVERYTHING that lives on it: panels, segments, on-roof
 * obstructions, walkways, rails, arresters and wall-mounted inverters; strings
 * are pruned of the removed panels.
 */
export function cascadeDeleteRoof(project: Project, roofId: string): Partial<Project> {
  const deadPanelIds = new Set(
    project.panels.filter((p) => p.roofId === roofId).map((p) => p.id),
  );
  const keptPanels = project.panels.filter((p) => p.roofId !== roofId);
  const keptSegments = project.segments.filter((s) => s.roofId !== roofId);
  const { segments, panels } = reindexed(project, keptSegments, keptPanels);
  const survivingStrings = pruneStrings(project.strings, deadPanelIds);
  return {
    roofs: project.roofs.filter((r) => r.id !== roofId),
    panels,
    segments,
    obstructions: project.obstructions.filter((o) => o.roofId !== roofId),
    walkways: project.walkways.filter((w) => w.roofId !== roofId),
    rails: project.rails.filter((r) => r.roofId !== roofId),
    arresters: project.arresters.filter((a) => a.roofId !== roofId),
    inverterPlacements: project.inverterPlacements.filter((i) => i.roofId !== roofId),
    keepouts: project.keepouts.filter((k) => k.roofId !== roofId),
    strings: survivingStrings,
    ...pruneRoutes(project, survivingStrings),
  };
}

/**
 * Delete a set of panels: strings are pruned of exactly those panels (instead
 * of wholesale-clearing all strings) and affected tables are reindexed.
 */
export function cascadeDeletePanels(project: Project, panelIds: string[]): Partial<Project> {
  const dead = new Set(panelIds);
  const remaining = project.panels.filter((p) => !dead.has(p.id));
  const { segments, panels } = reindexed(project, project.segments, remaining);
  const strings = pruneStrings(project.strings, dead);
  return {
    panels,
    segments,
    strings,
    ...pruneRoutes(project, strings),
  };
}
