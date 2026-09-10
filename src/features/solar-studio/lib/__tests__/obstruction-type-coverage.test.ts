// ─── Every ObstructionType must be reachable, drawable and keepable ─────────
// Adding a member to the union gives you three compiler errors, from the three
// exhaustive `Record<ObstructionType, …>` tables. That is the easy half.
//
// The dangerous half is silent. Other places are hand-written arrays or a
// switch with a default, so a new member compiles, ships, and is:
//   · absent from the Step-3 palette      → the user cannot place one
//   · absent from the mesh switch          → it draws as an anonymous grey box
// None of that raises an error anywhere. This file is the gate that turns each
// of those into a failing test instead, and it is written to fail LOUDLY
// with the name of the type that was forgotten.
//
// A fourth check lived here — the AI artifact whitelist, which rewrote any
// unlisted type to 'other' on import. It went with the roof detector.
//
// The union cannot be enumerated at runtime, so ALL_TYPES below is the one
// hand-written list — and the first test proves it matches the three tables
// tsc does check, which is what stops this file rotting into a lie.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ObstructionType } from '../../types';
import { CAPABILITY_PRESETS } from '../capabilities';
import { OBSTRUCTION_PRESETS } from '../roof-factory';

const ALL_TYPES: ObstructionType[] = [
  'tank',
  'dish',
  'chimney',
  'tree',
  'elevated',
  'building',
  'solar_wh',
  'ac_outdoor',
  'ladder',
  'windmill',
  'turbine_vent',
  'other',
];

const SRC = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** the types that are deliberately drawn by the switch's `default:` massing box */
const GENERIC_BY_DESIGN: ObstructionType[] = ['elevated', 'building', 'other'];

describe('ObstructionType coverage', () => {
  it('ALL_TYPES matches the tables the compiler already checks', () => {
    // if this fails, ALL_TYPES is stale and every other test here is worthless
    expect([...ALL_TYPES].sort()).toEqual(Object.keys(CAPABILITY_PRESETS).sort());
    expect([...ALL_TYPES].sort()).toEqual(Object.keys(OBSTRUCTION_PRESETS).sort());
  });

  it('every type can be PLACED — it appears in the Step-3 palette', () => {
    const src = read('screens/Step3Obstructions.tsx');
    const missing = ALL_TYPES.filter((t) => !src.includes(`['${t}',`));
    expect(missing, `not in the Step 3 picker, so unplaceable: ${missing.join(', ')}`).toEqual(
      [],
    );
  });

  it('every type is DRAWN by its own case, unless it is generic on purpose', () => {
    const src = read('three/ObstructionMesh.tsx');
    const shouldDraw = ALL_TYPES.filter((t) => !GENERIC_BY_DESIGN.includes(t));
    const missing = shouldDraw.filter((t) => !src.includes(`case '${t}':`));
    expect(
      missing,
      `falls through to the grey default box in ObstructionMesh: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('every type has a human-readable name in the 3D scene', () => {
    const src = read('three/Scene3D.tsx');
    const missing = ALL_TYPES.filter((t) => !src.includes(`${t}:`));
    expect(missing, `no OBSTRUCTION_NAME entry: ${missing.join(', ')}`).toEqual([]);
  });

  it('every type has a UNIQUE label prefix, so two objects never collide', () => {
    const codes = ALL_TYPES.map((t) => OBSTRUCTION_PRESETS[t].code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('every default size is a real object, not a placeholder', () => {
    for (const t of ALL_TYPES) {
      const [l, w, h] = OBSTRUCTION_PRESETS[t].size;
      for (const v of [l, w, h]) {
        expect(v, `${t} has a zero or negative dimension`).toBeGreaterThan(0);
        expect(v, `${t} is implausibly large for a rooftop object`).toBeLessThan(30);
      }
    }
  });
});

describe('ac_outdoor preset', () => {
  it('is a 1.5-ton condenser on a stand, the unit that actually sells here', () => {
    const [l, w, h] = OBSTRUCTION_PRESETS.ac_outdoor.size;
    expect(l).toBeCloseTo(0.85, 2); // long fan face — Daikin 845, Voltas 835 mm
    expect(w).toBeCloseTo(0.35, 2); // depth — 295-300 mm case plus the stand
    expect(h).toBeCloseTo(0.88, 2); // ~580 mm case on a ~300 mm MS angle stand
  });

  it('may be bridged, but only with the clearance the OEM manuals ask for', () => {
    const caps = CAPABILITY_PRESETS.ac_outdoor;
    expect(caps.panelsMayCross).toBe(true);
    expect(caps.mustRemainOpenToSky).toBe(false); // side-discharge, not top
    expect(caps.minVerticalClearanceM).toBe(0.5);
    // and someone has to sign off a load path over a machine that needs service
    expect(caps.requiresEngineerConfirmation).toBe(true);
  });
});

describe('ladder preset', () => {
  it('is a ladder you could climb — reach out, rails close together', () => {
    // it used to be [0.6, 1.5, 3]: 600 mm of stand-off and 1.5 m between the
    // rails, which ProceduralLadder duly drew once it started building the
    // real thing from these numbers
    const [l, w] = OBSTRUCTION_PRESETS.ladder.size;
    expect(w).toBeLessThan(l);
    expect(w).toBeGreaterThanOrEqual(0.4);
    expect(w).toBeLessThanOrEqual(0.6);
  });
});
