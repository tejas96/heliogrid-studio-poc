// ─── Step 9 · Bill of Materials ─────────────────────────────────────────────
// Rebuilt in Phase 22f. Three things changed structurally, all of which were
// bugs rather than cosmetics:
//
//  1. The total is `bomMoney`, not a formula retyped here. This screen used to
//     recompute `subtotal × (1 + margin)` locally, which was correct until 22d
//     made GST per-line — from then on Step 9 and the proposal disagreed, and
//     no test caught it because the tests exercised `bomTotal` and the screen
//     did not call it. There is one money path and this screen reads it.
//
//  2. Edits go through the 22c per-field override layer. The old handler
//     replaced the WHOLE line, freezing a stale `formula` beside an edited
//     `qty` — the derivation text would describe a calculation that no longer
//     produced the number next to it.
//
//  3. Sections come from the registry's CATEGORY_ORDER rather than a second
//     hardcoded list that could drift from it.
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Plus,
  ReceiptText,
  RefreshCw,
} from 'lucide-react';
import { useActiveProject, useProjectPatch } from '../../store/store';
import { DiscountField } from './DiscountField';
import type { QuoteDiscount } from '../../types';
import {
  CATEGORY_ORDER,
  bomConfidence,
  bomMoney,
  bomToCsv,
  mergedBomResult,
} from '../../lib/bom';
import {
  addCustomBomLine,
  adoptOrphanAsCustom,
  discardOrphan,
  editBomField,
  editCustomBomLine,
  refreshBomLines,
  removeCustomBomLine,
  resetBomField,
  setBomInput,
} from '../../lib/bom/edit';
import type { BomOrphan, OverridableField } from '../../lib/bom/merge';
import { engineeringStatus, STRUCTURE_DISCLAIMER, windZoneInfo } from '../../lib/structure';
import { computeEnergyReport } from '../../lib/solar';
import { computeFinancials } from '../../lib/finance';
import { DEFAULT_MARGIN_PCT } from '../../data/pricebook';
import { Dialog, NumberField } from '../../components/ui';
import { genId } from '../../lib/geo';
import type { BomLine } from '../../types';
import { BomSection } from './BomSection';
import { OrphanBanner } from './OrphanBanner';

