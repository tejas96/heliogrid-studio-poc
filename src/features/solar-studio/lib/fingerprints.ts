// ─── Derived-state fingerprint graph ────────────────────────────────────────
// Five layered fingerprints over the canonical Project model. Every derived
// artifact (per-panel solar access, heatmap, captures, BOM, SLD, financials)
// keys its freshness on exactly one layer, so "what must recalculate after
// this edit?" has one answer instead of ad-hoc effect dependencies.
//
//   siteFp ⊂ geometryFp ⊂ layoutFp ⊂ electricalFp ⊂ designFp
//
// Layers are strictly nested: an edit that changes a layer changes every layer
// above it and no layer below it. The invalidation matrix test pins this.
//
// `shadingFp` is the recompute/stamp key for per-panel solar access. It is NOT
// a sixth layer — it is geometryFp plus only the panel SAMPLE POINTS (center,
// roof), preserving the proven legacy `shadingFingerprint` semantics: panel
// tilt/azimuth/enabled edits must not trigger the expensive shading pass
// because they do not move the sampled point.
import type { Project, ShadowCapture } from '../types';
import { panelSampleHeightM } from './panel-pose';
import { resolveCatalog } from '../data/catalog';

const r = (v: number, f: number) => Math.round(v * f);

/** Site physics inputs: the pin and the measured-weather stamp. */
export function siteFp(p: Project): string {
  if (!p.location) return 'site:none';
  return JSON.stringify([
    r(p.location.latLng.lat, 1e5),
    r(p.location.latLng.lng, 1e5),
    p.location.weather ? p.location.weather.fetchedAt : 0,
    p.location.weather?.raddatabase ?? '',
  ]);
}

/**
 * Physical scene: roofs + obstructions (the shadow casters and mounting
 * surfaces). NOTE: per-roof shading fields must live inside `polygon` /
 * `heightM` / `parapet` (the whole parapet object is serialized, so per-edge
 * parapet data is caught); any NEW top-level Roof field that affects shading
 * must be added here too.
 */
export function geometryFp(p: Project): string {
  return (
    siteFp(p) +
    '|' +
    JSON.stringify([
      // calibration reshapes the world (projector scale + sun frame) —
      // every geometry-derived output must recalculate when it changes.
      // Optional access: payloads from an older build can arrive mid-session
      // (multi-tab storage events) before normalize re-defaults them.
      [p.calibration?.scaleFactor ?? 1, p.calibration?.northOffsetDeg ?? 0],
      p.roofs.map((x) => [
        x.polygon,
        x.heightM,
        x.pitchDeg,
        x.slopeAzimuthDeg,
        x.parapet,
        x.roofType,
        x.setbackM,
        x.perEdgeSetbacksM,
      ]),
      p.obstructions.map((o) => [
        o.center,
        o.shape,
        o.lengthM,
        o.widthM,
        o.diameterM,
        o.heightM,
        o.rotationDeg,
        o.castsShadow,
        o.blocksPlacement,
        o.setbackM,
        o.roofId,
      ]),
    ]) +
    // obstruction capability OVERRIDES (Phase 7 §26c) — CONDITIONAL suffix:
    // untouched objects add NOTHING, so pre-§26c fingerprints (and captures)
    // survive byte-identical; explicit edits correctly stale downstream data
    p.obstructions
      .map((o) => (o.capabilities ? `|oc:${o.id}:${JSON.stringify(o.capabilities)}` : ''))
      .join('')
  );
}

/** Placement: every panel/segment/keepout/walkway detail that shapes the array. */
export function layoutFp(p: Project): string {
  return (
    geometryFp(p) +
    '|' +
    JSON.stringify([
      p.panels.map((x) => [
        x.id,
        r(x.center.x, 100),
        r(x.center.y, 100),
        x.roofId,
        x.orientation,
        x.azimuthDeg,
        x.tiltDeg,
        x.enabled,
        x.segmentId ?? '',
      ]),
      p.segments.map((s) => [s.id, s.polygon, s.racking, s.orientation, s.azimuthDeg, s.moduleGapM, s.removed]),
      p.keepouts.map((k) => [k.id, k.shape, k.heightM, k.kind, k.roofId]),
      p.walkways.map((w) => [w.id, w.a, w.b, w.widthMm, w.roofId]),
    ]) +
    // Leg plan (Phase 22i) — CONDITIONAL suffix, appended per segment only
    // when one exists. The segment tuple above is an EXPLICIT field list
    // (unlike `racking`, which is stringified whole), so a new field there
    // would not be picked up at all; appending here keeps untouched projects
    // byte-identical while still re-keying a design whose legs have moved —
    // and moving a leg moves steel, which moves the quote.
    p.segments.map((s) => (s.legPlan ? `|lp:${s.id}:${JSON.stringify(s.legPlan.points)}` : '')).join('')
  );
}

