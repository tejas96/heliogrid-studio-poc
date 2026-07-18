// ─── Auto-stringing: legal strings, or an honest refusal ────────────────────
// The rule this module exists to enforce: NEVER emit a string that cannot be
// built. The old engine, when MPPT slots ran short, divided the panels by the
// slots it had and produced whatever length fell out — 30 modules in series on
// a 1100 V inverter, silently (audit finding 7; pinned as a KNOWN LIMIT in the
// Phase-4 characterization tests). That design then flowed into the SLD and the
// customer quote.
//
// The replacement leaves panels UNSTRUNG instead. An unstrung panel is visible,
// reportable and blocks the proposal (validateSystem → nextBlocker); an
// over-voltage string is a fire-and-warranty event that looks fine on screen.
// Refusing to answer beats answering wrongly.
import type {
  InverterSpec,
  PanelSpec,
  Project,
  StringDef,
  ValidationIssue,
} from '../../types';
import { genId } from '../geo';
import { groupPanels, orderGroup, type PanelGroup } from './grouping';
import type { DesignTemps } from './temps';
import { stringSizing, STRING_COLORS } from './window';

export interface AutoStringResult {
  strings: StringDef[];
  issues: ValidationIssue[];
  /** enabled panels no legal string could take — never silently dropped */
  unstrungPanelIds: string[];
}

/**
 * How many strings may sit in parallel on ONE MPPT input.
 *
 * Compares the array's Isc against the MPPT's rating WITHOUT the 1.25
 * continuous-duty factor, deliberately. That factor belongs to conductor and
 * OCPD sizing (lib/electrical-sizing.ts already applies 1.25 × 1.25 = 1.56 to
 * the string fuse); the inverter's own input rating is a manufacturer limit
 * that already carries its margin. Applying 1.25 here as well double-counts it
 * and REFUSES ordinary hardware — a 13.85 A Isc module on a 16 A MPPT (e.g.
 * GoodWe GW5000-NS) is a standard pairing that this would have rejected.
 *
 * Isc, not Imp, is the right current: the input must tolerate the worst case
 * the array can present, and Isc > Imp (the old engine compared Imp — audit
 * finding 7).
 *
 * ENGINEER VALIDATION REQUIRED (plan §7 — "DC sizing rules against IS/IEC as
 * adopted by target DISCOMs"). KNOWN CATALOG GAP: `mppt.maxCurrentA` is a
 * single field, but datasheets publish TWO limits — max OPERATING input
 * current (vs Imp) and max SHORT-CIRCUIT current (vs Isc, typically ~1.25–1.5×
 * higher). We hold Isc to the one field we have, which is the conservative
 * reading. Splitting the field would let this be exact.
 */
export function parallelPerMppt(
  panel: PanelSpec,
  inverter: InverterSpec,
): { allowed: number; limitedByCurrent: boolean } {
  const byCurrent = Math.floor(inverter.mppt.maxCurrentA / Math.max(0.1, panel.iscA));
  const byDatasheet = Math.max(1, inverter.mppt.stringsPerMppt);
  return {
    allowed: Math.max(0, Math.min(byDatasheet, byCurrent)),
    limitedByCurrent: byCurrent < byDatasheet,
  };
}

/**
 * Fold shade-tier groups too small to be strung into an electrically
 * compatible neighbour (same roof PLANE, same orientation, same tilt).
 *
 * WHY THIS EXISTS: splitting by shade tier is sound in principle — a shaded
 * module throttles every module in series with it — but the tier boundaries
 * (95 % / 85 %) are hard edges on a continuous quantity. One module at 82.7 %
 * beside 224 at >95 % lands in a tier of its OWN, and a string of one is
 * impossible, so the panel became permanently unstrung: costed, drawn, counted
 * in capacity, generating nothing, with no action available in the editor.
 * That is a dead end the tool created, not a real constraint of the site.
 *
 * Real practice is to either accept the odd shaded module into a string (and
 * live with the mismatch) or leave it off the roof. Accepting it is the
 * recoverable choice — the design completes and the user can still delete the
 * panel — so long as we SAY what it costs. Hence: merge, and warn naming the
 * module's own access, so the trade-off is the user's to make rather than
 * silently taken either way.
 *
 * Only groups below `minPanels` merge; a genuinely shaded ROW (enough modules
 * to form its own string) keeps its separate string, which is the whole point
 * of tiering.
 */
