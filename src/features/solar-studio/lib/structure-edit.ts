// ─── On-object structure editing (Phase 7 task 26d, §H) ─────────────────────
// ONE pure function powers BOTH the hover ghost and the commit: the preview
// renders `applyStructChoice(project, …)` without patching; clicking patches
// the identical result. Preview === commit by construction — the §H gate.
import type {
  ArraySegment,
  FoundationKind,
  FoundationShape,
  PanelSpec,
  PlacedPanel,
  Project,
  Roof,
  XY,
} from '../types';
import {
  setSegmentRacking,
  setSegmentStructureFields,
  setSegmentTilt,
  setSegmentProfile,
  STRUCTURE_PROFILES,
} from './segment-ops';
import { rectCorners, rectsOverlap } from './geo';
import { panelCornersOnRoof } from './layout';
import { requiredBridgeClearanceM, resolveCapabilities } from './capabilities';
import { resolveRacking } from './structure';
import { resolveRules } from '../data/rules/india';

/** Lowest module edge above grade: keeps vegetation, splash and soiling off
 *  the array. ASSUMED — site drainage and flood history govern the real value. */
const GROUND_CLEARANCE_M = 0.5;
const GROUND_TILT_DEG = () => resolveRules().defaults.groundTiltDeg;

export type StructChoice =
  | { kind: 'preset'; preset: 'flush' | 'standard' | 'walkunder' | 'ground_pile' | 'ground_ballast' }
  | { kind: 'profile'; key: string }
  | { kind: 'tilt'; tiltDeg: number }
  | { kind: 'clearance'; clearanceM: number }
  /** Phase 22l: what the legs stand on. Gated by surface — see foundationOptionsFor. */
  | { kind: 'foundation'; foundation: FoundationKind }
  /** Shuttering form for a CAST foundation — only meaningful for `concrete`. */
  | { kind: 'foundationShape'; shape: FoundationShape }
  /**
   * Customize MMS: the Phase-22g parametrics.
   *
   * `undefined` means "back to the default", and it is passed as undefined
   * rather than as the default VALUE on purpose — `setSegmentStructureFields`
   * deletes the key, so returning a control to its default leaves the segment
   * serialising exactly as it did before anyone touched it. Writing `2` for a
   * purlin count that defaults to 2 would re-key layoutFp and stale every
   * capture for a change that changes nothing.
   */
  | {
      kind: 'mms';
      field: 'purlinCount' | 'rafterMultiplier' | 'endBufferM' | 'bracing';
      value: number | boolean | undefined;
    };

export interface StructPatch {
  segments: ArraySegment[];
  panels: PlacedPanel[];
  /** present when the choice also updates the ROOF's structure intent —
   *  walk-under must survive a clear-all so the NEXT fill bridges again */
  roofs?: Roof[];
}

/**
 * Apply a structure choice to one segment, PURELY — returns the patch the
 * caller either renders (hover preview) or commits (one undoable store
 * patch). Null when the target is missing or the choice is a no-op surface
 * (e.g. profile on flush racking).
 */
export function applyStructChoice(
  project: Project,
  segId: string,
  choice: StructChoice,
): StructPatch | null {
  const seg = project.segments.find((s) => s.id === segId);
  const roof = seg ? project.roofs.find((r) => r.id === seg.roofId) : undefined;
  const spec = project.components.panel;
  if (!seg || !roof || !spec) return null;
  const patch = compute();
  if (!patch) return null;
  // every choice can change the effective under-structure clearance (flush,
  // preset, clearance stepper, defaults-chain fallthrough) — keep bridged
  // panels valid in the SAME undoable patch
  const reconciled = reconcileBridgedPanels(project, patch);
  return reconciled ? { ...patch, panels: reconciled } : patch;

  function compute(): StructPatch | null {
    if (!seg || !roof || !spec) return null;
    switch (choice.kind) {
    case 'preset': {
      if (choice.preset === 'flush') {
        const r = setSegmentRacking(roof, spec, seg, project.panels, 'flush');
        return replace(project, r.segment, r.panels);
      }
      // Ground presets: a free-field table is not a rooftop table. It tilts to
      // the ground default (no roof to constrain it), carries a minimum ground
      // clearance so vegetation/flooding/soiling do not reach the lowest module
      // edge, and founds into the earth — driven pile normally, ballast where
      // excavation is not possible (rock, leased or restored land).
      if (choice.preset === 'ground_pile' || choice.preset === 'ground_ballast') {
        const g1 = setSegmentRacking(roof, spec, seg, project.panels, 'fixed_tilt');
        const g2 = setSegmentTilt(spec, g1.segment, g1.panels, GROUND_TILT_DEG());
        const seg3 = setSegmentStructureFields(g2.segment, {
          clearanceM: GROUND_CLEARANCE_M,
          foundation: choice.preset === 'ground_pile' ? 'pile' : 'ballast',
        });
        return replace(project, seg3, g2.panels);
      }
      // elevated at 10°; walk-under additionally OWNS the clearance field,
      // standard clears it back to the lazy default chain
      const r1 = setSegmentRacking(roof, spec, seg, project.panels, 'fixed_tilt');
      const r2 = setSegmentTilt(spec, r1.segment, r1.panels, 10);
      const seg3 = setSegmentStructureFields(
        r2.segment,
        choice.preset === 'walkunder' ? { clearanceM: 2.2 } : { clearanceM: undefined },
      );
      // remember the intent ON THE ROOF: refills derive their bridging
      // clearance from this even after the segment is cleared
      const override = { ...roof.structureOverride };
      if (choice.preset === 'walkunder') override.clearanceM = 2.2;
      else delete override.clearanceM;
      const roofs = project.roofs.map((rf) =>
        rf.id === roof.id
          ? Object.keys(override).length > 0
            ? { ...rf, structureOverride: override }
            : (({ structureOverride: _o, ...rest }) => rest)(rf) as Roof
          : rf,
      );
      return { ...replace(project, seg3, r2.panels), roofs };
    }
    case 'profile': {
      if (seg.racking.kind === 'flush') return null;
      const profile = STRUCTURE_PROFILES.find((p) => p.key === choice.key);
      if (!profile) return null;
      return replace(project, setSegmentProfile(seg, profile), project.panels);
    }
    case 'tilt': {
      if (seg.racking.kind === 'flush') return null;
      const r = setSegmentTilt(spec, seg, project.panels, choice.tiltDeg);
      return replace(project, r.segment, r.panels);
    }
    case 'clearance': {
      if (seg.racking.kind === 'flush') return null;
      const seg2 = setSegmentStructureFields(seg, {
        clearanceM: choice.clearanceM > 0 ? choice.clearanceM : undefined,
      });
      return replace(project, seg2, project.panels);
    }
    case 'foundation': {
      // A flush table has no legs, so nothing to found. The UI already hides
      // the card in that case (foundationOptionsFor returns []); this is the
      // model refusing independently rather than trusting the caller.
      if (seg.racking.kind === 'flush') return null;
      const seg2 = setSegmentStructureFields(seg, { foundation: choice.foundation });
      return replace(project, seg2, project.panels);
    }
    case 'foundationShape': {
      if (seg.racking.kind === 'flush') return null;
      const seg2 = setSegmentStructureFields(seg, { foundationShape: choice.shape });
      return replace(project, seg2, project.panels);
    }
    case 'mms': {
      // A flush segment has no table to parameterise — a monorail's rails are
      // laid out from the sheet's purlin pitch, not from these.
      if (seg.racking.kind === 'flush') return null;
      const seg2 = setSegmentStructureFields(seg, {
        [choice.field]: choice.value,
      } as Parameters<typeof setSegmentStructureFields>[1]);
      return replace(project, seg2, project.panels);
    }
    }
  }
}

