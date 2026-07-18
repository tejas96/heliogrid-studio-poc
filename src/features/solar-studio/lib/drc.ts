// ─── Design-rule checks (DRC): live layout + solar sanity of the panel design ─
// Complements the electrical checks in stringing.ts. Everything here is derived
// from data already in the project (panel positions + their solar-access), so it
// re-runs cheaply as the user edits and feeds the same issues banner/sheet.
import type { PanelSpec, PlacedPanel, Project, ValidationIssue, XY } from '../types';
import {
  insetPolygonRobust,
  pointInPolygon,
  rectCorners,
  rectIntersectsPolygon,
  rectsOverlap,
} from './geo';
import { panelCornersOnRoof } from './layout';
import { requiredBridgeClearanceM, resolveCapabilities } from './capabilities';
import { resolveRacking } from './structure';

/** Panels below this solar-access fraction are flagged as meaningfully shaded. */
export const SHADE_ACCESS_MIN = 0.7;

/** Shrink a quad ~10% toward its centre so exact edge-adjacency ≠ overlap. */
function shrink(c: XY[]): XY[] {
  const cx = (c[0].x + c[2].x) / 2;
  const cy = (c[0].y + c[2].y) / 2;
  const k = 0.9;
  return c.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
}

/**
 * Layout + solar design-rule checks: overlapping panels, panels breaching the
 * roof setback, and meaningfully shaded panels. Returns [] when there is no
 * panel spec or no panels.
 */
