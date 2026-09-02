// ─── String → inverter / MPPT assignment, the way PVsyst sizes a plant ──────
// Rules, and where they come from:
//
//   1. IDENTICAL STRINGS PER MPPT. Strings in parallel on one MPPT input must
//      have the same module count and the same orientation/tilt (PVsyst:
//      "strings in a sub-array must be identical"; unequal strings in parallel
//      fight each other and the shorter one bleeds power).
//   2. ONE TRACKER PER STRING WHERE THE HARDWARE ALLOWS. A string gets an
//      empty MPPT before it is paralleled onto a used one — each MPPT then
//      tracks its own string, and mismatch/shade on one does not drag another.
//   3. PARALLEL LIMIT per MPPT: datasheet strings-per-input AND the input
//      current rating against the array's Isc (parallelPerMppt).
//   4. BALANCE DC POWER ACROSS INVERTERS. Largest strings first (LPT), each to
//      the inverter with the lowest DC kWp so far that can take it (PVsyst
//      distributes a sub-array's strings evenly over its inverters; a plant
//      with one inverter at Pnom ratio 1.9 and two at 0.6 is a design error,
//      not a stringing detail).
//   5. Everything is DETERMINISTIC: stable ordering, index tie-breaks — the
//      same design always strings the same way (fingerprints depend on it).
//
// The Pnom ratio band (0.90–1.35, PVsyst warns above 1.30) is CHECKED in
// validateSystem per inverter; this module only places, it never drops.
import type { InverterSpec, PanelSpec } from '../../types';

export interface PlannedString {
  /** module ids in wiring order */
  ids: string[];
  /** electrical equivalence class: same plane, orientation, tilt (and shade tier) */
  groupKey: string;
}

export interface Assignment {
  inverterIndex: number;
  mpptIndex: number;
}

interface MpptState {
  inverterIndex: number;
  mpptIndex: number;
  groupKey: string | null;
  len: number;
  count: number;
  reserved: boolean;
}

interface InverterState {
  index: number;
  kwp: number;
  mppts: MpptState[];
}

/**
 * Place planned strings on inverters/MPPTs. Returns the assignment for each
 * string in the SAME order as `planned` (null = no legal input left), plus
 * the DC kWp each inverter ends up carrying.
 */
export function assignStrings(
  planned: PlannedString[],
  panel: PanelSpec,
  inverter: InverterSpec,
  inverterCount: number,
  /** strings allowed in parallel on one MPPT input (parallelPerMppt().allowed) */
  parallelAllowed: number,
  reserved: Assignment[] = [],
  /** DC kWp the reserved (manual) strings already put on each inverter */
  reservedKwp: number[] = [],
): { assignments: (Assignment | null)[]; inverterKwp: number[] } {
  const par = { allowed: Math.max(1, parallelAllowed) };
  const reservedKeys = new Set(reserved.map((r) => `${r.inverterIndex}/${r.mpptIndex}`));
  const inverters: InverterState[] = [];
  for (let i = 0; i < Math.max(1, inverterCount); i++) {
    const mppts: MpptState[] = [];
    for (let m = 0; m < inverter.mppt.count; m++) {
      mppts.push({
        inverterIndex: i,
        mpptIndex: m,
        groupKey: null,
        len: 0,
        count: 0,
        reserved: reservedKeys.has(`${i}/${m}`),
      });
    }
    inverters.push({ index: i, kwp: reservedKwp[i] ?? 0, mppts });
  }

  const kwpOf = (s: PlannedString) => (s.ids.length * panel.watt) / 1000;
  // largest first (LPT), stable on the original order for ties
  const order = planned
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.ids.length - a.s.ids.length || a.i - b.i);

  const assignments: (Assignment | null)[] = new Array(planned.length).fill(null);
  for (const { s, i } of order) {
    // the input this string could take on each inverter: an empty tracker
    // first, else a tracker already carrying identical strings with room
    const options: { inv: InverterState; mppt: MpptState; empty: boolean }[] = [];
    for (const inv of inverters) {
      const empty = inv.mppts.find((m) => !m.reserved && m.count === 0);
      const twin = inv.mppts.find(
        (m) =>
          !m.reserved &&
          m.count > 0 &&
          m.groupKey === s.groupKey &&
          m.len === s.ids.length &&
          m.count < par.allowed,
      );
      if (empty) options.push({ inv, mppt: empty, empty: true });
      else if (twin) options.push({ inv, mppt: twin, empty: false });
    }
    if (options.length === 0) continue; // overflow — the caller reports it
    // lowest DC load wins; on a tie prefer an empty tracker, then the lower index
    options.sort(
      (a, b) =>
        a.inv.kwp - b.inv.kwp || Number(b.empty) - Number(a.empty) || a.inv.index - b.inv.index,
    );
    const pick = options[0];
    pick.mppt.groupKey = s.groupKey;
    pick.mppt.len = s.ids.length;
    pick.mppt.count++;
    pick.inv.kwp += kwpOf(s);
    assignments[i] = { inverterIndex: pick.inv.index, mpptIndex: pick.mppt.mpptIndex };
  }
  return { assignments, inverterKwp: inverters.map((inv) => inv.kwp) };
}

/** DC kWp each inverter carries under a given set of strings. */
export function inverterLoadsKwp(
  strings: { inverterIndex: number; panelIds: string[] }[],
  panel: PanelSpec,
  inverterCount: number,
): number[] {
  const out = new Array(Math.max(1, inverterCount)).fill(0) as number[];
  for (const s of strings) {
    const i = Math.min(out.length - 1, Math.max(0, s.inverterIndex));
    out[i] += (s.panelIds.length * panel.watt) / 1000;
  }
  return out;
}
