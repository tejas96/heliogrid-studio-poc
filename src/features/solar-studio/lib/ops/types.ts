// ─── Design operations: the ONLY way the design is mutated ──────────────────
// A screen, a 3D gizmo and the AI planner all express a change as an op. The
// op is pure — it returns the patch — and the kernel (lib/ops/run) applies it,
// re-derives strings/routes, and computes the engineering impact BEFORE the
// store ever sees it. That is what makes "what changed → why → impact →
// apply/undo" a single mechanism instead of a per-screen habit.
import type { Project } from '../../types';

/** The fingerprint layer an op invalidates (documentation + future gating). */
export type OpLayer = 'geometry' | 'layout' | 'electrical' | 'design';

export interface OpRefusal {
  reason: string;
}

export interface DesignOp<A> {
  /** stable id, e.g. 'segment.setTilt' — the AI planner calls ops by id */
  id: string;
  layer: OpLayer;
  /** a short sentence for the undo history and the impact toast */
  label: (args: A) => string;
  /** null = may proceed; a refusal is shown to the user and nothing is applied */
  validate?: (p: Project, args: A) => OpRefusal | null;
  /** the patch, nothing else — no derived data, no side effects */
  apply: (p: Project, args: A) => Partial<Project>;
}

export function defineOp<A>(op: DesignOp<A>): DesignOp<A> {
  return op;
}
