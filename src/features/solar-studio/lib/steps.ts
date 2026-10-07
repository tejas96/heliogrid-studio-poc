// ─── Wizard step numbers, named once ────────────────────────────────────────
// Every link, gate and help line that names a step reads it from here. The
// numbers used to be literals in a dozen screens, so inserting Structure & BOM
// after the editor meant hunting each `/wizard/9` by hand — and a missed one
// sends the user to the wrong commercial screen.

export const STEP = {
  setup: 1,
  roof: 2,
  obstructions: 3,
  components: 4,
  autoDesign: 5,
  editor: 6,
  structureBom: 7,
  proposal: 8,
  drawings: 9,
  done: 10,
} as const;

export const STEP_COUNT = 10;

/** Path of a wizard step, for `navigate`. */
export const stepPath = (step: number): string => `/wizard/${step}`;

/**
 * Saved projects carry the step they were last on. Before Structure & BOM
 * existed, 7 was Proposal, 8 Drawings and 9 BOM; this maps an old number to
 * the screen it meant. Applied once, on load, by `normalizeProject`.
 */
export function migrateWizardStep(step: number, stepsVersion: number | undefined): number {
  if ((stepsVersion ?? 1) >= 2) return step;
  if (step === 7) return STEP.proposal;
  if (step === 8) return STEP.drawings;
  if (step === 9) return STEP.structureBom;
  return step;
}

/** Current numbering. Bump when the order changes, and extend the migration. */
export const STEPS_VERSION = 2;
