// ─── Automatic system design: ranked, budgeted, EXPLAINED layout ─────────────
// Replaces "fill roofs in array order" with an engine that (1) ranks every
// roof by what it would actually yield (capacity × measured beam access from
// the real shading engine), (2) fills in rank order against the requirement
// budget, and (3) records a DesignDecision for every choice — the "why?" UI
// renders this log verbatim (§3.5: every automated decision explainable).
import type {
  ArraySegment,
  DesignDecision,
  PlacedPanel,
  Project,
  PanelSpec,
} from '../types';
import { autoFillRoof, fillRoofAsSegment, fillRowPitchM, DEFAULT_FILL } from './layout';
import { reindexSegment } from './segment-ops';
import { computeSolarAccess } from './shading';
import { peekSurroundHeights } from './surround';
import type { SurroundHeights } from './surround-geometry';
import { poaFactor } from './poa';
import { isBridgedAt, requiredBridgeClearanceM, resolveCapabilities } from './capabilities';
import { resolveRacking } from './structure';
import { rectCorners, rectsOverlap } from './geo';
import { panelCornersOnRoof } from './layout';

export type DesignObjective = 'target_kwp' | 'max_roof';

export interface RoofRank {
  roofId: string;
  name: string;
  capacityPanels: number;
  capacityKwp: number;
  /** mean beam access of a probe grid over the candidate layout, 0..1 */
  access: number;
  /** mean plane-of-array orientation factor (POA/GHI); 1 when no location */
  poa: number;
  /** access × poa — EXPECTED YIELD PER PANEL; drives fill priority */
  score: number;
}

export interface AutoDesignResult {
  panels: PlacedPanel[];
  segments: ArraySegment[];
  decisions: DesignDecision[];
  warnings: string[];
  requestedKwp: number;
  achievedKwp: number;
  ranking: RoofRank[];
}

const PROBE_PANELS = 12;

/**
 * The REAL neighbourhood the rest of the app shades with — the same grid the
 * energy sync, the 3D scene and the panel inspector pass to the engine. Without
 * it auto-design ranked roofs against an empty horizon: the neighbour's second
 * floor, the compound trees and the water tank next door were invisible to the
 * ranking while the customer-facing shade picture showed them plainly.
 *
 * Synchronous by design: `autoDesign` is a pure function behind a button, and
 * the grid is already in memory whenever the site has one (store/useSurroundSync
 * fetches it, store/useDesignSync loads it before the engine runs). Not fetched
 * yet ⇒ null ⇒ exactly the behaviour this had before — never a crash, and the
 * decision log says so rather than implying the neighbours were counted.
 * `ignoreSurround` is honoured so this agrees with the 3D view's own switch
 * (the same rule as lib/sun-chart).
 */
function surroundFor(project: Project): SurroundHeights | null {
  return project.ignoreSurround ? null : peekSurroundHeights(project.surround);
}

/** What the log tells the user the shading engine could actually see. */
function neighbourProvenance(project: Project, surround: SurroundHeights | null): string {
  if (surround) return 'included (Google aerial height map)';
  if (project.ignoreSurround) return 'excluded — real surroundings switched off';
  return project.surround === null
    ? 'unavailable for this site'
    : 'not read yet — only what you drew was counted';
}

/**
 * Rank every roof by EXPECTED YIELD PER PANEL, so the budget fills the
 * highest-producing positions first. Two independent factors combine:
 *  - measured beam ACCESS — up to 12 of the roof's own candidate panels run
 *    through the REAL raycast shading engine (a roof behind a water tank ranks
 *    below an open one).
 *  - ORIENTATION (poaFactor) — the plane-of-array/GHI ratio for the panels'
 *    tilt+azimuth, the SAME transposition the energy report uses. Without it a
 *    multi-plane roof (gable/hip) mis-ranks: an unshaded NORTH face reads ~100%
 *    access yet yields far less than a south one. Access alone is blind to
 *    which way the plane faces; this is the fix.
 * Ranking by per-panel yield (not capacity×access) is the energy-optimal fill
 * order for a panel budget — the best panels go in first, whatever the roof size.
 */
