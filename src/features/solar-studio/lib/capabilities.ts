// ─── Obstruction capability model (Phase 7 §26c) ─────────────────────────────
// ONE resolver presents every obstruction as a full ObstructionCapabilities:
//   explicit per-instance overrides → type preset → legacy booleans.
// The legacy `castsShadow`/`blocksPlacement` booleans REMAIN the persisted
// canon for their two behaviors — an untouched project resolves to exactly
// today's behavior and keeps a byte-identical fingerprint (the study's
// zero-capture-stale requirement). Factory-created obstructions write the
// full preset explicitly, so NEW tanks are bridgeable out of the box while
// OLD ones stay conservative until the user opts in.
import type { Obstruction, ObstructionCapabilities, ObstructionType } from '../types';

const BASE: ObstructionCapabilities = {
  panelsMayCross: false,
  legsAllowedNearby: true,
  minVerticalClearanceM: 0.3,
  minHorizontalClearanceM: 0,
  maintenanceAccess: 'perimeter',
  removable: false,
  mustRemainOpenToSky: false,
  castsAnalyticalShadow: true,
  supportsStructuralLoad: false,
  requiresEngineerConfirmation: false,
};

/** Type presets — DEFAULTS only; every field stays per-instance editable. */
export const CAPABILITY_PRESETS: Record<ObstructionType, ObstructionCapabilities> = {
  tank: {
    ...BASE,
    panelsMayCross: true,
    maintenanceAccess: 'top',
    requiresEngineerConfirmation: true,
  },
  solar_wh: {
    ...BASE,
    panelsMayCross: true,
    maintenanceAccess: 'top',
    requiresEngineerConfirmation: true,
  },
  dish: { ...BASE, panelsMayCross: true, removable: true },
  ladder: { ...BASE, panelsMayCross: true, minVerticalClearanceM: 0.5, removable: true },
  chimney: { ...BASE, mustRemainOpenToSky: true },
  turbine_vent: { ...BASE, mustRemainOpenToSky: true },
  windmill: { ...BASE, mustRemainOpenToSky: true },
  tree: { ...BASE, maintenanceAccess: 'none' },
  elevated: { ...BASE, supportsStructuralLoad: true },
  building: { ...BASE },
  other: { ...BASE },
};

/**
 * Effective capabilities. The two legacy booleans win over PRESETS (untouched
 * objects behave exactly as before this model existed); explicit per-instance
 * `capabilities` fields win over everything.
 */
export function resolveCapabilities(o: Obstruction): ObstructionCapabilities {
  const preset = CAPABILITY_PRESETS[o.type] ?? BASE;
  const c = o.capabilities;
  return {
    panelsMayCross: c?.panelsMayCross ?? !o.blocksPlacement,
    legsAllowedNearby: c?.legsAllowedNearby ?? preset.legsAllowedNearby,
    minVerticalClearanceM: c?.minVerticalClearanceM ?? preset.minVerticalClearanceM,
    minHorizontalClearanceM: c?.minHorizontalClearanceM ?? preset.minHorizontalClearanceM,
    maintenanceAccess: c?.maintenanceAccess ?? preset.maintenanceAccess,
    removable: c?.removable ?? preset.removable,
    mustRemainOpenToSky: c?.mustRemainOpenToSky ?? preset.mustRemainOpenToSky,
    castsAnalyticalShadow: c?.castsAnalyticalShadow ?? o.castsShadow,
    supportsStructuralLoad: c?.supportsStructuralLoad ?? preset.supportsStructuralLoad,
    requiresEngineerConfirmation:
      c?.requiresEngineerConfirmation ?? preset.requiresEngineerConfirmation,
  };
}

/**
 * Does this object cast a shadow — for the ENGINE and for the SCENE?
 *
 * ONE predicate on purpose (§A0). The capability model owns this decision;
 * `castsShadow` is only its legacy default (see resolveCapabilities). Before
 * this existed, buildShadowCasters and ObstructionMesh each read the raw
 * boolean, so `capabilities.castsAnalyticalShadow` was silently dead: turning
 * it off changed nothing and the object kept shading the design. Both callers
 * now go through here, which also makes visual/analytic parity structural
 * rather than a coincidence of two sites reading the same field.
 */
export function castsAnalyticalShadow(o: Obstruction): boolean {
  return resolveCapabilities(o).castsAnalyticalShadow;
}

/** Structure clearance needed for panels to legally span above `o`. */
export function requiredBridgeClearanceM(o: Obstruction): number {
  return o.heightM + resolveCapabilities(o).minVerticalClearanceM;
}

/**
 * The bridging rule (plan §F): may panels span above this obstruction, given
 * the under-structure clearance of the array crossing it? `blocksPlacement`
 * stays the master switch — a non-blocking obstruction never needs bridging.
 */
export function isBridgedAt(o: Obstruction, structureClearanceM: number | undefined): boolean {
  if (!o.blocksPlacement) return false; // nothing to bridge
  if (structureClearanceM == null) return false;
  const caps = resolveCapabilities(o);
  if (!caps.panelsMayCross || caps.mustRemainOpenToSky) return false;
  return structureClearanceM >= requiredBridgeClearanceM(o);
}
