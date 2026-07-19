// ─── §H on-object structure editor ──────────────────────────────────────────
// Click a table in the 3D scene → this contextual panel opens AT the object,
// and clicking an option applies it INSTANTLY as one undoable patch. Extracted
// from Scene3D.tsx in Phase 22l as a pure move: Scene3D had grown past 1900
// lines and this panel is now the busiest surface in it.
//
// (Hover preview was trialled and removed by user decision 2026-07-16: every
// hover rebuilt the full scene — janky, expensive, and accidental cursor travel
// kept mutating the model. Select-only is calmer and honest: the model updates
// the moment you choose, and undo reverts it.)
//
// TWO KINDS OF CONTROL LIVE HERE, and they must not be confused:
//   · DESIGN choices (preset, profile, tilt, clearance, foundation) call
//     onCommit → one undoable project patch;
//   · VIEW choices (module visibility, table isolation) call onViewChange and
//     must NEVER touch the project — ghosting a module to look at a rafter is
//     not a design change, and if it were persisted it would stale captures.
import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type {
  FoundationKind,
  FoundationShape,
  PanelSpec,
  Project,
  SectionDims,
} from '../types';
import { STRUCTURE_PROFILES } from '../lib/segment-ops';
import { defaultStructureParams, projectStructures, resolveRacking } from '../lib/structure';
import { panelFootprintM } from '../lib/layout';
import { computePanelShadeDetail } from '../lib/shading';
import { panelEnergyShares } from '../lib/solar';
import { foundationDeadLoadKg, foundationTooTall } from '../lib/foundation';
import {
  foundationOptionsFor,
  shapeOptionsFor,
  type StructureViewState,
} from '../lib/structure-view';
import type { StructChoice } from '../lib/structure-edit';
import { StructurePreview } from '../components/StructurePreview';
import { sectionSvgPath } from './profile-geometry';

const FOUNDATION_LABEL: Record<FoundationKind, string> = {
  concrete: 'PCC pedestal',
  anchor: 'Chemical anchor',
  ballast: 'Ballast block',
  pile: 'Driven pile',
};

const FOUNDATION_HINT: Record<FoundationKind, string> = {
  concrete: 'Cast on the slab — no membrane penetration, lifts the plate clear of ponding',
  anchor: 'Bolted through the slab — penetrates the waterproofing membrane',
  ballast: 'Dead weight, no penetration',
  pile: 'Driven into the ground',
};

/**
 * The honest footnote under the foundation choice.
 *
 * Two things must be said wherever a foundation is picked: its size is ASSUMED
 * (it follows from uplift and overturning, which we do not calculate, §F), and
 * a cast or ballasted footing LOADS THE SLAB by an amount we do not check
 * against roof capacity.
 */
function foundationNote(
  kind: FoundationKind,
  shape: FoundationShape,
  legBases: number,
): string {
  const each = foundationDeadLoadKg(kind, shape);
  if (each <= 0) return 'Nominal size — assumed, engineer to confirm.';
  const total = Math.round(each * legBases);
  return `Nominal size — assumed, engineer to confirm. Adds ~${total} kg to this roof; roof capacity is not checked.`;
}

/** Cross-section glyph, drawn from the SAME outline the 3D member extrudes. */
function SectionGlyph({ dims, size = 18 }: { dims?: SectionDims; size?: number }) {
  if (!dims) return null;
  const { path, w, h } = sectionSvgPath(dims);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`-1 -1 ${w + 2} ${h + 2}`}
      aria-hidden
      style={{ flex: '0 0 auto', overflow: 'visible' }}
    >
      <path d={path} fill="#e8edf4" fillRule="evenodd" stroke="#8b95a3" strokeWidth={1.2} />
    </svg>
  );
}

// Compact contextual panel anchored AT the table. Clicking an option commits
// ONE undoable patch; values shown are the CURRENT project's. (The onHover
// preview this comment used to describe was removed in Phase 7 — see the file
// header for why.)
const structBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: 7,
  color: '#e5e7eb',
  cursor: 'pointer',
  fontSize: 10.5,
  padding: '4px 8px',
};

