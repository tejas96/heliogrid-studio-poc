// ─── previewOp: apply an op WITHOUT dispatching ─────────────────────────────
// Returns the patch, the resulting project with strings/routes already
// re-derived, and the computed impact. The UI dispatches `patch` as one
// undoable step; a gizmo drag or the AI planner calls this per candidate and
// shows the numbers before anything commits.
import type { Project } from '../../types';
import type { DesignOp, OpRefusal } from './types';
import { impactOf, type OpImpact } from './metrics';
import { syncElectrical } from '../derive/electrical-sync';

export type OpPreview =
  | { ok: true; next: Project; patch: Partial<Project>; impact: OpImpact }
  | { ok: false; refusal: OpRefusal };

export function previewOp<A>(p: Project, op: DesignOp<A>, args: A): OpPreview {
  const refusal = op.validate?.(p, args) ?? null;
  if (refusal) return { ok: false, refusal };
  let patch = op.apply(p, args);
  let next: Project = { ...p, ...patch };
  // the derived layers ride in the SAME patch, so undo puts everything back
  const synced = syncElectrical(next);
  if (synced) {
    next = synced.next;
    patch = { ...patch, ...synced.patch };
  }
  return { ok: true, next, patch, impact: impactOf(p, next, op.label(args)) };
}
