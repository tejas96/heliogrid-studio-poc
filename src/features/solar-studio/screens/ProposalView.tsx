import { useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Camera, Link2, Printer, RefreshCw } from 'lucide-react';
import { useActiveProject } from '../store/store';
import { navigate } from '../router';
import { computeEnergyReport } from '../lib/solar';
import { computeFinancials } from '../lib/finance';
import { computeFinancing } from '../lib/financing';
import { mergedBom, bomMoney } from '../lib/bom';
import { effectiveSld } from '../lib/sld';
import { proposalNarrative } from '../lib/proposal-narrative';
import {
  engineeringStatus,
  projectStructures,
  STRUCTURE_DISCLAIMER,
  windZoneInfo,
} from '../lib/structure';
import { capturesFresh, isShadingFresh } from '../lib/fingerprints';
import { BlobImg } from '../components/BlobImg';
import { useUnits } from '../lib/units';
import { DEFAULT_MARGIN_PCT } from '../data/pricebook';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A real scannable QR of `url`, rendered as inline SVG (self-contained, prints
 *  crisply, no external service). qrcode's callback is synchronous for SVG. */
function QrCode({ url, size }: { url: string; size: number }) {
  const svg = useMemo(() => {
    let out = '';
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }, (err, s) => {
      if (!err) out = s;
    });
    return out;
  }, [url]);
  if (!svg) return null;
  return (
    <div
      aria-label="Scan to open the 3D model"
      style={{ width: size, height: size, flex: 'none' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** Printable web proposal — use the browser's Print → Save as PDF. */
export function ProposalView() {
  const project = useActiveProject()!;
  const r = computeEnergyReport(project);
  const fin = computeFinancials(project, r);
  const bom = mergedBom(project);
  // the same money path Step 9 reads — the two documents cannot disagree
  const money = bomMoney(bom, project);
  // Four ways to buy the SAME system — derived from the one quote total, using
  // the SAME annual saving the report shows, so PPA savings reconcile exactly.
  const financing =
    fin.systemCostInr > 0
      ? computeFinancing(fin, r.annualMwh * 1000, project.info.tariffInrPerKwh)
      : null;
  const { fmtArea } = useUnits();
  // Customer vs engineering doc (plan §31). A customer must NEVER see the
  // installer's subtotal or margin %; they see the ONE final price (systemCost,
  // which already has margin baked in — the single money path). The engineering
  // doc shows how that price is built. Defaults to customer — the safe leak.
  const [audience, setAudience] = useState<'customer' | 'engineering'>('customer');
  // optional electrical page (plan §31). Off by default — many customer docs
  // don't need it; banks and DISCOMs do. Only offered when strings exist.
  const [includeSld, setIncludeSld] = useState(false);
  const sld = effectiveSld(project);
  const canSld = !!sld && project.strings.length > 0;
  const narrative = proposalNarrative(project, fmtArea);
  // Path route — see Step10Done note; works on this device only until a share
  // backend exists.
  const shareUrl = `${location.origin}/share/${project.shareId}`;
  const maxMonth = Math.max(...r.monthlyKwh, 1);
  const shadingFresh = isShadingFresh(project);
  const imagesFresh = capturesFresh(project);

  return (
    <div style={{ background: 'var(--paper-2)', minHeight: '100vh' }}>
      {/* staleness gate: the proposal must reflect the CURRENT design (soft block) */}
      {(!shadingFresh || !imagesFresh) && (
        <div
          className="no-print"
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: 'center',
            background: '#fffbeb',
            borderBottom: '1px solid #f59e0b',
            color: '#92400e',
            padding: '9px 20px',
            fontSize: 12.5,
          }}
        >
          {!shadingFresh ? (
            <>
              <RefreshCw size={14} aria-hidden className="spin" />
              Shading is recalculating after recent edits — wait a moment before printing so
              the energy numbers reflect the final design.
            </>
          ) : (
            <>
              <Camera size={14} aria-hidden />
              The design changed after the 3D images were captured — the pictures no longer
              match the numbers.
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 10px', fontSize: 12 }}
                onClick={() => navigate('/wizard/7')}
              >
                Retake captures
              </button>
            </>
          )}
        </div>
      )}
      {/* toolbar (hidden in print) */}
      <div
        className="no-print"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-between',
          padding: '10px 20px',
          background: 'var(--paper)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <button className="btn btn-ghost" onClick={() => navigate('/wizard/7')}>
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setAudience((a: 'customer' | 'engineering') => (a === 'customer' ? 'engineering' : 'customer'))}
            title="Customer doc hides your subtotal & margin; engineering doc shows the full breakdown"
          >
            {audience === 'customer' ? 'Customer doc' : 'Engineering doc'}
          </button>
          {canSld && (
            <button
              className={`btn ${includeSld ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setIncludeSld((v) => !v)}
              title="Add an electrical single-line-diagram page (for banks / DISCOM)"
            >
              {includeSld ? 'SLD page: on' : 'Add SLD page'}
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => navigator.clipboard.writeText(shareUrl)}
          >
            <Link2 size={15} /> Copy 3D link
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={15} /> Print / Save PDF
          </button>
        </div>
      </div>

      <style>{`@media print {
        /* keep card/hero backgrounds — otherwise the white hero text prints white-on-white */
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        @page { size: A4; margin: 10mm; }
        .no-print { display: none !important; }
        .page { box-shadow: none !important; margin: 0 auto !important; page-break-after: always; }
        .page img, .page table, .page .card { break-inside: avoid; }
        body { background: #fff; }
      }`}</style>

      <div style={{ maxWidth: 820, margin: '20px auto 60px', display: 'flex', flexDirection: 'column', gap: 20, padding: '0 14px' }}>
        {/* PAGE 1 — cover + 3D model */}
        <Page num={1} project={project}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>
                {r.capacityKwp}kW On-grid Solar Proposal
              </div>
              <div style={{ color: 'var(--ink-3)', marginTop: 4, fontSize: 13 }}>
                Prepared for <b>{project.info.customerName || 'Customer'}</b> ·{' '}
                {project.location?.address}
              </div>
            </div>
            {project.info.logoDataUrl && (
              <img src={project.info.logoDataUrl} alt="logo" style={{ maxHeight: 46 }} />
            )}
          </div>
          {project.coverImageBlobId && (
            <BlobImg
              blobId={project.coverImageBlobId}
              alt="3D design"
              placeholderHeight={260}
              style={{ width: '100%', borderRadius: 12, margin: '18px 0' }}
            />
          )}
          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              border: '1px solid var(--line)',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 14 }}>3D DESIGN MODEL</b>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', margin: '4px 0' }}>
                Explore an interactive 3D model of your solar rooftop with panel layout and
                shadow simulation.
              </div>
              <a href={shareUrl} style={{ fontSize: 12, fontWeight: 700 }}>
                {shareUrl}
              </a>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>
                Viewable on the device this design was created on.
              </div>
            </div>
            {/* real, scannable QR of the SAME share URL — prints on paper where a
                text link is useless (plan §31: real QR from a fixed URL) */}
            <QrCode url={shareUrl} size={96} />
          </div>
        </Page>

        {/* PAGE — the story, in the customer's language, from real data only */}
        {narrative.length > 0 && (
          <Page num={2} project={project}>
            <PageTitle>YOUR SOLAR STORY</PageTitle>
            {narrative.map((section) => (
              <div key={section.title} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{section.title}</div>
                {section.beats.map((b, i) => (
                  <div key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', marginBottom: 3 }}>
                    {b.text}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 8 }}>
              Every figure above is drawn directly from your design — nothing is estimated beyond the
              labelled climate and cost assumptions.
            </div>
          </Page>
        )}

        {/* PAGE — shadow analysis */}
        <Page num={2} project={project}>
          <PageTitle>SHADOW ANALYSIS</PageTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {project.captures
              .filter((c) => c.imageBlobId)
              .map((c) => (
                <div key={c.id}>
                  <BlobImg
                    blobId={c.imageBlobId}
                    alt={c.label}
                    placeholderHeight={180}
                    style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)' }}
                  />
                  <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, marginTop: 4 }}>
                    {c.label}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--ink-3)' }}>
                    {c.hour}:00 · {new Date(c.dateIso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              ))}
            {project.captures.filter((c) => c.imageBlobId).length === 0 && (
              <div style={{ gridColumn: '1/-1', color: 'var(--ink-3)', fontSize: 13 }}>
                No shadow captures — go back to Step 7 to capture them.
              </div>
            )}
          </div>
        </Page>

        {/* PAGE 3 — energy report */}
        <Page num={3} project={project}>
          <PageTitle>ENERGY REPORT</PageTitle>
          <div
            style={{
              background: 'linear-gradient(120deg,#1d4ed8,#2563eb)',
              color: '#fff',
              borderRadius: 12,
              padding: 18,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 800 }}>{r.annualMwh} MWh</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>per year (Year 1)</div>
            <div style={{ display: 'flex', gap: 26, marginTop: 10, fontSize: 12 }}>
              <span>
                Specific Yield <b>{r.specificYield.toLocaleString()} kWh/kWp</b>
              </span>
              <span>
                Performance Ratio <b>{r.performanceRatio}%</b>
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, marginBottom: 4 }}>
            {r.monthlyKwh.map((kwh, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div
                  style={{
                    height: `${(kwh / maxMonth) * 82}px`,
                    borderRadius: '3px 3px 0 0',
                    background: r.monsoonMonths.includes(i) ? '#f59e0b' : '#2563eb',
                  }}
                />
                <span style={{ fontSize: 8.5, color: 'var(--ink-3)' }}>{MONTHS[i]}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: 'var(--ink-3)', marginBottom: 4 }}>
            {r.irradianceSource === 'PVGIS'
              ? 'Monthly shape from measured PVGIS climate (real monsoon variation).'
              : 'Monthly shape from built-in seasonal model (estimate, ±10%).'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
            <div>
              <b style={{ fontSize: 12.5 }}>LOSSES BREAKDOWN</b>
              {r.losses.map((l) => (
                <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '3px 0' }}>
                  <span style={{ color: 'var(--ink-3)' }}>{l.label}</span>
                  <b>{l.pct}%</b>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 800, borderTop: '1px solid var(--line)', paddingTop: 4, marginTop: 4 }}>
                Total System Loss <span>{r.totalLossPct}%</span>
              </div>
            </div>
            <div>
              <b style={{ fontSize: 12.5 }}>SYSTEM SUMMARY</b>
              <KV k="Capacity" v={`${r.capacityKwp} kWp`} />
              <KV k="Panels" v={`${r.panelCount} (${project.components.panel?.watt}W)`} />
              <KV k="Roof Area" v={fmtArea(r.roofAreaM2)} />
              <KV k="Solar Access" v={`${r.avgSolarAccessPct}%`} />
              <KV k="25-yr Generation" v={`${r.lifetimeMwh25} MWh`} />
              <KV k="Year 25 Output" v={`${r.year25Mwh} MWh (${Math.round((r.year25Mwh / Math.max(0.01, r.annualMwh)) * 100)}% of Y1)`} />
            </div>
          </div>
        </Page>

        {/* PAGE 4 — pricing & savings (improvement over reference) */}
        <Page num={4} project={project}>
          <PageTitle>INVESTMENT & SAVINGS</PageTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
            <Big label="System Cost" value={`₹${fin.systemCostInr.toLocaleString('en-IN')}`} />
            <Big label="Govt. Subsidy" value={`− ₹${fin.subsidyInr.toLocaleString('en-IN')}`} accent="var(--good)" />
            <Big label="Net Investment" value={`₹${fin.netCostInr.toLocaleString('en-IN')}`} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <Big label="Annual Savings" value={`₹${fin.annualSavingsInr.toLocaleString('en-IN')}`} />
            <Big label="Payback" value={`${fin.paybackYears} yrs`} />
            <Big label="25-yr Savings" value={`₹${Math.round(fin.savings25YrInr / 100000)} L`} accent="var(--good)" />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 18 }}>
            Assumes tariff ₹{project.info.tariffInrPerKwh}/kWh escalating {fin.tariffEscalationPct}%/yr ·
            Subsidy per PM Surya Ghar slab (residential, DCR modules; ₹78,000 cap from 3 kW).
          </div>

          {/* HOW TO PAY (task 31d) — four ways to buy the SAME system. Every row
              is derived from the one quote total, so no financing view can
              disagree with the BOM. Replaces the old hard-coded EMI line, which
              quoted a loan on the FULL net cost while the model assumes a down
              payment — two different numbers for one thing. */}
          {financing && (
            <>
              <PageTitle>HOW TO PAY</PageTitle>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 8 }}>
                <thead>
                  <tr style={{ background: 'var(--paper-2)' }}>
                    {['Option', 'Upfront', 'Monthly', 'Year-1 net', 'Over the term'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {financing.options.map((o) => (
                    <tr key={o.mode}>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)', fontWeight: 700 }}>
                        {o.label}
                      </td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)' }}>
                        ₹{o.upfrontInr.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)' }}>
                        {o.monthlyInr > 0 ? `₹${o.monthlyInr.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)', color: o.firstYearNetInr >= 0 ? 'var(--good)' : 'var(--ink-2)' }}>
                        {o.firstYearNetInr >= 0 ? '+' : '−'}₹{Math.abs(o.firstYearNetInr).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)' }}>
                        ₹{o.lifetimeCostInr.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginBottom: 18 }}>
                Representative terms — every option finances the same ₹
                {financing.systemCostInr.toLocaleString('en-IN')} system. Confirm actual lender / PPA
                offers before signing.
              </div>
            </>
          )}
          {projectStructures(project).length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 18, borderLeft: '3px solid var(--warn)', paddingLeft: 8 }}>
              <b>Mounting structure — {engineeringStatus(project).label}.</b>{' '}
              {STRUCTURE_DISCLAIMER}
              {windZoneInfo(project.info.state).high && <> {windZoneInfo(project.info.state).label}.</>}
              {engineeringStatus(project).approved && engineeringStatus(project).notes && (
                <> Engineer notes: {engineeringStatus(project).notes}</>
              )}
            </div>
          )}
          <PageTitle>BILL OF MATERIALS (summary)</PageTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--paper-2)' }}>
                {['Item', 'Spec', 'Qty', 'Unit'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--line)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bom.map((l) => (
                <tr key={l.id}>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)' }}>{l.item}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)', color: 'var(--ink-3)' }}>{l.spec}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)' }}>{l.qty}</td>
                  <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)' }}>{l.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', fontSize: 12.5, fontWeight: 800, marginTop: 8 }}>
            {audience === 'engineering' ? (
              // The FULL chain, because the short version was arithmetically
              // false. It printed "subtotal + margin = systemCost" — true until
              // Phase 22d made GST per-line, after which the stated sum was
              // short by exactly the tax (₹15,690 on the 8-panel fixture). An
              // engineering document that prints an equation which does not
              // hold is worse than one that prints no breakdown at all.
              <>
                Cost ₹{money.subtotal.toLocaleString('en-IN')} +{' '}
                {project.pricing?.marginPct ?? DEFAULT_MARGIN_PCT}% margin ={' '}
                {money.discount > 0 && (
                  // The discount belongs IN the chain, not beside it. Without
                  // this term the line reads "cost + margin = taxable" while
                  // `taxable` is the POST-discount figure — an equation that
                  // does not hold, which is the exact failure the note above
                  // was written about.
                  <>
                    ₹{money.taxableBeforeDiscount.toLocaleString('en-IN')} − discount ₹
                    {money.discount.toLocaleString('en-IN')} ={' '}
                  </>
                )}
                taxable ₹{money.taxable.toLocaleString('en-IN')} + GST ₹
                {money.gst.toLocaleString('en-IN')} = ₹
                {fin.systemCostInr.toLocaleString('en-IN')}
              </>
            ) : (
              // customer: the ONE final price, margin baked in — never the breakdown
              <>System Cost ₹{fin.systemCostInr.toLocaleString('en-IN')}</>
            )}
          </div>
        </Page>

        {/* OPTIONAL — electrical single-line summary. Reads the SAME effectiveSld
            as the Step-8 sheet, so the proposal and the SLD sheet can never
            print two different ratings. */}
        {includeSld && sld && (
          <Page num={4} project={project}>
            <PageTitle>ELECTRICAL — SINGLE LINE SUMMARY</PageTitle>
            <div
              style={{
                border: `1px solid ${sld.voltageWithinLimit ? 'var(--good)' : 'var(--bad)'}`,
                background: sld.voltageWithinLimit ? '#f0fdf4' : '#fef2f2',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 16,
                fontSize: 12.5,
                fontWeight: 700,
                color: sld.voltageWithinLimit ? '#15803d' : '#b91c1c',
              }}
            >
              Max system voltage {sld.maxSystemVdc} Vdc{' '}
              {sld.voltageWithinLimit ? '≤' : '>'} {sld.inverterMaxDcV} V inverter limit ·{' '}
              {sld.maxStringLength}-module string, cold Voc
              {sld.voltageWithinLimit ? '' : ' · OVER LIMIT'}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {[
                  ['Inverter', `${sld.inverterLabel}${sld.inverterCount > 1 ? ` × ${sld.inverterCount}` : ''}`],
                  ['AC rating', `${sld.acRatingKw} kW`],
                  ['DC string fuse', `${sld.dcFuseA} A`],
                  ['DC isolator', `${sld.dcIsolatorA} A`],
                  ['DC cable', `${sld.dcCableSizeMm2} mm² Cu`],
                  ['DC SPD', sld.dcSpdType],
                  ['AC MCCB', `${sld.mccbA} A`],
                  ['AC isolator', `${sld.acIsolatorA} A`],
                  ['AC cable', `${sld.acCableSizeMm2} mm² ${sld.acCableType}`],
                  ['AC SPD', sld.acSpdType],
                  ['Standard', sld.standard],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)', color: 'var(--ink-3)', width: '40%' }}>{k}</td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--paper-3)', fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 10 }}>
              Full single-line diagram available in the engineering pack (Step 8).
            </div>
          </Page>
        )}
      </div>
    </div>
  );
}

function Page({ children, num, project }: { children: React.ReactNode; num: number; project: ReturnType<typeof useActiveProject> }) {
  return (
    <div
      className="page"
      style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: 'var(--shadow-1)',
        padding: '34px 38px 50px',
        position: 'relative',
        minHeight: 640,
      }}
    >
      {children}
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: 38,
          right: 38,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--ink-3)',
          borderTop: '1px solid var(--line)',
          paddingTop: 8,
        }}
      >
        <span>{project?.info.name}</span>
        <span>PAGE {num} · Generated by Solar Studio</span>
      </div>
    </div>
  );
}

function PageTitle({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1, marginBottom: 14 }}>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '3px 0' }}>
      <span style={{ color: 'var(--ink-3)' }}>{k}</span>
      <b>{v}</b>
    </div>
  );
}

function Big({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: accent ?? 'var(--ink)' }}>{value}</div>
    </div>
  );
}
