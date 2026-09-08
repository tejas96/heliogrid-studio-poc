// ─── The wizard's step gate, defined once ───────────────────────────────────
// "How far may this project go?" is asked from more than one screen: the
// wizard's Next, the wizard's deep-link guard, and the project list's
// "Show Proposal" shortcut, which used to jump straight past all of it. The
// predicate lives HERE rather than inside Wizard.tsx so those callers cannot
// drift — a second, subtly different gate is how two answers to one question
// get shipped (§A0), and the second answer is the one that issues a
// GST-inclusive quote for a design that cannot legally exist.
import type { Project } from '../types';
import { electricalGate } from './electrical/gate';

/** Per-step gate: returns a blocking message or null when Next is allowed. */
export function nextBlocker(step: number, p: Project): string | null {
  switch (step) {
    case 1:
      if (!p.info.state) return 'Select a state to continue';
      if (!p.location?.confirmed) return 'Confirm the installation location to continue';
      return null;
    case 2:
      return p.roofs.length === 0 ? 'Draw at least one roof to continue' : null;
    case 4:
      if (!p.components.panel) return 'Select a panel to continue';
      if (!p.components.inverter) return 'Select an inverter to continue';
      if (p.components.targetKwp <= 0) return 'Set a target capacity to continue';
      return null;
    case 6: {
      if (p.panels.filter((x) => x.enabled).length === 0)
        return 'Place at least one panel to continue';
      // THE HARD GATE (plan §B/§9): the proposal, SLD and quote are where a
      // mistake leaves the building. Held on the editor's own Next, so the
      // user stays on the screen that can fix it. This also drives
      // `stepGate`, so a design that becomes invalid later cannot sit on a
      // downstream step showing numbers derived from strings that can't exist.
      const gate = electricalGate(p);
      return gate
        ? gate.message + (gate.autoStringable ? ' — use Stringing → Auto string' : '')
        : null;
    }
    default:
      return null;
  }
}

export interface StepGate {
  /** highest step this project may be shown; 10 = every gate passes */
  allowedStep: number;
  /** why it stops there, in the user's language — null when nothing blocks */
  blocker: string | null;
}

/**
 * Prerequisite gating: a step reached via deep link or stale state without its
 * required data would crash (e.g. Step 6 reading a null panel spec). The
 * highest viewable step is the first one whose "Next" requirements aren't met.
 * `allowedStep === 10` is the ONLY state in which the commercial documents —
 * the proposal and the quote — may be reached.
 */
export function stepGate(p: Project): StepGate {
  for (let s = 1; s <= 9; s++) {
    const blocker = nextBlocker(s, p);
    if (blocker) return { allowedStep: s, blocker };
  }
  return { allowedStep: 10, blocker: null };
}
