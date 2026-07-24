# Phase 10 — The Design Studio  🔻 LAST (D23)  ▸ 11 screens

**This studio already exists and works in code.** Real satellite imagery, AI roof detection,
PVGIS energy, shading simulation, auto-layout, structural material modelling, string sizing,
SLD, and a bill of materials. **We are redesigning the UX — not the engine.** Keep **every
tool and every computed output**; make it **simple and touch-first** instead of a desktop CAD
tool with tiny handles, hover tooltips and keyboard shortcuts.

**The source of truth is the CODEBASE**, `src/features/solar-studio/`. This file is the
distilled inventory; if a tool here seems minor, it still ships — do not drop it.

Reference: `product-journey.md` Stage 5; decisions **D23** (studio last), **D30** (survey feeds
it), **D35** (survey photos are reference). Worklist/gate: `build-plan.md`.

---

## ⚠️ HOW TO USE THESE PROMPTS

Each block is **SELF-CONTAINED** — copy one, paste, done. Prose outside blocks is for you.
Baked into every block:
- No colours/hex/token names — the design system carries the look.
- One page per screen; states swapped by a header chip (not separate static frames).
- A working prototype — actions wired, sheets open/close, no dead ends.
- **Connect, don't duplicate** — wire into screens that already exist; never a second copy.

---

## 🎯 THE REDESIGN BRIEF — simple, touch-first, nothing lost

The current studio is powerful but desktop-only. Every redesign must:
- **Preserve every tool** listed under a screen. If there are 30 tools, all 30 survive —
  reorganised, not removed.
- **Mode-based canvas, not modifier keys.** On a phone, one finger pans/pinches; a tool is
  *chosen* first (Select / Draw / Panels / Measure…), then the canvas obeys that mode. Replace
  Shift/Ctrl/right-click/middle-drag with on-screen mode buttons and tap-then-act.
- **Touch gestures the code lacks:** the 2D canvas currently has no pinch-zoom / two-finger
  pan — add them. The 3D view already has touch orbit/pinch.
- **Visible labels, not hover.** Every hover tooltip and keyboard shortcut becomes a visible
  label, an on-screen control, or a tap-to-reveal hint. Keep shortcuts as a *desktop* bonus.
- **Big targets, tap-to-select-then-edit.** Replace ~9px drag handles with: tap an object to
  select → large handles / a sheet appear. Precise nudge via +/− steppers, not fine drags.
- **Progressive disclosure.** Advanced settings live in sheets. The BOM's ~286 controls become
  a card list + edit sheet, never a wide table on mobile.
- **Honesty is not optional** (it's the product's whole point) — carry every provenance label:
  *measured / derived / estimated / assumed*; PVGIS vs built-in estimate; and **structure is
  material modelling only, never a safety verdict — engineer sign-off is a human**.

**Two viewports every screen:** MOBILE 375px is the hard case and must fully work (a designer
may be on a tablet on site); DESKTOP 1440px keeps the richer canvas + side panels. The editor
steps are dark canvas; the form steps are light.

---

## 🔑 FACTS TO GET RIGHT (the code corrects common assumptions)

- **Energy = PVGIS** (annual + monthly generation, specific yield, performance ratio, POA,
  loss breakdown, 25-yr, degradation). Falls back to a built-in latitude estimate. The figure
  is **labelled PVGIS or estimate** — carry that label.
- **Google Solar API is a separate ENHANCEMENT, never a dependency** — Building Insights (max
  panels, roof area, sunshine h/yr, per-face pitch/azimuth suggestions, imagery date + quality).
  India coverage is partial, so it has loading / unavailable / unreachable / ok states.
- **AI roof detection** = geometric (Google dataLayers DSM + mask → outline, pitch, azimuth,
  eave height, obstructions, confidence from plane-fit RMSE) with a **Gemini photo fallback**
  (polygons + obstructions, but it *cannot* measure height/pitch). Both reviewed as **ghosts**
  before entering the design.
- **Electrical has a hard gate:** an invalid string design blocks "Next" in the layout step.
- **Design Health** (0–100, energy / electrical / roof-utilisation) rides in the shell header.

---

## 🔗 THE STUDIO WIRES INTO EVERY BUILT PHASE — flag, don't rebuild

| Built | Connection |
|---|---|
| **Lead detail (Phase 2)** | The studio is entered from the lead's **"Create design"**. A lead can hold several **design variants**. |
| **Survey (Phase 5)** | A remote/physical survey pre-fills Step 1 (location, tariff) and Step 2 (AI-detected roof), and its **photos (D35) are reference** in the roof + layout canvas. |
| **Catalog & price book (Phase 8)** | The component pickers (Step 4) and the BOM rates (Step 9) come from the tenant catalog/price book. |
| **Proposal builder (Phase 3)** | The design's energy, savings and **BOM feed Path A** — "derived from a real shading simulation". Shared money path; numbers can't disagree. |
| **Customer link (Phase 4)** | The proposal captures + the 3D **share view** are what the customer opens ("view in 3D"). |
| **Engineer role (Phase 8) + design-returned notification (Phase 9)** | The engineer sign-off queue / return flow lives here. |
| **InstallationSheet (Phase 7)** | The install plan reuses the existing InstallationSheet — do not rebuild. |

---

## ⤴ GO BACK AND WIRE THESE ALREADY-BUILT SCREENS — only if the connection is missing

Building the studio makes a few **already-built screens** need a small connecting change. For
each item below: **open that existing screen, and add ONLY the named connection if it isn't
already there. If the built screen already does it, leave it exactly as it is. Never redesign a
built screen** — this is a wiring pass, not a rebuild. Paste this instruction with the relevant
prompt, or run it as a short follow-up on each screen.

```
For the existing screen named below, check whether it already does the
connection described. If it does, change NOTHING. If it does not, add only
that one connection — do not restyle or restructure the screen.
```

| Built screen | The connection to add *(only if missing)* |
|---|---|
| **Lead detail (Phase 2)** | "Create design" opens the studio (10.1); the lead shows its **design variants** list (size / generation / price / payback, one "recommended"). |
| **Proposal builder — Path A "From a design" (Phase 3)** | Pre-fills from THIS studio design: capacity, PVGIS generation & savings, components from the BOM, and the roof/3D image from the captures. The BOM uses the **same money path** — numbers must match. |
| **Proposal preview + BOM detail (Phase 3.5 / 3.6)** | The "include the SLD / technical page" toggle and the BOM detail come from the studio's SLD + BOM. |
| **Customer link — State A "your roof" (Phase 4)** | "View in 3D" opens the studio's **read-only 3D share** view. |
| **Notifications centre (Phase 9.4)** | The "design returned by engineer" notification (a placeholder until now) points at the engineer sign-off / the returned design (10.11). |
| **Survey hand-off (Phase 5.9)** | "Submit → designer notified" leads into starting a design in the studio, pre-filled from the survey + its photos. |

Everything else the studio touches (the catalog/price book it reads, the InstallationSheet it
reuses) needs **no change** to the existing screen — the studio reads/reuses them.

---

## The screens, in order (mirrors the real wizard)

```
  10.1   Studio shell + design list + Design Health   (the frame)
  10.2   Step 1 · Project setup & location            (+ PVGIS data, Google Site Intelligence)
  10.3   Step 2 · Roof setup                          (AI detect + trace/edit, touch-first CAD)
  10.4   Step 3 · Obstructions
  10.5   Step 4 · Components                           (panel · capacity · inverter · compare)
  10.6   Steps 5–6 · Panel layout                     (auto-fill + the manual editor + structure)
  10.7   The 3D view                                  (camera · sun/shadow · layers · edit · energy)
  10.8   Step 7 · Proposal captures & readiness
  10.9   Step 8 · SLD & drawings
  10.10  Step 9 · BOM & pricing                        (the ~286-control screen, made simple)
  10.11  Step 10 · Done + engineer sign-off
```

---

# 10.1 · Studio shell + design list + Design Health