export function rankRoofs(project: Project, spec: PanelSpec): RoofRank[] {
  const ll = project.location?.latLng;
  const surround = surroundFor(project);
  const ranks: RoofRank[] = [];
  for (const roof of project.roofs) {
    // avoidPanels: [] — ranking measures each roof's RAW capacity; the layout
    // autoDesign produces REPLACES project.panels, so existing panels must not
    // shrink the measurement (the fill's default now avoids them).
    const candidates = autoFillRoof(project, roof, spec, {
      ...DEFAULT_FILL,
      avoidPanels: [],
    });
    if (candidates.length === 0) {
      ranks.push({
        roofId: roof.id,
        name: roof.name,
        capacityPanels: 0,
        capacityKwp: 0,
        access: 0,
        poa: 1,
        score: 0,
      });
      continue;
    }
    // evenly-sampled probe subset, deterministic
    const step = Math.max(1, Math.floor(candidates.length / PROBE_PANELS));
    const probe = candidates.filter((_, i) => i % step === 0).slice(0, PROBE_PANELS);
    const accessMap = computeSolarAccess({ ...project, panels: probe }, { surround });
    const access =
      probe.length > 0 && accessMap.size > 0
        ? probe.reduce((s, p) => s + (accessMap.get(p.id) ?? 1), 0) / probe.length
        : 1;
    // orientation yield: mean POA/GHI over the probe panels' own tilt+azimuth.
    // No location ⇒ no transposition possible ⇒ 1 (rank by access alone, as before).
    const poa =
      ll && probe.length > 0
        ? probe.reduce((s, p) => s + poaFactor(ll.lat, ll.lng, p.tiltDeg, p.azimuthDeg), 0) /
          probe.length
        : 1;
    const capacityKwp = (candidates.length * spec.watt) / 1000;
    ranks.push({
      roofId: roof.id,
      name: roof.name,
      capacityPanels: candidates.length,
      capacityKwp: Math.round(capacityKwp * 100) / 100,
      access: Math.round(access * 1000) / 1000,
      poa: Math.round(poa * 1000) / 1000,
      score: Math.round(access * poa * 1000) / 1000,
    });
  }
  // highest per-panel yield first; ties broken by roof order (stable)
  return ranks.sort((a, b) => b.score - a.score);
}

