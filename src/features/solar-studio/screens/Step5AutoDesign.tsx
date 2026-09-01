// ─── Step 5 — Auto-design (the phantom step made real) ─────────────────────
// The wizard used to count a step 5 that rendered Step 6 and jumped over
// itself (master plan defect #17). This is that step: the engine proposes a
// layout, explains every decision, and the engineer disposes.
//
// New screen ⇒ design-system tokens only (docs/DESIGN-SYSTEM.md): wrapped in
// `.ds`, Tailwind utilities off tokens, brass fills carry ink, no raw values.
import { useState, type KeyboardEvent } from 'react';
import type { Project } from '../types';
import type { DesignObjective } from '../lib/auto-design';
import { navigate } from '../router';
import { useActiveProject } from '../store/store';
import { useOps } from '../store/useOps';
import { layoutAutoDesign } from '../lib/ops/layout-ops';

/** The slice of an op impact this screen shows (structurally matches lib/ops OpImpact). */
export interface DesignImpactSummary {
  label: string;
  after: { modules: number; kwp: number; strings: number };
}

const OBJECTIVES: { value: DesignObjective; title: string; detail: (p: Project) => string }[] = [
  {
    value: 'target_kwp',
    title: 'Match the target',
    detail: (p) => `Fill the best faces until ${p.components.targetKwp || 0} kWp is reached.`,
  },
  {
    value: 'max_roof',
    title: 'Maximum the roof holds',
    detail: () => 'Fill every usable face after setbacks, obstructions and walkways.',
  },
];

/** The wizard's step 5: runs the auto-design op and shows its decision log. */
export function Step5AutoDesign() {
  const project = useActiveProject();
  const ops = useOps();
  const [last, setLast] = useState<DesignImpactSummary | null>(null);
  if (!project) return null;
  return (
    <Step5Body
      project={project}
      lastImpact={last}
      onDesign={(objective) => {
        const r = ops.run(layoutAutoDesign, { objective });
        if (r.ok) setLast(r.impact);
        else setLast({ label: r.refusal.reason, after: { modules: 0, kwp: 0, strings: 0 } });
      }}
      onManual={() => navigate('/wizard/6')}
    />
  );
}

export function Step5Body({
  project,
  onDesign,
  onManual,
  lastImpact,
}: {
  project: Project;
  onDesign: (objective: DesignObjective) => void;
  onManual: () => void;
  lastImpact: DesignImpactSummary | null;
}) {
  const [objective, setObjective] = useState<DesignObjective>(
    project.components.targetKwp > 0 ? 'target_kwp' : 'max_roof',
  );
  const log = project.designLog ?? [];
  const designed = project.panels.length > 0;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = OBJECTIVES.findIndex((o) => o.value === objective);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setObjective(OBJECTIVES[(i + 1) % OBJECTIVES.length].value);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setObjective(OBJECTIVES[(i - 1 + OBJECTIVES.length) % OBJECTIVES.length].value);
    }
  }

  return (
    <div className="ds mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 text-text">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Auto-design</h1>
        <p className="text-sm text-muted">
          The engine ranks your roof faces by measured sun access × orientation and fills them,
          honouring setbacks, obstructions, walkways and shadow-free row spacing. Every choice is
          explained below, and everything stays editable in the next step.
        </p>
      </header>

      <div
        role="radiogroup"
        aria-label="Design objective"
        className="grid gap-3 sm:grid-cols-2"
        onKeyDown={onKey}
      >
        {OBJECTIVES.map((o) => {
          const active = o.value === objective;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setObjective(o.value)}
              className={
                'flex min-h-11 flex-col items-start gap-1 rounded-md border p-4 text-left ' +
                (active
                  ? 'border-accent-border bg-accent-subtle'
                  : 'border-border bg-surface-raised hover:border-border-strong')
              }
            >
              <span className="text-sm font-semibold">{o.title}</span>
              <span className="text-xs text-muted">{o.detail(project)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onDesign(objective)}
          className="min-h-11 rounded-md bg-accent px-5 text-sm font-semibold text-on-accent hover:bg-accent-hover"
        >
          {designed ? 'Design it again' : 'Design it'}
        </button>
        <button
          type="button"
          onClick={onManual}
          className="min-h-11 rounded-md border border-border bg-surface-raised px-5 text-sm font-semibold hover:border-border-strong"
        >
          Place manually
        </button>
      </div>

      {lastImpact && (
        <p role="status" className="rounded-md bg-success-subtle px-4 py-3 text-sm">
          {lastImpact.label}: {lastImpact.after.modules} modules · {lastImpact.after.kwp} kWp ·{' '}
          {lastImpact.after.strings} strings
        </p>
      )}

      {log.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Why this layout">
          <h2 className="text-lg font-semibold">Why this layout?</h2>
          <ol className="flex flex-col gap-2">
            {log.map((d) => (
              <li key={d.id} className="rounded-md border border-border bg-surface-raised p-4">
                <div className="text-sm font-semibold">
                  {d.topic}
                  {d.choice ? ` — ${d.choice}` : ''}
                </div>
                {d.reason && <p className="mt-1 text-xs text-muted">{d.reason}</p>}
                {d.inputs.length > 0 && (
                  <p className="mt-1 font-mono text-2xs text-subtle">{d.inputs.join(' · ')}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
