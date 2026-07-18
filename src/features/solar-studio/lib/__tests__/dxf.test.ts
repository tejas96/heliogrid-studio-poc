// ─── DXF export (Phase 11 · task 30b) ───────────────────────────────────────
// Gate: the file must be structurally valid DXF, carry the named layers, and
// its geometry must MATCH THE MODEL (not merely "look right") — a drawing that
// disagrees with the design is worse than no drawing.
import { describe, expect, it } from 'vitest';
import { DxfBuilder } from '../dxf';
import { layoutToDxf, dxfFileName, DXF_LAYERS } from '../export-dxf';
import { panelCornersOnRoof } from '../layout';
import { fixtureProject, fixtureRoof, fixturePanels } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import type { Project } from '../../types';

/** Minimal group-code reader: DXF is pairs of (code, value) lines. */
function pairs(dxf: string): Array<[number, string]> {
  const lines = dxf.split('\n');
  const out: Array<[number, string]> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    if (!Number.isFinite(code)) continue;
    out.push([code, lines[i + 1]]);
  }
  return out;
}
const entitiesOfType = (dxf: string, type: string) =>
  pairs(dxf).filter(([c, v]) => c === 0 && v === type).length;

function designed(): Project {
  const base = fixtureProject(0);
  return {
    ...base,
    roofs: [fixtureRoof()],
    panels: fixturePanels(6),
    components: { ...base.components, panel: PANEL_DB[0] },
  };
}

describe('DxfBuilder', () => {
  it('emits a structurally valid document (sections open, close, and EOF)', () => {
    const dxf = new DxfBuilder().addLayer('L', 7).polyline(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      'L',
    ).toString();
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('TABLES');
    expect(dxf).toContain('ENTITIES');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    // every SECTION is closed
    expect(entitiesOfType(dxf, 'SECTION')).toBe(entitiesOfType(dxf, 'ENDSEC'));
  });

  it('declares metres so CAD dimensions equal model metres', () => {
    const dxf = new DxfBuilder().toString();
    const p = pairs(dxf);
    const i = p.findIndex(([c, v]) => c === 9 && v === '$INSUNITS');
    expect(i).toBeGreaterThan(-1);
    expect(p[i + 1]).toEqual([70, '6']); // 6 = metres
  });

  it('writes fixed-precision reals (never exponent notation)', () => {
    const dxf = new DxfBuilder().addLayer('L', 7).line({ x: 1e-7, y: 1234567.5 }, { x: 1, y: 2 }, 'L').toString();
    expect(dxf).not.toMatch(/[eE][+-]\d/);
  });

  it('skips degenerate polylines instead of emitting broken entities', () => {
    const dxf = new DxfBuilder().addLayer('L', 7).polyline([{ x: 0, y: 0 }], 'L').toString();
    expect(entitiesOfType(dxf, 'LWPOLYLINE')).toBe(0);
  });

  it('keeps TEXT to a single line', () => {
    const dxf = new DxfBuilder().addLayer('L', 7).text({ x: 0, y: 0 }, 'a\nb', 'L').toString();
    expect(dxf).toContain('a b');
  });
});

