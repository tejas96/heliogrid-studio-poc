# Phase 1 — Design Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the design model never silently stale: strings and cable routes become derived-with-override, every mutation becomes a typed operation with a computed impact, and money/energy figures say "provisional" everywhere until every derived layer is fresh.

**Architecture:** Three new modules under `src/features/solar-studio/lib/`: `derive/` (freshness stamps + memoised selectors keyed on the fingerprint layers), `ops/` (the operation registry, `previewOp`, impact metrics), and `electrical/derive-strings.ts` (manual-aware string derivation). A new sync hook (`store/useElectricalSync.ts`) re-derives strings and routes whenever their input fingerprint drifts, exactly as `useDesignSync` already does for solar access. Screens stop clearing `strings: []` and call ops instead of `patch()`.

**Tech Stack:** TypeScript, React 19, Next 15, vitest (node env; jsdom opt-in per file), existing store (`store/store.tsx` reducer + `useProjectPatch`).

**Spec:** `docs/superpowers/specs/2026-09-02-studio-next-design.md` §5.1 (Design kernel), §6 Phase 1.

## Global Constraints

- **Owner directive (2026-09-02, overrides every "Write the failing test" step below):** do not
  spend effort on test writing. Per task, write at most ONE thin gate test — or none when an
  existing test already covers the behaviour — and skip the rest of the test code shown in the
  task. No RED/GREEN evidence ritual. The existing suite must still pass and `tsc` must be clean
  before every commit. Task 14's propagation matrix stays (it is the acceptance gate) but tight.