function replace(project: Project, segment: ArraySegment, panels: PlacedPanel[]): StructPatch {
  return {
    segments: project.segments.map((s) => (s.id === segment.id ? segment : s)),
    panels,
  };
}

// ─── Bridging reconciliation ─────────────────────────────────────────────────
// A structure/obstruction edit can invalidate panels that BRIDGE an
// obstruction (walk-under 2.2 m → flush drops the array INTO the tank). The
// layout must auto-adjust in the SAME undoable patch: panels over a bridged
// obstruction are enabled exactly when the segment clearance still clears it
// (and re-enabled when clearance is restored). Same overlap geometry as drc.ts
// so the adjusted set always matches what DRC would flag.

/** Shrink a quad ~10% toward its centre so exact edge-adjacency ≠ overlap. */
function shrink(c: XY[]): XY[] {
  const cx = (c[0].x + c[2].x) / 2;
  const cy = (c[0].y + c[2].y) / 2;
  const k = 0.9;
  return c.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
}

/**
 * Recompute panel enabled-state against blocking obstructions after an edit.
 * `next` carries the not-yet-committed slices (segments/roofs/panels/
 * obstructions); returns the adjusted panels array, or null when nothing
 * changes. Panels away from obstructions are never touched.
 */
export function reconcileBridgedPanels(
  base: Project,
  next: Partial<
    Pick<Project, 'segments' | 'roofs' | 'panels' | 'obstructions' | 'structureDefaults'>
  > = {},
): PlacedPanel[] | null {
  const p = { ...base, ...next } as Project;
  const spec = p.components?.panel;
  if (!spec || p.panels.length === 0 || p.obstructions.length === 0) return null;
  /** panelId → may stay enabled (AND across every overlapped obstruction) */
  const desired = new Map<string, boolean>();
  for (const roof of p.roofs) {
    const onRoof = p.panels.filter((x) => x.roofId === roof.id);
    if (onRoof.length === 0) continue;
    for (const o of p.obstructions) {
      if (!o.blocksPlacement || o.roofId !== roof.id) continue;
      const caps = resolveCapabilities(o);
      const bridgeable = caps.panelsMayCross && !caps.mustRemainOpenToSky;
      const needM = requiredBridgeClearanceM(o);
      const foot =
        o.shape === 'circle'
          ? rectCorners(o.center, o.diameterM, o.diameterM, 0)
          : rectCorners(o.center, o.lengthM, o.widthM, o.rotationDeg);
      for (const x of onRoof) {
        if (!rectsOverlap(shrink(panelCornersOnRoof(x, spec, roof)), foot)) continue;
        let ok = false;
        if (bridgeable) {
          const seg = x.segmentId ? p.segments.find((sg) => sg.id === x.segmentId) : undefined;
          const clearance = seg ? (resolveRacking(p, roof, seg, spec)?.frontLegM ?? 0) : 0;
          ok = clearance >= needM - 1e-9;
        }
        desired.set(x.id, (desired.get(x.id) ?? true) && ok);
      }
    }
  }
  if (desired.size === 0) return null;
  let changed = false;
  const panels = p.panels.map((x) => {
    const want = desired.get(x.id);
    if (want === undefined || want === x.enabled) return x;
    changed = true;
    return { ...x, enabled: want };
  });
  return changed ? panels : null;
}

/** Current-value readout for the on-object panel header. */
export function describeRacking(seg: ArraySegment, spec: PanelSpec): string {
  if (seg.racking.kind === 'flush') return 'Flush mount';
  void spec;
  return `${seg.racking.tiltDeg}° · ${seg.racking.profile.label}`;
}
