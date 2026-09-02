import { describe, expect, it } from 'vitest';
import type { SiteSurround } from '../../types';
import { roofHeightIssues } from '../surround-check';
import { fixtureProject, fixtureRoof } from './fixtures/project';

function withReading(read: Record<string, number> | undefined) {
  const p = { ...fixtureProject(0), roofs: [fixtureRoof({ heightM: 3 })] };
  return { ...p, surround: read ? ({ roofReadM: read } as unknown as SiteSurround) : null };
}

describe('roofHeightIssues — the model held against the aerial height map', () => {
  it('warns when the map reads far from the model, in plain words', () => {
    const issues = roofHeightIssues(withReading({ roof_1: 6.5 }));
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('warn');
    expect(issues[0].code).toBe('roof_height_vs_map');
    expect(issues[0].message).toContain('3.0 m in the model');
    expect(issues[0].message).toContain('≈ 6.5 m');
    expect(issues[0].message).toContain('taller by 3.5 m');
  });

  it('stays quiet within the tolerance, without a reading, or without a surround', () => {
    expect(roofHeightIssues(withReading({ roof_1: 4.2 }))).toEqual([]);
    expect(roofHeightIssues(withReading({}))).toEqual([]);
    expect(roofHeightIssues(withReading(undefined))).toEqual([]);
  });
});
