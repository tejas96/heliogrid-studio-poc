import { BarChart3, FileText, RefreshCw, Sun, TrendingUp, Zap } from 'lucide-react';
import { Sheet } from './ui';
import type { Project } from '../types';
import { computeEnergyReport } from '../lib/solar';
import { computeFinancials } from '../lib/finance';
import { computeFinancing } from '../lib/financing';
import { isShadingFresh } from '../lib/fingerprints';
import { M2_TO_FT2, useUnits } from '../lib/units';
import { navigate } from '../router';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function EnergyReportSheet({
  onClose,
  project,
  readOnly = false,
}: {
  onClose: () => void;
  project: Project;
  readOnly?: boolean;
}) {
  const r = computeEnergyReport(project);
  const fin = computeFinancials(project, r);
  const { units, areaUnit } = useUnits();
  const shadingFresh = isShadingFresh(project);
  const roofArea =
    units === 'imperial' ? Math.round(r.roofAreaM2 * M2_TO_FT2) : r.roofAreaM2;
  const maxMonth = Math.max(...r.monthlyKwh, 1);

  return (
    <Sheet title="Energy Report" icon={<BarChart3 />} onClose={onClose}>
      {!shadingFresh && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fffbeb',
            border: '1px solid #f59e0b',
            color: '#92400e',
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 12,
            marginBottom: 14,
          }}
        >
          <RefreshCw size={14} aria-hidden className="spin" />
          Recalculating shading for the latest edits — energy and solar-access numbers below
          are provisional and will refresh in a moment.
        </div>
      )}
      <SectionLabel>SYSTEM SUMMARY</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
        <Stat label="Capacity" value={String(r.capacityKwp)} unit="kWp" />
        <Stat label="Panels" value={String(r.panelCount)} unit={`${project.components.panel?.watt ?? 0}W`} />
        <Stat label="Roof Area" value={String(roofArea)} unit={areaUnit} />
      </div>

      <SectionLabel>ANNUAL GENERATION</SectionLabel>
      <div
        style={{
          background: 'linear-gradient(120deg,#1d4ed8,#2563eb)',
          color: '#fff',
          borderRadius: 12,
          padding: 18,
          marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 800 }}>{r.annualMwh} MWh</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>per year (Year 1)</div>
        <div style={{ display: 'flex', gap: 26, marginTop: 12, fontSize: 12 }}>
          <div>
            <div style={{ opacity: 0.75 }}>Specific Yield</div>
            <b>{r.specificYield.toLocaleString()} kWh/kWp</b>
          </div>
          <div>
            <div style={{ opacity: 0.75 }}>Performance Ratio</div>
            <b>{r.performanceRatio}%</b>
          </div>
          <div>
            <div style={{ opacity: 0.75 }}>Tilt/Azimuth (POA)</div>
            <b>×{r.poaFactor}</b>
          </div>
        </div>
        {/* how sure: the figure above is the P50; a bank reads the P90 */}
        {r.uncertainty && (
          <div style={{ marginTop: 10, fontSize: 11.5, opacity: 0.9, lineHeight: 1.4 }}>
            <b>P90 {Math.round(r.uncertainty.p90Kwh / 100) / 10} MWh</b> — nine years in ten beat this · P99{' '}
            {Math.round(r.uncertainty.p99Kwh / 100) / 10} MWh · one sigma {r.uncertainty.sigmaPct}% = years ±
            {r.uncertainty.interannualPct}%{' '}
            {r.uncertainty.yearsOfRecord > 0 ? `(${r.uncertainty.yearsOfRecord}-yr record)` : '(assumed — record not kept yet)'} ⊕
            model ±{r.uncertainty.modelPct}% (assumed until the PVsyst comparison)
          </div>
        )}
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 8 }}>
          {/* provenance follows the ACTUAL numbers (r.irradianceSource), not the
              persisted dataSource string — which can read 'PVGIS' on a rehydrated
              project whose weather was rejected/stale and fell back to estimate */}
          {r.engine === 'hourly' && r.hourly
            ? `Hourly engine — PVGIS typical year (${r.hourly.radiationDb}${
                r.hourly.yearMin && r.hourly.yearMax ? ` ${r.hourly.yearMin}–${r.hourly.yearMax}` : ''
              }), 8760 hours × every module: Perez sky, shade by the hour, module temperature, inverter curve and clipping · ` +
              `${r.hourly.ghiKwhM2} kWh/m² horizontal → ${r.hourly.poaKwhM2} kWh/m² in plane` +
              (r.hourly.rearGainPct ? ` (+ ${r.hourly.rearKwhM2} kWh/m² on the backs)` : '') +
              (r.hourly.clippingHours > 0 ? ` · clipping ${r.hourly.clippingHours} h/yr (${r.hourly.clippedKwh} kWh)` : '') +
              ` · assumed: ${r.hourly.assumed.join('; ')}`
            : r.irradianceSource === 'PVGIS'
              ? `Real irradiance — PVGIS ${project.location?.weather?.raddatabase ?? '(measured)'}${
                  project.location?.weather?.yearsOfRecord
                    ? ` (${project.location.weather.yearsOfRecord}-yr record)`
                    : ''
                } · monthly estimate until the typical year loads · POA = beam-weighted plane-of-array estimate`
              : 'Built-in irradiance model (latitude fit, ±10%) · POA = beam-weighted plane-of-array estimate'}{' '}
          · shading auto-updates on edits
        </div>
      </div>

      <SectionLabel>MONTHLY GENERATION</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110, marginBottom: 6 }}>
        {r.monthlyKwh.map((kwh, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div
              title={`${kwh.toLocaleString()} kWh`}
              style={{
                width: '100%',
                height: `${(kwh / maxMonth) * 90}px`,
                borderRadius: '4px 4px 0 0',
                background: r.monsoonMonths.includes(i) ? '#f59e0b' : '#2563eb',
              }}
            />
            <span style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>{MONTHS[i]}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-3)', marginBottom: 18, justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: '#2563eb' }} /> Regular
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: '#f59e0b' }} /> Monsoon
        </span>
      </div>

      <SectionLabel>LOSSES BREAKDOWN</SectionLabel>
      <div style={{ marginBottom: 6 }}>
        {/* The back of a bifacial module GIVES: it belongs above the losses, as
            its own step, not buried as a negative loss. Shown only when the
            modules actually have a rear yield — a mono-facial design says
            nothing about bifaciality at all. */}
        {!!r.hourly?.rearGainPct && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 86, fontSize: 11.5, color: 'var(--ink-2)' }}>
              Bifacial gain (rear side)
            </span>
            <div style={{ flex: 1, height: 7, background: 'var(--paper-3)', borderRadius: 999 }}>
              <div
                style={{
                  width: `${Math.min(100, (r.hourly.rearGainPct / 12) * 100)}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: '#10b981',
                }}
              />
            </div>
            <b style={{ fontSize: 11.5, width: 40, textAlign: 'right', color: '#10b981' }}>
              +{r.hourly.rearGainPct}%
            </b>
          </div>
        )}
        {r.losses.map((l) => (
          <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ width: 86, fontSize: 11.5, color: 'var(--ink-2)' }}>{l.label}</span>
            <div style={{ flex: 1, height: 7, background: 'var(--paper-3)', borderRadius: 999 }}>
              <div
                style={{
                  width: `${Math.min(100, (l.pct / 12) * 100)}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: ['#f59e0b', '#84cc16', '#3b82f6', '#ec4899', '#a855f7', '#ef4444'][
                    r.losses.indexOf(l) % 6
                  ],
                }}
              />
            </div>
            <b style={{ fontSize: 11.5, width: 40, textAlign: 'right' }}>{l.pct}%</b>
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--line)',
            paddingTop: 8,
            marginTop: 8,
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          Total System Loss <span>{r.totalLossPct}%</span>
        </div>
      </div>

      <SectionLabel>SOLAR ACCESS</SectionLabel>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sun size={20} color="var(--brand)" aria-hidden /> {r.avgSolarAccessPct}%
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            Beam access (3D raycast) + diffuse floor — same metric as the heatmap
          </div>
        </div>
        <TrendingUp size={20} color="var(--good)" aria-hidden />
      </div>

      <SectionLabel>25-YEAR PROJECTION</SectionLabel>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Lifetime Generation</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{r.lifetimeMwh25} MWh</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Year 25 Output</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{r.year25Mwh} MWh</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
            ({Math.round((r.year25Mwh / Math.max(0.01, r.annualMwh)) * 100)}% of Year 1)
          </div>
        </div>
      </div>

      <SectionLabel>FINANCIALS (improvement)</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
        <Stat label="Net Cost" value={`₹${(fin.netCostInr / 1000).toFixed(0)}k`} unit={`after ₹${(fin.subsidyInr / 1000).toFixed(0)}k subsidy`} />
        <Stat label="Yearly Savings" value={`₹${(fin.annualSavingsInr / 1000).toFixed(0)}k`} unit={`@₹${project.info.tariffInrPerKwh}/kWh`} />
        <Stat label="Payback" value={fin.paybackYears.toFixed(1)} unit="years" />
      </div>

      {fin.systemCostInr > 0 && (
        <>
          <SectionLabel>FINANCING OPTIONS</SectionLabel>
          <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
            {computeFinancing(fin, r.annualMwh * 1000, project.info.tariffInrPerKwh).options.map((o) => (
              <div
                key={o.mode}
                className="card"
                style={{ padding: '9px 12px', background: 'var(--paper-2)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <b style={{ fontSize: 13 }}>{o.label}</b>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{o.headline}</span>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>
                  {o.note}
                  {o.monthlyInr > 0 && (
                    <>
                      {' · '}
                      <span style={{ color: o.firstYearNetInr >= 0 ? 'var(--good)' : 'var(--warn)' }}>
                        yr-1 net {o.firstYearNetInr >= 0 ? '+' : '−'}₹
                        {Math.abs(Math.round(o.firstYearNetInr / 1000))}k
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: -10, marginBottom: 14 }}>
            Representative terms — every option finances the same ₹
            {Math.round(fin.systemCostInr / 1000)}k system; confirm actual lender / PPA offers.
          </div>
        </>
      )}

      {!readOnly && (
        <>
          <button className="btn btn-primary btn-block" onClick={() => navigate('/wizard/7')}>
            <FileText size={15} /> Customize Proposal
          </button>
          <button
            className="btn btn-secondary btn-block"
            style={{ marginTop: 8 }}
            onClick={() => navigate('/proposal')}
          >
            <Zap size={15} /> Quick Generate
          </button>
        </>
      )}
    </Sheet>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: 'var(--ink-3)', margin: '4px 0 8px' }}>
      {children}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, margin: '2px 0' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{unit}</div>
    </div>
  );
}
