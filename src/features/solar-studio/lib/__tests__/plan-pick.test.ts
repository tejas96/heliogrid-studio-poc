import { describe, expect, it } from 'vitest';
import { nearestPanelAt, PANEL_HIT_R } from '../plan-pick';

// The whole point of this module: the hit RADIUS (1.3 m) is wider than the
// module PITCH (1.048–1.184 m for every panel in data/panels.ts), so a tap on
// one module is inside the previous module's radius too. `find()` returned the
// earlier array entry; `nearestPanelAt` returns the one actually under the
// finger. Every assertion below fails against the old find().
describe('nearestPanelAt', () => {
  const PITCH = 1.184; // widest catalogue module (1134 mm) + the 50 mm default gap
  const row = [
    { id: 'c0', center: { x: 0, y: 0 } },
    { id: 'c1', center: { x: PITCH, y: 0 } },
    { id: 'c2', center: { x: PITCH * 2, y: 0 } },
  ];

  it('picks the module under the point, not the first one in range', () => {
    expect(PITCH).toBeLessThan(PANEL_HIT_R); // the precondition for the bug
    expect(nearestPanelAt(row, { x: PITCH, y: 0 })?.id).toBe('c1');
    expect(nearestPanelAt(row, { x: PITCH * 2, y: 0 })?.id).toBe('c2');
  });

  it('works on the other axis too — a pitched roof swaps the lattice axes', () => {
    const column = row.map((p) => ({ id: p.id, center: { x: 0, y: p.center.x } }));
    expect(nearestPanelAt(column, { x: 0, y: PITCH })?.id).toBe('c1');
  });

  it('returns nothing past the radius, and keeps the earlier entry on a tie', () => {
    expect(nearestPanelAt(row, { x: 20, y: 20 })).toBeUndefined();
    const tie = [
      { id: 'first', center: { x: 0, y: 0 } },
      { id: 'second', center: { x: 0, y: 0 } },
    ];
    expect(nearestPanelAt(tie, { x: 0.1, y: 0 })?.id).toBe('first');
  });
});
