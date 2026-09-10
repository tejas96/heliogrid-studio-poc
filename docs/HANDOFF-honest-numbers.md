# Handoff prompt — make the studio's numbers honest, and stop the heatmap thrashing

Paste everything below the line into a fresh session.

---

In `/Volumes/works-space/Solar-App-POC` (branch `main`, currently at `56c1514`).

## Goal

Six defects where **the app shows the user a number that is wrong, or contradicts
another number on the same screen**. Nothing here is a new feature. Every one of them
is the tool being untrustworthy, which matters more than anything cosmetic, because an
Indian solar EPC hands these figures to a customer, a lender and a DISCOM inspector.

Plus one performance defect that makes the shading map unusable during layout.

Work them in the order below — item 3 must land before item 4, and the ordering
otherwise puts the cheap trust-restoring fixes first.

**Do NOT do any 3D model / mesh / obstruction-type work.** That is deliberately parked.

## Scope rules (binding)

- Read `CLAUDE.md` first. It wins over your instincts.
- **Desktop studio only.** No 375px work, no touch-target work. The phone client ships
  natively from a different repo.
- **Use Edit/Write for every file change. Never sed/perl/python** — it has corrupted
  files in this repo before.
- **Verify in the browser, not just in tests.** Several real bugs here passed the whole
  suite. See the browser notes at the bottom; they will save you hours.

## Gates — all four green before every commit

```bash
npx tsc --noEmit
npx vitest run
npm run cycles
npm run lint
```

Baseline to beat or match: **1954 tests passing, exactly 5 lint warnings, cycles clean.**
`npm run dead` (knip) exits 1 with exactly two known findings (`opById`, `listOps`) —
that is the expected state, not a regression. Run the gates with the dev server STOPPED.
Use `set -o pipefail` if you pipe vitest through `tail`, or a red test hides.

Commit to `main` and push. One branch, one remote.

---

## 1. Solar access can never read below 35%, but every legend claims 0–100% (S)

`lib/poa.ts:14` `export const DIFFUSE_SHARE = 0.35`, and
`lib/solar-heatmap.ts:325` `monthly[m] = DIFFUSE_SHARE + (1 - DIFFUSE_SHARE) * beamFrac;`
— a cell with **zero** direct sun reports 0.35. `lib/energy/report.ts:133` and `:278`
build `avgSolarAccessPct` the same way, and that figure is printed to the customer.
`three/Scene3D.tsx:2453-2455` prints `0%` / `50%` / `100%` under the ramp.

Worse, the two readers of that number disagree inside one file: `accessLabel`
(`lib/solar-heatmap.ts:66-73`) bands at 0.5/0.75/0.9 and calls 0.35 "Poor", while
`heatColor` (`:75-80`) interpolates red→amber below 0.5, putting 0.35 about 70% of the
way to amber — **the reddest colour on the ramp is unreachable.**

The floor itself is deliberate and has a written rationale at `lib/solar-heatmap.ts:320-324`
(stable shadow contrast). **Do not remove the floor.** Fix the honesty: label the scale
for what it is, or print beam access separately from the diffuse-floored figure, and
re-anchor `heatColor` and `accessLabel` to the same breakpoints so the colour and the
word agree. Presentation only — no engine change.

## 2. A loss is printed in the waterfall and never deducted from anything (S)

`lib/energy/report.ts:108` computes `electricalPct = electricalShadingLossPct(project)`
and `:127-129` pushes it into the returned `losses` array as
"Shading — electrical (strings)". In the same object literal, `:117` returns
`annualKwh: hourly.annualKwh` and `:132` returns `totalLossPct` derived from
`hourly.prPct` — which **never sees `electricalPct`**. The monthly fallback branch
repeats the bug exactly (`:246`, `:258-260`, `:262`). The rows render read-only at
`components/EnergyReportSheet.tsx:176`, under a "Total System Loss" line.

So the sheet shows a 6% loss, a total that excludes it, and an unchanged MWh headline
above both. Anyone who adds the column up catches it.

Compose `electricalPct` into the PR and the annual kWh in **both** branches. Add a test
that the total is at least the sum of the parts and that it is no longer trivially
satisfied. If you decide it must stay excluded, then the sheet has to say so in words —
but composing it in is the correct fix.

