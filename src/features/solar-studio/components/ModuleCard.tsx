// ─── One module's card: what it is, what it makes, what takes its sun ───────
// The plan editor's answer to a tap on a module. The scene has had this since
// Phase 22 (EntityLabel + PanelYieldCard); the users on the roof — the 2D
// ones — never saw it. Same numbers, same yield split, same blocker list.
import type { Project } from '../types';
import { ObjectCard, type ObjectCardAction } from './ObjectCard';
import { PanelYieldCard, usePanelYield } from './PanelYieldCard';

export function ModuleCard({
  project,
  panelId,
  onClose,
  onTableSettings,
  onFocusBlocker,
  onEraseObstruction,
}: {
  project: Project;
  panelId: string;
  onClose: () => void;
  /** open the table sheet for the module's table */
  onTableSettings?: () => void;
  /** bring whatever takes the sun into view */
  onFocusBlocker?: (kind: string, id: string) => void;
  /** the sentence made actionable: erase the obstruction that costs the most */
  onEraseObstruction?: (id: string, label: string) => void;
}) {
  const info = usePanelYield(project, panelId);
  const panel = project.panels.find((p) => p.id === panelId);
  if (!panel || !info) return null;
  const seg = panel.segmentId ? project.segments.find((s) => s.id === panel.segmentId) : undefined;
  const mine = seg ? project.panels.filter((p) => p.segmentId === seg.id && p.enabled) : [panel];
  const wp = project.components.panel?.watt ?? 0;
  const roof = project.roofs.find((r) => r.id === panel.roofId);
  const lines = [
    seg
      ? `${mine.length} modules · ${Math.round((mine.length * wp) / 10) / 100} kWp · ${seg.rows}×${seg.cols}`
      : `1 module · ${Math.round(wp / 10) / 100} kWp · loose`,
    `${panel.tiltDeg}° · facing ${Math.round(panel.azimuthDeg)}° · ${panel.orientation}${roof ? ` · ${roof.name}` : ''}`,
  ];
  const actions: ObjectCardAction[] = [];
  if (seg && onTableSettings) actions.push({ label: 'Table…', onClick: onTableSettings });
  // the biggest obstruction blocker gets a one-tap way out — the whole point
  const worst = info.blockers.find((b) => b.kind === 'obstruction');
  if (worst && onEraseObstruction) {
    actions.push({ label: `Erase ${worst.label}`, danger: true, onClick: () => onEraseObstruction(worst.id, worst.label) });
  }
  return (
    <ObjectCard title={seg ? `Table ${seg.label}` : 'Module'} lines={lines} actions={actions} onClose={onClose}>
      <div style={{ marginTop: 8 }}>
        <PanelYieldCard info={info} onFocusBlocker={onFocusBlocker} />
      </div>
    </ObjectCard>
  );
}
