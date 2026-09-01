// ─── Layout operations: modules and tables ──────────────────────────────────
// Extracted from Step6Editor's handlers so the 2D editor, the 3D gizmos and
// the AI planner all mutate the layout through the same typed operations.
// Every op is pure: it returns the patch; lib/ops/run re-derives strings and
// routes and computes the impact before anything is dispatched.
import type { ArraySegment, DesignDecision, PlacedPanel, Project } from '../../types';
import { defineOp } from './types';
import { registerOp } from './registry';
import { autoDesign, type DesignObjective } from '../auto-design';
import { cascadeDeletePanels } from '../cascade';
import { genId } from '../geo';
import { nextSegmentLabel } from '../layout';
import { movePanels } from '../panel-move';
import { applyStructChoice, reconcileBridgedPanels, type StructChoice } from '../structure-edit';
import {
  duplicateSegment,
  groupIntoTable,
  growSegment,
  respaceSegment,
  setSegmentAzimuth,
  setSegmentProfile,
  setSegmentRacking,
  setSegmentStructureFields,
  setSegmentTilt,
  STRUCTURE_PROFILES,
  type ElevatedKind,
  type GrowAxis,
  type GrowSide,
} from '../segment-ops';

type SegmentUpdate = { segment: ArraySegment; panels: PlacedPanel[] };

function segmentOf(p: Project, id: string) {
  const segment = p.segments.find((s) => s.id === id);
  const roof = segment ? p.roofs.find((r) => r.id === segment.roofId) : undefined;
  return { segment, roof, spec: p.components.panel };
}

const needTable = (p: Project, a: { segmentId: string }) => {
  const { segment, roof, spec } = segmentOf(p, a.segmentId);
  if (!spec) return { reason: 'Select a panel in Step 4 first' };
  if (!segment || !roof) return { reason: 'Table not found' };
  return null;
};

/** Apply a table update and keep modules bridging obstructions valid (Step 6's applySegment). */
function withSegment(p: Project, u: SegmentUpdate): Partial<Project> {
  const segments = p.segments.map((s) => (s.id === u.segment.id ? u.segment : s));
  const panels = reconcileBridgedPanels(p, { segments, panels: u.panels }) ?? u.panels;
  return { panels, segments };
}

const deg = (v: number) => `${Math.round(v)}°`;

// ── modules ──────────────────────────────────────────────────────────────────

export const panelsSetEnabled = defineOp<{ ids: string[]; enabled: boolean }>({
  id: 'panels.setEnabled',
  layer: 'layout',
  label: (a) => `${a.enabled ? 'Enable' : 'Disable'} ${a.ids.length} module${a.ids.length === 1 ? '' : 's'}`,
  apply: (p, a) => {
    const ids = new Set(a.ids);
    return { panels: p.panels.map((m) => (ids.has(m.id) ? { ...m, enabled: a.enabled } : m)) };
  },
});

export const panelsRotate = defineOp<{ ids: string[]; deltaDeg: number }>({
  id: 'panels.rotate',
  layer: 'layout',
  label: (a) => `Rotate ${a.ids.length} module${a.ids.length === 1 ? '' : 's'} ${deg(a.deltaDeg)}`,
  apply: (p, a) => {
    const ids = new Set(a.ids);
    return {
      panels: p.panels.map((m) =>
        ids.has(m.id) ? { ...m, azimuthDeg: (((m.azimuthDeg + a.deltaDeg) % 360) + 360) % 360 } : m,
      ),
    };
  },
});

export const panelsNudge = defineOp<{ ids: string[]; dx: number; dy: number }>({
  id: 'panels.nudge',
  layer: 'layout',
  label: (a) => `Move ${a.ids.length} module${a.ids.length === 1 ? '' : 's'}`,
  validate: (p, a) => {
    const r = movePanels(p, p.components.panel, a.ids, a.dx, a.dy);
    return r.ok ? null : { reason: r.reason };
  },
  apply: (p, a) => {
    const r = movePanels(p, p.components.panel, a.ids, a.dx, a.dy);
    return r.ok ? { panels: r.panels, segments: r.segments } : {};
  },
});

export const panelsDelete = defineOp<{ ids: string[] }>({
  id: 'panels.delete',
  layer: 'layout',
  label: (a) => `Delete ${a.ids.length} module${a.ids.length === 1 ? '' : 's'}`,
  apply: (p, a) => cascadeDeletePanels(p, a.ids),
});

// ── tables ───────────────────────────────────────────────────────────────────

