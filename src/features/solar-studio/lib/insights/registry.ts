// ─── Insight analyzer registry + memoized computation ───────────────────────
import type { Project } from '../../types';
import { designFp } from '../fingerprints';
import type { Insight, InsightAnalyzer, InsightSeverity } from './types';

const analyzers = new Map<string, InsightAnalyzer>();

export function registerAnalyzer(a: InsightAnalyzer): void {
  if (analyzers.has(a.id)) throw new Error(`insight analyzer '${a.id}' already registered`);
  analyzers.set(a.id, a);
}

export function listAnalyzers(): InsightAnalyzer[] {
  return [...analyzers.values()];
}

/** Test helper — the production registry is append-only at module init. */
export function clearAnalyzers(): void {
  analyzers.clear();
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 3,
  warning: 2,
  suggestion: 1,
  info: 0,
};

/**
 * Run every registered analyzer over the project. Deterministic given the
 * same project + registry. Per-analyzer isolation: one throwing analyzer is
 * skipped (logged), it cannot take the tray down. Duplicated keys keep the
 * higher-severity occurrence. Insights the user chose to ignore are filtered
 * (their state lives in `project.insightState`); accepted ones pass through
 * so the tray can render them as acknowledged.
 */
export function computeInsights(
  project: Project,
  opts: { includeIgnored?: boolean } = {},
): Insight[] {
  const byKey = new Map<string, Insight>();
  for (const a of analyzers.values()) {
    let found: Insight[];
    try {
      found = a.analyze(project);
    } catch (err) {
      console.warn(`insight analyzer '${a.id}' failed — skipped`, err);
      continue;
    }
    for (const ins of found) {
      const existing = byKey.get(ins.key);
      if (!existing || SEVERITY_RANK[ins.severity] > SEVERITY_RANK[existing.severity]) {
        byKey.set(ins.key, ins);
      }
    }
  }
  return [...byKey.values()]
    .filter((i) => opts.includeIgnored || project.insightState[i.key] !== 'ignored')
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.impact * b.confidence - a.impact * a.confidence ||
        a.key.localeCompare(b.key),
    );
}

// ─── Memoized selector (keyed on the fingerprint graph) ─────────────────────

let memoKey: string | null = null;
let memoValue: Insight[] = [];

/**
 * computeInsights with last-value memoization keyed on designFp + the user's
 * accept/ignore state + registry composition. Screens can call this on every
 * render — identical design state returns the identical array instance.
 */
export function memoizedInsights(project: Project): Insight[] {
  const key =
    designFp(project) +
    '§' +
    JSON.stringify(project.insightState) +
    '§' +
    [...analyzers.keys()].join(',');
  if (key !== memoKey) {
    memoKey = key;
    memoValue = computeInsights(project);
  }
  return memoValue;
}

/** Test helper — drop the memo between cases. */
export function resetInsightMemo(): void {
  memoKey = null;
  memoValue = [];
}
