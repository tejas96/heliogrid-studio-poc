// ─── Insight substrate types (§8 — one substrate, many features) ────────────
// The Copilot tray, Design Health Score, Maintenance Readiness and
// Construction Feasibility are all the SAME architectural object: pure,
// deterministic ANALYZERS running over the project and emitting typed
// Insights. One registry, one tray, one persistence field — analyzers ship in
// later phases (6/7/9/10/15); Phase 2 lands only this substrate.
import type { Project } from '../../types';

export type InsightSeverity = 'info' | 'suggestion' | 'warning' | 'critical';

export type InsightCategory =
  | 'energy'
  | 'electrical'
  | 'utilization'
  | 'structure'
  | 'commercial'
  | 'maintenance'
  | 'constructability'
  | 'data-quality';

export interface Insight {
  /**
   * Stable dedupe/persistence key: `<analyzerId>:<subject>` — the SAME finding
   * must produce the SAME key across recomputes, or accepted/ignored state
   * would not stick to it.
   */
  key: string;
  analyzerId: string;
  category: InsightCategory;
  severity: InsightSeverity;
  /** 0..1 — how much acting on this changes the design outcome */
  impact: number;
  /** 0..1 — input quality (measured=1 … assumed≈0.3); honest-labeling rule */
  confidence: number;
  title: string;
  /** plain-language explanation that CITES the datum that triggered it */
  detail: string;
  /** the project data the detail cites, as human-readable strings */
  evidence: string[];
  /** click-to-locate targets (panel/roof/obstruction/string ids) */
  focusIds?: string[];
  /** one-click remedy descriptor — wired by the tray in later phases */
  action?: { label: string };
}

/** A pure, deterministic rule running over the project. MUST NOT mutate it. */
export interface InsightAnalyzer {
  id: string;
  title: string;
  analyze(project: Project): Insight[];
}
