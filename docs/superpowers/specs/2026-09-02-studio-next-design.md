# Studio Next — the 3D Design Studio as the source of truth

**Date:** 2026-09-02
**Status:** proposed design, awaiting owner approval (no code written yet)
**Scope:** the design studio (`src/features/solar-studio/`), this repo, branch off `main`
**Outranked by:** `docs/STUDIO-MASTER-PLAN.md` (capability audit), `docs/DESIGN-SYSTEM.md` (UI), `CLAUDE.md`
**Complements:** the master plan's release trains R1–R9. This spec is the *studio spine* those
trains need: it says how the 3D workspace, the design model and the AI loop fit together.
It does not repeat the master plan's 310 capability items.

---

## 0 · Plain summary

The studio today is a 10-step 2D wizard with a 3D **viewer** bolted on. The viewer replaces the
editor when opened, shares nothing with it, lets you click two kinds of object, and cannot move
anything. The engineering model underneath is genuinely good — one `Project`, provenance on
every number, a BOM that derives from geometry — but two of its links are broken: **strings and
cable routes are frozen snapshots** that never re-derive and never say they are stale.

The target is one **workspace** where the 3D scene is the primary surface, every object is
selectable and movable, every gesture is a typed **design operation** whose engineering
consequences (kWp, strings, cable metres, steel kg, ₹, kWh) are computed *before* it is applied,
and the AI proposes those same operations with the same impact report. Engineering outputs
(BOM, SLD, schedules) keep deriving from the one model, which is now never silently stale.

Build order: **truth first, then beauty.** Fix the model's propagation holes and add the
operation layer (Phase 1), make the 3D scene a persistent shared workspace (Phase 2), add
direct manipulation (Phase 3), then fidelity, electrical-in-3D, the AI loop, simulation port,
outputs and scale (Phases 4–8). Each phase ships.

---

## 1 · Evidence base

- `docs/STUDIO-MASTER-PLAN.md` (2026-09-01, 310 findings) and `docs/studio-gap-analysis.md`.
- Four independent code censuses run 2026-09-02 (3D render/interaction; propagation chain;
  AI substrate + flow; simulation/BOM/electrical/structure interfaces). Every claim below cites
  a file and line from those reads, re-verified by grep where central.
- Baseline: `npx tsc --noEmit` clean; `npx vitest run` → **122 files, 1714 tests, all green**.
- Live walk-through on the dev server (Step 1 → 6 → 3D) on a 24 × 22 m shed, 152 modules,
  82.1 kWp, auto-filled; 3D at 60 fps, dpr 1.
- Branch state: `site-frame` is 10 commits ahead of `main` with a reviewed fix wave (F1–F10 in
  `.superpowers/sdd/2026-09-01-site-frame/review-findings.md`) **not yet applied**.
  `docs/STUDIO-MASTER-PLAN.md` is untracked.

---

## 2 · What is strong — keep, never rebuild

| Asset | Where | Why it matters |
|---|---|---|
| One canonical `Project` | `types.ts:922` | Store, editors, scene, SLD, drawings, BOM all read one shape |
| Fingerprint layers `siteFp ⊂ geometryFp ⊂ layoutFp ⊂ electricalFp ⊂ designFp` + `shadingFp` | `lib/fingerprints.ts:7,260` | Staleness is a comparison, not a subsystem |
| Provenance tiers on lines and numbers | `types.ts:743`, `BomLine.confidence` | The commercial honesty nobody else has |
| BOM engine: stable `LineKey`, per-field overrides with `autoAtEdit`, orphan handling, `bomMoney` | `lib/bom/*` | Diff, override survival, revision control fall out of it |
| Electrical sizing shared by SLD and BOM | `lib/electrical-sizing.ts`, `lib/sld.ts:62` | Sheet and bill cannot disagree |
| Structure member/node graph with deterministic ids and real steel mass | `lib/structure.ts:389,807` | Drawings, BOM and site name the same piece |
| One-frame gate | `lib/__tests__/one-frame.test.ts`, `lib/scene-frame.ts` | Plan geometry of scene and model is locked by test |
| Auto-design with a decision log | `lib/auto-design.ts:121`, `Step6Editor.tsx:412` | "Why this layout?" already explains itself |
| Insight registry (8 analyzers, memoised on `designFp`) | `lib/insights/registry.ts:37,77` | The seed of the AI loop |
| Persistence v2, quarantine, multi-tab LWW, undo stack of 25 | `lib/persistence/*`, `store/store.tsx:206` | Recovery is real |
| Shading worker with supersede + inline fallback | `workers/analysis.worker.ts`, `lib/analysis-client.ts:59` | Off-thread already |
| Exact ENU site frame (new) | `lib/site/frame.ts` | The ruler is now right |
| Instanced module rendering | `three/PanelsInstanced.tsx:99` | 3 draw calls for any module count |

