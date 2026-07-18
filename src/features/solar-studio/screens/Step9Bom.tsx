import { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Info,
  Plus,
  ReceiptText,
  RefreshCw,
  X,
} from 'lucide-react';
import { useActiveProject, useProjectPatch } from '../store/store';
import { mergedBom, bomConfidence, bomSubtotal, bomToCsv } from '../lib/bom';
import { engineeringStatus, STRUCTURE_DISCLAIMER, windZoneInfo } from '../lib/structure';
const confidenceColor = (c: BomLine['confidence']) =>
  c === 'measured' ? '#16a34a' : c === 'derived' ? '#0ea5e9' : c === 'estimated' ? '#eab308' : '#f97316';
const confidenceLabel = (c: BomLine['confidence']) =>
  c === 'measured'
    ? 'Measured — a direct count of placed objects'
    : c === 'derived'
      ? 'Derived — computed from the design geometry'
      : c === 'estimated'
        ? 'Estimated — labelled fallback; refine by completing the design'
        : 'Assumed — depends on a fact the model does not hold (soil resistivity, LPS class, meter position); engineer to confirm';
import { computeEnergyReport } from '../lib/solar';
import { computeFinancials } from '../lib/finance';
import { DEFAULT_MARGIN_PCT } from '../data/pricebook';
import type { BomCategory, BomLine } from '../types';
import { genId } from '../lib/geo';

const CATEGORIES: BomCategory[] = [
  'Modules',
  'Inverter',
  'Electrical BOS',
  'Mechanical BOS',
  'Safety',
  'Civil & Misc',
];

