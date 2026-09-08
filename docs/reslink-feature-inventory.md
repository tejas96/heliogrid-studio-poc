# ResLink Design Tool — verified feature inventory

**Source (hard evidence, not marketing):** the public Vite bundle
`https://reslink.in/design/assets/index-BUje1ltR.js` (4.71 MB) plus
`three-vendor-oIL5KgKf.js` (1.37 MB) and `index-DCcA9BYl.css` (121 KB), read on 2026-09-08
without logging in. The app shell at `/design/`, `/design/wizard/N` is served publicly; only
the data API is behind phone-OTP auth. Every string below is quoted verbatim from the bundle's
English i18n dictionary (bundle offsets ~287,441–366,600). Anything marked [inferred] is my
reading of code, not a quoted string.

App identity: `name: "Solar Design Tool"`, `tagline: "Design rooftop solar in 20 minutes"`,
`versionLine: "Reslink Design · v{{version}}"`.

Languages shipped: **English, Thai, Vietnamese, Hindi** (four full dictionaries; the Hindi and
Thai ones are complete, not stubs). So ResLink is no longer India-only.

Stack [inferred]: React + React Router (`path:"/wizard/0"` … `"/wizard/10"`,
`"/wizard/complete"`, `"/share/:shareId"`, `"/replay/:sessionId"`), Vite, three.js +
react-three-fiber, Tailwind, i18next, Sentry, PostHog. There is a **session replay** route
(`/replay/:sessionId`) and a `replay:tap` custom event — they record real user sessions.

---

## 0 · Shell, plans and support

- Products in the switcher: `Proposals`, `CRM`, `Projects`, `3D Design` — the design tool is
  one product inside a suite.
- Plan gating is live in the client: `/api/me/plan`, cached in `reslink_plan_cache_v1`,
  fields `plan`, `company_id`, `country`. Gated things seen:
  `exportNotOnPlan: "3D export is not available on your plan. Upgrade to Pro to export 3D models."`,
  `readOnlyPlanLimit: "Read-only · Plan limit"`, `proOnlyGroundMount: "Pro only · Ground Mount"`,
  `locationLocked: "Location locked — upgrade to edit"`,
  `roofEditingLocked`, reference drawings `"Reference drawings are available on the Pro plan."`,
  `planExpired`, `onFreePlan: "You're on the free plan"`.
  Over-limit projects stay **viewable**: *"You can still view 3D, export, or see the proposal
  from the menu."*
- Country awareness: `getCountrySync`, `isInternational` — SLD defaults come from the project
  country.
- Support is in-product: `Chat on WhatsApp`, `Email us`, `YouTube Tutorials`, `Quick tour`,
  per-step help (`aboutStep: "About: {{step}}"`), and the WhatsApp message is pre-filled with
  step, project name, project id, phone and user id.
- Guided tour on the header tools (`Save & go home`, `Save your work`, `Need help?`) with
  `Don't show again`.
- Offline: `Offline`, `loadedFromCacheOffline: "Loaded from cache (offline)"` — the project list
  works offline.
- Zoom guard: `"Screen zoomed in" / "Pinch two fingers together to zoom back out."`
- Boot guard v3 in `index.html`: *"watchdog + self-repair"*, deliberately placed above the
  fonts stylesheet so a hung CDN cannot block boot. They also handle
  `webglcontextlost` / `webglcontextrestored` and show `"Recovering 3D view..."`.
- Telemetry on the 3D scene: GPU renderer/vendor string, dpr, fps, worst frame gap, draw calls,
  triangles, texture count — sampled every 2 s and shipped.

## 1 · Project list (home)

Search by name/customer/address · sort by last updated / newest / name / **system size** ·
filter by status (`Draft`, `In progress`, `Design ready`, `Proposal ready`) · **filter by
employee** with multi-select, select-all and search · per-card stats (capacity, customer,
updated) · row menu: `Show PDF`, `Show 3D`, `Export 3D`, delete · `Ground mount` badge.
There is a separate **survey** project type (`openingSurvey: "Opening your survey project…"`).

---

## Wizard — 11 steps

`step: "Step {{current}} of {{total}}"`

| Route | Step name |
|---|---|
| /wizard/0 | Project Setup |
| /wizard/1 | Roof Setup |
| /wizard/2 | Obstructions |
| /wizard/3 | Components |
| /wizard/4 | Auto Placement |
| /wizard/5 | Manual Edit |
| /wizard/6 | BOM |
| /wizard/7 | Proposal |
| /wizard/8 | SLD |
| /wizard/9 | Layout Drawings |
| /wizard/10 | Final |

Header on every step: `Go back`, `Save project`, `Save & go home`, `Help`, `Upgrade`,
`Next Step` / `Finish`.

---

### Step 0 · Project Setup

Customer name (optional) · project name (optional) · phone · email · **State → DISCOM**
cascading pickers (`Select State First`) · connection type single/three phase ·
**Sanctioned load (kW)** with the Indian rule baked in: `maxAllowed: "Maximum allowed: {{max}} kWp
(2x sanctioned load)"`, `exceedsMax: "Cannot exceed 2x sanctioned load"` ·
site type residential / commercial / industrial · **company logo upload with crop & scale**
(max 5 MB, max 12 × 6 cm, PNG/JPG) that lands on the proposal.