---

## 3 · Gaps the master plan does not cover — the reimagining brief

The master plan audits *capabilities* (physics, BOM register, MMS families, documents). The
mission asks for an *experience*: one 3D workspace that is the source of truth, direct
manipulation, and an AI that proposes grounded changes. These are the gaps between the two.

### G1 · 3D is a modal viewer, not a workspace
- `Step6Editor.tsx:1101` — `if (show3D) return <Scene3D/>` unmounts the whole 2D editor; GL
  context, GLBs and satellite texture are rebuilt on every toggle.
- Selection, tool, hover, marquee: none cross the boundary. `Scene3D.tsx:145-150` keeps its
  own `structEdit`/`structView`.
- Step 2 and Step 3 each mount their own separate `Scene3D` (`Step2Roof.tsx:1078`,
  `Step3Obstructions.tsx:286`).

### G2 · Almost nothing in 3D is pickable, and selection is invisible
- Pickable: module instances (`PanelsInstanced.tsx:159`) and structure members
  (`StructureInstanced.tsx:163`, and Scene3D discards the member id at `:1306`).
- Not pickable: roofs, obstructions (`ObstructionMesh.tsx` has zero handlers), foundations,
  walkways, rails, arresters, inverters, neighbours, ground. Strings and cables have **no 3D
  geometry at all**.
- No outline, no emissive, no hover. `highlightIds` exists on both instanced components but
  Scene3D never passes it — the amber highlight path is dead code.

### G3 · No direct manipulation in 3D
- No gizmos, no drag, no rotate, no tilt handles. Edits go through a DOM card
  (`StructEditPanel.tsx:209`) with ±5° / ±0.3 m steppers.
- The only true drag is `LegPlanEditor.tsx`, a 2D SVG inside `<Html>`.
- Hover preview was removed because "every hover rebuilt the full scene"
  (`Scene3D.tsx:137-141`) — a symptom of G5, not a UX decision to keep.

### G4 · The propagation chain has silent holes (this breaks "accuracy first")
- `strings[]` and `cableRoutes[]` are **persisted derived state with no recompute trigger and
  no stale flag** (`Step6Editor.tsx:929-933` is the only route writer). Move an inverter →
  routes still point at the old wall, and `dcCableFromRoutes` keeps reporting `routed: true`
  (`routing.ts:518`) so the BOM prints a measured-sounding formula over wrong lengths.
- Panel model swap (`Step4Components.tsx:79`) is **not undoable**, does not re-key `layoutFp`
  (`fingerprints.ts:139` puts the panel id in `electricalFp` only), so captures read fresh while
  modules have changed size, and the layout is never re-solved (overlaps possible).
- Rotating loose panels (`Step6Editor.tsx:446`) keeps strings whose azimuth group no longer
  matches (`grouping.ts:245`).
- "Money never renders while stale" is **not implemented**: `ProposalView.tsx:80-83` puts the
  warning in `className="no-print"`, so the printed PDF carries the money without it;
  `Step9Bom/index.tsx:66-71` calls no freshness function; `Dashboard.tsx:267` shows energy per
  card unfingerprinted.
- `projectStructures` (`structure.ts:974`) has no memoisation and is called from six places per
  render; `computeEnergyReport` is recomputed at ten call sites on every render.
- DRC (`drc.ts:87`), autostring (`autostring.ts:114`) and grouping (`grouping.ts:246`) read
  `solarAccess` without `isShadingFresh` — a provisional `1.0` reads as "clear".
- Master plan §10 defects #2, #3, #12, #16 are the same family (double string, home-run to
  inverter `[0]`, arrester shadows on screen only, no year term in the shading fingerprint).

