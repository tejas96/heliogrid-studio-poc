// ─── Gates: every joint the BOM bills is also DRAWN ─────────────────────────
// Clamps, bolted joints and sheet standoffs were modelled, counted and billed
// but never rendered — so ghosting the modules to inspect the structure showed
// rails with nothing holding anything to them. These pin that the two stay in
// step, and that no node is drawn twice.
import { describe, expect, it } from 'vitest';
import { nodeHardware } from '../hardware';
import { foundationAssembly } from '../foundation';
import { projectStructures, type NodeKind } from '../structure';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Project } from '../../types';

const ALL_NODE_KINDS: NodeKind[] = [
  'roof_anchor',
  'leg_rafter',
  'rafter_purlin',
  'panel_clamp_end',
  'panel_clamp_mid',
  'brace_bolt',
  'sheet_standoff',
];

function tableProject(): Project {
  const base = fixtureProject(0);
  const p: Project = { ...base, roofs: [fixtureRoof()] };
  const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
    ...DEFAULT_FILL,
    maxPanels: 8,
  })!;
  return { ...p, segments: [filled.segment], panels: filled.panels };
}

describe('every node kind is accounted for', () => {
  it('each kind either has hardware or is a foundation — none is silently invisible', () => {
    for (const kind of ALL_NODE_KINDS) {
      const parts = nodeHardware(kind);
      if (kind === 'roof_anchor') {
        // owned by foundationAssembly; drawing it here too would double it
        expect(parts, kind).toHaveLength(0);
        expect(foundationAssembly('concrete').parts.length).toBeGreaterThan(0);
      } else {
        expect(parts.length, `${kind} must be drawn`).toBeGreaterThan(0);
      }
    }
  });

  it('every part has a real size and a bucket', () => {
    for (const kind of ALL_NODE_KINDS) {
      for (const part of nodeHardware(kind)) {
        expect(part.bucket, kind).toBeTruthy();
        for (const axis of ['x', 'y', 'z'] as const) {
          expect(part.size[axis], `${kind}.${axis}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('an end clamp is the wider casting — the same distinction the BOM prices', () => {
    const mid = nodeHardware('panel_clamp_mid')[0];
    const end = nodeHardware('panel_clamp_end')[0];
    expect(end.size.z).toBeGreaterThan(mid.size.z);
  });

  it('a standoff STANDS on the sheet — it rises from the node, not through it', () => {
    const upright = nodeHardware('sheet_standoff').find((p) => p.bucket === 'standoff')!;
    // its underside sits at the node, which is the sheet surface
    expect(upright.offset.y - upright.size.y / 2).toBeCloseTo(0, 6);
  });

  it('a clamp sits ABOVE the rail centreline, not inside it', () => {
    for (const kind of ['panel_clamp_mid', 'panel_clamp_end'] as const) {
      expect(nodeHardware(kind)[0].offset.y, kind).toBeGreaterThan(0);
    }
  });
});

describe('drawn hardware matches what the graph contains', () => {
  it('a real table produces hardware for every non-foundation node', () => {
    const s = projectStructures(tableProject())[0];
    const drawn = s.nodes.filter((n) => nodeHardware(n.kind).length > 0);
    const anchors = s.nodes.filter((n) => n.kind === 'roof_anchor');
    // every node is one or the other, and together they are all of them
    expect(drawn.length + anchors.length).toBe(s.nodes.length);
    expect(drawn.length).toBeGreaterThan(0);
  });

  it('clamps drawn == clamps billed', () => {
    const s = projectStructures(tableProject())[0];
    const clampNodes = s.nodes.filter(
      (n) => n.kind === 'panel_clamp_mid' || n.kind === 'panel_clamp_end',
    );
    const billed = clampNodes.reduce((a, n) => a + (n.fastenerSpec.clamps ?? 0), 0);
    // one drawn body per billed clamp — the model cannot show fewer parts than
    // the quote charges for
    expect(clampNodes.every((n) => nodeHardware(n.kind).length > 0)).toBe(true);
    expect(billed).toBe(clampNodes.length);
  });

  it('bucket count stays small enough to instance cheaply (E10)', () => {
    const s = projectStructures(tableProject())[0];
    const buckets = new Set<string>();
    for (const n of s.nodes) {
      const parts =
        n.kind === 'roof_anchor' ? foundationAssembly('concrete').parts : nodeHardware(n.kind);
      for (const p of parts) buckets.add(p.bucket);
    }
    // one InstancedMesh per bucket; a real project uses a handful
    expect(buckets.size).toBeLessThanOrEqual(8);
  });
});
