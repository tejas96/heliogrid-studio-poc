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

export interface OpBatchPreview {
  /** true when at least one item applied */
  ok: boolean;
  next: Project;
  patch: Partial<Project>;
  impact: OpImpact;
  applied: number;
  /** the items that were refused, by their index in `argsList` */
  refusals: { index: number; reason: string }[];
}

/**
 * The SAME op over many targets, as ONE patch and ONE undo entry.
 *
 * Why this exists rather than a loop over `previewOp`. Every segment op returns
 * a WHOLE rebuilt `segments` array, and each `previewOp` computes it from the
 * project it is handed. A caller looping `ops.run(...)` inside one event handler
 * hands it the SAME project every time — the render closure's value does not
 * change mid-handler — so each patch rebuilds `segments` from the ORIGINAL
 * array, the store's shallow merge keeps only the last, and "set these twelve
 * tables to 12°" changes exactly one table. Silently, and with twelve entries
 * eaten out of a 24-deep undo stack.
 *
 * Here each step starts from the previous step's `next`, so every patch already
 * carries all the earlier changes and the shallow merge is provably right: the
 * newest value for a key is also the most complete one.
 *
 * PARTIAL REFUSAL IS NORMAL, not an edge case — `segmentSetRacking` refuses a
 * tracker on a roof, `segmentRespace` refuses when there is no room. So the
 * refusals are returned rather than swallowed, and the caller can say
 * "Respaced 9 of 12 · 3 had no room" instead of quietly doing less than asked.
 */
export function previewMany<A>(
  p: Project,
  op: DesignOp<A>,
  argsList: A[],
  label?: string,
): OpBatchPreview {
  let next = p;
  let patch: Partial<Project> = {};
  const refusals: { index: number; reason: string }[] = [];
  let applied = 0;

  argsList.forEach((args, index) => {
    const r = previewOp(next, op, args);
    if (!r.ok) {
      refusals.push({ index, reason: r.refusal.reason });
      return;
    }
    next = r.next;
    patch = { ...patch, ...r.patch };
    applied += 1;
  });

  const sentence =
    label ??
    (argsList.length === 1
      ? op.label(argsList[0])
      : `${op.label(argsList[0])} · ${applied} tables`);
  return { ok: applied > 0, next, patch, impact: impactOf(p, next, sentence), applied, refusals };
}