export function layoutIssues(
  project: Project,
  spec: PanelSpec | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!spec) return issues;
  const panels = project.panels.filter((p) => p.enabled);
  if (panels.length === 0) return issues;

  const byRoof = new Map<string, PlacedPanel[]>();
  for (const p of panels) {
    const list = byRoof.get(p.roofId);
    if (list) list.push(p);
    else byRoof.set(p.roofId, [p]);
  }

  let overlapCount = 0;
  const overlapIds = new Set<string>();
  const breachIds = new Set<string>();
  for (const roof of project.roofs) {
    const rp = byRoof.get(roof.id);
    if (!rp || rp.length === 0) continue;
    const inset = insetPolygonRobust(
      roof.polygon,
      roof.perEdgeSetbacksM ?? roof.polygon.map(() => roof.setbackM),
    );
    // canonical frame — the SAME footprint placement validated (down-slope
    // grid + cos(pitch) foreshortening), so DRC can never contradict the fill
    const corners = rp.map((p) => panelCornersOnRoof(p, spec, roof));

    // setback breach: a panel whose footprint isn't fully inside any inset region
    for (let i = 0; i < corners.length; i++) {
      if (!inset.some((reg) => corners[i].every((pt) => pointInPolygon(pt, reg))))
        breachIds.add(rp[i].id);
    }
    // overlaps: pairwise within the roof
    for (let i = 0; i < corners.length; i++) {
      for (let j = i + 1; j < corners.length; j++) {
        if (rectsOverlap(shrink(corners[i]), shrink(corners[j]))) {
          overlapCount++;
          overlapIds.add(rp[i].id);
          overlapIds.add(rp[j].id);
        }
      }
    }
  }

  const shadedIds = panels
    .filter((p) => (p.solarAccess ?? 1) < SHADE_ACCESS_MIN)
    .map((p) => p.id);

  if (overlapCount > 0)
    issues.push({
      level: 'error',
      code: 'panel_overlap',
      message: `${overlapCount} overlapping panel pair${overlapCount > 1 ? 's' : ''} — clear or nudge them`,
      focusPanelIds: [...overlapIds],
    });
  if (breachIds.size > 0)
    issues.push({
      level: 'warn',
      code: 'setback_breach',
      message: `${breachIds.size} panel${breachIds.size > 1 ? 's' : ''} breach the roof setback`,
      focusPanelIds: [...breachIds],
    });
  if (shadedIds.length > 0)
    issues.push({
      level: 'warn',
      code: 'shaded',
      message: `${shadedIds.length} panel${shadedIds.length > 1 ? 's' : ''} below ${Math.round(
        SHADE_ACCESS_MIN * 100,
      )}% solar access — shading loss`,
      focusPanelIds: shadedIds,
    });

  // A no-build zone drawn AFTER the panels were placed does not move them — the
  // fill only consults keepouts when it runs. Without this check those panels
  // stay in the design and keep counting toward capacity/energy/BOM, which is
  // exactly the silent-wrong-output case. Same block set as layout.ts:100
  // (shade-only keepouts mark shade, they do not forbid placement).
  const blockingKeepouts = project.keepouts.filter((k) => k.kind !== 'shade');
  if (blockingKeepouts.length > 0) {
    const inZone = new Set<string>();
    for (const roof of project.roofs) {
      const rp = byRoof.get(roof.id);
      if (!rp || rp.length === 0) continue;
      const zones = blockingKeepouts
        .filter((k) => k.roofId === roof.id || k.roofId === null)
        .map((k) => k.shape);
      if (zones.length === 0) continue;
      for (const pn of rp) {
        const c = shrink(panelCornersOnRoof(pn, spec, roof));
        if (zones.some((z) => rectIntersectsPolygon(c, z))) inZone.add(pn.id);
      }
    }
    if (inZone.size > 0)
      issues.push({
        level: 'error',
        code: 'panel_in_keepout',
        message: `${inZone.size} panel${inZone.size > 1 ? 's' : ''} inside a no-build zone — remove or disable them`,
        focusPanelIds: [...inZone],
      });
  }

  // ── §26c bridging checks: panels spanning ABOVE obstructions must clear
  // them; blocked-type overlaps are hard errors; engineer-flagged bridges warn
  for (const roof of project.roofs) {
    const panelsOn = project.panels.filter((x) => x.enabled && x.roofId === roof.id);
    if (panelsOn.length === 0) continue;
    for (const o of project.obstructions) {
      if (!o.blocksPlacement || o.roofId !== roof.id) continue;
      const foot =
        o.shape === 'circle'
          ? rectCorners(o.center, o.diameterM, o.diameterM, 0)
          : rectCorners(o.center, o.lengthM, o.widthM, o.rotationDeg);
      const over = panelsOn.filter((x) =>
        rectsOverlap(shrink(panelCornersOnRoof(x, spec, roof)), foot),
      );
      if (over.length === 0) continue;
      const caps = resolveCapabilities(o);
      if (!caps.panelsMayCross || caps.mustRemainOpenToSky) {
        issues.push({
          level: 'error',
          code: 'panel_over_obstruction',
          message: `${over.length} panel${over.length > 1 ? 's' : ''} over ${o.label} — ${
            caps.mustRemainOpenToSky ? 'it must remain open to sky' : 'it cannot be bridged'
          }`,
          focusPanelIds: over.map((x) => x.id),
        });
        continue;
      }
      const needM = requiredBridgeClearanceM(o);
      const low = over.filter((x) => {
        const seg = x.segmentId
          ? project.segments.find((sg) => sg.id === x.segmentId)
          : undefined;
        const clearance = seg ? (resolveRacking(project, roof, seg, spec)?.frontLegM ?? 0) : 0;
        return clearance < needM;
      });
      if (low.length > 0) {
        issues.push({
          level: 'error',
          code: 'bridge_clearance',
          message: `${low.length} panel${low.length > 1 ? 's' : ''} over ${o.label} without clearance — needs ≥ ${needM.toFixed(2)} m under-structure (obstruction ${o.heightM.toFixed(2)} m + ${resolveCapabilities(o).minVerticalClearanceM.toFixed(2)} m margin)`,
          focusPanelIds: low.map((x) => x.id),
        });
      } else if (caps.requiresEngineerConfirmation) {
        issues.push({
          level: 'warn',
          code: 'bridge_engineer',
          message: `Array bridges ${o.label} — flagged for engineer confirmation (load path over the obstruction)`,
          focusPanelIds: over.map((x) => x.id),
        });
      }
    }
  }
  return issues;
}