```
Design the DESIGN STUDIO SHELL, the per-lead DESIGN LIST, and the DESIGN
HEALTH system. Use the selected design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: wire into what already exists;
never a second copy. Claude Design tends to add pages — connect first.

WHO: a designer (or a rep) building a solar design for a lead.
GOAL: enter the studio from a lead, move through the steps without losing
your place, and always see how healthy the design is.

ENTRY & DESIGN LIST (connects to the built lead detail, Phase 2):
- The studio opens from the lead's "Create design" action.
- A lead can hold SEVERAL design variants — show a design list for the
  lead: each variant with size, generation, price, payback; mark one
  "recommended". New design / duplicate / open.

THE STEP SHELL (redesign the existing 10-step wizard):
- Steps: 1 Project setup · 2 Roof · 3 Obstructions · 4 Components ·
  5 Panel placement (auto — no page of its own) · 6 Manual edit ·
  7 Proposal · 8 SLD & drawings · 9 BOM & pricing · 10 Final.
- A compact step indicator (mobile: "3 / 10 · Roof ‹ ›" that opens a step
  list sheet; desktop: a step rail). Steps show state: not started / in
  progress / done / has errors.
- Header holds: back, step title, the DESIGN HEALTH chip, a units toggle
  (m / ft — global), Save, Save & exit to the lead, Help (per-step, plain
  language — fold the old keyboard-shortcut cheats into visible on-screen
  help), Next / Done.
- "Next" is GATED per step and the reason is shown plainly (e.g. "Draw at
  least one roof", "Fix the string design before continuing"). Keep the
  hard electrical gate on the layout step.

DESIGN HEALTH (keep this — it rides in the header on every step):
- A score /100 with a band (Good / Fair / Poor) across three categories:
  energy, electrical, roof-utilisation. Tapping it opens a health sheet
  with per-category scores, the specific deductions ("−8 · off-south
  orientation"), and a "what changed since last save" delta.
- A provisional state while shading recalculates (shown honestly).

STATES — one frame pair, switch via header chip:
- the design list for a lead (empty / with variants)
- the shell mid-flow (step 3), health = Good
- the step-list sheet open
- a Next-blocked toast
- the health sheet open, with deductions + a "what changed" delta
- health provisional (recalculating)

WIRE THESE:
- lead "Create design" → the design list → a variant → the shell at step 1
- step indicator → the step list; Next/Back move steps
- Save & exit → back to the lead (the design saved on it)
- health chip → health sheet

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows.

VIEWPORTS: build BOTH — MOBILE 375px (the shell must fully work; compact
step indicator, health visible) and DESKTOP 1440px (step rail, more header
room). Place them SIDE BY SIDE on ONE HORIZONTAL ROW — mobile on the LEFT,
desktop on the RIGHT, aligned to the same top edge. Do NOT stack them
vertically and do not put one below the other.
```

---

# 10.2 · Step 1 · Project setup & location

```
Design STEP 1 — PROJECT SETUP & LOCATION. Use the selected design system;
no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: wire into what already exists;
never a second copy.

WHO: the designer, starting a design (often pre-filled from a survey).
GOAL: confirm who/where, the jurisdiction and tariff, and pin the exact
building — which drives the solar data.

PRE-FILL FROM SURVEY (Phase 5): if a remote survey was done, the address,
location and site details are already here — show them as carried over,
editable. Don't make the designer re-enter what the survey captured.

FIELDS:
- Project name · customer name · customer phone
- Country (India) · State · DISCOM (sets the default tariff)
- Site type (Residential / Commercial) · Connection (Single / Three phase)
- Sanctioned load (kW) · Electricity tariff (₹/kWh, auto-filled, editable)
- Average monthly bill (₹) — feeds the Step-4 size suggestion
- Company logo upload (max 5 MB, PNG/JPG)
- Ground-mount / open-access project — a normal option (no PRO/tier gate,
  D38); if not yet functional, mark it "coming soon", not "upgrade"

LOCATION:
- Choose method: search address (autocomplete) OR enter coordinates.
- A satellite map. In code the pin is FIXED and you drag the MAP under it —
  on touch this is confusing; redesign so placing the pin is obvious
  (a draggable pin or "tap to drop", your call), still landing on the exact
  roof. Keep zoom.
- "Confirm location" → then show the SOLAR DATA card: irradiance
  (kWh/m²/day), peak sun hours, and the data SOURCE label (this becomes
  PVGIS-measured once fetched — carry the provenance).
- SITE INTELLIGENCE (Google Solar Building Insights) — an async enhancement
  with four honest states: loading ("checking Google Solar coverage"),
  unavailable ("no coverage — manual design mode"), unreachable, or ok. The
  ok state shows: max panels (~kWp), roof area, sunshine h/yr, roof faces,
  imagery date + quality (HIGH/MED/BASE).
- ⚠️ Relocating the pin >25 m WIPES the whole design (roofs, panels, etc.).
  Keep this guard but make it a clear, undoable confirmation, not a silent
  reset.

STATES — one frame pair, switch via header chip:
- fresh (pre-filled from a survey vs blank)
- location being pinned
- confirmed → solar data + Site Intelligence (ok)
- Site Intelligence unavailable (manual mode)
- the relocation-wipes-design confirm

WIRE THESE:
- "Confirm location" → fetches solar data + Site Intelligence
- survey data (Phase 5) pre-fills these fields
- Next → Step 2 (roof)

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows.

VIEWPORTS: build BOTH — MOBILE 375px (a clean form and a good-sized map,
actions in reach) and DESKTOP 1440px. Place them SIDE BY SIDE on ONE
HORIZONTAL ROW — mobile on the LEFT, desktop on the RIGHT, aligned to the
same top edge. Do NOT stack them vertically and do not put one below the
other.
```

---

# 10.3 · Step 2 · Roof setup (AI detect + touch-first tracing/editing)

```
Design STEP 2 — ROOF SETUP, the roof editor. This is a CAD tool in code;
redesign it TOUCH-FIRST and simple while keeping every tool. Use the design
system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: wire into what already exists.

WHO: the designer, tracing each roof surface on satellite imagery (or
accepting AI-detected roofs), then setting each roof's shape and properties.
GOAL: accurate roof outlines, types, pitch, azimuth and setbacks — the base
everything else is built on.

THE MODE-BASED TOOLBAR (replace keyboard shortcuts with visible tools):
- Select · Draw roof · Detect roofs (AI) · Ortho-snap toggle · Show all
  measurements · Measure distance · View in 3D · Undo · Redo.
- AI DETECT runs the real pipeline: geometric (Google dataLayers → outline,
  pitch, azimuth, eave height, obstructions, with a confidence per shape)
  then a Gemini photo fallback (shapes only, no height/pitch). Results
  appear as GHOSTS to accept/reject before they enter the design — keep the
  ghost review (tap a ghost to include/exclude, an align nudge, "add
  selected", imagery quality/date, dropped-shape warnings).

ROOF LIST: one chip per roof (select · lock · delete, with area).

DRAWING (touch-first): choose Draw, then tap corners; live edge-length
labels; CAD snapping (angle-relative, object-snap to other roofs, alignment
guide rays, right-angle marks) with a visible "snap on/off" rather than a
Shift key; tap near the first point to close; a "complete shape?" confirm;
clear undo/last-point-remove controls. Reject points too close together
with a plain message.

EDITING A ROOF (tap to select, then big handles — not tiny drag targets):
- move a vertex · insert a vertex on an edge · delete a vertex · move the
  whole roof · rotate the whole roof (with a snap-to-15° option as a
  control, not Shift) · tap an edge length to type an exact metre value.
- A per-roof action set: roof type · height & parapet · exact vertex
  coordinates (X/Y) · duplicate.

ROOF TYPE sheet: RCC flat · Metal shed · Tile · Ground array; and where the
footprint allows, Pitched gable (2 faces) or Pitched hip (4 faces) with a
ridge direction. Disabled options explain why inline.

HEIGHT & PARAPET sheet: height-from-ground; a "Google detected N° facing
DIR — apply / dismiss" pitch/azimuth suggestion banner; pitch; a
"slopes toward" picker (tap the low edge to set which way panels face,
with a compass read-out and a "south is best" tip); edge setback (uniform +
per-edge); a parapet-wall toggle → direction, height, width, auto-skip
shared walls, and a per-side "tap a side to add/remove its wall" picker.

CALIBRATION: Measure two points → "know the real distance? calibrate" →
enter the actual metres → applies a scale correction (and an expert north
offset). Keep it; it rescales all geometry.

DEPENDENT-ITEMS guard: if a geometry change orphans downstream items
(panels, obstructions…), keep the "keep current / keep for review / remove
invalid" confirm.

CARRY the roof provenance (manual / AI-detected + confidence).

STATES — one frame pair, switch via header chip:
- empty (no roofs) with a clear "trace or auto-detect" prompt
- drawing a roof
- a roof selected, handles + action set visible
- AI ghost review (accept/reject)
- height & parapet sheet open
- calibration flow
- the dependent-items confirm
- 3D preview open (→ 10.7)

WIRE THESE:
- Detect (AI) → ghost review → adds roofs
- View in 3D → 10.7
- Next → Step 3
- (pre-filled from the survey's detected roof, Phase 5, where present)

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows.

VIEWPORTS: build BOTH — MOBILE 375px (a big canvas, tools within thumb
reach, PINCH-ZOOM and two-finger pan — the original lacks these, add them)
and DESKTOP 1440px. Place them SIDE BY SIDE on ONE HORIZONTAL ROW — mobile
on the LEFT, desktop on the RIGHT, aligned to the same top edge. Do NOT
stack them vertically and do not put one below the other.
```

---

# 10.4 · Step 3 · Obstructions

