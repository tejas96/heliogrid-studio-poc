// ─── Step 7 · the Structure view ────────────────────────────────────────────
// Tables on the left, the SAME 3D scene as the editor in the middle (in
// structure mode: a click picks a table or a steel part, nothing else), every
// structure control on the right, and the whole site's take-off under the 3D.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../../types';
import { Scene3D, type StructureSceneMode } from '../../three/Scene3D';
import { LegPlanEditor } from '../../three/LegPlanEditor';
import { MmsConfiguration } from '../../components/mms/MmsConfiguration';
import { MmsEngineeringPanel } from '../../components/mms/MmsEngineeringPanel';
import { MmsComponentDetails } from '../../components/mms/MmsComponentDetails';
import { X } from 'lucide-react';
import { useUnits } from '../../store/useUnits';
import { deriveStructures, deriveBomResult, deriveMoney, designFreshness } from '../../lib/derive';
import { validateMms } from '../../lib/mms/validate';
import { mmsEngineering } from '../../lib/mms/engineering';
import { fastenerTotals, resolveRacking } from '../../lib/structure';
import { sectionState } from '../../lib/bom/view';
import {
  describePart,
  partGroups,
  steelTakeoff,
  tableRows,
  type PartKey,
  type PartReadout,
} from '../../lib/structure-step';
import { navigate } from '../../router';
import { STEP, stepPath } from '../../lib/steps';
import { useStructureActions } from './useStructureActions';
import { TableRail } from './TableRail';
import { StructureInspector, type DetailDialog } from './StructureInspector';
import { StepDialog } from './StepDialog';

type PanelVis = 'show' | 'ghost' | 'hide';
const EMPTY: ReadonlySet<string> = new Set();

