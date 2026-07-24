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

VIEWPORTS: MOBILE 375px — the shell must fully work; step indicator compact,
health chip visible. DESKTOP 1440px — step rail + more header room. Side by
side, mobile left, desktop right.
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

VIEWPORTS: MOBILE 375px — a clean form + a good-sized map, actions in reach.
DESKTOP 1440px — form left, map right. Side by side, mobile left.
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

VIEWPORTS: MOBILE 375px — a big canvas, a mode toolbar within thumb reach,
sheets for properties, PINCH-ZOOM and two-finger pan (the code lacks these
— add them). DESKTOP 1440px — canvas + a side properties panel, keyboard
shortcuts as a bonus. Side by side, mobile left.
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

VIEWPORTS: build BOTH — MOBILE 375px and DESKTOP 1440px, side by side,
mobile left. This is used on a phone in the field and on a desktop at a
desk; every tool above must be reachable in both. The layout is yours.
```

---

# 10.5 · Step 4 · Components

```
Design STEP 4 — COMPONENTS: pick the panel and inverter, set capacity, and
compare options. Use the design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: the panel/inverter lists come from
the tenant CATALOG (Phase 8) — read from it, don't invent a new catalog.

WHO: the designer, choosing hardware and target size.
GOAL: the right panel + inverter + capacity, with an honest comparison.

