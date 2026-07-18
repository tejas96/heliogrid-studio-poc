import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileUp,
  Lightbulb,
  PencilLine,
  Scale,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useActiveProject, useProjectPatch } from '../store/store';
import { PANEL_DB } from '../data/panels';
import { INVERTER_DB } from '../data/inverters';
import type { CellTech, InverterSpec, PanelSpec, Project } from '../types';
import { estimateMaxCapacityKwp } from '../lib/layout';
import { suggestKwpFromBill } from '../lib/solar';
import { memoizedComparison, recommendInverterFor, type ComparisonRow } from '../lib/comparison';
import { Dialog, Seg, Sheet } from '../components/ui';

type Section = 'panel' | 'capacity' | 'inverter';

function SearchInput({
  placeholder,
  ariaLabel,
  value,
  onChange,
}: {
  placeholder: string;
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <Search
        size={14}
        aria-hidden
        style={{
          position: 'absolute',
          left: 11,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--ink-3)',
          pointerEvents: 'none',
        }}
      />
      <input
        style={{
          width: '100%',
          padding: '9px 12px 9px 32px',
          border: '1px solid var(--line)',
          borderRadius: 8,
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function Step4Components() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const c = project.components;
  const [open, setOpen] = useState<Section>(
    !c.panel ? 'panel' : c.targetKwp <= 0 ? 'capacity' : 'inverter',
  );
  const [compare, setCompare] = useState(false);
  const [pendingApply, setPendingApply] = useState<ComparisonRow | null>(null);

  function setComponents(p: Partial<typeof c>) {
    patch({ components: { ...c, ...p } });
  }

  /** ONE undoable patch: panel + inverter + count from a comparison row. */
  function applyRow(row: ComparisonRow) {
    if (!row.inverter) return;
    patch(
      {
        components: {
          ...c,
          panel: row.panel,
          inverter: row.inverter,
          inverterCount: row.inverterCount,
        },
      },
      true,
    );
  }

  const suggestedFromBill =
    project.info.monthlyBillInr && project.location
      ? suggestKwpFromBill(
          project.info.monthlyBillInr,
          project.info.tariffInrPerKwh,
          project.location.peakSunHours,
        )
      : null;

  // ONE recommendation rule shared with the comparison matrix: DC numerator =
  // what the roofs actually hold toward the target (the matrix's current row),
  // falling back to the raw target before any roof exists
  const effectiveKwp = useMemo(() => {
    if (c.targetKwp <= 0) return 0;
    if (project.roofs.length === 0 || !c.panel) return c.targetKwp;
    const cur = memoizedComparison(project).rows.find((r) => r.isCurrent);
    return cur && cur.achievedKwp > 0 ? cur.achievedKwp : c.targetKwp;
  }, [project, c.targetKwp, c.panel]);
  const recommendedPick = useMemo(() => {
    if (effectiveKwp <= 0) return null;
    const phase = project.info.connectionType === 'three' ? 3 : 1;
    return recommendInverterFor(effectiveKwp, phase, INVERTER_DB);
  }, [effectiveKwp, project.info.connectionType]);
  const recommended = recommendedPick?.inverter ?? null;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '26px 20px 80px' }}>
      {/* PANEL */}
      <SectionHead
        label="PANEL"
        state={c.panel ? c.panel.brand + ' ' + c.panel.watt + 'W' : null}
        step="Step 1 of 3"
        open={open === 'panel'}
        onToggle={() => setOpen('panel')}
      />
      {open === 'panel' && (
        <PanelPicker
          selected={c.panel}
          onSelect={(p) => {
            setComponents({ panel: p });
            setOpen('capacity');
          }}
        />
      )}

      {/* CAPACITY */}
      <SectionHead
        label="CAPACITY"
        state={c.targetKwp > 0 ? `${c.targetKwp} kWp` : null}
        step="Step 2 of 3"
        open={open === 'capacity'}
        onToggle={() => setOpen('capacity')}
      />
      {open === 'capacity' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="field">
            <label>Target Capacity</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  style={{ width: '100%', paddingRight: 46 }}
                  type="number"
                  min={0}
                  step={0.1}
                  value={c.targetKwp || ''}
                  placeholder="0"
                  aria-label="Target capacity in kilowatt peak"
                  onChange={(e) => setComponents({ targetKwp: Number(e.target.value) })}
                />
                <span
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 12,
                    color: 'var(--ink-3)',
                  }}
                >
                  kWp
                </span>
              </div>
              <button
                className="btn btn-primary"
                disabled={!c.panel || project.roofs.length === 0}
                onClick={() => {
                  const est = estimateMaxCapacityKwp(project, c.panel!);
                  setComponents({ targetKwp: est.kwp });
                }}
                title="Estimate max capacity from your roof"
              >
                <Sparkles size={15} /> Auto
              </button>
            </div>
            <span className="hint">
              Auto = maximum fit for your drawn roof after setbacks & obstructions.
            </span>
          </div>
          {project.location?.solarInsights?.status === 'ok' &&
            project.location.solarInsights.maxPanels !== undefined && (
              <div style={{ fontSize: 11.5, color: 'var(--info)', marginBottom: 10 }}>
                Cross-check: Google Solar estimates max{' '}
                <b>{project.location.solarInsights.maxPanels} panels</b> on this roof
                {project.location.solarInsights.panelCapacityWatts && (
                  <>
                    {' '}
                    (at {project.location.solarInsights.panelCapacityWatts} W each —
                    your module differs)
                  </>
                )}
                .
              </div>
            )}
          {suggestedFromBill !== null && (
            <div
              className="banner-warn"
              role="button"
              tabIndex={0}
              style={{ borderRadius: 8, cursor: 'pointer' }}
              onClick={() => setComponents({ targetKwp: suggestedFromBill })}
              onKeyDown={(e) => e.key === 'Enter' && setComponents({ targetKwp: suggestedFromBill })}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Lightbulb size={15} style={{ flex: 'none' }} aria-hidden />
                <span>
                  From your ₹{project.info.monthlyBillInr}/month bill we recommend ~
                  {suggestedFromBill} kWp (tap to apply)
                </span>
              </span>
            </div>
          )}
          <button
            className="btn btn-secondary btn-block"
            style={{ marginTop: 12 }}
            onClick={() => setOpen('inverter')}
            disabled={c.targetKwp <= 0}
          >
            Continue <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* INVERTER */}
      <SectionHead
        label="INVERTER"
        state={c.inverter ? `${c.inverter.brand} ${c.inverter.acKw}kW` : null}
        step="Step 3 of 3"
        open={open === 'inverter'}
        onToggle={() => setOpen('inverter')}
      />
      {open === 'inverter' && (
        <InverterPicker
          selected={c.inverter}
          count={c.inverterCount}
          recommended={recommended}
          recommendedCount={recommendedPick?.count ?? 1}
          targetKwp={effectiveKwp || c.targetKwp}
          onSelect={(inv) => setComponents({ inverter: inv })}
          onCount={(n) => setComponents({ inverterCount: n })}
        />
      )}

      {c.inverter && (
        <div className="field" style={{ marginTop: 14 }}>
          <label>DC Collection Topology</label>
          <Seg
            options={[
              { value: 'string', label: 'String inverters' },
              { value: 'central', label: 'Central + combiners' },
            ]}
            value={c.inverterTopology ?? 'string'}
            onChange={(v) => setComponents({ inverterTopology: v })}
          />
          <span className="hint">
            {(c.inverterTopology ?? 'string') === 'central'
              ? 'Strings parallel through fused combiner boxes (SCB) to a central DC bus — the BOM adds combiners + string fuses (C&I / ground-mount).'
              : 'Strings land directly on inverter MPPTs (residential / small C&I).'}
          </span>

          <label style={{ marginTop: 14 }}>Module-Level Electronics (MLPE)</label>
          <Seg
            options={[
              { value: 'none', label: 'None' },
              { value: 'optimizer', label: 'DC optimisers' },
            ]}
            value={c.mlpe ?? 'none'}
            onChange={(v) => setComponents({ mlpe: v })}
          />
          <span className="hint">
            {(c.mlpe ?? 'none') === 'optimizer'
              ? 'Every module tracks its own MPP — mixed orientation, tilt and shading may share a string, so multi-face roofs use every face. BOM adds one optimiser per module.'
              : 'Plain string wiring — a string may only hold modules of matching roof, orientation, tilt and shade exposure.'}
          </span>
        </div>
      )}

      {/* COMPARISON MATRIX (§8.6) — every option through the real pipelines */}
      <button
        className="btn btn-secondary btn-block"
        style={{ marginTop: 18 }}
        disabled={project.roofs.length === 0}
        title={project.roofs.length === 0 ? 'Draw a roof first (Step 2)' : undefined}
        onClick={() => setCompare(true)}
      >
        <Scale size={15} /> Compare options — energy, cost & payback
      </button>
      {compare && (
        <ComparisonSheet
          project={project}
          onApply={(row) => {
            if (!row.inverter) return;
            // a placed layout was filled for the OLD panel spec — confirm
            // before the applied components silently outdate it
            if (project.panels.length > 0 && row.panel.id !== c.panel?.id) {
              setPendingApply(row);
              return;
            }
            applyRow(row);
          }}
          onClose={() => setCompare(false)}
        />
      )}
      {pendingApply && (
        <Dialog
          title="Replace the panel?"
          icon={<AlertTriangle size={16} />}
          onClose={() => setPendingApply(null)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setPendingApply(null)}>
                Keep current
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  applyRow(pendingApply);
                  setPendingApply(null);
                }}
              >
                Replace panel
              </button>
            </>
          }
        >
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
            {project.panels.length} panels are already placed for the{' '}
            {c.panel?.brand} {c.panel?.watt} W module. Switching to the{' '}
            {pendingApply.panel.brand} {pendingApply.panel.watt} W module outdates that layout —
            re-run Auto-fill in the editor afterwards.
          </p>
        </Dialog>
      )}
    </div>
  );
}