/** Electrical design: selected components + string topology. */
export function electricalFp(p: Project): string {
  return (
    layoutFp(p) +
    '|' +
    JSON.stringify([
      p.components.panel?.id ?? '',
      p.components.inverter?.id ?? '',
      p.components.inverterCount,
      p.components.targetKwp,
      p.strings.map((s) => [s.id, s.inverterIndex, s.mpptIndex, s.panelIds]),
    ]) +
    // CONDITIONAL suffix: only central topology appends — 'string' (default)
    // serialises identically to before, so existing projects don't go stale.
    (p.components.inverterTopology === 'central' ? '|central' : '') +
    (p.components.mlpe === 'optimizer' ? '|mlpe' : '')
  );
}

/** Everything that reaches a customer-facing output (BOM, money, documents). */
export function designFp(p: Project): string {
  return (
    electricalFp(p) +
    '|' +
    JSON.stringify([
      p.bomOverrides.map((b) => [b.id, b.qty, b.unitPriceInr, b.item, b.spec, b.auto, b.overridden]),
      // Phase 22c per-field overrides — CONDITIONAL: a project that has never
      // edited its BOM serialises `undefined` here, exactly as it did before
      // the field existed, so no stored capture or quote goes stale on upgrade.
      // Once present it MUST re-key: these edits move money.
      p.bom
        ? [
            p.bom.overrides.map((o) => [
              o.lineKey,
              Object.entries(o.fields)
                .sort(([a], [b]) => (a < b ? -1 : 1)) // key order must not matter
                .map(([f, v]) => [f, v.value]),
            ]),
            p.bom.custom.map((c) => [c.id, c.category, c.item, c.qty, c.unit, c.unitPriceInr]),
            p.bom.inputs ?? null,
          ]
        : undefined,
      p.pricing.marginPct,
      p.derived.sldOverrides,
      [
        p.info.name,
        p.info.customerName,
        p.info.state,
        p.info.discom,
        p.info.siteType,
        p.info.connectionType,
        p.info.sanctionedLoadKw,
        p.info.tariffInrPerKwh,
        p.info.monthlyBillInr,
      ],
      p.rails.map((x) => [x.id, x.a, x.b]),
      p.arresters.map((x) => [x.id, x.pos]),
      p.inverterPlacements.map((x) => [x.id, x.roofId, x.edgeIndex, x.t]),
    ]) +
    // structure defaults (Phase 7) — CONDITIONAL suffix: absent fields add
    // NOTHING, so every pre-Phase-7 project's fingerprint (and its captures)
    // survives the upgrade byte-identical
    (p.structureDefaults ? '|sd:' + JSON.stringify(p.structureDefaults) : '') +
    // routed cable (Phase 10) — CONDITIONAL suffix: a project with no routes
    // fingerprints byte-identically to before routing existed, so no capture or
    // quote goes stale on the upgrade. Routes DO move money (cable metres), so
    // once present they must re-key the design.
    ((p.cableRoutes ?? []).length > 0
      ? '|cr:' +
        JSON.stringify(
          p.cableRoutes!.map((r) => [r.id, r.waypoints, r.verticalDropM, r.slackPct, r.manual ?? false]),
        )
      : '') +
    p.roofs
      .map((r) => (r.structureOverride ? `|so:${r.id}:${JSON.stringify(r.structureOverride)}` : ''))
      .join('') +
    // CATALOG VERSION (Phase 22d) — the one deliberate UNCONDITIONAL suffix in
    // this file. Every other addition appends nothing when absent so existing
    // projects survive byte-identical; this one cannot, because the catalog is
    // never absent. Its inclusion is the point: prices and specs live OUTSIDE
    // the project, so without it a price-book revision leaves every stored
    // quote and proposal looking fresh while quoting last quarter's money.
    // `catalog.ts` has said "joins designFp in Phase 10" since it was written.
    //
    // Consequence, accepted knowingly: bumping catalogVersion re-keys every
    // project's design fingerprint and stales their captures. That is correct —
    // the money genuinely changed — and it is exactly what the bump means.
    '|cat:' +
    resolveCatalog().catalogVersion
  );
}