```
Design STEP 3 — OBSTRUCTIONS of a solar design studio. Use the selected
design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains built
screens and shared navigation. Wherever this prompt refers to a screen,
action or nav that already exists, wire into it and extend it — do not
create a duplicate or a new isolated page.

WHO: a designer marking every rooftop object that blocks or shades panels.
GOAL: place each object, size it, and set how it affects panel placement.

BELOW IS THE COMPLETE LIST OF WHAT THIS STEP CONTAINS — every tool, what
happens when it is used, and every option it reveals. Nothing here is
optional; include all of it. HOW it is laid out on mobile and desktop is
YOUR decision — this prompt describes function, not form.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 · ALWAYS ON SCREEN (the canvas and its context)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· A satellite canvas showing the roofs drawn in Step 2 as a READ-ONLY
  backdrop — they cannot be edited here. Each roof shows its fill and its
  red dashed setback inset (the panel-free border).
· Every placed obstruction, drawn to scale, with a small ID CHIP above it
  (a type code + number, e.g. "WT1", "TR2"). The chip stays the same size
  on screen at any zoom.
· A red dashed SETBACK RING around every object that blocks panel
  placement — this is the area panels may not enter.
· A north indicator and a graphic scale bar.
· Zoom controls: zoom in, zoom out, a live zoom % readout, and "fit view"
  (resets the view to show everything).
· The canvas pans and zooms freely EXCEPT while placing an object or
  mid-drag.
· Undo and redo. One gesture = one undo step (a whole drag undoes at once).
· A units setting (m / ft) applies to every length shown here.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 · THE FIVE TOOLS — and exactly what each does
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. ADD OBSTRUCTION — carries a badge with the current obstruction count.
   Activating it opens the TYPE PICKER (section 3). Stays visibly active
   while placing.
2. SHOW / HIDE OBSTRUCTIONS — hides every placed object so the bare roof
   can be read; toggling it also clears the current selection. Toggle back
   to show them again.
3. SHOW ALL MEASUREMENTS — turns on the length label of every roof edge in
   the backdrop (and rectangular obstruction edges). Toggle off to hide.
4. MEASURE DISTANCE — a ruler. First point sets the anchor, second point
   ends it, and the distance is shown on the line. Starting again clears
   the previous measurement. Turning the tool off clears it.
5. OPEN 3D VIEW — opens the full 3D scene to see these objects and their
   shadows in context, and returns to this step on close.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 · THE TYPE PICKER — what opens after "Add obstruction"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ELEVEN object types. Each shows its own icon, its name, and the default
size it will be created at (length × width × height, metres):
   Tank            WT   2 × 1.5 × 1.2
   Dish            DS   1 × 1 × 1.2
   Chimney         CH   0.8 × 0.8 × 2
   Tree            TR   3 × 3 × 5
   Elevated        EL   3 × 2.5 × 2.6
   Building        BL   8 × 6 × 9
   Solar WH        SW   2 × 1.2 × 1.5
   Ladder          LD   0.6 × 1.5 × 3      ← carries a BETA marker
   Windmill        WM   1.8 × 1.8 × 3.5
   Turbine Vent    TV   0.4 × 0.4 × 0.5
   Other           OB   1.5 × 1.5 × 1

CHOOSING A TYPE closes the picker and enters PLACEMENT MODE:
· A guidance message appears: "Click to place {type} · Esc to cancel".
· The next tap on the canvas drops the object there at its default size.
· The app works out by itself WHICH ROOF the object sits on (or "on
  ground" if it is not over a roof) and records that.
· It is auto-named from its type code plus the next free number (WT1, WT2…).
· Placement mode can be cancelled without placing anything.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 · SELECTING AN OBJECT — what appears
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tapping an object selects it. Tapping empty canvas clears the selection.
A selected object shows BOTH:

(a) DIRECT MANIPULATION on the object itself:
    · MOVE — drag the object body; it keeps the grab point under the
      finger/cursor, and on release the app re-checks which roof it now
      sits on.
    · RESIZE, rectangle objects — four corner handles change length and
      width.
    · RESIZE, circular objects — a single handle changes the diameter.
    · ROTATE — a handle on a short stem above the object spins it. There is
      a 15° snap option; free rotation otherwise.
    · No dimension may go below 0.3 m.
    · A locked object cannot be moved, resized or rotated.

(b) A CONTEXT ACTION SET for that object, labelled with its type and ID,
    containing exactly these seven actions:
    1. DUPLICATE — makes a copy offset slightly from the original and
       works out which roof the copy lands on.
    2. SHAPE — opens the Shape options (section 5). Unavailable while
       locked.
    3. SIZE & ROTATION — opens the Size options (section 6). Unavailable
       while locked.
    4. SETTINGS — opens the Settings options (section 7).
    5. LOCK / UNLOCK — freezes or frees the object's geometry. While
       locked, shape, size and delete are unavailable and say so
       ("Unlock to delete").
    6. DELETE — removes the object. Unavailable while locked.
    7. DESELECT — clears the selection.

PRECISE POSITIONING must be possible without a mouse: nudge the selected
object in small steps (a fine step and a larger step), and rotate in exact
degrees. Provide on-screen equivalents for anything that is keyboard- or
modifier-key-only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 · SHAPE OPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Two choices, switchable at any time:
· RECTANGLE — described by length and width.
· CIRCLE — described by diameter.
Switching shape changes which size fields (section 6) apply.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6 · SIZE & ROTATION OPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Values are typed exactly, in the current unit (m / ft), with the unit
switch available here:
· Rectangle: LENGTH, WIDTH, HEIGHT.
· Circle: DIAMETER, HEIGHT.
· ROTATION: 0–359°, in 1° steps.
Height matters everywhere — it drives the shadow and the bridging maths.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7 · SETTINGS OPTIONS — how the object affects the design
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· SETBACK — 0 to 3 m, in 0.1 m steps. Explained as "buffer zone where
  panels cannot be placed". This is what draws the red ring on the canvas.
· CASTS SHADOW — on/off. Whether it is included in the shading simulation.
· BLOCKS PANEL PLACEMENT — on/off. When switched ON it reveals a nested
  BRIDGING group, which is the important part:
    → PANELS MAY BRIDGE ABOVE — on/off. When ON it reveals:
        → MUST REMAIN OPEN TO SKY — on/off.
            → When that is OFF, it reveals CLEARANCE ABOVE IT — 0 to 1 m
              in 0.05 m steps, shown with a live calculated explanation:
              "Bridgeable when the array structure clears X m (its Y m +
              margin)", where Y is this object's height.
            → A warning states that bridging over this object is flagged
              for engineer confirmation.
  Show this nested chain in full — it is frequently missed.
· CONVERT TO ROOFTOP PLATFORM (mount panels on top) — a one-tap action
  that REPLACES the obstruction with a new roof surface named
  "{label} platform", sitting at (its roof's height + its own height), so
  panels can then be placed on top of it like any other roof. It states
  that the platform's structural adequacy needs engineer verification.
  When the object's top is too small to stand on, the action is
  unavailable and the reason is shown.
· HEIGHT INFORMATION — read-only, three facts:
    – PLACEMENT: the name of the roof it sits on, or "On ground".
    – BASE SURFACE: the height of the surface it stands on.
    – TOP FROM GROUND: its total height from the ground (the number that
      decides shading).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8 · WHAT UPDATES LIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The roof an object belongs to (re-checked every time it moves), its base
and top heights, the required bridging clearance, the setback ring size,
and the total obstruction count.

STATES — one mobile + desktop frame pair, switched from a header chip
(never separate static frames); the picker and option groups are overlays
reached by their trigger, not chip states:
· empty — no obstructions yet
· type picker open
· placement mode (guidance showing, waiting for a tap)
· an object selected (handles + its context actions)
· settings open WITH the full bridging chain revealed
· a locked object (edit actions unavailable, reasons shown)
· all obstructions hidden
· measuring
· 3D view open

WIRE THESE — make them work in the prototype:
· Add obstruction → type picker → placement → object appears selected
· select → context actions → each opens its option group and closes back
· convert to platform → the new platform surface exists and can hold panels
· open 3D → 10.7, and back to this step
· Back → Step 2 · Next → Step 4

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows, so the page reads on its
own without me explaining it.

VIEWPORTS: build BOTH — MOBILE 375px and DESKTOP 1440px. Place them SIDE BY
SIDE on ONE HORIZONTAL ROW — mobile on the LEFT, desktop on the RIGHT,
aligned to the same top edge. Do NOT stack them vertically and do not put
one below the other. Every tool above must be reachable in both. The layout
inside each frame is your decision.
```

---

# 10.5 · Step 4 · Components