### G5 · Rendering does redundant work every frame
- `panelParts` (`Scene3D.tsx:1107`) is rebuilt on every render → new array identity →
  `PanelsInstanced.tsx:99` reallocates and disposes every `InstancedMesh` on every render,
  including the hour-slider tick and the async `solarAccess` write-back.
- No `frameloop="demand"`, no `dpr` cap (`Scene3D.tsx:432-441`); `preserveDrawingBuffer` always
  on for a once-per-session capture.
- `rackingBySeg` (`Scene3D.tsx:1058`) computed per render and never used.
- Sun animation is a `setInterval(60ms)` re-rendering the React tree (`Scene3D.tsx:256`), not a
  `useFrame` tick.
- Shading engine: 288 sun samples × 3 points/module, brute-force `Raycaster` against every
  caster with no BVH (`shading.ts:206`) — O(N²), ~43 M ray-mesh pairs at 500 modules.
- Walkways, rails, arresters, inverters: one un-instanced mesh each (`Scene3D.tsx:1354-1456`).
- 177 MB of uncompressed GLBs, no Draco/meshopt/KTX2, per-instance `Box3.setFromObject`
  (`ObstructionMesh.tsx:107`); the windmill asset is missing.
- One 2048² shadow map over a fixed ±60 m box (`Scene3D.tsx:1244-1251`): sites wider than
  120 m silently lose shadows.

### G6 · No AI loop — insights are inert text
- One Gemini endpoint, vision only (`src/app/api/gemini/route.ts:88`), one caller
  (`gemini-client.ts:165`).
- `Insight.action` is label-only (`lib/insights/types.ts:43`) and **nothing in the UI reads it**;
  `focusIds` is never wired to a click. Insights render as title + detail in the "Why this
  layout?" sheet (`Step6Editor.tsx:1923-1935`).
- The closest thing to "propose → review → apply" is the Step 2 ghost review
  (`Step2Roof.tsx:165,229`) — good pattern, no impact numbers, not generic.
- There is no substrate by which a proposal (from AI *or* from a gizmo) is expressed as a
  typed change with a computed impact.

### G7 · Camera and navigation
- Presets snap without tween (`Scene3D.tsx:316`); no fit-to-design or fit-to-selection; a
  300 m site opens off-screen; keyboard zoom clamps `[4, 320]` contradict mouse `[8, 170]`
  (`Scene3D.tsx:350` vs `:471`); `minDistance 8` blocks inspecting one module.
- Touch: OrbitControls defaults only; no `touch-action`, no long-press, no big targets —
  `DESIGN-SYSTEM.md §7` is unmet on the 3D surface. Console shows repeated
  "Unable to preventDefault inside passive event listener" from the wheel/touch handlers.

### G8 · Scene ≠ engine (the product's core honesty claim)
- Engine casters (`scene-model.ts:214-292`): roofs, parapets, capability-filtered obstructions,
  opt-in panel slabs. Scene additionally casts from structure members and foundations, and
  rails/arresters/inverters set `castShadow` while carrying `shadowCaster:false`
  (`Scene3D.tsx:1380,1414,1440`). Neighbours are fabricated boxes and cast nothing in the engine.
- Two sun quadratures (`shading.ts:72` and `solar-heatmap.ts:141`) are kept in sync by comment.

### G9 · Visual fidelity
- No environment lighting: `MeshPhysicalMaterial` clearcoat with nothing to reflect
  (`textures.ts:65-71`); no post-processing; modules read as flat plastic (confirmed live).
- Roof coverings all draw as one grey material; a module is a scaled box with a canvas grid.

### G10 · Workflow friction seen live
- Ten linear steps, hard electrical gate, phantom step 5 (`Wizard.tsx:205`), 3D reachable only
  from a floating pill.
- Undo is exposed on 2 of 10 steps (`Step6Editor.tsx:1567`, `Step2Roof.tsx:1511`).
- A "10 kW plan limit" banner still ships although D38 removed subscription restrictions.
- Copilot suggestions had no buttons; the Google Solar cross-check said "max 3 panels" for a
  526 m² shed (wrong source of truth surfaced as if it mattered).

---

## 4 · The target experience

