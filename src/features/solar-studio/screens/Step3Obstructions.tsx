import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowUpFromLine,
  Box,
  Building2,
  Circle as CircleIcon,
  Copy,
  Cylinder,
  Eye,
  EyeOff,
  Factory,
  Fan,
  Flame,
  Layers,
  Lock,
  LockOpen,
  MousePointerClick,
  Package,
  Plus,
  Ruler,
  PencilRuler,
  RulerDimensionLine,
  Satellite,
  Settings2,
  Shapes,
  Square,
  Trash2,
  TreePine,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useActiveProject, useProjectPatch } from '../store/store';
import { SatCanvas, polyPath, useCanvasFrame } from '../components/SatCanvas';
import { MeasureOverlay, useMeasure } from '../components/MeasureTool';
import { OBSTRUCTION_PRESETS, makeObstruction } from '../lib/roof-factory';
import { EdgeLabels } from '../components/EdgeLabels';
import { Sheet, SliderRow, ToggleRow, OptionCard, UnitToggle } from '../components/ui';
import { M_TO_FT, useUnits } from '../lib/units';
import { pickRoofAt } from '../lib/roof-topology';
import { Scene3D } from '../three/Scene3D';
import { resolveCapabilities, requiredBridgeClearanceM } from '../lib/capabilities';
import { reconcileBridgedPanels } from '../lib/structure-edit';
import { obstructionToPlatform } from '../lib/roof-factory';
import type { Obstruction, ObstructionType, XY } from '../types';
import {
  add,
  dist,
  genId,
  insetPolygonRobust,
  pointInPolygon,
  rectCorners,
  rotate,
  sub,
} from '../lib/geo';

// palette = UI concerns (icon/label/beta); the physical presets (code + L/W/H)
// live in lib/roof-factory.OBSTRUCTION_PRESETS, shared with the AI importer
const OBSTRUCTION_TYPES: {
  type: ObstructionType;
  label: string;
  icon: LucideIcon;
  code: string;
  size: [number, number, number];
  beta?: boolean;
}[] = (
  [
    ['tank', 'Tank', Cylinder],
    ['dish', 'Dish', Satellite],
    ['chimney', 'Chimney', Factory],
    ['tree', 'Tree', TreePine],
    ['elevated', 'Elevated', Layers],
    ['building', 'Building', Building2],
    ['solar_wh', 'Solar WH', Flame],
    ['ladder', 'Ladder', ArrowUpFromLine],
    ['windmill', 'Windmill', Wind],
    ['turbine_vent', 'Turbine Vent', Fan],
    ['other', 'Other', Package],
  ] as [ObstructionType, string, LucideIcon][]
).map(([type, label, icon]) => ({
  type,
  label,
  icon,
  code: OBSTRUCTION_PRESETS[type].code,
  size: OBSTRUCTION_PRESETS[type].size,
  ...(type === 'ladder' ? { beta: true } : {}),
}));

type SheetKind = null | 'pick' | 'shape' | 'size' | 'settings';

/** -1 = circle east handle, 0..3 = rect corner index */
type HandleDrag = { kind: 'resize'; corner: number } | { kind: 'rotate' };
type Drag =
  | { kind: 'move'; id: string; offset: XY }
  | { kind: 'resize'; id: string; corner: number }
  | { kind: 'rotate'; id: string };

const MIN_DIM_M = 0.3;

