// ─── What ONE module makes, and what is taking the rest ─────────────────────
// This readout used to live inside the racking editor, three clicks deep and
// filed under a card about rafters and foundations. Nobody opens a rafter
// editor to ask "why is this module poor?". It is now its own component, so
// the racking editor and the module card in the 3D show the SAME numbers and
// cannot drift apart.
//
// It computes on mount: ~250 rays for one module is cheap, so there is no
// persistence, no fingerprint and no staleness badge — it is always current
// with whatever it is describing.
import { useMemo } from 'react';
import type { Project } from '../types';
import { computePanelShadeDetail } from '../lib/shading';
import { peekSurroundHeights } from '../lib/surround';
import { panelEnergyShares } from '../lib/energy/report';
import { accessHex } from '../lib/shade-ramp';

export interface PanelYield {
  access: number;
  kwh: number | null;
  tint: string;
  blockers: { kind: string; id: string; label: string; lossFrac: number }[];
}

/** The numbers for one module, or null when it has none (no such module). */
export function usePanelYield(project: Project, panelId: string | null | undefined): PanelYield | null {
  return useMemo(() => {
    if (!panelId) return null;
    // the real neighbourhood counts here too, when its grid is already in memory
    const detail = computePanelShadeDetail(project, panelId, {
      surround: peekSurroundHeights(project.surround),
    });
    if (!detail) return null;
    return {
      access: detail.access,
      kwh: panelEnergyShares(project).get(panelId) ?? null,
      // the ONE scale the modules and the legend use (lib/shade-ramp)
      tint: accessHex(detail.access),
      blockers: detail.blockers,
    };
  }, [project, panelId]);
}

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  marginTop: 3,
  textAlign: 'left',
  fontSize: 10.5,
  lineHeight: 1.3,
  padding: '5px 8px',
  borderRadius: 7,
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.09)',
  color: '#e6e8eb',
};

export function PanelYieldCard({
  info,
  onFocusBlocker,
  compact = false,
}: {
  info: PanelYield;
  /** fly the camera at whatever is taking the sun */
  onFocusBlocker?: (kind: string, id: string) => void;
  /** inside another card (the racking editor) rather than standing alone */
  compact?: boolean;
}) {
  return (
    <div
      style={
        compact
          ? {
              margin: '8px 0',
              padding: 8,
              borderRadius: 8,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.08)',
            }
          : undefined
      }
    >
      {compact && (
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: '#6b7280' }}>
          THIS PANEL
        </div>
      )}
      {/* the headline: the number IS the answer, so it carries the scale's own
          colour and never wraps away from the word it belongs to */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: compact ? 3 : 2 }}>
        <span
          style={{
            fontSize: compact ? 15 : 26,
            fontWeight: 800,
            color: info.tint,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            textShadow: compact ? undefined : `0 0 18px ${info.tint}55`,
          }}
        >
          {Math.round(info.access * 100)}%
        </span>
        <span style={{ color: '#9ca3af' }}>sun</span>
      </div>
      {info.kwh !== null && (
        <div
          style={{
            marginTop: compact ? 2 : 4,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          ≈{Math.round(info.kwh).toLocaleString('en-IN')} kWh/yr
        </div>
      )}
      {info.blockers.length > 0 ? (
        <div style={{ marginTop: 5 }}>
          <div style={{ color: '#6b7280', fontSize: 10, marginBottom: 3 }}>
            Sun lost to — click to look
          </div>
          {info.blockers.slice(0, 3).map((b) => (
            <button
              key={`${b.kind}:${b.id}`}
              onClick={() => onFocusBlocker?.(b.kind, b.id)}
              style={row}
              aria-label={`Focus ${b.label}`}
            >
              <span style={{ minWidth: 0 }}>{b.label}</span>
              <span
                style={{
                  color: '#9ca3af',
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                −{(b.lossFrac * 100).toFixed(1)}%
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>Nothing blocks this module</div>
      )}
      {/* provenance stays quiet but must stay READABLE — this is an estimate and
          the reader is entitled to know it without squinting (DESIGN-SYSTEM §12) */}
      <div style={{ color: '#6b7280', fontSize: 9.5, marginTop: 6 }}>
        Estimated share of the system total
      </div>
    </div>
  );
}
