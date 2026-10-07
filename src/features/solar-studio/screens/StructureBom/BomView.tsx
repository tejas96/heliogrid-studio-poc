// ─── Step 7 · Structure & BOM — the Bill of materials view ──────────────────
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
//
// Layout (Structure & BOM): a sticky bar jumps to a section and filters the
// lines; the quote reads as one strip; every warning sits in ONE attention
// card instead of four banners; the table keeps its full width, because its
// eleven columns are what an estimator works in.
import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useActiveProject, useProjectPatch } from '../../store/store';
import { DiscountField } from './DiscountField';
import type { BomCategory, QuoteDiscount } from '../../types';
import {
  CATEGORY_ORDER,
  bomConfidence,
  bomToCsv,
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
import { sectionState } from '../../lib/bom/view';
import { engineeringStatus, STRUCTURE_DISCLAIMER, windZoneInfo } from '../../lib/structure';
import { deriveBomResult, deriveEnergy, deriveFinance, deriveMoney, designFreshness } from '../../lib/derive';
import { DEFAULT_MARGIN_PCT } from '../../data/pricebook';
import { Dialog, NumberField } from '../../components/ui';
import { genId } from '../../lib/geo';
import type { BomLine } from '../../types';
import { BomSection } from './BomSection';
import { OrphanBanner } from './OrphanBanner';
import { FreshnessBanner } from '../../components/FreshnessBanner';
import { STEP } from '../../lib/steps';

type Filter = 'all' | 'edited' | 'confirm' | 'excluded';
const FILTERS: { value: Filter; label: string; test: (l: BomLine) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'edited', label: 'Edited', test: (l) => (l.overriddenFields?.length ?? 0) > 0 },
  // the same lines `bomConfidence` counts: an excluded line is not in the quote
  {
    value: 'confirm',
    label: 'To confirm on site',
    test: (l) => l.included !== false && (l.confidence === 'assumed' || l.confidence === 'estimated'),
  },
  { value: 'excluded', label: 'Excluded', test: (l) => l.included === false },
];
const lakh = (v: number) => `₹${(v / 100000).toFixed(2)} L`;
const inr = (v: number) => `₹${v.toLocaleString('en-IN')}`;

