// ─── One BOM line ───────────────────────────────────────────────────────────
// The columns run left to right in the order a buyer reasons about them:
//   what it is → how much the design needs → how much to BUY → what it costs
//   → what it sells for → what the tax is → the line total
// QTY and ORDER QTY are deliberately both present. They are different numbers
// (waste sits between them) and a quote that shows only one of them either
// hides the allowance or misstates the design.
import { Info, RotateCcw } from 'lucide-react';
import { NumberField, TextField } from '../../components/ui';
import { rowState } from '../../lib/bom/view';
import type { OverridableField } from '../../lib/bom/merge';
import type { BomLine } from '../../types';

const inr = (v: number) => Math.round(v).toLocaleString('en-IN');

const CONFIDENCE = {
  measured: { color: '#16a34a', label: 'Measured — a direct count of placed objects' },
  derived: { color: '#0ea5e9', label: 'Derived — computed from the design geometry' },
  estimated: {
    color: '#eab308',
    label: 'Estimated — labelled fallback; refine by completing the design',
  },
  assumed: {
    color: '#f97316',
    label:
      'Assumed — depends on a fact the model does not hold (soil resistivity, LPS class, meter position); engineer to confirm',
  },
} as const;

export function BomRow({
  line,
  marginPct,
  onEdit,
  onReset,
  onRemove,
}: {
  line: BomLine;
  marginPct: number;
  onEdit: (field: OverridableField, value: unknown) => void;
  onReset: (field: string) => void;
  onRemove?: () => void;
}) {
  // every decision comes from lib/bom/view — this file only renders
  const { included, orderQty, base, gst, total, overridden, stale, dimmed, confidence } = rowState(
    line,
    marginPct,
  );
  const conf = CONFIDENCE[confidence];

  // An excluded line is dimmed, NOT removed: the reader still needs to see that
  // the scope was considered and deliberately left to someone else.
  const rowStyle: React.CSSProperties = {
    borderTop: '1px solid var(--paper-3)',
    opacity: dimmed ? 0.45 : 1,
  };

  // Bound wrapper around the module-level Editable. It must NOT be declared as
  // a component inside this function: a nested component is a new type on every
  // render, so React unmounts and remounts its subtree instead of updating it —
  // which would throw away a NumberField's half-typed draft the moment anything
  // re-rendered the row. Passing props to a stable component avoids that.
  const cell = (field: OverridableField, children: React.ReactNode) => (
    <Editable
      field={field}
      itemLabel={line.item}
      overridden={overridden}
      stale={stale}
      onReset={onReset}
    >
      {children}
    </Editable>
  );

  return (
    <tr style={rowStyle}>
      <td style={td}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          {/* Re-ticking the box writes a NEW override that merely equals the
              derived value, so the line reads as hand-edited forever and stops
              tracking the design. Only the ↻ actually detaches it. */}
          {cell(
            'included',
            <input
              type="checkbox"
              checked={included}
              onChange={(e) => onEdit('included', e.target.checked)}
              aria-label={`Include ${line.item} in the quote`}
            />,
          )}
          <span
            aria-hidden
            title={conf.label}
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              flex: '0 0 auto',
              background: conf.color,
            }}
          />
          <span>
            {cell(
              'item',
              <>
                {/* A DERIVED line's name comes from the design and is not typed
                    over; a CUSTOM line has no derivation, so its name is the
                    only thing identifying it and must stay editable. The
                    rebuild rendered both as static text, which silently removed
                    the ability to rename a line you added yourself. */}
                {line.auto ? (
                  <b style={{ fontWeight: 650 }}>{line.item}</b>
                ) : (
                  <TextField
                    value={line.item}
                    ariaLabel={`Name of ${line.item}`}
                    onCommit={(v) => onEdit('item', v)}
                    style={{ fontWeight: 650 }}
                  />
                )}
                {/* the dot above is decorative; THIS is what a screen reader gets */}
                <span style={SR}>{`. ${conf.label}.`}</span>
                {!included && <span style={SR}> Excluded from the quote.</span>}
                {line.brand && (
                  <span style={{ color: 'var(--ink-3)', fontSize: 11 }}> · {line.brand}</span>
                )}
              </>,
            )}
          </span>
        </span>
      </td>

      <td style={{ ...td, color: 'var(--ink-3)', fontSize: 11.5 }}>{line.spec}</td>

      <td style={td}>
        {cell(
          'qty',
          <NumberField
            value={line.qty}
            min={0}
            ariaLabel={`Quantity of ${line.item}`}
            onCommit={(v) => onEdit('qty', v ?? 0)}
            style={{ width: 62 }}
          />,
        )}
      </td>

      <td style={td}>
        {cell(
          'wastePct',
          <NumberField
            value={line.wastePct ?? 0}
            min={0}
            max={100}
            suffix="%"
            ariaLabel={`Waste allowance for ${line.item}, percent`}
            onCommit={(v) => onEdit('wastePct', v ?? 0)}
            style={{ width: 48 }}
          />,
        )}
      </td>

      {/* Not editable: it is qty and waste, and letting it be typed would make
          three fields where two of them already determine the third. */}
      <td style={{ ...td, fontWeight: 650 }}>
        {orderQty} <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{line.unit}</span>
      </td>

      <td style={td}>
        {cell(
          'unitPriceInr',
          <NumberField
            value={line.unitPriceInr}
            min={0}
            ariaLabel={`Unit rate of ${line.item} in rupees`}
            onCommit={(v) => onEdit('unitPriceInr', v ?? 0)}
            style={{ width: 78 }}
          />,
        )}
      </td>

      <td style={{ ...td, textAlign: 'right' }}>{inr(base)}</td>

      <td style={td}>
        {cell(
          'gstPct',
          <NumberField
            value={line.gstPct ?? 0}
            min={0}
            max={40}
            suffix="%"
            ariaLabel={`GST rate for ${line.item}, percent`}
            onCommit={(v) => onEdit('gstPct', v ?? 0)}
            style={{ width: 48 }}
          />,
        )}
      </td>

      <td style={{ ...td, textAlign: 'right', color: 'var(--ink-3)' }}>{inr(gst)}</td>

      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{inr(total)}</td>

      <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>
        {/* The derivation used to be a hover-only `data-tip`, which is invisible
            to assistive tech — the entire traceability story was sighted-mouse
            only. It is now a real button with the formula as its accessible
            name, so it is reachable by keyboard and readable by AT. */}
        <button
          title={`Derivation: ${line.formula}`}
          aria-label={`Derivation of ${line.item}: ${line.formula}`}
          style={{ color: 'var(--info)', display: 'inline-flex', verticalAlign: 'middle' }}
        >
          <Info size={14} aria-hidden />
        </button>
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label={`Remove ${line.item}`}
            title="Remove line"
            style={{ color: 'var(--bad)', display: 'inline-flex', marginLeft: 6, verticalAlign: 'middle' }}
          >
            ×
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * An editable cell: its control AND its ↻, always together.
 *
 * They are one component rather than two hand-placed siblings because the first
 * version placed them separately and `included` silently got a checkbox with no
 * reset — so a user could untick a line and never get it tracking the design
 * again. Pairing them structurally means adding a new editable field cannot
 * reintroduce that.
 *
 * Declared at module level so its identity is stable across renders (see the
 * `cell` helper above for why that matters).
 */
function Editable({
  field,
  itemLabel,
  overridden,
  stale,
  onReset,
  children,
}: {
  field: OverridableField;
  itemLabel: string;
  overridden: string[];
  stale: string[];
  onReset: (field: string) => void;
  children: React.ReactNode;
}) {
  const isStale = stale.includes(field);
  return (
    <>
      {children}
      {overridden.includes(field) && (
        <button
          onClick={() => onReset(field)}
          aria-label={`Reset ${field} of ${itemLabel} to the derived value`}
          title={
            isStale ? 'Your value no longer matches the design — reset to auto' : 'Reset to auto'
          }
          style={{
            display: 'inline-flex',
            marginLeft: 3,
            verticalAlign: 'middle',
            color: isStale ? 'var(--warn)' : 'var(--ink-3)',
          }}
        >
          <RotateCcw size={11} />
        </button>
      )}
    </>
  );
}

const td: React.CSSProperties = { padding: '7px 10px', verticalAlign: 'middle' };
const SR: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
};