```
Design STEP 4 — COMPONENTS of a solar design studio. Use the selected
design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: the panel and inverter lists come
from the tenant CATALOG & PRICE BOOK (Phase 8) — read from it; do not
invent a second catalog or a new isolated page.

WHO: a designer choosing the hardware and the target system size.
GOAL: the right panel + inverter + capacity, with an honest comparison.

BELOW IS THE COMPLETE LIST OF WHAT THIS STEP CONTAINS — every control, what
happens when it is used, and every option it reveals. Include all of it.
HOW it is laid out on mobile and desktop is YOUR decision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 · THE STEP IS THREE PARTS, IN ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PANEL → CAPACITY → INVERTER. Each part shows whether it is done and what is
currently chosen, and can be reopened at any time. Completing one moves the
user to the next.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 · PANEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· SELECTED PANEL SUMMARY (once chosen): brand, model, physical dimensions,
  the electrical figures Voc / Vmp / Isc, and the wattage shown large.
· SEARCH — filters the list as you type.
· FILTER — opens a set of filters:
    – MIN WATT and MAX WATT (numbers)
    – TECHNOLOGY, pick one: All Types · Mono PERC · TOPCon · Bifacial ·
      Poly · HJT
    – DCR (domestic content) on/off
    – ALMM (approved list) on/off
· A RESULT COUNT ("N panels") that reflects search + filters.
· THE LIST — each row: brand mark, brand + model, then "watt · technology ·
  dimensions", plus ALMM and DCR badges where they apply. Choosing a row
  selects that panel and moves on to Capacity.
· Two secondary routes, shown as available-later: "enter specs manually"
  and "upload datasheet (PDF extraction)".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 · CAPACITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· TARGET CAPACITY — a number in kWp (0.1 steps).
· AUTO — one tap fills in the MAXIMUM capacity the drawn roof can hold
  after setbacks and obstructions. Explained as "Auto = maximum fit".
  Unavailable until a panel is chosen and a roof exists, with the reason.
· GOOGLE SOLAR CROSS-CHECK — a line reading "Google Solar estimates max N
  panels (~X kWp)" when that data exists for the site. Information only.
· BILL-BASED SUGGESTION — a tappable line: "From your ₹X/month bill we
  recommend ~Y kWp" — tapping applies it. (X comes from Step 1.)
· CONTINUE — moves to Inverter; unavailable while capacity is 0.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 · INVERTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· RECOMMENDED LINE (before anything is chosen) — "Recommended: {brand}
  {model} ({kW} × {count}, {phase}) → DC/AC ratio X" — tapping applies it.
· SELECTED INVERTER SUMMARY: brand, model, number of MPPTs, voltage range,
  phases, efficiency, and the kW rating shown large.
· NUMBER OF INVERTERS — a number, 1 to 10.
· DC/AC RATIO — a live read-out that states its own health:
    – above 1.35 → "high (clipping risk)"
    – below 0.90 → "low (oversized)"
    – between   → "healthy (0.90–1.35)"
· SEARCH, a RESULT COUNT, and THE LIST — each row: brand mark, brand +
  model, then "kW · phase · MPPT count · voltage range", with a RECOMMENDED
  badge on the suggested one.

ONCE AN INVERTER IS CHOSEN, two more choices appear, each with a one-line
explanation of what it means:
· DC COLLECTION TOPOLOGY — "String inverters" or "Central + combiners".
· MODULE-LEVEL ELECTRONICS (MLPE) — "None" or "DC optimisers".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 · COMPARE OPTIONS — energy, cost & payback
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A "Compare options" action (unavailable with no roof drawn, with the reason
shown) opens a comparison of candidate panel/inverter combinations. It
contains:
· A plain statement of the BASIS — target vs maximum fill, whether the
  energy figures come from real PVGIS irradiance or the built-in estimate,
  and the catalog version used. Plus any warnings.
· A COMPARISON of each candidate showing, per option:
    OPTION (panel, with RECOMMENDED / CURRENT markers and any on-order or
    DCR note) · INVERTER (with its DC/AC ratio) · FITS (panels × watt →
    kWp) · MODULE EFFICIENCY · ANNUAL GENERATION (kWh) · NET COST (with the
    subsidy shown separately) · PAYBACK · 25-YEAR SAVINGS (with ROI %) ·
    WARRANTY (panel / inverter years) · INSTALL (complexity + array weight)
    · and an action: APPLY, or a "selected" / feasibility note.
· DECISION CARDS below it — plain language: the topic, the choice made, the
  reason, and the inputs behind it.
· A FIXED-ASSUMPTIONS footnote (tariff escalation per year, 25-year
  horizon, margin, and the PM Surya Ghar subsidy).
· APPLY sets the panel, the inverter and the inverter count together in one
  undoable action.
· If panels are ALREADY PLACED and the chosen option uses a different
  panel, a confirmation appears first — keep the current panel, or replace
  it and accept that the placed layout is now outdated.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6 · WHAT UPDATES LIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Module efficiency, annual kWh, net cost, subsidy, payback, 25-year savings,
ROI %, DC/AC ratio, array weight, install complexity, whether a valid
string length exists for the pair, the recommended inverter and count, the
effective kWp the roofs can actually hold, and the bill-based suggestion.

STATES — one mobile + desktop frame pair, switched from a header chip
(never separate static frames); the filters and the comparison are overlays
reached by their trigger, not chip states:
· no panel chosen yet · panel chosen · filters open
· capacity empty · capacity set by Auto · the bill-based suggestion showing
· inverter recommended (not yet chosen) · inverter chosen, DC/AC healthy
· inverter chosen, DC/AC high (clipping) and low (oversized)
· the comparison open · the replace-panel confirmation
· no roof drawn yet — Auto and Compare unavailable with the reason shown

WIRE THESE — make them work in the prototype:
· the catalog (Phase 8) feeds both lists
· Auto → fills capacity from the drawn roof
· the bill line and the recommended line → apply on tap
· Compare → the comparison → Apply → (if needed) the replace confirm
· Back → Step 3 · Next → the panel layout (10.6)

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows, so the page reads on its
own without me explaining it.

VIEWPORTS: build BOTH — MOBILE 375px and DESKTOP 1440px. Place them SIDE BY
SIDE on ONE HORIZONTAL ROW — mobile on the LEFT, desktop on the RIGHT,
aligned to the same top edge. Do NOT stack them vertically and do not put
one below the other. Every control above must be reachable in both. The
layout inside each frame is your decision.
```

---

# 10.6 · Steps 5–6 · Panel layout (auto-fill + the manual editor + structure)