## 3. The sun chart and the shading engine look at different objects (M)

`lib/sun-chart.ts` builds the horizon from exactly three sources: the DSM grid march
(`:202-210`), other roofs as solid blocks (`:214-222`), and obstructions
(`:194`, ray-marched at `:224-239`). **There is no parapet term and no arrester term.**

But `lib/scene-model.ts` — which builds the casters the beam engine actually raycasts —
emits both: `casterKind: 'parapet'` rings at `:257-259`, arrester masts at `:294-302`.

A 1.2 m RCC parapet is the most common shading object on an Indian rooftop, and a
rooftop LPS mast is mandatory on most C&I jobs. So the sun chart says that edge has
clear sky all day while the per-module solar-access figures beside it deduct for the
same parapet — two answers in one frame.

It is not only the chart: `lib/energy/hourly.ts:435` calls `horizonProfile(project, 5, 'centre')`
for the sky-view factor, so the same objects are missing from the **diffuse** calculation.

Preferred fix: derive the horizon profile by raycasting the group `scene-model` already
assembles, so the chart and the engine cannot diverge again. Add a test pinning that a
parapet lifts the horizon.

## 4. The diffuse half of the irradiance is mis-derated (M) — do this AFTER item 3

Two separate errors in `lib/energy/hourly.ts`:

**(a) Wrong sky-view formula.** `:439-440`:
```
for (const e of prof.elevDeg) blocked += Math.sin((Math.max(0, e) * Math.PI) / 180);
return Math.max(0.3, 1 - blocked / n);
```
For a uniform skyline at elevation β the sky-view factor of a horizontal plane is
**cos²β**. At 30° the truth is 0.75; this returns 0.50. Also reconsider the 0.3 floor —
it means a genuinely enclosed courtyard stops responding to geometry at all.

**(b) Two Perez terms are never shaded.** `:300`:
```
const poaShaded = beam * access + iso * input.skyView + circ * access + hor + ground;
```
`hor` (the horizon-brightening band, built at `:296`) and `ground` (the albedo term,
`:297`) carry **no shading factor at all** — and the horizon band is precisely the strip
of sky a neighbouring G+4 blocks first. Also `input.skyView` is one scalar for the whole
array (a single `'centre'` call at `:435`), so a module hard against a parapet and one in
the open middle of the deck get identical diffuse.

In monsoon India diffuse is 50–70% of the resource, so this is not a rounding error, and
the two errors point in **opposite** directions — an EPC cannot even reason about which
way the yield is wrong.

Fix all three: the cos²β form, an occlusion factor on `hor` and `ground`, and a
per-module (or cheaply interpolated) `skyView` rather than one per project.

**This depends on item 3.** Fixing the formula while the profile is still missing
parapets just runs the corrected maths on the wrong skyline.

## 5. Converting a roof to Ground breaks its height, and lies about where it came from (S)

`screens/Step2Roof.tsx:462-475` — the ground branch of `setRoofType` writes
`heightM: 0` but **never touches `heightSource`**, so a DSM-fitted roof keeps the
`heightSource: 'aerial_map'` stamped at `:782`. The pick card then asserts a **measured**
0.0 m eave on open ground, which the aerial height map is explicitly excluded from.

The sheet that edits it (`:2069-2077`) is a `SliderRow` with **`min={2}`** and the hint at
`:2082` still reads "Height of roof surface from ground level." So the readout prints
0.0 m while the thumb sits at 2 m, and the first drag emits ≥ 2 — **lifting the entire
field, modules, tables, obstructions and every shadow, two metres into the air, with no
way back to 0 through the control.**

Branch the sheet on `roofType === 'ground'`: min 0, ground vocabulary ("Ground Clearance",
not "Height from Ground"), no parapet section. And set `heightSource` in the ground branch.
`makeGroundSurface` in `lib/roof-factory.ts` is already tested — delegating to it fixes
both at once.

## 6. Nudging one module rebuilds the entire 12-month heatmap. Twice. (S)

`screens/Step6Editor.tsx:418` and `three/Scene3D.tsx:1012` both read
`const heatFp = useMemo(() => shadingFp(project), [project]);`