describe('layoutToDxf', () => {
  const p = designed();
  const dxf = layoutToDxf(p);

  it('carries every named layer', () => {
    for (const name of Object.values(DXF_LAYERS)) expect(dxf).toContain(name);
  });

  it('draws one closed polyline per roof and per ENABLED module', () => {
    // 1 roof + 6 panels = 7 LWPOLYLINEs (no strings/obstructions in the fixture)
    expect(entitiesOfType(dxf, 'LWPOLYLINE')).toBe(1 + p.panels.length);
  });

  it('omits disabled modules — they are not installed, so not drawn', () => {
    const off = { ...p, panels: p.panels.map((x, i) => (i < 2 ? { ...x, enabled: false } : x)) };
    expect(entitiesOfType(layoutToDxf(off), 'LWPOLYLINE')).toBe(1 + (p.panels.length - 2));
  });

  it('module geometry MATCHES the canonical layout engine, in metres', () => {
    const spec = p.components.panel!;
    const roof = p.roofs[0];
    const corner = panelCornersOnRoof(p.panels[0], spec, roof)[0];
    // the exact coordinate the engine computed appears in the drawing
    expect(dxf).toContain(corner.x.toFixed(6));
    expect(dxf).toContain(corner.y.toFixed(6));
  });

  it('draws string routes as OPEN polylines through the series order', () => {
    const withString = {
      ...p,
      strings: [
        {
          id: 's1',
          name: 'String 1',
          inverterIndex: 0,
          mpptIndex: 0,
          panelIds: p.panels.slice(0, 4).map((x) => x.id),
          color: '#0f0',
        },
      ],
    };
    const out = layoutToDxf(withString);
    expect(out).toContain(DXF_LAYERS.strings);
    expect(out).toContain('String 1');
    expect(entitiesOfType(out, 'LWPOLYLINE')).toBe(1 + p.panels.length + 1); // + the route
  });

  it('draws routed cabling on kind-specific layers (task 29e)', () => {
    const routed = {
      ...p,
      cableRoutes: [
        { id: 'r1', kind: 'string_homerun' as const, fromRef: 's1', toRef: 'inv', waypoints: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], verticalDropM: 3, slackPct: 0.1 },
        { id: 'r2', kind: 'inverter_ac' as const, fromRef: 'inv', toRef: 'meter', waypoints: [{ x: 5, y: 5 }, { x: 12, y: 5 }], verticalDropM: 1, slackPct: 0.1 },
        { id: 'r3', kind: 'earth_conductor' as const, fromRef: 'inv', toRef: 'pit', waypoints: [{ x: 5, y: 5 }, { x: 5, y: -3 }], verticalDropM: 0, slackPct: 0.1 },
      ],
    };
    const out = layoutToDxf(routed);
    for (const l of [DXF_LAYERS.dcCable, DXF_LAYERS.acCable, DXF_LAYERS.earth]) {
      expect(out).toContain(l);
    }
    // 3 routes drawn on top of the roof + modules
    expect(entitiesOfType(out, 'LWPOLYLINE')).toBe(1 + p.panels.length + 3);
  });

  it('skips a route with too few waypoints instead of drawing a broken run', () => {
    const bad = {
      ...p,
      cableRoutes: [
        { id: 'r1', kind: 'string_homerun' as const, fromRef: 'a', toRef: 'b', waypoints: [{ x: 0, y: 0 }], verticalDropM: 0, slackPct: 0 },
      ],
    };
    expect(entitiesOfType(layoutToDxf(bad), 'LWPOLYLINE')).toBe(1 + p.panels.length);
  });

  it('labels each string with its identity — name, inverter/MPPT, count (task 30c)', () => {
    const withString = {
      ...p,
      strings: [
        { id: 's1', name: 'String 1', inverterIndex: 0, mpptIndex: 1, panelIds: p.panels.slice(0, 4).map((x) => x.id), color: '#0f0' },
      ],
    };
    const out = layoutToDxf(withString);
    expect(out).toContain('String 1 · INV1/MPPT2 · 4 modules');
  });

  it('draws lightning arresters on the earth layer', () => {
    const withLa = { ...p, arresters: [{ id: 'la1', roofId: p.roofs[0].id, pos: { x: 2, y: 2 }, heightMm: 3000 }] };
    const out = layoutToDxf(withLa);
    expect(entitiesOfType(out, 'CIRCLE')).toBe(1);
    expect(out).toContain('LA');
  });

  it('produces a safe filename', () => {
    expect(dxfFileName(p)).toMatch(/\.dxf$/);
    expect(dxfFileName({ ...p, info: { ...p.info, name: 'A/B  C!' } })).toBe('A-B-C-layout.dxf');
  });
});
