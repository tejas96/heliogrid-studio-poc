// ─── Gate: what goes into a customer's .glb, and what must never ────────────
// The export's real decisions are exclusions, so those are what this pins.
// Google's streamed 3D Tiles and the Solar API height map are THIRD-PARTY data
// under their own licences: baking them into a file we hand a client would be
// redistributing someone else's imagery. Editor chrome is a picture of the tool,
// not of the design.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { collectExportable, exportableCount, glbFilename } from '../glb-export';

function scene(): THREE.Scene {
  const s = new THREE.Scene();
  const mesh = (name: string) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    m.name = name;
    return m;
  };
  s.add(mesh('roof'));

  // a module nested under a group, offset — the world transform must survive
  const g = new THREE.Group();
  g.position.set(10, 2, -3);
  const panel = mesh('panel');
  panel.position.set(1, 0, 0);
  g.add(panel);
  s.add(g);

  s.add(mesh('real-surround')); // Google's tiles
  s.add(mesh('surround-relief')); // the Solar API height map

  const hidden = mesh('hidden-thing');
  hidden.visible = false;
  s.add(hidden);

  const flagged = mesh('opted-out');
  flagged.userData.noExport = true;
  s.add(flagged);

  // chrome: a gizmo ring and a helper
  s.add(new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()));
  s.add(new THREE.AxesHelper(1));
  return s;
}

describe('collectExportable', () => {
  it('keeps the design and drops third-party data, chrome and hidden objects', () => {
    const out = collectExportable(scene());
    const names = out.children.map((c) => c.name);
    expect(names).toContain('roof');
    expect(names).toContain('panel');
    // never ship someone else's imagery inside our customer's model
    expect(names).not.toContain('real-surround');
    expect(names).not.toContain('surround-relief');
    // nor the tool's own furniture, nor what the user has switched off
    expect(names).not.toContain('hidden-thing');
    expect(names).not.toContain('opted-out');
    expect(out.children).toHaveLength(2);
    expect(exportableCount(scene())).toBe(2);
  });

  it('bakes the world transform, so a nested module lands where it is drawn', () => {
    const out = collectExportable(scene());
    const panel = out.children.find((c) => c.name === 'panel')!;
    // group at (10,2,-3) + local (1,0,0)
    expect(panel.position.x).toBeCloseTo(11);
    expect(panel.position.y).toBeCloseTo(2);
    expect(panel.position.z).toBeCloseTo(-3);
    expect(panel.parent).toBe(out); // flattened, no parent chain to re-apply
  });

  it('excluding a subtree excludes its children too', () => {
    const s = scene();
    const surround = s.children.find((c) => c.name === 'real-surround')!;
    const tile = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    tile.name = 'tile-42';
    surround.add(tile);
    expect(collectExportable(s).children.map((c) => c.name)).not.toContain('tile-42');
  });
});

describe('glbFilename', () => {
  it('names the job and survives characters a filesystem would not', () => {
    expect(glbFilename('Sharma Textiles')).toBe('Sharma Textiles — 3D model.glb');
    expect(glbFilename('A/B: phase 2')).toBe('AB phase 2 — 3D model.glb');
    expect(glbFilename('///')).toBe('design — 3D model.glb');
  });
});
