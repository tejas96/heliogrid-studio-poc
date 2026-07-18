// ─── Gate: automatic system design (Phase 6, §25) ────────────────────────────
// Deterministic structure, measured-access ranking, budget honoring, decision-
// log completeness and the sanctioned-load soft warning.
import { describe, it, expect } from 'vitest';
import type { Obstruction, Project } from '../../types';
import { autoDesign, rankRoofs } from '../auto-design';
import { fixtureProject, fixtureRoof } from './fixtures/project';

/** Two identical flat roofs side by side, pin at Pune (northern hemisphere). */
function twoRoofProject(): Project {
  const p = fixtureProject(0);
  const east = fixtureRoof({
    id: 'roof_open',
    name: 'Open roof',
    polygon: [
      { x: 4, y: -6 },
      { x: 18, y: -6 },
      { x: 18, y: 6 },
      { x: 4, y: 6 },
    ],
  });
  const west = fixtureRoof({
    id: 'roof_shaded',
    name: 'Shaded roof',
    polygon: [
      { x: -18, y: -6 },
      { x: -4, y: -6 },
      { x: -4, y: 6 },
      { x: -18, y: 6 },
    ],
  });
  return {
    ...p,
    location: {
      address: 'Pune',
      latLng: { lat: 18.5203, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.2,
      peakSunHours: 5.2,
      dataSource: 'test',
    },
    roofs: [west, east], // shaded FIRST in array order — ranking must reorder
    panels: [],
    strings: [],
  };
}

/** Tall shade wall along the south edge of a roof — shadows only, no footprint. */
function southWall(roofId: string, centerX: number): Obstruction {
  return {
    id: `ob_wall_${roofId}`,
    type: 'other',
    label: 'WALL',
    roofId,
    center: { x: centerX, y: -5.5 },
    shape: 'rect',
    lengthM: 13,
    widthM: 0.4,
    diameterM: 0,
    heightM: 6,
    rotationDeg: 0,
    setbackM: 0,
    castsShadow: true,
    blocksPlacement: false, // equal capacity on both roofs — access is the tiebreaker
  };
}

describe('rankRoofs', () => {
  it('prefers the unshaded roof over an equal-capacity shaded one (measured access)', () => {
    const p = twoRoofProject();
    p.obstructions = [southWall('roof_shaded', -11)];
    const ranking = rankRoofs(p, p.components.panel!);
    expect(ranking).toHaveLength(2);
    const open = ranking.find((r) => r.roofId === 'roof_open')!;
    const shaded = ranking.find((r) => r.roofId === 'roof_shaded')!;
    // identical geometry ⇒ identical capacity; the 6 m south wall must cost access
    expect(open.capacityPanels).toBe(shaded.capacityPanels);
    expect(open.capacityPanels).toBeGreaterThan(0);
    expect(shaded.access).toBeLessThan(open.access);
    expect(ranking[0].roofId).toBe('roof_open'); // reordered despite array order
  });

  it('ranks a south face above an equal, UNSHADED north face (orientation, not just access)', () => {
    // two identical pitched planes, no obstructions ⇒ equal capacity AND equal
    // ~100% access. Only orientation separates them: at Pune (18.5°N) the south
    // face out-yields the north one, so access alone (both ~1.0) would tie — the
    // POA orientation factor is what must break it. This is the gable/hip fix.
    const base = fixtureProject(0);
    const south = fixtureRoof({
      id: 'roof_south', name: 'South face', pitchDeg: 20, slopeAzimuthDeg: 180,
      polygon: [{ x: 4, y: -6 }, { x: 18, y: -6 }, { x: 18, y: 6 }, { x: 4, y: 6 }],
    });
    const north = fixtureRoof({
      id: 'roof_north', name: 'North face', pitchDeg: 20, slopeAzimuthDeg: 0,
      polygon: [{ x: -18, y: -6 }, { x: -4, y: -6 }, { x: -4, y: 6 }, { x: -18, y: 6 }],
    });
    const p: Project = {
      ...base,
      location: { address: 'Pune', latLng: { lat: 18.5203, lng: 73.8567 }, confirmed: true, irradiance: 5.2, peakSunHours: 5.2, dataSource: 'test' },
      roofs: [north, south], // north FIRST in array order — ranking must reorder
      panels: [], strings: [], obstructions: [],
    };
    const ranking = rankRoofs(p, p.components.panel!);
    const s = ranking.find((r) => r.roofId === 'roof_south')!;
    const n = ranking.find((r) => r.roofId === 'roof_north')!;
    expect(s.capacityPanels).toBeGreaterThan(0);
    expect(n.capacityPanels).toBeGreaterThan(0);
    expect(n.access).toBeGreaterThan(0.9); // north is UNSHADED — access can't separate them
    expect(s.poa).toBeGreaterThan(n.poa); // orientation does
    expect(s.score).toBeGreaterThan(n.score);
    expect(ranking[0].roofId).toBe('roof_south'); // south wins despite array order
  });

  it('reports zero capacity for a roof too small to hold a panel', () => {
    const p = twoRoofProject();
    p.roofs.push(
      fixtureRoof({
        id: 'roof_tiny',
        name: 'Tiny',
        polygon: [
          { x: 30, y: 0 },
          { x: 31, y: 0 },
          { x: 31, y: 1 },
          { x: 30, y: 1 },
        ],
      }),
    );
    const tiny = rankRoofs(p, p.components.panel!).find((r) => r.roofId === 'roof_tiny')!;
    expect(tiny.capacityPanels).toBe(0);
    expect(tiny.score).toBe(0);
  });
});

describe('autoDesign', () => {
  it('is deterministic — identical input produces identical output (modulo fresh ids)', () => {
    const p = twoRoofProject();
    p.obstructions = [southWall('roof_shaded', -11)];
    const a = autoDesign(p, 'max_roof');
    const b = autoDesign(p, 'max_roof');
    // entity ids are crypto.randomUUID() by design — normalize them to
    // insertion-order tokens, then the whole result must match exactly
    const normalize = (r: typeof a) => {
      const seen = new Map<string, string>();
      return JSON.stringify(r).replace(
        /"(pv|seg)_[0-9a-f-]{36}"/g,
        (m) => seen.get(m) ?? (seen.set(m, `"id_${seen.size}"`), seen.get(m)!),
      );
    };
    expect(normalize(b)).toBe(normalize(a));
    expect(a.panels.length).toBeGreaterThan(0);
  });

  it('honors the target-kWp budget and stops once met', () => {
    const p = twoRoofProject();
    const watt = p.components.panel!.watt;
    p.components = { ...p.components, targetKwp: (3 * watt) / 1000 }; // exactly 3 panels
    const r = autoDesign(p, 'target_kwp');
    expect(r.panels.length).toBe(3);
    expect(r.achievedKwp).toBeCloseTo((3 * watt) / 1000, 5);
    expect(r.warnings).toHaveLength(0); // met ⇒ no shortfall warning
    const max = autoDesign(p, 'max_roof');
    expect(max.panels.length).toBeGreaterThan(r.panels.length);
  });

  it('fills the best-ranked roof first', () => {
    const p = twoRoofProject();
    p.obstructions = [southWall('roof_shaded', -11)];
    const watt = p.components.panel!.watt;
    p.components = { ...p.components, targetKwp: (4 * watt) / 1000 };
    const r = autoDesign(p, 'target_kwp');
    // small budget fits entirely on the winner — every panel on the open roof
    expect(r.panels.every((x) => x.roofId === 'roof_open')).toBe(true);
    expect(r.segments[0]?.label).toBe('A1');
  });

  it('logs a complete decision trail: objective, one rank per roof, spacing, outcome', () => {
    const p = twoRoofProject();
    const r = autoDesign(p, 'max_roof');
    const ids = r.decisions.map((d) => d.id);
    expect(ids).toContain('objective');
    expect(ids).toContain('roof-rank:roof_open');
    expect(ids).toContain('roof-rank:roof_shaded');
    expect(ids).toContain('capacity-outcome');
    for (const d of r.decisions) {
      expect(d.topic.length).toBeGreaterThan(0);
      expect(d.choice.length).toBeGreaterThan(0);
      expect(d.reason.length).toBeGreaterThan(0);
      expect(d.inputs.length).toBeGreaterThan(0);
    }
  });

  it('warns when the roofs cannot fit the requested capacity', () => {
    const p = twoRoofProject();
    p.components = { ...p.components, targetKwp: 500 }; // absurd request
    const r = autoDesign(p, 'target_kwp');
    expect(r.achievedKwp).toBeLessThan(500);
    expect(r.warnings.some((w) => w.includes('of the requested'))).toBe(true);
  });

  it('adds the sanctioned-load soft warning only when exceeded', () => {
    const p = twoRoofProject();
    p.info = { ...p.info, sanctionedLoadKw: 1 };
    const over = autoDesign(p, 'max_roof');
    expect(over.achievedKwp).toBeGreaterThan(1);
    expect(over.warnings.some((w) => w.includes('sanctioned load'))).toBe(true);
    expect(over.decisions.some((d) => d.id === 'sanctioned-load')).toBe(true);

    p.info = { ...p.info, sanctionedLoadKw: 0 }; // 0 = not provided ⇒ silent
    const silent = autoDesign(p, 'max_roof');
    expect(silent.decisions.some((d) => d.id === 'sanctioned-load')).toBe(false);
  });

  it('degrades gracefully without a panel selection', () => {
    const p = twoRoofProject();
    p.components = { ...p.components, panel: null };
    const r = autoDesign(p, 'max_roof');
    expect(r.panels).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/panel/i);
  });
});
