// ─── Structure section preview (Phase 7, user-requested) ────────────────────
// A side-elevation SVG PROJECTED FROM THE REAL MEMBER GRAPH — never a static
// picture that can drift from the engineering model. Zero WebGL cost (the
// browser caps GL contexts; the sole Canvas belongs to Scene3D).
import { useMemo } from 'react';
import type { PanelSpec, Roof } from '../types';
import {
  buildStructure,
  type ResolvedRacking,
  type SegmentStructure,
} from '../lib/structure';
import type { ArraySegment, PlacedPanel } from '../types';

/** Synthetic one-panel segment at origin — enough for a section elevation. */
function sectionStructure(racking: ResolvedRacking, spec: PanelSpec): SegmentStructure {
  const seg: ArraySegment = {
    id: 'preview',
    roofId: 'preview_roof',
    label: '·',
    polygon: [],
    rows: 1,
    cols: 1,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: {
      kind: racking.kind,
      tiltDeg: racking.tiltDeg,
      rowPitchM: 0,
      frontLegM: racking.frontLegM,
      backLegM: racking.backLegM,
      profile: racking.profile,
    },
    moduleGapM: 0.02,
    removed: [],
  };
  const roof: Roof = {
    id: 'preview_roof',
    name: '',
    polygon: [],
    roofType: 'rcc_flat',
    heightM: 0,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 0,
    perEdgeSetbacksM: null,
    parapet: {
      enabled: false,
      direction: 'inward',
      heightM: 1,
      widthM: 0.3,
      perEdge: null,
      suppressSharedEdges: true,
    },
  };
  const panel: PlacedPanel = {
    id: 'pv_preview',
    roofId: roof.id,
    center: { x: 0, y: 0 },
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: racking.tiltDeg,
    solarAccess: 1,
    enabled: true,
    segmentId: seg.id,
    cellIndex: 0,
  };
  return buildStructure(seg, spec, roof, racking, [panel]);
}

/**
 * Side elevation: south (down-tilt) to the LEFT. Members project onto the
 * (depth = −EN·y, height = z) plane; purlins run perpendicular and render as
 * section dots. The module line connects the two leg tops.
 */
export function StructurePreview({
  racking,
  spec,
  width = 128,
  height = 84,
  flush = false,
}: {
  racking: ResolvedRacking | null;
  spec: PanelSpec;
  width?: number;
  height?: number;
  flush?: boolean;
}) {
  const view = useMemo(() => {
    if (flush || !racking) return null;
    const s = sectionStructure(racking, spec);
    // depth axis: facing south ⇒ front edge at −y; draw front on the left
    const pts = s.members.flatMap((m) => [m.a, m.b]);
    const minD = Math.min(...pts.map((p) => -p.y));
    const maxD = Math.max(...pts.map((p) => -p.y));
    const maxZ = Math.max(...pts.map((p) => p.z));
    const pad = 10;
    const sx = (width - pad * 2) / Math.max(0.5, maxD - minD);
    const sy = (height - pad * 2) / Math.max(0.5, maxZ);
    const k = Math.min(sx, sy);
    const X = (d: number) => pad + (d - minD) * k;
    const Y = (z: number) => height - pad - z * k;
    return { s, X, Y };
  }, [flush, racking, spec, width, height]);

  if (flush || !racking || !view) {
    // flush: module lies on the surface — an honest flat glyph
    return (
      <svg width={width} height={height} aria-label="Flush mount section">
        <line x1={12} y1={height - 14} x2={width - 12} y2={height - 14} stroke="var(--line-2, #888)" strokeWidth={2} />
        <line x1={16} y1={height - 19} x2={width - 16} y2={height - 19} stroke="var(--info, #1d4ed8)" strokeWidth={4} strokeLinecap="round" />
      </svg>
    );
  }

  const { s, X, Y } = view;
  const legs = s.members.filter((m) => m.kind === 'front_leg' || m.kind === 'back_leg');
  const rafters = s.members.filter((m) => m.kind === 'rafter');
  const purlins = s.members.filter((m) => m.kind === 'purlin');
  return (
    <svg
      width={width}
      height={height}
      aria-label={`Elevated structure section: ${racking.tiltDeg}° tilt, ${racking.frontLegM.toFixed(1)} m clearance`}
    >
      {/* roof line */}
      <line x1={4} y1={Y(0)} x2={width - 4} y2={Y(0)} stroke="var(--line-2, #888)" strokeWidth={2} />
      {legs.map((m) => (
        <line
          key={m.id}
          x1={X(-m.a.y)}
          y1={Y(m.a.z)}
          x2={X(-m.b.y)}
          y2={Y(m.b.z)}
          stroke="var(--ink-2, #555)"
          strokeWidth={2.5}
        />
      ))}
      {rafters.map((m) => (
        <line
          key={m.id}
          x1={X(-m.a.y)}
          y1={Y(m.a.z)}
          x2={X(-m.b.y)}
          y2={Y(m.b.z)}
          stroke="var(--info, #1d4ed8)"
          strokeWidth={4}
          strokeLinecap="round"
        />
      ))}
      {purlins.map((m) => (
        <circle key={m.id} cx={X(-m.a.y)} cy={Y(m.a.z)} r={3} fill="var(--ink-2, #555)" />
      ))}
      {/* clearance callout */}
      <text x={6} y={Y(racking.frontLegM / 2)} fontSize={9} fill="var(--ink-3, #999)">
        {racking.frontLegM.toFixed(1)}m
      </text>
    </svg>
  );
}
