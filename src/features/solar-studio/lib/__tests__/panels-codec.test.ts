// ─── Gate: a design that computes must also be one that SAVES ───────────────
// Measured on this engine before the codec existed: a 36 ha field is 129,024
// modules, designs in 290 ms, and serialises to 34.87 MB — against roughly
// 20 MB of localStorage in this browser and 5 MB in stricter ones. The work
// was finished and correct and could not be kept, which is the worst failure
// this app has.
//
// Two things must hold, and both are silent when broken:
//
//   LOSSLESS. The packed form is a storage detail, so a reopened project must
//   be the same project. Not "close" — rounding coordinates would compress far
//   better and would move every layout fingerprint in the app, restaling
//   derived data on load. Values are compared field by field; JSON key ORDER
//   is deliberately not, because it carries no meaning and nothing in the app
//   depends on it (the fingerprints in lib/fingerprints.ts build explicit
//   arrays of named fields rather than stringifying a panel).
//
//   SMALL. A regression that quietly re-inflates the payload would not fail
//   any other test — it would just put the ceiling back, and only on the day a
//   customer had enough land.
import { describe, expect, it } from 'vitest';
import { packPanels, packProject, unpackPanels, unpackProject } from '../persistence/panels-codec';
import { fixtureProject } from './fixtures/project';
import type { PlacedPanel, Project } from '../../types';

/** One ordinary auto-designed table: same roof, same segment, same pose. */
function table(n: number, segmentId = 'seg_1', roofId = 'roof_1'): PlacedPanel[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `pv_${segmentId}_${i}`,
    roofId,
    center: { x: i * 1.134 - 47.932999, y: Math.floor(i / 40) * 2.5 + 0.000499000000004 },
    orientation: 'portrait' as const,
    azimuthDeg: 180,
    tiltDeg: 20,
    solarAccess: 1,
    enabled: true,
    segmentId,
    cellIndex: Math.floor(i / 40) * 1000 + (i % 40),
  }));
}

describe('modules survive the round trip exactly', () => {
  it('a plain table comes back field for field', () => {
    const panels = table(500);
    expect(unpackPanels(packPanels(panels))).toEqual(panels);
  });

  it('coordinates are never rounded — the fingerprint must not move', () => {
    // the exact float that came out of the real fill, binary noise and all
    const panels = table(4);
    const back = unpackPanels(packPanels(panels));
    for (let i = 0; i < panels.length; i++) {
      expect(back[i].center.x).toBe(panels[i].center.x);
      expect(back[i].center.y).toBe(panels[i].center.y);
    }
  });

  it('every awkward module survives: off, blocked, shaded, on a wall, loose', () => {
    const panels: PlacedPanel[] = [
      ...table(3),
      // the user turned this one off
      { ...table(1, 'seg_1')[0], id: 'pv_off', enabled: false, cellIndex: 9 },
      // the app turned this one off, and must remember which blocker did it
      { ...table(1, 'seg_1')[0], id: 'pv_blk', enabled: false, blockedBy: 'obs_7', cellIndex: 10 },
      // partial shade
      { ...table(1, 'seg_1')[0], id: 'pv_shade', solarAccess: 0.6217, cellIndex: 11 },
      // a FACADE module carries its height, and it is negative
      { ...table(1, 'seg_2')[0], id: 'pv_wall', mountHeightM: -7.2, cellIndex: 2003 },
      // an east-west table alternates azimuth row by row
      { ...table(1, 'seg_3')[0], id: 'pv_e', azimuthDeg: 90, cellIndex: 0 },
      { ...table(1, 'seg_3')[0], id: 'pv_w', azimuthDeg: 270, cellIndex: 1 },
      // a LOOSE panel: no segment, no cell
      {
        id: 'pv_loose',
        roofId: 'roof_2',
        center: { x: 1, y: 2 },
        orientation: 'landscape',
        azimuthDeg: 175,
        tiltDeg: 0,
        solarAccess: 1,
        enabled: true,
      },
    ];
    expect(unpackPanels(packPanels(panels))).toEqual(panels);
  });

  it('an absent optional field stays ABSENT, it does not come back as undefined', () => {
    // `{...p, blockedBy: undefined}` is not the same object as `{...p}`: the key
    // exists, so anything that walks the object's keys sees a field that was
    // never there. Fingerprints are built from named fields, but a stored
    // project that grows keys on every save/load cycle is its own bug.
    const [p] = table(1);
    const back = unpackPanels(packPanels([p]))[0];
    expect('blockedBy' in back).toBe(false);
    expect('mountHeightM' in back).toBe(false);
    expect(Object.keys(back).sort()).toEqual(Object.keys(p).sort());
  });

  it('order is preserved even when tables are interleaved', () => {
    // grouping is by CONSECUTIVE run, so a shuffled array must still come back
    // in its own order — just in more groups
    const panels = [
      ...table(2, 'seg_a'),
      ...table(2, 'seg_b'),
      ...table(2, 'seg_a').map((p) => ({ ...p, id: `${p.id}_second` })),
    ];
    const back = unpackPanels(packPanels(panels));
    expect(back.map((p) => p.id)).toEqual(panels.map((p) => p.id));
    expect(back).toEqual(panels);
  });

  it('nothing at all packs and unpacks to nothing', () => {
    expect(unpackPanels(packPanels([]))).toEqual([]);
  });
});

describe('the packed project is small enough to store', () => {
  it('a real table costs a fraction of what it did per module', () => {
    const panels = table(20_000);
    const base = fixtureProject(0);
    const project: Project = { ...base, panels, segments: [] };
    const was = JSON.stringify(project).length;
    const now = JSON.stringify(packProject(project)).length;
    // measured 283 -> 89 bytes per module on the real engine. The gate is set
    // well below that so ordinary drift does not trip it, but a change that
    // re-inflates the payload — hoisting less, or storing a dense column of
    // defaults again — fails here rather than on a customer's 36 ha field.
    expect(now / panels.length).toBeLessThan(120);
    expect(was / now).toBeGreaterThan(2.5);
  });

  it('a project saved before the codec still opens', () => {
    // the migration is "there is no migration": an old payload has a plain
    // `panels` array and no `pp`, and must pass straight through
    const base = fixtureProject(0);
    const old = { ...base, panels: table(5) };
    expect(unpackProject(old).panels).toEqual(old.panels);
  });

  it('a packed project round-trips through JSON as a whole', () => {
    const base = fixtureProject(0);
    const project: Project = { ...base, panels: table(120), segments: [] };
    const back = unpackProject(JSON.parse(JSON.stringify(packProject(project))));
    expect(back.panels).toEqual(project.panels);
    // and the packed payload must not still be carrying the fat array as well
    expect(JSON.stringify(packProject(project))).not.toContain('"orientation"');
  });
});
