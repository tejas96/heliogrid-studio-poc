// ─── The hard gate: an invalid electrical design may not reach a customer ───
// Every check in this phase detects broken designs. This is the piece that
// STOPS them: the proposal, the SLD and the quote are the moment a mistake
// leaves the building, and the audit's worst finding was exactly that — a
// physically impossible 2794 V string printed on a DISCOM sheet, no warning.
//
// Deliberately a BLOCK, not a warning: warnings are read by the person who
// already knows. The block is placed on Step 6's Next, so the user is held IN
// the editor — the one screen where the problem is fixable — rather than
// bounced from a downstream screen with nowhere to go.
import type { Project } from '../../types';
import { validateSystem } from '../stringing';
import { resolveDesignTemps } from './temps';

export interface ElectricalGate {
  /** the reason, in the user's language */
  message: string;
  /** true when "Auto-string now" would plausibly resolve it */
  autoStringable: boolean;
}

/**
 * Why the design may not proceed to the proposal — or null when it may.
 * Pure: the wizard, the tests and any future engineering-pack export all ask
 * the same function, so "is this design issuable?" has exactly one answer.
 */
export function electricalGate(project: Project): ElectricalGate | null {
  const panel = project.components.panel;
  const inverter = project.components.inverter;
  const enabled = project.panels.filter((p) => p.enabled);
  if (!panel || !inverter || enabled.length === 0) return null; // earlier steps own these

  const issues = validateSystem(
    project.strings,
    panel,
    inverter,
    project.components.inverterCount,
    enabled.length,
    resolveDesignTemps(project),
    enabled.map((p) => p.id),
  );
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length === 0) return null;

  // Lead with the unstrung case: it is the most common, the most fixable, and
  // the one with a one-click answer. Other errors (over-voltage, MPPT
  // overflow) need a human decision, so they are quoted as-is.
  const unstrung = errors.find((e) => e.code === 'unstrung_panels');
  const lead = unstrung ?? errors[0];
  return {
    message:
      errors.length > 1
        ? `${lead.message} (and ${errors.length - 1} more electrical error${errors.length > 2 ? 's' : ''})`
        : lead.message,
    autoStringable: !!unstrung || errors.every((e) => e.code === 'unstrung_panels'),
  };
}
