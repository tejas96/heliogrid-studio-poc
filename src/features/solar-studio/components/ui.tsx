// ─── Shared UI primitives: sheets, dialogs, sliders, toggles, chips ─────────
import { useEffect, type ReactNode } from 'react';
import { X, Check } from 'lucide-react';

function useEscape(onClose?: () => void) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

export function Sheet({
  title,
  icon,
  onClose,
  children,
  right,
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  right?: ReactNode;
}) {
  useEscape(onClose);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h3>
            {icon}
            {title}
          </h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {right}
            <button className="btn-ghost" onClick={onClose} aria-label="Close">
              <X size={17} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}

export function Dialog({
  title,
  icon,
  children,
  actions,
  onClose,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  actions: ReactNode;
  onClose?: () => void;
}) {
  useEscape(onClose);
  return (
    <div className="dialog-backdrop" onClick={onClose} aria-hidden={false}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>
          {icon}
          {title}
        </h3>
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  );
}

export function SliderRow({
  value,
  min,
  max,
  step = 0.1,
  unit,
  onChange,
  hint,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
  hint?: string;
  label?: string;
  /** display-only conversion; value/min/max/step stay in stored units */
  format?: (v: number) => string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div style={{ marginBottom: 14 }}>
      {label && (
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      )}
      <div className="slider-row">
        <button
          className="step-btn"
          aria-label={`Decrease ${label ?? 'value'}`}
          onClick={() => onChange(clamp(+(value - step).toFixed(3)))}
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button
          className="step-btn"
          aria-label={`Increase ${label ?? 'value'}`}
          onClick={() => onChange(clamp(+(value + step).toFixed(3)))}
        >
          +
        </button>
        <span className="val">
          {format ? format(value) : value}
          <small style={{ fontWeight: 500, color: 'var(--ink-3)' }}> {unit}</small>
        </span>
      </div>
      {hint && (
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.45 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      aria-label={label}
    />
  );
}

export function ToggleRow({
  label,
  sub,
  on,
  onChange,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{sub}</div>
        )}
      </div>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? 'on' : ''}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function OptionCard({
  title,
  sub,
  selected,
  disabled,
  badge,
  icon,
  onClick,
}: {
  title: string;
  sub: string;
  selected?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      aria-pressed={selected}
      aria-disabled={disabled}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        width: '100%',
        textAlign: 'left',
        padding: '13px 14px',
        borderRadius: 12,
        border: `1.5px solid ${selected ? 'var(--info)' : 'var(--line)'}`,
        background: selected ? 'var(--info-bg)' : 'var(--paper)',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        marginBottom: 10,
        transition: 'border-color var(--t-fast), background var(--t-fast)',
      }}
    >
      {icon && (
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            background: selected ? '#dbe7fd' : 'var(--paper-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: selected ? 'var(--info)' : 'var(--ink-2)',
            flex: 'none',
          }}
        >
          {icon}
        </span>
      )}
      <span style={{ flex: 1 }}>
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: selected ? 'var(--info)' : 'var(--ink)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {title} {selected && <Check size={14} />} {badge}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.4 }}>
          {sub}
        </span>
      </span>
    </button>
  );
}

export function UnitToggle({
  unit,
  onChange,
}: {
  unit: 'm' | 'ft';
  onChange: (u: 'm' | 'ft') => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }} role="radiogroup" aria-label="Units">
      {(['m', 'ft'] as const).map((u) => (
        <button
          key={u}
          className="chip"
          role="radio"
          aria-checked={unit === u}
          style={
            unit === u
              ? { background: 'var(--info)', color: '#fff', borderColor: 'var(--info)' }
              : undefined
          }
          onClick={() => onChange(u)}
        >
          {u}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 40,
        color: 'var(--ink-3)',
        fontSize: 13,
      }}
    >
      <span style={{ opacity: 0.7 }}>{icon}</span>
      {text}
    </div>
  );
}