export function Step9Bom() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const margin = project.pricing?.marginPct ?? DEFAULT_MARGIN_PCT;
  const setMargin = (pct: number) =>
    patch({ pricing: { marginPct: Math.min(60, Math.max(0, pct)) } });
  const lines = useMemo(() => mergedBom(project), [project]);
  const report = computeEnergyReport(project);
  const fin = computeFinancials(project, report);

  const subtotal = bomSubtotal(lines);
  const confidence = useMemo(() => bomConfidence(lines), [lines]);
  // same formula as bomTotal/financials — one money path
  const total = Math.round(subtotal * (1 + margin / 100));
  const perW = report.capacityKwp > 0 ? Math.round(total / (report.capacityKwp * 1000)) : 0;

  function override(line: BomLine, p: Partial<BomLine>) {
    const updated: BomLine = { ...line, ...p, overridden: true };
    const rest = project.bomOverrides.filter(
      (o) => !(o.auto && o.category === line.category && o.item === line.item) && o.id !== line.id,
    );
    patch({ bomOverrides: [...rest, updated] });
  }

  function addCustomLine() {
    const custom: BomLine = {
      id: genId('bomc'),
      category: 'Civil & Misc',
      confidence: 'measured', // the user entered it — it is their own figure
      item: 'Custom item',
      spec: '',
      qty: 1,
      unit: 'nos',
      unitPriceInr: 0,
      formula: 'Added manually',
      auto: false,
      overridden: false,
    };
    patch({ bomOverrides: [...project.bomOverrides, custom] });
  }

  function removeCustom(id: string) {
    patch({ bomOverrides: project.bomOverrides.filter((o) => o.id !== id) });
  }

  function resetOverrides() {
    patch({ bomOverrides: project.bomOverrides.filter((o) => !o.auto) });
  }

  function exportCsv() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bomToCsv(lines)], { type: 'text/csv' }));
    a.download = `BOM-${project.info.name}.csv`;
    a.click();
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 18px 90px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 9 }}>
            <ReceiptText size={20} aria-hidden /> Bill of Materials
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            Auto-derived from your design — hover the info icon for each line's formula. Edit any
            qty/price; auto lines re-sync when the design changes.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={resetOverrides}>
            <RefreshCw size={15} /> Re-sync
          </button>
          <button className="btn btn-primary" onClick={exportCsv}>
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* summary strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 10,
          margin: '16px 0',
        }}
      >
        <Stat label="System" value={`${report.capacityKwp} kWp`} />
        <Stat label="Subtotal" value={`₹${subtotal.toLocaleString('en-IN')}`} />
        <Stat
          label={`Margin`}
          value={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                value={margin}
                min={0}
                max={40}
                aria-label="Margin percentage"
                style={{ width: 52, padding: '2px 6px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 14, fontWeight: 800 }}
                onChange={(e) => setMargin(Number(e.target.value))}
              />
              %
            </span>
          }
        />
        <Stat label="Quote Total" value={`₹${total.toLocaleString('en-IN')}`} strong />
        <Stat label="₹/Wp" value={`₹${perW}`} />
        <Stat
          label="Subsidy (residential)"
          value={
            <>
              ₹{fin.subsidyInr.toLocaleString('en-IN')}
              {fin.subsidyInr === 0 && (
                <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, opacity: 0.85 }}>
                  {project.info.siteType !== 'residential'
                    ? '(residential only)'
                    : !project.components.panel?.dcr
                      ? '(needs a DCR module — selected panel is not DCR)'
                      : '(select panels first)'}
                </span>
              )}
            </>
          }
          good
        />
      </div>

      {lines.some((l) => l.formula.includes(STRUCTURE_DISCLAIMER)) && (
        <div className="banner-warn" style={{ borderRadius: 8, marginBottom: 14, fontSize: 11.5 }}>
          <b>{engineeringStatus(project).label}.</b> {STRUCTURE_DISCLAIMER}
          {windZoneInfo(project.info.state).high && (
            <> · {windZoneInfo(project.info.state).label}</>
          )}
        </div>
      )}

      {confidence.preliminary && (
        <div className="banner-warn" style={{ borderRadius: 8, marginBottom: 14, fontSize: 11.5 }}>
          <b>PRELIMINARY quote.</b>{' '}
          {confidence.counts.assumed > 0 && `${confidence.counts.assumed} line(s) ASSUMED`}
          {confidence.counts.assumed > 0 && confidence.counts.estimated > 0 && ', '}
          {confidence.counts.estimated > 0 && `${confidence.counts.estimated} estimated`} — site
          verification required for: {confidence.needsVerification.join(', ')}. Hover a line's ⓘ
          for its basis.
        </div>
      )}

      {CATEGORIES.map((cat) => {
        const catLines = lines.filter((l) => l.category === cat);
        if (catLines.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 0.7, color: 'var(--ink-3)', marginBottom: 6 }}>
              {cat.toUpperCase()}
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: 'var(--paper-2)', fontSize: 11 }}>
                    <th style={th}>Item</th>
                    <th style={th}>Spec</th>
                    <th style={{ ...th, width: 84 }}>Qty</th>
                    <th style={{ ...th, width: 60 }}>Unit</th>
                    <th style={{ ...th, width: 100 }}>Unit ₹</th>
                    <th style={{ ...th, width: 100, textAlign: 'right' }}>Amount ₹</th>
                    <th style={{ ...th, width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {catLines.map((l) => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--paper-3)' }}>
                      <td style={td}>
                        <span
                          title={confidenceLabel(l.overridden ? 'measured' : l.confidence)}
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: 8,
                            marginRight: 7,
                            verticalAlign: 'middle',
                            background: confidenceColor(l.overridden ? 'measured' : l.confidence),
                          }}
                        />
                        {l.auto ? (
                          <b style={{ fontWeight: 650 }}>{l.item}</b>
                        ) : (
                          <input
                            style={cellInput}
                            value={l.item}
                            aria-label="Item name"
                            onChange={(e) => override(l, { item: e.target.value })}
                          />
                        )}
                        {l.overridden && (
                          <span className="badge badge-pro" style={{ marginLeft: 6 }}>edited</span>
                        )}
                      </td>
                      <td style={{ ...td, color: 'var(--ink-3)', fontSize: 11.5 }}>{l.spec}</td>
                      <td style={td}>
                        <input
                          type="number"
                          style={cellInput}
                          value={l.qty}
                          aria-label={`Quantity of ${l.item}`}
                          onChange={(e) => override(l, { qty: Number(e.target.value) })}
                        />
                      </td>
                      <td style={{ ...td, color: 'var(--ink-3)' }}>{l.unit}</td>
                      <td style={td}>
                        <input
                          type="number"
                          style={cellInput}
                          value={l.unitPriceInr}
                          aria-label={`Unit price of ${l.item}`}
                          onChange={(e) => override(l, { unitPriceInr: Number(e.target.value) })}
                        />
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                        {Math.round(l.qty * l.unitPriceInr).toLocaleString('en-IN')}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {l.auto ? (
                          <span
                            title={`Derivation: ${l.formula}`}
                            data-tip={`Derivation: ${l.formula}`}
                            data-tip-left=""
                            tabIndex={0}
                            style={{ cursor: 'help', color: 'var(--info)', display: 'inline-flex' }}
                          >
                            <Info size={14} aria-label="Line formula" />
                          </span>
                        ) : (
                          <button
                            style={{ color: 'var(--bad)', display: 'inline-flex' }}
                            aria-label={`Remove ${l.item}`}
                            data-tip="Remove line"
                            data-tip-left=""
                            onClick={() => removeCustom(l.id)}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <button className="btn btn-secondary btn-block" onClick={addCustomLine}>
        <Plus size={15} /> Add custom line
      </button>

      <div className="card" style={{ marginTop: 18, background: 'var(--paper-2)', fontSize: 12.5 }}>
        <b style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ClipboardList size={15} aria-hidden /> DISCOM compliance checklist (
          {project.info.discom || 'your DISCOM'})
        </b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--ink-2)', lineHeight: 1.7 }}>
          <li>Net-metering application + sanctioned load proof ({project.info.sanctionedLoadKw} kW on record)</li>
          <li>Single line diagram (auto-generated in Step 8) signed by licensed electrical contractor</li>
          <li>
            ALMM module + BIS inverter certificates{' '}
            {project.components.panel?.almm ? (
              <span style={{ color: 'var(--good)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'text-bottom' }}>
                <CheckCircle2 size={13} aria-hidden /> module is ALMM-listed
              </span>
            ) : (
              <span style={{ color: 'var(--warn)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'text-bottom' }}>
                <AlertTriangle size={13} aria-hidden /> selected module is NOT ALMM-listed
              </span>
            )}
          </li>
          <li>Earthing test report (3 pits) + LA installation certificate</li>
          <li>
            Subsidy portal registration (PM Surya Ghar) — eligible: ₹
            {fin.subsidyInr.toLocaleString('en-IN')}
            {project.info.siteType === 'residential' && !project.components.panel?.dcr && (
              <span style={{ color: 'var(--warn, #b45309)', fontWeight: 700 }}>
                {' '}
                — requires a DCR module; the selected panel is not DCR
              </span>
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontWeight: 700 };
const td: React.CSSProperties = { padding: '7px 10px', verticalAlign: 'middle' };
const cellInput: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  border: '1px solid transparent',
  borderRadius: 6,
  background: 'transparent',
  fontSize: 12.5,
};

function Stat({
  label,
  value,
  strong,
  good,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  good?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: '10px 12px',
        background: strong ? 'var(--ink)' : good ? 'var(--good-bg)' : 'var(--paper)',
        color: strong ? '#fff' : good ? 'var(--good)' : 'var(--ink)',
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
