# Solar Studio — session handover

**Branch:** `studio-next` (pushed). Never push `main` — `origin/main` is the unrelated HelioGrid
history.
**Ledger:** `.superpowers/sdd/2026-09-02-phase1-design-kernel/progress.md` (untracked, never commit).
**Gates before every commit:** `npx tsc --noEmit` and `set -o pipefail; npx vitest run`.
Currently **1819 tests green, tsc clean.**

---

## 1. Where the work stands

Batch C (the PVsyst-class energy engine) is finished except validation.

| Commit | What landed |
|---|---|
| `3c821b8` | DC and AC wiring loss read from the design's real cable runs |
| `694bed2` | DC cable sized by voltage drop, one BOM line per size |
| `cfae59b` | Bifacial rear side, solved from the mounting geometry |
| `a22a4a2` | Single-axis trackers, end to end |
| `5facad4` | Height map stopped out-shining the map (white mesh) |
| `de1ae93` | Black patches over the map (stacked ground planes) |

### What each of the last four actually does

**DC cable sizing.** Each string's cable is now the thicker of two answers: what its fuse needs,
and what keeps voltage drop under 1.5% at STC over its real routed loop. The BOM emits one line
per size. The schedule, the SLD, the report and the 3D string card all read the same answer.

**Bifacial.** `lib/energy/bifacial.ts` is a 2D infinite-sheds view-factor model. It sweeps the
module's back over the half-space and asks what each direction sees — sky, a neighbouring row, or
which patch of ground — then works out hour by hour which patches are shaded. Validated against
the closed form: with the neighbours far away it reproduces (1 ± cos β)/2. The gain therefore
follows the MOUNTING: flush on tile 0.4%, elevated table 2.8%, ground row 4.9%, high albedo 12%.
`lib/bifacial-check.ts` warns when a bifacial premium is being wasted.

**Trackers.** `lib/energy/tracker.ts` — real tracking plus real backtracking (the test proves the
backtracked angle by the shadow it throws landing exactly on the row pitch). The tube runs along
the table's rows; the row pitch is always MEASURED off where the modules stand, never read from
the racking's declared field. The 3D array visibly turns with the timeline, the shading engine
casts each sun sample off the pose at that moment, and the BOM carries the tube, bearings, drive
and controller at clearly ASSUMED rates.

Live proof (fixture project **"Tracker ground test"**, 16.81 N 74.62 E): 42 bifacial modules on 7
north–south tubes at 6.51 m; tilted east at 7:53 AM, flat at noon, tilted west at 3:56 PM;
2,080 kWh/kWp, PR 82.8%, bifacial +4.4%, near-shading 0.9%.

---

## 2. Next up

1. **C5 — PVsyst validation. BLOCKED ON THE OWNER.** Needs one PVsyst project plus its report.
   This is what turns the model's *assumed* 5% uncertainty into a *measured* number. Until then
   every P90 on the report carries "assumed until the PVsyst comparison".
2. **The BOM/BOS lines the owner believes are wrong.** Still owed. Nothing wrong was found on the
   test projects beyond lines already labelled as estimates.
3. **C3 leftovers:** a tilted tracker axis; thread `faceAzimuth` into the remaining drawing
   surfaces (SLD, DXF, insights) so a tracker prints along its tube there too.
4. **Roof detector confidence** is 20% on the owner's real Sangli metal shed and 91% on a
   neighbouring RCC roof. The plane-fit confidence punishes pitched, uneven sheds.

---

## 3. Open, seen but not fixed

- **3D rails share a z-index with scene handles.** A stray tap on a drei `Html` handle once moved
  an inverter. Guarded now by a 6 px travel threshold in `Handle`, but the z-order is still wrong.
- **Dollying very close puts the camera under the terrain.**
- **Tile streaming** empties and refills the Google photomesh constantly while zooming (measured:
  12,096 → 8,605 → 797 triangles in one zoom). That is normal for a streaming renderer and is
  deliberately left alone — what made it a *defect* was the garish surface behind it, now fixed.

---

## 4. Hard-won lessons — read before touching the 3D

- **`window.__three`** exposes the live r3f scene (`.scene`, `.camera`, `.gl`, `.raycaster`).
  Nothing else can reach it — `canvas.__r3f` is absent and an 80-hop fiber walk finds nothing.
  Also `__surroundGrid`, `__relief`, `__shadeProfile`, `__tmy`. All dev-only.
- **To settle a rendering question:** toggle the suspect mesh's `.visible` and screenshot (proves
  *what* you are looking at), then read its material and UVs, then compute an **area-weighted**
  histogram of whatever the shader keys on. Three plausible hypotheses died to data in this
  session before the right one.
- **`gl.render(scene, camera)` by hand does not reproduce the frame** — it renders through an
  EffectComposer, so a manual render plus `readPixels` measures nothing and looks stable.
- **Two unrelated causes can be on screen at once.** The white mesh and the black patches looked
  like one bug and were not. Read the whole frame before declaring a rendering bug closed.
- **Never size an inverter at `acW: 1e9`** in an engine test to "switch clipping off". It parks
  the inverter where its efficiency curve is near zero AND non-linear, which silently rewrites any
  comparison — it inflated a tracker-vs-fixed gain from 28% to 54%.
- **A raster's rows run north to south**, so `stepRow.y` is negative. Positive in a fixture flips
  every face's winding and the normals point at the ground.
- **Compare an error's `webpack.js?v=` id with the live bundle** before chasing it — stale HMR
  console entries have wasted hours here. `rm -rf .next` and restart when screenshots stop
  changing.
- **Browser-pane `computer:scroll` times out on the canvas**; dispatch synthetic `WheelEvent`s.
- **Snapshot the owner's project** to a spare `localStorage` key before any destructive browser
  test, and write it back afterwards.

---

## 5. Fixture projects in the browser

| Project | What it is for |
|---|---|
| **Pune Factory Shed** | Actually London, ON. The owner's own. 27 modules, 3 elevated tables, no inverter placed. Urban tower — the site to check any surround/relief change against. |
| **Tracker ground test** | 16.81 N 74.62 E farmland. 42 bifacial modules on 7 tracker tubes. Open the 3D and drag the timeline to watch it turn. |
| **Kathmandu no-map test** | A site with no Solar API height map, for graceful-degradation checks. |

---

## 6. Binding owner rules

AI comes LAST. Never move on with a known bug. Never apply anything blindly — judge every feature
by market standing and end-user ease, and build only what is genuinely worth it. Nothing mock or
fake. No enable/disable pair for something that should just be the truth. Fix from the root.
No test ceremony — at most one thin gate test per task. Edit/Write for all source changes, never
sed/perl/python. Read the WHOLE screenshot.
