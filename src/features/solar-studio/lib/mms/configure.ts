import type { Project } from '../../types';
import type { MmsConfig, MountStrategy } from './types';
import { defaultMms, MOUNT_CATALOGUE } from './catalogue';
import { setSegmentAzimuth, setSegmentRacking, setSegmentStructureFields, setSegmentTilt } from '../segment-ops';
import { COL_STRIDE } from '../layout';
import { GROUND_CLEARANCE_M, reconcileBridgedPanels } from '../structure-edit';
import { resolveRules } from '../../data/rules/india';

/** One undoable patch, reusing the existing placement/bridging operations. */
export function configureMms(project: Project, segmentId: string, strategy?: MountStrategy, edit?: Partial<MmsConfig>): Partial<Project> {
  let seg = project.segments.find(s => s.id === segmentId);
  const roof = project.roofs.find(r => r.id === seg?.roofId);
  const spec = project.components.panel;
  if (!seg || !roof || !spec) return {};
  let panels = project.panels;
  const mms = { ...(seg.mms ?? defaultMms(roof.roofType)), ...edit };
  seg = { ...seg, mms };
  if (strategy) {
    const preset = MOUNT_CATALOGUE.find(p => p.id === strategy && p.roofs.includes(roof.roofType));
    if (!preset) return {};
    mms.strategy = strategy;
    const kind = preset.racking ?? (preset.flush || roof.pitchDeg > 0 ? 'flush' : strategy === 'east_west' ? 'dual_tilt' : 'fixed_tilt');
    ({ segment: seg, panels } = setSegmentRacking(roof, spec, seg, panels, kind));
    if (kind === 'flush' && roof.pitchDeg > 0) ({ segment: seg, panels } = setSegmentAzimuth(seg, panels, roof.slopeAzimuthDeg));
    // Open ground is not constrained by a roof, so its tilt and its
    // vegetation/flood clearance come from the live rules rather than from a
    // number frozen into the catalogue — the same source the ground structure
    // presets read (lib/structure-edit.ts), so a rule override cannot be
    // honoured by one path and ignored by the other.
    const ground = roof.roofType === 'ground';
    const tilt = preset.tilt ?? (ground ? resolveRules().defaults.groundTiltDeg : undefined);
    // setSegmentTilt is a deliberate no-op on a tracker: its tilt is the time of
    // day, not a setting (lib/energy/tracker.ts).
    if (tilt && kind !== 'flush') ({ segment: seg, panels } = setSegmentTilt(spec, seg, panels, tilt));
    if (kind !== 'flush') {
      seg = setSegmentStructureFields(seg, {
        clearanceM: preset.heightM ?? (ground ? GROUND_CLEARANCE_M : .45),
        // The preset's own foundation wins. Falling through to `anchor` on open
        // ground wrote a value `allowedFoundations` rejects, so the choice was
        // silently corrected at the next read — the picker offering one thing
        // and the model building another.
        foundation: preset.foundation ?? (strategy === 'rcc_ballast' ? 'ballast' : 'anchor'),
      });
    }
    // Facing comes from the preset, not from a list of strategy names the next
    // east–west system would have had to be added to.
    const facing = preset.azimuth ?? (strategy === 'east_west' ? 90 : strategy === 'south_facing' ? 180 : undefined);
    if (facing !== undefined) ({ segment: seg, panels } = setSegmentAzimuth(seg, panels, facing));
  }
  seg = { ...seg, mms };
  panels = panels.map(p => p.segmentId === seg!.id ? { ...p, azimuthDeg: mmsFacing(seg!.azimuthDeg, seg!.racking.kind, p.cellIndex) } : p);
  const patch = { segments: project.segments.map(s => s.id === segmentId ? seg! : s), panels };
  const reconciled = reconcileBridgedPanels(project, patch);
  return { ...patch, panels: reconciled ?? panels };
}

/**
 * Hand the table back to the generic structure model.
 *
 * `Generate MMS` was one-way: once a table carried an `mms` block the panel
 * offered only its tabs, so a user who tried it on the wrong table had Undo and
 * nothing else — and Undo is gone after a reload. This drops the block and
 * leaves everything the user actually chose (tilt, height, azimuth, spacing)
 * exactly where it is: those live on the segment's racking and were theirs
 * before MMS existed. The structure is re-derived without the MMS enrichment,
 * and the BOM goes back to the generic mechanical lines.
 */
export function clearMms(project: Project, segmentId: string): Partial<Project> {
  const seg = project.segments.find((s) => s.id === segmentId);
  if (!seg?.mms) return {};
  return {
    segments: project.segments.map((s) => {
      if (s.id !== segmentId) return s;
      const { mms: _dropped, ...rest } = s;
      return rest;
    }),
  };
}

/** Alternating row facing is derived, not a second persisted module orientation. */
export function mmsFacing(azimuthDeg: number, kind: string, cellIndex?: number): number {
  return kind === 'dual_tilt' && Math.floor((cellIndex ?? 0) / COL_STRIDE) % 2 === 1
    ? (azimuthDeg + 180) % 360 : azimuthDeg;
}