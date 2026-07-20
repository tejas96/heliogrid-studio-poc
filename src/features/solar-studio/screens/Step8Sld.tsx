import { useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Cable, Download, Grid3x3, PencilLine, RotateCcw, Sparkles, Zap, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useActiveProject, useProjectPatch } from '../store/store';
import { Sheet, TitleBlock } from '../components/drawing';
import { StructureSheet } from '../components/drawing/StructureSheet';
import { engineeringStatus, STRUCTURE_DISCLAIMER, windZoneInfo } from '../lib/structure';
import { Dialog } from '../components/ui';
import type { Project, SldParams } from '../types';
import { deriveSldDefaults, diffSldOverrides, effectiveSld, acConductorLabels } from '../lib/sld';
import { combinerPlan } from '../lib/electrical/combiner';
import { resolveRules } from '../data/rules/india';
import { computeEnergyReport } from '../lib/solar';
import { panelCornersOnRoof } from '../lib/layout';
import { resolveDesignTemps } from '../lib/electrical/temps';
import { autoString } from '../lib/stringing';
import { layoutToDxf, dxfFileName } from '../lib/export-dxf';
import { navigate } from '../router';

type Tab = 'sld' | 'layout' | 'strings' | 'structure';

export function Step8Sld() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const [tab, setTab] = useState<Tab>('sld');
  const [showIntro, setShowIntro] = useState(!project.derived.sldIntroSeen);
  const [editRatings, setEditRatings] = useState(false);
  // 3-line form: some DISCOMs require every conductor shown, not the
  // single-line shorthand. Presentation only — the same derived model (30d).
  const [threeLine, setThreeLine] = useState(false);
  const svgHostRef = useRef<HTMLDivElement>(null);

  const hasStrings = project.strings.length > 0;
  // ALWAYS derived live from the current components, with the user's explicit
  // edits merged on top — a component change after the first visit now flows
  // straight onto the sheet instead of freezing at the first snapshot.
  const sld = effectiveSld(project)!;
  const overrideCount = Object.keys(project.derived.sldOverrides ?? {}).length;

  function exportSvg(kind: 'svg' | 'png') {
    const svg = svgHostRef.current?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    if (kind === 'svg') {
      download(`${tab}-${project.info.name}.svg`, 'image/svg+xml', xml);
    } else {
      const img = new Image();
      const blob = new Blob([xml], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width * 2;
        c.height = img.height * 2;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((png) => {
          if (png) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(png);
            a.download = `${tab}-${project.info.name}.png`;
            a.click();
          }
        });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--paper)',
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          {(
            [
              ['sld', 'SLD', <Zap key="sld" size={13} aria-hidden />],
              ['layout', 'PV Layout', <Grid3x3 key="layout" size={13} aria-hidden />],
              ['strings', 'String Route', <Cable key="strings" size={13} aria-hidden />],
              ['structure', 'Structure', <Grid3x3 key="structure" size={13} aria-hidden />],
            ] as [Tab, string, ReactNode][]
          ).map(([t, label, icon]) => (
            <button
              key={t}
              className={`chip ${tab === t ? 'on' : ''}`}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {icon} {label}
            </button>
          ))}
          {tab === 'sld' && (
            <button className="chip" onClick={() => setEditRatings(true)}>
              <PencilLine size={13} aria-hidden /> Edit Ratings
              {overrideCount > 0 && (
                <span
                  title={`${overrideCount} rating(s) manually edited — the rest stay auto-derived`}
                  style={{
                    background: '#7c3aed',
                    color: '#fff',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 800,
                    padding: '0 6px',
                    marginLeft: 4,
                  }}
                >
                  {overrideCount}
                </span>
              )}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(
            [
              ['pending', 'Pending verification'],
              ['engineer_approved', 'Engineer approved'],
            ] as const
          ).map(([status, label]) => (
            <button
              key={status}
              className={`chip ${(project.structuralVerification?.status ?? 'pending') === status ? 'on' : ''}`}
              title="Engineering sign-off is recorded by a HUMAN engineer — the app never calculates structural adequacy"
              onClick={() =>
                patch({
                  structuralVerification: {
                    status,
                    notes: project.structuralVerification?.notes ?? '',
                  },
                })
              }
            >
              {status === 'engineer_approved' ? <ShieldCheck size={13} aria-hidden /> : <ShieldAlert size={13} aria-hidden />}
              {label}
            </button>
          ))}
          {windZoneInfo(project.info.state).high && (
            <span
              className="badge badge-pro"
              title={windZoneInfo(project.info.state).label ?? undefined}
            >
              HIGH WIND
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            NTS · A2 Landscape · Scroll to zoom
          </span>
          {tab === 'sld' && (
            <button
              className={`chip ${threeLine ? 'on' : ''}`}
              aria-pressed={threeLine}
              title="Show every conductor (L/N/PE) instead of the single-line shorthand — required by some DISCOMs"
              onClick={() => setThreeLine((v) => !v)}
            >
              3-line
            </button>
          )}
          <button className="chip" onClick={() => exportSvg('svg')}>
            <Download size={13} aria-hidden /> SVG (CAD)
          </button>
          <button className="chip" onClick={() => exportSvg('png')}>
            <Download size={13} aria-hidden /> PNG
          </button>
          <button
            className="chip"
            title="Array layout as a true-metre DXF (layered: roofs, modules, obstructions, strings) — opens in any CAD"
            onClick={() =>
              download(dxfFileName(project), 'application/dxf', layoutToDxf(project))
            }
          >
            <Download size={13} aria-hidden /> DXF (layout)
          </button>
        </div>
      </div>

      {/* Print: A3 landscape, and ONLY the sheet (Phase 22o). Without this the
          browser prints the app chrome around the drawing at whatever the
          default paper is, which is not a drawing anyone can use. The plan's
          route is deliberately Save-as-PDF rather than a PDF library — zero
          dependency, and the ₹ glyph renders correctly. */}
      <style>{`
        @media print {
          @page { size: A3 landscape; margin: 8mm; }
          body * { visibility: hidden; }
          [data-sheet-host], [data-sheet-host] * { visibility: visible; }
          [data-sheet-host] {
            position: absolute; inset: 0;
            overflow: visible !important;
            background: #fff !important;
            padding: 0 !important;
          }
          [data-sheet-host] svg { width: 100% !important; min-width: 0 !important; border: none !important; }
        }
      `}</style>
      <div
        ref={svgHostRef}
        data-sheet-host
        style={{ flex: 1, overflow: 'auto', background: '#f0f1f3', padding: 18 }}
      >
        {tab === 'sld' && (hasStrings ? <SldSheet sld={sld} threeLine={threeLine} /> : <UnstrungState />)}
        {tab === 'layout' && <LayoutSheet />}
        {tab === 'strings' && (hasStrings ? <StringSheet /> : <UnstrungState />)}
        {/* Phase 22o: the structure has been modelled since 22a and priced
            throughout, and nothing printed it until now. */}
        {tab === 'structure' && <StructureSheet project={project} />}
      </div>

      {showIntro && (
        <Dialog
          title="Single Line Diagram"
          icon={<BookOpen size={18} />}
          actions={
            <button
              className="btn btn-primary"
              onClick={() => {
                patch({ derived: { ...project.derived, sldIntroSeen: true } });
                setShowIntro(false);
              }}
            >
              Got it
            </button>
          }
        >
          <p style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Required for DISCOM approval</p>
          <p>
            The SLD shows how all electrical components connect — from solar panels to the
            grid. It's auto-generated from your system configuration.
          </p>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
            <IntroRow color="#b91c1c" title="DC Side" text="Panels, cables, DCDB (fuses, SPD)" />
            <IntroRow color="#1d4ed8" title="Inverter" text="MPPT connections, model info" />
            <IntroRow color="#047857" title="AC Side" text="ACDB (MCB, SPD), meter, grid" />
            <IntroRow color="#b45309" title="Earthing" text="Module, structure, system" />
          </div>
        </Dialog>
      )}

      {editRatings && (
        <EditRatingsDialog
          sld={sld}
          derived={deriveSldDefaults(project)!}
          onClose={() => setEditRatings(false)}
          onSave={(s) => {
            // persist ONLY the fields that differ from the derived defaults —
            // untouched fields keep tracking component changes automatically
            patch({
              derived: {
                ...project.derived,
                sldOverrides: diffSldOverrides(s, deriveSldDefaults(project)),
              },
            });
            setEditRatings(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Shown instead of the SLD/String sheets when no strings exist. A drawing
 * fabricated from unstrung panels would show an electrically impossible
 * configuration (every panel in one series string), so we refuse to draw and
 * offer the fix instead.
 */
function UnstrungState() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const { panel, inverter, inverterCount } = project.components;
  const enabledCount = project.panels.filter((p) => p.enabled).length;
  const canAutoString = !!panel && !!inverter && enabledCount > 0;

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '80px auto',
        textAlign: 'center',
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        borderRadius: 14,
        padding: '36px 30px',
      }}
    >
      <Cable size={30} aria-hidden style={{ color: 'var(--ink-3)' }} />
      <h3 style={{ margin: '12px 0 6px', fontSize: 17 }}>No strings configured yet</h3>
      <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        The single line diagram is drawn from your actual string configuration. Group the panels
        into strings first — automatically, or by hand in the editor.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
        <button
          className="btn btn-primary"
          disabled={!canAutoString}
          onClick={() => {
            if (!panel || !inverter) return;
            const strings = autoString(
              project.panels,
              panel,
              inverter,
              inverterCount,
              resolveDesignTemps(project),
            );
            patch({ strings }, true);
          }}
        >
          <Sparkles size={15} aria-hidden /> Auto-string now
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/wizard/6')}>
          String manually in the editor
        </button>
      </div>
      {!canAutoString && (
        <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 10 }}>
          Select a panel and inverter (Step 4) and place at least one panel (Step 6) first.
        </p>
      )}
    </div>
  );
}

function IntroRow({ color, title, text }: { color: string; title: string; text: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span
        aria-hidden
        style={{ width: 9, height: 9, borderRadius: '50%', background: color, flex: 'none' }}
      />
      <span>
        <b>{title}:</b> {text}
      </span>
    </span>
  );
}

function download(name: string, mime: string, content: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
}

// ─── SLD sheet (parametric SVG) ─────────────────────────────────────────────

/** The disclaimer travels ON the exported drawing (plan §F gate). */
function drawingFootnote(project: Project): string {
  const wind = windZoneInfo(project.info.state);
  return (
    `${STRUCTURE_DISCLAIMER} ${engineeringStatus(project).label}.` +
    (wind.high ? ` ${wind.label}.` : '')
  );
}
const FOOT_Y = 632;

function SldSheet({ sld, threeLine = false }: { sld: SldParams; threeLine?: boolean }) {
  const project = useActiveProject()!;
  const spec = project.components.panel!;
  const inv = project.components.inverter!;
  // ── C&I central topology: strings collect in fused combiner boxes before the
  // DC bus (30e-draw). Drawn ONLY from the combiner model, never invented.
  const central = (project.components.inverterTopology ?? 'string') === 'central';
  const cPlan = central ? combinerPlan(project.strings, spec) : null;
  const showScb = !!cPlan?.ok;
  const busX = showScb ? 188 : 252; // where the string runs collect
  const acCond = acConductorLabels(inv.phases);
  const temps = resolveDesignTemps(project);
  const sldTempNote = `@ ${temps.minAmbientC}°C${temps.source === 'assumed' ? ' (assumed)' : ''}`;
  // Only REAL strings are ever drawn. The caller guarantees strings exist —
  // an unstrung design renders the UnstrungState instead of a fabricated
  // (electrically impossible) all-panels series string.
  const strings = project.strings;
  const r = computeEnergyReport(project);

  const H = 640;
  const W = 980;
  const stringYs = strings.map((_, i) => 120 + i * Math.min(90, 380 / strings.length));

  return (
    <Sheet>
      <text x={W / 2} y={30} textAnchor="middle" fontSize={15} fontWeight={800} fontFamily="monospace">
        {project.info.name.toUpperCase()} — {r.capacityKwp} kWp SOLAR PV SYSTEM · SINGLE LINE DIAGRAM
      </text>

      {/* strings */}
      {strings.map((s, i) => {
        const y = stringYs[i];
        return (
          <g key={s.id} fontFamily="monospace">
            {/* panel symbols */}
            {[0, 1, 2].map((k) => (
              <g key={k}>
                <rect x={40 + k * 34} y={y - 14} width={28} height={28} fill="none" stroke="#b91c1c" strokeWidth={1.2} />
                <line x1={40 + k * 34} y1={y + 14} x2={68 + k * 34} y2={y - 14} stroke="#b91c1c" strokeWidth={0.8} />
              </g>
            ))}
            <text x={40} y={y - 22} fontSize={9.5} fill="#b91c1c">
              {s.name} · {s.panelIds.length} × {spec.watt}Wp · {Math.round(s.panelIds.length * spec.vocV)}V
            </text>
            <line x1={142} y1={y} x2={busX} y2={y} stroke="#b91c1c" strokeWidth={1.4} />
            {!showScb && (
              <text x={160} y={y - 5} fontSize={8.5} fill="#555">
                {sld.dcCableSizeMm2} mm² Cu
              </text>
            )}
            {/* down the DC bus (into the combiner when central, else the DCDB) */}
            <line x1={busX} y1={y} x2={busX} y2={showScb ? 270 : 300} stroke="#b91c1c" strokeWidth={1.2} />
          </g>
        );
      })}

      {/* String combiner boxes — central / C&I topology only (task 30e-draw) */}
      {showScb && cPlan && (
        <g fontFamily="monospace">
          <rect x={150} y={270} width={76} height={70} fill="#fff" stroke="#b91c1c" strokeWidth={1.4} />
          <text x={188} y={287} textAnchor="middle" fontSize={9.5} fontWeight={700}>
            SCB × {cPlan.boxes.length}
          </text>
          <text x={188} y={301} textAnchor="middle" fontSize={7.5}>
            ≤{cPlan.boxes[0].inputCount}-in
          </text>
          <text x={188} y={313} textAnchor="middle" fontSize={7.5}>
            Fuse {cPlan.stringFuseA}A/str
          </text>
          <text x={188} y={325} textAnchor="middle" fontSize={7.5}>
            {cPlan.totalStrings} strings
          </text>
          <line x1={226} y1={305} x2={232} y2={305} stroke="#b91c1c" strokeWidth={1.6} />
        </g>
      )}

      {/* Cold-Voc max system voltage — the CEIG check. Sits over the DC bus,
          green when clear of the inverter limit, red (with the exceedance) when
          not. This is the number the whole "no impossible SLD" goal is about. */}
      <g fontFamily="monospace">
        <rect
          x={232}
          y={225}
          width={198}
          height={34}
          rx={4}
          fill={sld.voltageWithinLimit ? '#f0fdf4' : '#fef2f2'}
          stroke={sld.voltageWithinLimit ? '#16a34a' : '#dc2626'}
          strokeWidth={1.4}
        />
        <text x={331} y={240} textAnchor="middle" fontSize={9} fontWeight={800}
          fill={sld.voltageWithinLimit ? '#15803d' : '#b91c1c'}>
          MAX SYSTEM VOLTAGE {sld.maxSystemVdc} Vdc {sld.voltageWithinLimit ? '≤' : '>'}{' '}
          {sld.inverterMaxDcV} V
        </text>
        <text x={331} y={252} textAnchor="middle" fontSize={7.5} fill="#555">
          {sld.maxStringLength}-module string · cold Voc {sldTempNote}
          {sld.voltageWithinLimit ? '' : ' · OVER LIMIT — shorten the string'}
        </text>
      </g>

      {/* DCDB */}
      <g fontFamily="monospace">
        <rect x={232} y={270} width={110} height={70} fill="#fff" stroke="#111" strokeWidth={1.4} />
        <text x={287} y={287} textAnchor="middle" fontSize={10} fontWeight={700}>DCDB</text>
        <text x={287} y={301} textAnchor="middle" fontSize={8.5}>Fuse {sld.dcFuseA}A / str</text>
        <text x={287} y={313} textAnchor="middle" fontSize={8.5}>SPD {sld.dcSpdType}</text>
        <text x={287} y={325} textAnchor="middle" fontSize={8.5}>Isolator {sld.dcIsolatorA}A</text>
        <line x1={342} y1={305} x2={430} y2={305} stroke="#b91c1c" strokeWidth={1.6} />
      </g>

      {/* Inverter */}
      <g fontFamily="monospace">
        <rect x={430} y={265} width={130} height={80} fill="#eff6ff" stroke="#1d4ed8" strokeWidth={1.6} />
        <text x={495} y={285} textAnchor="middle" fontSize={10} fontWeight={800} fill="#1d4ed8">INVERTER</text>
        <text x={495} y={300} textAnchor="middle" fontSize={8.5}>{sld.inverterLabel.slice(0, 24)}</text>
        <text x={495} y={313} textAnchor="middle" fontSize={8.5}>{sld.acRatingKw} kW · {inv.phases}φ</text>
        <text x={495} y={326} textAnchor="middle" fontSize={8.5}>{inv.mppt.count} MPPT · {inv.mppt.minV}–{inv.mppt.maxV}V</text>
        {sld.inverterCount > 1 && (
          <text x={495} y={338} textAnchor="middle" fontSize={7.5} fontWeight={700} fill="#1d4ed8">
            × {sld.inverterCount} units
          </text>
        )}
        {threeLine ? (
          // 3-LINE: every conductor drawn and named. The count comes from the
          // phase rule in lib/sld.ts, so it can't drift from the inverter spec.
          <>
            {acCond.map((label, k) => {
              const yy = 305 - ((acCond.length - 1) / 2) * 5 + k * 5;
              return (
                <g key={label}>
                  <line x1={560} y1={yy} x2={648} y2={yy} stroke={label === 'PE' ? '#b45309' : '#047857'} strokeWidth={1.1} />
                  <text x={604} y={yy - 1.6} textAnchor="middle" fontSize={5} fill="#555">{label}</text>
                </g>
              );
            })}
            <text x={568} y={286} fontSize={8} fill="#555">
              {sld.acCableSizeMm2} mm² {sld.acCableType} · {acCond.length}-core
            </text>
          </>
        ) : (
          <>
            <line x1={560} y1={305} x2={648} y2={305} stroke="#047857" strokeWidth={1.6} />
            <text x={568} y={298} fontSize={8.5} fill="#555">{sld.acCableSizeMm2} mm² {sld.acCableType}</text>
          </>
        )}
      </g>

      {/* ACDB */}
      <g fontFamily="monospace">
        <rect x={648} y={270} width={104} height={70} fill="#fff" stroke="#111" strokeWidth={1.4} />
        <text x={700} y={287} textAnchor="middle" fontSize={10} fontWeight={700}>ACDB</text>
        <text x={700} y={301} textAnchor="middle" fontSize={8.5}>MCCB {sld.mccbA}A</text>
        <text x={700} y={313} textAnchor="middle" fontSize={8.5}>SPD {sld.acSpdType}</text>
        <text x={700} y={325} textAnchor="middle" fontSize={8.5}>Isolator {sld.acIsolatorA}A</text>
        <line x1={752} y1={305} x2={800} y2={305} stroke="#047857" strokeWidth={1.6} />
      </g>

      {/* meters + grid */}
      <g fontFamily="monospace">
        <circle cx={815} cy={305} r={15} fill="none" stroke="#111" strokeWidth={1.4} />
        <text x={815} y={309} textAnchor="middle" fontSize={8.5} fontWeight={700}>GM</text>
        <line x1={830} y1={305} x2={862} y2={305} stroke="#047857" strokeWidth={1.6} />
        <circle cx={877} cy={305} r={15} fill="none" stroke="#111" strokeWidth={1.4} />
        <text x={877} y={309} textAnchor="middle" fontSize={8.5} fontWeight={700}>NM</text>
        <line x1={892} y1={305} x2={920} y2={305} stroke="#047857" strokeWidth={1.6} />
        <path d={`M 920 290 L 950 290 L 935 270 Z`} fill="none" stroke="#111" strokeWidth={1.2} />
        <line x1={920} y1={305} x2={920} y2={290} stroke="#047857" strokeWidth={1.4} />
        <text x={935} y={262} textAnchor="middle" fontSize={8.5}>GRID</text>
        <text x={877} y={335} textAnchor="middle" fontSize={7.5} fill="#555">NET METER</text>
        <text x={815} y={335} textAnchor="middle" fontSize={7.5} fill="#555">GEN METER</text>
      </g>

      {/* earthing */}
      <g stroke="#b45309" strokeWidth={1.2} fontFamily="monospace">
        <line x1={287} y1={340} x2={287} y2={385} />
        <line x1={495} y1={345} x2={495} y2={385} />
        <line x1={700} y1={340} x2={700} y2={385} />
        {[287, 495, 700].map((x) => (
          <g key={x}>
            <line x1={x - 12} y1={385} x2={x + 12} y2={385} />
            <line x1={x - 8} y1={390} x2={x + 8} y2={390} />
            <line x1={x - 4} y1={395} x2={x + 4} y2={395} />
          </g>
        ))}
        <text x={495} y={412} textAnchor="middle" fontSize={8.5} fill="#b45309" stroke="none">
          EARTHING — DC / INVERTER / AC (3 pits, {sld.standard})
        </text>
      </g>

      {/* string / MPPT schedule table */}
      <g fontFamily="monospace" fontSize={8.5}>
        <rect x={30} y={440} width={400} height={20 + strings.length * 16} fill="none" stroke="#111" strokeWidth={1} />
        <text x={38} y={454} fontWeight={800}>STRING / MPPT SCHEDULE</text>
        <line x1={30} y1={460} x2={430} y2={460} stroke="#111" strokeWidth={0.8} />
        {strings.map((s, i) => (
          <text key={s.id} x={38} y={474 + i * 16}>
            {s.name} → INV {s.inverterIndex + 1} · MPPT {s.mpptIndex + 1} · {s.panelIds.length} panels ·{' '}
            {Math.round(s.panelIds.length * spec.vocV)}V · {spec.impA}A
          </text>
        ))}
      </g>

      {/* plant details table */}
      <g fontFamily="monospace" fontSize={8.5}>
        <rect x={460} y={440} width={250} height={116} fill="none" stroke="#111" strokeWidth={1} />
        <text x={468} y={454} fontWeight={800}>PLANT DETAILS</text>
        <line x1={460} y1={460} x2={710} y2={460} stroke="#111" strokeWidth={0.8} />
        {[
          `DC Capacity: ${r.capacityKwp} kWp`,
          `AC Capacity: ${sld.acRatingKw} kW`,
          `Modules: ${r.panelCount} × ${spec.watt}Wp ${spec.tech}`,
          `Annual Gen: ${r.annualMwh} MWh · PR ${r.performanceRatio}%`,
          `DISCOM: ${project.info.discom || '—'} (${project.info.connectionType === 'three' ? '3φ' : '1φ'})`,
          `Standard: ${sld.standard}`,
        ].map((t, i) => (
          <text key={i} x={468} y={474 + i * 14}>{t}</text>
        ))}
      </g>

      {/* title block */}
      <g fontFamily="monospace" fontSize={8.5}>
        <rect x={730} y={440} width={220} height={116} fill="none" stroke="#111" strokeWidth={1} />
        {[
          ['PROJECT', project.info.name],
          ['CLIENT', project.info.customerName || '—'],
          ['DRAWING', 'SINGLE LINE DIAGRAM'],
          ['SHEET', 'SLD-01 · NTS · A2'],
          ['DATE', new Date().toLocaleDateString('en-IN')],
          ['BY', 'Solar Studio (auto)'],
        ].map(([k, v], i) => (
          <text key={k} x={738} y={456 + i * 16}>
            <tspan fontWeight={800}>{k}: </tspan>
            {String(v).slice(0, 26)}
          </text>
        ))}
      </g>
      <text x={12} y={FOOT_Y} fontSize={9} fill="#666">
        {drawingFootnote(project)}
      </text>
    </Sheet>
  );
}

// ─── PV Layout sheet ────────────────────────────────────────────────────────

function useLayoutTransform() {
  const project = useActiveProject()!;
  return useMemo(() => {
    const pts = project.roofs.flatMap((r) => r.polygon);
    if (pts.length === 0) return null;
    const minX = Math.min(...pts.map((p) => p.x)) - 3;
    const maxX = Math.max(...pts.map((p) => p.x)) + 3;
    const minY = Math.min(...pts.map((p) => p.y)) - 3;
    const maxY = Math.max(...pts.map((p) => p.y)) + 3;
    const scale = Math.min(560 / (maxX - minX), 420 / (maxY - minY));
    return {
      toPx: (p: { x: number; y: number }) => ({
        x: 40 + (p.x - minX) * scale,
        y: 60 + (maxY - p.y) * scale,
      }),
      scale,
    };
  }, [project.roofs]);
}

function LayoutSheet() {
  const project = useActiveProject()!;
  const spec = project.components.panel!;
  const t = useLayoutTransform();
  const r = computeEnergyReport(project);
  if (!t) return null;

  return (
    <Sheet>
      <text x={490} y={32} textAnchor="middle" fontSize={15} fontWeight={800} fontFamily="monospace">
        ROOFTOP PV ARRAY LAYOUT · SCALE 1:{Math.round(100 / t.scale) * 10} · SHEET 1 OF 2
      </text>

      {/* roofs */}
      {project.roofs.map((roof) => {
        const d =
          roof.polygon
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${t.toPx(p).x} ${t.toPx(p).y}`)
            .join(' ') + ' Z';
        return (
          <g key={roof.id}>
            <path d={d} fill="none" stroke="#111" strokeWidth={1.6} />
            {roof.polygon.map((p, i) => {
              const q = roof.polygon[(i + 1) % roof.polygon.length];
              const mid = t.toPx({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
              const len = Math.hypot(q.x - p.x, q.y - p.y);
              return (
                <text key={i} x={mid.x} y={mid.y - 4} textAnchor="middle" fontSize={8} fill="#b91c1c" fontFamily="monospace">
                  {len.toFixed(2)}m
                </text>
              );
            })}
          </g>
        );
      })}

      {/* panels */}
      {project.panels.filter((p) => p.enabled).map((p) => {
        const roof = project.roofs.find((x) => x.id === p.roofId);
        const corners = panelCornersOnRoof(p, spec, roof).map((c) => t.toPx(c));
        const d = corners.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ') + ' Z';
        return <path key={p.id} d={d} fill="#dbeafe" stroke="#1d4ed8" strokeWidth={0.7} />;
      })}

      {/* obstructions */}
      {project.obstructions.map((o) => {
        const c = t.toPx(o.center);
        return (
          <g key={o.id} fontFamily="monospace">
            <circle cx={c.x} cy={c.y} r={Math.max(4, (o.diameterM / 2) * t.scale)} fill="none" stroke="#b91c1c" strokeWidth={1} strokeDasharray="4 2" />
            <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize={7.5}>{o.label}</text>
          </g>
        );
      })}

      {/* north arrow */}
      <g transform="translate(640, 90)" fontFamily="monospace">
        <circle r={22} fill="none" stroke="#111" strokeWidth={1} />
        <path d="M 0 -16 L 6 8 L 0 3 L -6 8 Z" fill="#111" />
        <text y={36} textAnchor="middle" fontSize={9}>N</text>
      </g>

      {/* legend */}
      <g fontFamily="monospace" fontSize={8.5}>
        <rect x={700} y={60} width={250} height={150} fill="none" stroke="#111" strokeWidth={1} />
        <text x={708} y={76} fontWeight={800}>LEGEND</text>
        {[
          ['▭ PV Module (blue)', '#1d4ed8'],
          ['— Roof boundary', '#111'],
          ['◌ Obstruction + buffer', '#b91c1c'],
          ['▬ Walkway', '#ca8a04'],
          ['- - Safety rail', '#dc2626'],
          ['↯ Lightning arrester', '#d97706'],
        ].map(([label, color], i) => (
          <text key={label} x={708} y={94 + i * 16} fill={color as string}>{label}</text>
        ))}
      </g>

      {/* structure detail */}
      <g fontFamily="monospace" fontSize={8.5} transform="translate(700, 230)">
        <rect width={250} height={120} fill="none" stroke="#111" strokeWidth={1} />
        <text x={8} y={16} fontWeight={800}>PV TABLE SECTION (10° TILT)</text>
        <line x1={30} y1={95} x2={220} y2={95} stroke="#111" strokeWidth={1.4} />
        <line x1={50} y1={95} x2={50} y2={70} stroke="#111" strokeWidth={1.2} />
        <line x1={190} y1={95} x2={190} y2={55} stroke="#111" strokeWidth={1.2} />
        <line x1={42} y1={72} x2={200} y2={52} stroke="#1d4ed8" strokeWidth={2.4} />
        <text x={95} y={110} fontSize={7.5}>HDG steel legs · chemical anchor</text>
      </g>

      {/* title block */}
      <TitleBlock
        rows={[
          ['PROJECT', project.info.name],
          ['CLIENT', project.info.customerName || '—'],
          ['SITE', (project.location?.address ?? '').slice(0, 30)],
          ['MODULE', `${spec.brand} ${spec.watt}Wp × ${r.panelCount}`],
          ['CAPACITY', `${r.capacityKwp} kWp`],
          ['DRAWING', 'PV ARRAY LAYOUT · 1 OF 2'],
        ]}
      />
      <text x={12} y={FOOT_Y} fontSize={9} fill="#666">
        {drawingFootnote(project)}
      </text>
    </Sheet>
  );
}

function StringSheet() {
  const project = useActiveProject()!;
  const t = useLayoutTransform();
  if (!t) return null;
  const byId = new Map(project.panels.map((p) => [p.id, p]));

  return (
    <Sheet>
      <text x={490} y={32} textAnchor="middle" fontSize={15} fontWeight={800} fontFamily="monospace">
        DC STRING CABLE ROUTE · SHEET 2 OF 2
      </text>
      {project.roofs.map((roof) => {
        const d =
          roof.polygon
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${t.toPx(p).x} ${t.toPx(p).y}`)
            .join(' ') + ' Z';
        return <path key={roof.id} d={d} fill="none" stroke="#111" strokeWidth={1.4} />;
      })}
      {project.strings.map((s) => {
        const pts = s.panelIds.map((id) => byId.get(id)).filter(Boolean).map((p) => t.toPx(p!.center));
        if (pts.length < 2) return null;
        const d = `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
        return (
          <g key={s.id}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={1.6} strokeDasharray="6 3" />
            <text x={pts[0].x} y={pts[0].y - 6} fontSize={9} fill={s.color} fontFamily="monospace" fontWeight={700}>
              {s.name}
            </text>
          </g>
        );
      })}
      {project.strings.length === 0 && (
        <text x={490} y={320} textAnchor="middle" fontSize={12} fill="#777" fontFamily="monospace">
          No strings — run Auto String in the editor (Step 6)
        </text>
      )}
      <g fontFamily="monospace" fontSize={8.5}>
        <rect x={700} y={60} width={250} height={40 + project.strings.length * 15} fill="none" stroke="#111" strokeWidth={1} />
        <text x={708} y={76} fontWeight={800}>STRING SCHEDULE</text>
        {project.strings.map((s, i) => (
          <text key={s.id} x={708} y={94 + i * 15} fill={s.color}>
            {s.name}: {s.panelIds.length} modules → INV{s.inverterIndex + 1}/MPPT{s.mpptIndex + 1}
          </text>
        ))}
      </g>
      <TitleBlock
        rows={[
          ['PROJECT', project.info.name],
          ['CLIENT', project.info.customerName || '—'],
          ['DRAWING', 'DC STRING CABLE ROUTE'],
          ['SHEET', '2 OF 2 · NTS · A1'],
          ['DATE', new Date().toLocaleDateString('en-IN')],
          ['BY', 'Solar Studio (auto)'],
        ]}
      />
      <text x={12} y={FOOT_Y} fontSize={9} fill="#666">
        {drawingFootnote(project)}
      </text>
    </Sheet>
  );
}

// TitleBlock moved to components/drawing (Phase 22o) — it was pinned to this
// one sheet size while the new printable sheets need it on A3, and the gate
// there pins its original geometry so nothing on these sheets moved.

// ─── Edit ratings dialog ────────────────────────────────────────────────────

function EditRatingsDialog({
  sld,
  derived,
  onClose,
  onSave,
}: {
  sld: SldParams;
  /** freshly-derived defaults — fields matching these stay live-derived */
  derived: SldParams;
  onClose: () => void;
  onSave: (s: SldParams) => void;
}) {
  const [form, setForm] = useState<SldParams>(sld);
  const set = (p: Partial<SldParams>) => setForm((f) => ({ ...f, ...p }));
  const editedCount = (Object.keys(derived) as (keyof SldParams)[]).filter(
    (k) => form[k] !== derived[k],
  ).length;

  return (
    <Dialog
      title="Edit SLD Parameters"
      actions={
        <>
          <button
            className="btn btn-ghost"
            disabled={editedCount === 0}
            title="Discard all manual edits — every rating goes back to auto-derived"
            onClick={() => setForm(derived)}
          >
            <RotateCcw size={14} aria-hidden /> Reset to auto
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSave(form)}>
            Save Changes
          </button>
        </>
      }
    >
      <p style={{ fontSize: 11.5 }}>
        Ratings are derived from your selected components. Fields you edit here keep your
        value{editedCount > 0 ? ` (${editedCount} edited)` : ''}; untouched fields update
        automatically when components change.
      </p>
      <b style={{ fontSize: 12.5, color: '#7c3aed' }}>● Inverter Details</b>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 6 }}>
        <div className="field">
          <label>Name / Model</label>
          <input value={form.inverterLabel} onChange={(e) => set({ inverterLabel: e.target.value })} />
        </div>
        <div className="field">
          <label>AC Rating (kW)</label>
          <input type="number" value={form.acRatingKw} onChange={(e) => set({ acRatingKw: Number(e.target.value) })} />
        </div>
      </div>
      <b style={{ fontSize: 12.5, color: '#b91c1c' }}>● DC Side</b>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
        <div className="field">
          <label>Cable Size (mm²)</label>
          <select value={form.dcCableSizeMm2} onChange={(e) => set({ dcCableSizeMm2: Number(e.target.value) })}>
            {[2.5, 4, 6, 10].map((v) => <option key={v} value={v}>{v} mm²</option>)}
          </select>
        </div>
        <div className="field">
          <label>Fuse Rating (A)</label>
          <select value={form.dcFuseA} onChange={(e) => set({ dcFuseA: Number(e.target.value) })}>
            {[15, 20, 25, 32].map((v) => <option key={v} value={v}>{v}A</option>)}
          </select>
        </div>
        <div className="field">
          <label>SPD Type</label>
          <select value={form.dcSpdType} onChange={(e) => set({ dcSpdType: e.target.value })}>
            {['Type-I', 'Type-II', 'Type I+II'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Isolator (A)</label>
          <select value={form.dcIsolatorA} onChange={(e) => set({ dcIsolatorA: Number(e.target.value) })}>
            {[25, 32, 40, 63].map((v) => <option key={v} value={v}>{v}A</option>)}
          </select>
        </div>
      </div>
      <b style={{ fontSize: 12.5, color: '#047857' }}>● AC Side</b>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
        <div className="field">
          <label>Cable Size (mm²)</label>
          <select value={form.acCableSizeMm2} onChange={(e) => set({ acCableSizeMm2: Number(e.target.value) })}>
            {[4, 6, 10, 16, 25, 35, 50, 95].map((v) => <option key={v} value={v}>{v} mm²</option>)}
          </select>
        </div>
        <div className="field">
          <label>Cable Type</label>
          <select value={form.acCableType} onChange={(e) => set({ acCableType: e.target.value })}>
            {['PVC Cu', 'XLPE Cu', 'XLPE Al'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label>MCCB Rating (A)</label>
          {/* full standard ladder (rules config) — the derived value must always
              be representable here, and the isolator tracks the breaker */}
          <select
            value={form.mccbA}
            onChange={(e) => set({ mccbA: Number(e.target.value), acIsolatorA: Number(e.target.value) })}
          >
            {resolveRules().acSizing.breakerLadder.map((v) => (
              <option key={v} value={v}>{v}A</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>SPD Type</label>
          <select value={form.acSpdType} onChange={(e) => set({ acSpdType: e.target.value })}>
            {['Type-I', 'Type-II', 'Type I+II'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <b style={{ fontSize: 12.5, color: '#2563eb' }}>● Grid & Standards</b>
      <div className="field" style={{ marginTop: 6 }}>
        <label>Standard</label>
        <select value={form.standard} onChange={(e) => set({ standard: e.target.value })}>
          {['IS/IEC 62548 · CEA (India)', 'IEC 60364-7-712', 'NEC 690 (US)'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
    </Dialog>
  );
}