```
Design the PANEL LAYOUT editor (studio Steps 5–6) — the core design
surface and the most tool-dense screen in the product. Use the selected
design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wire into what already exists; do not
create a duplicate or a new isolated page.

WHO: a designer placing and tuning the array, its safety objects and its
wiring.
GOAL: a valid, buildable panel layout with structure and electrical design.

BELOW IS THE COMPLETE LIST OF WHAT THIS SCREEN CONTAINS — every tool, what
happens when it is used, and every option it reveals. Nothing here is
optional. HOW it is laid out on mobile and desktop is YOUR decision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 · ON ARRIVAL WITH NO PANELS (this is studio "Step 5")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Three choices are offered before anything is placed:
· PLACE MANUALLY — start with an empty roof.
· AUTO-FILL PANELS — fill to the target capacity set in Step 4.
· USE MAXIMUM ROOF CAPACITY — fill everything the roof can hold.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 · THE TOOLS — four groups. Each build/safety tool shows a live count.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VIEW
 · IRRADIANCE HEATMAP — overlays how much sun each part of the roof gets.
   Turning it on reveals a LEGEND (a scale from Poor to Excellent, with
   0 / 50 / 100%) and a MONTH SCRUBBER (Jan–Dec) that recolours instantly,
   plus the current month's average access %, average sun-hours/day, and
   the kWh/m² received that month. While it computes it shows progress
   ("Computing solar access… X%").
 · SHOW STRINGS — shows/hides the wiring: the series path through each
   string and the routed home-run cables.
 · WHY THIS LAYOUT? — opens the DESIGN DECISION LOG (what the auto-design
   chose and why) together with improvement suggestions, each of which can
   be accepted or ignored.
 · MEASURE DISTANCE — a two-point ruler, same as the earlier steps.

BUILD
 · SELECT — the default. Used for selecting, multi-selecting, moving
   panels, and editing cable-route corners.
 · PANELS — TAP places ONE panel snapped to the grid; DRAG fills a
   rectangle with a whole table of panels, automatically avoiding
   obstructions and setbacks. A live preview shows where panels will land
   and whether they fit or conflict.
 · ERASE — removes whatever is under the pointer: a panel, a walkway, a
   safety rail, a lightning arrester, an inverter or the meter. The target
   is highlighted before it is removed.

SAFETY (each with a running count)
 · WALKWAY — drag along the roof to draw a walking lane. Its WIDTH is
   chosen from 600 / 800 / 1000 mm, or a custom width (100–3000 mm).
 · NO-BUILD ZONE (keep-out) — drag a rectangle panels must avoid; tapping
   an existing zone removes it.
 · SAFETY RAIL — drag along a roof edge.
 · LIGHTNING ARRESTER — tap to place one on a roof.

ELECTRICAL (each with a running count)
 · MOUNT INVERTER — has two sub-modes, chosen from a toggle:
     – INVERTER: snaps to the nearest wall edge within ~4 m.
     – METER / SERVICE ENTRY: placed as a free point.
   Each sub-mode shows its own instruction while active.
 · STRINGING — opens the stringing options (section 5).
 · STRING CONNECTIONS — a read-only list of every string and the exact
   chain of panels in it.

ALWAYS AVAILABLE
 · UNDO and REDO (one gesture = one step).
 · LOCK / UNLOCK LAYOUT — while locked, every tool that would change the
   design is unavailable and says so.
 · CLEAR ALL PANELS — asks for confirmation first; unavailable when locked
   or when there are no panels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 · WORKING ON THE CANVAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· Pan and zoom the plan (available in Select mode; suspended mid-gesture).
· TAP a panel to select it. Add or remove panels from the selection.
· A MARQUEE selection — drag a box to select every panel inside it, and a
  way to add that box to an existing selection.
· MOVE — drag a selected panel (or the whole selection); a live outline
  shows where it will land, and a refused move explains why.
· CABLE-ROUTE EDITING — a routed run's corner points can be dragged to
  re-route it, and a new corner can be created by pulling on a straight
  segment. Doing this marks that run as MANUAL so auto-routing will not
  overwrite it. The two ends (panel and inverter) stay fixed.
· Every draw tool (walkway, rail, keep-out, panel-fill) previews live while
  the gesture is in progress.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 · WHEN PANELS ARE SELECTED — the actions offered
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Shows how many panels are selected, then:
· GROUP — combines loose panels into one parametric TABLE (needs 2+ on the
  same roof, not already grouped).
· GROW A ROW / GROW A COLUMN — one tap adds a row or column on whichever
  side has space; when there is no room it says so.
· MORE GROW OPTIONS — choose the axis (row or column), a COUNT from 1 to
  20, and which side to grow from, with a live preview of the panels that
  would be added, then "Add N".
· ROTATE — turn 90° each way, with the current azimuth shown (or "mixed").
· TILT — decrease/increase in 5° steps, with the current tilt shown.
· TABLE SETTINGS — opens section 6 (only when a table is selected).
· ENABLE / DISABLE — stops a panel producing without deleting it.
· DELETE — removes the selected panels.
· CLEAR SELECTION.
All of these are unavailable while the layout is locked, and say why.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 · STRINGING OPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· AUTO STRING — groups the panels into valid strings for the inverter's
  MPPTs and automatically routes the DC and AC cable runs.
· MANUAL STRING — a tap-to-wire mode: tap panels in the order they should
  be connected. While wiring it shows a live counter "N of min–max panels",
  the running cold-weather string VOLTAGE (coloured for over-limit, under
  the MPPT floor, or fine), warnings when the string is too long or too
  short, and Save / Cancel. It refuses panels already used or disabled and
  explains why.
· CLEAR STRINGS — removes all wiring (only offered when strings exist).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6 · TABLE SETTINGS — the parametric array and its structure
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Header shows the table's name, its rows × columns, panel count and kWp.
· STRUCTURE PRESET, each with a small cross-section preview: FLUSH ·
  STANDARD 10° · WALK-UNDER 2.2 m. Shows "custom" when none matches.
· GROUND FOUNDATION (ground-mounted arrays only): DRIVEN PILE · BALLASTED,
  with a note that a soil survey is required.
· RACKING: FLUSH · FIXED TILT · DUAL TILT.
· PANEL TILT (when not flush): step down/up plus a 0–35° range control.
· INTER-ROW SHADING (when not flush): the recommended winter shadow-free
  ROW PITCH in metres, the resulting GCR, and a one-tap "APPLY SHADOW-FREE
  SPACING".
· AZIMUTH (which way the panels face): step ±5°, a DUE SOUTH preset, a
  ROOF SLOPE preset, and a live degrees + compass direction read-out.
· STRUCTURE PROFILE — pick the steel section; each shows its weight per
  metre.
· STRUCTURE MEMBER MODEL — a preview plus the counted bill of the
  structure: legs, rafters, purlins and braces (count and total metres) and
  total steel kg. Editable: LEG SPACING (0.5–4 m) and CLEARANCE (0–3 m),
  and an ANCHORED / BALLASTED choice. Shows any structural warnings.
· THE STRUCTURE DISCLAIMER, always: this is a MATERIAL estimate and a
  visual model — it is not a wind, uplift or roof-capacity check, and needs
  engineer verification.
· DUPLICATE TABLE and DELETE TABLE.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7 · VALIDATION & STATUS — this is what makes the design real
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· A VALIDATION SUMMARY showing the first problem and "+N more", opening a
  full list of every error and warning: string voltage too high in cold,
  voltage below the MPPT window, panel current above the MPPT input,
  DC/AC ratio too high or too low, panels left unstrung, more strings than
  MPPT inputs, and "no valid string length exists for this panel/inverter
  pair". EVERY entry can be tapped to LOCATE it — it centres and selects
  the panels at fault. Where relevant it offers "AUTO-STRING NOW" inline.
· A HARD GATE: while the electrical design is invalid, moving to the next
  step is blocked, and the reason is stated.
· A STATUS READ-OUT: enabled panel count, kWp against the target, the
  string colour key, and the DC cable length (marked whether it is routed
  or still an estimate).
· A 3D button that opens the shadow view.
· NO subscription or plan-capacity limit anywhere (billing is out of scope,
  D38). Flagging kWp over the design TARGET is a design cue and stays.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8 · WHAT UPDATES LIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Enabled panel count, kWp vs target, per-string voltages, live cold-weather
voltage while wiring, DC cable metres, row pitch and GCR, structure member
counts and steel kg, solar-access % per month, the validation list, the
decision log and the suggestions.

STATES — one mobile + desktop frame pair, switched from a header chip
(never separate static frames); sheets and pickers are overlays reached by
their trigger, not chip states:
· arrival with 0 panels (the three auto-fill choices)
· a placed layout in Select mode
· panels selected with their actions showing
· table settings open (structure + inter-row shading)
· stringing — auto, and manual mid-wiring with the live voltage counter
· the validation list with errors, next step blocked
· the heatmap on, with its legend and month scrubber
· a walkway/keep-out/rail being drawn
· the layout locked

WIRE THESE — make them work in the prototype:
· the three arrival choices → a placed layout
· each tool → its own mode, options and live preview
· validation "locate" → selects those panels; "auto-string now" → strings
· table settings → changes the array and its structure figures
· 3D → 10.7 and back · Back → Step 4 · Next → Step 7 (blocked while the
  electrical design is invalid)
· the panel and inverter come from Step 4; this layout feeds the BOM (10.10)

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows, so the page reads on its
own without me explaining it.

VIEWPORTS: build BOTH — MOBILE 375px and DESKTOP 1440px. Place them SIDE BY
SIDE on ONE HORIZONTAL ROW — mobile on the LEFT, desktop on the RIGHT,
aligned to the same top edge. Do NOT stack them vertically and do not put
one below the other. Every tool above must be reachable in both. The layout
inside each frame is your decision.
```

---

# 10.7 · The 3D view (camera · sun/shadow · layers · edit · energy)

