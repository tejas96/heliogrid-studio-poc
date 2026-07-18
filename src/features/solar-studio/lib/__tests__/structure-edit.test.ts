// ─── Gate: on-object structure editing (Phase 7 §26d, §H) ────────────────────
// The §H contracts: hover NEVER mutates (purity), preview === commit (same
// function), and every choice routes through the same segment-ops setters
// the Table settings sheet uses.
import { describe, it, expect } from 'vitest';
import type { Project } from '../../types';
import { applyStructChoice } from '../structure-edit';
import { resolveRacking } from '../structure';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { fixtureProject, fixtureRoof } from './fixtures/project';

function editableProject(): Project {
  const p = { ...fixtureProject(0), roofs: [fixtureRoof()] };
  const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
    ...DEFAULT_FILL,
    maxPanels: 6,
  })!;
  return { ...p, segments: [filled.segment], panels: filled.panels };
}

describe('applyStructChoice — purity and preview===commit', () => {
  it('never mutates the input project (hover safety)', () => {
    const p = editableProject();
    const before = JSON.stringify(p);
    applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'walkunder' });
    applyStructChoice(p, p.segments[0].id, { kind: 'tilt', tiltDeg: 20 });
    applyStructChoice(p, p.segments[0].id, { kind: 'profile', key: 'rhs' });
    expect(JSON.stringify(p)).toBe(before);
  });

  it('is deterministic — the hovered preview IS the committed patch', () => {
    const p = editableProject();
    const a = applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'walkunder' });
    const b = applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'walkunder' });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('applyStructChoice — choices', () => {
  it('walk-under preset: elevated 10° with clearance 2.2 owned explicitly', () => {
    const p = editableProject();
    const r = applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'walkunder' })!;
    const seg = r.segments[0];
    expect(seg.racking.kind).toBe('fixed_tilt');
    if (seg.racking.kind !== 'flush') {
      expect(seg.racking.tiltDeg).toBe(10);
      expect(seg.racking.clearanceM).toBe(2.2);
    }
    const resolved = resolveRacking({ ...p, ...r }, p.roofs[0], seg, p.components.panel!)!;
    expect(resolved.frontLegM).toBe(2.2);
    // panels stay coupled to the segment tilt
    expect(r.panels.filter((x) => x.segmentId === seg.id).every((x) => x.tiltDeg === 10)).toBe(true);
  });

  it('standard preset clears an earlier walk-under clearance back to defaults', () => {
    const p = editableProject();
    const walk = applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'walkunder' })!;
    const p2 = { ...p, ...walk };
    const std = applyStructChoice(p2, p.segments[0].id, { kind: 'preset', preset: 'standard' })!;
    const seg = std.segments[0];
    if (seg.racking.kind !== 'flush') expect(seg.racking.clearanceM).toBeUndefined();
  });

  it('flush preset lays panels into the roof plane', () => {
    const p = editableProject();
    const r = applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'flush' })!;
    expect(r.segments[0].racking.kind).toBe('flush');
    expect(r.panels.filter((x) => x.segmentId === p.segments[0].id).every((x) => x.tiltDeg === 0)).toBe(
      true,
    );
  });

  it('profile/tilt/clearance route through the shared setters; flush surfaces are no-ops', () => {
    const p = editableProject();
    const segId = p.segments[0].id;
    const prof = applyStructChoice(p, segId, { kind: 'profile', key: 'rhs' })!;
    const seg = prof.segments[0];
    if (seg.racking.kind !== 'flush') expect(seg.racking.profile.key).toBe('rhs');

    const tilt = applyStructChoice(p, segId, { kind: 'tilt', tiltDeg: 22 })!;
    const t = tilt.segments[0];
    if (t.racking.kind !== 'flush') expect(t.racking.tiltDeg).toBe(22);
    expect(tilt.panels.filter((x) => x.segmentId === segId).every((x) => x.tiltDeg === 22)).toBe(true);

    const clr = applyStructChoice(p, segId, { kind: 'clearance', clearanceM: 1.5 })!;
    const c = clr.segments[0];
    if (c.racking.kind !== 'flush') expect(c.racking.clearanceM).toBe(1.5);

    const flushProject = { ...p, ...applyStructChoice(p, segId, { kind: 'preset', preset: 'flush' })! };
    expect(applyStructChoice(flushProject, segId, { kind: 'profile', key: 'rhs' })).toBeNull();
    expect(applyStructChoice(flushProject, segId, { kind: 'tilt', tiltDeg: 15 })).toBeNull();
  });

  it('returns null for unknown segments/profiles and missing spec', () => {
    const p = editableProject();
    expect(applyStructChoice(p, 'nope', { kind: 'tilt', tiltDeg: 10 })).toBeNull();
    expect(applyStructChoice(p, p.segments[0].id, { kind: 'profile', key: 'nope' })).toBeNull();
    const noSpec = { ...p, components: { ...p.components, panel: null } };
    expect(applyStructChoice(noSpec, p.segments[0].id, { kind: 'tilt', tiltDeg: 10 })).toBeNull();
  });
});