export function StructEditPanel({
  project,
  segId,
  panelId,
  anchor,
  onCommit,
  onClose,
  onFocusBlocker,
  view,
  onViewChange,
}: {
  project: Project;
  segId: string;
  panelId?: string;
  anchor: [number, number, number];
  onCommit: (c: StructChoice) => void;
  onClose: () => void;
  onFocusBlocker?: (kind: string, id: string) => void;
  /** Phase 22l — inspection view. Changing it must NOT patch the project. */
  view: StructureViewState;
  onViewChange: (v: StructureViewState) => void;
}) {
  const seg = project.segments.find((sg) => sg.id === segId);
  const roof = seg ? project.roofs.find((r) => r.id === seg.roofId) : undefined;
  const spec = project.components.panel;
  // Per-panel sun + energy, computed WHEN THE CARD OPENS: ~250 rays for one
  // module is cheap, so this needs no persistence, no fingerprint and no
  // staleness badge — it is always current with whatever it is describing.
  const panelInfo = useMemo(() => {
    if (!panelId) return null;
    const detail = computePanelShadeDetail(project, panelId);
    if (!detail) return null;
    return {
      detail,
      kwh: panelEnergyShares(project).get(panelId) ?? null,
      // same thresholds as the access tint on the modules themselves
      tint: detail.access > 0.95 ? '#22c55e' : detail.access > 0.85 ? '#eab308' : '#ef4444',
    };
  }, [project, panelId]);
  if (!seg || !roof || !spec) return null;
  const resolved = resolveRacking(project, roof, seg, spec);
  const isFlush = seg.racking.kind === 'flush';
  // which foundations this SURFACE may use at all (empty ⇒ hide the card)
  const foundationOpts = foundationOptionsFor(roof, seg);
  // leg bases on this table, for the dead-load figure
  const structureNodeCount = projectStructures(project)
    .filter((st) => st.segmentId === seg.id)
    .reduce((n, st) => n + st.nodes.filter((x) => x.kind === 'roof_anchor').length, 0);
  const tilt = seg.racking.kind === 'flush' ? 0 : seg.racking.tiltDeg;
  const rise10 = panelFootprintM(spec, seg.orientation).h * Math.sin((10 * Math.PI) / 180);
  const previewRacking = (frontLegM: number) =>
    resolved
      ? { ...resolved, tiltDeg: 10, frontLegM, backLegM: frontLegM + rise10 }
      : {
          kind: 'fixed_tilt' as const,
          tiltDeg: 10,
          frontLegM,
          backLegM: frontLegM + rise10,
          profile: STRUCTURE_PROFILES[0],
          legSpacingM: 2,
          foundation: 'anchor' as const,
          foundationShape: 'square' as const,
          ...defaultStructureParams(STRUCTURE_PROFILES[0]),
        };
  const opt = (c: StructChoice) => ({ onClick: () => onCommit(c) });
  const stepRow = (
    label: string,
    value: string,
    minus: StructChoice | null,
    plus: StructChoice | null,
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
      <span style={{ color: '#9ca3af' }}>{label}</span>
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <button
          style={{ ...structBtn, opacity: minus ? 1 : 0.35, cursor: minus ? 'pointer' : 'default' }}
          {...(minus ? opt(minus) : {})}
          disabled={!minus}
          aria-label={`${label} minus`}
        >
          −
        </button>
        <span style={{ minWidth: 44, textAlign: 'center', fontWeight: 700 }}>{value}</span>
        <button
          style={{ ...structBtn, opacity: plus ? 1 : 0.35, cursor: plus ? 'pointer' : 'default' }}
          {...(plus ? opt(plus) : {})}
          disabled={!plus}
          aria-label={`${label} plus`}
        >
          +
        </button>
      </span>
    </div>
  );
  return (
    <Html position={anchor} center zIndexRange={[40, 10]}>
      <div
        role="dialog"
        data-struct-edit-card=""
        aria-label={`Structure options for ${seg.label}`}
        style={{
          // sit BESIDE the table, never on top of it — the model IS the preview
          transform: 'translate(64%, -10%)',
          width: 252,
          background: 'rgba(13,16,21,.95)',
          border: '1px solid rgba(255,255,255,.16)',
          borderRadius: 12,
          padding: 12,
          color: '#e5e7eb',
          fontSize: 11,
          boxShadow: '0 10px 32px rgba(0,0,0,.5)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 12 }}>
            {seg.label} ·{' '}
            {seg.racking.kind === 'flush'
              ? 'Flush mount'
              : `${seg.racking.tiltDeg}° · ${seg.racking.profile.label}`}
          </span>
          <button style={{ ...structBtn, padding: '2px 7px' }} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {panelInfo && (
          <div
            style={{
              margin: '8px 0',
              padding: 8,
              borderRadius: 8,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: '#6b7280' }}>
              THIS PANEL
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: panelInfo.tint }}>
                {Math.round(panelInfo.detail.access * 100)}%
              </span>
              <span style={{ color: '#9ca3af' }}>sun</span>
              {panelInfo.kwh !== null && (
                <span style={{ marginLeft: 'auto', fontWeight: 700 }}>
                  ≈{Math.round(panelInfo.kwh)} kWh/yr
                </span>
              )}
            </div>
            {panelInfo.detail.blockers.length > 0 ? (
              <div style={{ marginTop: 5 }}>
                <div style={{ color: '#6b7280', fontSize: 10, marginBottom: 3 }}>
                  Sun lost to — click to look
                </div>
                {panelInfo.detail.blockers.slice(0, 3).map((b) => (
                  <button
                    key={`${b.kind}:${b.id}`}
                    onClick={() => onFocusBlocker?.(b.kind, b.id)}
                    style={{
                      ...structBtn,
                      display: 'flex',
                      justifyContent: 'space-between',
                      width: '100%',
                      marginTop: 3,
                      textAlign: 'left',
                    }}
                    aria-label={`Focus ${b.label}`}
                  >
                    <span>{b.label}</span>
                    <span style={{ color: '#9ca3af' }}>−{(b.lossFrac * 100).toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>
                Nothing blocks this module
              </div>
            )}
            <div style={{ color: '#4b5563', fontSize: 9, marginTop: 5 }}>
              Estimated share of the system total
            </div>
          </div>
        )}
        <div style={{ color: '#6b7280', margin: '4px 0 8px', fontSize: 10 }}>
          {panelInfo ? 'TABLE — ' : ''}Click an option — it applies instantly (undo reverts)
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {(
            [
              ['flush', 'Flush', null, isFlush],
              ['standard', 'Std 10°', previewRacking(0.3), !isFlush && tilt === 10 && (resolved?.frontLegM ?? 0) < 1],
              ['walkunder', 'Walk 2.2m', previewRacking(2.2), !isFlush && (resolved?.frontLegM ?? 0) >= 2.2],
            ] as const
          ).map(([preset, label, racking, active]) => (
            <button
              key={preset}
              style={{
                ...structBtn,
                flex: 1,
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                borderColor: active ? '#fbbf24' : 'rgba(255,255,255,.14)',
              }}
              {...opt({ kind: 'preset', preset })}
            >
              <StructurePreview racking={racking} spec={spec} flush={!racking} width={64} height={38} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Inspection view (Phase 22l) ────────────────────────────────────
            Pure view state: these buttons must never call onCommit, because
            ghosting a module to look at a rafter is not a design change. */}
        {!isFlush && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4, letterSpacing: 0.3 }}>
              MODULES
            </div>
            <div style={{ display: 'flex', gap: 4 }} role="radiogroup" aria-label="Module visibility">
              {(['show', 'ghost', 'hide'] as const).map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={view.panelVis === v}
                  style={{
                    ...structBtn,
                    flex: 1,
                    textTransform: 'capitalize',
                    borderColor: view.panelVis === v ? '#fbbf24' : 'rgba(255,255,255,.14)',
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onViewChange({ ...view, panelVis: v })}
                >
                  {v}
                </button>
              ))}
            </div>
            <div
              style={{ display: 'flex', gap: 4, marginTop: 4 }}
              role="radiogroup"
              aria-label="Which tables are shown"
            >
              {([
                ['all', 'All tables'],
                ['isolate', 'Isolate this'],
              ] as const).map(([s, label]) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={view.scope === s}
                  style={{
                    ...structBtn,
                    flex: 1,
                    borderColor: view.scope === s ? '#fbbf24' : 'rgba(255,255,255,.14)',
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onViewChange({ ...view, scope: s })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isFlush && (
          <>
            {/* Section shape is the whole point of the choice, so show it.
                The glyph is generated from the SAME `sectionShape` the 3D
                member is extruded from, so what you pick is what you get. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {STRUCTURE_PROFILES.map((pr) => {
                const on = seg.racking.kind !== 'flush' && seg.racking.profile.key === pr.key;
                return (
                  <button
                    key={pr.key}
                    title={pr.sectionMm ? `${pr.label} · ${pr.sectionMm} · ${pr.kgPerM} kg/m` : pr.label}
                    aria-label={`${pr.label}${pr.sectionMm ? `, ${pr.sectionMm} millimetres` : ''}, ${pr.kgPerM} kilograms per metre`}
                    aria-pressed={on}
                    style={{
                      ...structBtn,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      borderColor: on ? '#fbbf24' : 'rgba(255,255,255,.14)',
                    }}
                    {...opt({ kind: 'profile', key: pr.key })}
                  >
                    <SectionGlyph dims={pr.dims} size={18} />
                    {pr.label}
                  </button>
                );
              })}
            </div>

            {/* What the legs stand on. Hidden entirely where the surface has no
                choice to make — a shed mounts on standoffs through the sheet,
                and you cannot cast a level pedestal on a pitched roof (E1). */}
            {foundationOpts.length > 0 && resolved && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4, letterSpacing: 0.3 }}>
                  FOUNDATION
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {foundationOpts.map((f) => {
                    const on = resolved.foundation === f;
                    const tooTall = foundationTooTall(resolved.frontLegM, f);
                    return (
                      <button
                        key={f}
                        aria-pressed={on}
                        title={
                          tooTall
                            ? `${FOUNDATION_LABEL[f]} — taller than this table's clearance`
                            : FOUNDATION_HINT[f]
                        }
                        style={{
                          ...structBtn,
                          borderColor: on ? '#fbbf24' : 'rgba(255,255,255,.14)',
                          opacity: tooTall ? 0.45 : 1,
                        }}
                        {...opt({ kind: 'foundation', foundation: f })}
                      >
                        {FOUNDATION_LABEL[f]}
                      </button>
                    );
                  })}
                </div>
                {/* Shuttering form — only a CAST pedestal has a choice. The
                    difference is π/4 of concrete, so it is a real quantity
                    decision, not a cosmetic one. */}
                {shapeOptionsFor(resolved.foundation).length > 0 && (
                  <div
                    style={{ display: 'flex', gap: 4, marginTop: 4 }}
                    role="radiogroup"
                    aria-label="Shuttering form"
                  >
                    {shapeOptionsFor(resolved.foundation).map((sh) => (
                      <button
                        key={sh}
                        role="radio"
                        aria-checked={resolved.foundationShape === sh}
                        title={
                          sh === 'square'
                            ? 'Plank shuttering — the common rooftop pedestal'
                            : 'Sono-tube / pipe shuttering — ~21% less concrete'
                        }
                        style={{
                          ...structBtn,
                          flex: 1,
                          textTransform: 'capitalize',
                          borderColor:
                            resolved.foundationShape === sh ? '#fbbf24' : 'rgba(255,255,255,.14)',
                        }}
                        {...opt({ kind: 'foundationShape', shape: sh })}
                      >
                        {sh}
                      </button>
                    ))}
                  </div>
                )}
                {/* honesty: the size is assumed, and it loads the slab */}
                <div style={{ fontSize: 9.5, opacity: 0.55, marginTop: 4, lineHeight: 1.35 }}>
                  {foundationNote(resolved.foundation, resolved.foundationShape, structureNodeCount)}
                </div>
              </div>
            )}
            {stepRow(
              'Tilt',
              `${tilt}°`,
              tilt > 0 ? { kind: 'tilt', tiltDeg: Math.max(0, tilt - 5) } : null,
              tilt < 35 ? { kind: 'tilt', tiltDeg: Math.min(35, tilt + 5) } : null,
            )}
            {resolved &&
              stepRow(
                'Clearance',
                `${(Math.round(resolved.frontLegM * 10) / 10).toFixed(1)} m`,
                resolved.frontLegM > 0.05
                  ? { kind: 'clearance', clearanceM: Math.max(0, Math.round((resolved.frontLegM - 0.3) * 10) / 10) }
                  : null,
                resolved.frontLegM < 3
                  ? { kind: 'clearance', clearanceM: Math.min(3, Math.round((resolved.frontLegM + 0.3) * 10) / 10) }
                  : null,
              )}
          </>
        )}
      </div>
    </Html>
  );
}