export function StructureView({ project }: { project: Project }) {
  const { fmtLen } = useUnits();
  const structures = deriveStructures(project);
  const findings = useMemo(() => validateMms(project, structures), [project, structures]);
  const rows = useMemo(() => tableRows(project, structures, findings, fmtLen), [project, structures, findings, fmtLen]);

  // ── selection: the tables the editor sent (`?tables=`), else the first;
  // tables that vanish drop out ────────────────────────────────────────────
  const [picked, setPicked] = useState<string[] | null>(() => {
    if (typeof window === 'undefined') return null;
    const sent = new URLSearchParams(window.location.search).get('tables');
    return sent ? sent.split(',').filter(Boolean) : null;
  });
  const selectedIds = useMemo(() => {
    const live = new Set(rows.map((r) => r.segId));
    const base = picked ?? (rows[0] ? [rows[0].segId] : []);
    return base.filter((id) => live.has(id));
  }, [picked, rows]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedRows = useMemo(() => rows.filter((r) => selectedSet.has(r.segId)), [rows, selectedSet]);
  const selectedStructures = useMemo(
    () => structures.filter((s) => selectedSet.has(s.segmentId)),
    [structures, selectedSet],
  );

  const [panelVis, setPanelVis] = useState<PanelVis>('ghost');
  const [part, setPart] = useState<PartKey | null>(null);
  const [issueIds, setIssueIds] = useState<string[] | null>(null);
  const [hover, setHover] = useState<PartReadout | null>(null);
  const [dialog, setDialog] = useState<DetailDialog | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'info' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);
  const report = useCallback((text: string, tone: 'ok' | 'info') => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  const actions = useStructureActions(selectedIds, report);

  // ── what lights up: a check's parts, else the chosen part group ───────────
  const groups = useMemo(() => partGroups(selectedStructures), [selectedStructures]);
  const litIds = useMemo<ReadonlySet<string>>(() => {
    if (issueIds) return new Set(issueIds);
    const g = part ? groups.find((x) => x.key === part) : null;
    return g ? new Set(g.ids) : EMPTY;
  }, [issueIds, part, groups]);

  const onTableClick = useCallback((segId: string, additive: boolean) => {
    setIssueIds(null);
    setPicked((cur) => {
      const now = cur ?? [];
      if (!additive) return [segId];
      return now.includes(segId) ? now.filter((x) => x !== segId) : [...now, segId];
    });
  }, []);
  // a clicked part is PINNED: its full details stay up until closed
  const [pinned, setPinned] = useState<{ segId: string; id: string } | null>(null);
  const onPartClick = useCallback((segId: string, partId: string) => {
    setPicked((cur) => ((cur ?? []).includes(segId) ? cur : [segId]));
    setPinned({ segId, id: partId });
  }, []);
  const onPartHover = useCallback(
    (segId: string | null, partId: string | null) =>
      setHover(segId && partId ? describePart(project, structures, segId, partId) : null),
    [project, structures],
  );
  const structureMode = useMemo<StructureSceneMode>(
    () => ({ selectedSegIds: selectedSet, panelVis, litIds, onTableClick, onPartClick, onPartHover }),
    [selectedSet, panelVis, litIds, onTableClick, onPartClick, onPartHover],
  );
  const scenePanelIds = useMemo(
    () => project.panels.filter((p) => p.segmentId && selectedSet.has(p.segmentId)).map((p) => p.id),
    [project.panels, selectedSet],
  );

  // ── the site take-off under the 3D: same derivations the BOM prices ───────
  const site = useMemo(() => {
    const steel = steelTakeoff(structures);
    const hw = fastenerTotals(structures);
    const footings = structures.reduce((n, s) => n + s.nodes.filter((x) => x.kind === 'roof_anchor').length, 0);
    const loads = mmsEngineering(project, structures).roofs;
    const addedKg = loads.reduce((a, r) => a + r.memberKg + r.foundationKg, 0);
    const lines = deriveBomResult(project).lines;
    const mech = sectionState('Mechanical BOS', lines.filter((l) => l.category === 'Mechanical BOS'), project).total;
    return { steel, hw, footings, addedKg, mech, total: deriveMoney(project).total };
  }, [project, structures]);
  const fresh = designFreshness(project).all;
  const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

  const first = selectedRows[0] ? project.segments.find((s) => s.id === selectedRows[0].segId) : undefined;
  const firstRoof = first ? project.roofs.find((r) => r.id === first.roofId) : undefined;
  const spec = project.components.panel;

  return (
    <div className="ds flex min-h-0 flex-1 text-text">
      <TableRail
        rows={rows}
        selected={selectedSet}
        onToggle={(id) => onTableClick(id, true)}
        onOnly={(id) => onTableClick(id, false)}
        onAll={() => setPicked(rows.map((r) => r.segId))}
        onNone={() => setPicked([])}
        panelVis={panelVis}
        onPanelVis={setPanelVis}
        parts={groups}
        part={part}
        onPart={(k) => {
          setIssueIds(null);
          setPart(k);
        }}
      />

      <main aria-label="3D structure view" className="flex min-w-0 flex-1 flex-col bg-surface-canvas">
        <div className="relative min-h-0 flex-1">
          {/* the scene stacks its own chrome up to z-50; isolate it so the
              step's readout and messages can sit above it */}
          <div className="absolute inset-0 isolate">
            <Scene3D selectedIds={scenePanelIds} structureMode={structureMode} />
          </div>
          {/* what the pointer is on — a part's name, section, length and weight */}
          <div
            aria-live="polite"
            className="pointer-events-none absolute top-4 left-16 z-20 flex max-w-md flex-col rounded-md bg-surface-canvas-panel px-3 py-2 text-on-canvas shadow-2"
          >
            {hover ? (
              <>
                <span className="text-sm font-semibold">{hover.title}</span>
                <span className="text-xs text-on-canvas-muted tabular-nums">
                  {hover.detail} · {hover.tier}
                </span>
              </>
            ) : (
              <span className="text-xs text-on-canvas-muted">
                Click a table to select it · Shift-click adds · Hover a part for its size
              </span>
            )}
          </div>
          {pinned && (
            <section
              aria-label="Selected part"
              className="absolute top-20 left-16 z-20 flex w-xs flex-col gap-2 rounded-md bg-surface-canvas-panel p-3 text-on-canvas shadow-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-on-canvas-muted">Selected part · derived from the model</span>
                <button
                  type="button"
                  onClick={() => setPinned(null)}
                  aria-label="Close part details"
                  className="flex size-6 items-center justify-center rounded-sm border border-border-canvas-strong"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
              <MmsComponentDetails project={project} segmentId={pinned.segId} componentId={pinned.id} />
            </section>
          )}
          {toast && (
            <p
              role="status"
              className={
                'absolute bottom-24 left-4 z-20 max-w-md rounded-md px-3 py-2 text-xs ' +
                (toast.tone === 'ok' ? 'bg-surface-canvas-panel text-on-canvas' : 'bg-warning-subtle text-warning')
              }
            >
              {toast.text}
            </p>
          )}
        </div>
        <section aria-label="Whole-site take-off" className="flex border-t border-border-canvas bg-surface-canvas-panel text-on-canvas">
          <DockCell label="Steel to order" value={`${site.steel.orderKg.toFixed(1)} kg`} sub={`net ${site.steel.netKg.toFixed(1)} + ${site.steel.wastePct} % waste`} />
          <DockCell label="Footings" value={String(site.footings)} sub="one per leg base" />
          <DockCell label="Bolts" value={String(site.hw.bolts)} sub="from the joint graph" />
          <DockCell label="Roof load added" value={`+${Math.round(site.addedKg).toLocaleString('en-IN')} kg`} sub="steel and footings" />
          <DockCell label="Mechanical BOS" value={inr(site.mech)} sub="with margin and GST" />
          <DockCell label="Quote total" value={inr(site.total)} sub={fresh ? 'matches the design' : 'provisional — recalculating'} strong />
        </section>
      </main>

      <StructureInspector
        project={project}
        rows={rows}
        selected={selectedRows}
        structures={selectedStructures}
        allStructures={structures}
        actions={{ choice: actions.choice, choiceEach: actions.choiceEach, setLegSpacing: actions.mms.setLegSpacing }}
        fmtLen={fmtLen}
        onOpen={setDialog}
        onShowIssue={(ids) => {
          setPart(null);
          setIssueIds(ids);
          setPanelVis('ghost');
        }}
        onClear={() => setPicked([])}
        onChangeLayout={() => navigate(stepPath(STEP.editor))}
      />

      {dialog === 'legs' && first && firstRoof && spec && first.racking.kind !== 'flush' && (
        <StepDialog
          title={`Edit legs · table ${first.label}`}
          subtitle="Plan view from above. Drag a leg to move it, or use the buttons. Arrow keys nudge the selected leg."
          onClose={() => setDialog(null)}
        >
          <LegPlanEditor
            project={project}
            roof={firstRoof}
            seg={first}
            spec={spec}
            panels={project.panels}
            legSpacingM={resolveRacking(project, firstRoof, first, spec)?.legSpacingM ?? 2}
            onPatch={(patch) => {
              const next = patch.segments?.find((s) => s.id === first.id);
              if (next) actions.setLegPlan(first.id, next.legPlan, next.legPlan ? 'Edit legs' : 'Legs back to automatic');
            }}
            fmtLen={fmtLen}
            width={680}
            height={360}
          />
        </StepDialog>
      )}
      {dialog === 'mms' && first && (
        <StepDialog
          title="Mounting system"
          subtitle={
            selectedRows.length > 1
              ? `Settings shown for table ${first.label}. Every change goes to all ${selectedRows.length} selected tables.`
              : `Table ${first.label}`
          }
          onClose={() => setDialog(null)}
        >
          <MmsConfiguration project={project} segmentId={first.id} prefix="step-mms" actions={actions.mms} />
        </StepDialog>
      )}
      {dialog === 'loads' && (
        <StepDialog
          title="Site loads"
          subtitle="Inputs for the engineer — wind, terrain, seismic zone and roof capacity. The app does not compute structural safety."
          onClose={() => setDialog(null)}
        >
          <MmsEngineeringPanel project={project} prefix="step-loads" onEngineering={actions.mms.setEngineering} />
        </StepDialog>
      )}
    </div>
  );
}

function DockCell({ label, value, sub, strong }: { label: string; value: string; sub: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 border-l border-border-canvas px-3 py-2 first:border-l-0">
      <span className="truncate text-2xs text-on-canvas-muted">{label}</span>
      <span className={'truncate text-base tabular-nums ' + (strong ? 'font-bold' : 'font-medium')}>{value}</span>
      <span className="truncate text-2xs text-on-canvas-muted" title={sub}>
        {sub}
      </span>
    </div>
  );
}
