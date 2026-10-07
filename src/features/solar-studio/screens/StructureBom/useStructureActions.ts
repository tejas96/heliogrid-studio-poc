// ─── Every Structure & BOM edit, through the ops kernel ─────────────────────
// One place turns a click into an op over EVERY selected table: one patch, one
// undo entry with a real label, strings and routes re-derived in the same
// patch. `runMany`, never a loop over `run` — see lib/ops/run previewMany for
// why a loop silently changes only the last table.
import type { ArraySegment } from '../../types';
import type { StructChoice } from '../../lib/structure-edit';
import type { MmsConfig, MmsEngineeringInputs, MountStrategy } from '../../lib/mms/types';
import type { MmsActions } from '../../components/mms/MmsConfiguration';
import { useOps } from '../../store/useOps';
import {
  projectSetMmsEngineering,
  segmentChoice,
  segmentClearMms,
  segmentConfigureMms,
  segmentSetLegPlan,
  segmentSetStructureFields,
} from '../../lib/ops/layout-ops';

export type Report = (message: string, tone: 'ok' | 'info') => void;

export function useStructureActions(segIds: string[], report: Report) {
  const ops = useOps();
  const n = segIds.length;
  const scoped = (verb: string) => (n > 1 ? `${verb} · ${n} tables` : verb);

  /** Say what landed and what did not — never quietly do less than asked. */
  function settle(r: ReturnType<typeof ops.runMany>, verb: string) {
    if (!r) return;
    if (!r.ok) {
      report(r.refusals[0]?.reason ?? 'Nothing to change', 'info');
      return;
    }
    if (r.refusals.length > 0) {
      report(`${verb}: ${r.applied} of ${n} tables — ${r.refusals[0].reason}`, 'info');
      return;
    }
    report(r.impact.label, 'ok');
  }

  const choice = (c: StructChoice, verb: string) =>
    settle(
      ops.runMany(segmentChoice, segIds.map((segmentId) => ({ segmentId, choice: c })), { label: scoped(verb) }),
      verb,
    );

  /**
   * A RELATIVE step (clearance +0.3 m, one more purlin) is computed per table
   * from ITS value — applying the first table's answer to all of them would
   * silently flatten a mixed selection into one number. `null` skips a table.
   */
  const choiceEach = (of: (segId: string) => StructChoice | null, verb: string) => {
    const argsList = segIds.flatMap((segmentId) => {
      const c = of(segmentId);
      return c ? [{ segmentId, choice: c }] : [];
    });
    if (argsList.length === 0) {
      report('Nothing to change', 'info');
      return;
    }
    settle(ops.runMany(segmentChoice, argsList, { label: scoped(verb) }), verb);
  };

  const configure = (strategy?: MountStrategy, edit?: Partial<MmsConfig>) => {
    const verb = strategy ? 'Mounting system' : 'Mounting system settings';
    settle(
      ops.runMany(segmentConfigureMms, segIds.map((segmentId) => ({ segmentId, strategy, edit })), {
        label: scoped(verb),
      }),
      verb,
    );
  };

  const mms: MmsActions = {
    configure,
    clear: () =>
      settle(
        ops.runMany(segmentClearMms, segIds.map((segmentId) => ({ segmentId })), {
          label: scoped('Remove mounting system'),
        }),
        'Remove mounting system',
      ),
    choice: (c) => choice(c, 'Mounting system'),
    setLegSpacing: (m) =>
      settle(
        ops.runMany(
          segmentSetStructureFields,
          segIds.map((segmentId) => ({ segmentId, fields: { legSpacingM: m } })),
          { label: scoped(`Leg spacing ${m.toFixed(2)} m`) },
        ),
        'Leg spacing',
      ),
    setEngineering: (inputs: MmsEngineeringInputs) => {
      const r = ops.run(projectSetMmsEngineering, { inputs });
      if (!r.ok) report(r.refusal.reason, 'info');
    },
  };

  /** A leg plan is one table's geometry, so it is never applied to a selection. */
  const setLegPlan = (segmentId: string, legPlan: ArraySegment['legPlan'], label: string) => {
    const r = ops.run(segmentSetLegPlan, { segmentId, legPlan, label });
    report(r.ok ? label : r.refusal.reason, r.ok ? 'ok' : 'info');
  };

  return { choice, choiceEach, mms, setLegPlan };
}