function ComparisonSheet({
  project,
  onApply,
  onClose,
}: {
  project: Project;
  onApply: (row: ComparisonRow) => void;
  onClose: () => void;
}) {
  const r = memoizedComparison(project);
  const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
  return (
    <Sheet title="Compare options" icon={<Scale size={16} />} onClose={onClose}>
      <p style={{ fontSize: 11.5, color: 'var(--ink-3)', margin: '0 0 10px' }}>
        {r.basis.objective === 'target_kwp'
          ? `Every option is auto-filled toward your ${r.basis.targetKwp} kWp target on the drawn roofs. `
          : 'No target capacity set — every option is filled to maximum roof capacity. '}
        Estimates assume unshaded panels,{' '}
        {r.basis.irradianceSource === 'PVGIS'
          ? 'PVGIS-measured irradiance'
          : 'estimated irradiance (±10% — PVGIS data not loaded)'}{' '}
        and catalog prices (v{r.basis.catalogVersion}
        {r.basis.catalogProvenance === 'mock-representative' ? ', representative data — not confirmed vendor quotes' : ''}
        ); the placed design and your BOM edits may differ.
      </p>
      {r.warnings.map((w) => (
        <div key={w} className="banner-warn" style={{ borderRadius: 8, marginBottom: 10 }}>
          {w}
        </div>
      ))}
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 10.5 }}>
              <th style={{ padding: '6px 10px 6px 0' }}>OPTION</th>
              <th style={{ padding: '6px 10px' }}>INVERTER</th>
              <th style={{ padding: '6px 10px' }}>FITS</th>
              <th style={{ padding: '6px 10px' }}>MODULE η</th>
              <th style={{ padding: '6px 10px' }}>ANNUAL</th>
              <th style={{ padding: '6px 10px' }}>NET COST</th>
              <th style={{ padding: '6px 10px' }}>PAYBACK</th>
              <th style={{ padding: '6px 10px' }}>25-YR SAVINGS</th>
              <th style={{ padding: '6px 10px' }}>WARRANTY</th>
              <th style={{ padding: '6px 10px' }}>INSTALL</th>
              <th style={{ padding: '6px 0' }} />
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row) => {
              const rec = row.key === r.recommendedKey;
              return (
                <tr
                  key={row.key}
                  style={{
                    borderTop: '1px solid var(--line)',
                    background: rec ? '#eff8f1' : undefined,
                  }}
                >
                  <td style={{ padding: '8px 10px 8px 0' }}>
                    <div style={{ fontWeight: 700 }}>
                      {row.panel.brand} {row.panel.watt}W
                      {rec && (
                        <span className="badge badge-good" style={{ marginLeft: 6 }}>
                          RECOMMENDED
                        </span>
                      )}
                      {row.isCurrent && (
                        <span className="badge" style={{ marginLeft: 6 }}>
                          CURRENT
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                      {row.panel.model}
                      {row.panel.availability === 'on_order' ? ' · on order' : ''}
                      {row.panel.dcr ? ' · DCR' : ''}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {row.inverter ? (
                      <>
                        {row.inverter.brand} {row.inverter.acKw}kW
                        {row.inverterCount > 1 ? ` ×${row.inverterCount}` : ''}
                        <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                          DC/AC {row.dcAcRatio ?? '—'}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {row.panelsPlaced} × {row.panel.watt}W
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{row.achievedKwp} kWp</div>
                  </td>
                  <td style={{ padding: '8px 10px' }}>{row.moduleEfficiencyPct}%</td>
                  <td style={{ padding: '8px 10px' }}>
                    {row.annualKwh.toLocaleString('en-IN')} kWh
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {inr(row.netCostInr)}
                    {row.subsidyInr > 0 && (
                      <div style={{ fontSize: 10.5, color: 'var(--good)' }}>
                        after {inr(row.subsidyInr)} subsidy
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {row.panelsPlaced === 0 ? '—' : `${row.paybackYears} yr`}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {inr(row.savings25YrInr)}
                    {row.roi25Pct !== null && (
                      <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{row.roi25Pct}% of cost</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {row.panel.warrantyYears ?? '—'}
                    {row.inverter?.warrantyYears != null ? ` / ${row.inverter.warrantyYears}` : ''} yr
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {row.installComplexity}
                    {row.arrayWeightKg !== null && (
                      <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>~{row.arrayWeightKg} kg</div>
                    )}
                  </td>
                  <td style={{ padding: '8px 0' }}>
                    {!row.stringFeasible ? (
                      <span
                        style={{ color: 'var(--warn)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                      >
                        <AlertTriangle size={13} aria-hidden /> check
                      </span>
                    ) : row.isCurrent ? (
                      <span style={{ color: 'var(--good)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        <CheckCircle2 size={13} aria-hidden /> selected
                      </span>
                    ) : (
                      <button className="btn btn-secondary" onClick={() => onApply(row)}>
                        Apply
                      </button>
                    )}
                    {(row.feasibilityNote ?? row.warnNote) && (
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--warn)',
                          maxWidth: 170,
                          whiteSpace: 'normal',
                          marginTop: 3,
                        }}
                      >
                        {row.feasibilityNote ?? row.warnNote}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {r.decisions.map((d) => (
        <div key={d.id} className="card" style={{ marginBottom: 8, padding: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>{d.topic}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '2px 0' }}>{d.choice}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{d.reason}</div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
            {d.inputs.join(' · ')}
          </div>
        </div>
      ))}
      <p style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 6 }}>
        Fixed assumptions shared by every row: 3%/yr tariff escalation, 25-year horizon, your
        saved margin, PM Surya Ghar subsidy rules. Warranty shown as panel / inverter years.
      </p>
    </Sheet>
  );
}

function SectionHead({
  label,
  state,
  step,
  open,
  onToggle,
}: {
  label: string;
  state: string | null;
  step: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{
        display: 'flex',
        width: '100%',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 2px',
        borderBottom: '1px solid var(--line)',
        marginBottom: 14,
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: 0.6 }}>
        {label}
        {state && (
          <span style={{ fontWeight: 600, color: 'var(--ink-2)', marginLeft: 10 }}>
            {state}
          </span>
        )}
      </span>
      <span
        style={{
          fontSize: 12,
          color: state ? 'var(--good)' : 'var(--warn)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {state ? (
          <Check size={13} strokeWidth={3} aria-hidden />
        ) : (
          <>
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'currentColor',
                display: 'inline-block',
              }}
            />
            Not selected
          </>
        )}
        <small style={{ color: 'var(--ink-3)' }}>{step}</small>
        {open ? (
          <ChevronUp size={14} color="var(--ink-3)" aria-hidden />
        ) : (
          <ChevronDown size={14} color="var(--ink-3)" aria-hidden />
        )}
      </span>
    </button>
  );
}

const TECHS: (CellTech | 'All Types')[] = ['All Types', 'Mono PERC', 'TOPCon', 'Bifacial', 'Poly', 'HJT'];

function PanelPicker({
  selected,
  onSelect,
}: {
  selected: PanelSpec | null;
  onSelect: (p: PanelSpec) => void;
}) {
  const [q, setQ] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [minW, setMinW] = useState(400);
  const [maxW, setMaxW] = useState(650);
  const [tech, setTech] = useState<(typeof TECHS)[number]>('All Types');
  const [almm, setAlmm] = useState(false);
  const [dcr, setDcr] = useState(false);

  const list = useMemo(
    () =>
      PANEL_DB.filter((p) => {
        if (q && !(p.brand + ' ' + p.model + ' ' + p.watt).toLowerCase().includes(q.toLowerCase()))
          return false;
        if (p.watt < minW || p.watt > maxW) return false;
        if (tech !== 'All Types' && p.tech !== tech) return false;
        if (almm && !p.almm) return false;
        if (dcr && !p.dcr) return false;
        return true;
      }),
    [q, minW, maxW, tech, almm, dcr],
  );

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      {selected && (
        <div className="card" style={{ background: 'var(--paper-2)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <b>{selected.brand}</b>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{selected.model}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
                {selected.lengthMm} × {selected.widthMm} mm · Voc {selected.vocV}V · Vmp{' '}
                {selected.vmpV}V · Isc {selected.iscA}A
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{selected.watt}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>watts</div>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <SearchInput
          placeholder="Search by brand or wattage..."
          ariaLabel="Search panels"
          value={q}
          onChange={setQ}
        />
        <button
          className="btn btn-secondary"
          aria-expanded={showFilter}
          onClick={() => setShowFilter((v) => !v)}
        >
          <SlidersHorizontal size={15} /> Filter
        </button>
      </div>
      {showFilter && (
        <div className="card" style={{ background: 'var(--paper-2)', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Min Watt</label>
              <input
                type="number"
                value={minW}
                aria-label="Minimum wattage"
                onChange={(e) => setMinW(Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Max Watt</label>
              <input
                type="number"
                value={maxW}
                aria-label="Maximum wattage"
                onChange={(e) => setMaxW(Number(e.target.value))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {TECHS.map((t) => (
              <button
                key={t}
                className={`chip ${tech === t ? 'on' : ''}`}
                aria-pressed={tech === t}
                onClick={() => setTech(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <label style={{ fontSize: 13, marginRight: 16 }}>
            <input type="checkbox" checked={dcr} onChange={(e) => setDcr(e.target.checked)} /> DCR
          </label>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={almm} onChange={(e) => setAlmm(e.target.checked)} /> ALMM
          </label>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 8 }}>
        {list.length} panels
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {list.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            aria-pressed={selected?.id === p.id}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              gap: 12,
              padding: '10px 8px',
              borderBottom: '1px solid var(--line)',
              textAlign: 'left',
              background: selected?.id === p.id ? '#eff4ff' : undefined,
              borderRadius: 8,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#7c3aed22',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                flex: 'none',
              }}
            >
              {p.brand[0]}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {p.brand} {p.model}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>
                {p.watt}W · {p.tech} · {p.lengthMm}×{p.widthMm}mm
              </span>
            </span>
            {p.almm && <span className="badge badge-almm">ALMM</span>}
            {p.dcr && <span className="badge badge-good">DCR</span>}
          </button>
        ))}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: 'var(--ink-3)',
          marginTop: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <PencilLine size={13} aria-hidden /> or enter specs manually ·{' '}
        <FileUp size={13} aria-hidden /> upload datasheet (PDF extraction) — mocked in POC
      </div>
    </div>
  );
}

function InverterPicker({
  selected,
  count,
  recommended,
  recommendedCount = 1,
  targetKwp,
  onSelect,
  onCount,
}: {
  selected: InverterSpec | null;
  count: number;
  recommended: InverterSpec | null;
  recommendedCount?: number;
  /** effective DC kWp (what the roofs hold toward the target) — matches the comparison matrix */
  targetKwp: number;
  onSelect: (i: InverterSpec) => void;
  onCount: (n: number) => void;
}) {
  const [q, setQ] = useState('');
  const list = INVERTER_DB.filter(
    (i) => !q || (i.brand + ' ' + i.model + ' ' + i.acKw).toLowerCase().includes(q.toLowerCase()),
  );
  const ratio = selected ? targetKwp / (selected.acKw * count) : null;

  return (
    <div className="card">
      {recommended && !selected && (
        <div
          className="banner-warn"
          role="button"
          tabIndex={0}
          style={{ borderRadius: 8, marginBottom: 12, cursor: 'pointer' }}
          onClick={() => {
            onSelect(recommended);
            onCount(recommendedCount);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            onSelect(recommended);
            onCount(recommendedCount);
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Lightbulb size={15} style={{ flex: 'none' }} aria-hidden />
            <span>
              Recommended: {recommended.brand} {recommended.model} ({recommended.acKw}kW
              {recommendedCount > 1 ? ` ×${recommendedCount}` : ''}, {recommended.phases}φ) →
              DC/AC {(targetKwp / (recommended.acKw * recommendedCount)).toFixed(2)} (tap to apply)
            </span>
          </span>
        </div>
      )}
      {selected && (
        <div className="card" style={{ background: 'var(--paper-2)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <b>{selected.brand}</b>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{selected.model}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
                {selected.mppt.count} MPPT · {selected.mppt.minV}–{selected.mppt.maxV}V ·{' '}
                {selected.phases}φ · η {selected.efficiencyPct}%
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{selected.acKw}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>kW</div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--line)',
              paddingTop: 10,
              marginTop: 10,
              fontSize: 13,
            }}
          >
            <span>No. of Inverters</span>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              aria-label="Number of inverters"
              style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, textAlign: 'right' }}
              onChange={(e) => onCount(Math.max(1, Number(e.target.value)))}
            />
          </div>
          {ratio !== null && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontWeight: 700,
                color: ratio > 1.35 || ratio < 0.9 ? 'var(--warn)' : 'var(--good)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {ratio > 1.35 || ratio < 0.9 ? (
                <AlertTriangle size={14} aria-hidden />
              ) : (
                <CheckCircle2 size={14} aria-hidden />
              )}
              DC/AC ratio: {ratio.toFixed(2)}{' '}
              {ratio > 1.35
                ? 'high (clipping risk)'
                : ratio < 0.9
                  ? 'low (oversized)'
                  : 'healthy (0.90–1.35)'}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', marginBottom: 10 }}>
        <SearchInput
          placeholder="Search inverters..."
          ariaLabel="Search inverters"
          value={q}
          onChange={setQ}
        />
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 8 }}>
        {list.length} inverters
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {list.map((i) => (
          <button
            key={i.id}
            onClick={() => onSelect(i)}
            aria-pressed={selected?.id === i.id}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              gap: 12,
              padding: '10px 8px',
              borderBottom: '1px solid var(--line)',
              textAlign: 'left',
              background: selected?.id === i.id ? '#eff4ff' : undefined,
              borderRadius: 8,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#05966922',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                flex: 'none',
              }}
            >
              {i.brand[0]}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {i.brand} {i.model}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>
                {i.acKw} kW · {i.phases}φ · {i.mppt.count} MPPT · {i.mppt.minV}–{i.mppt.maxV}V
              </span>
            </span>
            {recommended?.id === i.id && <span className="badge badge-good">RECOMMENDED</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
