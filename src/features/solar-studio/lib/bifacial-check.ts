// ─── Is the bifacial module you are quoting actually earning its premium? ───
// A bifacial module costs more than a mono-facial one of the same wattage.
// What it buys is the light bouncing off the surface under it — and lying
// flush on a roof, its back is 10 cm from a dark surface that sits in the
// array's own shadow all day. The rear-side model says so in the report; this
// says so on the design, before anyone signs.
//
// Deliberately NOT a second calculation: it reads exactly the geometry the
// hourly engine reads (`projectRearGeometry`) and asks one question of it —
// how much sun reaches the surface the back is looking at.
import type { Project, ValidationIssue } from '../types';
import { projectRearGeometry, rearOpenness, REAR_BOXED_IN_OPENNESS } from './energy/bifacial';

export function bifacialIssues(project: Project): ValidationIssue[] {
  const spec = project.components.panel;
  if (!spec || !spec.bifacialityPct) return [];
  const enabled = project.panels.filter((p) => p.enabled);
  if (enabled.length === 0) return [];
  const { byPanel } = projectRearGeometry(project, spec, enabled);
  if (byPanel.size === 0) return [];

  const boxedIn = enabled.filter((p) => {
    const g = byPanel.get(p.id);
    return g ? rearOpenness(g) < REAR_BOXED_IN_OPENNESS : false;
  });
  if (boxedIn.length === 0) return [];
  // Only worth saying when it is most of the array; a couple of modules in a
  // tight corner is not a procurement decision.
  if (boxedIn.length < enabled.length * 0.5) return [];

  const all = boxedIn.length === enabled.length;
  return [
    {
      level: 'warn',
      code: 'bifacial_wasted',
      message:
        `${spec.brand} ${spec.model} is bifacial (${spec.bifacialityPct}% rear), but ` +
        `${all ? 'the array is' : `${boxedIn.length} of ${enabled.length} modules are`} mounted so close to the ` +
        `surface that their backs see almost no sunlight. The energy report shows what the rear side is ` +
        `actually worth here. Raise the modules, open up the row spacing, or quote a mono-facial module ` +
        `of the same wattage and keep the difference.`,
      focusPanelIds: boxedIn.map((p) => p.id),
    },
  ];
}
