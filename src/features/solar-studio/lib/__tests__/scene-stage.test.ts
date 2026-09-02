import { describe, expect, it } from 'vitest';
import { newProject } from '../../store/store';
import { projectForStage } from '../scene-stage';
import type { Obstruction, PlacedPanel, Project } from '../../types';

/**
 * The gate for "an earlier step must not show a later step's work". Step 2 saw
 * the modules and the wiring; Step 3 saw the array. Both came from the scene
 * reading the whole canonical project whatever step opened it.
 */
function loaded(): Project {
  return {
    ...newProject(),
    obstructions: [{ id: 'obs_1' } as unknown as Obstruction],
    panels: [{ id: 'pan_1' } as unknown as PlacedPanel],
    strings: [{ id: 'str_1' } as unknown as Project['strings'][number]],
    inverterPlacements: [{ id: 'inv_1' } as unknown as Project['inverterPlacements'][number]],
  };
}

describe('projectForStage', () => {
  it('shows Roof Setup the roofs alone', () => {
    const p = projectForStage(loaded(), 2);
    expect(p.obstructions).toHaveLength(0);
    expect(p.panels).toHaveLength(0);
    expect(p.strings).toHaveLength(0);
    expect(p.inverterPlacements).toHaveLength(0);
  });

  it('shows Obstructions its obstructions, but not the array', () => {
    const p = projectForStage(loaded(), 3);
    expect(p.obstructions).toHaveLength(1);
    expect(p.panels).toHaveLength(0);
    expect(p.strings).toHaveLength(0);
  });

  it('leaves the full studio untouched', () => {
    const full = loaded();
    expect(projectForStage(full, undefined)).toBe(full);
    expect(projectForStage(full, 6)).toBe(full);
  });
});