export function mergeUndersizedGroups(
  groups: PanelGroup[],
  minPanels: number,
  issues: ValidationIssue[],
): PanelGroup[] {
  const out: PanelGroup[] = [];
  const small: PanelGroup[] = [];
  for (const g of groups) (g.panels.length >= minPanels ? out : small).push(g);
  for (const g of small) {
    // An electrically identical host, differing only in how shaded it is.
    // Matched on PLANE, not roofId: the co-planar sibling faces the skeleton
    // emits for one wall are one surface, so a tail on one of them may join a
    // string on another. Different planes still never merge — that would
    // understate the string's cable run.
    const host = out.find(
      (h) =>
        h.planeId === g.planeId &&
        h.azimuthDeg === g.azimuthDeg &&
        h.tiltDeg === g.tiltDeg,
    );
    if (!host) {
      out.push(g); // nothing to merge into: splitGroup will report the tail
      continue;
    }
    host.panels.push(...g.panels);
    const worst = Math.min(...g.panels.map((p) => p.solarAccess ?? 1));
    issues.push({
      level: 'warn',
      code: 'shade_mismatch',
      message:
        `${g.panels.length} ${g.shadeTier}ly-shaded panel${g.panels.length > 1 ? 's' : ''} ` +
        `(down to ${Math.round(worst * 100)}% sun) joined a string of clearer modules — ` +
        `too few to form their own string. In series the shadiest module limits the string, ` +
        `so consider removing ${g.panels.length > 1 ? 'them' : 'it'} instead.`,
      focusPanelIds: g.panels.map((p) => p.id),
    });
  }
  return out;
}

/**
 * Split one group's serpentine order into legal series lengths.
 * Returns the chunks plus any tail too short to be a legal string.
 */
export function splitGroup(
  ordered: string[],
  minPanels: number,
  maxPanels: number,
): { chunks: string[][]; tail: string[] } {
  const n = ordered.length;
  if (n < minPanels) return { chunks: [], tail: ordered };
  const nStrings = Math.ceil(n / maxPanels);
  // Balanced first: sizes differ by at most one, which keeps parallel strings
  // equal-length (a hard requirement for sharing an MPPT) wherever possible.
  if (Math.floor(n / nStrings) >= minPanels) {
    const chunks: string[][] = [];
    let i = 0;
    for (let s = 0; s < nStrings; s++) {
      const size = Math.floor(n / nStrings) + (s < n % nStrings ? 1 : 0);
      chunks.push(ordered.slice(i, i + size));
      i += size;
    }
    return { chunks, tail: [] };
  }
  // Balanced would fall under the MPPT floor (a narrow window, e.g. min 12 /
  // max 18 with 20 panels). Fill full-length strings and be honest about the
  // remainder rather than shipping a string that drops out of tracking.
  const chunks: string[][] = [];
  let i = 0;
  while (n - i >= maxPanels) {
    chunks.push(ordered.slice(i, i + maxPanels));
    i += maxPanels;
  }
  const rest = ordered.slice(i);
  if (rest.length >= minPanels) chunks.push(rest);
  return { chunks, tail: rest.length >= minPanels ? [] : rest };
}

/**
 * Plan the strings for a project. Pure: returns what SHOULD exist plus every
 * reason it could not do better. Callers commit `strings` as one patch.
 */
