// ─── On-object label: what this is, its two numbers, and its quick actions ──
// Every pickable thing in the scene answers a click with the same small card
// anchored to the object (DESIGN-SYSTEM §12: provenance quiet, numbers
// tabular, actions few). Rendered through drei <Html> so it stays a real DOM
// control — keyboard-reachable, screen-reader-readable, 44 px targets.
import type { ReactNode } from 'react';
import { Html } from '@react-three/drei';

export interface LabelAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export function EntityLabel({
  position,
  title,
  lines,
  actions = [],
  onClose,
  children,
}: {
  position: [number, number, number];
  title: string;
  /** short facts, one per line, e.g. "2.4 × 1.2 m · 1.8 m tall" */
  lines: string[];
  actions?: LabelAction[];
  onClose?: () => void;
  children?: ReactNode;
}) {
  return (
    <Html position={position} center zIndexRange={[40, 10]} style={{ pointerEvents: 'auto' }}>
      <div
        data-entity-label
        role="dialog"
        aria-label={title}
        style={{
          minWidth: 180,
          maxWidth: 260,
          background: 'rgba(20,24,30,0.94)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--editor-line)',
          borderRadius: 12,
          color: 'var(--editor-ink)',
          padding: '10px 12px',
          fontSize: 12,
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          transform: 'translateY(-12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <b style={{ fontSize: 12.5 }}>{title}</b>
          {onClose && (
            <button
              className="btn-ghost"
              aria-label="Close"
              onClick={onClose}
              style={{ minWidth: 28, minHeight: 28, padding: 0, color: 'var(--editor-ink-2)' }}
            >
              ×
            </button>
          )}
        </div>
        {lines.map((l, i) => (
          <div
            key={i}
            style={{ color: 'var(--editor-ink-2)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}
          >
            {l}
          </div>
        ))}
        {children}
        {actions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
            {actions.map((a) => (
              <button
                key={a.label}
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
    </Html>
  );
}