An engineer's loop, all on one screen:

```
UNDERSTAND   open the site: real imagery, terrain, neighbours, sun; health score visible
DESIGN       auto-design lands a ranked, strung, routed, priced design in seconds
INTERACT     click anything: module, table, string, roof, obstruction, inverter, cable, foundation
MODIFY       drag / rotate / tilt / respace / toggle / draw — with live numbers on the object
SIMULATE     sun scrub, shade study, energy per module/string, loss chain, traceable
VALIDATE     DRC + electrical gate + health, each issue focusable in 3D
OPTIMIZE     "fit 20 more", "reduce shading", "15° tilt" — proposals with impact, one-tap apply
GENERATE     BOM/BOS, SLD, schedules, drawings — all from the model, never stale
```

Principles (binding, from the owner's standing directives and the design system):

1. **The 3D scene is the primary surface; the 2D plan is a camera, not a second editor.**
2. **On-object controls, select-then-act, click applies instantly as one undoable patch.**
   No hover-apply (owner decision 2026-07-16). Static previews and active states only.
3. **Every change is a typed operation with a computed impact, before it is applied.**
   The UI, the gizmos and the AI all go through the same operations.
4. **Nothing derived is ever silently stale.** Derived-or-stale is visible on the object and on
   every money and energy figure, including print.
5. **If it casts a shadow on screen it casts one in the engine, and vice versa.**
6. **Touch parity per `DESIGN-SYSTEM.md §7`**; every 3D function reachable without a wheel,
   a modifier key or a middle button.
7. **Accuracy before visuals.** No fidelity work lands before the model is consistent.

---

## 5 · Target architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ WORKSPACE SHELL   one persistent canvas (3D · plan-ortho) · inspector     │
│                   · sun timeline · command bar (AI) · health/status       │
├──────────────────────────────────────────────────────────────────────────┤
│ INTERACTION KERNEL  SceneIndex (entity id ↔ instance/mesh) · Picker (BVH) │
│                     · Selection/Hover store · Gizmos + Snap · On-object   │
│                     controls · Camera director (fit, tween, presets)      │
├──────────────────────────────────────────────────────────────────────────┤
│ DESIGN KERNEL   Project (truth) · DesignOps (typed, pure, undoable, with  │
│                 impact) · Derivation graph (memoised selectors keyed on   │
│                 fingerprint layers; derived-or-stale for persisted views) │
├──────────────────────────────────────────────────────────────────────────┤
│ ENGINES (ports)  Shading · Energy (built-in | PVsyst adapter) · Stringing │
│                  · Routing · Structure · BOM · Drawings · AI planner      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Design kernel

**DesignOps** — `lib/ops/`. One registry of named operations. Each op is a pure function:

```ts
interface DesignOp<A> {
  id: string;                                   // 'segment.setTilt', 'module.toggle', 'inverter.move' …
  label: (args: A) => string;                   // human sentence for undo history and AI cards
  validate: (p: Project, args: A) => OpRefusal | null;
  apply: (p: Project, args: A) => Partial<Project>;  // the patch, nothing else
  touches: FingerprintLayer;                    // which layer the patch invalidates
}

interface OpImpact {                            // computed by the derivation graph, never by the op
  before: DesignMetrics; after: DesignMetrics;  // kWp, modules, strings, dcCableM, steelKg, bomTotal,
  delta: Partial<DesignMetrics>;                // annualKwh, health, drcErrors — each with provenance
  stale: StaleReport;                           // what becomes provisional (shading, captures …)
}

runOp(store, op, args, { preview?: boolean })   // preview computes impact without dispatch
```

Every existing mutation site in `Step6Editor.tsx`, `Step2Roof.tsx`, `Step3Obstructions.tsx`,
`Step4Components.tsx`, `StructEditPanel.tsx`, `LegPlanEditor.tsx` becomes a call to an op.
The first ops are extracted from the code that exists (`applySegment`, `rotateSelected`,
`runAutoPlace`, `doAutoString`, `applyStructChoice`, `acceptAiReview`, …), so behaviour does
not change while the surface unifies. Undo history gains readable labels for free.

**Derivation graph** — `lib/derive/`. Memoised selectors keyed on the fingerprint layer they
depend on, replacing the nine per-render recomputations:

```
geometryFp → structures            (projectStructures, today unmemoised)
layoutFp   → autoStrings*          (autoStringPlan; *derived-with-override, see below)
electricalFp → routes*, sizing, sld, gate
designFp   → bom, money, finance, energy, insights, health
shadingFp  → solarAccess (async, worker; already stamped)
```

**Derived-with-override for strings and routes.** `project.strings` and `project.cableRoutes`
stay on the type (compatibility, fingerprints, share links) but gain the same discipline as
`solarAccess`: `derived.stringsFp` and `derived.routesFp` record the input fingerprint they
were computed for. When the input moves:
- auto strings/routes re-derive on the next read (cheap, synchronous);
- **manual** strings (`StringDef` gains `manual?: true`) and manual routes (`CableRoute.manual`
  already exists) are kept and re-validated; a broken manual string is flagged on the object,
  never silently kept or silently dropped;
- every consumer (BOM, SLD, sheets, energy, health) reads through the selector, so nothing
  downstream can see a stale route again. `dcCableFromRoutes` reports `routed: false` and the
  BOM line drops to `estimated` provenance while a route is stale — the existing provenance
  machinery does the honest thing on its own.

**Staleness closure.** The money-stale gate becomes real: `bomMoney` and `computeFinancials`
return a `fresh: boolean` derived from `isShadingFresh` + routes/strings freshness; Step 9,
ProposalView (print included), the share view and the dashboard render provisional styling and
the word "provisional" in the printed document when it is false. Panel swap becomes an op that
re-keys `layoutFp` (panel dimensions enter the layout layer) and re-solves affected segments.

### 5.2 Interaction kernel

**SceneIndex** — `three/scene-index.ts`: a bidirectional map `entityId ↔ (instancedMesh,
instanceIndex) | mesh`, rebuilt from the derivation graph, not from React render order. Every
entity class registers: module, segment (table), roof, obstruction, keepout, walkway, rail,
arrester, inverter, meter, string, route, member, node/foundation, surround solid.

**Picker** — `three-mesh-bvh` (new dependency, MIT) on roof/ground/structure meshes; instanced
picking for modules via `InstancedMesh.raycast` + the index. Same BVH is reused by the shading
engine (G5), which is the single largest speed-up available.

**Selection and hover** — `WorkspaceStore` (a small zustand-free React context like `store.tsx`,
not persisted): `selected: EntityRef[]`, `hover: EntityRef | null`, `tool`, `cameraMode`,
`simTime`. Both the 2D plan canvas (while it still exists) and the 3D scene read and write it.
Rendering: per-instance colour for modules (already supported by `instanceColor`), an outline
pass for meshes, a quiet on-object label with the entity's two key numbers and provenance chip.

**Gizmos and snap** — a translate/rotate gizmo bound to the selected segment or obstruction in
the roof plane (roof-plane constraint from `surfaceHeightAt`), an azimuth ring, a tilt lever
with a live angle readout, a row-pitch handle between rows, edge handles on segments. Snapping
to roof edges, setbacks, module pitch and 5° increments; touch gets larger handles and the
loupe + offset-drag rules from `DESIGN-SYSTEM.md §7.3`. Every drag previews the op's impact
(numbers on the object) and commits one op on release.

**Camera director** — fit-to-design on open, fit-to-selection on double-tap, tweened presets
(top / iso / front / plan-ortho), consistent clamps, `zoomToCursor`, `demand` frameloop with
invalidation on any store change or tween tick.

### 5.3 Scene = engine

`buildShadowCasters` becomes the **only** definition of what casts. The scene renders the same
caster list (`castShadow` derived from it), so rails, arresters, inverters, structure members
and surround solids are either in both or in neither — the master plan's S8-10 and defect #12
close as a by-product. The two sun quadratures merge into one sampler.

### 5.4 Engines as ports

```ts
interface ShadingEngine  { solarAccess(project, opts): Promise<AccessResult> }
interface EnergyEngine   { simulate(project, access): EnergyReport }   // built-in today
interface SimulationPort { export(project): PvsystPackage; import(results): MeasuredVsModelled }
```

The built-in engines are wrapped, not rewritten, in this spec. The master plan's R3 (8760
physics) replaces the `EnergyEngine` implementation behind the same port; the PVsyst adapter is
a second implementation of `SimulationPort`. Results stay traceable to the design because the
port takes the `Project` and returns per-module and per-string series.

