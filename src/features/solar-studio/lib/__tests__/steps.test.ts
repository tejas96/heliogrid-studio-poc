import { describe, expect, it } from 'vitest';
import { migrateWizardStep, STEP, STEPS_VERSION } from '../steps';

// A project saved before Structure & BOM resumes on the screen it meant, and a
// project saved after it is never moved twice.
describe('migrateWizardStep', () => {
  it('maps the old 7/8/9 to proposal, drawings, structure & BOM', () => {
    expect(migrateWizardStep(7, undefined)).toBe(STEP.proposal);
    expect(migrateWizardStep(8, undefined)).toBe(STEP.drawings);
    expect(migrateWizardStep(9, undefined)).toBe(STEP.structureBom);
    expect(migrateWizardStep(6, undefined)).toBe(STEP.editor);
    expect(migrateWizardStep(10, undefined)).toBe(STEP.done);
  });
  it('leaves a current-numbering save alone', () => {
    expect(migrateWizardStep(7, STEPS_VERSION)).toBe(7);
    expect(migrateWizardStep(9, STEPS_VERSION)).toBe(9);
  });
});