`lib/fingerprints.ts:318-346` shows `shadingFp` serialising **every module centre to the
centimetre**. But `computeHeatmap` (`lib/solar-heatmap.ts:226`) has **no panel dependency
at all** — `generateHeatGrid` (`:96`) iterates `project.roofs` only, and the casters come
from `buildShadowCasters(project, { surround })` at `:275` with `includePanels` left off.

Cost per run: an 1800-cell budget × 12 months × the 04:00–20:00 half-hour sample list
built at `:169` ≈ **5.5 × 10⁵ raycasts**. And the two views hold *separate* one-entry
caches (`Step6Editor.tsx:318`, `Scene3D.tsx:963`), so switching 2D→3D recomputes the
identical pass.

`geometryFp` — the correct key — **already exists** at `lib/fingerprints.ts:43`.

Switch both memos to `geometryFp`, and hoist the cache to a module- or store-level map
keyed by fingerprint so 2D and 3D share one result. No engine change. Add a test that a
module move does not change the heatmap key.

While you are there: `Step6Editor.tsx:427` calls `computeHeatmap(project, { signal })`
with **no `onProgress`**, so the 2D heatmap just vanishes while it rebuilds. 3D has a
progress readout at `Scene3D.tsx:962`. Wire the same one up.

---

## Browser verification — read this, it will save you hours

- **The 3D scene takes ~25 seconds to mount.** `window.__three` stays `false` until then.
  Do not conclude it is broken; wait, then re-check.
- **The Browser pane must be VISIBLE.** A hidden pane leaves the canvas at its default
  300×150 and r3f never initialises. `tabs_context` tells you if it is hidden.
- **A blank studio route after many edits is usually stale HMR.** Restart the dev server,
  and `rm -rf .next` if that is not enough. Do not "fix" working code.
- **`read_console_messages` returns the tab's whole accumulated buffer**, not new entries.
  Stale errors from a killed server keep reappearing. Check the build id in the
  `webpack.js?v=` resource URL before believing an error.
- `window.__three` exposes the live r3f state — `.scene`, `.camera`, `.gl`, `.controls`,
  `.invalidate`. Drive the camera with `controls.setLookAt(...)` then 40 × `controls.update(0.1)`
  **without rendering**, or the damping leaves you mid-flight between captures.
- Any A/B pixel measurement must run a **control that must be 0** (grab the same frame
  twice) before you believe any delta.

## Do not damage the owner's project

The owner's real design lives in browser localStorage under
`solar-studio-prj:prj_f64ed8ea-f664-42ec-9acc-8177854758df` (82302 bytes, health 100/100).

- **Never click inside the 3D canvas.** Clicks there drag gizmos and silently edit the
  design. Drive the camera with `window.__three.controls` instead.
- To test destructively, clone the project into a scratch copy:
  1. Snapshot both the project key and `solar-studio-meta` to `sessionStorage`.
  2. Deep-copy the project JSON, give it a new `id` and an obviously disposable name,
     add your test objects, write it to `solar-studio-prj:<newId>`, and append the id to
     `meta.projectIds`.
  3. **Setting `meta.activeProjectId` by hand does not survive a page load.** Open the
     copy by CLICKING ITS CARD on `/projects` with a real pointer click at screen
     coordinates. A JS `el.click()` navigates but does NOT set the active project.
  4. **Close every other tab on localhost first** — a second tab's debounced save puts
     its own project back within seconds.
  5. Afterwards delete the scratch key, restore meta, and assert the owner's project
     string is byte-identical to your snapshot.

## Definition of done

For each of the six items:

1. The fix is in, with a comment saying **why**, not what.
2. There is a test that **fails on the old code** — check that it does, do not assume.
3. All four gates green.
4. Where the change is visible, you have **seen it in the browser** and can state the
   measured before/after. If you could not see it, say so plainly rather than implying
   you did.
5. `docs/RESLINK-GAP-REPORT.md` is updated — and correct it where it is stale. Several
   of its line numbers are already ~60–490 lines out of date.
6. Committed and pushed to `main`, one commit per item, with the measurement in the
   message.