### 5.5 AI planner

```
engineer text  →  /api/ai/plan  (Gemini, structured output, server-side)
                  tools: read-only design queries (summary, per-module access, electrical
                         state, DRC, BOM totals) + the DesignOps registry as callable tools
               ←  Proposal { ops: OpCall[], rationale, expected: Partial<DesignMetrics> }
client         →  runOp(preview) for each op → real OpImpact from the derivation graph
               →  proposal card: WHAT changed · WHY · IMPACT (computed, not claimed) · APPLY
apply          →  one undoable patch; undo label = the proposal title
```

Binding rules from the owner's earlier decisions stay: Gemini is structured-output-only,
server-proxied, never applied without validation and user approval. The AI never computes an
engineering number; the engine does. "Expected" from the model is shown only as the model's
claim beside the engine's computed impact, so hallucinated gains are visible as a mismatch.
The eight existing insight analyzers become the first read-only tools; their `action` gains a
real `OpCall`, which also fixes G6 for the non-AI path.

The mission's example intents map to ops that exist or are added in Phases 1–3:
"fit 20 more" → `autoDesign(max_roof)` with a module target; "15° tilt" → `segment.setTilt`;
"optimise strings" → `autoString`; "reduce shading losses" → row-pitch / disable-shaded ops
ranked by impact; "is this electrically valid" → gate + DRC query; "generate BOM" → navigate +
export op.