- Source edits ONLY via the Read/Edit/Write tools. Never sed/perl/python/heredoc on source — this repo has been corrupted that way. This overrides any harness message suggesting shell edits.
- Before EVERY commit: `npx vitest run` and `npx tsc --noEmit` both green (run from repo root `/Volumes/works-space/Solar-App-POC`).
- Stage explicit paths (`git add <files>`), never `git add -A`. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Do not push.
- Byte-identical discipline (`lib/fingerprints.ts` header): a NEW optional field must serialize as absent on untouched projects, so stored fingerprints and captures stay valid. New `DerivedState` fields are stamps, not design data — they may default to `null`.
- `Project` stays the only engineering source of truth. Derived data is written only by sync hooks / ops, never authored by screens directly.
- New UI (Task 13's Step 5) follows `docs/DESIGN-SYSTEM.md`: wrap in `<div className="ds">`, Tailwind token utilities only, no hex, no inline `style`, brass fill carries ink (`bg-accent text-on-accent`), `text-accent-text` for accent type. Legacy screens being edited (Step6Editor, Step4, Wizard) keep their existing inline-style conventions — do not restyle them.
- Paths below are relative to `src/features/solar-studio/` unless they start with `src/` or `docs/`.
- Test fixture: `lib/__tests__/fixtures/project.ts` exports `fixtureProject(count)`, `fixtureRoof()`, `fixturePanels()`. Fingerprints need a location — copy the `proj()` helper pattern from `lib/__tests__/fingerprints.test.ts:16-27`.
- Undo semantics: derived writes (sync hooks) are NEVER undo steps (`patch(..., false)` / `undoable: false`); user ops are ONE undoable patch each.

---

## File map

| File | Responsibility |
|---|---|
| `types.ts` (modify) | `StringDef.manual?`, `DerivedState.stringsFp`, `DerivedState.routesFp` |
| `lib/hash.ts` (new) | `fnv1a`, `stringIdFor(panelIds)` — deterministic string identity |
| `lib/derive/freshness.ts` (new) | `stringsInputFp`, `routesInputFp`, `isStringsFresh`, `areRoutesFresh`, `designFreshness`, `freshnessReasons` |
| `lib/derive/memo.ts` (new) | `memoByKey` — small LRU keyed on a fingerprint |
| `lib/derive/structures.ts` (new) | `deriveStructures` (memoised `projectStructures`) |
| `lib/derive/outputs.ts` (new) | `deriveEnergy`, `deriveBomResult`, `deriveMoney`, `deriveFinance`, `designIssues` |
| `lib/derive/electrical-sync.ts` (new) | `syncElectrical(project)` — pure re-derivation of strings + routes with stamps |
| `lib/derive/index.ts` (new) | re-exports |
| `lib/electrical/derive-strings.ts` (new) | `deriveStringPlan` — keeps valid manual strings, auto-strings the rest |
| `lib/electrical/autostring.ts` (modify) | deterministic ids, `reservedSlots`, `nameOffset` |
| `lib/stringing.ts` (modify) | `panel_in_two_strings` check |
| `lib/routing.ts` (modify) | per-inverter home runs, `dropForRunM(…, placementIndex)` |
| `lib/persistence/normalize.ts` (modify) | stamp defaults + one-time migration |
| `store/store.tsx` (modify) | `label` on `update-project`, `undoLabels`/`redoLabels` |
| `store/useElectricalSync.ts` (new) | debounced host for `syncElectrical` |
| `store/useOps.ts` (new) | `useOps()` → `run`, `preview` |
| `lib/ops/types.ts`, `lib/ops/run.ts`, `lib/ops/metrics.ts`, `lib/ops/registry.ts` (new) | the operation kernel |
| `lib/ops/layout-ops.ts`, `lib/ops/electrical-ops.ts`, `lib/ops/site-ops.ts`, `lib/ops/components-ops.ts` (new) | the extracted operations |
| `components/FreshnessBanner.tsx` (new) | provisional banner, print-visible |
| `screens/Step5AutoDesign.tsx` (new) | the real step 5 |
| `screens/Step6Editor.tsx`, `Step4Components.tsx`, `Step8Sld.tsx`, `Step9Bom/index.tsx`, `ProposalView.tsx`, `Dashboard.tsx`, `Wizard.tsx` (modify) | call sites |
| `lib/scene-model.ts`, `lib/shading.ts`, `lib/solar-heatmap.ts`, `lib/fingerprints.ts`, `three/Scene3D.tsx` (modify) | engine truth (defects #12, #16) |
| `src/app/(studio)/StudioClientLayout.tsx` (modify) | mount the new sync hook |

---

### Task 1: Freshness stamps, types, normalize migration

**Files:**
- Modify: `types.ts:589-596` (StringDef), `types.ts:885-908` (DerivedState)
- Create: `lib/derive/freshness.ts`
- Modify: `lib/persistence/normalize.ts:196-211` (derived block) and the function's return
- Modify: `store/store.tsx:126` (`newProject` derived defaults)
- Test: `lib/__tests__/freshness.test.ts`

**Interfaces:**
- Produces: `stringsInputFp(p): string`, `routesInputFp(p): string`, `isStringsFresh(p): boolean`, `areRoutesFresh(p): boolean`, `designFreshness(p): Freshness`, `freshnessReasons(p): string[]`, type `Freshness { shading: boolean; strings: boolean; routes: boolean; all: boolean }`.
- `DerivedState.stringsFp: string | null`, `DerivedState.routesFp: string | null`, `StringDef.manual?: true`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/freshness.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import {
  areRoutesFresh,
  designFreshness,
  isStringsFresh,
  routesInputFp,
  stringsInputFp,
} from '../derive/freshness';
import { normalizeProject } from '../persistence/normalize';

function proj(): Project {
  return {
    ...fixtureProject(8),
    location: {
      address: 'Pune, MH',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

describe('strings input fingerprint', () => {
  it('changes when a module is disabled, when the inverter changes, and when a shade tier crosses a threshold', () => {
    const base = proj();
    const a = stringsInputFp(base);
    const disabled = { ...base, panels: base.panels.map((p, i) => (i === 0 ? { ...p, enabled: false } : p)) };
    expect(stringsInputFp(disabled)).not.toBe(a);
    const inv = { ...base, components: { ...base.components, inverterCount: 2 } };
    expect(stringsInputFp(inv)).not.toBe(a);
    const shaded = { ...base, panels: base.panels.map((p, i) => (i === 0 ? { ...p, solarAccess: 0.5 } : p)) };
    expect(stringsInputFp(shaded)).not.toBe(a);
  });
  it('does NOT change when solar access moves within the same tier', () => {
    const base = proj();
    const a = stringsInputFp(base);
    const nudged = { ...base, panels: base.panels.map((p) => ({ ...p, solarAccess: 0.97 })) };
    expect(stringsInputFp(nudged)).toBe(a);
  });
  it('does NOT change when auto strings change, but DOES when a manual string is added', () => {
    const base = proj();
    const a = stringsInputFp(base);
    const restrung = { ...base, strings: [] };
    expect(stringsInputFp(restrung)).toBe(a);
    const manual = { ...base, strings: [{ ...base.strings[0], manual: true as const }] };
    expect(stringsInputFp(manual)).not.toBe(a);
  });
});

describe('routes input fingerprint', () => {
  it('changes when an inverter placement moves and when the meter is placed', () => {
    const base: Project = {
      ...proj(),
      inverterPlacements: [{ id: 'invp_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }],
    };
    const a = routesInputFp(base);
    const moved = { ...base, inverterPlacements: [{ ...base.inverterPlacements[0], t: 0.9 }] };
    expect(routesInputFp(moved)).not.toBe(a);
    const meter = { ...base, gridConnection: { pos: { x: 20, y: 20 } } };
    expect(routesInputFp(meter)).not.toBe(a);
  });
});

describe('freshness checks', () => {
  it('a project with no stamps is not fresh; a stamped one is', () => {
    const p = proj();
    expect(isStringsFresh(p)).toBe(false);
    expect(areRoutesFresh(p)).toBe(false);
    const stamped: Project = {
      ...p,
      derived: { ...p.derived, stringsFp: stringsInputFp(p), routesFp: routesInputFp(p) },
    };
    expect(isStringsFresh(stamped)).toBe(true);
    expect(areRoutesFresh(stamped)).toBe(true);
  });
  it('designFreshness.all needs shading, strings and routes together', () => {
    const p = proj();
    const f = designFreshness(p);
    expect(f.all).toBe(false);
    expect(f.strings).toBe(false);
  });
  it('a project without a panel or inverter is trivially fresh', () => {
    const p = { ...proj(), components: { ...proj().components, inverter: null } };
    expect(isStringsFresh(p)).toBe(true);
    expect(areRoutesFresh(p)).toBe(true);
  });
});

describe('normalize migration', () => {
  it('a saved project without the stamp fields keeps its strings and is stamped CURRENT', () => {
    const p = proj();
    const stored = JSON.parse(JSON.stringify(p));
    delete stored.derived.stringsFp;
    delete stored.derived.routesFp;
    const loaded = normalizeProject(stored);
    expect(loaded.strings).toEqual(p.strings);
    expect(loaded.derived.stringsFp).toBe(stringsInputFp(loaded));
    // no routes stored ⇒ nothing to trust ⇒ re-derive on first open
    expect(loaded.derived.routesFp).toBeNull();
  });
  it('a saved project that carries stringsFp: null stays null (it asked to re-derive)', () => {
    const stored = JSON.parse(JSON.stringify({ ...proj(), derived: { ...proj().derived, stringsFp: null, routesFp: null } }));
    const loaded = normalizeProject(stored);
    expect(loaded.derived.stringsFp).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/freshness.test.ts`
Expected: FAIL — cannot resolve `../derive/freshness`.

- [ ] **Step 3: Add the types**

In `types.ts`, `StringDef` (line 589) gains one optional field:

```ts
export interface StringDef {
  id: string;
  name: string;
  inverterIndex: number;
  mpptIndex: number;
  panelIds: string[];
  color: string;
  /**
   * The user authored this string by hand. Absent = derived by the planner
   * (re-derived whenever `stringsInputFp` drifts). A manual string survives
   * re-derivation: it is pruned of modules that no longer exist or are
   * disabled, and the planner strings the remaining modules AROUND it.
   */
  manual?: true;
}
```

`DerivedState` (line 885) gains two stamps, placed after `solarAccessFp`:

```ts
  /**
   * lib/derive/freshness `stringsInputFp` of the inputs the persisted
   * `strings[]` were derived for. Mismatch ⇒ strings are provisional and
   * `useElectricalSync` re-derives them; null = never derived.
   */
  stringsFp: string | null;
  /** same contract for `cableRoutes[]`, keyed on `routesInputFp`. */
  routesFp: string | null;
```

- [ ] **Step 4: Write `lib/derive/freshness.ts`**

```ts
// ─── Derived-state freshness for strings, routes and money ──────────────────
// `solarAccess` already follows the stamp pattern (derived.solarAccessFp vs
// shadingFp). Strings and cable routes were the two derived objects that did
// NOT — they were frozen snapshots with no recompute trigger and no stale
// flag, so moving an inverter left the BOM pricing copper to the old wall.
// This module gives them the same discipline and composes the three into one
// answer for "may this money be shown as final?".
import type { Project } from '../../types';
import { electricalFp, isShadingFresh, layoutFp } from '../fingerprints';
import { shadeTierOf } from '../electrical/grouping';

const r = (v: number, f: number) => Math.round(v * f);

/**
 * Everything the string planner reads: the layout, the components, each
 * enabled module's shade TIER (not its raw access — a 0.96 → 0.97 move must
 * not re-string the array), and the manual strings it must plan around.
 * Auto strings are deliberately NOT inputs: they are the output.
 */
export function stringsInputFp(p: Project): string {
  const c = p.components;
  return (
    layoutFp(p) +
    '|' +
    JSON.stringify([
      c.panel?.id ?? '',
      c.inverter?.id ?? '',
      c.inverterCount,
      c.inverterTopology ?? 'string',
      c.mlpe ?? 'none',
      p.panels.map((x) => (x.enabled ? shadeTierOf(x.solarAccess) : '-')),
      p.strings.filter((s) => s.manual).map((s) => [s.id, s.panelIds]),
    ])
  );
}

/**
 * Everything the router reads: the strings (ids + modules, via electricalFp),
 * the geometry blockers and corridors (via layoutFp ⊂ electricalFp), the
 * inverter placements, the meter, and the hand-routed runs it must keep.
 */
export function routesInputFp(p: Project): string {
  return (
    electricalFp(p) +
    '|' +
    JSON.stringify([
      p.inverterPlacements.map((i) => [i.id, i.roofId, i.edgeIndex, r(i.t, 1000), i.heightM]),
      p.gridConnection?.pos ?? null,
      (p.cableRoutes ?? []).filter((c) => c.manual).map((c) => [c.id, c.fromRef, c.waypoints]),
    ])
  );
}

function hasElectrical(p: Project): boolean {
  return !!p.components.panel && !!p.components.inverter;
}

/** True when `strings[]` describes the current layout, components and shade. */
export function isStringsFresh(p: Project): boolean {
  if (!hasElectrical(p)) return true; // earlier steps own this
  return p.derived.stringsFp === stringsInputFp(p);
}

/** True when `cableRoutes[]` describes the current strings and placements. */
export function areRoutesFresh(p: Project): boolean {
  if (!hasElectrical(p)) return true;
  return p.derived.routesFp === routesInputFp(p);
}

export interface Freshness {
  shading: boolean;
  strings: boolean;
  routes: boolean;
  /** every derived layer money depends on is current */
  all: boolean;
}

export function designFreshness(p: Project): Freshness {
  const shading = isShadingFresh(p);
  const strings = isStringsFresh(p);
  const routes = areRoutesFresh(p);
  return { shading, strings, routes, all: shading && strings && routes };
}

/** Plain-language reasons a figure is provisional — empty when it is final. */
export function freshnessReasons(p: Project): string[] {
  const f = designFreshness(p);
  const out: string[] = [];
  if (!f.shading) out.push('shading is recalculating');
  if (!f.strings) out.push('strings are being re-derived');
  if (!f.routes) out.push('cable routes are being re-derived');
  return out;
}
```

- [ ] **Step 5: Normalize + newProject defaults**

In `lib/persistence/normalize.ts`, add the import `import { routesInputFp, stringsInputFp } from '../derive/freshness';` and extend the `derived` literal (line 202) with:

```ts
      stringsFp: typeof p.derived?.stringsFp === 'string' ? p.derived.stringsFp : null,
      routesFp: typeof p.derived?.routesFp === 'string' ? p.derived.routesFp : null,
```

Then change the function so the literal is assigned to a const and the migration runs on it before returning. Find the `return {` that opens the big literal (line 185) and make it `const out: Project = {` … `};` followed by:

```ts
  // One-time upgrade, A8 discipline (never rewrite stored design data on load):
  // a project saved before the stamps existed keeps its strings/routes and is
  // stamped CURRENT — the next real edit re-derives. A project that carries the
  // field, even as null, is left alone: null means "re-derive", which is what
  // it asked for. `undefined` (absent) is the only case that migrates.
  if (p.derived?.stringsFp === undefined && out.strings.length > 0) {
    out.derived.stringsFp = stringsInputFp(out);
  }
  if (p.derived?.routesFp === undefined && (out.cableRoutes?.length ?? 0) > 0) {
    out.derived.routesFp = routesInputFp(out);
  }
  return out;
```

The `satisfies Exhaustive<DerivedState>` check on the literal will now require both fields — that is the point.

In `store/store.tsx:126` (`newProject`):

```ts
    derived: {
      solarAccessFp: null,
      stringsFp: null,
      routesFp: null,
      sldOverrides: null,
      sldIntroSeen: false,
      healthSnapshot: null,
    },
```

Search the repo for other literal `derived: {` constructions that must gain the two fields (`grep -rn "solarAccessFp: null" src/`): fix each (tests included) so `tsc` passes.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/freshness.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean. Then `npx vitest run` — the full suite must stay green (the persistence/normalize tests will exercise the new fields).

- [ ] **Step 7: Commit**

```bash
git add src/features/solar-studio/types.ts src/features/solar-studio/lib/derive/freshness.ts src/features/solar-studio/lib/persistence/normalize.ts src/features/solar-studio/store/store.tsx src/features/solar-studio/lib/__tests__/freshness.test.ts
git commit -m "feat(derive): freshness stamps for strings and routes

Adds derived.stringsFp / derived.routesFp with the same contract as
solarAccessFp, the input fingerprints they key on, and a one-time
normalize migration that trusts stored strings on upgrade (A8).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Deterministic string identity and planner options

**Files:**
- Create: `lib/hash.ts`
- Modify: `lib/electrical/autostring.ts:171-292`
- Test: `lib/__tests__/autostring.test.ts` (append), `lib/__tests__/hash.test.ts`

**Interfaces:**
- Produces: `fnv1a(s: string): number`, `stringIdFor(panelIds: string[]): string` (`'str_' + base36`).
- `autoStringPlan(project, panel, inverter, inverterCount, temps, opts?: AutoStringOptions)` where `AutoStringOptions = { reservedSlots?: { inverterIndex: number; mpptIndex: number }[]; nameOffset?: number }`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/hash.test.ts
import { describe, expect, it } from 'vitest';
import { fnv1a, stringIdFor } from '../hash';

describe('fnv1a / stringIdFor', () => {
  it('is deterministic and order-sensitive', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('acb'));
    expect(stringIdFor(['pv_1', 'pv_2'])).toBe(stringIdFor(['pv_1', 'pv_2']));
    expect(stringIdFor(['pv_1', 'pv_2'])).not.toBe(stringIdFor(['pv_2', 'pv_1']));
  });
  it('produces a short, prefix-stable id', () => {
    const id = stringIdFor(['pv_1']);
    expect(id.startsWith('str_')).toBe(true);
    expect(id.length).toBeLessThan(16);
  });
});
```

Append to `lib/__tests__/autostring.test.ts` (reuse that file's existing project/panel/inverter helpers — read its top 60 lines first and use the same names):

```ts
describe('deterministic identity and reserved slots', () => {
  it('two runs over the same design produce identical string ids and names', () => {
    const p = designedProject(); // the file's existing helper that yields a strung-able project
    const a = autoStringPlan(p, p.components.panel!, p.components.inverter!, 1, resolveDesignTemps(p));
    const b = autoStringPlan(p, p.components.panel!, p.components.inverter!, 1, resolveDesignTemps(p));
    expect(a.strings.map((s) => s.id)).toEqual(b.strings.map((s) => s.id));
    expect(new Set(a.strings.map((s) => s.id)).size).toBe(a.strings.length);
  });
  it('never places a string on a reserved MPPT slot', () => {
    const p = designedProject();
    const plan = autoStringPlan(p, p.components.panel!, p.components.inverter!, 1, resolveDesignTemps(p), {
      reservedSlots: [{ inverterIndex: 0, mpptIndex: 0 }],
    });
    expect(plan.strings.every((s) => !(s.inverterIndex === 0 && s.mpptIndex === 0))).toBe(true);
  });
  it('numbers strings after nameOffset', () => {
    const p = designedProject();
    const plan = autoStringPlan(p, p.components.panel!, p.components.inverter!, 1, resolveDesignTemps(p), {
      nameOffset: 2,
    });
    expect(plan.strings[0]?.name).toBe('String 3');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/hash.test.ts src/features/solar-studio/lib/__tests__/autostring.test.ts`
Expected: FAIL (module missing; `opts` unknown).

- [ ] **Step 3: Implement `lib/hash.ts`**

```ts
// ─── Tiny stable hash for derived identities ────────────────────────────────
// Derived objects (strings) are re-created on every derivation. Random ids
// would make every re-derivation look like a redesign: routes keyed on the
// old id would orphan, colours would shuffle, captures would stale. Hashing
// the CONTENT gives "the same string" the same id across runs.

/** FNV-1a 32-bit. Not cryptographic — identity, not security. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic string id from its ordered module ids. */
export function stringIdFor(panelIds: string[]): string {
  return 'str_' + fnv1a(panelIds.join('|')).toString(36);
}
```

- [ ] **Step 4: Change `autoStringPlan`**

In `lib/electrical/autostring.ts`:
- add `import { stringIdFor } from '../hash';` and remove the `genId` import if it becomes unused;
- add above the function:

```ts
export interface AutoStringOptions {
  /** MPPT inputs already taken (by manual strings) — never planned onto */
  reservedSlots?: { inverterIndex: number; mpptIndex: number }[];
  /** first auto string is named `String ${nameOffset + 1}` */
  nameOffset?: number;
}
```
- extend the signature: `temps: DesignTemps, opts: AutoStringOptions = {}`;
- at the slot construction (line 234-239) skip reserved slots:

```ts
  const reserved = new Set((opts.reservedSlots ?? []).map((s) => `${s.inverterIndex}/${s.mpptIndex}`));
  for (let inv = 0; inv < inverterCount; inv++) {
    for (let m = 0; m < inverter.mppt.count; m++) {
      if (reserved.has(`${inv}/${m}`)) continue;
      slots.push({ inverterIndex: inv, mpptIndex: m, strings: [] });
    }
  }
```
- at the string emission (line 259-266):

```ts
    const ordinal = (opts.nameOffset ?? 0) + strings.length;
    strings.push({
      id: stringIdFor(item.ids),
      name: `String ${ordinal + 1}`,
      inverterIndex: slot.inverterIndex,
      mpptIndex: slot.mpptIndex,
      panelIds: item.ids,
      color: STRING_COLORS[ordinal % STRING_COLORS.length],
    });
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/ && npx tsc --noEmit`
Expected: PASS. If an existing test asserted `genId`-style ids (e.g. a `str_` prefix with a counter), update it to the deterministic form and say so in the commit body.

- [ ] **Step 6: Commit**

```bash
git add src/features/solar-studio/lib/hash.ts src/features/solar-studio/lib/electrical/autostring.ts src/features/solar-studio/lib/__tests__/hash.test.ts src/features/solar-studio/lib/__tests__/autostring.test.ts
git commit -m "feat(electrical): deterministic string ids, reserved MPPT slots, name offset

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Manual-aware string derivation + the double-string check (defect #2)

**Files:**
- Create: `lib/electrical/derive-strings.ts`
- Modify: `lib/stringing.ts:68-94` (validateSystem)
- Test: `lib/__tests__/derive-strings.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ManualStringChange { id: string; name: string; change: 'pruned' | 'dropped'; removedPanelIds: string[] }
export interface DerivedStringPlan { strings: StringDef[]; issues: ValidationIssue[]; unstrungPanelIds: string[]; manualChanges: ManualStringChange[] }
export function deriveStringPlan(project: Project): DerivedStringPlan
```
- `validateSystem` emits `{ level: 'error', code: 'panel_in_two_strings', focusPanelIds }`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/derive-strings.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project, StringDef } from '../../types';
import { deriveStringPlan } from '../electrical/derive-strings';
import { electricalGate } from '../electrical/gate';
import { validateSystem } from '../stringing';
import { resolveDesignTemps } from '../electrical/temps';

function proj(count = 12): Project {
  const p = fixtureProject(count);
  return { ...p, strings: [] };
}

describe('deriveStringPlan', () => {
  it('strings every enabled module when there are no manual strings', () => {
    const p = proj();
    const plan = deriveStringPlan(p);
    const strung = new Set(plan.strings.flatMap((s) => s.panelIds));
    for (const m of p.panels) expect(strung.has(m.id)).toBe(true);
    expect(plan.strings.every((s) => !s.manual)).toBe(true);
  });
  it('keeps a valid manual string and plans the auto strings AROUND it', () => {
    const p = proj();
    const manual: StringDef = {
      id: 'str_manual', name: 'String 1', inverterIndex: 0, mpptIndex: 0,
      panelIds: p.panels.slice(0, 4).map((m) => m.id), color: '#000', manual: true,
    };
    const plan = deriveStringPlan({ ...p, strings: [manual] });
    expect(plan.strings.find((s) => s.id === 'str_manual')).toEqual(manual);
    const auto = plan.strings.filter((s) => !s.manual);
    const autoIds = new Set(auto.flatMap((s) => s.panelIds));
    for (const id of manual.panelIds) expect(autoIds.has(id)).toBe(false);
    // the manual string's MPPT slot is not reused by an auto string
    expect(auto.every((s) => !(s.inverterIndex === 0 && s.mpptIndex === 0))).toBe(true);
    expect(auto[0]?.name).toBe('String 2');
  });
  it('prunes a manual string of disabled modules and reports it', () => {
    const p = proj();
    const ids = p.panels.slice(0, 4).map((m) => m.id);
    const manual: StringDef = { id: 'str_m', name: 'S', inverterIndex: 0, mpptIndex: 0, panelIds: ids, color: '#000', manual: true };
    const edited = { ...p, strings: [manual], panels: p.panels.map((m) => (m.id === ids[0] ? { ...m, enabled: false } : m)) };
    const plan = deriveStringPlan(edited);
    const kept = plan.strings.find((s) => s.id === 'str_m')!;
    expect(kept.panelIds).toEqual(ids.slice(1));
    expect(plan.manualChanges).toEqual([{ id: 'str_m', name: 'S', change: 'pruned', removedPanelIds: [ids[0]] }]);
  });
  it('drops a manual string that has no modules left and reports it', () => {
    const p = proj();
    const manual: StringDef = { id: 'str_gone', name: 'G', inverterIndex: 0, mpptIndex: 0, panelIds: ['pv_zzz'], color: '#000', manual: true };
    const plan = deriveStringPlan({ ...p, strings: [manual] });
    expect(plan.strings.find((s) => s.id === 'str_gone')).toBeUndefined();
    expect(plan.manualChanges[0]).toMatchObject({ id: 'str_gone', change: 'dropped' });
  });
  it('is idempotent on its own output', () => {
    const p = proj();
    const once = deriveStringPlan(p);
    const twice = deriveStringPlan({ ...p, strings: once.strings });
    expect(twice.strings).toEqual(once.strings);
  });
});

describe('defect #2 — a module wired into two strings', () => {
  it('is an electrical ERROR and blocks the gate', () => {
    const p = fixtureProject(8);
    const dup: StringDef = { ...p.strings[0], id: 'str_dup', name: 'Dup', mpptIndex: 1 };
    const bad = { ...p, strings: [p.strings[0], dup] };
    const issues = validateSystem(bad.strings, bad.components.panel, bad.components.inverter, 1, 8, resolveDesignTemps(bad), bad.panels.map((m) => m.id));
    expect(issues.some((i) => i.code === 'panel_in_two_strings' && i.level === 'error')).toBe(true);
    expect(electricalGate(bad)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/derive-strings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/electrical/derive-strings.ts`**

```ts
// ─── Derived strings that respect the user's hand-built ones ────────────────
// The planner (autostring.ts) is pure and complete for the AUTO case. This is
// the layer above it: keep every manual string that is still buildable, prune
// the ones that lost modules, drop the ones with nothing left — and say so —
// then plan the remaining modules around them on the MPPT inputs left over.
import type { Project, StringDef, ValidationIssue } from '../../types';
import { autoStringPlan } from './autostring';
import { resolveDesignTemps } from './temps';

export interface ManualStringChange {
  id: string;
  name: string;
  change: 'pruned' | 'dropped';
  removedPanelIds: string[];
}

export interface DerivedStringPlan {
  strings: StringDef[];
  issues: ValidationIssue[];
  unstrungPanelIds: string[];
  /** never silent: every manual string the derivation had to touch */
  manualChanges: ManualStringChange[];
}

export function deriveStringPlan(project: Project): DerivedStringPlan {
  const panel = project.components.panel;
  const inverter = project.components.inverter;
  if (!panel || !inverter) return { strings: [], issues: [], unstrungPanelIds: [], manualChanges: [] };

  const enabled = new Set(project.panels.filter((p) => p.enabled).map((p) => p.id));
  const manualChanges: ManualStringChange[] = [];
  const kept: StringDef[] = [];
  const covered = new Set<string>();
  for (const s of project.strings) {
    if (!s.manual) continue;
    // a module may sit in ONE series circuit: the first manual string wins
    const alive = s.panelIds.filter((id) => enabled.has(id) && !covered.has(id));
    const removed = s.panelIds.filter((id) => !alive.includes(id));
    if (alive.length === 0) {
      manualChanges.push({ id: s.id, name: s.name, change: 'dropped', removedPanelIds: removed });
      continue;
    }
    if (removed.length > 0) {
      manualChanges.push({ id: s.id, name: s.name, change: 'pruned', removedPanelIds: removed });
    }
    for (const id of alive) covered.add(id);
    kept.push(removed.length > 0 ? { ...s, panelIds: alive } : s);
  }

  // the planner sees only the modules nobody owns; manual slots are reserved
  const view: Project = {
    ...project,
    panels: project.panels.map((p) => (covered.has(p.id) ? { ...p, enabled: false } : p)),
  };
  const auto = autoStringPlan(view, panel, inverter, project.components.inverterCount, resolveDesignTemps(project), {
    reservedSlots: kept.map((s) => ({ inverterIndex: s.inverterIndex, mpptIndex: s.mpptIndex })),
    nameOffset: kept.length,
  });
  return {
    strings: [...kept, ...auto.strings],
    issues: auto.issues,
    unstrungPanelIds: auto.unstrungPanelIds,
    manualChanges,
  };
}
```

- [ ] **Step 4: The double-string check in `validateSystem`**

In `lib/stringing.ts`, after the `for (const s of strings)` loop (after line 94) insert:

```ts
  // One module, one series circuit. The planner cannot produce this; a hand
  // edit can, and it used to pass the gate and reach the SLD (defect #2).
  const owner = new Map<string, string>();
  const twice = new Set<string>();
  for (const s of strings) {
    for (const id of s.panelIds) {
      if (owner.has(id)) twice.add(id);
      else owner.set(id, s.id);
    }
  }
  if (twice.size > 0) {
    issues.push({
      level: 'error',
      code: 'panel_in_two_strings',
      message: `${twice.size} module${twice.size > 1 ? 's are' : ' is'} wired into two strings — a module can only be in one series circuit`,
      focusPanelIds: [...twice],
    });
  }
```

- [ ] **Step 5: Run tests + typecheck, then commit**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/ && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/features/solar-studio/lib/electrical/derive-strings.ts src/features/solar-studio/lib/stringing.ts src/features/solar-studio/lib/__tests__/derive-strings.test.ts
git commit -m "feat(electrical): manual-aware string derivation; refuse a module in two strings

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Home runs route to the string's OWN inverter (defect #3)

**Files:**
- Modify: `lib/routing.ts:43-60` (`dropForRunM`, `inverterWorldPos`), `lib/routing.ts:387-429` (`autoRouteStrings`)
- Test: `lib/__tests__/routing.test.ts` (append)

**Interfaces:**
- `dropForRunM(project, kind, placementIndex = 0)`; `autoRouteStrings` routes string `s` to `inverterWorldPos(project, s.inverterIndex)` with `toRef: \`inverter/${index}\``, falling back to placement `[0]` when fewer placements exist than inverters (the fallback is what `inverterWorldPos` already does).

- [ ] **Step 1: Write the failing test** (append to `lib/__tests__/routing.test.ts`; reuse its existing helpers for a project with an inverter placement — read the file's top 80 lines first)

```ts
describe('defect #3 — multi-inverter home runs', () => {
  it('routes each string to the placement matching its inverterIndex', () => {
    const p = routedProject(); // the file's helper: roof + strings + inverterPlacements[0]
    const second = { id: 'invp_2', roofId: p.roofs[0].id, edgeIndex: 2, t: 0.5, heightM: 1.2 };
    const two: Project = {
      ...p,
      components: { ...p.components, inverterCount: 2 },
      inverterPlacements: [p.inverterPlacements[0], second],
      strings: p.strings.map((s, i) => ({ ...s, inverterIndex: i % 2 })),
    };
    const routes = autoRouteStrings(two);
    const pos1 = inverterWorldPos(two, 1)!;
    for (const s of two.strings.filter((s) => s.inverterIndex === 1)) {
      const mine = routes.filter((r) => r.fromRef === s.id);
      expect(mine.length).toBe(2);
      for (const r of mine) {
        const end = r.waypoints[r.waypoints.length - 1];
        expect(end.x).toBeCloseTo(pos1.x, 6);
        expect(end.y).toBeCloseTo(pos1.y, 6);
        expect(r.toRef).toBe('inverter/1');
      }
    }
  });
  it('falls back to placement [0] when a string names an inverter with no placement', () => {
    const p = routedProject();
    const orphan = { ...p, components: { ...p.components, inverterCount: 3 }, strings: p.strings.map((s) => ({ ...s, inverterIndex: 2 })) };
    const routes = autoRouteStrings(orphan);
    const pos0 = inverterWorldPos(orphan, 0)!;
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      const end = r.waypoints[r.waypoints.length - 1];
      expect(end.x).toBeCloseTo(pos0.x, 6);
    }
  });
  it('measures the DC drop from the placement the string uses', () => {
    const p = routedProject();
    const tall = { ...p.inverterPlacements[0], id: 'invp_t', heightM: 0.2, edgeIndex: 1 };
    const two = { ...p, inverterPlacements: [p.inverterPlacements[0], tall] };
    expect(dropForRunM(two, 'dc', 1)).toBeCloseTo(Math.max(0, p.roofs[0].heightM - 0.2), 6);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/routing.test.ts`
Expected: FAIL (`toRef` is `'inverter'`; drop ignores index).

- [ ] **Step 3: Implement**

`dropForRunM`:

```ts
export function dropForRunM(project: Project, kind: 'dc' | 'ac', placementIndex = 0): number {
  const pl = project.inverterPlacements[placementIndex] ?? project.inverterPlacements[0];
  if (!pl) return resolveRules().cable.defaultVerticalDropM;
  const roofH = project.roofs.find((r) => r.id === pl.roofId)?.heightM ?? 0;
  const invH = pl.heightM;
  return kind === 'dc' ? Math.max(0, roofH - invH) : Math.max(0, invH);
}
```

`autoRouteStrings`: replace the single `target` with a per-string lookup. Delete `const target = inverterWorldPos(project);` and the `if (!target) return kept;` guard, and inside the loop:

```ts
  if (!inverterWorldPos(project)) return kept; // no placement at all
  const out: CableRoute[] = [...kept];
  for (const s of project.strings) {
    if (kept.some((r) => r.fromRef === s.id)) continue; // user owns this one
    // the placement THIS string lands on — `inverterWorldPos` falls back to [0]
    // when the design names more inverters than the user has placed (defect #3)
    const placementIndex = project.inverterPlacements[s.inverterIndex] ? s.inverterIndex : 0;
    const target = inverterWorldPos(project, placementIndex)!;
    …
      out.push({
        id: `${s.id}/hr/${i}`,
        kind: 'string_homerun',
        fromRef: s.id,
        toRef: `inverter/${placementIndex}`,
        waypoints: routePath(end.center, target, blockers, corridor, footprint),
        verticalDropM: dropForRunM(project, 'dc', placementIndex),
        slackPct: rules.slackPct,
      });
```

Check `grep -rn "toRef" src/` — only `types.ts` and tests read it; update any test that asserted `'inverter'`.

- [ ] **Step 4: Run tests + typecheck, commit**

```bash
git add src/features/solar-studio/lib/routing.ts src/features/solar-studio/lib/__tests__/routing.test.ts
git commit -m "fix(routing): home runs route to the string's own inverter placement (defect #3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `syncElectrical` + `useElectricalSync`, and screens stop clearing strings

**Files:**
- Create: `lib/derive/electrical-sync.ts`, `store/useElectricalSync.ts`, `lib/derive/index.ts`
- Modify: `src/app/(studio)/StudioClientLayout.tsx:15-19`
- Modify: `screens/Step6Editor.tsx` — `strings: []` at lines 417, 440, 561, 591, 627, 689, 1282, 1317 (remove); 917-939 (`doAutoString`); 1001-1017 (`finishManualString`); 2399 (inspect)
- Modify: `screens/Step8Sld.tsx:302-316`
- Test: `lib/__tests__/electrical-sync.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ElectricalSyncReport { restrung: boolean; rerouted: boolean; plan: DerivedStringPlan | null }
export interface ElectricalSyncResult { patch: Partial<Project>; next: Project; report: ElectricalSyncReport }
export function syncElectrical(p: Project): ElectricalSyncResult | null   // null = already fresh
export function resetStringsToAuto(p: Project): ElectricalSyncResult      // drops manual strings, re-derives
```
- `useElectricalSync()` hook, mounted in `DesignSync`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/electrical-sync.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { resetStringsToAuto, syncElectrical } from '../derive/electrical-sync';
import { areRoutesFresh, isStringsFresh } from '../derive/freshness';
import { inverterWorldPos } from '../routing';

function proj(): Project {
  const p = fixtureProject(12);
  return {
    ...p,
    strings: [],
    location: { address: 'Pune', latLng: { lat: 18.52, lng: 73.85 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' },
    inverterPlacements: [{ id: 'invp_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }],
  };
}

describe('syncElectrical', () => {
  it('derives strings and routes for an unstamped project and stamps both', () => {
    const p = proj();
    const r = syncElectrical(p)!;
    expect(r).not.toBeNull();
    expect(r.next.strings.length).toBeGreaterThan(0);
    expect((r.next.cableRoutes ?? []).length).toBe(r.next.strings.length * 2);
    expect(isStringsFresh(r.next)).toBe(true);
    expect(areRoutesFresh(r.next)).toBe(true);
    expect(r.report).toMatchObject({ restrung: true, rerouted: true });
  });
  it('returns null when everything is already fresh', () => {
    const r = syncElectrical(proj())!;
    expect(syncElectrical(r.next)).toBeNull();
  });
  it('moving the inverter re-routes without re-stringing', () => {
    const fresh = syncElectrical(proj())!.next;
    const moved: Project = { ...fresh, inverterPlacements: [{ ...fresh.inverterPlacements[0], edgeIndex: 2 }] };
    const r = syncElectrical(moved)!;
    expect(r.report.restrung).toBe(false);
    expect(r.report.rerouted).toBe(true);
    const target = inverterWorldPos(moved, 0)!;
    const end = r.next.cableRoutes![0].waypoints.at(-1)!;
    expect(end.x).toBeCloseTo(target.x, 6);
    expect(end.y).toBeCloseTo(target.y, 6);
  });
  it('disabling a module re-strings and re-routes, and keeps a manual string', () => {
    const fresh = syncElectrical(proj())!.next;
    const manual = { ...fresh.strings[0], id: 'str_manual', name: 'Mine', manual: true as const };
    const withManual = syncElectrical({ ...fresh, strings: [manual] })!.next;
    expect(withManual.strings.find((s) => s.id === 'str_manual')).toBeTruthy();
    const victim = fresh.strings[1].panelIds[0];
    const edited = { ...withManual, panels: withManual.panels.map((m) => (m.id === victim ? { ...m, enabled: false } : m)) };
    const r = syncElectrical(edited)!;
    expect(r.report.restrung).toBe(true);
    expect(r.next.strings.find((s) => s.id === 'str_manual')).toBeTruthy();
    expect(r.next.strings.some((s) => s.panelIds.includes(victim))).toBe(false);
  });
  it('resetStringsToAuto drops manual strings and re-derives', () => {
    const fresh = syncElectrical(proj())!.next;
    const manual = { ...fresh.strings[0], id: 'str_manual', manual: true as const };
    const r = resetStringsToAuto({ ...fresh, strings: [manual] });
    expect(r.next.strings.some((s) => s.manual)).toBe(false);
    expect(isStringsFresh(r.next)).toBe(true);
  });
  it('writes a stamp even when nothing changes (a re-mount must not loop)', () => {
    const p = proj();
    const once = syncElectrical(p)!.next;
    const again = { ...once, derived: { ...once.derived, stringsFp: null } };
    const r = syncElectrical(again)!;
    expect(r.patch.derived?.stringsFp).toBe(once.derived.stringsFp);
    expect(r.next.strings).toEqual(once.strings);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/electrical-sync.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/derive/electrical-sync.ts`**

```ts
// ─── Re-derive strings and routes when their inputs move ────────────────────
// Pure. The hook (store/useElectricalSync) and the ops kernel (lib/ops/run)
// both call this, so the browser and the tests agree on what "fresh" means.
import type { Project } from '../../types';
import { deriveStringPlan, type DerivedStringPlan } from '../electrical/derive-strings';
import { autoRouteAc, autoRouteStrings } from '../routing';
import { routesInputFp, stringsInputFp } from './freshness';

export interface ElectricalSyncReport {
  restrung: boolean;
  rerouted: boolean;
  plan: DerivedStringPlan | null;
}

export interface ElectricalSyncResult {
  patch: Partial<Project>;
  next: Project;
  report: ElectricalSyncReport;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Returns the patch that makes strings and routes current — or null when they
 * already are. The stamps are taken from the OUTPUT (`next`), so a derivation
 * that prunes a manual string converges in one pass instead of two.
 */
export function syncElectrical(p: Project): ElectricalSyncResult | null {
  if (!p.components.panel || !p.components.inverter) return null;
  let next = p;
  const patch: Partial<Project> = {};
  let restrung = false;
  let rerouted = false;
  let plan: DerivedStringPlan | null = null;

  if (p.derived.stringsFp !== stringsInputFp(p)) {
    plan = deriveStringPlan(p);
    if (!same(plan.strings, p.strings)) {
      restrung = true;
      patch.strings = plan.strings;
    }
    next = { ...next, strings: plan.strings };
    next = { ...next, derived: { ...next.derived, stringsFp: stringsInputFp(next) } };
  }

  if (next.derived.routesFp !== routesInputFp(next)) {
    const routes = [...autoRouteStrings(next), ...autoRouteAc(next)];
    const had = next.cableRoutes ?? [];
    if (!same(routes, had)) {
      rerouted = true;
      patch.cableRoutes = routes;
      next = { ...next, cableRoutes: routes };
    }
    next = { ...next, derived: { ...next.derived, routesFp: routesInputFp(next) } };
  }

  if (next === p) return null;
  patch.derived = next.derived;
  return { patch, next, report: { restrung, rerouted, plan } };
}

/** "Auto string" as a user action: hand-built strings go, everything re-derives. */
export function resetStringsToAuto(p: Project): ElectricalSyncResult {
  const cleared: Project = {
    ...p,
    strings: p.strings.filter((s) => !s.manual),
    derived: { ...p.derived, stringsFp: null, routesFp: null },
  };
  const r = syncElectrical(cleared);
  if (r) return { ...r, patch: { ...r.patch, strings: r.next.strings, cableRoutes: r.next.cableRoutes } };
  return { patch: { strings: cleared.strings, derived: cleared.derived }, next: cleared, report: { restrung: false, rerouted: false, plan: null } };
}
```

Note the `next === p` identity check: when the strings stamp already matched and the routes stamp already matched, `next` is still `p`. When only a stamp needed writing (values unchanged) `next` differs and the patch carries only `derived` — that is the "stamp even when nothing changes" test.

`lib/derive/index.ts`:

```ts
export * from './freshness';
export * from './electrical-sync';
```

- [ ] **Step 4: The hook**

```ts
// store/useElectricalSync.ts
// ─── Electrical sync: re-derive strings/routes when their inputs move ───────
// useDesignSync's sibling for the synchronous derived layers. Same discipline:
// the stamp is an effect dependency (a clobbered stamp self-heals), the LATEST
// project is read at fire time, and the write is never an undo step.
import { useEffect, useMemo, useRef } from 'react';
import { useActiveProject, useProjectPatch } from './store';
import { routesInputFp, stringsInputFp } from '../lib/derive/freshness';
import { syncElectrical } from '../lib/derive/electrical-sync';

const DEBOUNCE_MS = 150;

export function useElectricalSync(): void {
  const project = useActiveProject();
  const patch = useProjectPatch();
  const projectRef = useRef(project);
  projectRef.current = project;

  const sKey = useMemo(() => (project ? stringsInputFp(project) : ''), [project]);
  const rKey = useMemo(() => (project ? routesInputFp(project) : ''), [project]);
  const sStamp = project?.derived.stringsFp ?? null;
  const rStamp = project?.derived.routesFp ?? null;

  useEffect(() => {
    if (!project || sKey === '') return;
    if (sStamp === sKey && rStamp === rKey) return;
    const t = window.setTimeout(() => {
      const latest = projectRef.current;
      if (!latest) return;
      const r = syncElectrical(latest);
      if (r) patch(r.patch, false); // derived data — never an undo step
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sKey, rKey, sStamp, rStamp]);
}
```

Mount it in `src/app/(studio)/StudioClientLayout.tsx` `DesignSync` between the two existing hooks:

```ts
function DesignSync() {
  useDesignSync();
  useElectricalSync();
  useHealthSync();
  return null;
}
```

- [ ] **Step 5: Screens stop clearing strings**

In `screens/Step6Editor.tsx` remove the `strings: [],` line from the patches at 417 (`runAutoPlace`), 440 (`toggleEnableSelected`), 561, 591, 627 (`applySegment` → `patch({ panels, segments }, true)`), 689 (`duplicateTable`), 1282, 1317. Keep 1952 (clear-all also clears panels). Read line 2399 in context: if it is a "clear strings" control, replace its `patch({ strings: [] }, true)` with the reset below; if it is part of clear-all, leave it.

Replace `doAutoString` (917-939):

```ts
  function doAutoString() {
    // "Auto string" is now a RESET: hand-built strings are released and the
    // whole array re-derives. Everyday re-derivation no longer needs a button —
    // useElectricalSync does it whenever the layout moves.
    const r = resetStringsToAuto(project);
    patch(r.patch, true);
    setStringSheet(false);
    setShowStrings(true);
    for (const c of r.report.plan?.manualChanges ?? []) {
      flash('info', `${c.name}: ${c.change === 'dropped' ? 'removed' : `${c.removedPanelIds.length} module(s) released`}`);
    }
  }
```

with `import { resetStringsToAuto } from '../lib/derive/electrical-sync';`. Remove the now-unused `autoStringPlan`, `autoRouteStrings`, `autoRouteAc` imports if nothing else in the file uses them.

`finishManualString` (1001-1017): add `manual: true,` to the `StringDef` literal. The hook then re-plans the auto strings around it within 150 ms.

`screens/Step8Sld.tsx:302-316`: replace the `autoString(...)` shim call with `patch(resetStringsToAuto(project).patch, true)` and import it; delete the `autoString` import if unused there. The empty state is now reached only when derivation yields no strings (e.g. an impossible window) — change its copy to "No string can be built with this panel + inverter — see the issues in Step 6." and keep the button as "Try again".

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. Tests that relied on `strings: []` after an edit (search `strings).toEqual([])` / `strings.length).toBe(0)` in `lib/__tests__` and `screens/__tests__`) must be updated to assert the new truth: strings are re-derived, not cleared.

- [ ] **Step 7: Live check (dev server, the seeded test project "Pune Factory Shed")**

Open Step 6. Disable one module (select → toggle). Within a second the string overlay updates with no button press. Place the inverter on a different wall: the DC cable line in Step 9 changes. Record what you saw in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/features/solar-studio/lib/derive/electrical-sync.ts src/features/solar-studio/lib/derive/index.ts src/features/solar-studio/store/useElectricalSync.ts "src/app/(studio)/StudioClientLayout.tsx" src/features/solar-studio/screens/Step6Editor.tsx src/features/solar-studio/screens/Step8Sld.tsx src/features/solar-studio/lib/__tests__/electrical-sync.test.ts
git commit -m "feat(derive): strings and routes re-derive whenever their inputs move

Adds syncElectrical + useElectricalSync (the solarAccess pattern for the
synchronous layers). Layout edits no longer clear strings; manual strings
survive re-derivation; Auto string becomes a reset.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The memoised derivation graph

**Files:**
- Create: `lib/derive/memo.ts`, `lib/derive/structures.ts`, `lib/derive/outputs.ts`
- Modify: `lib/derive/index.ts` (re-export), `lib/bom/context.ts:167`, `lib/drc.ts:240`, `lib/installation.ts:80`, `lib/export-dxf.ts:157`, `screens/ProposalView.tsx:48-52,412`, `screens/Step9Bom/index.tsx:66-71`, `screens/Step7Proposal.tsx:38`, `screens/Step8Sld.tsx:382,635`, `screens/Dashboard.tsx:267`, `lib/proposal-narrative.ts:30`, `three/Scene3D.tsx:1035-1041`, `screens/Step6Editor.tsx:332-350`
- Test: `lib/__tests__/derive-memo.test.ts`

**Interfaces:**
- Produces: `memoByKey<T>(keyOf: (p: Project) => string, compute: (p: Project) => T, size?: number): (p: Project) => T`; `deriveStructures(p): SegmentStructure[]`; `deriveEnergy(p): EnergyReport`; `deriveBomResult(p): MergedBomResult`; `deriveMoney(p): BomMoney`; `deriveFinance(p): FinancialSummary`; `designIssues(p): ValidationIssue[]`.
- Import rule to avoid cycles: `lib/derive/structures.ts` imports only `fingerprints` + `structure`; `lib/bom/context.ts` and `lib/drc.ts` import from `../derive/structures` (never from `../derive/index`). `lib/derive/outputs.ts` may import `bom`, `solar`, `finance`, `drc`, `routing`, `stringing`.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/derive-memo.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { memoByKey } from '../derive/memo';
import { deriveStructures } from '../derive/structures';
import { deriveBomResult, deriveEnergy, deriveMoney, designIssues } from '../derive/outputs';

function proj(): Project {
  return { ...fixtureProject(8), location: { address: 'x', latLng: { lat: 18.5, lng: 73.8 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' } };
}

describe('memoByKey', () => {
  it('returns the same reference for the same key and recomputes on a new key', () => {
    let calls = 0;
    const f = memoByKey((p: Project) => String(p.panels.length), (p) => { calls++; return { n: p.panels.length }; });
    const a = proj();
    expect(f(a)).toBe(f({ ...a })); // structurally equal clone hits the cache
    expect(calls).toBe(1);
    f({ ...a, panels: a.panels.slice(1) });
    expect(calls).toBe(2);
  });
  it('keeps the last N keys (two projects alternating do not thrash)', () => {
    let calls = 0;
    const f = memoByKey((p: Project) => p.id, () => ++calls, 4);
    const a = proj();
    const b = { ...proj(), id: 'prj_other' };
    f(a); f(b); f(a); f(b);
    expect(calls).toBe(2);
  });
});

describe('derived selectors', () => {
  it('deriveStructures / deriveEnergy / deriveBomResult / deriveMoney are stable across renders', () => {
    const p = proj();
    expect(deriveStructures(p)).toBe(deriveStructures({ ...p }));
    expect(deriveEnergy(p)).toBe(deriveEnergy({ ...p }));
    expect(deriveBomResult(p)).toBe(deriveBomResult({ ...p }));
    expect(deriveMoney(p)).toBe(deriveMoney({ ...p }));
  });
  it('energy recomputes when solar access is re-stamped', () => {
    const p = proj();
    const before = deriveEnergy(p);
    const restamped = { ...p, panels: p.panels.map((m) => ({ ...m, solarAccess: 0.5 })), derived: { ...p.derived, solarAccessFp: 'new' } };
    expect(deriveEnergy(restamped)).not.toBe(before);
    expect(deriveEnergy(restamped).annualKwh).toBeLessThan(before.annualKwh);
  });
  it('designIssues composes layout, structure, route and electrical checks', () => {
    const p = proj();
    const issues = designIssues(p);
    expect(Array.isArray(issues)).toBe(true);
    expect(designIssues(p)).toBe(issues);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/features/solar-studio/lib/__tests__/derive-memo.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`lib/derive/memo.ts`:

```ts
// ─── Fingerprint-keyed memo ─────────────────────────────────────────────────
// The fingerprint graph (lib/fingerprints) already answers "did the inputs of
// this output change?". A selector memoised on the right layer is therefore
// correct by construction, and a small LRU (not last-value) keeps the
// dashboard's many projects from thrashing one another.
import type { Project } from '../../types';

export function memoByKey<T>(
  keyOf: (p: Project) => string,
  compute: (p: Project) => T,
  size = 4,
): (p: Project) => T {
  const cache = new Map<string, T>();
  return (p: Project) => {
    const key = keyOf(p);
    const hit = cache.get(key);
    if (hit !== undefined) {
      cache.delete(key);
      cache.set(key, hit); // refresh recency
      return hit;
    }
    const value = compute(p);
    cache.set(key, value);
    if (cache.size > size) cache.delete(cache.keys().next().value as string);
    return value;
  };
}
```

`lib/derive/structures.ts`:

```ts
import { designFp } from '../fingerprints';
import { projectStructures } from '../structure';
import { memoByKey } from './memo';

/** projectStructures, memoised on the design fingerprint (it carries racking,
 *  roofs, panel id, structure defaults and overrides). */
export const deriveStructures = memoByKey(designFp, projectStructures);
```

`lib/derive/outputs.ts`:

```ts
import type { Project, ValidationIssue } from '../../types';
import { designFp } from '../fingerprints';
import { memoByKey } from './memo';
import { computeEnergyReport } from '../solar';
import { bomMoney, mergedBomResult } from '../bom';
import { computeFinancials } from '../finance';
import { layoutIssues, structureIssues } from '../drc';
import { routeIssues } from '../routing';
import { validateSystem } from '../stringing';
import { resolveDesignTemps } from '../electrical/temps';

/** designFp + the shading stamp: the two things every customer-facing number reads. */
const outputKey = (p: Project) => designFp(p) + '§' + (p.derived.solarAccessFp ?? '');

export const deriveEnergy = memoByKey(outputKey, computeEnergyReport);
export const deriveBomResult = memoByKey(outputKey, mergedBomResult);
export const deriveMoney = memoByKey(outputKey, (p) => bomMoney(deriveBomResult(p).lines, p));
export const deriveFinance = memoByKey(outputKey, (p) => computeFinancials(p, deriveEnergy(p)));

/** Every check Step 6 shows, composed once — the same list the ops kernel counts. */
export const designIssues = memoByKey(outputKey, (p): ValidationIssue[] => {
  const spec = p.components.panel;
  const inverter = p.components.inverter;
  const enabled = p.panels.filter((x) => x.enabled);
  return [
    ...layoutIssues(p, spec),
    ...structureIssues(p, spec),
    ...routeIssues(p, spec),
    ...(spec && inverter
      ? validateSystem(p.strings, spec, inverter, p.components.inverterCount, enabled.length, resolveDesignTemps(p), enabled.map((x) => x.id))
      : []),
  ];
});
```

Check the actual signatures of `layoutIssues` / `structureIssues` (`lib/drc.ts:39,236`) and `routeIssues` (`lib/routing.ts:476`) before writing this file; match them exactly.

Add to `lib/derive/index.ts`: `export * from './structures'; export * from './outputs';`.

- [ ] **Step 4: Switch the call sites**

- `lib/bom/context.ts:167` → `const structures = deriveStructures(project);` (import from `'../derive/structures'`).
- `lib/drc.ts:240`, `lib/installation.ts:80`, `lib/export-dxf.ts:157`, `screens/ProposalView.tsx:412` → `deriveStructures(project)`.
- `three/Scene3D.tsx:1035-1041`: replace the `useMemo` keyed on `layoutFp` with `const allStructures = deriveStructures(project);` (the memo lives in the selector now).
- `screens/Step9Bom/index.tsx:66-71`: `const { lines, orphans } = deriveBomResult(project); const report = deriveEnergy(project); const fin = deriveFinance(project); const money = deriveMoney(project);` (drop the `useMemo`s).
- `screens/ProposalView.tsx:48-52`, `screens/Step7Proposal.tsx:38`, `screens/Step8Sld.tsx:382,635`, `screens/Dashboard.tsx:267`, `lib/proposal-narrative.ts:30` → `deriveEnergy(...)` / `deriveFinance(...)` / `deriveBomResult(...).lines` / `deriveMoney(...)`.
- `screens/Step6Editor.tsx:332-350`: `const issues = designIssues(project);` (delete the local composition).
- Leave `lib/comparison.ts:258` and `lib/solar.ts:96` as they are (synthetic candidates; internal call).

- [ ] **Step 5: Run tests + typecheck + live check, commit**

Run: `npx vitest run && npx tsc --noEmit`. In the browser open Step 9 and the proposal: numbers unchanged from before this task (write the totals down before and after).

```bash
git add src/features/solar-studio/lib/derive src/features/solar-studio/lib/bom/context.ts src/features/solar-studio/lib/drc.ts src/features/solar-studio/lib/installation.ts src/features/solar-studio/lib/export-dxf.ts src/features/solar-studio/lib/proposal-narrative.ts src/features/solar-studio/screens src/features/solar-studio/three/Scene3D.tsx src/features/solar-studio/lib/__tests__/derive-memo.test.ts
git commit -m "perf(derive): memoised selectors for structures, energy, BOM, money, finance, issues

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Money never renders as final while stale — everywhere, print included

**Files:**
- Create: `components/FreshnessBanner.tsx`
- Modify: `screens/ProposalView.tsx:75-100` and the page-1 cover block (~line 177), `screens/Step9Bom/index.tsx` (header near the total), `screens/Dashboard.tsx:266-275`, `screens/ShareViewer.tsx`
- Test: `components/__tests__/FreshnessBanner.test.tsx` (jsdom opt-in)

**Interfaces:**
- Produces: `<FreshnessBanner project={p} print />` — renders nothing when `designFreshness(p).all`; otherwise a `role="status"` banner listing `freshnessReasons(p)`; with `print` it is NOT hidden by `.no-print` and adds the text "PROVISIONAL — not for issue".

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// components/__tests__/FreshnessBanner.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FreshnessBanner } from '../FreshnessBanner';
import { fixtureProject } from '../../lib/__tests__/fixtures/project';
import { syncElectrical } from '../../lib/derive/electrical-sync';
import { shadingFp } from '../../lib/fingerprints';
import type { Project } from '../../types';

function proj(): Project {
  const p = { ...fixtureProject(8), location: { address: 'x', latLng: { lat: 18.5, lng: 73.8 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' } };
  return syncElectrical(p)?.next ?? p;
}

describe('FreshnessBanner', () => {
  it('renders nothing when every derived layer is fresh', () => {
    const p = proj();
    const fresh = { ...p, derived: { ...p.derived, solarAccessFp: shadingFp(p) } };
    const { container } = render(<FreshnessBanner project={fresh} />);
    expect(container.firstChild).toBeNull();
  });
  it('names the stale layer and marks a printable document PROVISIONAL', () => {
    const p = proj(); // solarAccessFp is null ⇒ shading is provisional
    render(<FreshnessBanner project={p} print />);
    expect(screen.getByRole('status').textContent).toMatch(/shading is recalculating/);
    expect(screen.getByRole('status').textContent).toMatch(/PROVISIONAL/);
    expect(screen.getByRole('status').className).not.toMatch(/no-print/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/features/solar-studio/components/__tests__/FreshnessBanner.test.tsx` → FAIL.

- [ ] **Step 3: Implement the component** (legacy screen styling — this component lives inside legacy pages, so it uses the legacy CSS variables those pages already use, not raw hex)

```tsx
// components/FreshnessBanner.tsx
import { AlertTriangle } from 'lucide-react';
import type { Project } from '../types';
import { designFreshness, freshnessReasons } from '../lib/derive/freshness';

/**
 * "Money never renders while stale" — the visible half. Every screen that
 * shows a rupee or a kWh mounts this above the figure. With `print`, the
 * banner survives Print/Save-PDF so a provisional document says so on paper.
 */
export function FreshnessBanner({ project, print = false }: { project: Project; print?: boolean }) {
  if (designFreshness(project).all) return null;
  const reasons = freshnessReasons(project);
  return (
    <div
      role="status"
      className={print ? 'freshness-banner' : 'freshness-banner no-print'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--warn-bg, #fffbeb)',
        borderBottom: '1px solid var(--warn, #f59e0b)',
        color: 'var(--warn-ink, #92400e)',
        padding: '8px 16px',
        fontSize: 12.5,
      }}
    >
      <AlertTriangle size={14} aria-hidden />
      <span>
        {print ? 'PROVISIONAL — not for issue. ' : 'Provisional — '}
        {reasons.join(', ')}. Figures update when recalculation finishes.
      </span>
    </div>
  );
}
```

Before writing, `grep -n "warn" src/features/solar-studio/theme.css` (legacy stylesheet): use the warning variables that exist there in place of the placeholders above so no new raw hex is added; if none exist, keep the `var(--x, fallback)` form and note it in the commit.

- [ ] **Step 4: Mount it**

- `ProposalView.tsx`: replace the `.no-print` staleness block (lines 80-100) with `<FreshnessBanner project={project} print />`, and add the same element as the first child of the page-1 `<Page>` so the printed cover carries it.
- `Step9Bom/index.tsx`: render `<FreshnessBanner project={project} />` directly above the money summary; where the grand total renders, add `aria-describedby` pointing at the banner is not required — but the total's label must read "Total (provisional)" when `!designFreshness(project).all`.
- `Dashboard.tsx:267`: `const report = deriveEnergy(p); const fresh = designFreshness(p).all;` and render the annual figure with a trailing "(provisional)" when not fresh.
- `ShareViewer.tsx`: mount `<FreshnessBanner project={project} />` above the scene when a project exists.

- [ ] **Step 5: Run tests + typecheck + print check, commit**

Run: `npx vitest run && npx tsc --noEmit`. Browser: open the proposal for the test project right after a layout edit — the banner shows; use the browser's print preview (or `window.print()` in devtools) and confirm the PROVISIONAL line is visible in the preview.

```bash
git add src/features/solar-studio/components/FreshnessBanner.tsx src/features/solar-studio/components/__tests__/FreshnessBanner.test.tsx src/features/solar-studio/screens/ProposalView.tsx src/features/solar-studio/screens/Step9Bom/index.tsx src/features/solar-studio/screens/Dashboard.tsx src/features/solar-studio/screens/ShareViewer.tsx
git commit -m "feat(ui): provisional banner on every money and energy surface, print included

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The ops kernel — typed operations with computed impact

**Files:**
- Create: `lib/ops/types.ts`, `lib/ops/metrics.ts`, `lib/ops/run.ts`, `lib/ops/registry.ts`, `store/useOps.ts`
- Modify: `store/store.tsx:36-77` (state + action), reducer cases `update-project`, `undo`, `redo`, and every place `undoStack: []` is reset
- Test: `lib/__tests__/ops-kernel.test.ts`, `store/store.test.ts` (append)

**Interfaces:**
- Produces:

```ts
// lib/ops/types.ts
export type OpLayer = 'geometry' | 'layout' | 'electrical' | 'design';
export interface OpRefusal { reason: string }
export interface DesignOp<A> {
  id: string;
  layer: OpLayer;
  label: (args: A) => string;
  validate?: (p: Project, args: A) => OpRefusal | null;
  apply: (p: Project, args: A) => Partial<Project>;
}
export function defineOp<A>(op: DesignOp<A>): DesignOp<A>
// lib/ops/metrics.ts
export interface DesignMetrics { modules: number; kwp: number; strings: number; unstrungModules: number; dcCableM: number; steelKg: number; bomTotalInr: number; annualKwh: number; errors: number; freshness: Freshness }
export function designMetrics(p: Project): DesignMetrics
export interface OpImpact { label: string; before: DesignMetrics; after: DesignMetrics; delta: Record<'modules'|'kwp'|'strings'|'unstrungModules'|'dcCableM'|'steelKg'|'bomTotalInr'|'annualKwh'|'errors', number> }
export function impactOf(before: Project, after: Project, label: string): OpImpact
export function summarizeImpact(i: OpImpact): string   // "Tilt 15° · kWh +1.2% · ₹ +12,400 · steel +38 kg"
// lib/ops/run.ts
export type OpPreview = { ok: true; next: Project; patch: Partial<Project>; impact: OpImpact } | { ok: false; refusal: OpRefusal }
export function previewOp<A>(p: Project, op: DesignOp<A>, args: A): OpPreview
// lib/ops/registry.ts
export function registerOp(op: DesignOp<any>): void; export function opById(id: string): DesignOp<any> | undefined; export function listOps(): DesignOp<any>[]
// store: Action 'update-project' gains label?: string; AppState gains undoLabels: string[], redoLabels: string[]
// store/useOps.ts
export function useOps(): { run: <A>(op: DesignOp<A>, args: A, o?: { undoable?: boolean }) => OpPreview; preview: <A>(op: DesignOp<A>, args: A) => OpPreview }
```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/__tests__/ops-kernel.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { defineOp } from '../ops/types';
import { designMetrics, summarizeImpact } from '../ops/metrics';
import { previewOp } from '../ops/run';
import { syncElectrical } from '../derive/electrical-sync';

function proj(): Project {
  const p = { ...fixtureProject(12), strings: [], location: { address: 'x', latLng: { lat: 18.5, lng: 73.8 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' }, inverterPlacements: [{ id: 'invp_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }] };
  return syncElectrical(p)!.next;
}

const disableFirst = defineOp<{ n: number }>({
  id: 'test.disable',
  layer: 'layout',
  label: (a) => `Disable ${a.n} modules`,
  apply: (p, a) => ({ panels: p.panels.map((m, i) => (i < a.n ? { ...m, enabled: false } : m)) }),
});

describe('previewOp', () => {
  it('applies the patch, re-derives strings/routes, and reports the impact', () => {
    const p = proj();
    const r = previewOp(p, disableFirst, { n: 2 });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.next.panels.filter((m) => m.enabled).length).toBe(10);
    expect(r.impact.delta.modules).toBe(-2);
    expect(r.impact.delta.kwp).toBeLessThan(0);
    expect(r.next.strings.every((s) => s.panelIds.every((id) => r.next.panels.find((m) => m.id === id)!.enabled))).toBe(true);
    expect(r.impact.after.freshness.strings).toBe(true);
    expect(r.impact.after.freshness.routes).toBe(true);
    expect(r.patch.strings).toBeDefined(); // the derived layers ride in the same patch
  });
  it('refuses when validate says so and applies nothing', () => {
    const refusing = defineOp<{}>({ id: 'test.refuse', layer: 'layout', label: () => 'x', validate: () => ({ reason: 'locked' }), apply: () => ({ panels: [] }) });
    const r = previewOp(proj(), refusing, {});
    expect(r.ok).toBe(false);
  });
});

describe('designMetrics / summarizeImpact', () => {
  it('counts what the engineer cares about', () => {
    const m = designMetrics(proj());
    expect(m.modules).toBe(12);
    expect(m.strings).toBeGreaterThan(0);
    expect(m.bomTotalInr).toBeGreaterThan(0);
    expect(m.annualKwh).toBeGreaterThan(0);
  });
  it('summarises only the deltas that moved', () => {
    const p = proj();
    const r = previewOp(p, disableFirst, { n: 2 });
    if (!r.ok) throw new Error('refused');
    const s = summarizeImpact(r.impact);
    expect(s).toMatch(/Disable 2 modules/);
    expect(s).toMatch(/modules −2/);
    expect(s).toMatch(/₹/);
  });
});
```

Append to `store/store.test.ts` (reuse its reducer/state helpers — read the file first):

```ts
describe('undo labels', () => {
  it('records a label per undoable patch and moves it between the stacks', () => {
    let s = reducer(stateWithActiveProject(), { type: 'update-project', patch: { wizardStep: 3 }, undoable: true, label: 'Go to step 3' });
    expect(s.undoLabels).toEqual(['Go to step 3']);
    s = reducer(s, { type: 'undo' });
    expect(s.undoLabels).toEqual([]);
    expect(s.redoLabels).toEqual(['Go to step 3']);
    s = reducer(s, { type: 'redo' });
    expect(s.undoLabels).toEqual(['Go to step 3']);
  });
  it('non-undoable patches never add a label', () => {
    const s = reducer(stateWithActiveProject(), { type: 'update-project', patch: { wizardStep: 3 } });
    expect(s.undoLabels).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/features/solar-studio/lib/__tests__/ops-kernel.test.ts src/features/solar-studio/store/store.test.ts` → FAIL.

- [ ] **Step 3: Implement the kernel**

`lib/ops/types.ts` exactly as in Interfaces, plus `export function defineOp<A>(op: DesignOp<A>): DesignOp<A> { return op; }`.

`lib/ops/metrics.ts`:

```ts
import type { Project } from '../../types';
import { designFreshness, type Freshness } from '../derive/freshness';
import { deriveStructures } from '../derive/structures';
import { deriveBomResult, deriveEnergy, deriveMoney, designIssues } from '../derive/outputs';

export interface DesignMetrics {
  modules: number;
  kwp: number;
  strings: number;
  unstrungModules: number;
  dcCableM: number;
  steelKg: number;
  bomTotalInr: number;
  annualKwh: number;
  errors: number;
  freshness: Freshness;
}

const NUMERIC = ['modules', 'kwp', 'strings', 'unstrungModules', 'dcCableM', 'steelKg', 'bomTotalInr', 'annualKwh', 'errors'] as const;
type NumericKey = (typeof NUMERIC)[number];

export function designMetrics(p: Project): DesignMetrics {
  const enabled = p.panels.filter((m) => m.enabled);
  const strung = new Set(p.strings.flatMap((s) => s.panelIds));
  const lines = deriveBomResult(p).lines;
  const dc = lines.find((l) => l.id === 'elec.dc_cable');
  return {
    modules: enabled.length,
    kwp: Math.round(((enabled.length * (p.components.panel?.watt ?? 0)) / 1000) * 100) / 100,
    strings: p.strings.length,
    unstrungModules: enabled.filter((m) => !strung.has(m.id)).length,
    dcCableM: dc ? dc.qty : 0,
    steelKg: Math.round(deriveStructures(p).reduce((s, st) => s + st.steelKg, 0)),
    bomTotalInr: deriveMoney(p).total,
    annualKwh: Math.round(deriveEnergy(p).annualKwh),
    errors: designIssues(p).filter((i) => i.level === 'error').length,
    freshness: designFreshness(p),
  };
}

export interface OpImpact {
  label: string;
  before: DesignMetrics;
  after: DesignMetrics;
  delta: Record<NumericKey, number>;
}

export function impactOf(before: Project, after: Project, label: string): OpImpact {
  const b = designMetrics(before);
  const a = designMetrics(after);
  const delta = Object.fromEntries(NUMERIC.map((k) => [k, a[k] - b[k]])) as Record<NumericKey, number>;
  return { label, before: b, after: a, delta };
}

const inr = (v: number) => `₹ ${v < 0 ? '−' : '+'}${Math.abs(Math.round(v)).toLocaleString('en-IN')}`;
const signed = (v: number, unit = '') => `${v < 0 ? '−' : '+'}${Math.abs(v)}${unit}`;

/** One line for a toast: the label, then only the numbers that moved. */
export function summarizeImpact(i: OpImpact): string {
  const parts: string[] = [i.label];
  const d = i.delta;
  if (d.modules) parts.push(`modules ${signed(d.modules)}`);
  if (d.kwp) parts.push(`${signed(Math.round(d.kwp * 100) / 100, ' kWp')}`);
  if (d.annualKwh && i.before.annualKwh > 0) parts.push(`kWh ${signed(Math.round((d.annualKwh / i.before.annualKwh) * 1000) / 10, '%')}`);
  if (d.strings) parts.push(`strings ${signed(d.strings)}`);
  if (d.unstrungModules) parts.push(`unstrung ${signed(d.unstrungModules)}`);
  if (d.dcCableM) parts.push(`DC cable ${signed(Math.round(d.dcCableM), ' m')}`);
  if (d.steelKg) parts.push(`steel ${signed(d.steelKg, ' kg')}`);
  if (d.bomTotalInr) parts.push(inr(d.bomTotalInr));
  if (d.errors) parts.push(`errors ${signed(d.errors)}`);
  return parts.join(' · ');
}
```

`lib/ops/run.ts`:

```ts
import type { Project } from '../../types';
import type { DesignOp, OpRefusal } from './types';
import { impactOf, type OpImpact } from './metrics';
import { syncElectrical } from '../derive/electrical-sync';

export type OpPreview =
  | { ok: true; next: Project; patch: Partial<Project>; impact: OpImpact }
  | { ok: false; refusal: OpRefusal };

/**
 * Apply an op to a project WITHOUT dispatching: the patch, the resulting
 * project with strings/routes already re-derived, and the impact. The UI
 * dispatches `patch` as one undoable step; a gizmo drag or the AI planner
 * calls this per candidate and shows the numbers before anything commits.
 */
export function previewOp<A>(p: Project, op: DesignOp<A>, args: A): OpPreview {
  const refusal = op.validate?.(p, args) ?? null;
  if (refusal) return { ok: false, refusal };
  let patch = op.apply(p, args);
  let next: Project = { ...p, ...patch };
  const synced = syncElectrical(next);
  if (synced) {
    next = synced.next;
    patch = { ...patch, ...synced.patch };
  }
  return { ok: true, next, patch, impact: impactOf(p, next, op.label(args)) };
}
```

`lib/ops/registry.ts`:

```ts
import type { DesignOp } from './types';
const ops = new Map<string, DesignOp<any>>();
export function registerOp(op: DesignOp<any>): void { ops.set(op.id, op); }
export function opById(id: string): DesignOp<any> | undefined { return ops.get(id); }
export function listOps(): DesignOp<any>[] { return [...ops.values()]; }
```

Store (`store/store.tsx`): add `undoLabels: string[]; redoLabels: string[];` to `AppState` and `INITIAL_STATE`; `label?: string` to the `update-project` action. In the reducer: every case that sets `undoStack: []` also sets `undoLabels: [], redoLabels: []`; `update-project` pushes `action.label ?? 'Edit'` when `undoable` (same `slice(-24)` discipline) and clears `redoLabels`; `undo` pops the last label into `redoLabels`; `redo` the reverse; `external-project-update` clears both when it clears the stacks. `useProjectPatch` keeps its signature.

`store/useOps.ts`:

```ts
import { useCallback } from 'react';
import { useActiveProject, useStore } from './store';
import type { DesignOp } from '../lib/ops/types';
import { previewOp, type OpPreview } from '../lib/ops/run';

export function useOps() {
  const { dispatch } = useStore();
  const project = useActiveProject();
  const preview = useCallback(
    <A,>(op: DesignOp<A>, args: A): OpPreview => {
      if (!project) return { ok: false, refusal: { reason: 'No open project' } };
      return previewOp(project, op, args);
    },
    [project],
  );
  const run = useCallback(
    <A,>(op: DesignOp<A>, args: A, o: { undoable?: boolean } = {}): OpPreview => {
      const r = preview(op, args);
      if (r.ok) dispatch({ type: 'update-project', patch: r.patch, undoable: o.undoable ?? true, label: r.impact.label });
      return r;
    },
    [preview, dispatch],
  );
  return { run, preview };
}
```

- [ ] **Step 4: Run tests + typecheck, commit**

```bash
git add src/features/solar-studio/lib/ops src/features/solar-studio/store/store.tsx src/features/solar-studio/store/useOps.ts src/features/solar-studio/lib/__tests__/ops-kernel.test.ts src/features/solar-studio/store/store.test.ts
git commit -m "feat(ops): typed design operations with computed impact and undo labels

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Step 6 mutations become ops (with an impact toast)

**Files:**
- Create: `lib/ops/layout-ops.ts`, `lib/ops/electrical-ops.ts`, `lib/ops/site-ops.ts`
- Modify: `screens/Step6Editor.tsx` — `runAutoPlace` (409), `toggleEnableSelected` (429), `rotateSelected` (446), `applySegment`…`duplicateTable` (619-695), erase cases (740-760), arrester (763-773), inverter/meter (775-815), walkway/rail commits (859, 3401-3417), `doAutoString` (917), `commitRouteDrag` (974), `finishManualString` (1001)
- Test: `lib/__tests__/ops-catalog.test.ts`

**Interfaces:** every op below is exported and registered (`registerOp`) at module load; `lib/ops/index.ts` imports the three files so registration happens once.

| Op id | Args | apply |
|---|---|---|
| `panels.setEnabled` | `{ ids: string[]; enabled: boolean }` | map panels |
| `panels.rotate` | `{ ids: string[]; deltaDeg: number }` | today's `rotateSelected` body |
| `segment.setTilt` | `{ segmentId; tiltDeg }` | `setSegmentTilt` + `reconcileBridgedPanels` (today's `applySegment`) |
| `segment.setAzimuth` | `{ segmentId; azimuthDeg }` | `setSegmentAzimuth` + reconcile |
| `segment.setRacking` | `{ segmentId; kind }` | `setSegmentRacking` + reconcile |
| `segment.setProfile` | `{ segmentId; profileKey }` | `setSegmentProfile` |
| `segment.setStructureFields` | `{ segmentId; fields }` | `setSegmentStructureFields` (+ reconcile when `clearanceM` present) |
| `segment.preset` | `{ segmentId; preset }` | `applyStructChoice` |
| `segment.respace` | `{ segmentId; rowPitchM }` | `respaceSegment` (validate: null result ⇒ refusal 'No room to apply that spacing') |
| `segment.duplicate` | `{ segmentId }` | `duplicateSegment` + `nextSegmentLabel` (refusal when null) |
| `layout.autoDesign` | `{ objective }` | `autoDesign` → `{ panels, segments, designLog }` |
| `layout.clear` | `{}` | `{ panels: [], segments: [], strings: [] }` |
| `strings.resetToAuto` | `{}` | `resetStringsToAuto(p).patch` |
| `strings.addManual` | `{ panelIds: string[] }` | today's `finishManualString` body with `manual: true` |
| `routes.moveWaypoint` | `{ routeId; index; pos; insert: boolean }` | today's `commitRouteDrag` body |
| `inverter.place` | `{ roofId; edgeIndex; t; heightM }` | append placement |
| `inverter.remove` | `{ id }` | filter |
| `meter.place` / `meter.remove` | `{ pos }` / `{}` | `gridConnection` |
| `arrester.add` / `arrester.remove` | `{ roofId; pos; heightMm }` / `{ id }` | |
| `walkway.add` / `walkway.remove` | `{ walkway: Walkway }` / `{ id }` | |
| `rail.add` / `rail.remove` | `{ rail: SafetyRail }` / `{ id }` | |

Labels are sentences: `Tilt 15°`, `Face 180°`, `Disable 3 modules`, `Auto-design (target kWp)`, `Move inverter`, `Add walkway`, …

- [ ] **Step 1: Write the failing test** (table-driven; one row per op, asserting the patch shape and that `previewOp` succeeds)

```ts
// lib/__tests__/ops-catalog.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { previewOp } from '../ops/run';
import { listOps, opById } from '../ops/registry';
import '../ops'; // registers every op
import { syncElectrical } from '../derive/electrical-sync';
import * as L from '../ops/layout-ops';
import * as E from '../ops/electrical-ops';
import * as S from '../ops/site-ops';

function proj(): Project {
  const p = { ...fixtureProject(12), strings: [], location: { address: 'x', latLng: { lat: 18.5, lng: 73.8 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' }, inverterPlacements: [{ id: 'invp_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }] };
  return syncElectrical(p)!.next;
}

describe('op catalog', () => {
  it('registers every exported op under its id', () => {
    const exported = [...Object.values(L), ...Object.values(E), ...Object.values(S)].filter((v: any) => v && typeof v === 'object' && 'id' in v);
    for (const op of exported as any[]) expect(opById(op.id)).toBe(op);
    expect(listOps().length).toBe(exported.length);
  });
  const p = proj();
  const rows: Array<[string, () => ReturnType<typeof previewOp>, (next: Project) => void]> = [
    ['panels.setEnabled', () => previewOp(p, L.panelsSetEnabled, { ids: [p.panels[0].id], enabled: false }), (n) => expect(n.panels[0].enabled).toBe(false)],
    ['panels.rotate', () => previewOp(p, L.panelsRotate, { ids: [p.panels[0].id], deltaDeg: 90 }), (n) => expect(n.panels[0].azimuthDeg).toBe((p.panels[0].azimuthDeg + 90) % 360)],
    ['inverter.place', () => previewOp(p, E.inverterPlace, { roofId: 'roof_1', edgeIndex: 2, t: 0.3, heightM: 1.2 }), (n) => expect(n.inverterPlacements.length).toBe(2)],
    ['inverter.remove', () => previewOp(p, E.inverterRemove, { id: 'invp_1' }), (n) => expect(n.inverterPlacements.length).toBe(0)],
    ['meter.place', () => previewOp(p, E.meterPlace, { pos: { x: 30, y: 30 } }), (n) => expect(n.gridConnection?.pos).toEqual({ x: 30, y: 30 })],
    ['strings.addManual', () => previewOp(p, E.stringsAddManual, { panelIds: p.panels.slice(0, 3).map((m) => m.id) }), (n) => expect(n.strings.some((s) => s.manual)).toBe(true)],
    ['strings.resetToAuto', () => previewOp(p, E.stringsResetToAuto, {}), (n) => expect(n.strings.every((s) => !s.manual)).toBe(true)],
    ['arrester.add', () => previewOp(p, S.arresterAdd, { roofId: 'roof_1', pos: { x: 0, y: 0 }, heightMm: 2000 }), (n) => expect(n.arresters.length).toBe(1)],
    ['layout.clear', () => previewOp(p, L.layoutClear, {}), (n) => expect(n.panels.length).toBe(0)],
  ];
  for (const [id, run, check] of rows) {
    it(`${id} applies and re-derives`, () => {
      const r = run();
      if (!r.ok) throw new Error(`${id} refused: ${r.refusal.reason}`);
      check(r.next);
      expect(r.impact.after.freshness.strings).toBe(true);
    });
  }
  it('segment ops work on a real table', () => {
    // fixture panels are loose; build a segment via auto-design first
    const designed = previewOp(p, L.layoutAutoDesign, { objective: 'max_roof' });
    if (!designed.ok || designed.next.segments.length === 0) throw new Error('auto-design produced no table');
    const seg = designed.next.segments[0];
    const tilted = previewOp(designed.next, L.segmentSetTilt, { segmentId: seg.id, tiltDeg: 15 });
    if (!tilted.ok) throw new Error(tilted.refusal.reason);
    const s2 = tilted.next.segments.find((s) => s.id === seg.id)!;
    expect(s2.racking.kind !== 'flush' && s2.racking.tiltDeg).toBe(15);
    expect(tilted.impact.label).toBe('Tilt 15°');
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (modules missing).

- [ ] **Step 3: Implement the three op files**

Every op is `export const x = defineOp<Args>({ id, layer, label, validate?, apply })` followed by `registerOp(x)` at the bottom of the file (one `for (const op of [...]) registerOp(op)` loop). Move the bodies verbatim from `Step6Editor.tsx` — the code already exists at the line numbers listed under Files; the op file needs the same imports Step6Editor uses for each (`setSegmentTilt`, `reconcileBridgedPanels`, `applyStructChoice`, `respaceSegment`, `duplicateSegment`, `nextSegmentLabel`, `autoDesign`, `genId`, `STRUCTURE_PROFILES`, …). Example for the tilt op, showing the shape every other op follows:

```ts
export const segmentSetTilt = defineOp<{ segmentId: string; tiltDeg: number }>({
  id: 'segment.setTilt',
  layer: 'layout',
  label: (a) => `Tilt ${Math.round(a.tiltDeg)}°`,
  validate: (p, a) => (p.segments.some((s) => s.id === a.segmentId) ? null : { reason: 'Table not found' }),
  apply: (p, a) => {
    const spec = p.components.panel!;
    const seg = p.segments.find((s) => s.id === a.segmentId)!;
    const u = setSegmentTilt(spec, seg, p.panels, a.tiltDeg);
    const segments = p.segments.map((s) => (s.id === u.segment.id ? u.segment : s));
    const panels = reconcileBridgedPanels(p, { segments, panels: u.panels }) ?? u.panels;
    return { panels, segments };
  },
});
```

`lib/ops/index.ts`: `import './layout-ops'; import './electrical-ops'; import './site-ops'; export * from './types'; export * from './run'; export * from './metrics'; export * from './registry';`

- [ ] **Step 4: Switch Step 6 to ops**

In `Step6Editor.tsx`: `const ops = useOps();` next to `const patch = useProjectPatch();`. Each listed function becomes a thin wrapper, e.g.

```ts
  function applyTilt(t: number) {
    if (locked || !selectedSegment) return;
    report(ops.run(segmentSetTilt, { segmentId: selectedSegment.id, tiltDeg: t }));
  }
  /** one place decides what an op's outcome looks like to the user */
  function report(r: OpPreview) {
    if (!r.ok) return flash('info', r.refusal.reason);
    flash('ok', summarizeImpact(r.impact));
  }
```

`runAutoPlace` keeps opening the "Why" sheet after `ops.run(layoutAutoDesign, { objective })`. `doAutoString` → `ops.run(stringsResetToAuto, {})`. Erase cases, arrester/inverter/meter/walkway/rail placement, `commitRouteDrag`, `finishManualString` → their ops. `patch(...)` must no longer be called for design mutations in this file (grep `patch(` afterwards: the remaining calls may only be UI-state writes such as `wizardStep`, `insightState`, `designLog` display flags).

- [ ] **Step 5: Run tests + typecheck + live check, commit**

Browser: tilt a table from the table sheet — a toast reads e.g. "Tilt 15° · kWh +0.8% · ₹ +9,120 · steel +22 kg"; Undo (toolbar) reverts it and the header's undo tooltip names it.

```bash
git add src/features/solar-studio/lib/ops src/features/solar-studio/screens/Step6Editor.tsx src/features/solar-studio/lib/__tests__/ops-catalog.test.ts
git commit -m "refactor(step6): every layout, electrical and placement edit is a typed op with an impact toast

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Components are ops; a panel swap re-lays the tables and is undoable

**Files:**
- Create: `lib/ops/components-ops.ts`
- Modify: `screens/Step4Components.tsx:79-97` and the `setComponents` call sites (138, 166, 186, 218-219, 256-257, 270, 285); `lib/ops/index.ts` (import)
- Test: `lib/__tests__/ops-components.test.ts`

**Interfaces:**
- `componentsSet = defineOp<Partial<Components>>` with label `Panel: <brand model>` / `Inverter: <model> ×n` / `Capacity 82.1 kWp` (first changed key wins). When `panel` changes and segments exist, every segment is re-laid with the new module: elevated tables via `respaceSegment(project, roof, newSpec, seg, seg.racking.rowPitchM)`, flush tables via `respaceSegment(..., panelFootprintM(newSpec, seg.orientation).h + seg.moduleGapM)`; a table that no longer fits keeps its old modules and the op's patch adds a `designLog` entry `{ topic: 'Panel swap', choice: seg.label, reason: 'No room to re-lay with the new module — kept the previous layout; check for overlaps' }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/ops-components.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { PANEL_DB } from '../../data/panels';
import { previewOp } from '../ops/run';
import { componentsSet } from '../ops/components-ops';
import { layoutAutoDesign } from '../ops/layout-ops';
import { syncElectrical } from '../derive/electrical-sync';
import { isCaptureFresh, layoutFp } from '../fingerprints';

function designed(): Project {
  const p = { ...fixtureProject(12), strings: [], location: { address: 'x', latLng: { lat: 18.5, lng: 73.8 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' } };
  const d = previewOp(syncElectrical(p)!.next, layoutAutoDesign, { objective: 'max_roof' });
  if (!d.ok) throw new Error('no design');
  return d.next;
}

describe('componentsSet', () => {
  it('swapping to a module of a different size re-lays every table and re-keys the layout', () => {
    const p = designed();
    const current = p.components.panel!;
    const other = PANEL_DB.find((x) => x.id !== current.id && (x.lengthMm !== current.lengthMm || x.widthMm !== current.widthMm))!;
    const before = layoutFp(p);
    const r = previewOp(p, componentsSet, { panel: other });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.next.components.panel?.id).toBe(other.id);
    expect(layoutFp(r.next)).not.toBe(before);
    // no two modules overlap after the re-lay: every module is still inside its table's polygon count
    expect(r.next.panels.length).toBeGreaterThan(0);
    expect(r.impact.after.errors).toBe(0);
    expect(r.impact.label).toMatch(/^Panel: /);
  });
  it('a capture taken before the swap reads STALE afterwards', () => {
    const p = designed();
    const cap = { id: 'cap', label: 'x', dateIso: '2026-06-21', hour: 12, mode: 'shadow' as const, imageBlobId: 'b', forLayoutFp: layoutFp(p) };
    const withCap = { ...p, captures: [cap] };
    const other = PANEL_DB.find((x) => x.id !== p.components.panel!.id && x.lengthMm !== p.components.panel!.lengthMm)!;
    const r = previewOp(withCap, componentsSet, { panel: other });
    if (!r.ok) throw new Error('refused');
    expect(isCaptureFresh(r.next, cap)).toBe(false);
  });
  it('changing only the inverter count leaves the layout alone', () => {
    const p = designed();
    const r = previewOp(p, componentsSet, { inverterCount: 2 });
    if (!r.ok) throw new Error('refused');
    expect(r.next.panels).toEqual(p.panels);
    expect(r.impact.label).toMatch(/Inverter/);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement `lib/ops/components-ops.ts`**

```ts
import type { Components, DesignDecision, Project } from '../../types';
import { defineOp } from './types';
import { registerOp } from './registry';
import { respaceSegment } from '../segment-ops';
import { panelFootprintM } from '../layout';
import { genId } from '../geo';

/** The first changed key names the undo step. */
function labelFor(a: Partial<Components>): string {
  if (a.panel) return `Panel: ${a.panel.brand} ${a.panel.model}`;
  if (a.inverter) return `Inverter: ${a.inverter.model}`;
  if (a.inverterCount != null) return `Inverters ×${a.inverterCount}`;
  if (a.targetKwp != null) return `Capacity ${a.targetKwp} kWp`;
  if (a.inverterTopology) return `Topology: ${a.inverterTopology}`;
  if (a.mlpe) return `MLPE: ${a.mlpe}`;
  return 'Components';
}

export const componentsSet = defineOp<Partial<Components>>({
  id: 'components.set',
  layer: 'electrical',
  label: labelFor,
  apply: (p, a) => {
    const components: Components = { ...p.components, ...a };
    const patch: Partial<Project> = { components };
    const swapped = a.panel && a.panel.id !== p.components.panel?.id;
    if (!swapped || p.segments.length === 0) return patch;
    // A different module changes the lattice: re-lay every table with it so
    // nothing overlaps and layoutFp re-keys (captures go honestly stale).
    const spec = a.panel!;
    let panels = p.panels;
    const segments = [...p.segments];
    const log: DesignDecision[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const roof = p.roofs.find((r) => r.id === seg.roofId);
      if (!roof) continue;
      const pitch = seg.racking.kind !== 'flush' ? seg.racking.rowPitchM : panelFootprintM(spec, seg.orientation).h + seg.moduleGapM;
      const view: Project = { ...p, components, panels };
      const res = respaceSegment(view, roof, spec, seg, pitch);
      if (!res) {
        log.push({ id: genId('dd'), topic: 'Panel swap', choice: seg.label, reason: 'No room to re-lay with the new module — kept the previous layout; check for overlaps', inputs: [spec.model] });
        continue;
      }
      segments[i] = res.segment;
      panels = [...panels.filter((m) => m.segmentId !== seg.id), ...res.panels];
    }
    patch.panels = panels;
    patch.segments = segments;
    if (log.length) patch.designLog = [...(p.designLog ?? []), ...log];
    return patch;
  },
});
registerOp(componentsSet);
```

Add `import './components-ops';` to `lib/ops/index.ts`.

- [ ] **Step 4: Step 4 uses the op**

```ts
  const ops = useOps();
  function setComponents(p: Partial<typeof c>, o: { undoable?: boolean } = {}) {
    const r = ops.run(componentsSet, p, o);
    if (!r.ok) setToast?.(r.refusal.reason);
  }
```

Panel/inverter/count/topology/mlpe selections stay undoable (default). The typed `targetKwp` field (line 166) passes `{ undoable: false }` so a keystroke is not an undo step; the "Auto"/"apply suggestion" buttons (186, 218) stay undoable. `applyRow` (84-97) → `ops.run(componentsSet, { panel: row.panel, inverter: row.inverter, inverterCount: row.inverterCount })`.

- [ ] **Step 5: Run tests + typecheck + live check, commit**

Browser: on the test project, swap the panel in Step 4, go to Step 6 — no overlapping modules; Undo restores the old panel and layout.

```bash
git add src/features/solar-studio/lib/ops src/features/solar-studio/screens/Step4Components.tsx src/features/solar-studio/lib/__tests__/ops-components.test.ts
git commit -m "feat(ops): component changes are undoable ops; a panel swap re-lays the tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Undo on every step; the plan-limit banner goes (D38)

**Files:**
- Modify: `screens/Wizard.tsx:222-300` (header), keyboard handler in `Wizard`
- Modify: `screens/Step6Editor.tsx:140,363,1115` (delete `PLAN_LIMIT_KW`, `overLimit`, the banner), `data/rules/india.ts:118,529` (delete `planLimitKw`), `lib/__tests__/rules.test.ts` (drop its assertion)
- Test: `screens/__tests__/wizard-undo.test.tsx` (jsdom) — or extend an existing Wizard test if one exists (check `screens/__tests__/`)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// screens/__tests__/wizard-undo.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WizardUndoControls } from '../Wizard';

describe('WizardUndoControls', () => {
  it('exposes Undo/Redo with the last labels and disabled states', () => {
    render(<WizardUndoControls undoLabels={['Tilt 15°']} redoLabels={[]} onUndo={() => {}} onRedo={() => {}} />);
    const undo = screen.getByRole('button', { name: /undo/i }) as HTMLButtonElement;
    const redo = screen.getByRole('button', { name: /redo/i }) as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    expect(undo.getAttribute('aria-label')).toMatch(/Tilt 15°/);
    expect(redo.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (no export).

- [ ] **Step 3: Implement**

In `Wizard.tsx` export a small presentational component and mount it in the header before the health chip:

```tsx
export function WizardUndoControls({ undoLabels, redoLabels, onUndo, onRedo }: { undoLabels: string[]; redoLabels: string[]; onUndo: () => void; onRedo: () => void }) {
  const u = undoLabels[undoLabels.length - 1];
  const r = redoLabels[redoLabels.length - 1];
  return (
    <>
      <button className="btn-ghost" aria-label={u ? `Undo: ${u}` : 'Undo'} data-tip={u ? `Undo ${u}` : 'Nothing to undo'} data-tip-left="" disabled={!u} onClick={onUndo}>
        <Undo2 size={16} />
      </button>
      <button className="btn-ghost" aria-label={r ? `Redo: ${r}` : 'Redo'} data-tip={r ? `Redo ${r}` : 'Nothing to redo'} data-tip-left="" disabled={!r} onClick={onRedo}>
        <Redo2 size={16} />
      </button>
    </>
  );
}
```

In `Wizard`: `const { state, dispatch } = useStore();` and `<WizardUndoControls undoLabels={state.undoLabels} redoLabels={state.redoLabels} onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })} />`. Add a `useEffect` keydown listener for Cmd/Ctrl+Z (+Shift = redo) that is skipped when `step === 2 || step === 6` (those screens already handle it), when the target is an input/textarea/select/contenteditable, or when a dialog is open (`document.querySelector('[role="dialog"]')`).

Delete the plan limit: `Step6Editor.tsx:140` (`PLAN_LIMIT_KW`), `:363` (`overLimit`), the banner block at `:1113-1120` and its `Upgrade` button; `data/rules/india.ts` `planLimitKw` field (118) and value (529); the matching expectation in `lib/__tests__/rules.test.ts`.

- [ ] **Step 4: Run tests + typecheck + live check, commit**

Browser: on Step 3 and Step 9, make a change, press the header Undo — it reverts and the tooltip names the change. The "plan limit" banner is gone at 82 kWp.

```bash
git add src/features/solar-studio/screens/Wizard.tsx src/features/solar-studio/screens/Step6Editor.tsx src/features/solar-studio/data/rules/india.ts src/features/solar-studio/lib/__tests__/rules.test.ts src/features/solar-studio/screens/__tests__/wizard-undo.test.tsx
git commit -m "feat(wizard): undo/redo with labels on every step; remove the plan-limit gate (D38)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Scene = engine for arresters; a fixed sample year (defects #12, #16)

**Files:**
- Modify: `lib/scene-model.ts:198-296` (add arrester casters), `lib/shading.ts:72-80` (`SAMPLE_YEAR`), `lib/solar-heatmap.ts:141` region (same constant), `lib/fingerprints.ts:244` (`SHADING_ENGINE_VERSION = 7`), `three/Scene3D.tsx:1380,1414,1440` (rails and inverters stop casting; arresters keep casting)
- Test: `lib/__tests__/scene-engine-parity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/scene-engine-parity.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { buildShadowCasters } from '../scene-model';
import { buildSunSamples } from '../shading';
import { SHADING_ENGINE_VERSION } from '../fingerprints';

describe('defect #12 — arresters cast in the engine', () => {
  it('an arrester becomes a caster with its own identity', () => {
    const p: Project = { ...fixtureProject(4), arresters: [{ id: 'la_1', roofId: 'roof_1', pos: { x: 0, y: 0 }, heightMm: 2000 }] };
    const { meshes } = buildShadowCasters(p);
    const la = meshes.find((m) => m.userData.casterKind === 'arrester');
    expect(la).toBeTruthy();
    expect(la!.userData.casterId).toBe('la_1');
  });
});

describe('defect #16 — sun samples do not depend on the wall clock', () => {
  afterEach(() => vi.useRealTimers());
  it('produces identical samples in two different years', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    const a = buildSunSamples(18.5, 73.8).map((s) => [s.dir.x, s.dir.y, s.dir.z, s.weight]);
    vi.setSystemTime(new Date('2031-01-15T00:00:00Z'));
    const b = buildSunSamples(18.5, 73.8).map((s) => [s.dir.x, s.dir.y, s.dir.z, s.weight]);
    expect(b).toEqual(a);
  });
  it('the engine version was bumped for this change', () => {
    expect(SHADING_ENGINE_VERSION).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`lib/shading.ts`: replace `const y = new Date().getFullYear();` with a module constant and comment:

```ts
/**
 * Fixed reference year for the sun quadrature. The sun's path repeats to
 * within arc-minutes year over year, so any year gives the same access — but
 * a WALL-CLOCK year made stamped-fresh solar access silently change across a
 * New Year boundary (defect #16). Shared with the heatmap sampler.
 */
export const SAMPLE_YEAR = 2025;
```

and `const y = SAMPLE_YEAR;`. In `lib/solar-heatmap.ts`, import `SAMPLE_YEAR` from `./shading` and use it wherever `buildMonthlySamples` takes the year (read lines 130-170 first; if it derives the year from a `Date` argument, keep the argument but default it to `SAMPLE_YEAR`).

`lib/scene-model.ts` `buildShadowCasters`: after the obstruction loop add:

```ts
  // Lightning arresters are real masts on the roof: the scene has always cast
  // their shadow, the engine never did (defect #12). A 50 mm square section at
  // the mast height, grounded on the surface, keeps scrub and numbers agreeing.
  for (const la of project.arresters ?? []) {
    const roof = project.roofs.find((r) => r.id === la.roofId);
    if (!roof) continue;
    const baseY = surfaceHeightAt(roof, la.pos, eaveRefs.get(roof.id));
    const h = la.heightMm / 1000;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), mat);
    mesh.position.set(la.pos.x, baseY + h / 2, -la.pos.y);
    mesh.userData = { casterKind: 'arrester', casterId: la.id, casterLabel: 'Lightning arrester' };
    group.add(mesh);
    meshes.push(mesh);
  }
```

(`surfaceHeightAt` is already imported in this file; confirm the signature at `lib/roof-plane.ts`.)

`lib/fingerprints.ts:244`: `export const SHADING_ENGINE_VERSION = 7;` with a `//   v7: fixed sample year (defect #16); lightning arresters cast (defect #12).` line in the version log above it.

`three/Scene3D.tsx`: at the rail (~1380) and inverter (~1440) meshes set `castShadow={false}` (they carry `shadowCaster:false` and the engine does not cast from them); the arrester mesh (~1414) keeps `castShadow` and its `userData.shadowCaster` becomes `true`.

- [ ] **Step 4: Run tests + typecheck, commit**

The `SHADING_ENGINE_VERSION` bump re-keys every stored `solarAccessFp`; that is intended (the engine changed). Update any test that pinned the version literal.

```bash
git add src/features/solar-studio/lib/scene-model.ts src/features/solar-studio/lib/shading.ts src/features/solar-studio/lib/solar-heatmap.ts src/features/solar-studio/lib/fingerprints.ts src/features/solar-studio/three/Scene3D.tsx src/features/solar-studio/lib/__tests__/scene-engine-parity.test.ts
git commit -m "fix(shading): arresters cast in the engine; fixed sample year; engine v7 (defects #12, #16)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: A real Step 5 — Auto-design (defect #17)

**Files:**
- Create: `screens/Step5AutoDesign.tsx`
- Modify: `screens/Wizard.tsx:21-32` (name), `:182-195` (`onNext`/`onBack`), `:205-206` (render), `nextBlocker` (no blocker for 5); `screens/Step6Editor.tsx:298-304` (remove the mount-time auto-place prompt); `screens/Dashboard.tsx` open-project navigation is unchanged (`wizardStep` still 1..10)
- Test: `screens/__tests__/step5.test.tsx` (jsdom)

The screen (wrapped in `<div className="ds">`, Tailwind token utilities, no inline styles — read `docs/DESIGN-SYSTEM.md` §4 and `src/design/tokens.css` for the available classes):

- Title "Auto-design", one sentence: "The engine ranks your roof faces by measured sun access × orientation and fills them, honouring setbacks, obstructions, walkways and shadow-free row spacing."
- Objective chips: "Match target (82.1 kWp)" / "Maximum the roof holds".
- Primary button "Design it" (`bg-accent text-on-accent`) → `ops.run(layoutAutoDesign, { objective })`; secondary "Place manually" → navigates to step 6 without designing.
- After a run (or when `project.designLog?.length`): the decision list (`topic / choice / reason`) and the impact toast text from the op; a "Re-run" ghost button.
- The wizard's Next goes to 6.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// screens/__tests__/step5.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Step5Body } from '../Step5AutoDesign';
import { fixtureProject } from '../../lib/__tests__/fixtures/project';

describe('Step5Body', () => {
  it('offers the two objectives and the two exits', () => {
    render(<Step5Body project={fixtureProject(0)} onDesign={() => {}} onManual={() => {}} lastImpact={null} />);
    expect(screen.queryByRole('button', { name: /design it/i })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /place manually/i })).not.toBeNull();
    expect(screen.queryByRole('radio', { name: /match target/i })).not.toBeNull();
    expect(screen.queryByRole('radio', { name: /maximum/i })).not.toBeNull();
  });
  it('shows the decision log when the project has one', () => {
    const p = { ...fixtureProject(4), designLog: [{ id: 'd1', topic: 'Roof priority', choice: 'Roof 1', reason: 'best yield', inputs: [] }] };
    render(<Step5Body project={p} onDesign={() => {}} onManual={() => {}} lastImpact={null} />);
    expect(screen.queryByText(/Roof priority/)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

`Step5AutoDesign.tsx` exports `Step5Body` (pure presentational: `{ project, onDesign(objective), onManual(), lastImpact: OpImpact | null }`) and the default `Step5AutoDesign` that wires it to `useActiveProject`, `useOps`, and `navigate('/wizard/6')`. Use a `role="radiogroup"` for the objective chips with arrow-key navigation (DESIGN-SYSTEM §9 roving tabindex) and `aria-checked`.

Wizard: `STEP_NAMES[4] = 'Auto Design'`; `case 5: body = <Step5AutoDesign />; break; case 6: body = <Step6Editor />; break;`; `onNext`: `go(step + 1)`; `onBack`: `go(step - 1)`; `nextBlocker` case 5 returns `null`. Step6Editor: delete the mount effect at 298-304 (Step 5 owns the prompt) — keep `confirmPlace` reachable from the toolbar's existing "Auto-fill" action.

- [ ] **Step 4: Run tests + typecheck + live check, commit**

Browser: Step 4 → Next lands on "Step 5 of 10 · Auto Design"; "Design it" fills the roof and shows the log; Next → Step 6 with the layout; Back returns to 5, then 4.

```bash
git add src/features/solar-studio/screens/Step5AutoDesign.tsx src/features/solar-studio/screens/Wizard.tsx src/features/solar-studio/screens/Step6Editor.tsx src/features/solar-studio/screens/__tests__/step5.test.tsx
git commit -m "feat(wizard): a real Step 5 — auto-design with its decision log (defect #17)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: The propagation matrix — the acceptance gate

**Files:**
- Test: `lib/__tests__/propagation.test.ts`
- Modify: `docs/superpowers/specs/2026-09-02-studio-next-design.md` §6 Phase 1 "Done when" — tick it with the date once green

This file is the spec's promise made executable: one row per edit from the census table, asserting what recomputes, what is flagged, and that nothing is silently wrong.

- [ ] **Step 1: Write the tests**

```ts
// lib/__tests__/propagation.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';
import { PANEL_DB } from '../../data/panels';
import '../ops';
import { previewOp } from '../ops/run';
import { componentsSet } from '../ops/components-ops';
import { inverterPlace, inverterRemove, stringsAddManual } from '../ops/electrical-ops';
import { layoutAutoDesign, panelsRotate, panelsSetEnabled, segmentSetTilt } from '../ops/layout-ops';
import { syncElectrical } from '../derive/electrical-sync';
import { designFreshness } from '../derive/freshness';
import { deriveBomResult } from '../derive/outputs';
import { isCaptureFresh, layoutFp, shadingFp } from '../fingerprints';
import { inverterWorldPos } from '../routing';
import { groupPanels } from '../electrical/grouping';

function designed(): Project {
  const base: Project = {
    ...fixtureProject(24),
    strings: [],
    location: { address: 'x', latLng: { lat: 18.5, lng: 73.8 }, confirmed: true, irradiance: 5.4, peakSunHours: 5.4, dataSource: 'estimate' },
    inverterPlacements: [{ id: 'invp_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }],
  };
  const d = previewOp(syncElectrical(base)!.next, layoutAutoDesign, { objective: 'max_roof' });
  if (!d.ok) throw new Error('no design');
  // pretend shading has settled so freshness.all can be true
  const p = d.next;
  return { ...p, derived: { ...p.derived, solarAccessFp: shadingFp(p) } };
}

const dcMetres = (p: Project) => deriveBomResult(p).lines.find((l) => l.id === 'elec.dc_cable')?.qty ?? 0;

describe('propagation matrix', () => {
  it('baseline: a designed project is fresh on every layer', () => {
    const p = designed();
    expect(designFreshness(p)).toMatchObject({ strings: true, routes: true, shading: true, all: true });
  });

  it('(a) disable modules → strings, routes, BOM cable, kWp all move; nothing stays stale', () => {
    const p = designed();
    const ids = p.panels.slice(0, 3).map((m) => m.id);
    const r = previewOp(p, panelsSetEnabled, { ids, enabled: false });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.impact.delta.modules).toBe(-3);
    expect(r.next.strings.some((s) => s.panelIds.some((id) => ids.includes(id)))).toBe(false);
    expect(r.impact.after.freshness.strings && r.impact.after.freshness.routes).toBe(true);
    // shading legitimately goes provisional (enabled ∈ shadingFp) and the money says so
    expect(r.impact.after.freshness.shading).toBe(false);
    expect(r.impact.after.freshness.all).toBe(false);
  });

  it('(b) tilt → structures/steel and strings re-derive; routes stay attached', () => {
    const p = designed();
    const seg = p.segments[0];
    const r = previewOp(p, segmentSetTilt, { segmentId: seg.id, tiltDeg: 20 });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(r.impact.delta.steelKg).not.toBe(0);
    expect(r.impact.after.freshness.strings).toBe(true);
    expect(r.impact.after.freshness.routes).toBe(true);
  });

  it('(d) move the inverter → routes re-derive to the new wall and BOM cable metres change with no button', () => {
    const p = designed();
    const before = dcMetres(p);
    const removed = previewOp(p, inverterRemove, { id: 'invp_1' });
    if (!removed.ok) throw new Error('x');
    const moved = previewOp(removed.next, inverterPlace, { roofId: 'roof_1', edgeIndex: 2, t: 0.5, heightM: 1.5 });
    if (!moved.ok) throw new Error('x');
    const target = inverterWorldPos(moved.next, 0)!;
    for (const route of moved.next.cableRoutes!.filter((c) => c.kind === 'string_homerun')) {
      const end = route.waypoints[route.waypoints.length - 1];
      expect(end.x).toBeCloseTo(target.x, 6);
      expect(end.y).toBeCloseTo(target.y, 6);
    }
    expect(dcMetres(moved.next)).not.toBe(before);
    expect(moved.impact.after.freshness.routes).toBe(true);
  });

  it('(f) panel swap → layout re-keys, captures stale, strings re-derive, and it is one undoable op', () => {
    const p = designed();
    const cap = { id: 'c', label: 'x', dateIso: '2026-06-21', hour: 12, mode: 'shadow' as const, imageBlobId: 'b', forLayoutFp: layoutFp(p) };
    const other = PANEL_DB.find((x) => x.id !== p.components.panel!.id && x.lengthMm !== p.components.panel!.lengthMm)!;
    const r = previewOp({ ...p, captures: [cap] }, componentsSet, { panel: other });
    if (!r.ok) throw new Error(r.refusal.reason);
    expect(isCaptureFresh(r.next, cap)).toBe(false);
    expect(r.impact.after.freshness.strings).toBe(true);
    expect(r.impact.after.errors).toBe(0);
  });

  it('(g) rotating loose modules re-groups their strings (azimuth invariant holds)', () => {
    const base = designed();
    const loose = { ...base, panels: base.panels.map((m) => ({ ...m, segmentId: undefined })), segments: [] };
    const fresh = syncElectrical({ ...loose, derived: { ...loose.derived, stringsFp: null } })!.next;
    const ids = fresh.panels.slice(0, 4).map((m) => m.id);
    const r = previewOp(fresh, panelsRotate, { ids, deltaDeg: 90 });
    if (!r.ok) throw new Error(r.refusal.reason);
    for (const s of r.next.strings) {
      const az = new Set(s.panelIds.map((id) => r.next.panels.find((m) => m.id === id)!.azimuthDeg));
      expect(az.size).toBe(1);
    }
    expect(groupPanels(r.next).length).toBeGreaterThan(1);
  });

  it('(h) a manual string survives every other edit and is never silently dropped', () => {
    const p = designed();
    const manual = previewOp(p, stringsAddManual, { panelIds: p.strings[0].panelIds.slice(0, 5) });
    if (!manual.ok) throw new Error('x');
    const id = manual.next.strings.find((s) => s.manual)!.id;
    const tilt = previewOp(manual.next, segmentSetTilt, { segmentId: manual.next.segments[0].id, tiltDeg: 12 });
    if (!tilt.ok) throw new Error('x');
    expect(tilt.next.strings.find((s) => s.id === id)?.manual).toBe(true);
    const victim = manual.next.strings.find((s) => s.manual)!.panelIds[0];
    const disabled = previewOp(tilt.next, panelsSetEnabled, { ids: [victim], enabled: false });
    if (!disabled.ok) throw new Error('x');
    const kept = disabled.next.strings.find((s) => s.id === id)!;
    expect(kept.panelIds).not.toContain(victim);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/propagation.test.ts`
Expected: PASS. Any failing row is a real defect in an earlier task — fix the task, not the assertion.

- [ ] **Step 3: Full gates + live acceptance**

Run: `npx vitest run && npx tsc --noEmit`. Then in the browser on the test project: (1) move the inverter to another wall in Step 6 and open Step 9 — the DC cable metres differ, with no button pressed; (2) the proposal shows "Provisional" until the shading recompute finishes, then clears; (3) print preview shows PROVISIONAL when stale; (4) Undo works from Step 3, 4 and 9.

- [ ] **Step 4: Commit and tick the spec**

Edit the spec's Phase 1 "Done when" line to `**Done — 2026-MM-DD:** …` with the observations.

```bash
git add src/features/solar-studio/lib/__tests__/propagation.test.ts docs/superpowers/specs/2026-09-02-studio-next-design.md
git commit -m "test(derive): the propagation matrix — every edit's consequence is asserted

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes (already applied)

- Spec coverage: §5.1 DesignOps (Tasks 8–10), derivation graph (Task 6), derived-with-override strings/routes (Tasks 1–5), staleness closure incl. print (Task 7), panel swap (Task 10), undo everywhere (Task 11), defects #2 (T3), #3 (T4), #12/#16 (T12), #17 (T13), propagation test file (T14), D38 banner (T11). Phase 1 does not extract Step 2/3 roof and obstruction mutations into ops — that arrives with the 3D gizmos in Phase 3 (spec §6).
- Type consistency: `syncElectrical` returns `{ patch, next, report }` everywhere; `previewOp` returns the `OpPreview` union everywhere; `designFreshness` is the only freshness entry point the UI reads; `deriveStructures` lives in its own module to keep `bom/context.ts` cycle-free.
- Known limitation, recorded: multi-tab LWW treats a derived strings/routes write like any content write (as it already does for `solarAccess` values) — the other tab's undo history drops when it adopts it.