```
Design the 3D VIEW of a solar design studio — the shadow and solar-access
scene, opened from the roof, layout and proposal steps. Use the selected
design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: this is ONE shared surface opened
over the editor steps — not a new page per step. Wire into what exists.

WHO: a designer; and, in a read-only form, the customer via a share link.
GOAL: see real shadows and per-panel solar access, tune the structure in
3D, and read the energy report.

BELOW IS THE COMPLETE LIST OF WHAT THIS SCREEN CONTAINS — every control,
what happens when it is used, and every option it reveals. Include all of
it. HOW it is laid out on mobile and desktop is YOUR decision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 · CAMERA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· Orbit (rotate around the building), pan, and zoom in/out.
· The camera never goes below the horizon.
· THREE VIEW PRESETS, each one tap: TOP · ISOMETRIC · FRONT.
· A way to close and return to the 2D editor.
· Everything that is keyboard-only in the original (orbit by arrows, zoom
  by + / −, the numbered presets, escape-to-close) must have a visible
  on-screen equivalent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 · SUN & SHADOW (the point of the screen)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· SEASON PRESETS, one tap each: WINTER · SUMMER · EQUINOX · TODAY.
· A DATE PICKER for any other day.
· PLAY / PAUSE — animates the sun across the day; shadows move with it.
· A TIME-OF-DAY control from 5 AM to 7 PM, with the current time shown.
· SUNRISE and SUNSET times for that date.
· A SUN POSITION read-out: a compass showing where the sun is, with its
  azimuth and altitude in degrees.
· A SUN PATH toggle — draws the arc the sun travels that day with the hours
  marked along it.
· Shadows are cast by roofs, parapets, obstructions, structure and panels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 · LAYERS & VIEW MODES — what each does when switched on
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· IRRADIANCE HEATMAP — colours the roof by how much sun each area gets.
  Switching it on moves to a top-down view and stops rotation (pan and zoom
  still work). It reveals a LEGEND (Poor → Moderate → Good → Excellent,
  with 0 / 50 / 100%) and a MONTH TRACK (Jan–Dec) that recolours instantly,
  showing that month's average access %, average sun-hours per day, and the
  kWh/m² received — that last figure carries a "Real · PVGIS" marker,
  because it is the only climate-measured number here. The geometric access
  numbers deliberately carry no such marker. While computing it shows
  progress.
· SOLAR-ACCESS VIEW — tints every panel by how much sun it actually gets.
· ENERGY REPORT — opens the report (section 6).
· MAP ⇄ MESH — MAP shows the model on the satellite image in context; MESH
  is an isolated product render on a plain studio background.
· NEIGHBOUR BUILDINGS — decorative context only. State plainly that these
  do NOT cast shadows; a real neighbour must be added as a "building"
  obstruction in Step 3 to affect the shading.
· COPY CUSTOMER SHARE LINK — copies the read-only 3D link the customer
  opens. Hidden in read-only mode.
· BACK TO THE 2D EDITOR.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 · EDITING IN 3D — tap a panel or a structure member
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tapping a module or any structure member (leg, rafter, purlin, brace, rail)
opens an edit card for that table. It closes on an outside tap or a close
action, and disappears if its table is deleted. It contains:

· THIS PANEL (when a module was tapped): its solar-access %, its share of
  the annual kWh, and "SUN LOST TO — tap to look": a short list of what is
  blocking it. Tapping a blocker swings the camera round to look at it. If
  nothing blocks it, it says so.
· STRUCTURE PRESETS: FLUSH · STANDARD 10° · WALK-UNDER 2.2 m, each with a
  cross-section preview; the active one is marked.
· MODULE VISIBILITY — SHOW / GHOST / HIDE. A view aid only; never saved.
· TABLE SCOPE — ALL TABLES / ISOLATE THIS ONE. A view aid only.
· STRUCTURE PROFILE — pick the steel section; each shows its cross-section
  shape, its section size in mm and its weight per metre.
· FOUNDATION — PCC PEDESTAL · CHEMICAL ANCHOR · BALLAST BLOCK · DRIVEN
  PILE. Options taller than the table's clearance are unavailable with the
  reason shown. Only offered where the surface allows it.
· SHUTTERING FORM (cast pedestals only) — SQUARE or CIRCULAR, noting the
  circular form uses about a fifth less concrete.
· A FOUNDATION HONESTY NOTE: the size is nominal and assumed, it adds
  weight to the roof, and the roof's capacity is NOT checked.
· TILT — step down/up in 5°, within 0–35°.
· CLEARANCE — step down/up in 0.3 m, within 0–3 m.
· CUSTOMISE THE MOUNTING STRUCTURE: PURLINS PER ROW (1–6) · RAFTER DENSITY
  (1–3×, half steps) · END OVERHANG (0–1 m) · BRACING on/off. With the note
  that rafter density is a MATERIAL allowance, not a safety factor.
· EDIT LEGS (2D) — opens a small top-down plan of that table showing where
  each leg lands, with: an AUTO / CUSTOM marker and the leg count, ADD LEG,
  RESET TO AUTO, and each leg draggable to move, nudgeable in small steps,
  and removable. Legs may not leave the buildable area, and every action or
  refusal is announced.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 · THE ENERGY REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Opened from the layers. In this order:
· A freshness note when the shading is still recalculating (the figures are
  provisional).
· SYSTEM SUMMARY — capacity kWp, panel count and per-panel watts, roof area.
· ANNUAL GENERATION — the annual MWh shown large, plus specific yield
  (kWh/kWp), performance ratio %, and the plane-of-array factor. With a
  PROVENANCE LINE that says either "Real irradiance — PVGIS ({database},
  {N}-year record)" or "Built-in irradiance model (latitude fit, ±10%)".
· MONTHLY GENERATION — twelve months, with the monsoon months visually
  distinct and each month's exact kWh available.
· LOSSES BREAKDOWN — each loss with its %: temperature, soiling, inverter,
  mismatch, DC wiring, and the measured shading loss; plus the total.
· SOLAR ACCESS — the average %, noted as the same metric as the heatmap.
· 25-YEAR PROJECTION — lifetime MWh and year-25 output with its % of year 1.
· FINANCIALS — net cost after subsidy, yearly savings at the tariff, and
  payback in years.
· FINANCING OPTIONS — a card per option with its headline and monthly
  figure, noted as representative terms.
· Actions: CUSTOMIZE PROPOSAL (→ Step 7) and QUICK GENERATE (→ the
  proposal). Hidden in read-only mode.
· Charts use the design system's DATA colours, never the brass accent.

STATES — one mobile + desktop frame pair, switched from a header chip
(never separate static frames); the edit card and the energy report are
overlays reached by their trigger, not chip states:
· map view with shadows at a chosen time
· a view preset applied
· the heatmap on, with legend and month track
· the per-panel solar-access tint on
· mesh (product render) view
· a structure edit card open, including the "sun lost to" list
· the leg plan editor open
· the energy report open
· READ-ONLY (the customer's share link) — no edit controls, no share button

WIRE THESE — make them work in the prototype:
· opened from the roof step (10.3), the layout (10.6) and captures (10.8),
  and returns to wherever it was opened from
· tapping a blocker → the camera looks at it
· the edit card → changes the structure and its figures
· energy report → Customize Proposal (Step 7) / Quick Generate (proposal)
· copy share link → the customer's read-only 3D view (Phase 4)

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows, so the page reads on its
own without me explaining it.

VIEWPORTS: build BOTH — MOBILE 375px and DESKTOP 1440px. Place them SIDE BY
SIDE on ONE HORIZONTAL ROW — mobile on the LEFT, desktop on the RIGHT,
aligned to the same top edge. Do NOT stack them vertically and do not put
one below the other. Every control above must be reachable in both. The
layout inside each frame is your decision.
```

---

# 10.8 · Step 7 · Proposal captures & readiness

```
Design STEP 7 — PROPOSAL CAPTURES & READINESS of a solar design studio.
Use the selected design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: this FEEDS the built proposal
builder (Phase 3) and the customer link (Phase 4) — it does not rebuild
either of them.

WHO: a designer finishing the visuals and the readiness check before a
proposal goes out.
GOAL: capture the shadow images, confirm the design is actually ready, and
choose the cover image.

BELOW IS THE COMPLETE LIST OF WHAT THIS STEP CONTAINS — every control, what
happens when it is used, and every option it reveals. Include all of it.
HOW it is laid out on mobile and desktop is YOUR decision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 · THE STEP HAS TWO PHASES: CAPTURE, THEN REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━ PHASE A · THE CAPTURE STUDIO ━━━
The 3D scene is shown set up for a specific shot, and the user takes the
picture from it. There are FOUR fixed shots to take:
   1. Summer Morning — 9:00
   2. Summer Noon — 12:00
   3. Solar Access (Summer) — 12:00
   4. Solar Access (Winter) — 12:00
Each shot states its own name, date and hour.

Controls:
· A CAPTURE action that takes the picture from the current 3D view.
· A PROGRESS COUNTER: "Shadow captures: N of 4".
· FOUR NUMBERED SHOT BUTTONS — each shows a tick once captured, and tapping
  one jumps straight to that shot to take or retake it.
· After each capture it automatically moves to the next shot not yet taken.
· The FIRST capture automatically becomes the cover image.
· SKIP TO REVIEW — go to phase B without finishing all four.
· A SAVE-ERROR state, stated honestly, when the image cannot be stored
  (storage full, or a private browsing mode), with what to do about it.

━━━ PHASE B · REVIEW ━━━
· "BEFORE YOU ISSUE" READINESS CARD — an overall verdict, one of:
  NOT READY · READY WITH CAVEATS · READY TO ISSUE. Under it, each thing
  that was checked with its own status (ready / needs attention /
  blocking), what it means, and — for anything unmet — a JUMP BUTTON that
  goes to the exact step that fixes it.
· COVER IMAGE — a preview of the chosen cover, or a clear "no cover
  captured yet".
· THE SHADOW SET — the four captures shown together. Each one shows:
  the image (or "Not captured"), its name and its date/hour, an
  "OUTDATED — RETAKE" action when the design has changed since that image
  was taken, and either a "COVER IMAGE" marker or a "SET AS COVER" action.
· SYSTEM SUMMARY — capacity kWp, panel count × watts, average solar access
  %, and annual generation.
· EDIT PHOTOS — returns to the capture studio.
· GENERATE PROPOSAL — marks the design proposal-ready and hands it to the
  proposal builder with the design's numbers and these captures.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 · WHAT MATTERS HERE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A capture taken BEFORE a design change is stale and must say so rather than
quietly showing an out-of-date picture to a customer.

STATES — one mobile + desktop frame pair, switched from a header chip
(never separate static frames):
· capture studio, 0 of 4 taken
· capture studio, 2 of 4 taken (two ticked)
· a save error
· review — ready to issue
· review — not ready, with the blocking items and their jump buttons
· review — a stale capture flagged "outdated, retake"
· review — no cover chosen yet

WIRE THESE — make them work in the prototype:
· each numbered shot → sets up that view → capture → it appears taken
· "set as cover" → that image becomes the cover
· a readiness jump button → the step that fixes it
· Edit photos → phase A · Generate proposal → the proposal builder
  (Phase 3, Path A) pre-filled from this design
· the captures and the 3D link also feed the customer link (Phase 4)
· Back → the layout (10.6) · Next → Step 8 (10.9)

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows, so the page reads on its
own without me explaining it.

VIEWPORTS: build BOTH — MOBILE 375px and DESKTOP 1440px. Place them SIDE BY
SIDE on ONE HORIZONTAL ROW — mobile on the LEFT, desktop on the RIGHT,
aligned to the same top edge. Do NOT stack them vertically and do not put
one below the other. Every control above must be reachable in both. The
layout inside each frame is your decision.
```

