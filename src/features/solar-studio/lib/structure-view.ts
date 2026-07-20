// ─── Structure-3D view state + editor gating (Phase 22l) ────────────────────
// PURE decisions, deliberately outside the React/three layer. Everything the
// structure editor chooses — which panels to ghost, which foundations a surface
// may even use, whether the profile cards apply at all — is resolved here so it
// can be tested against positive, negative and edge inputs. The component then
// only renders the answer.
//
// NOTHING in this file is persisted. View state must never reach `layoutFp` or
// `designFp`: hiding a panel to look at a rafter is not a design change, and if
// it keyed a fingerprint it would stale every stored capture.
import type { ArraySegment, FoundationKind, PanelSpec, Project, Roof } from '../types';
import { isSloped } from './roof-plane';
import {
  allowedFoundations,
  resolveRacking,
  topologyOf,
  type ResolvedRacking,
  type StructureTopology,
} from './structure';

/** How the SELECTED table's modules are drawn while inspecting its structure. */
export type PanelVisibility = 'show' | 'ghost' | 'hide';
/** Whether the rest of the site stays visible around the selected table. */
export type TableScope = 'all' | 'isolate';

export interface StructureViewState {
  panelVis: PanelVisibility;
  scope: TableScope;
}

/** Ghost-by-default: the point of entering the mode is to see the structure. */
export const DEFAULT_STRUCTURE_VIEW: StructureViewState = { panelVis: 'ghost', scope: 'all' };

/**
 * View state as it must actually be applied.
 *
 * Captures feed the customer proposal, so a capture taken while the modules are
 * hidden would ship a bare-structure hero image. Capture always wins.
 */
export function effectiveView(
  view: StructureViewState,
  opts: { captureMode?: boolean } = {},
): StructureViewState {
  if (opts.captureMode) return { panelVis: 'show', scope: 'all' };
  return view;
}

export interface PanelPartition<T> {
  normal: T[];
  ghost: T[];
  hidden: T[];
}

/**
 * Split panels into how each should be drawn.
 *
 * `selectedSegId === null` means no table is being inspected, so everything is
 * normal regardless of the view — a stale visibility setting must never leak
 * out of the mode and hide half the array.
 */
export function partitionPanels<T extends { segmentId?: string }>(
  panels: T[],
  selectedSegId: string | null,
  view: StructureViewState,
): PanelPartition<T> {
  const out: PanelPartition<T> = { normal: [], ghost: [], hidden: [] };
  if (!selectedSegId) {
    out.normal = [...panels];
    return out;
  }
  for (const p of panels) {
    const mine = p.segmentId === selectedSegId;
    if (mine) {
      if (view.panelVis === 'show') out.normal.push(p);
      else if (view.panelVis === 'ghost') out.ghost.push(p);
      else out.hidden.push(p);
    } else if (view.scope === 'isolate') {
      out.hidden.push(p);
    } else {
      out.normal.push(p);
    }
  }
  return out;
}

/** Structures to draw — isolate drops every table but the selected one. */
export function visibleStructureIds(
  segmentIds: string[],
  selectedSegId: string | null,
  view: StructureViewState,
): Set<string> {
  if (!selectedSegId || view.scope === 'all') return new Set(segmentIds);
  return new Set(segmentIds.filter((id) => id === selectedSegId));
}

// `topologyOf` moved into lib/structure (Phase 22h): the builder has to
// dispatch on it, and importing it back from here would close a cycle. It is
// re-exported so existing view-side imports keep working, and so there is
// still exactly one definition.
export { topologyOf, type StructureTopology } from './structure';

/**
 * Foundations this surface may actually use (plan E1).
 *
 * Empty means the card must not be shown at all — offering "concrete pedestal"
 * on a metal shed would render blocks floating on corrugated steel, and on a
 * pitched roof you cannot cast a level pedestal in the first place.
 */
/**
 * What the PICKER offers. A subset of what the surface can physically carry:
 * ground can take ballast, but pile and pedestal are what you lead with there.
 *
 * It must never offer something `allowedFoundations` would reject, or the UI
 * would present a choice that gets silently corrected on the next read. The
 * gate asserts that containment rather than trusting these to stay in step.
 */
export function foundationOptionsFor(roof: Roof, seg: ArraySegment): FoundationKind[] {
  const allowed = allowedFoundations(roof, seg);
  if (roof.roofType === 'ground') return allowed.filter((k) => k !== 'ballast');
  return allowed;
}

/** Shapes a foundation kind can be cast in. Only a cast pedestal has a choice. */
export function shapeOptionsFor(kind: FoundationKind): ('square' | 'circular')[] {
  // ballast blocks are precast rectangular; piles are driven round; a chemical
  // anchor is a plate, not a cast body
  return kind === 'concrete' ? ['square', 'circular'] : [];
}

export interface StructureEditorState {
  segment: ArraySegment | null;
  roof: Roof | null;
  racking: ResolvedRacking | null;
  topology: StructureTopology;
  /** profile / count controls only apply to a real member model */
  canEditMembers: boolean;
  foundationOptions: FoundationKind[];
  /** why the editor is inert, for the empty state — null when it is usable */
  emptyReason: string | null;
}

/**
 * Everything the structure panel needs, resolved once. Returns an inert state
 * with a REASON rather than throwing or rendering blank cards, because a flush
 * table is a legitimate selection — it simply has no structure to edit.
 */
export function structureEditorState(
  project: Project,
  segId: string | null,
  spec: PanelSpec | null,
): StructureEditorState {
  const inert = (emptyReason: string | null): StructureEditorState => ({
    segment: null,
    roof: null,
    racking: null,
    topology: 'none',
    canEditMembers: false,
    foundationOptions: [],
    emptyReason,
  });

  if (!segId) return inert(null);
  if (!spec) return inert('Select a panel in Step 4 before editing the structure.');

  const segment = project.segments.find((s) => s.id === segId) ?? null;
  if (!segment) return inert('That table no longer exists.');
  const roof = project.roofs.find((r) => r.id === segment.roofId) ?? null;
  if (!roof) return inert('That table’s roof no longer exists.');

  const topology = topologyOf(roof, segment);
  const racking = resolveRacking(project, roof, segment, spec);

  const emptyReason =
    topology === 'flush'
      ? 'This table is flush-mounted — it has no structure model to edit. Switch it to an elevated racking to add one.'
      : topology === 'sheet_monorail'
        ? 'This table sits flush on a metal shed — it mounts on standoffs through the sheet, so there is no foundation to choose.'
        : topology === 'none'
          ? 'Pitched roofs do not carry the elevated member model yet.'
          : null;

  return {
    segment,
    roof,
    racking,
    topology,
    canEditMembers: topology === 'elevated_table' && racking !== null,
    foundationOptions: foundationOptionsFor(roof, segment),
    emptyReason,
  };
}
