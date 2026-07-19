// ─── Phase 22a gates: the steel catalog and its geometry must agree ─────────
// The catalog feeds TWO things that must never disagree: a mass we quote and a
// model we draw. These tests pin them to each other.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_PROFILE,
  STRUCTURE_PROFILES,
  developedWidthMm,
  hollowAreaMm2,
  massPerMFromDims,
  profileByKey,
  sectionLabel,
} from '../../data/profiles';
import { STRUCTURE_PROFILES as REEXPORTED } from '../segment-ops';
import { DEFAULT_PROFILE as REEXPORTED_DEFAULT } from '../layout';
import {
  cachedProfileGeometry,
  outlineAreaMm2,
  profileGeometry,
  sectionOutline,
  sectionSvgPath,
} from '../../three/profile-geometry';

describe('catalog integrity', () => {
  it('keys are unique', () => {
    const keys = STRUCTURE_PROFILES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the two former duplicate defaults are now ONE object', () => {
    // layout.ts used to carry a second hand-written literal that had already
    // drifted from STRUCTURE_PROFILES[0] by label.
    expect(DEFAULT_PROFILE).toBe(STRUCTURE_PROFILES[0]);
    expect(REEXPORTED_DEFAULT).toBe(DEFAULT_PROFILE);
    expect(REEXPORTED).toBe(STRUCTURE_PROFILES);
  });

  // THE regression gate: dimensions were fitted to these masses, never the
  // reverse. If one of these moves, every existing project's tonnage — and its
  // quote — moves with it.
  it('the six legacy masses are unchanged', () => {
    const legacy: [string, number][] = [
      ['c_channel', 2.2],
      ['u_channel', 2.4],
      ['l_angle', 1.8],
      ['z_purlin', 2.6],
      ['rhs', 3.4],
      ['chs', 3.0],
    ];
    for (const [key, kg] of legacy) expect(profileByKey(key)!.kgPerM).toBe(kg);
  });

  it('STRUCTURE_PROFILES[0] is still the c_channel four call sites default to', () => {
    expect(STRUCTURE_PROFILES[0].key).toBe('c_channel');
  });
});

describe('declared mass agrees with declared dimensions (±3%)', () => {
  // Open cold-formed shapes are priced off the COIL BLANK (developed width ×
  // thickness); hollow sections off the true cross-section. Applying the wrong
  // rule is worth ~5% — enough to under-buy the steel.
  for (const p of STRUCTURE_PROFILES) {
    it(`${p.key} — ${p.sectionMm}`, () => {
      expect(p.dims).toBeDefined();
      const implied = massPerMFromDims(p.dims!);
      const err = Math.abs(implied - p.kgPerM) / p.kgPerM;
      expect(err, `${p.key}: dims imply ${implied.toFixed(3)} kg/m, catalog says ${p.kgPerM}`).toBeLessThan(0.03);
    });
  }

  it('the heavy channel reproduces the reference 3.73 kg/m exactly', () => {
    // 80 × 40 × 15 × 2.5 → blank 190 mm × 2.5 mm = 475 mm² → 3.73 kg/m.
    // Quoting the drawn polygon area instead (~450 mm²) would say 3.53 and
    // under-buy by 5%.
    const p = profileByKey('c_channel_80')!;
    expect(developedWidthMm(p.dims!)).toBeCloseTo(190, 6);
    expect(massPerMFromDims(p.dims!)).toBeCloseTo(3.73, 2);
    expect(outlineAreaMm2(p.dims!)).toBeLessThan(475); // bends, not square corners
  });

  it('hollow sections use enclosed area, not a blank', () => {
    const rhs = profileByKey('rhs')!.dims!;
    expect(developedWidthMm(rhs)).toBe(0);
    expect(hollowAreaMm2(rhs)).toBeCloseTo(outlineAreaMm2(rhs), 1);
  });
});

describe('section labels derive from dims, so they cannot drift', () => {
  it('formats each family the way an engineer writes it', () => {
    expect(sectionLabel({ h: 80, b: 40, lip: 15, t: 2.5, shape: 'c' })).toBe('80 × 40 × 15 × 2.5');
    expect(sectionLabel({ h: 75, b: 40, t: 2.0, shape: 'u' })).toBe('75 × 40 × 2');
    expect(sectionLabel({ h: 63, t: 2.0, shape: 'chs' })).toBe('Ø63 × 2');
  });

  it('every catalog entry carries a label, grade and coating', () => {
    for (const p of STRUCTURE_PROFILES) {
      expect(p.sectionMm).toBe(sectionLabel(p.dims!));
      expect(p.isGrade).toBe('IS 2062');
      expect(p.coating).toBeTruthy();
    }
  });
});