---

# 10.9 · Step 8 · SLD & drawings

```
Design STEP 8 — SLD & DRAWINGS of a solar design studio: the technical
drawing sheets. Use the selected design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: wire into what already exists; do
not create a duplicate or a new isolated page.

WHO: the designer or engineer producing the electrical and layout drawings.
GOAL: correct, exportable drawings, and an honest voltage-compliance check.

BELOW IS THE COMPLETE LIST OF WHAT THIS STEP CONTAINS — every control, what
happens when it is used, and every option it reveals. Include all of it.
HOW it is laid out on mobile and desktop is YOUR decision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 · FOUR DRAWING TABS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· SLD (single-line diagram) · PV LAYOUT · STRING ROUTE · STRUCTURE.
Each shows a proper drawing sheet that can be zoomed and panned within its
own area, and each sheet carries a TITLE BLOCK (project, client, date,
sheet name) and the note that it is not to scale.

WHAT EACH TAB SHOWS
· SLD — the electrical single line, containing: each string with its panel
  count and voltage; STRING COMBINER BOXES when the central topology is
  used; the DCDB with its fuse, SPD and isolator; the INVERTER with its
  label, kW, phase, MPPT range and unit count; the ACDB with its MCCB, SPD
  and isolator; the generation and net METERS and the grid; the EARTHING
  pits; a STRING / MPPT SCHEDULE table; a PLANT DETAILS table; and the
  structural disclaimer note.
· PV LAYOUT — the roofs with their edge dimensions, every panel, the
  obstruction buffers, a north arrow, a legend, a detail of the array table,
  and the title block.
· STRING ROUTE — the roof outlines with each string's cable route drawn and
  labelled, plus the string schedule. When nothing is strung it says so.
· STRUCTURE — the structural drawing of the mounting system.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 · THE COMPLIANCE CHECK THAT MATTERS (on the SLD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A MAXIMUM SYSTEM VOLTAGE box comparing the longest string's cold-weather
voltage against the inverter's maximum DC voltage. Within the limit it
reads as passing; over the limit it reads as a fault and says what to do
("shorten the string"). This is the figure an electrical inspector checks —
it must be prominent, never buried.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 · CONTROLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· THREE-LINE TOGGLE (SLD only) — draw every conductor (line, neutral,
  earth) instead of the single-line shorthand.
· EDIT RATINGS (SLD only) — carries a count of how many ratings have been
  overridden. Opens a form with:
    – INVERTER: name / model (text), AC rating in kW (number)
    – DC SIDE: cable size mm² (2.5 / 4 / 6 / 10) · fuse A (15 / 20 / 25 /
      32) · SPD type (Type-I / Type-II / Type-I+II) · isolator A (25 / 32 /
      40 / 63)
    – AC SIDE: cable size mm² (4 up to 95) · cable type (PVC copper / XLPE
      copper / XLPE aluminium) · MCCB rating A (which also sets the
      isolator) · SPD type
    – GRID & STANDARDS: which standard the drawing follows (IS / IEC 62548
      · CEA, IEC 60364-7-712, or NEC 690)
    – RESET TO AUTO (unavailable when nothing is overridden), CANCEL, and
      SAVE. Only values that differ from the derived defaults are kept.
· STRUCTURAL VERIFICATION — a two-state control: PENDING VERIFICATION ⇄
  ENGINEER APPROVED. This is a HUMAN sign-off. State plainly that the app
  never computes structural adequacy.
· A HIGH WIND marker derived from the site's state — display only, with the
  note that engineer verification is mandatory in a high-wind zone.
· EXPORTS: SVG (CAD) · PNG · DXF (layout) · and PRINT / SAVE AS PDF.
· WHEN NOTHING IS STRUNG (SLD and String Route): an empty state offering
  AUTO-STRING NOW (unavailable until a panel, an inverter and at least one
  placed panel exist, with the reason) and STRING MANUALLY IN THE EDITOR.
· A first-visit explanation of the drawing's colour legend (DC / inverter /
  AC / earthing) that can be dismissed.

STATES — one mobile + desktop frame pair, switched from a header chip
(never separate static frames); the ratings form and the legend explainer
are overlays reached by their trigger, not chip states:
· SLD, voltage within the limit
· SLD, voltage OVER the limit (the fault state)
· SLD in three-line mode
· PV Layout · String Route · Structure
· the edit-ratings form open, with some values overridden
· nothing strung yet (the empty state with its two ways out)
· pending verification vs engineer approved

WIRE THESE — make them work in the prototype:
· the four tabs switch the drawing
· "string manually in the editor" → the layout (10.6); "auto-string now" →
  strings the design and the drawing fills in
· the verification toggle → the design's sign-off status, which the
  engineer queue (10.11) reads
· each export → produces its file; print → a PDF
· Back → Step 7 · Next → Step 9 (10.10)

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows, so the page reads on its
own without me explaining it.

VIEWPORTS: build BOTH — MOBILE 375px and DESKTOP 1440px. Place them SIDE BY
SIDE on ONE HORIZONTAL ROW — mobile on the LEFT, desktop on the RIGHT,
aligned to the same top edge. Do NOT stack them vertically. A drawing sheet
must stay readable on the phone (it may scroll and zoom inside its own area,
but the page itself must never scroll sideways). The layout is your decision.
```

---

# 10.10 · Step 9 · BOM & pricing (the ~286-control screen, made simple)

