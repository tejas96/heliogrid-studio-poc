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

// ─── Phase 22l: the foundation choice ───────────────────────────────────────
describe('applyStructChoice — foundation (Phase 22l)', () => {
  it('POSITIVE: switching foundation writes the lazy field and nothing else', () => {
    const p = editableProject();
    const seg = p.segments[0];
    const before = JSON.stringify({ ...seg, racking: { ...seg.racking } });
    const r = applyStructChoice(p, seg.id, { kind: 'foundation', foundation: 'ballast' })!;
    expect(r).not.toBeNull();
    const after = r.segments.find((s) => s.id === seg.id)!;
    expect(after.racking.kind !== 'flush' && after.racking.foundation).toBe('ballast');
    // tilt / legs / profile untouched — a foundation change is not a re-pose
    expect(after.racking.kind !== 'flush' && after.racking.tiltDeg).toBe(
      seg.racking.kind !== 'flush' ? seg.racking.tiltDeg : 0,
    );
    expect(JSON.stringify(seg)).toBe(before); // input never mutated
  });

  it('POSITIVE: the resolved racking reflects the choice', () => {
    const p = editableProject();
    const r = applyStructChoice(p, p.segments[0].id, {
      kind: 'foundation',
      foundation: 'ballast',
    })!;
    const next: Project = { ...p, segments: r.segments, panels: r.panels };
    const resolved = resolveRacking(next, next.roofs[0], next.segments[0], next.components.panel!)!;
    expect(resolved.foundation).toBe('ballast');
  });

  it('POSITIVE: it is ONE patch — panels come back in the same result', () => {
    const p = editableProject();
    const r = applyStructChoice(p, p.segments[0].id, { kind: 'foundation', foundation: 'anchor' })!;
    expect(r.segments).toBeDefined();
    expect(r.panels).toBeDefined();
    expect(r.panels.length).toBe(p.panels.length);
  });

  it('NEGATIVE: a flush table has no legs to found — refused', () => {
    const p = editableProject();
    const flushed = applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'flush' })!;
    const next: Project = { ...p, segments: flushed.segments, panels: flushed.panels };
    expect(
      applyStructChoice(next, next.segments[0].id, { kind: 'foundation', foundation: 'concrete' }),
    ).toBeNull();
  });

  it('NEGATIVE: an unknown segment is refused, not thrown', () => {
    const p = editableProject();
    expect(applyStructChoice(p, 'nope', { kind: 'foundation', foundation: 'concrete' })).toBeNull();
  });

  it('EDGE: choosing the foundation already in effect is still a valid no-op patch', () => {
    const p = editableProject();
    const cur = resolveRacking(p, p.roofs[0], p.segments[0], p.components.panel!)!;
    const r = applyStructChoice(p, p.segments[0].id, {
      kind: 'foundation',
      foundation: cur.foundation,
    });
    expect(r).not.toBeNull();
    const next: Project = { ...p, segments: r!.segments, panels: r!.panels };
    expect(
      resolveRacking(next, next.roofs[0], next.segments[0], next.components.panel!)!.foundation,
    ).toBe(cur.foundation);
  });
});

// ─── D14: foundation shape, and the contract that protects old projects ─────
describe('applyStructChoice — foundationShape (Phase 22l)', () => {
  it('POSITIVE: the choice resolves and reaches the structure', () => {
    const p = editableProject();
    const r = applyStructChoice(p, p.segments[0].id, {
      kind: 'foundationShape',
      shape: 'circular',
    })!;
    const next: Project = { ...p, segments: r.segments, panels: r.panels };
    const resolved = resolveRacking(next, next.roofs[0], next.segments[0], next.components.panel!)!;
    expect(resolved.foundationShape).toBe('circular');
  });

  it('NEGATIVE: a flush table has nothing to form — refused', () => {
    const p = editableProject();
    const flushed = applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'flush' })!;
    const next: Project = { ...p, segments: flushed.segments, panels: flushed.panels };
    expect(
      applyStructChoice(next, next.segments[0].id, { kind: 'foundationShape', shape: 'circular' }),
    ).toBeNull();
  });

  // THE contract for every lazy structure field: an untouched project must
  // serialise byte-identically, or its stored captures go stale for a change
  // the user never made.
  it('an untouched segment writes NO foundationShape key at all', () => {
    const p = editableProject();
    const rk = p.segments[0].racking;
    expect(rk.kind !== 'flush' && 'foundationShape' in rk).toBe(false);
    expect(JSON.stringify(p.segments[0])).not.toContain('foundationShape');
  });

  it('…yet it still RESOLVES to the rule-config default', () => {
    const p = editableProject();
    const resolved = resolveRacking(p, p.roofs[0], p.segments[0], p.components.panel!)!;
    expect(['square', 'circular']).toContain(resolved.foundationShape);
  });

  it('choosing a shape writes exactly ONE new key, nothing else', () => {
    const p = editableProject();
    const beforeKeys = Object.keys(p.segments[0].racking).sort();
    const r = applyStructChoice(p, p.segments[0].id, {
      kind: 'foundationShape',
      shape: 'circular',
    })!;
    const afterKeys = Object.keys(r.segments[0].racking).sort();
    expect(afterKeys.filter((k) => !beforeKeys.includes(k))).toEqual(['foundationShape']);
  });
});