export const layoutGroup = defineOp<{ panelIds: string[] }>({
  id: 'layout.group',
  layer: 'layout',
  label: (a) => `Group ${a.panelIds.length} modules into a table`,
  validate: (p, a) => {
    if (!p.components.panel) return { reason: 'Select a panel in Step 4 first' };
    const sel = p.panels.filter((m) => a.panelIds.includes(m.id));
    if (sel.length < 2) return { reason: 'Select at least two modules' };
    if (!p.roofs.some((r) => r.id === sel[0].roofId)) return { reason: 'Roof not found' };
    return null;
  },
  apply: (p, a) => {
    const sel = p.panels.filter((m) => a.panelIds.includes(m.id));
    const roof = p.roofs.find((r) => r.id === sel[0].roofId)!;
    const res = groupIntoTable(roof, p.components.panel!, sel, nextSegmentLabel(p.segments));
    const ids = new Set(sel.map((m) => m.id));
    return {
      panels: [...p.panels.filter((m) => !ids.has(m.id)), ...res.panels],
      segments: [...p.segments, res.segment],
    };
  },
});

export const layoutGrow = defineOp<{ segmentId: string; axis: GrowAxis; side: GrowSide; count: number }>({
  id: 'layout.grow',
  layer: 'layout',
  label: (a) => `Add ${a.count} ${a.axis}${a.count === 1 ? '' : 's'} (${a.side})`,
  validate: (p, a) => {
    const v = needTable(p, a);
    if (v) return v;
    const { segment, roof, spec } = segmentOf(p, a.segmentId);
    return growSegment(p, roof!, spec!, segment!, a.axis, a.side, a.count).added === 0
      ? { reason: 'No room to add modules there' }
      : null;
  },
  apply: (p, a) => {
    const { segment, roof, spec } = segmentOf(p, a.segmentId);
    const res = growSegment(p, roof!, spec!, segment!, a.axis, a.side, a.count);
    return {
      panels: [...p.panels.filter((m) => m.segmentId !== segment!.id), ...res.panels],
      segments: p.segments.map((s) => (s.id === segment!.id ? res.segment : s)),
    };
  },
});

export const segmentSetRacking = defineOp<{ segmentId: string; kind: 'flush' | ElevatedKind }>({
  id: 'segment.setRacking',
  layer: 'layout',
  label: (a) => `Mount: ${a.kind === 'flush' ? 'flush' : a.kind === 'dual_tilt' ? 'east-west' : 'fixed tilt'}`,
  validate: needTable,
  apply: (p, a) => {
    const { segment, roof, spec } = segmentOf(p, a.segmentId);
    return withSegment(p, setSegmentRacking(roof!, spec!, segment!, p.panels, a.kind));
  },
});

export const segmentSetTilt = defineOp<{ segmentId: string; tiltDeg: number }>({
  id: 'segment.setTilt',
  layer: 'layout',
  label: (a) => `Tilt ${deg(a.tiltDeg)}`,
  validate: needTable,
  apply: (p, a) => {
    const { segment, spec } = segmentOf(p, a.segmentId);
    return withSegment(p, setSegmentTilt(spec!, segment!, p.panels, a.tiltDeg));
  },
});

export const segmentSetAzimuth = defineOp<{ segmentId: string; azimuthDeg: number }>({
  id: 'segment.setAzimuth',
  layer: 'layout',
  label: (a) => `Face ${deg(a.azimuthDeg)}`,
  validate: needTable,
  apply: (p, a) => {
    const { segment } = segmentOf(p, a.segmentId);
    return withSegment(p, setSegmentAzimuth(segment!, p.panels, a.azimuthDeg));
  },
});

export const segmentSetProfile = defineOp<{ segmentId: string; profileKey: string }>({
  id: 'segment.setProfile',
  layer: 'layout',
  label: (a) => `Section: ${STRUCTURE_PROFILES.find((x) => x.key === a.profileKey)?.label ?? a.profileKey}`,
  validate: (p, a) =>
    needTable(p, a) ??
    (STRUCTURE_PROFILES.some((x) => x.key === a.profileKey) ? null : { reason: 'Unknown steel section' }),
  apply: (p, a) => {
    const profile = STRUCTURE_PROFILES.find((x) => x.key === a.profileKey)!;
    return { segments: p.segments.map((s) => (s.id === a.segmentId ? setSegmentProfile(s, profile) : s)) };
  },
});

type StructureFields = Parameters<typeof setSegmentStructureFields>[1];

export const segmentSetStructureFields = defineOp<{ segmentId: string; fields: StructureFields }>({
  id: 'segment.setStructureFields',
  layer: 'layout',
  label: (a) => `Structure: ${Object.keys(a.fields).join(', ') || 'defaults'}`,
  validate: needTable,
  apply: (p, a) => {
    const segments = p.segments.map((s) =>
      s.id === a.segmentId ? setSegmentStructureFields(s, a.fields) : s,
    );
    const panels = 'clearanceM' in a.fields ? reconcileBridgedPanels(p, { segments }) : null;
    return { segments, ...(panels ? { panels } : {}) };
  },
});

