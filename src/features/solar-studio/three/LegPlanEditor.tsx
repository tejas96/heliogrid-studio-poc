// ─── Legs (2D) — top-down leg plan editor (Phase 22m) ───────────────────────
// Renders the segment's own LOCAL frame, so a table rotated to any azimuth is
// drawn square and the legs stay aligned with the panels carrying them (E3).
//
// Every decision — where a leg may land, what a nudge is worth, what each
// action announces — lives in lib/leg-plan-edit. This file draws and dispatches
// and decides nothing, which is what makes the keyboard and mouse paths
// provably identical rather than two implementations that agree today.
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw, Plus } from 'lucide-react';
import { rotate } from '../lib/geo';
import { segmentFrameAngle } from '../lib/segment-ops';
import { panelFootprintM } from '../lib/layout';
import {
  addLeg,
  buildableRegion,
  moveLeg,
  nudgeFor,
  planMode,
  planPoints,
  removeLeg,
  resetToAuto,
  type LegPlanResult,
} from '../lib/leg-plan-edit';
import type { ArraySegment, PanelSpec, PlacedPanel, Project, Roof, XY } from '../types';

const PAD = 24;

export function LegPlanEditor({
  project,
  roof,
  seg,
  spec,
  panels,
  legSpacingM,
  onPatch,
  fmtLen,
  width = 560,
  height = 300,
}: {
  project: Project;
  roof: Roof;
  seg: ArraySegment;
  spec: PanelSpec;
  panels: PlacedPanel[];
  legSpacingM: number;
  /** ONE undoable patch per committed action (§H) */
  onPatch: (patch: Partial<Project>) => void;
  /**
   * Length formatter, PASSED IN rather than taken from `useUnits()` (E19).
   *
   * This component renders inside drei's <Html>, which lives in the
   * react-three-fiber reconciler — a separate React root. Store context does
   * not cross into it and there is no bridge, so `useStore()` THROWS there.
   * Calling the hook here unmounted the whole structure panel, which looked
   * for all the world like the open button closing it.
   */
  fmtLen: (m: number, dp?: number) => string;
  width?: number;
  height?: number;
}) {
  const [selected, setSelected] = useState(0);
  const [announce, setAnnounce] = useState('');
  const [drag, setDrag] = useState<{ index: number; from: XY } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const mine = useMemo(
    () => panels.filter((p) => p.enabled && p.segmentId === seg.id),
    [panels, seg.id],
  );
  const angle = useMemo(() => segmentFrameAngle(roof, seg, mine), [roof, seg, mine]);
  const pts = planPoints(seg);
  const mode = planMode(seg);

  // panels and the buildable outline, both in the segment's local frame
  const localPanels = useMemo(() => mine.map((p) => rotate(p.center, -angle)), [mine, angle]);
  const localRoof = useMemo(
    () => buildableRegion(roof).map((p) => rotate(p, -angle)),
    [roof, angle],
  );
  const { w: pw, h: ph } = panelFootprintM(spec, seg.orientation);

  // fit the buildable region into the viewport
  const view = useMemo(() => {
    const xs = localRoof.map((p) => p.x);
    const ys = localRoof.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const s = Math.min((width - PAD * 2) / (maxX - minX || 1), (height - PAD * 2) / (maxY - minY || 1));
    return {
      s,
      // SVG y grows downward; the plan's y grows north, so flip it
      toX: (x: number) => PAD + (x - minX) * s,
      toY: (y: number) => height - PAD - (y - minY) * s,
      fromX: (px: number) => (px - PAD) / s + minX,
      fromY: (py: number) => (height - PAD - py) / s + minY,
      minX,
      maxX,
      minY,
      maxY,
    };
  }, [localRoof, width, height]);

  /** Apply a result: commit one patch, or surface the refusal. Never silent. */
  const commit = (r: LegPlanResult) => {
    if (r.ok) {
      onPatch(r.patch);
      setAnnounce(r.announce);
    } else {
      setAnnounce(r.reason);
    }
  };

  const localFromEvent = (e: { clientX: number; clientY: number }): XY | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: view.fromX(e.clientX - rect.left), y: view.fromY(e.clientY - rect.top) };
  };

  const onPointerDownLeg = (i: number) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    setSelected(i);
    const at = localFromEvent(e);
    if (at) setDrag({ index: i, from: at });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    // NOTHING is committed mid-gesture. A patch per frame would push a hundred
    // entries onto the undo stack for one drag and re-derive the structure on
    // every one of them.
    if (!drag) return;
    e.preventDefault();
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    if (!drag) return;
    const at = localFromEvent(e);
    setDrag(null);
    if (!at) return;
    const delta = { x: at.x - drag.from.x, y: at.y - drag.from.y };
    if (Math.hypot(delta.x, delta.y) < 1e-3) return; // a click, not a drag
    commit(moveLeg(project, roof, seg, mine, drag.index, delta));
  };

  const onKeyDown = (i: number) => (e: React.KeyboardEvent) => {
    const d = nudgeFor(e.key, e.shiftKey);
    if (d) {
      e.preventDefault();
      setSelected(i);
      commit(moveLeg(project, roof, seg, mine, i, d));
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      commit(removeLeg(project, seg, i));
      setSelected((s) => Math.max(0, s - 1));
    }
  };

  /** Enter on the plan itself adds a leg at the centre of the table. */
  const addAtCentre = () => {
    const cx = localPanels.length
      ? localPanels.reduce((s, p) => s + p.x, 0) / localPanels.length
      : (view.minX + view.maxX) / 2;
    const cy = localPanels.length
      ? localPanels.reduce((s, p) => s + p.y, 0) / localPanels.length
      : (view.minY + view.maxY) / 2;
    commit(addLeg(project, roof, seg, mine, { x: cx, y: cy }, legSpacingM, spec));
  };

  // 1 m grid across the buildable region
  const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let gx = Math.ceil(view.minX); gx <= view.maxX; gx++) {
    gridLines.push({ x1: view.toX(gx), y1: view.toY(view.minY), x2: view.toX(gx), y2: view.toY(view.maxY) });
  }
  for (let gy = Math.ceil(view.minY); gy <= view.maxY; gy++) {
    gridLines.push({ x1: view.toX(view.minX), y1: view.toY(gy), x2: view.toX(view.maxX), y2: view.toY(gy) });
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
          gap: 8,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <b>Legs (2D)</b>
          <span
            className="badge"
            style={{
              background: mode === 'custom' ? '#f59e0b22' : 'transparent',
              color: mode === 'custom' ? '#b45309' : 'var(--ink-3)',
              border: '1px solid var(--line)',
              borderRadius: 999,
              padding: '1px 8px',
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            {mode === 'custom' ? `CUSTOM · ${pts.length} legs` : 'AUTO'}
          </span>
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: 11 }}
            onClick={addAtCentre}
          >
            <Plus size={12} /> Add leg
          </button>
          {mode === 'custom' && (
            <button
              className="btn btn-secondary"
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => commit(resetToAuto(project, seg))}
            >
              <RotateCcw size={12} /> Reset to auto
            </button>
          )}
        </span>
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="group"
        aria-label={`Leg plan for table ${seg.label}. ${
          mode === 'custom' ? `${pts.length} hand-placed legs.` : 'Automatic spacing.'
        } Use Tab to reach a leg, arrow keys to move it, Delete to remove it.`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ background: 'var(--paper-2)', borderRadius: 8, touchAction: 'none' }}
      >
        {gridLines.map((l, i) => (
          <line key={i} {...l} stroke="var(--line)" strokeWidth={0.5} opacity={0.5} />
        ))}

        {/* buildable region — legs may not leave it (E4) */}
        <polygon
          points={localRoof.map((p) => `${view.toX(p.x)},${view.toY(p.y)}`).join(' ')}
          fill="none"
          stroke="var(--ink-3)"
          strokeDasharray="4 3"
          strokeWidth={1}
        />

        {/* panels */}
        {localPanels.map((p, i) => (
          <rect
            key={i}
            x={view.toX(p.x - pw / 2)}
            y={view.toY(p.y + ph / 2)}
            width={pw * view.s}
            height={ph * view.s}
            fill="#1e3a8a22"
            stroke="#3b82f6"
            strokeWidth={1}
          />
        ))}

        {/* legs — crosshairs, focusable in plan order */}
        {pts.map((p, i) => {
          const cx = view.toX(p.x);
          const cy = view.toY(p.y);
          const on = i === selected;
          return (
            <g
              key={i}
              tabIndex={0}
              role="button"
              aria-label={`Leg ${i + 1} of ${pts.length}, ${fmtLen(p.x)} along the table. Arrow keys move it, Delete removes it.`}
              onKeyDown={onKeyDown(i)}
              onFocus={() => setSelected(i)}
              onPointerDown={onPointerDownLeg(i)}
              style={{ cursor: 'grab', outline: 'none' }}
            >
              <circle cx={cx} cy={cy} r={on ? 9 : 7} fill={on ? '#f59e0b33' : 'transparent'} />
              <line x1={cx - 7} y1={cy} x2={cx + 7} y2={cy} stroke={on ? '#f59e0b' : 'var(--ink)'} strokeWidth={2} />
              <line x1={cx} y1={cy - 7} x2={cx} y2={cy + 7} stroke={on ? '#f59e0b' : 'var(--ink)'} strokeWidth={2} />
            </g>
          );
        })}
      </svg>

      {/* the announcement channel — every action, and every refusal, lands here */}
      <div role="status" aria-live="polite" style={{ fontSize: 11.5, minHeight: 18, marginTop: 4, color: 'var(--ink-2)' }}>
        {announce}
      </div>
    </div>
  );
}
