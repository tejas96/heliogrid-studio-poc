// ─── Per-field BOM overrides (Phase 22c) ────────────────────────────────────
// WHAT WAS WRONG
//
// The old model stored a whole edited COPY of a derived line and swapped it in,
// keyed on `category + '|' + item`. Three consequences, all bad:
//
//   1. Editing one field froze every other field at its value at edit time —
//      including `formula`, so a line could state a derivation that did not
//      produce the number printed beside it.
//   2. The key was built from strings that interpolate the panel model, the
//      steel profile label and a conditional item name. Change the panel and
//      every override silently detached — no warning, no cleanup, gone.
//   3. It collided. The pitched-roof loop emits two lines with IDENTICAL item
//      names (one per covering), so an edit to one applied to both and only the
//      last survived the Map.
//
// WHAT REPLACES IT
//
// Edits are per FIELD, attached to the stable `LineKey` from Phase 22b, and
// each records `autoAtEdit` — what the engine said when the user overrode it.
// Everything else on the line stays live, so a formula always describes the
// number next to it unless that number is itself overridden.
import type { BomLine, BomOverride, BomStaleField, BomState, Project } from '../../types';

/** Fields a user may override. Anything else is derived, full stop. */
export const OVERRIDABLE_FIELDS = [
  'item',
  'spec',
  'brand',
  'qty',
  'unit',
  'unitPriceInr',
  'wastePct',
  'gstPct',
  'included',
] as const;
export type OverridableField = (typeof OVERRIDABLE_FIELDS)[number];

export function isOverridable(field: string): field is OverridableField {
  return (OVERRIDABLE_FIELDS as readonly string[]).includes(field);
}

/** An override that no longer matches anything the design produces. */
export interface BomOrphan {
  lineKey: string;
  /** the fields that were edited, for the "keep as custom line" offer */
  fields: Record<string, unknown>;
  /** best-effort human name — the item text at edit time, when we have it */
  label: string;
}

export interface MergedBomResult {
  lines: BomLine[];
  /**
   * Saved edits with no home in the current design. Surfaced, never dropped:
   * silently discarding a user's pricing work is the failure mode the old model
   * had, and the user could not even tell it had happened.
   */
  orphans: BomOrphan[];
}

/** Legacy whole-line overrides, applied exactly as they always were. */
function applyLegacy(auto: BomLine[], project: Project): BomLine[] {
  const legacy = project.bomOverrides ?? [];
  if (legacy.length === 0) return auto;
  const byKey = new Map(
    legacy.filter((o) => o.auto && o.overridden).map((o) => [o.category + '|' + o.item, o]),
  );
  if (byKey.size === 0) return auto;
  return auto.map((l) => byKey.get(l.category + '|' + l.item) ?? l);
}

/**
 * Convert legacy whole-line overrides into per-field ones.
 *
 * Only the three fields the old UI could actually edit are carried across —
 * qty, unit price and (for custom lines) the item name. Inferring more would be
 * guessing at intent: the old model copied every field whether the user touched
 * it or not, so a difference elsewhere is an artefact, not an edit.
 *
 * `autoAtEdit` is left undefined for migrated fields: we genuinely do not know
 * what the engine said back then, and inventing a value would make a migrated
 * override look freshly-confirmed when it is not.
 *
 * Pure and idempotent — running it on an already-migrated project yields the
 * same result, because the legacy array is cleared by the caller.
 */
export function migrateLegacyOverrides(project: Project): {
  overrides: BomOverride[];
  custom: BomLine[];
} {
  const legacy = project.bomOverrides ?? [];
  const custom = legacy.filter((o) => !o.auto);
  const overrides: BomOverride[] = [];

  // The legacy key cannot address a specific line, so re-derive and match on it
  // once — that is the last time that fragile key is ever used.
  const auto = deriveForMigration(project);
  const byLegacyKey = new Map(auto.map((l) => [l.category + '|' + l.item, l]));

  for (const o of legacy) {
    if (!o.auto || !o.overridden) continue;
    const target = byLegacyKey.get(o.category + '|' + o.item);
    if (!target) continue; // becomes an orphan, reported by mergedBomResult
    const fields: BomOverride['fields'] = {};
    if (o.qty !== target.qty) fields.qty = { value: o.qty, autoAtEdit: undefined };
    if (o.unitPriceInr !== target.unitPriceInr)
      fields.unitPriceInr = { value: o.unitPriceInr, autoAtEdit: undefined };
    if (Object.keys(fields).length > 0) overrides.push({ lineKey: target.id, fields });
  }
  return { overrides, custom };
}