```
Design STEP 9 — BILL OF MATERIALS & PRICING of a solar design studio. Use
the selected design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: this shares the money path with
the built proposal (Phase 3) and reads its rates from the price book
(Phase 8) — the numbers must never disagree. Do not rebuild the proposal's
pricing, and do not create a second catalog.

WHO: the designer or owner reviewing the auto-derived procurement quote.
GOAL: an accurate, editable quote with honest provenance, reviewed fast.

THE PROBLEM TO SOLVE: in the original this is one 11-column table holding
roughly 286 controls. Keep EVERY field and capability below — the job is to
make it readable, not to drop anything. On a phone it must not be a wide
table. HOW you achieve that is YOUR decision.

BELOW IS THE COMPLETE LIST OF WHAT THIS STEP CONTAINS.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 · THE MONEY SUMMARY — nine figures, two of them editable
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· SYSTEM kWp
· COST before margin
· MARGIN % — EDITABLE, 0 to 60
· DISCOUNT — EDITABLE: a value plus a choice of % or ₹
· TAXABLE — with a "−₹X off" line when a discount applies
· GST — with the per-rate breakdown when the lines carry mixed rates
· QUOTE TOTAL
· ₹ PER Wp
· SUBSIDY — and when it is ₹0, the reason why
This is the SAME arithmetic the proposal uses; it cannot produce a
different total.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 · SIX CATEGORIES, in this order (each shown only if it has lines)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODULES · INVERTER · ELECTRICAL BOS · MECHANICAL BOS · SAFETY ·
CIVIL & MISC.
Each category shows its name, "N of M included", its own total, and a
REFRESH FROM DESIGN action that appears once anything in it was hand-edited.

ELECTRICAL BOS additionally holds two SURVEY INPUTS that size the cable:
AVERAGE DC RUN (array → inverter) and AVERAGE AC RUN (inverter → LT panel).
When the design already has real routed cable geometry, these are locked
with a note saying the routed length is being used instead.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 · EVERY LINE ITEM — all of these fields, none dropped
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· INCLUDE — a switch. Excluding a line keeps it but drops it from the
  totals and visibly dims it; it is never deleted.
· A CONFIDENCE INDICATOR — one of MEASURED · DERIVED · ESTIMATED ·
  ASSUMED, meaning: counted from the design, computed from the geometry, a
  labelled fallback, or dependent on something only a surveyor/engineer can
  confirm. This must be readable, not decorative.
· ITEM NAME — editable on custom lines, fixed on derived ones.
· SPEC · BRAND — text.
· QUANTITY — number.
· UNIT — chosen from: nos · set · pairs · kit · lot · plate · panel-set ·
  day · m · m² · kg · kW.
· WASTE % — 0 to 100.
· ORDER QUANTITY — calculated (quantity + waste, rounded up for anything
  counted in whole units). Read-only.
· RATE ₹ — number.
· AMOUNT ₹ — calculated, read-only.
· GST % — 0 to 40.
· GST ₹ and TOTAL ₹ — calculated, read-only.
· A DERIVATION EXPLANATION — opens the formula behind that line, in words,
  so the number can be defended.
· REMOVE — custom lines only.
· A PER-FIELD RESET that appears next to any value you have overridden, to
  put it back to what the design says. It changes appearance when the
  design has since moved on (see below).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 · RECONCILIATION — what keeps the quote honest
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· A STALE NOTICE per category when the design changed under a value you had
  overridden: it shows "yours X · design now Y" for each drifted field with
  a one-tap "TAKE Y", plus a bulk "REFRESH THESE", and "and N more" when
  the list is long.
· An ORPHAN NOTICE — a saved edit whose line no longer exists in the
  design. Per orphan: KEEP AS A CUSTOM LINE or DISCARD.
· A BELOW-COST WARNING when the discount sells the job under cost.
· A PRELIMINARY QUOTE NOTICE — how many lines are assumed or estimated, and
  which figures still need site verification.
· THE STRUCTURE ENGINEERING DISCLAIMER, with the site's wind zone: the
  structure figures are a material estimate, not a safety check.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 · PAGE-LEVEL ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
· ADD A CUSTOM LINE — a fully editable line of your own.
· RE-SYNC ALL — discards every hand-edit and takes the design's values.
  Asks for confirmation first and states how many edits will be lost;
  unavailable when nothing is edited.
· EXPORT CSV.
· A DISCOM COMPLIANCE CHECKLIST: net metering against the sanctioned load ·
  the SLD sign-off · whether the chosen module is ALMM / BIS listed ·
  earthing and lightning-arrester certificates · PM Surya Ghar subsidy
  eligibility, including the domestic-content (DCR) caveat.

STATES — one mobile + desktop frame pair, switched from a header chip
(never separate static frames); a line's full editor and the confirmations
are overlays reached by their trigger, not chip states:
· the quote as derived, nothing edited
· a single line being edited, with all its fields
· a line overridden, with its reset showing
· a line gone stale ("yours X · design now Y")
· the orphan notice
· the below-cost warning
· the preliminary-quote notice (assumed / estimated counts)
· the re-sync confirmation
· the DISCOM compliance checklist

WIRE THESE — make them work in the prototype:
· rates come from the price book (Phase 8)
· the totals ARE the proposal's money path (Phase 3) — same figures
· each line's confidence and the preliminary state travel onto the
  proposal's honesty labelling
· "take Y" / "refresh these" / "re-sync all" → values return to the design
· export CSV → a file · Back → Step 8 · Next → Step 10 (10.11)

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows, so the page reads on its
own without me explaining it.

VIEWPORTS: build BOTH — MOBILE 375px and DESKTOP 1440px. Place them SIDE BY
SIDE on ONE HORIZONTAL ROW — mobile on the LEFT, desktop on the RIGHT,
aligned to the same top edge. Do NOT stack them vertically. On the phone
this must NOT become a wide sideways-scrolling table — every field above
still has to be reachable there. The layout is your decision.
```

---

# 10.11 · Step 10 · Done + engineer sign-off

```
Design STEP 10 — DONE, plus the ENGINEER SIGN-OFF queue and the return
flow. Use the selected design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: wire into the proposal builder
(Phase 3), the customer 3D link (Phase 4), the INSTALLATION SHEET (Phase 7
— REUSE the existing one, do not rebuild it), the engineer role (Phase 8)
and the design-returned notification (Phase 9).

WHO: the designer finishing a design, and the engineer reviewing it.
GOAL: hand the finished design onward, and let an engineer sign it off or
send it back.

BELOW IS THE COMPLETE LIST OF WHAT THIS CONTAINS — every control, what
happens when it is used, and every option it reveals. Include all of it.
HOW it is laid out on mobile and desktop is YOUR decision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 · THE DONE SCREEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
States that the design is complete, shows the design/project name, and
reassures that it can be reopened and edited at any time. Five next
actions:
· VIEW PROPOSAL — opens the proposal built from this design.
· BOM & PRICING — back to Step 9 (10.10).
· INSTALLATION PLAN — opens the existing INSTALLATION SHEET (section 2).
· COPY 3D SHARE LINK — copies the customer's read-only 3D link.
· DONE — returns to the lead's design list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2 · THE INSTALLATION PLAN (reuse — do not redesign it from scratch)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A crew work-order derived from the design, ordered by how it is actually
built, grouped into phases. It contains:
· A PROGRESS INDICATOR and a "done of total steps" count.
· EACH STEP as a tick-off item: its number, its title, its detail, and the
  materials that step needs. Tapping marks it done or not done, and that
  state is remembered.
· PHASE HEADINGS grouping the steps.
· A PRINT action.
· An EMPTY STATE when there is nothing to install yet ("place modules and
  string the array first").
The crew sees NO money on this — it is a work order, not a quote.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 · THE ENGINEER SIGN-OFF QUEUE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For whoever holds the Engineer role: the designs waiting for review, OLDEST
FIRST (the one that has waited longest is the one that matters). Each entry
shows the customer, the system size, who designed it, and how long it has
been waiting. Opening one starts the review.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 · THE REVIEW — approve or return
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The engineer sees the design and its drawings, then chooses ONE of:
· APPROVE — records the structural verification as ENGINEER APPROVED. The
  design can now go to the customer.
· RETURN WITH COMMENTS — the engineer writes what is wrong, and each
  comment is PINNED TO THE THING it refers to rather than left as a loose
  note. The design goes back to the designer and a notification tells them.

THE RULE THAT DOES NOT BEND: the app NEVER computes structural adequacy.
This is a human decision that is recorded, with who decided and when.
A design that has not been approved is never shown to the customer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5 · THE DESIGN LIST FOR A LEAD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A lead can hold several design VARIANTS. Show them together for comparison
— system size, annual generation, price and payback for each — with one
marked as RECOMMENDED, and a way to open, duplicate or start a new variant.

STATES — one mobile + desktop frame pair, switched from a header chip
(never separate static frames); the installation sheet and the review are
overlays/screens reached by their trigger, not chip states:
· the done screen with its five actions
· the installation plan open, partly ticked off
· the installation plan empty (nothing to install yet)
· the engineer queue with several designs waiting
· a review in progress
· approved — the verification now reads engineer approved
· returned with comments pinned to what is wrong
· the design list for a lead, several variants with one recommended

WIRE THESE — make them work in the prototype:
· View proposal → the proposal builder (Phase 3)
· Installation plan → the EXISTING installation sheet (Phase 7)
· Copy 3D link → the customer's read-only 3D view (Phase 4)
· Done → the lead's design list
· Approve → the structural verification shown on the drawings (10.9)
· Return → the designer, and the design-returned notification (Phase 9)

PAGE TITLE & DETAILS — you usually leave these out; include them. Give the
page a clear TITLE (the screen name) and a short DETAILS line under it
saying who uses it and what it is for. Label every frame with what it is
("Mobile" / "Desktop") and which state it shows, so the page reads on its
own without me explaining it.

VIEWPORTS: build BOTH — MOBILE 375px and DESKTOP 1440px. Place them SIDE BY
SIDE on ONE HORIZONTAL ROW — mobile on the LEFT, desktop on the RIGHT,
aligned to the same top edge. Do NOT stack them vertically and do not put
one below the other. Every control above must be reachable in both. The
layout inside each frame is your decision.
```

---

## After Phase 10 — STOP (and the product is complete)

Run the nine-point review gate in `build-plan.md`, plus these specific to this phase:

- Is **every tool from the codebase inventory present** — nothing dropped in the name of
  simplicity? (Cross-check against `src/features/solar-studio/`.)
- Does the whole thing **work on a phone** — pinch-zoom + two-finger pan on the 2D canvas,
  tap-to-select-then-big-handles, mode buttons instead of keyboard shortcuts and modifier keys?
- Are the **provenance labels intact** everywhere — measured/derived/estimated/assumed, PVGIS
  vs estimate, and **structure as material-only, never a safety verdict** (engineer signs off)?
- Does the **hard electrical gate** still block an invalid string design?
- Does the design **feed the proposal (Path A), the customer 3D link, and the BOM's shared
  money path** — connecting to the built phases, not duplicating them?
- Is the **BOM simple on mobile** (cards + edit sheet) while keeping every field?

This is the last phase. When it's built and reviewed, the product is complete end to end.