---

## 6 · Phase plan

Effort scale as in the master plan: S days · M 1–2 weeks · L 3–6 weeks · XL a quarter.
Every phase: study pass first (owner rule), tests green, live verification in the browser,
`DESIGN-SYSTEM.md` definition of done for any screen, nothing orphaned.

### Phase 0 · Land the site frame · S
Apply the reviewed fix wave F1–F10 on `site-frame`, merge to `main`, track
`docs/STUDIO-MASTER-PLAN.md`. Slice 2 of the site spec (imagery scale) carries its blocking
precondition. **Done when:** `main` contains the exact frame, suite green.

### Phase 1 · Design kernel — truth first · M
- `lib/derive/` memoised selector graph; `projectStructures`, energy, BOM, money, insights read
  through it. Propagation matrix from the census becomes a test file
  (`lib/__tests__/propagation.test.ts`): each edit row asserts what recomputes and what flags.
- `lib/ops/` registry; extract the existing mutations into ops with labels and impact.
- Strings and routes derived-with-override with stale stamps; inverter move re-routes; panel
  swap undoable and layout-re-keying; loose-panel rotation re-strings.
- Money/energy freshness returned from the selectors and rendered as provisional everywhere
  money appears, print included. Undo reachable on every step (thumb-reachable on mobile).
- Master plan §10 defects #2, #3, #12, #16 and #17 closed here (same code paths).
**Done when:** the propagation test file is green, and moving an inverter in the browser
changes the DC cable metres in the BOM without any button press.

### Phase 2 · The persistent 3D workspace · L
- `Scene3D` stops being a modal: mounted once per project. Default is full-bleed 3D with the
  plan canvas as a toggled mode that keeps the GL context alive; a side-by-side split is
  offered at `lg` and above. `WorkspaceStore` shares selection/hover/tool/camera/simTime
  between the two.
- SceneIndex + BVH picker; every entity class pickable; selection and hover rendering; the
  on-object label with two numbers + provenance chip.
- Camera director; `demand` frameloop; memoised scene parts; dpr cap and adaptive dpr;
  `preserveDrawingBuffer` only during capture; touch gestures per §7.2; the passive-listener
  errors gone.
- Scene = engine (5.3).
**Done when:** a 2,000-module synthetic design orbits at ≥ 50 fps on a mid-range laptop and
every object class can be tapped on a phone with a visible selection.

### Phase 3 · Direct manipulation · L
- Gizmos: move/rotate tables and obstructions on the roof plane; tilt lever; azimuth ring;
  row-pitch handle; segment edge handles; module click/paint toggle; draw walkway/rail/keepout
  on the roof in 3D; drag inverter/meter along walls. Each is an op with live impact on the
  object. Snap + loupe on touch.