export function BomView() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const [confirmReset, setConfirmReset] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const margin = project.pricing?.marginPct ?? DEFAULT_MARGIN_PCT;
  const { lines, orphans } = deriveBomResult(project);
  const report = deriveEnergy(project);
  const fin = deriveFinance(project);

  // THE money path — same call the financials and the proposal make.
  const money = deriveMoney(project);
  const fresh = designFreshness(project).all;
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
  const test = FILTERS.find((f) => f.value === filter)!.test;
  const sections = CATEGORY_ORDER.map((cat) => {
    const all = lines.filter((l) => l.category === cat);
    return { cat, all, shown: all.filter(test), total: all.length ? sectionState(cat, all, project).total : 0 };
  }).filter((s) => s.all.length > 0);
  const jump = (cat: BomCategory) =>
    document.getElementById(`bomsec-${cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const structureNote = lines.some((l) => l.formula.includes(STRUCTURE_DISCLAIMER));
  const attention = orphans.length > 0 || money.belowCost || structureNote || confidence.preliminary;

  return (
    <div className="ds mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 pt-4 pb-24 text-text">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Bill of materials</h2>
          <p className="text-xs text-muted">
            Derived from your design. Edit any field — only what you edit stops tracking the design, and ↻ puts
            it back.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={editedCount === 0}
            className="flex min-h-8 items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-sm font-medium hover:border-border-strong disabled:cursor-not-allowed disabled:text-subtle"
          >
            <RefreshCw size={15} aria-hidden /> Re-sync all
          </button>
          <button
            type="button"
            onClick={addCustomLine}
            className="flex min-h-8 items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-sm font-medium hover:border-border-strong"
          >
            <Plus size={15} aria-hidden /> Custom line
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="flex min-h-8 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            <Download size={15} aria-hidden /> Export CSV
          </button>
        </div>
      </header>

      <FreshnessBanner project={project} />

      {/* the quote, as one strip — the proposal prints this exact total */}
      <section aria-label="Quote" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="System" value={`${report.capacityKwp} kWp`} />
        <Stat label="Cost before margin" value={inr(money.subtotal)} />
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
              style={{ width: 54, fontWeight: 700, fontSize: 14 }}
            />
          }
        />
        <Stat label="Discount" value={<DiscountField discount={discount} onChange={setDiscount} />} />
        <Stat
          label="Taxable"
          value={inr(money.taxable)}
          sub={
            money.discount > 0
              ? `−${inr(money.discount)} off ${inr(money.taxableBeforeDiscount)}`
              : undefined
          }
        />
        <Stat
          label="GST"
          value={inr(money.gst)}
          sub={money.gstByRate.length > 1 ? money.gstByRate.map((r) => `${r.pct}%`).join(' + ') : undefined}
        />
        <Stat
          label={fresh ? 'Quote total' : 'Quote total · provisional'}
          value={inr(money.total)}
          sub={`₹${perW} per Wp · printed on the proposal`}
          strong
        />
        <Stat
          label="Subsidy, residential"
          value={inr(fin.subsidyInr)}
          sub={
            fin.subsidyInr === 0
              ? project.info.siteType !== 'residential'
                ? 'residential only'
                : !project.components.panel?.dcr
                  ? 'needs a DCR module — this panel is not DCR'
                  : 'select panels first'
              : undefined
          }
          good
        />
      </section>

      {attention && (
        <section aria-label="Needs attention" className="flex flex-col gap-2 rounded-lg border border-warning bg-warning-subtle p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle size={16} aria-hidden /> Needs attention before the quote
          </h3>
          {orphans.length > 0 && (
            <OrphanBanner
              orphans={orphans}
              onKeep={onKeepOrphan}
              onDiscard={(o) => apply(discardOrphan(project, o.lineKey))}
            />
          )}
          {/* Reported, not blocked: selling under cost is occasionally
              deliberate (a reference site, a foot in the door with a builder).
              It should never happen because someone typed 45 meaning 4.5. */}
          {money.belowCost && (
            <p className="m-0 text-sm text-warning">
              <b className="font-semibold">This discount sells below cost.</b> The kit costs{' '}
              {inr(money.subtotal)} to buy and the quote is priced at {inr(money.taxable)} before tax — a
              loss of {inr(money.subtotal - money.taxable)}.
            </p>
          )}
          {structureNote && (
            <p className="m-0 text-sm text-warning">
              <b className="font-semibold">{engineeringStatus(project).label}.</b> {STRUCTURE_DISCLAIMER}
              {windZoneInfo(project.info.state).high && <> · {windZoneInfo(project.info.state).label}</>}
            </p>
          )}
          {confidence.preliminary && (
            <p className="m-0 flex flex-wrap items-baseline gap-2 text-sm text-warning">
              <span>
                <b className="font-semibold">Preliminary quote.</b>{' '}
                {confidence.counts.assumed > 0 && `${confidence.counts.assumed} line(s) assumed`}
                {confidence.counts.assumed > 0 && confidence.counts.estimated > 0 && ', '}
                {confidence.counts.estimated > 0 && `${confidence.counts.estimated} estimated`} — confirm on
                site: {confidence.needsVerification.join(', ')}.
              </span>
              {filter !== 'confirm' && (
                <button
                  type="button"
                  onClick={() => setFilter('confirm')}
                  className="rounded-sm border border-warning px-2 text-xs font-medium"
                >
                  Show only these
                </button>
              )}
            </p>
          )}
        </section>
      )}

      {/* sticky: jump to a section, and narrow the lines */}
      <nav
        aria-label="BOM sections"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-y border-border bg-surface py-2"
      >
        {sections.map((s) => (
          <button
            key={s.cat}
            type="button"
            onClick={() => jump(s.cat)}
            className="flex min-h-8 items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-xs hover:border-border-strong"
          >
            <span className="font-semibold">{s.cat}</span>
            <span className="text-muted tabular-nums">{lakh(s.total)}</span>
          </button>
        ))}
        <span className="flex-1" />
        <div role="radiogroup" aria-label="Show lines" className="flex rounded-md bg-surface-sunken p-1">
          {FILTERS.map((f) => {
            const n = lines.filter(f.test).length;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={
                  'min-h-6 rounded-sm px-3 text-xs font-medium ' +
                  (filter === f.value ? 'bg-surface-raised shadow-1' : 'text-muted hover:text-text')
                }
              >
                {f.label} <span className="tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div>
        {sections.map((s) =>
          s.shown.length === 0 ? null : (
            <BomSection
              key={s.cat}
              category={s.cat}
              lines={s.shown}
              project={project}
              marginPct={margin}
              onEdit={onEdit}
              onReset={onReset}
              onRefreshSection={onRefreshSection}
              onRemoveCustom={onRemoveCustom}
              onSetInput={onSetInput}
            />
          ),
        )}
        {sections.every((s) => s.shown.length === 0) && (
          <p className="rounded-md bg-surface-sunken p-6 text-center text-sm text-muted">
            No lines match this filter.{' '}
            <button type="button" onClick={() => setFilter('all')} className="font-medium text-accent-text hover:underline">
              Show all lines
            </button>
          </p>
        )}
      </div>

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

      <section aria-label="DISCOM compliance checklist" className="rounded-lg border border-border bg-surface-sunken p-4 text-sm">
        <h3 className="flex items-center gap-2 font-semibold">
          <ClipboardList size={15} aria-hidden /> DISCOM compliance checklist ({project.info.discom || 'your DISCOM'})
        </h3>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-6 text-muted">
          <li>
            Net-metering application + sanctioned load proof ({project.info.sanctionedLoadKw} kW on record)
          </li>
          <li>
            Single line diagram (auto-generated in Step {STEP.drawings}) signed by licensed electrical
            contractor
          </li>
          <li>
            ALMM module + BIS inverter certificates{' '}
            {project.components.panel?.almm ? (
              <span className="inline-flex items-center gap-1 font-medium text-success">
                <CheckCircle2 size={13} aria-hidden /> module is ALMM-listed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-warning">
                <AlertTriangle size={13} aria-hidden /> selected module is NOT ALMM-listed
              </span>
            )}
          </li>
          <li>Earthing test report (3 pits) + LA installation certificate</li>
          <li>
            Subsidy portal registration (PM Surya Ghar) — eligible: {inr(fin.subsidyInr)}
            {project.info.siteType === 'residential' && !project.components.panel?.dcr && (
              <span className="font-semibold text-warning"> — requires a DCR module; the selected panel is not DCR</span>
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  strong,
  good,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  strong?: boolean;
  good?: boolean;
}) {
  return (
    <div
      className={
        'flex flex-col gap-1 rounded-md border p-3 ' +
        (strong
          ? 'border-text bg-text text-surface'
          : good
            ? 'border-success-subtle bg-success-subtle text-success'
            : 'border-border bg-surface-raised')
      }
    >
      <span className={'text-2xs ' + (strong || good ? '' : 'text-muted')}>{label}</span>
      <span className="text-base font-semibold tabular-nums">{value}</span>
      {sub && <span className="text-2xs">{sub}</span>}
    </div>
  );
}
