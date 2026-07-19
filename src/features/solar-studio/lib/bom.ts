// ─── BOM automation: derive a full bill of materials from the design state ──
// Every line carries a human-readable formula so users can trust the numbers.
//
// This file is the PUBLIC module — everything outside lib/bom/ imports from
// here. The derivation itself lives in lib/bom/: a registry of semantic line
// keys, one shared context, and one emitter per category. `deriveBom` is the
// orchestrator that wires them together.
import type { BomLine, Project } from '../types';
import { DEFAULT_MARGIN_PCT } from '../data/pricebook';
import { STRUCTURE_DISCLAIMER } from './structure';
import { buildContext } from './bom/context';
import { emitModules } from './bom/emitters/modules';
import { emitInverter } from './bom/emitters/inverter';
import { emitElectrical } from './bom/emitters/electrical';
import { emitMechanical } from './bom/emitters/mechanical';
import { emitSafety } from './bom/emitters/safety';
import { emitCivil } from './bom/emitters/civil';

import { _setDeriver, mergeBom, type MergedBomResult } from './bom/merge';

export { CATEGORY_ORDER } from './bom/registry';
export {
  clearFieldOverride,
  clearOverrides,
  migrateLegacyOverrides,
  OVERRIDABLE_FIELDS,
  setFieldOverride,
  type BomOrphan,
  type MergedBomResult,
  type OverridableField,
} from './bom/merge';
export type { LineKey } from './bom/registry';
export type { BomContext } from './bom/context';

/**
 * The emitters, in CATEGORY_ORDER. Each is a pure function of the context and
 * owns exactly one category, so the order lines appear in the table is this
 * array — not the order some `out.push` happened to be written in.
 */
const EMITTERS = [
  emitModules,
  emitInverter,
  emitElectrical,
  emitMechanical,
  emitSafety,
  emitCivil,
];

// merge.ts needs to re-derive once during migration but must not import this
// module at load time (that would be a cycle) — hand it the deriver instead.
_setDeriver((p) => deriveBom(p));

export function deriveBom(project: Project): BomLine[] {
  const ctx = buildContext(project);
  // No panel spec, no inverter, or nothing placed ⇒ nothing to bill.
  if (!ctx) return [];
  return EMITTERS.flatMap((emit) => emit(ctx));
}

/** Merge auto lines with user overrides/custom lines. */
export function mergedBom(project: Project): BomLine[] {
  return mergedBomResult(project).lines;
}

/**
 * Merged lines PLUS any saved edits that no longer match the design.
 *
 * `mergedBom` stays the thin wrapper so the six existing call sites are
 * untouched; the BOM screen uses this form to surface orphans instead of
 * dropping them on the floor, which is what the old whole-line model did.
 */
export function mergedBomResult(project: Project): MergedBomResult {
  const auto = deriveBom(project);
  const legacyCustom = (project.bomOverrides ?? []).filter((o) => !o.auto);
  const r = mergeBom(auto, project);
  // legacy custom lines survive until the project migrates (normalize.ts)
  return project.bom
    ? r
    : { lines: [...r.lines, ...legacyCustom], orphans: r.orphans };
}

/**
 * The BOM's overall trustworthiness (plan §F3). A quote is only as strong as
 * its weakest line, so the header state is the WORST tier present. An
 * overridden line counts as 'measured' — a human took ownership of that number.
 */
export function bomConfidence(lines: BomLine[]): {
  /** worst tier present — the header badge */
  tier: BomLine['confidence'];
  counts: Record<BomLine['confidence'], number>;
  /** lines an engineer/surveyor must still confirm, by item */
  needsVerification: string[];
  /** true ⇒ the proposal must carry a site-verification warning */
  preliminary: boolean;
} {
  const order: BomLine['confidence'][] = ['measured', 'derived', 'estimated', 'assumed'];
  const counts = { measured: 0, derived: 0, estimated: 0, assumed: 0 };
  const needs: string[] = [];
  let worst = 0;
  for (const l of lines) {
    const c = l.overridden ? 'measured' : l.confidence;
    counts[c] += 1;
    worst = Math.max(worst, order.indexOf(c));
    if ((c === 'estimated' || c === 'assumed') && !needs.includes(l.item)) needs.push(l.item);
  }
  return {
    tier: order[worst] ?? 'derived',
    counts,
    needsVerification: needs,
    preliminary: counts.estimated > 0 || counts.assumed > 0,
  };
}

export function bomSubtotal(lines: BomLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.qty * l.unitPriceInr, 0));
}

/** Grand total incl. the project's persisted margin — the ONE quote total. */
export function bomTotal(lines: BomLine[], project: Project): number {
  const marginPct = project.pricing?.marginPct ?? DEFAULT_MARGIN_PCT;
  const sub = bomSubtotal(lines);
  return Math.round(sub * (1 + marginPct / 100));
}

export function bomToCsv(lines: BomLine[]): string {
  const head = 'Category,Item,Spec,Qty,Unit,Unit Price (INR),Amount (INR),Confidence,Derivation';
  const rows = lines.map((l) =>
    [
      l.category,
      l.item,
      l.spec,
      l.qty,
      l.unit,
      l.unitPriceInr,
      Math.round(l.qty * l.unitPriceInr),
      l.overridden ? 'measured' : l.confidence,
      l.formula,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  const out = [head, ...rows];
  // notes travel WITH the exported quote (plan §F/§F3 gates). 9 columns now.
  const note = (t: string) => `"NOTE","${t}","","","","","","",""`;
  if (lines.some((l) => l.formula.includes(STRUCTURE_DISCLAIMER))) {
    out.push(note(STRUCTURE_DISCLAIMER));
  }
  const conf = bomConfidence(lines);
  if (conf.preliminary) {
    out.push(
      note(`PRELIMINARY — site verification required for: ${conf.needsVerification.join('; ')}`),
    );
  }
  return out.join('\n');
}
