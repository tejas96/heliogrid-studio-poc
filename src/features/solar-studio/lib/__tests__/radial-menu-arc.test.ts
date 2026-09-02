import { describe, expect, it } from 'vitest';
import { ARC, hubArcAngles, toolArcAngles } from '../../components/RadialMenu';

/**
 * The gate for the Halo menu's one real failure mode. The first draft fanned a
 * group's tools out from its own hub, so a long group reached past the sweep
 * and its buttons rendered half off the left edge of the screen — the exact
 * complaint the radial menu replaced the vertical rails to fix.
 */
describe('the radial menu never reaches outside its sweep', () => {
  it('keeps every tool inside the arc, however long the group', () => {
    for (let n = 1; n <= 14; n++) {
      for (const a of toolArcAngles(n)) {
        expect(a).toBeGreaterThanOrEqual(ARC.start - 0.001);
        expect(a).toBeLessThanOrEqual(ARC.end + 0.001);
      }
    }
  });

  it('keeps every group hub inside the arc', () => {
    for (let n = 1; n <= 8; n++) {
      for (const a of hubArcAngles(n)) {
        expect(a).toBeGreaterThanOrEqual(ARC.start - 0.001);
        expect(a).toBeLessThanOrEqual(ARC.end + 0.001);
      }
    }
  });

  it('lays both rings out top first', () => {
    expect(hubArcAngles(4)[0]).toBeGreaterThan(hubArcAngles(4)[3]);
    expect(toolArcAngles(5)[0]).toBeGreaterThan(toolArcAngles(5)[4]);
  });
});