Project kind chosen here: `Ground Mount Project` (BETA + PRO, *"Open access / PPA — no
sanctioned load required"*, `desktopOnly: "Only available on desktop or laptop."`) and
`Pitched Roof` (*"Gable, hip & lean-to sloped roofs"*).

Location: address search, **use my current location**, or **type lat/long**
(`e.g., 28.6139, 77.2090 for New Delhi`), country picker with search, satellite preview with
fullscreen, then `Confirm Location`.

Solar resource is fetched immediately and shown before any design exists:
`Irradiance kWh/m²/day`, `Peak Sun hours/day`, `Avg Temp °C`, plus a **monthly GHI + temp
table** (`View monthly breakdown`). Source stated in the UI:
`"Data: NASA POWER (2001-2020 avg)"`.

Tutorial video link on the step: `Tutorial: Getting Started`.

---

### Step 1 · Roof Setup

`instructions: "Draw your roof outline on the satellite image"`,
`tapToPlace: "Tap to place vertices, double-tap to close"`.

**Roof types:** `RCC Flat`, `Metal Shed`, `Ground Mount`, `Carport`, `Gable Roof`,
`Hip Roof`, `Auto Roof (any shape)` — the last one is *"L-shaped / complex footprints —
auto-divided into hipped faces"* and is PRO.

**Carport is a first-class roof type**, with real engineering copy:
`clearHeight` "Ground to the underside of the beam at the low edge — what a van needs to pass
under. Stays fixed when you resize the outline or change the tilt." ·
`carportTilt` "Carports stay shallow — the high edge and the wind load both climb fast with
tilt." · `Low edge faces toward` (tap an edge) · `postSpacing` "One post every two bays (5.5 m)
is the usual." · `postLayout`: **Centre (T-frame) / One edge (cantilever) / Both edges
(H-frame)**, with a fallback message when the outline cannot carry posts on that edge ·
readouts: `Deck at low edge`, `Deck at high edge`, **`Parking spaces (standard car)`**, `Posts`.

**Heights:** `Height from Ground`, `Eave Height` ("The ridge is computed from this, the pitch
and the width"), `Ridge Height` ("Stays fixed when you resize the roof or change the slope"),
plus a real warning: `lowEdgeAtGroundWarning` — "The roof's low edge is at ground level, so the
ridge is as low as it can go for this slope and width…"

**Parapet wall:** direction outward/inward, height, width.

**Openings (holes in the roof):** `Cut an opening` — Free shape / Rectangle / Circle, editable
side length and diameter, and a full rejection vocabulary: `too-small`, `self-intersecting`,
`outside-roof`, `overlaps-opening`, `wrong-roof-type` ("Only a flat concrete roof can have an
opening"), `roof-shrinks-past-opening`, `no-room-for-parapet`. Openings can carry their own
`Parapet wall`.

**Drawing aids:** undo last point · clear all points · close polygon · `Complete Shape?` dialog
that offers to auto-close · **edit an edge's length numerically** (`Edit Edge Length`,
increase/decrease, max length error) · **type a length then click to place**
(`typedLengthHint: "{{value}} {{unit}} — click to place"`) · **lock/unlock individual edges**
(`bothEdgesLocked: "Both edges locked — unlock one to move this corner"`,
`unlockAdjacentEdge: "Unlock an adjacent edge to snap to 90°"`) · `Snap to 90°` ·
tap-to-measure tool · **m/ft unit switch** · zoom in/out/reset.

**Multi-roof:** `All Roofs ({{total}})` list with `Active` marker, `Copy roof`, `Add New Roof`,
`Delete roof`.

**Reference drawing (PRO)** — the standout feature:
*"Satellite image out of date? Add your own site plan or CAD layout, set it to the right scale,
and trace the roof on top of it."* Accepts **DXF drawing, or PNG / JPG image**. Full
workflow: read file → `Set scale` by tapping two points and typing the real distance →
move / rotate (left/right) / width / opacity / lock / centre → `Text & dimensions` toggle.
DXF is parsed client-side with real diagnostics: `dxfStats: "{{lines}} lines drawn,
{{skipped}} items skipped."`, `dxfTruncated`, `errorDxfBinary` ("That is a binary DXF. Save it
as an ASCII DXF"), `errorDxfNoGeometry` ("it may hold only text or splines"),
`errorDxfUnusableSize` ("Check its units in CAD"), size caps DXF < 8 MB, images < 25 MB,
12 megapixels. Sync states: `Saved to your account` / `On this device only` / `Saving…` /
`Downloading drawing…`.

**3D on this step already:** `tap3DHint: "Tap a building to edit its height"`,
`editRoofIn2DOnly: "Edit this roof in the 2D view"`.

Mounting settings live here too: `Monorail Settings`, `Standoff Height`, `Rails / Panel`,
`flushMountNote: "Flush-mount: follows roof slope"`, `Edge Setback (m)`.

Validation: area < 1 m², area > limit, tilt 0–45°, parapet height 0–3 m, parapet width 0–1 m,
`A gable needs a 4-corner footprint`, `A hip roof needs a 4-corner footprint`.

---

### Step 2 · Obstructions  ← the step the owner linked

`title: "Mark Obstructions"`, `instructions: "Tap to place obstructions on the roof"`.

**17 obstruction types:** Water Tank · AC Unit · Tree · Chimney · Dish/Antenna ·
Elevated Roof · Nearby Building · Other · Solar Water Heater · Ladder · Windmill ·
Keep-out Zone · Light Pole · Transformer Pad · Fence · Lightning Arrester · Skylight.

**Skylight has four sub-shapes** with descriptions: `Flat glass`, `Pitched` (hip glass roof),
`Tilted` (mono-pitch), `Arched` (curved barrel vault) — with ridge height, tilt angle, tilt
direction, arch rise, base height.

**Ladder is placed by two taps** — `Tap where the ladder base sits` → `Tap where the ladder top
rests` → confirm or reset.

Shapes per obstruction: Rectangle / Circle / Polygon, each with its own description. Sizes are
edited numerically **per edge**: `canvasEdgeMap: "On canvas: A·C = Length, B·D = Width"`,
`edgeLengthsPick: "Edge lengths ({{unit}}) — pick an edge"`, `Edit edge {{letter}}`. Plus
rotation (`Rotation: {{deg}}°`), height, height offset above the parent roof, and setback
(*"Buffer zone where panels cannot be placed"*).

**Placement surface:** an obstruction can sit on the base roof **or on an elevated roof
surface** — `Select parent roof...`, `Elevated surface ({{height}} from ground)`.

**Height Info panel** shows the whole chain: `Placement:`, `Base surface:`, `Tree height:`,
`Building height:`, `Object height:`, `Surface height:`, `Top from ground:`, and two explicit
flags — **`Casts shadow`** and **`Blocks panel placement`**.

Physics is spelled out to the user: trees *"are external and only cast shadows. They don't
block panel placement"*; **nearby buildings *"cast shadows on your roof. Used for accurate
solar access calculation"***; windmills sit at ground level and cast shadows; elevated roofs
*"provide better generation due to less shading from below"*; keep-out zones are for *"access
roads, drainage channels, utility corridors, or HT line right-of-way"*.

**Bulk editing (this is the big one):**
- `Bulk select` → `Draw to select` with **Box select** or **Lasso select**, or `All obstructions`.
- `"Tap obstructions to add or remove · drag any selected one to move all"`.
- Bulk **copy** — `Tap or drag to position {{count}} copies, then confirm`, with
  `{{count}} skipped — no roof under the copies`.
- Bulk **delete**, bulk **change**, each with an inline `Undo` / `Dismiss` toast.
- **Mirror** — pick a mirror axis by drawing a line (two taps) or tapping a roof edge, then
  `Mirrored {{count}} obstructions`.
- **Array** — Columns × Rows, gap between columns, gap between rows, direction,
  `Centre-to-centre: {{across}} × {{down}} {{unit}}`, `Grow the other way`,
  `Rows on the other side`, and a warning that N copies would land off the roof.
- **Align & arrange** — `Line them up`, `Even spacing` (needs 3 or more),
  `Turn to face` + `Turn`, `Rotate together`, and a snapping/guides toggle
  (`Turn off snapping & guides`), with `"Everything below works along this line — shown dashed
  on the map"`.

**Measuring an obstruction into position:** `Tap a roof edge or another obstruction to measure
from` → `Tap a point on the obstruction` → `"Tap the number to set distance · drag or rotate to
adjust"` → `Set distance to edge`. So you can dimension an AC unit off a parapet exactly.

**View controls on this step:** show/hide labels · show/hide dimensions · show/hide height
labels · toggle measurement labels · show/hide reference drawing · **`Show solar access
heatmap`** · `Back to 3D view` · pan mode · **`Export 3D model (.glb)`**.

**Sun on this step:** `Winter` / `Summer` / `Equinox` / `Today` presets, `Sunrise: {{time}}`,
`Sunset: {{time}}`, `Alt: {{deg}}°`, `Below horizon`. Solar access is computed
**month by month** — `Calculating Solar Access...`, `Month {{month}} of 12`,
`{{month}} Average:`, `Annual:`, graded `Optimal / Good / Moderate / Poor`.

---

### Step 3 · Components

Two halves: `Solar Panels` and `Inverters`, with Indian compliance filters up front —
**`DCR Compliant`, `ALMM Listed`, `BIS Approved`**.

Three ways to get a component:
1. **Browse Database** — searchable, paginated catalogue (`Search by brand or wattage...`,
   filters Min/Max Watt, Type; inverters filter Min/Max kW and Phase),
   `{{count}} panels` / `{{count}} inverters`, prev/next page.
2. **Upload Datasheet → Extract from PDF** — pick the brand by **logo**, upload a PDF (max
   10 MB), `Extracting specs...`, then `"{{value}} variants found — pick one to use"` with
   prev/next variant, `Review extracted data`, `Already in database`, then `Save & Select`.
3. **Enter specs manually.**

Panel fields: brand, model, wattage, length, width (mm), Voc, Vmp, DCR flag, ALMM flag.
Inverter fields: brand, model, AC output kW, MPPT voltage min/max, MPPT count, count,
**type String / Central**, with `scbNote: "Strings will be grouped into SCBs (20 strings/box)"`
and a live `"{{total}} total MPPT ({{inverters}} × {{mppt}})"` chip.
**Multiple inverters per design** with a list editor, and the rule
`"A design cannot mix string and central inverters. Remove one kind."`

**Capacity sizing assistant** (the smartest screen in the product):
- `Target Capacity (kWp)` with the 2× sanctioned-load cap and the warning
  `"Above 2× sanctioned load ({{value}} kW) — may need DISCOM approval."`
- `Estimate capacity from your roof` → `Auto`, giving `Roof Capacity`, `kWp fits`,
  `"{{panels}} panels · {{area}} m² usable · inverter ≈ {{kw}} kW AC"`.
- It *reads the sun while you sit there*: `"reading the sun across the year…"`, then
  `"≈ {{value}}% of ideal"` and `"{{sun}}% sun · {{orientation}}% facing/tilt"`.
- Live what-ifs under `Assumptions`: `Flip which way the panels face`, `Lower tilt`,
  `Raise tilt`, `Panels follow roof slope`, `By roof`.
- `Panels on structures` — *"Place panels on the top surface of a structure?"* → `Keep clear`
  vs `Panels on top`, reporting `{{count}} fixed structures kept clear · {{area}} m²`.
- Footer equation: `"{{wattage}}W × {{panels}} panels = {{capacity}} kWp"`.
- Progress header: `Step {{step}} of {{total}}` inside the step, with `Needs fix` /
  `Not selected` section badges.

---

### Step 4 · Auto Placement

`Placement Settings`: **Roof Priority** with `Drag to reorder placement priority` ·
`Panel Orientation` incl. `Auto (best fit)` · `Row Spacing` with
`Enable for tilted roofs` and `"Prevents shading on Dec 21"` · `Recalculate Placement`.

Live progress narration while it runs — `Preparing placement surfaces...`,
`Creating exclusion zones...`, `Analyzing edges and determining orientation...`,
`Placing tables on roof...`, `Placing tables on elevated surface...`,
`Segmenting panels into tables...`, `Compiling statistics...`, `Placement complete`, and
before that `Calculating solar access (month {{month}}/{{total}})...`.

Per-surface result cards: `Roof {{number}}` / `Elevated Surface {{number}}`, panel count,
`{{value}}% avg` solar access graded Optimal/Good/Moderate/Poor, and a target chip
`Target: {{value}} kWp` marked `Met` or `Exceeded`. Monthly bars Jan–Dec.

**Inverter placement in 3D happens here:** `Place Inverters` → `Tap to place Inverter
{{number}}` → *"Tap on a wall or obstruction surface"* / `TAP A WALL` →
`"All inverters placed! Drag to reposition."` → **`Confirm & String`**.
There is a 3D-specific hint: `'Orbit to find a wall, then tap "Place"'`.

---

### Step 5 · Manual Edit — the step with "lots of options"

**Toolbar — Add panel:** `Single` · `Table` · `Grid` · `Draw Area`.
`Panel Orientation`: Portrait / Landscape (+ `Switch to Landscape` / `Switch to Portrait`).
`Table Layout`: **Grouped / Separate**. `Grid Size (Rows × Columns)` then
`Next ({{count}} panels)`. Rotate −15° / +15°. `Place`. `Snap: Rows` / `Snap: Columns`.

**Tap-to-fill:** `"Tap a roof to fill it with panels"` → `Place panels here?` sheet with
`Separate` / `Grouped`, `Full row`, `Rows deep`, `Panels wide`, `Whole roof`, or
**`Capacity in kWp`** (fill until you hit a kWp target; refuses with *"That capacity is smaller
than one table"*). Also `Clear panels` → `Clear roof` / `Clear everything ({{count}})`.

**Selection:** `Select panels` · `Select panels by box` · shape **Box** or **Lasso** ·
mode **Tables** or **Panels** · `Drag a box over panels to add them` / `…to remove them` ·
`{{count}} selected` · `Delete selected panels` · `Clear selection`.

**TABLE editing (what the owner liked):**
- `Add Row` / `Add Column` / **`Expand Table`**, with `Direction`: Top / Bottom / Left / Right,
  and `Panels in Row` / `Panels in Column`, shown as `Add Row ({{num}})`.
- `Delete Options` sheet → `Delete Rows` ("Select rows to remove"), `Delete Columns`,
  `Delete Panel Mode` ("Tap panels to delete them one by one"), `Delete Entire Table`.
- Row/column deletion is a *marking* mode: `Tap rows to mark for deletion`,
  `{{count}} rows selected ({{panels}} panels)`, `Delete {{count}} Rows`.
- `Move Table`, `Duplicate Table`, `Delete All Selected Tables`.
- Readout chips: `{{num}} panels`, `{{num}} tables`.

**Table Settings sheet** (multi-table aware — `"-" indicates mixed values. Adjust to set all
tables to the same value.`): `Front Leg Height`, `Front edge clearance`, `Back leg`,
`Panel Tilt` (`0° (follows roof slope)` + *"Flush-mount panels follow the roof slope angle"*),
`Row Gap (N-S)`, `Column Gap (E-W)`, `Rail Spacing`, `Leg Spacing`, `Monorail Settings`,
`Standoff Height`, `Rails / Panel`.

**Structure Profile** picker with `Mixed profiles` / `Tap to set all tables`.

**Azimuth sheet:** `({{count}} tables)`, `Mixed values - drag slider to set all tables to same
azimuth`, **`Align to edge:`**, `Rotate:`, and a scope switch **`Each table` / `Whole group`**.

**Stringing, in this step:**
- `Stringing Mode` → **`Auto String`** (*"Automatically group panels into optimised strings"*)
  or **`Manual String`** (*"Tap panels one by one to build custom strings"*).
- While stringing: `INV {{num}}`, `MPPT {{channel}}/{{count}}`,
  `{{min}}–{{max}} per string`, `{{count}} strings`, `{{count}} unassigned`,
  `Undo last panel`, `Clear All`, `Done String`.
- Switching back to auto warns it will replace your manual strings.
- `String Connections` viewer: `String {{num}}`, `INV {{inv}} · MPPT {{mppt}}`.
- Canvas toggles: `Show Strings` / `Hide Strings`, legend `Manual:` / `Strings:`.

**Shading in this step:**
- `Show panel shading` / `Show Solar Access`, with a real progress model:
  `Calculating solar access…`, `{{count}} panels`, `~{{count}} min left`,
  `Under a minute left`, `Preparing…`.
- **Staleness is enforced:** `"Design changed — shading is out of date"` + `Recalculate`.
- **`Remove shaded panels`** tool: a threshold slider — `Remove panels below {{value}}%
  sunlight` → `{{count}} of {{total}} panels`, `{{count}} panels have no reading yet and will
  be kept`, `Out of date — tap Recalculate`, then a confirm showing
  `"{{kw}} kW will be removed from the design. You can undo this."`, a breakdown
  `By roof: {{list}}`, and `"{{count}} of them are outside the current view — scroll or zoom
  out to see them."`

**Rooftop safety / BOS objects drawn on the roof:**
- **Walkway** (custom width, duplicate, delete)
- **Safety Rail**
- **Lifeline** — with `Ends` / `Interval` anchors, `Spacing`, `Min {{value}}m`
- **Lightning Arrester** — `On Parapet` / `On Roof`
- All three use a shared corner-drawing tool (`Tap to place corners`, `Close loop`,
  `{{count}} corners`, `Undo last corner`).
- **Overlap resolver:** `Panels under this walkway` → `Keep clear {{value}} mm around it` →
  `Remove {{count}} panels underneath`, with undo. Same for safety rail and lifeline.

**Ground-mount sub-mode (in this step):** `Zones` with `+ Add`, `Fill Tables` /
`Refill Tables`, `Fill Entire Land` vs `Draw Zones` (*"Different configs per zone area"*),
per-zone summary `GCR {{gcr}} · {{tilt}}° · {{panels}} panels`, **Earthing** path drawing
(`Tap points to draw earthing path. Double-tap to finish.`, `Path {{num}} — {{length}}m ·
{{pits}} pits`, `Pit spacing:`, `{{length}}m strip · {{pits}} pits`, drag vertices to reshape),
**LA masts at 8 m**, and free `Annotations` (rectangle / circle / polygon, named e.g.
"Meter Box, Road, Transformer", fill None / Hatched).
Ground-mount table config: `Panels High`, `Panels Wide`, Portrait/Landscape, Tilt, Azimuth
(`180° = South`), `Ground Clearance`, `Row Pitch`, and a live **GCR** readout graded
`Optimal (0.35–0.50)` / `Low density` / `High density, more shading`, plus `Shading Loss` and
`Limit Angle`.

**Other step-5 controls:** `Undo` / `Redo` · `Show/Hide labels` · `Show/Hide Measurements` ·
`Flip direction` · **`Edge setback: ON — Draw Area keeps clear of the setback band`** vs OFF ·
`Edit Inverter Position` · `Choose inverter` / `Edit inverter` · `3D Preview` ·
`More Settings`.

**3D Preview panel (reachable from here and from the shared view):**
`Toggle solar access view` · `Energy Report` · **`Switch to realistic models` /
`Switch to plain models`** · `Share 3D view` (copy link) · `Export 3D model (.glb)` ·
`Hide/Show satellite overlay` · **`Hide/Show external buildings`** · `Hide/Show annotations` ·
`Hide/Show sun path` · **`Show/Hide mounting frame`** · pan/rotate mode.

**GLB export dialog:** per-category toggles — `Solar Panels` ("Panel tables, frames,
structures"), `Roofs` ("Building walls and surfaces"), `Obstructions` ("Water tanks, trees,
buildings"), `Satellite Overlay` ("Ground and roof imagery") — plus **`Texture Quality`** and
a copyable share link.

**Energy Report sheet (opened from step 5):** System Summary (capacity, panels, roof area),
`Annual Generation` (Year 1), `Specific Yield`, `Performance Ratio`, `Monthly Generation`
(with a `Regular` / `Monsoon` split on the chart), **`Losses Breakdown`** with seven named
losses — Shading, Temperature, Soiling, Inverter, DC Wiring, Mismatch, AC Wiring —
a **loss editor** (`Edit losses`, per-loss `reset`, `Reset to defaults`, `Custom`) with two
locked entries: *"Calculated from the site temperature and the shadow analysis — these two
cannot be edited"*, and a guard *"These losses add up to more than 100%. This design would
generate nothing."* · `Total System Loss` · `Solar Access` ("Average unshaded access across all
panels") · `25-Year Projection` with `Lifetime Generation` and `Year 25 Output
({{percent}}% of Year 1)` · then `Customize Proposal` or **`Quick Generate`**.

---

### Step 6 · BOM

No i18n namespace — the BOM screen's copy is hardcoded [inferred: it is a lazily-loaded chunk
or server-rendered]. What is visible from the main bundle: it has its own error boundary
labelled `Bill of Materials` with *"Your design is safe — nothing here has changed it. You can
try again, or carry on without the bill and come back later"* and a **`Skip this step`** button
that jumps to `/wizard/7`. Export from the shell: **`Download Excel BOM`**.
→ This is the one area a logged-in walkthrough is still needed for.

---

### Step 7 · Proposal

The proposal is built from **captured 3D renders**, not a static template:
`Tap to capture` · `Cover Image` · **`Shadow Analysis`** with
`Shadow captures: {{captured}}/{{total}}` · `Capture All` · `Retake` ·
`"This area will be captured"` · `Orbit to adjust angle`.
Before capturing you can toggle `Solar access`, `Satellite on roofs`, `Nearby buildings`,
`Realistic models`, and pan/rotate.
Then `Generate Proposal` → `Calculating energy...` → `Generating PDF...` → `Uploading PDF...` →
`Generating share link...` → `Proposal Generated` with `View PDF` and `Edit Photos`.

Export & share menu: `Download PDF Report`, `Download Excel BOM`, **`Share via WhatsApp`**,
`Copy 3D View Link`.

---

### Step 8 · SLD

`Single Line Diagram`, subtitle **`Required for DISCOM approval`**. Skippable.
Needs strings: *"Run auto-stringing in Manual Edit to draw the SLD, or skip this step."*

**Editable parameters, grouped DC / AC / HT:**
- Per inverter: name/model and AC rating — with an honest scope note:
  *"Edits the inverter name & kW rating shown on this SLD only — does not change the project,
  BOM, or simulation."*
- DC: `Cable Size (mm²)` with `Isc = {{value}}A` shown, `Fuse Rating (A)` with `Min: {{value}}A`,
  `SPD Type`, `Isolator (A)`.
- AC: `Cable Type`, `Cable Size`, `MCB Rating (A)`, `MCCB Rating (A)`, `AC: {{value}}A`,
  `Isolator Rating (A)`.
- HT: `Transformer (kVA)`, `Voltage Ratio`, `VCB Rating (A)`, `HT Cable (mm²)`, `CT Ratio`,
  `PT Ratio`.
- `Grid & Standards`: `Grid Voltage (V)`, `Frequency (Hz)`, `Wiring / Installation Code`,
  `Earthing Code` — *"Defaults from the project country — edit for this SLD only."*
- `Earthing`: `Earth Pits` count with the code quoted — **`IS 3043: min 2 (≤3kW), 3 (>3kW)`**.
- `Lightning Arrestor`, free `Notes`, and `Reset to calculated values`.

Templates by phase: `Template {{type}} • {{phase}}` (1-Phase / 3-Phase).
**Export: `DXF (AutoCAD)`, `PDF ({{size}})`, `PNG`**, plus `Share`.
Viewer: `NTS · {{sheet}} Landscape · Pinch/Scroll=Zoom · Drag=Pan · DblTap=Fit`.

---

### Step 9 · Layout Drawings

Three real drawing sheets, generated from the design:
1. **`PV Array Layout`**
2. **`Earthing & LA`**
3. **`DC String Route`**

Each is an A1 sheet with a **title block** (company name, designer name, drawing title, project
name, client name, plant capacity, site address, coordinates, total panels, module model,
inverter model, date, revision, sheet number), a `Project Info Table`, a
`System Configuration Table`, a **`Typical Table Arrangement`** detail (tilt angle, ground
clearance, front leg height, standoff height MS), a **`Typical Earthing Detail`** (strip spec,
pit dimension, `Pit Layer {{number}}`), `Cable Specifications`, and editable `+ Add Note`.

Export per sheet: `DXF (AutoCAD)`, `PDF (A1)`, `PNG (High-Res)`, and
**`All Sheets (PDF)`**. Viewer shows `Scale {{scale}} · A1 · Scroll=Zoom · Drag=Pan ·
DblClick=Fit`.

Guards: `"Add earthing paths and lightning arrestors in Step 5 (Manual Edit) to generate this
drawing."`, `"Run auto-stringing in Step 5 (Manual Edit) to generate the DC string cable route
drawing."`

---

### Step 10 · Final

Save, generate PDF, `Done & Return to Proposal` — the design tool hands back to the separate
Proposals product.

---

## Shared / public 3D view (`/share/:shareId`)

A client-facing 3D viewer with: solar access toggle, **Energy Report**, switch 3D ↔ top view,
satellite overlay on/off, external buildings on/off, **sun path on/off**, share, and
`Export 3D model (.glb)`. Links can expire or be revoked
(`"This design link has expired or been revoked."`).

---

## How their 3D actually works (read from code, [inferred] where noted)

- **Real GLB props, preloaded**, served from `/design/models/`:
  `tree.gltf`, `water_tank.glb`, `chimney.glb`, `street_light.glb`, `fence.glb`, `LA.glb`,
  `solar_water_heater.glb`, `ladder.glb`, `inverter.glb`, `cars.glb` (cars — for the carport).
  This is the entire mechanism behind `Switch to realistic models`. Plain mode = primitive boxes.
- **Lighting is simple:** one directional sun light positioned from a real solar-position
  routine, intensity ramped from altitude (`1 + alt/45`, clamped 0.5–2), dropping to 0.2 below
  the horizon. Shadow camera is fitted to the scene bounds every frame-change
  (`frustumHalfSize`, `lightDistance`, `shadowFar`) with **`shadowMapSize: 2048`**.
- **Materials are `meshStandardMaterial`** with hand-tuned roughness/metalness — panel frame
  `roughness .55 / metalness .25`, glass `roughness .12 / metalness .55`. `MeshPhysicalMaterial`,
  `clearcoat`, `transmission` and `anisotropy` exist in the three vendor chunk but no evidence
  they are used for panels.
- **No tone mapping, no env map / IBL, no PMREM, no post-processing stack** found in the app
  bundle (only `SMAA` and `Sky` appear as vendor symbols). Their realism comes from *props +
  satellite texture*, not from a physically-based lighting pipeline.
- They instrument the scene hard: GPU name, dpr, fps, worst frame gap, draw calls, triangles,
  texture count, plus WebGL context-loss recovery.

---

## Things the bundle proves they DON'T have (absence of any string)

No battery / storage. No EV charger or heat pump. No optimiser or micro-inverter modelling
(only string vs central). No bifacial. No tracker. No LIDAR or photogrammetry import. No
AI roof detection and no AI obstruction detection (every obstruction is hand-placed).
No P50/P75/P90. No sub-module / cell-string shading. No horizon profile import. No IRR / payback
inside the design tool (financials live in the separate Proposals product). No CAD import beyond
DXF-as-tracing-underlay. No teams/roles inside the design tool beyond the employee filter.

---

## Step 6 · BOM — full detail (recovered from the bundle after all)

The BOM screen is NOT translated (no i18n namespace) but its engine IS in the main bundle.

**10 categories, in this order:** `mms` (Mounting Structures MMS) · `pv-modules` ·
`inverters` · `electrical-dc` (Electrical — DC) · `electrical-ac` (Electrical — AC) ·
`protection` · `civil` · `monitoring` · `misc` · `services`.

**39 auto-derived line items:**

| Category | Items |
|---|---|
| MMS | MMS — RCC Flat (Tilted Tables) · MMS — Metal Shed (monorail) · Module Clamps (Mid + End) · Bracing & Splice Plates · Fasteners — M8 (Module Clamping) · Fasteners — M12 (Leg ↔ Rafter) · Fasteners — M10 (Rafter ↔ Purlin) |
| PV modules | Solar PV Modules · Module Cleaning Kit |
| Inverters | Grid-Connected Solar Inverter · DC Combiner / SMB Box · Inverter Mounting Kit · Inverter Shed |
| Electrical — DC | DC Cables · DC Connectors (MC4) · DCDB (DC Distribution Box) · DC Cable Glands & Lugs |
| Electrical — AC | AC Cables · AC Distribution Board (ACDB / LT Panel) · Isolators / MCBs / Breakers (itemised) · AC Cable Glands & Lugs |
| Protection | Earthing System (Complete Set) · Lightning Arrestor · Fire Safety Kit · Module Grounding Clips / Earthing Lugs · Warning / Danger Signage · Conduits, Cable Trays & Accessories |
| Civil | Concrete + Chemical Anchor · Waterproofing Treatment · Parapet Sealing / Grouting · Miscellaneous Civil Works · Scaffolding |
| Monitoring | Energy Meters (Net + Solar Generation) · Weather Monitoring Station · SCADA / Remote Monitoring |
| Misc | Spares Kit · Cable Ties, Labels & Ferrules · Anti-Theft Fasteners |
| Services | Installation, Testing & Commissioning · Operations & Maintenance |

**Every line item carries:** `itemName`, `brand`, `specification`, `quantity`, `unit`,
`wastagePct`, `ratePerUnit`, `gstPct`, `supplier`, `notes`, `includeInBOM` (a per-line
on/off), `userEditedFields[]`, and a `meta` block.

**Two mechanisms worth stealing:**

1. **`userEditedFields`** — the recompute pass walks
   `["itemName","brand","specification","quantity","unit","wastagePct","gstPct"]` and skips any
   field the user has touched. So auto quantities keep updating while your typed rate,
   supplier and notes survive. The UI shows a per-field `hasAutoRefresh` badge with an
   `onRefresh` button to re-take the computed value.
2. **`…AtBurn` staleness stamps** — each item records the design state it was costed against
   (`stringsAtBurn`, `inverterCountAtBurn`, `totalCableLengthAtBurn`, `kwpAtBurn`,
   `panelCountAtBurn`, `totalStringsAtBurn`). A dirty-check compares them to the live design
   and flags exactly which lines are stale. Plus `dismissedBanners` so a warning stays dismissed.

**Specifications are written to code, with standards cited:**
- DC cable: `"Solar DC Cable {n} mm² · TUV Rheinland certified · UV-resistant · −40 to +90 °C · 1000V DC"`
- AC cable: `"{cores}-Core AC Cable {n} mm² · XLPE / PVC insulated · armoured · 230 V|415 V · IS 7098"`
- MC4: `"MC4-compatible male + female pairs · IP67 when mated · 30 A rated · 1000/1500 V · UV-stabilised housing"`
- DCDB: `"IP65 enclosure · DC MCB + Type-2 SPD + DC isolator · 1000V DC · IEC-61439-1 compliant"`
- ACDB: `"IP54 enclosure · MCB + Type-2 SPD + AC isolator · 230 V single-phase|415 V three-phase · IEC-61439-1 compliant"`
- Module grounding: `"bonds aluminium module frame to MMS · UL 467 / IS 3043"`
- Glands & lugs: `"1 set covers ~10 m of DC cable"` (quantity = ceil(length/10))
- Conduits: `"Conduits, cable trays, fasteners, tray covers and accessories — typed quantity & rate per project"`

**Sizing rules are hard-coded and readable:**
- DC cable mm² by kWp: ≤10 → 4 · ≤50 → 6 · else 10. Length = strings × 2 × run, wastage 8 %.
- AC cable mm² — 1-phase: ≤5 kW → 4 · ≤8 → 6 · else 10. 3-phase: ≤15 → 10 · ≤30 → 16 ·
  ≤60 → 25 · ≤120 → 35 · else 50. Cores: 3 (1-ph) / 4 (3-ph). Wastage 8 %.
- MC4 pairs = ceil(strings × 2 × 1.1), wastage 3 %.
- SCB / combiner count = max(2, ceil(strings / 20)).
- MMS defaults (`mmsConfig`): `endBufferM 0.2`, `rafterQtyMultiplier 1`,
  `purlinQtyPerTable 2`, `bracingEnabled false`, `bracingPct 5`, `wastagePct 4`.

**"Smart answers"** — the two things the app cannot derive, it asks for once and reuses:
`dcCableRunM` and `acCableRunM`.

**Excel export columns (12):** `Item · Make · Specification · Qty · Unit · Waste % · Order Qty ·
Rate (₹) · Amount (₹) · GST % · GST (₹) · Total (₹)`, under a header block with project name,
customer and capacity. GST defaults to 5 % on every line.

**Compliance flag:** `compliance.subsidyOptOut`.

**Structure member kinds modelled:** `rafter`, `purlin`, `rail`, plus profiles `mms-rcc`
and `mms-monorail`.

**SLD symbol kinds modelled:** `inv`, `mcb`, `spd`, `mfm` (multi-function meter), `iso`,
`meter`, `bus`, `earth`.

**Manipulation handle kinds in the 2D editors:** `center`, `rim`, `corner`, `edge`, `edit`,
`move`, `copy`, `delete`, `align`, `spacing`, `array`, `obs-circle`, `obs-edge`, `obs-corner`,
`cardinal` — i.e. **the contextual action buttons ride on the object itself**, which is the
"hover cards on the design" the owner liked.

**Other bundle chunks (lazy-loaded):** `Scene3D-DhrPOV20.js`,
`solarAccessWorker-Bja0y9sw.js` (shading runs in a Web Worker),
`ReplayPlayerPage-*.js` + `replayFrames-*.js` + `replayBoot-*.js` (session replay).

---

## YouTube channel — @ReslinkEnergy (143 subscribers, 14 videos)

In-app tutorial: only **one** video is wired into the product (Step 0, in 4 languages —
en `vaO5sSTyWzc`, hi `B9nYKJgQFHE`, th `L9M5gzpKRBM`, vi `RskKyuXvvIM`), played in a
`youtube-nocookie.com` iframe with a language picker. Every other step's "Help" points at the
channel. **Note:** YouTube's caption API refused the transcript fetch and the on-page
transcript panel would not render in this browser, so the notes below come from video
titles and the authors' own descriptions, not from spoken transcripts.

11 videos recovered. Claims made, grouped:

**Positioning:** *"India's First Mobile-First 3D Solar Design & Proposal Software"* —
they cite 50,000+ Indian installers running the business on phones, and claim design →
shadow analysis → energy simulation → SLD → interactive proposal **"in under 60 seconds"**
from a phone. Built by IIT Delhi engineers. Contact +91-9560523752, team@reslink.org.
AI-powered automation named in the description: automatic panel placement, auto stringing,
structure BOQ generation, procurement-ready bill of materials.

**RCC rooftop** (`uD4_kmZ5MKE`, 1:54) — parapet walls, tanks, rooms, staircases, shadow zones,
module placement, then **PV layout + array layout + string layout + engineering drawings**.

**RCC + tin shed in one project** (`vaO5sSTyWzc`, 2:19) — mixed roof heights and slopes in a
single 3D layout; parapet walls, tanks, rooms, chimneys, **turbines**; mono rails, mounting
rails and walkways on the tin shed; roof height / tilt / standoff adjustment;
**mirror roof sections to avoid redrawing**; shadow analysis across both roof kinds.

**Metal tin shed** (`XE5f9RwPgso`) — multiple slopes, height variations, chimneys, turbines,
walkways, mounting-rail requirements; mirror-to-a-selected-side; shadow analysis around
chimneys and turbines.

**Tin shed, C&I framing** (`12LnxqQpn-I`) — tilt angle, standoff height, mono rails;
shadow analysis around turbines and chimneys; "engineering-grade … directly from your phone".

**Complex / elevated rooftops** (`UnpHcL-MHSA`) — water tanks, parapet walls, elevated
structures, sloped surfaces; **on-site revisions**; automatic stringing and energy simulation;
proposal generated during the site visit.

**BOM automation** (`68aKNtnjkdM`) — the pitch is explicitly against manual BOM: mounting
structures, clamps, rafters, purlins, rails, AC/DC cable lengths, MC4 connectors, DCDB, ACDB,
lightning arresters, earthing wires and *"50+ other components"*. Generates **both electrical
BOM and structure BOM**, "procurement-ready", for rooftop, tin-shed, high-rise and ground-mount.

**Sun path** (`6c-9BPRZY8k`) — *"Real-Time Sun Path Simulation"*, framed as a **sales** tool,
not an engineering one: *"Traditional solar access maps are not easy for customers to
understand… built for engineers, not buyers."* Show the customer shadow movement across the
roof and the generation impact, live, to close faster.

**Ground mount** (`Ou-57dyodTI`) — "1 GW" utility-scale, layouts on complex land contours,
"AI-powered planning", BOQs and SLDs.

**OPEX / PPA** (`OMXhWiapA_k`) — generate PPA proposals in minutes, adjust **contract tenure
and tariff escalation** live, automatic ROI, present in the customer meeting.

**Proposal automation** (`wsQhHn_eCJE`) — "high quality solar proposals in 30 seconds".

**Read on the marketing:** every video sells the same three things — *it runs on a phone*,
*it produces engineering drawings an EPC can hand over*, and *it closes the customer in the
meeting*. Not one video sells simulation accuracy.