PANEL: a searchable, filterable list (min/max watt; technology chips —
Mono PERC / TOPCon / Bifacial / Poly / HJT; DCR; ALMM). Each row shows
brand, model, watt, tech, dimensions, and ALMM / DCR badges. A selected-
panel summary (Voc/Vmp/Isc, watt). ("Enter specs manually" / "upload
datasheet" can stay as marked-future.)

CAPACITY: target kWp; an "Auto" that fills to the maximum the drawn roof
holds after setbacks/obstructions; a Google Solar cross-check line
("Google estimates max N panels"); a bill-based suggestion ("from your
₹X/month bill we recommend ~Y kWp — tap to apply").

INVERTER: a recommended banner (tap to apply); a searchable list with a
RECOMMENDED badge; a selected-inverter summary with **number of inverters**
and a live **DC/AC ratio** health read-out (high = clipping / low =
oversized / healthy 0.90–1.35). Then DC topology (String inverters /
Central + combiners) and MLPE (None / DC optimisers), each with a one-line
explanation.

COMPARE sheet — a decision aid, kept: a matrix of candidate options with
fits (panels × watt, kWp), module efficiency, annual kWh (PVGIS vs
estimate noted), net cost + subsidy, payback, 25-yr savings + ROI,
warranty, install complexity; plus plain-language decision cards and the
fixed-assumptions footnote. "Apply" sets panel + inverter + count; if
panels are already placed with a different panel, keep the "replace panel?"
confirm.

STATES — one frame pair, switch via header chip:
- panel not chosen / chosen · filter open · capacity (auto vs bill-based) ·
  inverter recommended vs chosen (DC/AC health) · compare matrix · the
  replace-panel confirm · no roof yet (Auto/Compare disabled, explained).

WIRE THESE:
- catalog (Phase 8) → the lists
- Auto → fills from the drawn roof; Compare → the matrix → Apply
- Next → the layout (10.6)

VIEWPORTS: MOBILE 375px — accordions for panel/capacity/inverter, the
compare matrix as a horizontally-scrollable card set (not a cramped table).
DESKTOP 1440px — the full matrix. Side by side, mobile left.
```

---

# 10.6 · Steps 5–6 · Panel layout (auto-fill + the manual editor + structure)

```
Design the PANEL LAYOUT editor — the core design surface. This is the
biggest, most tool-dense screen in the product; redesign it TOUCH-FIRST and
SIMPLE while keeping EVERY tool. Use the design system; no colours/tokens.

EXISTING APP — CONNECT, DON'T DUPLICATE: wire into what already exists.

WHO: the designer, placing and tuning the array.
GOAL: a valid, optimised panel layout with structure and wiring.

AUTO-PLACEMENT FIRST (Step 5): on arrival with no panels, offer — place
manually · auto-fill to the target kWp · use maximum roof capacity.

MODE-BASED TOOLBAR (replace the letter shortcuts with visible, grouped
tools; each build/safety tool shows a live count):
- VIEW: irradiance heatmap · show strings · "why this layout?" (the design
  decision log + Copilot suggestions) · measure.
- BUILD: Select · Panels (tap = one panel, drag = fill a table) · Erase.
- SAFETY: Walkway (width 600 / 800 / 1000 mm + custom) · No-build zone ·
  Safety rail · Lightning arrester.
- ELECTRICAL: Mount inverter (inverter snaps to a wall / meter as a free
  point) · Stringing · String connections (read-only list).
- Undo · Redo · Lock layout · Clear all panels.

CANVAS (touch-first): pinch-zoom + two-finger pan (code lacks these — add).
Tap a panel to select; a marquee mode for multi-select (replace Shift-drag);
drag a selected panel/set to move with a live landing ghost (green fits /
red conflicts); routed-cable corners are draggable to re-route (marks the
run manual). Draw gestures for walkway / rail / keepout / table-fill.

SELECTION CONTEXT (a sheet/bar when panels are selected — big controls):
- count · Group into a table · Grow a row / a column (+ a "more" option:
  axis, count 1–20, which side, live ghost) · Rotate 90° · Tilt ±5° ·
  Table settings · Enable/Disable (toggle production without deleting) ·
  Delete · Clear selection.

TABLE SETTINGS sheet (the parametric "table"):
- structure preset (Flush / Standard 10° / Walk-under 2.2 m, with preview
  thumbnails) · ground foundation (driven pile / ballasted) · racking
  (Flush / Fixed tilt / Dual tilt) · panel tilt 0–35° · inter-row shading
  (recommended shadow-free row pitch, GCR, "apply shadow-free spacing") ·
  azimuth (±5°, Due S, roof-slope presets, with a compass read-out) ·
  structure profile chips · a member model (legs / rafters / purlins counts
  + steel kg, leg spacing, clearance, anchored/ballasted) with DRC warnings
  and the STRUCTURE DISCLAIMER (material only, not a safety check) ·
  duplicate / delete table.

STRINGING sheet: Auto string (MPPT-validated + auto-routes DC & AC) · Manual
string (tap panels in order, with a live cold-Voc voltage counter and a
min–max range, over-limit / below-MPPT warnings, save/cancel) · Clear
strings.

VALIDATION & STATUS (keep all — this is what makes the design real):
- A DRC / validation banner → a "system validation" sheet listing every
  error/warning (voc_high, vmp_low, imp_high, dc/ac ratio, unstrung,
  mppt_overflow, empty string window), each TAP-TO-LOCATE (selects the
  offending panels), with an inline "auto-string now" where relevant.
- The HARD ELECTRICAL GATE: an invalid string design blocks "Next".
- A status pill: enabled panel count, kWp / target (over-limit flagged),
  string colour dots, DC cable metres (routed vs estimated).
- The irradiance heatmap with a legend and a month scrubber (Jan–Dec).
- A 3D button → the shadow view (10.7).
  (No subscription/plan-limit banner — billing is deferred, D38. The status
  pill still flags kWp over the design TARGET, which is a design cue, not a
  plan gate.)

STATES — one frame pair, switch via header chip:
- the auto-fill choice (arrival, 0 panels)
- a placed layout, Select mode
- panels selected, context controls shown
- table settings sheet (structure) open
- stringing (auto vs manual mid-wiring with the voltage counter)
- the validation sheet with errors, Next blocked
- heatmap on, month scrubber
- layout locked

WIRE THESE:
- auto-fill choices → a layout
- validation "auto-string now" / tap-to-locate → fixes/selects
- 3D → 10.7; Next → Step 7 (blocked until electrical is valid)
- panel/inverter come from Step 4; catalog/price feed the BOM (10.10)

VIEWPORTS: MOBILE 375px — a full-bleed canvas, a bottom mode toolbar, a
selection sheet, pinch-zoom, big handles; advanced settings in sheets.
DESKTOP 1440px — canvas + left tool rail + right context/table panel +
keyboard shortcuts as a bonus. Side by side, mobile left.
```

---

# 10.7 · The 3D view (camera · sun/shadow · layers · edit · energy)

```
Design the 3D VIEW — the shadow/solar-access scene used from the roof,
layout and proposal steps. Keep every control; make the desktop-only bits
touch-first. Use the design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: this opens over the editor steps;
it is one shared surface, not a new page per step.

WHO: the designer (and, read-only, the customer via the share link).
GOAL: see real shadows and per-panel solar access, tune structure in 3D,
and read the energy report.

CAMERA: orbit / pan / pinch-zoom (touch already works) + on-screen view
presets Top / Isometric / Front. Replace the keyboard-only dolly/orbit/close
with visible controls (the code's arrow/+/−/1-2-3/Esc become on-screen
buttons).

SUN & SHADOW (map view): season chips (Winter / Summer / Equinox / Today),
a date picker, Play/Pause sun animation, a time-of-day slider (5 AM–7 PM)
with sunrise/sunset read-out, and a sun-position compass (Az / Alt). Shadows
follow the sun. A sun-path arc toggle.

LAYERS: back to 2D · irradiance heatmap (forces top-down, disables rotate —
keep) · per-panel solar-access tint · energy report · Map ⇄ Mesh (product
render) · neighbour buildings (context; they don't shade — real neighbours
are "building" obstructions) · sun path · copy customer share link.

EDIT IN 3D: tap a panel or a structure member → a structure edit card:
- THIS PANEL: solar-access % + "sun lost to — tap to look" blockers (tap
  orbits the camera to the culprit).
- Structure presets (Flush / Std 10° / Walk 2.2 m) · module show/ghost/hide
  (view only) · tables all/isolate · structure profile picker (cross-section
  glyphs) · foundation picker (PCC pedestal / chemical anchor / ballast /
  driven pile, taller-than-clearance disabled) · shuttering (square /
  circular) · tilt ±5° · clearance ±0.3 m · customise MMS (purlins/row,
  rafter density, end overhang, bracing) · "edit legs (2D)" → a plan editor
  to add / move (big targets, +/− nudge) / reset / delete legs.
- Carry the foundation honesty note (nominal/assumed; roof capacity not
  checked).

HEATMAP HUD: a legend (Poor → Excellent), a month track, and the PVGIS
"kWh/m²·mo received · Real · PVGIS" badge (the only climate-measured number
here — the geometric access numbers carry no such badge, deliberately).

ENERGY REPORT sheet: system summary (kWp, panels, roof area); annual
generation hero (MWh, specific yield, performance ratio, POA) with the
PVGIS-vs-estimate provenance line; a 12-month bar chart (monsoon months
distinct); a loss breakdown (temperature, soiling, inverter, mismatch, DC
wiring, shading — with total %); average solar access %; 25-year projection;
and finance (net cost, yearly savings, payback) + financing options. Charts
use DATA colours, never the accent.

STATES — one frame pair, switch via header chip:
- map view with shadows · a preset view · heatmap on (month scrub) ·
  per-panel access tint · mesh (product) view · a structure edit card open ·
  the energy report sheet · read-only (customer share) — no edit controls.

WIRE THESE: opened from 10.3 / 10.6 / 10.8; edit card → structure changes;
energy report → customize (→ Step 7) / quick-generate (→ proposal); copy
share link → the customer's 3D view (Phase 4).

VIEWPORTS: MOBILE 375px — full-screen 3D, a bottom control bar, sheets for
layers/energy/edit; touch orbit + pinch. DESKTOP 1440px — 3D + side rails.
Side by side, mobile left.
```

---

# 10.8 · Step 7 · Proposal captures & readiness

```
Design STEP 7 — PROPOSAL CAPTURES & READINESS. Use the design system; no
colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: this feeds the built proposal
builder (Phase 3) and the customer link (Phase 4) — it does not rebuild them.

WHO: the designer, finishing the visual + readiness before a proposal.
GOAL: capture the shadow images, confirm the design is ready, pick a cover.

CAPTURE STUDIO: the 3D scene in capture mode shoots four fixed views —
Summer Morning (9:00) · Summer Noon (12:00) · Solar Access Summer (12:00) ·
Solar Access Winter (12:00). A checklist "captures N/4", numbered preset
buttons (green tick when done, tap to jump), auto-advance to the next, a
"skip to review", and an honest save-error state (storage full / private
mode).

REVIEW: a "before you issue" readiness card — overall (Not ready / Ready
with caveats / Ready to issue) with per-item status and a "go to step N"
jump for anything unmet. A cover preview. A 2×2 shadow grid (each tile:
image or "not captured", an "outdated — retake" when the design changed
after capture, and "cover" badge / "set as cover"). A system summary
(capacity, panels, solar access %, annual generation).

FOOTER: Edit photos (back to capture) · Generate proposal → hands to the
proposal builder (Phase 3, Path A) with the design's numbers + captures.

STATES — one frame pair, switch via header chip:
- capture studio (2/4 done) · a save error · review: ready to issue ·
  review: blocked with caveats + jumps · a stale capture (retake) · no
  cover yet.

WIRE THESE: capture presets → shots; "generate proposal" → the proposal
builder (Path A); captures + 3D link → the customer link (Phase 4).

VIEWPORTS: MOBILE 375px — capture over 3D, review as stacked cards + a 2×2
grid. DESKTOP 1440px — capture + review side by side. Mobile left.
```

---

# 10.9 · Step 8 · SLD & drawings

```
Design STEP 8 — SLD & DRAWINGS. A technical drawing surface; keep every
tab, control and export. Use the design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: wire into what already exists.

WHO: the designer / engineer, producing the electrical + layout drawings.
GOAL: correct, exportable drawings and an honest voltage-compliance check.

TABS: SLD · PV Layout · String Route · Structure.

SLD tab: the single-line diagram — strings (panel counts, voltages),
optional string combiner boxes (central topology), DCDB (fuse / SPD /
isolator), inverter (kW / phase / MPPT / ×units), ACDB (MCCB / SPD /
isolator), generation + net meters + grid, earthing pits, a string/MPPT
schedule, a plant-details table, and a title block. A "3-line" toggle
(every conductor vs single-line). A **MAX SYSTEM VOLTAGE** compliance box —
longest string cold-Voc vs inverter max DC — green within limit / red over
("shorten the string"). This is what a CEIG inspector checks; keep it.

Other tabs: PV Layout (roof polygons + dimensions, panels, obstruction
buffers, north arrow, legend, title block); String Route (per-string dashed
routes + schedule); Structure (the structural drawing).

CONTROLS:
- Edit ratings (SLD): a dialog to override inverter name/rating, DC side
  (cable mm² / fuse A / SPD / isolator), AC side (cable mm² / type / MCCB /
  SPD / isolator), and the standard (IS/IEC/NEC) — with "reset to auto" and
  an edited-count badge.
- Structural verification toggle: "Pending verification" ⇄ "Engineer
  approved" — a HUMAN sign-off; the app never computes structural adequacy.
- HIGH WIND badge (state-derived, display only).
- Exports: SVG (CAD) · PNG · DXF (layout) · Print / Save PDF.
- When there are no strings: an "auto-string now" / "string in the editor"
  empty state.

STATES — one frame pair, switch via header chip:
- SLD (within voltage limit) · SLD over-voltage (red compliance) · PV Layout
  · String Route · Structure · edit-ratings dialog · unstrung empty state ·
  pending vs engineer-approved.

WIRE THESE: "string in the editor" → 10.6; approved toggle → the design's
sign-off (visible to the engineer queue, 10.11); exports → files.

VIEWPORTS: MOBILE 375px — tabs + a pan/pinch-zoom drawing viewport +
export sheet; the drawing scrolls in its own container. DESKTOP 1440px —
the full sheet. Side by side, mobile left.
```

---

# 10.10 · Step 9 · BOM & pricing (the ~286-control screen, made simple)

```
Design STEP 9 — BILL OF MATERIALS & PRICING. In code this shows ~286
controls in an 11-column table — the redesign's job is to make it SIMPLE and
mobile-first WITHOUT dropping a single field or capability. Use the design
system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: this shares the money path with the
built proposal (Phase 3) and reads rates from the price book (Phase 8) —
numbers must not disagree. Do not rebuild the proposal's pricing.

WHO: the designer / owner, reviewing the auto-derived procurement quote.
GOAL: an accurate, editable quote with honest provenance — reviewed fast.

THE SIMPLIFICATION: on mobile, NEVER a wide table. Each line is a CARD
(item name, quantity, total, a confidence dot); tapping it opens an EDIT
SHEET with the full fields. On desktop a table is fine. Progressive
disclosure everywhere.

SUMMARY (a compact strip / header): system kWp · cost (pre-margin) ·
**margin %** (editable) · **discount** (value + % / ₹) · taxable (with the
"−₹X off" line) · GST (with the per-rate breakdown when mixed) · **quote
total** · ₹/Wp · subsidy (with the reason when ₹0). This is the same money
math as the proposal.

SIX CATEGORIES (in order, each only if it has lines): Modules · Inverter ·
Electrical BOS · Mechanical BOS · Safety · Civil & Misc. Each section: "N of
M included", a section total, and "refresh from design" when edited. The
Electrical BOS section also has survey inputs (average DC run, average AC
run) that size the cable.

PER LINE — every field kept (this is the "286"): include toggle · a
CONFIDENCE dot (measured / derived / estimated / assumed) · item name
(editable on custom lines) · spec · brand · quantity · waste % · order qty
(computed) · rate ₹ · amount (computed) · GST % · GST ₹ (computed) · total
(computed) · a derivation-formula info button · remove (custom lines) · a
per-field "reset ↻" that appears when you've overridden a value.

RECONCILIATION (keep — this is what keeps the quote honest):
- an ORPHAN banner (a saved edit whose line no longer exists → keep as
  custom / discard),
- a STALE banner per section ("yours X · design now Y — take Y", plus a bulk
  refresh),
- a below-cost warning (discount sells under cost),
- a PRELIMINARY banner (counts of assumed/estimated lines needing
  verification),
- the structure engineering disclaimer.

PAGE ACTIONS: add a custom line · re-sync all (discard hand-edits, with a
confirm) · export CSV. And a DISCOM COMPLIANCE checklist (net-metering +
sanctioned load, SLD sign-off, ALMM/BIS listing, earthing/LA certificates,
PM Surya Ghar subsidy eligibility with the DCR-module caveat).

STATES — one frame pair, switch via header chip:
- the normal BOM (cards on mobile) · a line's edit sheet open · an edited/
  stale line with reset · the orphan banner · below-cost warning ·
  preliminary banner · the re-sync confirm · the DISCOM checklist.

WIRE THESE: rates ← price book (Phase 8); totals = the proposal's money path
(Phase 3); a line's confidence + the preliminary state travel onto the
proposal's honesty labelling; export CSV → file.

VIEWPORTS: MOBILE 375px — a card list + edit sheet (NOT the 11-column
table), the summary as a compact block. DESKTOP 1440px — the full table is
fine. Side by side, mobile left.
```

---

# 10.11 · Step 10 · Done + engineer sign-off

```
Design STEP 10 — DONE, plus the ENGINEER SIGN-OFF queue and return flow
(the new Stage-5 screens). Use the design system; no colours or token names.

EXISTING APP — CONNECT, DON'T DUPLICATE: wire into the proposal (Phase 3),
the customer 3D link (Phase 4), the InstallationSheet (Phase 7, reuse — do
not rebuild), the engineer role (Phase 8) and the design-returned
notification (Phase 9).

WHO: the designer finishing, and the engineer reviewing.
GOAL: hand the finished design onward, and let an engineer sign it off.

DONE screen: the design is complete — next actions: View proposal (→ the
proposal builder / preview) · BOM & pricing (→ 10.10) · Installation plan
(opens the existing InstallationSheet) · Copy 3D share link (the customer's
view, Phase 4) · Done (back to the lead's design list). Show the design name
and "return to edit anytime".

ENGINEER SIGN-OFF (the Stage-5 additions):
- A sign-off QUEUE for the engineer: designs awaiting review, oldest first,
  each with size, customer, who designed it.
- A sign-off / RETURN screen: the engineer reviews and either APPROVES
  (sets the structural verification to "engineer approved", flows to the
  proposal) or RETURNS with comments pinned to what's wrong — which sends it
  back to the designer (the design-returned notification, Phase 9) and the
  customer never sees an unapproved design.
- Keep the honesty rule: the app never computes structural adequacy; this is
  a human decision, recorded.

STATES — one frame pair, switch via header chip:
- the done screen (next actions) · the install plan open (InstallationSheet)
· the engineer queue (several waiting) · a sign-off/return review · approved
· returned with comments.

WIRE THESE:
- View proposal → the proposal builder (Phase 3); Install plan → the
  InstallationSheet (Phase 7); Copy 3D link → the customer link (Phase 4)
- engineer approve → structural verification approved; return → designer +
  the Phase 9 notification

VIEWPORTS: MOBILE 375px — done actions as a list, the queue as cards, the
review full-screen. DESKTOP 1440px — queue + review side by side. Mobile left.
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
