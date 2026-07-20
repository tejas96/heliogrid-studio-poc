// ─── Shared UI primitives: sheets, dialogs, sliders, toggles, chips ─────────
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { X, Check } from 'lucide-react';
import { commitNumber } from '../lib/bom/view';

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

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Focus trap + restore for a modal surface (Phase 22p).
 *
 * `aria-modal="true"` is a PROMISE to assistive tech that the rest of the page
 * is inert. Both surfaces made that promise and neither kept it: Tab walked
 * straight out of the dialog into the page behind it, and on close focus was
 * dumped on <body>, so a keyboard user lost their place entirely and a screen
 * reader started reading from the top.
 *
 * Restoring focus to whatever opened the dialog is the half people forget, and
 * it is the half that matters most — it is what makes closing a dialog feel
 * like returning rather than being teleported.
 */
function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    // move focus IN, preferring the first control over the container itself
    const first = root?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root)?.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      // wrap at the ends rather than letting Tab escape the modal
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // put the user back where they were, not on <body>
      previous?.focus?.();
    };
  }, [active]);
  return ref;
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
  const trapRef = useFocusTrap(true);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div ref={trapRef} className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
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
  const trapRef = useFocusTrap(true);
  return (
    <div className="dialog-backdrop" onClick={onClose} aria-hidden={false}>
      <div
        ref={trapRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
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

/**
 * A number input that commits ONCE, on blur or Enter.
 *
 * The BOM inputs it replaces called `patchProject` on every keystroke, so
 * typing "1250" wrote four separate project revisions — four re-derivations of
 * the whole BOM, and four entries in the undo stack, three of which represent
 * numbers the user never meant (1, 12, 125). Undo became unusable exactly where
 * it matters most, on the screen that decides money.
 *
 * While focused the field owns its own text, so a half-typed value is never
 * parsed and never round-trips through the store. `Escape` abandons the edit.
 */
export function NumberField({
  value,
  onCommit,
  min,
  max,
  step,
  suffix,
  placeholder,
  ariaLabel,
  style,
  disabled,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  ariaLabel: string;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(value));

  const commit = () => {
    // the rule lives in lib/bom/view so it is testable without a DOM
    const d = commitNumber(draft, value, { min, max });
    if (d.action === 'clear') onCommit(undefined);
    else if (d.action === 'commit') onCommit(d.value);
    setDraft(null);
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <input
        type="number"
        inputMode="decimal"
        value={shown}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur(); // blur commits; doing both would double-write
          } else if (e.key === 'Escape') {
            setDraft(null);
          }
        }}
        style={{
          width: 68,
          padding: '4px 6px',
          border: '1px solid var(--line)',
          borderRadius: 6,
          background: 'var(--paper)',
          fontSize: 12.5,
          ...style,
        }}
      />
      {suffix && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{suffix}</span>}
    </span>
  );
}

/**
 * The text counterpart of NumberField: commits once, on blur or Enter.
 *
 * Same reason. A plain `onChange={e => patch(e.target.value)}` on a line name
 * writes one project revision — and one undo entry — per character, so undoing
 * a rename means pressing undo once for every letter typed.
 */
export function TextField({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  style,
}: {
  value: string;
  onCommit: (v: string) => void;
  ariaLabel: string;
  placeholder?: string;
  style?: CSSProperties;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      value={draft ?? value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur(); // blur commits; doing both would double-write
        } else if (e.key === 'Escape') {
          setDraft(null);
        }
      }}
      style={{
        width: '100%',
        padding: '3px 5px',
        border: '1px solid var(--line)',
        borderRadius: 6,
        background: 'var(--paper)',
        fontSize: 12.5,
        ...style,
      }}
    />
  );
}

/**
 * A table that is accessible by construction, so callers cannot forget.
 *
 * Every data table needs a caption naming it and a scope on each header, or a
 * screen reader reads a wall of numbers with nothing to attach them to. Making
 * `caption` a required prop is the point of the wrapper — the old BOM table had
 * neither, and adding them to one hand-rolled `<table>` would not stop the next.
 * `captionVisible` is false by default: sighted users get the section heading
 * already, so repeating it would be visual noise, but AT still needs it.
 */
export function DataTable({
  caption,
  captionVisible = false,
  columns,
  children,
  style,
}: {
  caption: string;
  captionVisible?: boolean;
  columns: { key: string; label: ReactNode; width?: number; align?: 'left' | 'right' | 'center' }[];
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, ...style }}>
      <caption
        style={
          captionVisible
            ? { textAlign: 'left', padding: '8px 10px', fontWeight: 700, fontSize: 12 }
            : SR_ONLY
        }
      >
        {caption}
      </caption>
      <thead>
        <tr style={{ background: 'var(--paper-2)', fontSize: 11 }}>
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              style={{
                textAlign: c.align ?? 'left',
                padding: '8px 10px',
                fontWeight: 700,
                ...(c.width ? { width: c.width } : {}),
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

/** Visually hidden but reachable by assistive tech — never `display: none`. */
export const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

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
