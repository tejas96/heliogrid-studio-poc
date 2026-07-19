// ─── BOM screen decisions, as pure functions (Phase 22f) ────────────────────
// Same split as lib/structure-view.ts: everything the Step-9 components DECIDE
// lives here and is tested; the components render the result and hold no logic
// of their own. That matters more than usual on this screen, because what it
// decides is money — and a decision buried in JSX is a decision no test reaches.
import type { BomCategory, BomLine, Project } from '../../types';
import { bomMoney, lineMoney, orderQtyOf } from './money';

/** What a NumberField should do with the text currently in the box. */
export type CommitDecision =
  | { action: 'none' }
  | { action: 'clear' }
  | { action: 'commit'; value: number };

/**
 * The commit-on-blur rule, extracted so it can be tested without a DOM.
 *
 * Four cases the naïve `onChange={e => patch(Number(e.target.value))}` gets
 * wrong, each of which reached the project before this existed:
 *   · a half-typed "12" while aiming for "1250" — committed a real 12
 *   · an empty box — committed 0, which is a price, not a cleared field
 *   · "abc" or "1e" — committed NaN, which poisons every downstream total
 *   · re-typing the value already there — committed a no-op undo entry
 */
export function commitNumber(
  draft: string | null,
  current: number | undefined,
  opts: { min?: number; max?: number } = {},
): CommitDecision {
  if (draft === null) return { action: 'none' };
  const t = draft.trim();
  if (t === '') return current === undefined ? { action: 'none' } : { action: 'clear' };

  const n = Number(t);
  if (!Number.isFinite(n)) return { action: 'none' };

  const clamped = Math.min(opts.max ?? Infinity, Math.max(opts.min ?? -Infinity, n));
  return clamped === current ? { action: 'none' } : { action: 'commit', value: clamped };
}

export interface RowState {
  included: boolean;
  /** what to actually buy — qty plus its waste allowance */
  orderQty: number;
  base: number;
  gst: number;
  total: number;
  /** fields carrying a user override, for the ↻ affordance */
  overridden: string[];
  /** overridden fields whose derived value has since moved */
  stale: string[];
  /** dimmed rather than hidden: an excluded line is still information */
  dimmed: boolean;
  /** a user's own figure is 'measured' whatever the engine originally said */
  confidence: BomLine['confidence'];
  removable: boolean;
}

export function rowState(line: BomLine, marginPct: number): RowState {
  const money = lineMoney(line, marginPct);
  const included = line.included ?? true;
  return {
    included,
    orderQty: orderQtyOf(line),
    base: money.base,
    gst: money.gst,
    total: money.total,
    overridden: line.overriddenFields ?? [],
    stale: line.staleFields ?? [],
    dimmed: !included,
    confidence: line.overridden ? 'measured' : line.confidence,
    removable: !line.auto,
  };
}

export interface SectionState {
  category: BomCategory;
  lines: BomLine[];
  includedCount: number;
  total: number;
  /** line keys carrying any override — the "Refresh from design" target */
  editedKeys: string[];
  staleLines: BomLine[];
  staleFieldCount: number;
  showInputs: boolean;
}

/** Only Electrical BOS has survey inputs today; the rest render no input card. */
export function sectionHasInputs(category: BomCategory): boolean {
  return category === 'Electrical BOS';
}

export function sectionState(
  category: BomCategory,
  lines: BomLine[],
  project: Project,
): SectionState {
  const staleLines = lines.filter((l) => (l.staleFields?.length ?? 0) > 0);
  return {
    category,
    lines,
    includedCount: lines.filter((l) => l.included ?? true).length,
    total: bomMoney(lines, project).total,
    editedKeys: lines.filter((l) => (l.overriddenFields?.length ?? 0) > 0).map((l) => l.id),
    staleLines,
    staleFieldCount: staleLines.reduce((s, l) => s + (l.staleFields?.length ?? 0), 0),
    showInputs: sectionHasInputs(category),
  };
}

/**
 * Whether a survey input is currently in USE, or overridden by drawn geometry.
 * Routed cable always wins, so the field is shown disabled with the reason
 * rather than accepting a number it would then quietly ignore.
 */
export function inputIsLive(routed: boolean): { enabled: boolean; reason?: string } {
  return routed
    ? { enabled: false, reason: 'using your routed cable runs' }
    : { enabled: true };
}