export function Step9Bom() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const [confirmReset, setConfirmReset] = useState(false);

  const margin = project.pricing?.marginPct ?? DEFAULT_MARGIN_PCT;
  const { lines, orphans } = useMemo(() => mergedBomResult(project), [project]);
  const report = computeEnergyReport(project);
  const fin = computeFinancials(project, report);

  // THE money path — same call the financials and the proposal make.
  const money = useMemo(() => bomMoney(lines, project), [lines, project]);
  const discount = project.pricing?.discount;
  /**
   * `undefined` REMOVES the rule rather than storing `{value: 0}` — the
   * lazy-field contract, so a project that never discounted keeps serializing
   * byte for byte and its captures stay fresh.
   */
  const setDiscount = (next: QuoteDiscount | undefined) => {
    const { discount: _drop, ...rest } = project.pricing ?? {};
    patch(
      { pricing: next ? { ...rest, marginPct: margin, discount: next } : { ...rest, marginPct: margin } },
      true,
    );
  };
  const confidence = useMemo(() => bomConfidence(lines), [lines]);
  const perW = report.capacityKwp > 0 ? Math.round(money.total / (report.capacityKwp * 1000)) : 0;

  // Every BOM mutation is ONE undoable patch (§H). The `true` is what makes a
  // price edit undoable as a single step rather than silently merging.
  const apply = (p: Partial<typeof project>) => patch(p, true);

  // A hand-entered line is edited in place; a derived one gets a field
  // override. Routing both through `editBomField` would turn every edit to a
  // custom line into an orphan that changes nothing — see editCustomBomLine.
  const onEdit = (lineKey: string, field: OverridableField, value: unknown) => {
    const line = lines.find((l) => l.id === lineKey);
    apply(
      line && !line.auto
        ? editCustomBomLine(project, lineKey, field, value)
        : editBomField(project, lineKey, field, value),
    );
  };
  const onReset = (lineKey: string, field: string) =>
    apply(resetBomField(project, lineKey, field));
  const onRefreshSection = (lineKeys: string[]) => apply(refreshBomLines(project, lineKeys));
  const onRemoveCustom = (id: string) => apply(removeCustomBomLine(project, id));
  const onSetInput = (key: 'avgDcRunM' | 'avgAcRunM', v: number | undefined) =>
    apply(setBomInput(project, key, v));

  const onKeepOrphan = (o: BomOrphan) => {
    const f = o.fields as Partial<BomLine>;
    apply(
      adoptOrphanAsCustom(project, o.lineKey, {
        id: genId('bomc'),
        category: 'Civil & Misc',
        item: f.item ?? o.label,
        spec: '',
        qty: f.qty ?? 1,
        unit: f.unit ?? 'nos',
        unitPriceInr: f.unitPriceInr ?? 0,
        formula: `Kept from an edit that no longer matches the design (${o.lineKey})`,
        confidence: 'measured',
        auto: false,
        overridden: false,
        included: true,
        wastePct: 0,
        gstPct: 18,
      }),
    );
  };

  function addCustomLine() {
    apply(
      addCustomBomLine(project, {
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
        included: true,
        wastePct: 0,
        gstPct: 18,
      }),
    );
  }

  function exportCsv() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bomToCsv(lines, project)], { type: 'text/csv' }));
    a.download = `BOM-${project.info.name}.csv`;
    a.click();
  }

  const editedCount = lines.filter((l) => (l.overriddenFields?.length ?? 0) > 0).length;

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 18px 90px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 9 }}>
            <ReceiptText size={20} aria-hidden /> Bill of Materials
          </h2>
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            Auto-derived from your design. Edit any field — only what you edit stops tracking the
            design, and ↻ puts it back.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setConfirmReset(true)}
            disabled={editedCount === 0}
          >
            <RefreshCw size={15} /> Re-sync all
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
        <Stat label="Cost (pre-margin)" value={`₹${money.subtotal.toLocaleString('en-IN')}`} />
        <Stat
          label="Margin"
          value={
            <NumberField
              value={margin}
              min={0}
              max={60}
              suffix="%"
              ariaLabel="Margin percentage"
              // SPREAD, don't replace. `pricing` gained a sibling field, and
              // writing a fresh object here would silently drop the discount
              // every time someone nudged the margin.
              onCommit={(v) => patch({ pricing: { ...project.pricing, marginPct: v ?? 0 } }, true)}
              style={{ width: 54, fontWeight: 800, fontSize: 14 }}
            />
          }
        />
        <Stat
          label="Discount"
          value={
            <DiscountField discount={discount} onChange={setDiscount} />
          }
        />
        <Stat
          label="Taxable"
          value={
            <span>
              ₹{money.taxable.toLocaleString('en-IN')}
              {money.discount > 0 && (
                <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, opacity: 0.85 }}>
                  −₹{money.discount.toLocaleString('en-IN')} off ₹
                  {money.taxableBeforeDiscount.toLocaleString('en-IN')}
                </span>
              )}
            </span>
          }
        />
        <Stat
          label="GST"
          value={
            <span>
              ₹{money.gst.toLocaleString('en-IN')}
              {money.gstByRate.length > 1 && (
                <span style={{ display: 'block', fontSize: 9.5, fontWeight: 600, opacity: 0.85 }}>
                  {money.gstByRate.map((r) => `${r.pct}%`).join(' + ')}
                </span>
              )}
            </span>
          }
        />
        <Stat label="Quote Total" value={`₹${money.total.toLocaleString('en-IN')}`} strong />
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

      {orphans.length > 0 && (
        <OrphanBanner
          orphans={orphans}
          onKeep={onKeepOrphan}
          onDiscard={(o) => apply(discardOrphan(project, o.lineKey))}
        />
      )}

      {money.belowCost && (
        // Reported, not blocked: selling under cost is occasionally deliberate
        // (a reference site, a foot in the door with a builder). It should
        // never happen because someone typed 45 meaning 4.5.
        <div className="banner-warn" style={{ borderRadius: 8, marginBottom: 14, fontSize: 11.5 }}>
          <b>This discount sells below cost.</b> The kit costs ₹
          {money.subtotal.toLocaleString('en-IN')} to buy and the quote is priced at ₹
          {money.taxable.toLocaleString('en-IN')} before tax — a loss of ₹
          {(money.subtotal - money.taxable).toLocaleString('en-IN')}.
        </div>
      )}

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
          verification required for: {confidence.needsVerification.join(', ')}.
        </div>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const catLines = lines.filter((l) => l.category === cat);
        if (catLines.length === 0) return null;
        return (
          <BomSection
            key={cat}
            category={cat}
            lines={catLines}
            project={project}
            marginPct={margin}
            onEdit={onEdit}
            onReset={onReset}
            onRefreshSection={onRefreshSection}
            onRemoveCustom={onRemoveCustom}
            onSetInput={onSetInput}
          />
        );
      })}

      <button className="btn btn-secondary btn-block" onClick={addCustomLine}>
        <Plus size={15} /> Add custom line
      </button>

      {confirmReset && (
        <Dialog
          title="Discard all BOM edits?"
          onClose={() => setConfirmReset(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  apply(refreshBomLines(project, lines.map((l) => l.id)));
                  setConfirmReset(false);
                }}
              >
                Discard {editedCount} edited {editedCount === 1 ? 'line' : 'lines'}
              </button>
            </>
          }
        >
          {/* This used to fire immediately from a toolbar button. Quantities and
              prices are work someone did by hand; one stray click should not
              silently undo all of it. */}
          <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0 }}>
            {editedCount} {editedCount === 1 ? 'line has' : 'lines have'} hand-entered values.
            Discarding takes the derived figures for all of them. Custom lines you added are
            kept. This can be undone.
          </p>
        </Dialog>
      )}

      <div className="card" style={{ marginTop: 18, background: 'var(--paper-2)', fontSize: 12.5 }}>
        <b style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <ClipboardList size={15} aria-hidden /> DISCOM compliance checklist (
          {project.info.discom || 'your DISCOM'})
        </b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--ink-2)', lineHeight: 1.7 }}>
          <li>
            Net-metering application + sanctioned load proof ({project.info.sanctionedLoadKw} kW on
            record)
          </li>
          <li>
            Single line diagram (auto-generated in Step 8) signed by licensed electrical contractor
          </li>
          <li>
            ALMM module + BIS inverter certificates{' '}
            {project.components.panel?.almm ? (
              <span style={badgeGood}>
                <CheckCircle2 size={13} aria-hidden /> module is ALMM-listed
              </span>
            ) : (
              <span style={badgeWarn}>
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

const badgeGood: React.CSSProperties = {
  color: 'var(--good)',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  verticalAlign: 'text-bottom',
};
const badgeWarn: React.CSSProperties = { ...badgeGood, color: 'var(--warn)' };

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