const CHOICE_LABEL = (c: StructChoice): string => {
  switch (c.kind) {
    case 'preset':
      return `Structure preset: ${c.preset.replace('_', ' ')}`;
    case 'profile':
      return `Section: ${c.key}`;
    case 'tilt':
      return `Tilt ${deg(c.tiltDeg)}`;
    case 'clearance':
      return `Clearance ${c.clearanceM.toFixed(1)} m`;
    case 'foundation':
      return `Foundation: ${c.foundation}`;
    case 'foundationShape':
      return `Foundation shape: ${c.shape}`;
    case 'mms':
      return `MMS ${c.field}: ${c.value === undefined ? 'default' : String(c.value)}`;
  }
};

/** The 3D structure card's choices (presets, foundations, MMS parametrics), one op. */
export const segmentChoice = defineOp<{ segmentId: string; choice: StructChoice }>({
  id: 'segment.choice',
  layer: 'layout',
  label: (a) => CHOICE_LABEL(a.choice),
  validate: (p, a) =>
    needTable(p, a) ?? (applyStructChoice(p, a.segmentId, a.choice) ? null : { reason: 'Not applicable to this table' }),
  apply: (p, a) => applyStructChoice(p, a.segmentId, a.choice) ?? {},
});

export const segmentRespace = defineOp<{ segmentId: string; rowPitchM: number }>({
  id: 'segment.respace',
  layer: 'layout',
  label: (a) => `Row pitch ${a.rowPitchM.toFixed(2)} m`,
  validate: (p, a) => {
    const v = needTable(p, a);
    if (v) return v;
    const { segment, roof, spec } = segmentOf(p, a.segmentId);
    return respaceSegment(p, roof!, spec!, segment!, a.rowPitchM) ? null : { reason: 'No room to apply that spacing' };
  },
  apply: (p, a) => {
    const { segment, roof, spec } = segmentOf(p, a.segmentId);
    return withSegment(p, respaceSegment(p, roof!, spec!, segment!, a.rowPitchM)!);
  },
});

export const segmentDuplicate = defineOp<{ segmentId: string }>({
  id: 'segment.duplicate',
  layer: 'layout',
  label: () => 'Duplicate table',
  validate: (p, a) => {
    const v = needTable(p, a);
    if (v) return v;
    const { segment, roof, spec } = segmentOf(p, a.segmentId);
    return duplicateSegment(p, roof!, spec!, segment!) ? null : { reason: 'No room to duplicate this table' };
  },
  apply: (p, a) => {
    const { segment, roof, spec } = segmentOf(p, a.segmentId);
    const dup = duplicateSegment(p, roof!, spec!, segment!)!;
    dup.segment.label = nextSegmentLabel(p.segments);
    return { panels: [...p.panels, ...dup.panels], segments: [...p.segments, dup.segment] };
  },
});

export const segmentDelete = defineOp<{ segmentId: string }>({
  id: 'segment.delete',
  layer: 'layout',
  label: () => 'Delete table',
  apply: (p, a) => cascadeDeletePanels(p, p.panels.filter((m) => m.segmentId === a.segmentId).map((m) => m.id)),
});

// ── whole layout ─────────────────────────────────────────────────────────────

export const layoutAutoDesign = defineOp<{ objective: DesignObjective }>({
  id: 'layout.autoDesign',
  layer: 'layout',
  label: (a) => (a.objective === 'max_roof' ? 'Auto-design (maximum roof)' : 'Auto-design (target kWp)'),
  validate: (p) => (p.components.panel ? null : { reason: 'Select a panel in Step 4 first' }),
  apply: (p, a) => {
    const r = autoDesign(p, a.objective);
    // warnings ride in the decision log so the "Why this layout?" sheet shows them
    const warnings: DesignDecision[] = r.warnings.map((w) => ({
      id: genId('dd'),
      topic: 'Warning',
      choice: w,
      reason: '',
      inputs: [],
    }));
    return { panels: r.panels, segments: r.segments, designLog: [...r.decisions, ...warnings] };
  },
});

export const layoutClear = defineOp<Record<string, never>>({
  id: 'layout.clear',
  layer: 'layout',
  label: () => 'Clear all modules',
  apply: () => ({ panels: [], segments: [], strings: [] }),
});

for (const op of [
  panelsSetEnabled,
  panelsRotate,
  panelsNudge,
  panelsDelete,
  layoutGroup,
  layoutGrow,
  segmentSetRacking,
  segmentSetTilt,
  segmentSetAzimuth,
  segmentSetProfile,
  segmentSetStructureFields,
  segmentChoice,
  segmentRespace,
  segmentDuplicate,
  segmentDelete,
  layoutAutoDesign,
  layoutClear,
]) {
  registerOp(op);
}