export function Step3Obstructions() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const loc = project.location!;

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [placing, setPlacing] = useState<(typeof OBSTRUCTION_TYPES)[number] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const measure = useMeasure();
  const [show3D, setShow3D] = useState(false);
  const { units, setUnits, fmtLen, lenValue, lenUnit } = useUnits();
  // stored dims are meters; inputs show/accept the display unit
  const uf = units === 'imperial' ? M_TO_FT : 1;
  const toDisplay = (m: number) => +(m * uf).toFixed(2);
  const fromDisplay = (v: number) => v / uf;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [lockedIds, setLockedIds] = useState<ReadonlySet<string>>(new Set());

  /** last pointer position in meters — lets a move-drag keep its grab offset */
  const lastMRef = useRef<XY | null>(null);
  /** history entry already pushed for the active drag gesture? */
  const histRef = useRef(false);

  const selected = project.obstructions.find((o) => o.id === selectedId) ?? null;
  const selectedLocked = selected ? lockedIds.has(selected.id) : false;
  const typeOf = (o: Obstruction) => OBSTRUCTION_TYPES.find((t) => t.type === o.type);

  function update(id: string, p: Partial<Obstruction>, undoable = true) {
    const obstructions = project.obstructions.map((o) => (o.id === id ? { ...o, ...p } : o));
    // height/size/position/capability edits can invalidate (or restore)
    // panels bridging this obstruction — adjust in the same patch
    const panels = reconcileBridgedPanels(project, { obstructions });
    patch({ obstructions, ...(panels ? { panels } : {}) }, undoable);
  }

  /** Live drag patch: first change of a gesture records one undo step. */
  function updateLive(id: string, p: Partial<Obstruction>) {
    update(id, p, !histRef.current);
    histRef.current = true;
  }

  function beginDrag(d: Drag) {
    histRef.current = false;
    setDrag(d);
  }

  function place(m: XY) {
    if (!placing) return;
    // shared factory — identical defaults for hand-placed and AI-imported
    const ob = makeObstruction({
      type: placing.type,
      center: m,
      existing: project.obstructions,
      roofId: pickRoofAt(m, project.roofs)?.id ?? null,
    });
    patch({ obstructions: [...project.obstructions, ob] }, true);
    setPlacing(null);
    setSelectedId(ob.id);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy: Obstruction = {
      ...selected,
      id: genId('ob'),
      label: `${selected.label}c`,
      center: { x: selected.center.x + 2, y: selected.center.y + 2 },
    };
    patch({ obstructions: [...project.obstructions, copy] }, true);
    setSelectedId(copy.id);
  }

  function deleteSelected() {
    if (!selected || selectedLocked) return;
    patch({ obstructions: project.obstructions.filter((o) => o.id !== selected.id) }, true);
    setSelectedId(null);
  }

  function toggleLock() {
    if (!selected) return;
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(selected.id)) next.delete(selected.id);
      else next.add(selected.id);
      return next;
    });
  }

  // keyboard: Esc cancel/deselect, Delete removes, arrows nudge 0.1 m (Shift = 1 m)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === 'Escape') {
        if (placing) {
          setPlacing(null);
          return;
        }
        if (sheet) return; // Sheet closes itself on Escape
        if (drag) {
          setDrag(null);
          return;
        }
        setSelectedId(null);
        return;
      }
      if (sheet || !selected) return;
      const locked = lockedIds.has(selected.id);
      if ((e.key === 'Delete' || e.key === 'Backspace') && !locked) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      const step = e.shiftKey ? 1 : 0.1;
      const dir: Record<string, XY> = {
        ArrowUp: { x: 0, y: step },
        ArrowDown: { x: 0, y: -step },
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
      };
      const d = dir[e.key];
      if (d && !locked) {
        e.preventDefault();
        update(selected.id, {
          center: {
            x: +(selected.center.x + d.x).toFixed(2),
            y: +(selected.center.y + d.y).toFixed(2),
          },
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function applyDrag(m: XY, e: ReactPointerEvent) {
    if (!drag) return;
    const o = project.obstructions.find((x) => x.id === drag.id);
    if (!o) return;
    if (drag.kind === 'move') {
      updateLive(o.id, { center: { x: m.x + drag.offset.x, y: m.y + drag.offset.y } });
      return;
    }
    if (drag.kind === 'rotate') {
      const v = sub(m, o.center);
      if (Math.hypot(v.x, v.y) < 0.05) return;
      let deg = (Math.atan2(-v.x, v.y) * 180) / Math.PI;
      deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg);
      updateLive(o.id, { rotationDeg: ((deg % 360) + 360) % 360 });
      return;
    }
    // resize
    if (drag.corner === -1) {
      updateLive(o.id, {
        diameterM: Math.max(MIN_DIM_M, +(dist(m, o.center) * 2).toFixed(2)),
      });
      return;
    }
    const local = rotate(sub(m, o.center), -o.rotationDeg);
    updateLive(o.id, {
      lengthM: Math.max(MIN_DIM_M, +(Math.abs(local.x) * 2).toFixed(2)),
      widthM: Math.max(MIN_DIM_M, +(Math.abs(local.y) * 2).toFixed(2)),
    });
  }

  const roofOf = (o: Obstruction) => project.roofs.find((r) => r.id === o.roofId);
  const SelectedIcon = selected ? typeOf(selected)?.icon : undefined;

  if (show3D) {
    return <Scene3D onClose={() => setShow3D(false)} initialViewMode="mesh" />;
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <SatCanvas
        lat={loc.latLng.lat}
        lng={loc.latLng.lng}
        scaleFactor={project.calibration.scaleFactor}
        northOffsetDeg={project.calibration.northOffsetDeg}
        cursor={placing || measure.active ? (measure.active ? 'crosshair' : 'copy') : drag ? 'grabbing' : 'default'}
        panEnabled={!placing && !drag}
        onCanvasClick={(m) => {
          if (measure.handleClick(m)) return;
          if (placing) {
            place(m);
            return;
          }
          if (drag) return; // click fired at the end of a drag gesture
          if (hidden) {
            setSelectedId(null);
            return;
          }
          const hit = [...project.obstructions].reverse().find((o) => {
            const half = Math.max(o.lengthM, o.widthM, o.diameterM) / 2 + 0.3;
            return Math.hypot(m.x - o.center.x, m.y - o.center.y) <= half;
          });
          setSelectedId(hit?.id ?? null);
        }}
        onCanvasMove={(m, e) => {
          lastMRef.current = m;
          measure.handleMove(m);
          if (!drag) return;
          if (e.buttons === 0) {
            setDrag(null); // pointer released outside the canvas
            return;
          }
          applyDrag(m, e);
        }}
        onCanvasUp={() => setDrag(null)}
      >
        {/* roofs (read-only backdrop) */}
        <RoofBackdrop showMeasurements={showMeasurements} fmt={fmtLen} />
        {!hidden && (
          <ObstructionLayer
            obstructions={project.obstructions}
            selectedId={selectedId}
            onDown={(id) => {
              setSelectedId(id);
              if (lockedIds.has(id)) return;
              const o = project.obstructions.find((x) => x.id === id);
              const at = lastMRef.current;
              beginDrag({
                kind: 'move',
                id,
                offset:
                  o && at
                    ? { x: o.center.x - at.x, y: o.center.y - at.y }
                    : { x: 0, y: 0 },
              });
            }}
          />
        )}
        {!hidden && selected && (
          <SelectionOverlay
            o={selected}
            locked={selectedLocked}
            typeLabel={typeOf(selected)?.label ?? 'Object'}
            onHandle={(h) =>
              beginDrag(
                h.kind === 'rotate'
                  ? { kind: 'rotate', id: selected.id }
                  : { kind: 'resize', id: selected.id, corner: h.corner },
              )
            }
            onDuplicate={duplicateSelected}
            onShape={() => setSheet('shape')}
            onSize={() => setSheet('size')}
            onSettings={() => setSheet('settings')}
            onToggleLock={toggleLock}
            onDelete={deleteSelected}
            onClose={() => setSelectedId(null)}
          />
        )}
        <MeasureOverlay measure={measure} fmt={(m) => fmtLen(m, 2)} />
      </SatCanvas>

      {/* placement guidance */}
      {placing && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
          }}
        >
          <div className="hint-bar" role="status">
            <MousePointerClick />
            <span>
              Click to place {placing.label} · <kbd className="dark">Esc</kbd> to cancel
            </span>
          </div>
        </div>
      )}

      {/* bottom-left tools */}
      <div
        className="tool-rail dark"
        style={{ left: 14, bottom: 92 }}
        role="group"
        aria-label="Obstruction tools"
      >
        <button
          className={`tool-btn ${placing ? 'accent' : ''}`}
          data-tip="Add obstruction"
          data-tip-right=""
          aria-label="Add obstruction"
          onClick={() => setSheet('pick')}
        >
          <Plus />
          {project.obstructions.length > 0 && (
            <span className="count">{project.obstructions.length}</span>
          )}
        </button>
        <button
          className={`tool-btn ${hidden ? 'on' : ''}`}
          data-tip={hidden ? 'Show obstructions' : 'Hide obstructions'}
          data-tip-right=""
          aria-label={hidden ? 'Show obstructions' : 'Hide obstructions'}
          aria-pressed={hidden}
          onClick={() => {
            setHidden((v) => !v);
            setSelectedId(null);
          }}
        >
          {hidden ? <EyeOff /> : <Eye />}
        </button>
        <button
          className={`tool-btn ${showMeasurements ? 'on' : ''}`}
          data-tip={'Measurements\nShow every roof edge length'}
          data-tip-right=""
          aria-label="Show all measurements"
          aria-pressed={showMeasurements}
          onClick={() => setShowMeasurements((v) => !v)}
        >
          <RulerDimensionLine />
        </button>
        <button
          className={`tool-btn ${measure.active ? 'on' : ''}`}
          data-tip={'Measure distance\nClick two points'}
          data-tip-right=""
          aria-label="Measure distance"
          aria-pressed={measure.active}
          onClick={measure.toggle}
        >
          <PencilRuler />
        </button>
        <button
          className="tool-btn"
          data-tip="3D view"
          data-tip-right=""
          aria-label="Open 3D view"
          onClick={() => setShow3D(true)}
        >
          <Box />
        </button>
      </div>

      {sheet === 'pick' && (
        <Sheet title="Add obstruction" icon={<Plus size={16} />} onClose={() => setSheet(null)}>
          <style>{`
            .obx-card { transition: border-color var(--t-fast), background var(--t-fast), transform var(--t-fast); }
            .obx-card:hover { border-color: var(--info); background: var(--paper-2); transform: translateY(-1px); }
            .obx-card:hover .obx-ic { color: var(--info); }
          `}</style>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 10,
            }}
          >
            {OBSTRUCTION_TYPES.map((t) => (
              <button
                key={t.type}
                className="card obx-card"
                style={{ textAlign: 'center', padding: '14px 8px', cursor: 'pointer' }}
                onClick={() => {
                  setPlacing(t);
                  setHidden(false);
                  setSheet(null);
                }}
              >
                <span
                  className="obx-ic"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: 'var(--paper-2)',
                    color: 'var(--ink-2)',
                    transition: 'color var(--t-fast)',
                  }}
                >
                  <t.icon size={18} />
                </span>
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>
                  {t.label} {t.beta && <span className="badge badge-beta">BETA</span>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                  {t.size[0]}×{t.size[1]}×{t.size[2]} m
                </div>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {sheet === 'shape' && selected && (
        <Sheet title="Shape" icon={<Shapes size={16} />} onClose={() => setSheet(null)}>
          <OptionCard
            title="Rectangle"
            sub="Rectangular shape with length and width"
            icon={<Square size={18} />}
            selected={selected.shape === 'rect'}
            onClick={() => update(selected.id, { shape: 'rect' })}
          />
          <OptionCard
            title="Circle"
            sub="Circular shape with diameter"
            icon={<CircleIcon size={18} />}
            selected={selected.shape === 'circle'}
            onClick={() => update(selected.id, { shape: 'circle' })}
          />
        </Sheet>
      )}

      {sheet === 'size' && selected && (
        <Sheet
          title="Size"
          icon={<Ruler size={16} />}
          onClose={() => setSheet(null)}
          right={
            <UnitToggle
              unit={units === 'imperial' ? 'ft' : 'm'}
              onChange={(u) => setUnits(u === 'ft' ? 'imperial' : 'metric')}
            />
          }
        >
          {selected.shape === 'rect' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Length ({lenUnit})</label>
                <input
                  type="number"
                  step={0.1}
                  value={toDisplay(selected.lengthM)}
                  onChange={(e) => update(selected.id, { lengthM: fromDisplay(Number(e.target.value)) })}
                />
              </div>
              <div className="field">
                <label>Width ({lenUnit})</label>
                <input
                  type="number"
                  step={0.1}
                  value={toDisplay(selected.widthM)}
                  onChange={(e) => update(selected.id, { widthM: fromDisplay(Number(e.target.value)) })}
                />
              </div>
              <div className="field">
                <label>Height ({lenUnit})</label>
                <input
                  type="number"
                  step={0.1}
                  value={toDisplay(selected.heightM)}
                  onChange={(e) => update(selected.id, { heightM: fromDisplay(Number(e.target.value)) })}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Diameter ({lenUnit})</label>
                <input
                  type="number"
                  step={0.1}
                  value={toDisplay(selected.diameterM)}
                  onChange={(e) => update(selected.id, { diameterM: fromDisplay(Number(e.target.value)) })}
                />
              </div>
              <div className="field">
                <label>Height ({lenUnit})</label>
                <input
                  type="number"
                  step={0.1}
                  value={toDisplay(selected.heightM)}
                  onChange={(e) => update(selected.id, { heightM: fromDisplay(Number(e.target.value)) })}
                />
              </div>
            </div>
          )}
          <SliderRow
            label="Rotation"
            value={selected.rotationDeg}
            min={0}
            max={359}
            step={1}
            unit="°"
            onChange={(v) => update(selected.id, { rotationDeg: v })}
          />
        </Sheet>
      )}

      {sheet === 'settings' && selected && (
        <Sheet title="Settings" icon={<Settings2 size={16} />} onClose={() => setSheet(null)}>
          <SliderRow
            label="Setback"
            value={selected.setbackM}
            min={0}
            max={3}
            step={0.1}
            unit={lenUnit}
            format={(v) => lenValue(v, 1)}
            onChange={(v) => update(selected.id, { setbackM: v })}
            hint="Buffer zone where panels cannot be placed"
          />
          <ToggleRow
            label="Casts shadow"
            on={selected.castsShadow}
            onChange={(v) => update(selected.id, { castsShadow: v })}
          />
          <ToggleRow
            label="Blocks panel placement"
            on={selected.blocksPlacement}
            onChange={(v) => update(selected.id, { blocksPlacement: v })}
          />
          {selected.blocksPlacement &&
            (() => {
              const caps = resolveCapabilities(selected);
              const setCap = (patch: Partial<typeof caps>) =>
                update(selected.id, {
                  capabilities: { ...selected.capabilities, ...patch },
                });
              return (
                <div className="card" style={{ background: 'var(--paper-2)', marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: 'var(--ink-3)', marginBottom: 4 }}>
                    BRIDGING (§ structure may span above)
                  </div>
                  <ToggleRow
                    label="Panels may bridge above"
                    on={caps.panelsMayCross}
                    onChange={(v) => setCap({ panelsMayCross: v })}
                  />
                  {caps.panelsMayCross && (
                    <>
                      <ToggleRow
                        label="Must remain open to sky"
                        on={caps.mustRemainOpenToSky}
                        onChange={(v) => setCap({ mustRemainOpenToSky: v })}
                      />
                      {!caps.mustRemainOpenToSky && (
                        <>
                          <SliderRow
                            label="Clearance above it"
                            value={caps.minVerticalClearanceM}
                            min={0}
                            max={1}
                            step={0.05}
                            unit="m"
                            format={(v) => v.toFixed(2)}
                            onChange={(v) => setCap({ minVerticalClearanceM: v })}
                            hint={`Bridgeable when the array structure clears ${requiredBridgeClearanceM(selected).toFixed(2)} m (its ${selected.heightM.toFixed(2)} m + margin)`}
                          />
                          {caps.requiresEngineerConfirmation && (
                            <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>
                              Bridging over this is flagged for engineer confirmation.
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          {(() => {
            // §26e tight-space: the obstruction BECOMES a stacked roof at its
            // own top height — panels then mount ON it via the normal roof
            // pipeline (stacking/shading/BOM). One undoable patch.
            const conversion = obstructionToPlatform(project, selected.id);
            return (
              <>
                <button
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 10 }}
                  disabled={!conversion}
                  onClick={() => {
                    if (!conversion) return;
                    patch(conversion, true);
                    setSheet(null);
                    setSelectedId(null);
                  }}
                >
                  Convert to rooftop platform (mount panels on top)
                </button>
                <span className="hint" style={{ display: 'block', marginTop: 4 }}>
                  {conversion
                    ? `Replaces this obstruction with a “${selected.label} platform” roof at ${((roofOf(selected)?.heightM ?? 0) + selected.heightM).toFixed(1)} m — place panels on it like any roof. Structural adequacy of the platform needs engineer verification.`
                    : 'Top surface is too small to become a usable roof.'}
                </span>
              </>
            );
          })()}
          <div
            className="card"
            style={{ background: 'var(--paper-2)', marginTop: 8, fontSize: 12.5 }}
          >
            <div
              style={{
                fontWeight: 700,
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ruler size={13} aria-hidden />
              HEIGHT INFO
            </div>
            <Row k="Placement" v={roofOf(selected)?.name ?? 'On ground'} />
            <Row k="Base surface" v={fmtLen(roofOf(selected)?.heightM ?? 0, 1)} />
            <Row
              k="Top from ground"
              v={fmtLen((roofOf(selected)?.heightM ?? 0) + selected.heightM, 1)}
              strong
            />
          </div>
          {SelectedIcon && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 10,
                fontSize: 11.5,
                color: 'var(--ink-3)',
              }}
            >
              <SelectedIcon size={12} aria-hidden />
              {typeOf(selected)?.label} · {selected.label}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '3px 0',
        fontWeight: strong ? 700 : 400,
      }}
    >
      <span style={{ color: 'var(--ink-3)' }}>{k}:</span>
      <span>{v}</span>
    </div>
  );
}

function RoofBackdrop({
  showMeasurements,
  fmt,
}: {
  showMeasurements: boolean;
  fmt: (m: number) => string;
}) {
  const project = useActiveProject()!;
  const frame = useCanvasFrame();
  return (
    <>
      {project.roofs.map((r) => {
        const insetRegions = insetPolygonRobust(
          r.polygon,
          r.perEdgeSetbacksM ?? r.polygon.map(() => r.setbackM),
        );
        return (
          <g key={r.id}>
            <path
              d={polyPath(frame, r.polygon)}
              fill="rgba(59,130,246,0.3)"
              stroke="#3b82f6"
              strokeWidth={1.5}
            />
            {insetRegions.map((reg, ri) => (
              <path
                key={ri}
                d={polyPath(frame, reg)}
                fill="none"
                stroke="#f87171"
                strokeWidth={1.2}
                strokeDasharray="6 4"
              />
            ))}
            {showMeasurements && <EdgeLabels poly={r.polygon} fmt={fmt} />}
          </g>
        );
      })}
    </>
  );
}

/** Resize + rotate handles and the floating context bar for the selection. */
function SelectionOverlay({
  o,
  locked,
  typeLabel,
  onHandle,
  onDuplicate,
  onShape,
  onSize,
  onSettings,
  onToggleLock,
  onDelete,
  onClose,
}: {
  o: Obstruction;
  locked: boolean;
  typeLabel: string;
  onHandle: (h: HandleDrag) => void;
  onDuplicate: () => void;
  onShape: () => void;
  onSize: () => void;
  onSettings: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const frame = useCanvasFrame();
  const z = frame.zoom;
  const mpx = frame.sizePx / frame.spanM; // logical px per meter
  const c = frame.toPx(o.center);
  const halfHM = (o.shape === 'rect' ? o.widthM : o.diameterM) / 2;

  function handleDown(e: ReactPointerEvent, h: HandleDrag) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    onHandle(h);
  }

  const corners =
    o.shape === 'rect'
      ? rectCorners(o.center, o.lengthM, o.widthM, o.rotationDeg).map((p) => frame.toPx(p))
      : [];
  const east =
    o.shape === 'circle' ? frame.toPx(add(o.center, { x: o.diameterM / 2, y: 0 })) : null;
  const rotAnchor = frame.toPx(add(o.center, rotate({ x: 0, y: halfHM }, o.rotationDeg)));
  const rotHandle = frame.toPx(add(o.center, rotate({ x: 0, y: halfHM + 1.2 }, o.rotationDeg)));

  const hs = 9 / z; // corner handle size, constant on screen
  const sw = 1.6 / z;

  // clearance below the object (incl. setback ring) for the context bar
  const bodyRM =
    o.shape === 'circle' ? o.diameterM / 2 : Math.hypot(o.lengthM, o.widthM) / 2;
  const ringRM =
    (o.shape === 'circle' ? o.diameterM : Math.max(o.lengthM, o.widthM)) / 2 +
    (o.blocksPlacement ? o.setbackM : 0);
  const barY = Math.max(bodyRM, ringRM) * mpx * z + 16; // screen px inside counter-scaled group

  return (
    <>
      {!locked && (
        <g>
          <line
            x1={rotAnchor.x}
            y1={rotAnchor.y}
            x2={rotHandle.x}
            y2={rotHandle.y}
            stroke="#facc15"
            strokeWidth={1.2 / z}
            strokeDasharray={`${3 / z} ${3 / z}`}
          />
          <circle
            cx={rotHandle.x}
            cy={rotHandle.y}
            r={6 / z}
            fill="#fff"
            stroke="#facc15"
            strokeWidth={sw}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => handleDown(e, { kind: 'rotate' })}
          />
          {corners.map((p, i) => (
            <rect
              key={i}
              x={p.x - hs / 2}
              y={p.y - hs / 2}
              width={hs}
              height={hs}
              rx={1.5 / z}
              fill="#fff"
              stroke="#facc15"
              strokeWidth={sw}
              style={{ cursor: i % 2 === 0 ? 'nwse-resize' : 'nesw-resize' }}
              onPointerDown={(e) => handleDown(e, { kind: 'resize', corner: i })}
            />
          ))}
          {east && (
            <circle
              cx={east.x}
              cy={east.y}
              r={5.5 / z}
              fill="#fff"
              stroke="#facc15"
              strokeWidth={sw}
              style={{ cursor: 'ew-resize' }}
              onPointerDown={(e) => handleDown(e, { kind: 'resize', corner: -1 })}
            />
          )}
        </g>
      )}

      {/* floating context bar — counter-scaled so it stays screen-sized */}
      <g transform={`translate(${c.x} ${c.y}) scale(${1 / z})`}>
        <foreignObject x={-240} y={barY} width={480} height={56} style={{ overflow: 'visible' }}>
          <div
            style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <div
              className="context-bar"
              style={{ position: 'static' }}
              role="toolbar"
              aria-label={`${typeLabel} ${o.label} actions`}
            >
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--editor-ink)',
                  padding: '0 6px 0 10px',
                  whiteSpace: 'nowrap',
                }}
              >
                {typeLabel} · {o.label}
              </span>
              <div className="sep" />
              <button
                className="tool-btn"
                data-tip="Duplicate"
                aria-label="Duplicate"
                onClick={onDuplicate}
              >
                <Copy />
              </button>
              <button
                className="tool-btn"
                data-tip={locked ? 'Unlock to edit shape' : 'Shape'}
                aria-label="Shape"
                disabled={locked}
                style={{ opacity: locked ? 0.35 : 1 }}
                onClick={onShape}
              >
                <Shapes />
              </button>
              <button
                className="tool-btn"
                data-tip={locked ? 'Unlock to resize' : 'Size & rotation'}
                aria-label="Size and rotation"
                disabled={locked}
                style={{ opacity: locked ? 0.35 : 1 }}
                onClick={onSize}
              >
                <Ruler />
              </button>
              <button
                className="tool-btn"
                data-tip="Settings"
                aria-label="Settings"
                onClick={onSettings}
              >
                <Settings2 />
              </button>
              <div className="sep" />
              <button
                className={`tool-btn ${locked ? 'on' : ''}`}
                data-tip={locked ? 'Unlock' : 'Lock'}
                aria-label={locked ? 'Unlock' : 'Lock'}
                aria-pressed={locked}
                onClick={onToggleLock}
              >
                {locked ? <Lock /> : <LockOpen />}
              </button>
              <button
                className="tool-btn"
                data-tip={locked ? 'Unlock to delete' : 'Delete\nDel'}
                aria-label="Delete"
                disabled={locked}
                style={{ opacity: locked ? 0.35 : 1, color: locked ? undefined : '#f87171' }}
                onClick={onDelete}
              >
                <Trash2 />
              </button>
              <div className="sep" />
              <button
                className="tool-btn"
                data-tip={'Deselect\nEsc'}
                aria-label="Deselect"
                onClick={onClose}
              >
                <X />
              </button>
            </div>
          </div>
        </foreignObject>
      </g>
    </>
  );
}

export function ObstructionLayer({
  obstructions,
  selectedId,
  onDown,
}: {
  obstructions: Obstruction[];
  selectedId?: string | null;
  onDown?: (id: string) => void;
}) {
  const frame = useCanvasFrame();
  const pxPerM = frame.sizePx / frame.spanM;
  return (
    <>
      {obstructions.map((o) => {
        const c = frame.toPx(o.center);
        const sel = o.id === selectedId;
        const setbackR =
          ((o.shape === 'circle' ? o.diameterM : Math.max(o.lengthM, o.widthM)) / 2 +
            o.setbackM) *
          pxPerM;
        return (
          <g
            key={o.id}
            style={{ cursor: onDown ? 'move' : undefined }}
            onPointerDown={(e) => {
              if (!onDown) return;
              e.stopPropagation();
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              onDown(o.id);
            }}
          >
            {o.blocksPlacement && (
              <circle
                cx={c.x}
                cy={c.y}
                r={setbackR}
                fill="rgba(248,113,113,0.12)"
                stroke="#f87171"
                strokeWidth={0.8}
                strokeDasharray="4 3"
              />
            )}
            {o.shape === 'rect' ? (
              <RectShape o={o} sel={sel} />
            ) : (
              <circle
                cx={c.x}
                cy={c.y}
                r={(o.diameterM / 2) * pxPerM}
                fill={sel ? 'rgba(250,204,21,0.5)' : 'rgba(30,41,59,0.75)'}
                stroke={sel ? '#facc15' : '#e2e8f0'}
                strokeWidth={1.5}
              />
            )}
            {/* ID chip: constant screen size so it never blocks the view when zoomed */}
            <g transform={`translate(${c.x}, ${c.y}) scale(${1 / frame.zoom})`}>
              <rect x={-15} y={-22} width={30} height={13} rx={3} fill="#0f172a" />
              <text
                x={0}
                y={-12}
                textAnchor="middle"
                fill="#fff"
                fontSize={8.5}
                fontWeight={700}
              >
                {o.label}
              </text>
            </g>
          </g>
        );
      })}
    </>
  );
}

function RectShape({ o, sel }: { o: Obstruction; sel: boolean }) {
  const frame = useCanvasFrame();
  const corners = rectCorners(o.center, o.lengthM, o.widthM, o.rotationDeg);
  return (
    <path
      d={polyPath(frame, corners)}
      fill={sel ? 'rgba(250,204,21,0.5)' : 'rgba(30,41,59,0.75)'}
      stroke={sel ? '#facc15' : '#e2e8f0'}
      strokeWidth={1.5}
    />
  );
}