describe('outlines are well formed', () => {
  for (const p of STRUCTURE_PROFILES) {
    it(`${p.key} encloses real area and closes cleanly`, () => {
      const o = sectionOutline(p.dims!);
      expect(o.outer.length).toBeGreaterThanOrEqual(4);
      for (const pt of o.outer) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
      expect(outlineAreaMm2(p.dims!)).toBeGreaterThan(0);
      // the section must be thin-walled: material area well under the bbox
      const xs = o.outer.map((q) => q.x);
      const ys = o.outer.map((q) => q.y);
      const bbox = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      expect(outlineAreaMm2(p.dims!)).toBeLessThan(bbox);
    });
  }

  it('the glyph path is generated from the same outline as the model', () => {
    const d = profileByKey('c_channel')!.dims!;
    const svg = sectionSvgPath(d);
    const o = sectionOutline(d);
    // one "M" per ring — outer plus any holes
    expect((svg.path.match(/M/g) ?? []).length).toBe(1 + o.holes.length);
    expect(svg.w).toBeCloseTo(40, 6); // flange width
    expect(svg.h).toBeCloseTo(80, 6); // web depth
  });

  it('hollow sections produce a hole ring', () => {
    expect(sectionOutline(profileByKey('rhs')!.dims!).holes).toHaveLength(1);
    expect(sectionOutline(profileByKey('chs')!.dims!).holes).toHaveLength(1);
  });
});

// ── E9: the instancing contract ─────────────────────────────────────────────
// The old renderer drew a scaled unit BOX, where non-uniform scale is harmless.
// A real section is not: stretch it on a cross-section axis and the web thins
// while the flanges stay put. Members must therefore be UNIT length along Y and
// stretched by scaling Y alone.
describe('E9 — unit-length extrusion, stretched on the extrusion axis only', () => {
  const bbox = (g: THREE.BufferGeometry) => {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z };
  };

  it('geometry is exactly 1 unit long along Y', () => {
    for (const p of STRUCTURE_PROFILES) {
      const g = profileGeometry(p.dims!);
      expect(bbox(g).y, `${p.key} must be unit length`).toBeCloseTo(1, 6);
      g.dispose();
    }
  });

  // REGRESSION. The unit-length assertion above passes for BOTH y ∈ [0,1] and
  // y ∈ [−0.5, 0.5], and ExtrudeGeometry produces the former — while the
  // BoxGeometry this replaced produced the latter. The instancer places each
  // member at its MIDPOINT, so an uncentred geometry renders every member
  // shifted half its own length along its axis. It shipped looking fine in the
  // unit tests and was only caught by looking at the actual scene: purlins shot
  // metres past the end of the array.
  it('geometry is CENTRED on the extrusion axis, like the box it replaced', () => {
    for (const p of STRUCTURE_PROFILES) {
      const g = profileGeometry(p.dims!);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      expect(b.min.y, `${p.key} min`).toBeCloseTo(-0.5, 6);
      expect(b.max.y, `${p.key} max`).toBeCloseTo(0.5, 6);
      g.dispose();
    }
  });

  it('a member drawn at its midpoint lands on its own endpoints', () => {
    // the exact composition the renderer performs, for a 4 m horizontal purlin
    const p = profileByKey('c_channel')!;
    const g = profileGeometry(p.dims!);
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(4, 0, 0);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 4, 1)));
    g.computeBoundingBox();
    expect(g.boundingBox!.min.x).toBeCloseTo(0, 4);
    expect(g.boundingBox!.max.x).toBeCloseTo(4, 4);
    g.dispose();
  });

  it('cross-section extents equal the declared dimensions, in metres', () => {
    const p = profileByKey('c_channel')!;
    const g = profileGeometry(p.dims!);
    const b = bbox(g);
    expect(b.x).toBeCloseTo(0.04, 6); // 40 mm flange
    expect(b.z).toBeCloseTo(0.08, 6); // 80 mm web
    g.dispose();
  });

  it('scaling Y leaves every cross-section vertex untouched', () => {
    const p = profileByKey('c_channel_80')!;
    const g = profileGeometry(p.dims!);
    const before = Array.from(g.attributes.position.array);
    g.applyMatrix4(new THREE.Matrix4().makeScale(1, 3.7, 1));
    const after = Array.from(g.attributes.position.array);
    // positions are Float32, so ~1e-7 is the storage floor; 1e-6 m is 0.001 mm
    for (let i = 0; i < before.length; i += 3) {
      expect(after[i]).toBeCloseTo(before[i], 6); // x untouched
      expect(after[i + 2]).toBeCloseTo(before[i + 2], 6); // z untouched
      expect(after[i + 1]).toBeCloseTo(before[i + 1] * 3.7, 6); // y stretched
    }
    g.dispose();
  });

  it('the cache hands back one geometry per profile', () => {
    const p = profileByKey('rhs')!;
    expect(cachedProfileGeometry(p.key, p.dims!)).toBe(cachedProfileGeometry(p.key, p.dims!));
  });
});
