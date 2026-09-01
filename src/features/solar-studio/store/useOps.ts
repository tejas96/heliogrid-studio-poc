// ─── useOps: run or preview a design op against the active project ──────────
import { useCallback } from 'react';
import { useActiveProject, useStore } from './store';
import type { DesignOp } from '../lib/ops/types';
import { previewOp, type OpPreview } from '../lib/ops/run';

export function useOps() {
  const { dispatch } = useStore();
  const project = useActiveProject();

  const preview = useCallback(
    <A,>(op: DesignOp<A>, args: A): OpPreview => {
      if (!project) return { ok: false, refusal: { reason: 'No open project' } };
      return previewOp(project, op, args);
    },
    [project],
  );

  /** Apply an op as ONE undoable patch (label = the op's sentence). */
  const run = useCallback(
    <A,>(op: DesignOp<A>, args: A, o: { undoable?: boolean } = {}): OpPreview => {
      const r = preview(op, args);
      if (r.ok) {
        dispatch({
          type: 'update-project',
          patch: r.patch,
          undoable: o.undoable ?? true,
          label: r.impact.label,
        });
      }
      return r;
    },
    [preview, dispatch],
  );

  return { run, preview };
}