export function autoStringPlan(
  project: Project,
  panel: PanelSpec,
  inverter: InverterSpec,
  inverterCount: number,
  temps: DesignTemps,
): AutoStringResult {
  const issues: ValidationIssue[] = [];
  const enabled = project.panels.filter((p) => p.enabled);
  if (enabled.length === 0) return { strings: [], issues, unstrungPanelIds: [] };

  const sizing = stringSizing(panel, inverter, temps);
  if (sizing.impossible) {
    return {
      strings: [],
      issues: [
        {
          level: 'error',
          code: 'string_window_empty',
          message: `${panel.brand} ${panel.model} + ${inverter.brand} ${inverter.model}: ${sizing.impossible}`,
        },
      ],
      unstrungPanelIds: enabled.map((p) => p.id),
    };
  }

  const par = parallelPerMppt(panel, inverter);
  if (par.allowed === 0) {
    return {
      strings: [],
      issues: [
        {
          level: 'error',
          code: 'isc_high',
          message: `One string of ${panel.model} can present ${panel.iscA.toFixed(1)} A (Isc) — above the ${inverter.mppt.maxCurrentA} A MPPT input limit of ${inverter.model}`,
        },
      ],
      unstrungPanelIds: enabled.map((p) => p.id),
    };
  }

  // ── build the legal strings per group ────────────────────────────────────
  const groups = mergeUndersizedGroups(groupPanels(project), sizing.minPanels, issues);
  const planned: Array<{ group: PanelGroup; ids: string[] }> = [];
  const unstrung: string[] = [];
  for (const g of groups) {
    // orderGroup handles the MLPE mega-group (spans faces) AND the ordinary
    // single-roof group identically — face-by-face serpentine, deterministic.
    const ordered = orderGroup(g, project.roofs ?? []).map((p) => p.id);
    const { chunks, tail } = splitGroup(ordered, sizing.minPanels, sizing.maxPanels);
    for (const c of chunks) planned.push({ group: g, ids: c });
    if (tail.length > 0) {
      unstrung.push(...tail);
      issues.push({
        level: 'warn',
        code: 'group_too_small',
        message: `${tail.length} panel${tail.length > 1 ? 's' : ''} can't form a string: ${sizing.minPanels} in series are needed to hold the ${inverter.mppt.minV} V MPPT floor at ${temps.maxCellC} °C. Remove them, or add panels alongside them.`,
        focusPanelIds: tail,
      });
    }
  }

  // ── fit them into the MPPT inputs we actually have ───────────────────────
  const slots: Array<{ inverterIndex: number; mpptIndex: number; strings: string[][]; groupKey?: string }> = [];
  for (let inv = 0; inv < inverterCount; inv++) {
    for (let m = 0; m < inverter.mppt.count; m++) {
      slots.push({ inverterIndex: inv, mpptIndex: m, strings: [] });
    }
  }
  const strings: StringDef[] = [];
  const overflow: string[] = [];
  for (const item of planned) {
    // parallel strings must be SAME GROUP and SAME LENGTH — unequal strings in
    // parallel fight each other and the shorter one bleeds power
    const slot =
      slots.find(
        (s) =>
          s.strings.length > 0 &&
          s.groupKey === item.group.key &&
          s.strings.length < par.allowed &&
          s.strings[0].length === item.ids.length,
      ) ?? slots.find((s) => s.strings.length === 0);
    if (!slot) {
      overflow.push(...item.ids);
      continue;
    }
    slot.groupKey = item.group.key;
    slot.strings.push(item.ids);
    strings.push({
      id: genId('str'),
      name: `String ${strings.length + 1}`,
      inverterIndex: slot.inverterIndex,
      mpptIndex: slot.mpptIndex,
      panelIds: item.ids,
      color: STRING_COLORS[strings.length % STRING_COLORS.length],
    });
  }

  if (overflow.length > 0) {
    const slotsTotal = inverter.mppt.count * inverterCount;
    unstrung.push(...overflow);
    issues.push({
      level: 'error',
      code: 'mppt_capacity',
      message:
        `Insufficient MPPT capacity: ${overflow.length} panel${overflow.length > 1 ? 's' : ''} left unstrung. ` +
        `${inverterCount} × ${inverter.model} offers ${slotsTotal} MPPT input${slotsTotal > 1 ? 's' : ''}` +
        `${par.allowed > 1 ? ` × ${par.allowed} parallel` : ''}` +
        `${par.limitedByCurrent ? ` (current-limited to ${par.allowed}, below the datasheet's ${inverter.mppt.stringsPerMppt})` : ''}` +
        ` — add an inverter or reduce panels.`,
      focusPanelIds: overflow,
    });
  }
  if (sizing.pmaxEstimated) {
    issues.push({
      level: 'warn',
      code: 'temp_coeff_estimated',
      message: `String lengths use an assumed Pmax coefficient (${panel.model} datasheet value missing) and ${temps.note}`,
    });
  }
  return { strings, issues, unstrungPanelIds: unstrung };
}
