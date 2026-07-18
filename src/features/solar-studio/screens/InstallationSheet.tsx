// ─── Installation mode (Phase 16, §8.9) — read-only work order ──────────────
// Renders the DERIVED plan from lib/installation. Nothing here authors a
// sequence: the order is the structural dependency graph's, so a design change
// re-derives it and the crew's ticks (keyed by structural step id) stay put.
import { Fragment } from 'react';
import { CheckCircle2, Circle, Printer, X } from 'lucide-react';
import type { Project } from '../types';
import { useProjectPatch } from '../store/store';
import {
  PHASE_LABEL,
  installProgress,
  installationPlan,
  type InstallPhase,
} from '../lib/installation';

export function InstallationSheet({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const patch = useProjectPatch();
  const steps = installationPlan(project);
  const state = project.installation?.stepStates;
  const progress = installProgress(steps, state);

  function toggle(id: string) {
    const next = { ...(state ?? {}) };
    if (next[id]) delete next[id];
    else next[id] = true;
    patch({ installation: { stepStates: next } }, true);
  }

  let lastPhase: InstallPhase | null = null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--paper)',
        zIndex: 60,
        overflowY: 'auto',
      }}
      role="dialog"
      aria-label="Installation work order"
    >
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '22px 20px 60px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}
          className="no-print"
        >
          <h2 style={{ margin: 0, flex: 1, fontSize: 19 }}>Installation work order</h2>
          <button className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={15} /> Print
          </button>
          <button className="btn-ghost" onClick={onClose} aria-label="Close work order">
            <X size={18} />
          </button>
        </div>
        <p style={{ color: 'var(--ink-3)', fontSize: 12.5, margin: '0 0 14px' }}>
          {project.info.name} · {project.info.customerName || 'site'} — sequence derived from the
          structural model. Each step is only safe to start once the one above it is complete.
        </p>

        {steps.length === 0 ? (
          <div className="card" style={{ padding: 16, fontSize: 13 }}>
            Nothing to install yet — place modules and string the array first.
          </div>
        ) : (
          <>
            <div
              className="card"
              style={{ padding: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <div
                style={{ flex: 1, height: 8, background: 'var(--paper-2)', borderRadius: 99 }}
                role="progressbar"
                aria-valuenow={progress.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Installation progress"
              >
                <div
                  style={{
                    width: `${progress.pct}%`,
                    height: '100%',
                    background: 'var(--good, #15803d)',
                    borderRadius: 99,
                  }}
                />
              </div>
              <b style={{ fontSize: 12.5 }}>
                {progress.done}/{progress.total} steps
              </b>
            </div>

            {steps.map((s, i) => {
              const showPhase = s.phase !== lastPhase;
              lastPhase = s.phase;
              const done = !!state?.[s.id];
              return (
                <Fragment key={s.id}>
                  {showPhase && (
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: 0.8,
                        color: 'var(--ink-3)',
                        margin: '14px 0 6px',
                      }}
                    >
                      {PHASE_LABEL[s.phase].toUpperCase()}
                    </div>
                  )}
                  <button
                    className="card"
                    onClick={() => toggle(s.id)}
                    aria-pressed={done}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      width: '100%',
                      textAlign: 'left',
                      padding: 11,
                      marginBottom: 8,
                      cursor: 'pointer',
                      opacity: done ? 0.6 : 1,
                    }}
                  >
                    <span aria-hidden style={{ marginTop: 1 }}>
                      {done ? (
                        <CheckCircle2 size={16} color="var(--good, #15803d)" />
                      ) : (
                        <Circle size={16} color="var(--ink-3)" />
                      )}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          fontWeight: 700,
                          textDecoration: done ? 'line-through' : 'none',
                        }}
                      >
                        {i + 1}. {s.title}
                      </span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-2)' }}>
                        {s.detail}
                      </span>
                      {s.materials.length > 0 && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 11,
                            color: 'var(--ink-3)',
                            marginTop: 4,
                          }}
                        >
                          Draw: {s.materials.join(' · ')}
                        </span>
                      )}
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