// Indirection so merge.ts does not import bom.ts at module scope (that would be
// a cycle: bom.ts → merge.ts → bom.ts). Set once by bom.ts on load.
type Deriver = (p: Project) => BomLine[];
let deriver: Deriver | null = null;
export function _setDeriver(d: Deriver): void {
  deriver = d;
}
function deriveForMigration(p: Project): BomLine[] {
  return deriver ? deriver(p) : [];
}

/** Apply one field override, honouring the declared type of the target field. */
function withField(line: BomLine, field: string, value: unknown): BomLine {
  if (!isOverridable(field)) return line;
  return { ...line, [field]: value } as BomLine;
}

/**
 * Derived lines with per-field edits applied, plus any edits that no longer
 * match. `deriveBom` is passed in rather than imported, for the cycle reason
 * above.
 */
export function mergeBom(auto: BomLine[], project: Project): MergedBomResult {
  const withLegacy = applyLegacy(auto, project);
  const state = project.bom;
  if (!state) return { lines: withLegacy, orphans: [] };

  const byKey = new Map(withLegacy.map((l) => [l.id, l]));
  const orphans: BomOrphan[] = [];

  for (const ov of state.overrides) {
    const target = byKey.get(ov.lineKey);
    if (!target) {
      orphans.push({
        lineKey: ov.lineKey,
        fields: Object.fromEntries(Object.entries(ov.fields).map(([k, v]) => [k, v.value])),
        label: String(ov.fields.item?.value ?? ov.lineKey),
      });
      continue;
    }
    let line = target;
    const overriddenFields: string[] = [];
    const staleFields: string[] = [];
    const staleDetail: BomStaleField[] = [];
    for (const [field, entry] of Object.entries(ov.fields)) {
      // A field the registry no longer produces is reported, not applied — the
      // shape of a line can change between versions.
      if (!isOverridable(field)) {
        orphans.push({
          lineKey: ov.lineKey,
          fields: { [field]: entry.value },
          label: `${target.item} · ${field}`,
        });
        continue;
      }
      // Staleness is a comparison against what the engine says NOW. Undefined
      // autoAtEdit (a migrated override) is never called stale: we do not know
      // what it was, and guessing would cry wolf.
      if (entry.autoAtEdit !== undefined) {
        const now = (target as unknown as Record<string, unknown>)[field];
        if (!Object.is(now, entry.autoAtEdit)) {
          staleFields.push(field);
          // E17: capture all three values here. This is the only place they
          // coexist — withField overwrites the derived figure on the next
          // line, so by the time the row renders, `now` is gone.
          staleDetail.push({ field, yours: entry.value, wasAtEdit: entry.autoAtEdit, now });
        }
      }
      line = withField(line, field, entry.value);
      overriddenFields.push(field);
    }
    if (overriddenFields.length > 0) {
      line = {
        ...line,
        overridden: true,
        overriddenFields,
        ...(staleFields.length > 0 ? { staleFields, staleDetail } : {}),
      };
      byKey.set(ov.lineKey, line);
    }
  }

  return {
    lines: [...byKey.values(), ...state.custom],
    orphans,
  };
}

/** Set one field override, stamping what the engine says right now. */
export function setFieldOverride(
  state: BomState | undefined,
  lineKey: string,
  field: OverridableField,
  value: unknown,
  autoNow: unknown,
): BomState {
  const base: BomState = state ?? { overrides: [], custom: [] };
  const rest = base.overrides.filter((o) => o.lineKey !== lineKey);
  const existing = base.overrides.find((o) => o.lineKey === lineKey);
  const fields = { ...(existing?.fields ?? {}), [field]: { value, autoAtEdit: autoNow } };
  return { ...base, overrides: [...rest, { lineKey, fields }] };
}

/** Drop one field override — the ↻ reset. Removes the record when last. */
export function clearFieldOverride(
  state: BomState | undefined,
  lineKey: string,
  field: string,
): BomState {
  const base: BomState = state ?? { overrides: [], custom: [] };
  const out: BomOverride[] = [];
  for (const o of base.overrides) {
    if (o.lineKey !== lineKey) {
      out.push(o);
      continue;
    }
    const fields = { ...o.fields };
    delete fields[field];
    if (Object.keys(fields).length > 0) out.push({ ...o, fields });
  }
  return { ...base, overrides: out };
}

/** Drop every override on a line, or on a whole set of lines (section refresh). */
export function clearOverrides(state: BomState | undefined, lineKeys: string[]): BomState {
  const base: BomState = state ?? { overrides: [], custom: [] };
  const drop = new Set(lineKeys);
  return { ...base, overrides: base.overrides.filter((o) => !drop.has(o.lineKey)) };
}
