// ─── Components operation: panel, inverter, count, topology, MLPE, target ──
// A panel swap is not a field write: a different module changes the lattice,
// so every table is re-laid with it — nothing overlaps, and layoutFp re-keys
// so captures go honestly stale.
import type { Components, DesignDecision, Project } from '../../types';
import { defineOp } from './types';
import { registerOp } from './registry';
import { genId } from '../geo';
import { panelFootprintM } from '../layout';
import { respaceSegment } from '../segment-ops';

/** The first changed key names the undo step. */
function labelFor(a: Partial<Components>): string {
  if (a.panel) return `Panel: ${a.panel.brand} ${a.panel.model}`;
  if (a.inverter) return `Inverter: ${a.inverter.model}`;
  if (a.inverterCount != null) return `Inverters ×${a.inverterCount}`;
  if (a.targetKwp != null) return `Capacity ${a.targetKwp} kWp`;
  if (a.inverterTopology) return `Topology: ${a.inverterTopology}`;
  if (a.mlpe) return `MLPE: ${a.mlpe}`;
  return 'Components';
}

export const componentsSet = defineOp<Partial<Components>>({
  id: 'components.set',
  layer: 'electrical',
  label: labelFor,
  apply: (p, a) => {
    const components: Components = { ...p.components, ...a };
    const patch: Partial<Project> = { components };
    const swapped = !!a.panel && a.panel.id !== p.components.panel?.id;
    if (!swapped || p.segments.length === 0) return patch;

    const spec = a.panel!;
    let panels = p.panels;
    const segments = [...p.segments];
    const log: DesignDecision[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const roof = p.roofs.find((r) => r.id === seg.roofId);
      if (!roof) continue;
      const pitch =
        seg.racking.kind !== 'flush'
          ? seg.racking.rowPitchM
          : panelFootprintM(spec, seg.orientation).h + seg.moduleGapM;
      const view: Project = { ...p, components, panels };
      const res = respaceSegment(view, roof, spec, seg, pitch);
      if (!res) {
        log.push({
          id: genId('dd'),
          topic: 'Panel swap',
          choice: seg.label,
          reason: 'No room to re-lay with the new module — kept the previous layout; check for overlaps',
          inputs: [spec.model],
        });
        continue;
      }
      segments[i] = res.segment;
      panels = [...panels.filter((m) => m.segmentId !== seg.id), ...res.panels];
    }
    patch.panels = panels;
    patch.segments = segments;
    if (log.length) patch.designLog = [...(p.designLog ?? []), ...log];
    return patch;
  },
});

registerOp(componentsSet);