/** Generate the full layout + decision log. Pure — caller patches the store. */
export function autoDesign(project: Project, objective: DesignObjective): AutoDesignResult {
  const spec = project.components.panel;
  const decisions: DesignDecision[] = [];
  const warnings: string[] = [];
  if (!spec) {
    return {
      panels: [],
      segments: [],
      decisions,
      warnings: ['Select a panel first (Step 4).'],
      requestedKwp: 0,
      achievedKwp: 0,
      ranking: [],
    };
  }
  const requestedKwp = objective === 'target_kwp' ? project.components.targetKwp : 0;
  const budget =
    objective === 'target_kwp' && requestedKwp > 0
      ? Math.floor((requestedKwp * 1000) / spec.watt)
      : Infinity;

  decisions.push({
    id: 'objective',
    topic: 'Design objective',
    choice:
      objective === 'target_kwp'
        ? `Match the requested ${requestedKwp} kWp (${Number.isFinite(budget) ? budget : '∞'} × ${spec.watt} W panels)`
        : 'Use the maximum capacity the selected roofs support',
    reason:
      objective === 'target_kwp'
        ? 'You set a target capacity in Step 4; panels stop once it is met.'
        : 'No fixed target — every valid position on every roof is used.',
    inputs: [`targetKwp=${project.components.targetKwp}`, `panel=${spec.brand} ${spec.model}`],
  });

  const surround = surroundFor(project);
  const neighbours = neighbourProvenance(project, surround);
  const ranking = rankRoofs(project, spec);
  ranking.forEach((r, i) => {
    decisions.push({
      id: `roof-rank:${r.roofId}`,
      topic: `Roof priority ${i + 1}: ${r.name}`,
      choice:
        r.capacityPanels === 0
          ? 'Skipped — no valid panel positions'
          : `${r.capacityPanels} panels possible · ${Math.round(r.access * 100)}% sun access · ${Math.round(r.poa * 100)}% orientation`,
      reason:
        r.capacityPanels === 0
          ? 'Setbacks, obstructions or shape leave no room for a full panel.'
          : `Ranked by expected yield per panel — measured sun access (${Math.round(r.access * 100)}%) × orientation factor (${Math.round(r.poa * 100)}% POA/GHI for this face's tilt & azimuth) = ${r.score}. Higher-yielding faces fill first, so a north-facing plane is used last even when unshaded.`,
      inputs: [
        `capacityKwp=${r.capacityKwp}`,
        `beamAccess=${r.access}`,
        `orientationPoa=${r.poa}`,
        // never let the log imply the neighbourhood was counted when it wasn't
        `neighbourShade=${neighbours}`,
      ],
    });
  });

  const panels: PlacedPanel[] = [];
  const segments: ArraySegment[] = [];
  let remaining = budget;
  for (const rank of ranking) {
    if (remaining <= 0 || rank.capacityPanels === 0) continue;
    const roof = project.roofs.find((r) => r.id === rank.roofId)!;
    // the budget for THIS roof, before the fill spends it
    const budgetHere = Number.isFinite(remaining) ? remaining : undefined;
    // avoidPanels: [] — VERIFIED: Step6Editor.runAutoPlace applies this result
    // as patch({ panels: result.panels, segments: result.segments }), a full
    // REPLACE of the layout, so the panels being replaced must not block it.
    const filled = fillRoofAsSegment(project, roof, spec, {
      ...DEFAULT_FILL,
      avoidPanels: [],
      maxPanels: budgetHere,
      // A BUDGET MUST KEEP THE BEST POSITIONS, NOT THE FIRST ONES. Only called
      // when the budget is smaller than the roof — every candidate is measured
      // by the REAL shading engine, the same one that ranked the roofs.
      //
      // The candidates go in DISABLED so they measure the position against the
      // STATIC scene (roofs, parapets, obstructions, arresters, the real
      // neighbourhood) and not against each other. Two reasons: candidate-on-
      // candidate shade is a fiction — most of these are about to be discarded,
      // and which survive is the very question being answered, so scoring them
      // against each other is circular; and it keeps the cost linear in the
      // candidate count (measured: 800 candidates in ~0.6 s, against ~22 s when
      // every candidate also casts) so the button stays usable on a C&I roof.
      // Rows are laid at the winter-solstice shadow-free pitch anyway, so real
      // inter-row shading is ~0 by construction — useDesignSync then stamps the
      // full Tier-2 access, self-shading included, on the panels that survive.
      scoreCandidates: (candidates) =>
        computeSolarAccess(
          { ...project, panels: candidates.map((c) => ({ ...c, enabled: false })) },
          { surround },
        ),
    });
    if (!filled) continue;
    // geometric reindex (holes from mid-row obstructions recorded correctly)
    const re = reindexSegment(roof, spec, filled.segment, filled.panels);
    re.segment.label = `A${segments.length + 1}`;
    segments.push(re.segment);
    panels.push(...re.panels);
    remaining -= re.panels.length;
    if (budgetHere !== undefined && re.panels.length < rank.capacityPanels) {
      decisions.push({
        id: `budget:${roof.id}`,
        topic: `Budget on ${roof.name}`,
        choice: `${re.panels.length} of the ${rank.capacityPanels} positions this roof holds`,
        reason: `The requested capacity does not take the whole roof, so the positions with the most measured sun were kept — not simply the first ones in the grid. Neighbour shade: ${neighbours}.`,
        inputs: [
          `capacityPanels=${rank.capacityPanels}`,
          `kept=${re.panels.length}`,
          `neighbourShade=${neighbours}`,
        ],
      });
    }

    // §26c: log every obstruction the array BRIDGES, with the numbers that
    // made it legal — and flag engineer-confirmation bridges
    const clearanceM = resolveRacking(project, roof, re.segment, spec)?.frontLegM;
    for (const ob of project.roofs.length === 0 ? [] : project.obstructions) {
      if (ob.roofId !== roof.id || !ob.blocksPlacement) continue;
      if (!isBridgedAt(ob, clearanceM)) continue;
      const foot =
        ob.shape === 'circle'
          ? rectCorners(ob.center, ob.diameterM, ob.diameterM, 0)
          : rectCorners(ob.center, ob.lengthM, ob.widthM, ob.rotationDeg);
      const spans = re.panels.some((pp) =>
        rectsOverlap(panelCornersOnRoof(pp, spec, roof), foot),
      );
      if (!spans) continue;
      const caps = resolveCapabilities(ob);
      decisions.push({
        id: `bridging:${ob.id}`,
        topic: `Bridged ${ob.label} on ${roof.name}`,
        choice: `Array spans above it at ${clearanceM?.toFixed(2)} m clearance`,
        reason: `${ob.label} (${ob.heightM.toFixed(2)} m) allows panels to cross; required clearance ${requiredBridgeClearanceM(ob).toFixed(2)} m is met, so its footprint was not lost.`,
        inputs: [
          `obstructionHeight=${ob.heightM}m`,
          `minVertical=${caps.minVerticalClearanceM}m`,
          `structureClearance=${clearanceM?.toFixed(2)}m`,
        ],
      });
      if (caps.requiresEngineerConfirmation) {
        warnings.push(
          `Array bridges ${ob.label} — flagged for engineer confirmation (load path over the obstruction).`,
        );
      }
    }

    const pitch = fillRowPitchM(project, roof, spec, DEFAULT_FILL);
    if (pitch !== null) {
      decisions.push({
        id: `spacing:${roof.id}`,
        topic: `Row spacing on ${roof.name}`,
        choice: `${pitch.toFixed(2)} m centre-to-centre`,
        reason:
          'Winter-solstice shadow-free spacing (09:00–15:00 solar time) — rows never shade each other in the design window. Tighter spacing is allowed in table settings; the energy report then prices the row-shading loss honestly.',
        inputs: [`tilt=${filled.segment.racking.kind !== 'flush' ? filled.segment.racking.tiltDeg : 0}°`, `latitude=${project.location?.latLng.lat ?? '—'}`],
      });
    }
  }

  const achievedKwp = Math.round(((panels.length * spec.watt) / 1000) * 100) / 100;
  decisions.push({
    id: 'capacity-outcome',
    topic: 'Achieved capacity',
    choice: `${achievedKwp} kWp (${panels.length} panels)`,
    reason:
      objective === 'target_kwp' && achievedKwp < requestedKwp - spec.watt / 1000
        ? 'The selected roofs cannot fit the full request after setbacks, obstructions and shadow-free spacing.'
        : objective === 'target_kwp'
          ? 'Requested capacity met within one panel.'
          : 'Every valid position on the ranked roofs is used.',
    inputs: [`requested=${requestedKwp}`, `achieved=${achievedKwp}`],
  });
  if (objective === 'target_kwp' && achievedKwp < requestedKwp - spec.watt / 1000) {
    warnings.push(
      `Only ${achievedKwp} of the requested ${requestedKwp} kWp fits the current roofs.`,
    );
  }

  // sanctioned-load SOFT cap (net-metering practice) — warn, never block
  const sanctioned = project.info.sanctionedLoadKw;
  if (sanctioned > 0 && achievedKwp > sanctioned) {
    warnings.push(
      `Designed ${achievedKwp} kWp exceeds the sanctioned load (${sanctioned} kW) — many DISCOMs cap net-metering at the sanctioned load; verify before proceeding.`,
    );
    decisions.push({
      id: 'sanctioned-load',
      topic: 'Sanctioned-load check',
      choice: `${achievedKwp} kWp > ${sanctioned} kW sanctioned`,
      reason:
        'Kept as designed (soft cap): rules vary by DISCOM and sanctioned load can often be enhanced. Confirm with the local DISCOM.',
      inputs: [`sanctionedLoadKw=${sanctioned}`],
    });
  }

  return { panels, segments, decisions, warnings, requestedKwp, achievedKwp, ranking };
}

