// ─── One category block: header, derivation inputs, staleness, rows ─────────
import { RefreshCw } from 'lucide-react';
import { DataTable, SR_ONLY } from '../../components/ui';
import { sectionState } from '../../lib/bom/view';
import type { OverridableField } from '../../lib/bom/merge';
import type { BomCategory, BomLine, Project } from '../../types';
import { BomRow } from './BomRow';
import { SectionInputs } from './SectionInputs';
import { StaleBanner } from './StaleBanner';

// Eleven columns do not fit a laptop viewport. Without a floor the browser
// steals the width from the two flexible columns first, wrapping "AESOLAR
// CMER-132BDS 610" over four lines while the numeric columns sit comfortable.
// A min-width on the table makes the CARD scroll instead — the numbers stay
// aligned and the item stays readable.
const TABLE_MIN_WIDTH = 1000;

const COLUMNS = [
  { key: 'item', label: 'Item', width: 210 },
  { key: 'spec', label: 'Spec', width: 170 },
  { key: 'qty', label: 'Qty', width: 84 },
  { key: 'waste', label: 'Waste', width: 74 },
  { key: 'order', label: 'Order qty', width: 96 },
  { key: 'rate', label: 'Rate ₹', width: 96 },
  { key: 'amount', label: 'Amount ₹', width: 92, align: 'right' as const },
  { key: 'gstpct', label: 'GST', width: 74 },
  { key: 'gst', label: 'GST ₹', width: 84, align: 'right' as const },
  { key: 'total', label: 'Total ₹', width: 96, align: 'right' as const },
  // Named, but only for assistive tech — the column is visually just icons.
  // An empty <th> is announced as an unnamed column, which is how a screen
  // reader user loses track of which cell they are in. Caught by axe-core.
  {
    key: 'actions',
    label: <span style={SR_ONLY}>Actions</span>,
    width: 56,
    align: 'center' as const,
  },
];

export function BomSection({
  category,
  lines,
  project,
  marginPct,
  onEdit,
  onReset,
  onRefreshSection,
  onRemoveCustom,
  onSetInput,
}: {
  category: BomCategory;
  lines: BomLine[];
  project: Project;
  marginPct: number;
  onEdit: (lineKey: string, field: OverridableField, value: unknown) => void;
  onReset: (lineKey: string, field: string) => void;
  onRefreshSection: (lineKeys: string[]) => void;
  onRemoveCustom: (id: string) => void;
  onSetInput: (key: 'avgDcRunM' | 'avgAcRunM', v: number | undefined) => void;
}) {
  const { includedCount, total, editedKeys, staleLines, showInputs } = sectionState(
    category,
    lines,
    project,
  );

  return (
    <section style={{ marginBottom: 18 }} aria-labelledby={`bomsec-${category}`}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
          gap: 10,
        }}
      >
        <h3
          id={`bomsec-${category}`}
          style={{
            margin: 0,
            fontSize: 11.5,
            fontWeight: 800,
            letterSpacing: 0.7,
            color: 'var(--ink-3)',
          }}
        >
          {category.toUpperCase()}
          <span style={{ fontWeight: 600, marginLeft: 8, letterSpacing: 0 }}>
            {includedCount} of {lines.length} included
          </span>
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>
            ₹{total.toLocaleString('en-IN')}
          </span>
          {editedKeys.length > 0 && (
            <button
              className="btn btn-secondary"
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => onRefreshSection(editedKeys)}
              title="Discard edits in this section and take the derived values"
            >
              <RefreshCw size={12} /> Refresh from design
            </button>
          )}
        </div>
      </div>

      {showInputs && (
        <SectionInputs category={category} project={project} onSetInput={onSetInput} />
      )}

      {staleLines.length > 0 && <StaleBanner lines={staleLines} onRefresh={onRefreshSection} />}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <DataTable
          caption={`${category} bill of materials`}
          columns={COLUMNS}
          style={{ minWidth: TABLE_MIN_WIDTH }}
        >
          {lines.map((l) => (
            <BomRow
              key={l.id}
              line={l}
              marginPct={marginPct}
              onEdit={(f, v) => onEdit(l.id, f, v)}
              onReset={(f) => onReset(l.id, f)}
              onRemove={l.auto ? undefined : () => onRemoveCustom(l.id)}
            />
          ))}
        </DataTable>
      </div>
    </section>
  );
}