- The 2D plan becomes the ortho camera mode of the scene for these tools; the SVG editor keeps
  the tools not yet migrated. Parity checklist + owner sign-off before the default flips
  (owner rule, task 32b).
**Done when:** the whole layout step can be completed on the 3D surface, and the parity
checklist is signed.

### Phase 4 · Fidelity and animation · M
- Environment lighting (bundled small HDRI), CSM shadows fitted to bounds, SMAA + subtle SSAO
  behind a quality toggle, real module (cells, busbars, frame, thickness from spec), roof
  coverings, compressed and instanced obstruction assets (gltf-transform pipeline, Draco +
  KTX2), the missing windmill.
- Sun/shadow animation on `useFrame`; seasonal sweep; tweened camera; placement/auto-design
  transitions; before/after compare of two design states.
**Done when:** the proposal hero render is captured from the same scene at 4× resolution and the
GLB payload for a residential project is under 8 MB.

### Phase 5 · Electrical in 3D · M
Strings as selectable geometry (module-to-module runs, colour = string), route polylines as
real cable with waypoint handles, combiner/DCDB/ACDB placement, string inspector (Voc cold,
Vmp hot, MPPT window, drop %), energy-flow animation along strings, cable schedule derived
(master plan S7-11) and a per-inverter DC loading readout (S7-17).
**Done when:** dragging a route waypoint changes the cable schedule and the BOM line, and a
string that breaks the MPPT window turns red on the roof.

### Phase 6 · AI-native loop · M
`/api/ai/plan`, tools = read-only queries + ops registry, proposal cards, undo labels, insight
actions wired, the mission's example intents covered by tests that assert the engine impact
is shown beside the model's claim.
**Done when:** "fit 20 more modules on this roof" yields a card with computed kWp/₹/kWh deltas
and one tap applies it undoably.

### Phase 7 · Simulation port · L (then R3 behind it, XL)
`ShadingEngine`/`EnergyEngine`/`SimulationPort` interfaces; built-in engines wrapped; BVH shading
at 8760 samples with per-module cache; exportable shade study; PVsyst package export and
results import. The master plan's E1-01…E1-07 replace the built-in energy engine behind the port.
**Done when:** the same design produces the built-in number and the PVsyst number side by side
with the difference explained by the loss diagram.

### Phase 8 · Outputs and scale · L
Sheet engine, module numbering, cable schedule sheet, equipment schedule from the derivation
graph (master plan S10-01…S10-04, S5-07); LOD and chunked derivation for 5,000-module ground
mounts; worker-side BVH shading; autosave snapshots for large projects.

---

## 7 · What does not change

The master plan's §11 rules, verbatim, plus: `DESIGN-SYSTEM.md` is binding for any new UI;
structural safety stays engineer-signed; units rule; canonical `Project` remains the only truth;
the one-frame gate is extended with every new entity class, never weakened; Edit/Write only for
source changes; `npx vitest run` and `npx tsc --noEmit` green before every commit.

---

## 8 · Assumptions stated

- Work happens in **this repo** on a branch off `main`; the studio stays a self-contained feature
  module so HelioGrid can lift it later (the 2026-07-24 hand-off plan).
- No subscription or plan-limit behaviour is added or preserved (D38); the "10 kW plan limit"
  banner goes with Phase 1.
- Google Solar and Gemini keys are absent in the dev environment; AI detection paths are
  exercised through their existing fixtures, not live.
- The 2D SVG editor is retired only after the parity checklist is signed (owner rule).

---

## 9 · Decision needed from the owner

**A · Truth first (recommended):** Phase 0 → 1 → 2 → 3 …, in that order.
Visible 3D change arrives after Phase 1 (about two weeks in), but every later 3D edit is
guaranteed to produce a correct BOM and energy figure.

**B · Beauty first:** Phase 2 → 3 now, Phase 1 after.
Visible sooner. Risk: 3D edits that leave strings, cables and money silently stale, and a
second pass over every gizmo once the operation layer exists.

On approval the next step is a written implementation plan for Phase 0 + Phase 1
(`docs/superpowers/plans/`), then execution with tests and live checks.