/**
 * Bump when the shading ENGINE itself changes results for identical geometry
 * (sampling, raycast rules, caster construction). Joining the fingerprint
 * makes every stored solarAccess stamp from the older engine read as stale,
 * so projects self-heal on their next load instead of showing outdated
 * numbers marked "fresh".
 *   v2: raycast material became DoubleSide — backface hits (parapet inner
 *       walls) now register; access can only be equal or lower (more honest).
 *   v3: sun sampling extended from 5 to all 12 months (full seasonal
 *       coverage, aligned with the heatmap's month set).
 *   v4: sample rays start at the REAL module-plane height (structure
 *       clearance + tilt rise) instead of a fixed 0.45 m — walk-under arrays
 *       bridging obstructions no longer read as shaded by what they clear.
 */
//   v5 (Phase 8): the modules themselves are casters (Tier-2 row-on-row
//       self-shading). Panels stopped being only ray ORIGINS and became
//       BLOCKERS too, so this key had to widen — see below.
//   v6 (Phase 8): sun sampling aligned with the roof heatmap — full daylight
//       window at 0.5 h, sinα·dh weights (was 08:00–17:00 at ~1.5 h with a
//       0.05 weight floor). The engine had been blind to the low-sun hours the
//       scrubbed scene shows — and where row shading actually happens.
export const SHADING_ENGINE_VERSION = 6;

/**
 * Recompute/stamp key for per-panel solar access (Class-A derived data).
 * geometryFp + the panel field set the engine actually reads.
 *
 * SCOPE CHANGE (v5): before Tier-2, panels were only sample POINTS, so tilt /
 * azimuth / orientation / enabled were deliberately excluded — they didn't move
 * the sampled point, and excluding them kept the expensive pass off the hot
 * path. Now every module is a shadow CASTER: tilting a row, flipping a panel to
 * landscape or disabling it changes what its NEIGHBOURS receive. Those fields
 * are engine inputs now, and omitting them would stamp stale access as fresh —
 * the one failure the fingerprint graph exists to prevent. The cost is more
 * recomputes on tilt/enable edits; the debounce + worker (task 27b) absorb it.
 * Returns '' when there is no location (nothing to compute).
 */
export function shadingFp(p: Project | null): string {
  if (!p || !p.location) return '';
  // defensive: hand-rolled test projects may omit components entirely
  const spec = p.components?.panel ?? null;
  return (
    `e${SHADING_ENGINE_VERSION}|` +
    geometryFp(p) +
    '|' +
    JSON.stringify(
      p.panels.map((x) => [
        x.id,
        r(x.center.x, 100),
        r(x.center.y, 100),
        x.roofId,
        // v4: the sample point MOVES with structure clearance/tilt — a
        // walk-under change must re-run the engine (cm precision)
        r(panelSampleHeightM(p, x, spec), 100),
        // v5: caster inputs — a neighbour's plate shades me
        x.tiltDeg,
        x.azimuthDeg,
        x.orientation,
        x.enabled,
      ]),
    )
  );
}

/**
 * Legacy alias — heatmap invalidation in Step6Editor/Scene3D keys on this.
 * Same semantics as before the fingerprint graph existed.
 */
export const shadingFingerprint = shadingFp;

// ─── Freshness checks (drive the staleness badges) ──────────────────────────

/**
 * True when the persisted per-panel solarAccess values were computed for the
 * CURRENT geometry. False means the numbers on screen are provisional — the
 * optimistic 1.0 default or values from an older scene — until useDesignSync
 * finishes the recompute and stamps `derived.solarAccessFp`.
 */
export function isShadingFresh(p: Project): boolean {
  if (p.panels.length === 0) return true;
  return p.derived.solarAccessFp === shadingFp(p);
}

/** True when a capture still shows the current geometry + panel layout. */
export function isCaptureFresh(p: Project, cap: ShadowCapture): boolean {
  return !!cap.forLayoutFp && cap.forLayoutFp === layoutFp(p);
}

/** True when every taken capture (and the cover) matches the current design. */
export function capturesFresh(p: Project): boolean {
  const taken = p.captures.filter((c) => c.imageBlobId);
  if (p.coverImageBlobId && p.coverForLayoutFp !== layoutFp(p)) return false;
  return taken.every((c) => isCaptureFresh(p, c));
}
