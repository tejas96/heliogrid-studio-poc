// ─── The on-object card, as a body any surface can mount ────────────────────
//
// The scene's EntityLabel is title + fact lines + a few actions, drawn through
// drei's <Html>, which only works inside an r3f <Canvas>. So the most
// persuasive sentence in the product — "this tree costs 4,120 kWh/yr, remove
// it" — was reachable only in 3D. This is the same card with the positioning
// left out: the plan editor puts it in an SVG <foreignObject> next to the
// module, the scene can hand it to <Html>. Same look, same numbers.
import type { ReactNode } from 'react';

export interface ObjectCardAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function ObjectCard({
  title,
  lines,
  actions = [],
  onClose,
  children,
}: {
  title: string;
  /** short facts, one per line, e.g. "12 modules · 7.3 kWp · 3×4" */
  lines: string[];
  actions?: ObjectCardAction[];
  onClose?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      data-entity-label
      role="dialog"
      aria-label={title}
      style={{
        minWidth: 200,
        maxWidth: 280,
        background: 'rgba(20,24,30,0.94)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--editor-line, rgba(255,255,255,0.14))',
        borderRadius: 12,
        color: 'var(--editor-ink, #eaf3f1)',
        padding: '10px 12px',
        fontSize: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <b style={{ fontSize: 12.5 }}>{title}</b>
        {onClose && (
          <button
            type="button"
            className="btn-ghost"
            aria-label="Close"
            onClick={onClose}
            style={{ minWidth: 28, minHeight: 28, padding: 0, color: 'var(--editor-ink-2, #9ca3af)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}
          >
            ×
          </button>
        )}
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ color: 'var(--editor-ink-2, #9ca3af)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
          {l}
        </div>
      ))}
      {children}
      {actions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={a.danger ? 'btn btn-danger' : 'btn btn-secondary'}
              style={{ minHeight: 30, padding: '4px 10px', fontSize: 11.5 }}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
