# Phase 5 — Site survey, both modes  ▸ 10 screens

**The survey decides whether a quote is honest.** There are two ways to do it, run by
different people in different places:

```
REMOTE  · a rep or designer at a desk, minutes after the lead arrives.
          Address → Google Solar API → AI roof detection → review.
          Data is DERIVED FROM IMAGERY. Enough to design and quote.

PHYSICAL · a surveyor on a roof, in the sun, often with no signal.
          Photograph and measure what imagery cannot see.
          Data is MEASURED ON SITE. Confirms reality before installing.
```

Reference: `product-journey.md` Stage 4 (both modes, every edge case), decisions **D30**
(the two modes), **D15** (survey is one capture flow, assignable to a rep or a surveyor),
**D31** (arc nav; a surveyor's centre button reads "Start survey").
Worklist and review gate: `build-plan.md`.

> **Pattern:** this file follows `phase-3-prompts.md` — one prompt per screen, the two
> standing rules below, and a **viewport block attached to every prompt**. Each prompt says
> only WHAT a screen must do, hold and handle; colours, tokens and the fine visual detail
> come from the design system in the dropdown. Never put hex or token names in a prompt.

---

## ⚠️ RULES FOR THIS WHOLE PHASE

### 1 · One screen keeps the bottom navigation — the rest do not

**My visits today (5.6) is the surveyor's HOME** — a top-level destination. It keeps the arc
bottom nav on mobile (the centre button reads "Start survey") and the sidebar on desktop.

**Every other survey screen is a NESTED flow** — remote screens are started from a lead,
physical screens are started from a booked visit. On mobile they are full-screen with a
close ✕ or back ‹ in the header and no bottom nav. Showing the tab bar implies the user can
wander off mid-survey, which they cannot.

| Bottom arc nav appears | Bottom arc nav does NOT appear |
|---|---|
| **5.6 My visits today** (a destination) | Everything else in Phase 5 |

### 2 · STATES ARE SWITCHED BY A HEADER CHIP — NOT DRAWN AS SEPARATE FRAMES

The mistake to avoid: drawing empty, filled, loading, error and offline each as its own
static frame lined up across the page. That is a wall of mockups, not a screen.

Instead — **one page per screen, one mobile + desktop frame pair, and a switcher above the
pair** (a header chip / segmented control) that swaps which state the pair shows. This is a
pattern already built in this app: the **lead-detail screen** switches "Rich lead · New lead ·
Snoozed" from pills at the top of the same screen. Reuse it.

- The switcher lists this screen's mutually-exclusive states; picking one changes what the
  pair shows. States stay directly comparable and the page stays readable.
- Do NOT create a new page per state, and do NOT duplicate the frame pair per state.
- **Sheets, dialogs and the inline camera are NOT states** — they are overlays. Each is a
  frame reached by wiring the control that opens it, with a working Cancel / ✕ back. Keep
  them off the state switcher.

Put this at the top of every prompt:

```
ONE page for this screen: a single mobile + desktop frame pair, with a
header chip / segmented switcher above the pair that swaps between the
states listed below — the same way the lead-detail screen switches
Rich lead / New lead / Snoozed. Do NOT draw each state as its own static
frame, and do NOT make a new page per state. Sheets and the camera are
overlays reached by tapping their trigger, not entries on the switcher.
```

And when a prompt extends something already built:

```
This MODIFIES the existing "[page name]" page. Do not create a new page.
Add to the existing frame pair and its state switcher.
```

### 3 · IT MUST BE A WORKING PROTOTYPE, NOT STATIC MOCKUPS

Wire it. This is clickable, not a picture of a screen.

- The **state switcher actually switches** the visible state when tapped.
- Every button, row, chip and sheet-opener under "WIRE THESE" is **connected** — the happy
  path clicks through the flow (5.1 → 5.2 → 5.3 → … → submit) as a real prototype.
- Every sheet or dialog **opens from its trigger and closes back** to where it came from. No
  dead ends anywhere.
- Where an action leads to another screen in this phase, link to that screen's page so the
  whole survey is traversable end to end.

### 4 · LINK EVERY NEW SCREEN BACK INTO THE APP — never an island

These screens do not stand alone. Each must connect to what is already built, so the
prototype stays one continuous flow and nothing regresses:

- the survey is **started from the existing lead-detail screen** (Phase 2) — its "Survey" /
  "Book site visit" action opens 5.1; do not invent a new entry point
- the surveyor's home (5.6) sits **alongside My Day** in the same app shell and nav
- a finished survey **hands off to the designer**, and its roof data and photos are what the
  **design studio (Phase 10)** opens for the 3D proposal
- a rescheduled or "could not complete" visit **writes back to the lead's timeline**

Wire into the REAL action on the existing screen. When a target is not built yet (the studio),
link to a clearly labelled placeholder frame — never a dead end. Backward compatibility is a
standing rule for every phase from here on: new work links into the existing flow, it never
replaces or orphans it.

---

## The viewport blocks — attach ONE to every prompt in this phase

Most Phase 5 screens are nested flows and use the **NESTED block**. Only 5.6 uses the **APP
block**. Which one each prompt takes is named at its foot.

### NESTED VIEWPORT BLOCK — for the survey flows (all except 5.6)

```
BOTH VIEWPORTS, one design, genuinely different layouts:

· MOBILE 375px — NO bottom navigation (this is a nested survey flow).
  Full screen, close ✕ or back ‹ in the header, any step or progress
  footer pinned at the bottom. Single column, content as cards, secondary
  panels and pickers open as bottom sheets.

· DESKTOP 1440px — the 240px left sidebar stays visible but the survey
  occupies the main content area. Multiple columns. Denser rows, not
  cards. Secondary panels open beside the content, not over it.

Same data and copy in both. Desktop is not a stretched phone — if the two
layouts look alike, the desktop one is wrong.

Place them side by side on one canvas, mobile left, desktop right, aligned
to the same top edge.
```

**Emphasis per mode — add the one line that fits:**

- **Remote screens (5.1–5.5):** the rep works at a desk with imagery and a map, so
  *desktop is a first-class working surface, not an afterthought.*
- **Physical screens (5.7–5.10):** the surveyor works on a phone on a roof, so *mobile 375px
  is the working device — design it first; the desktop view is the office read-back where a
  designer or owner reviews a submitted survey.*

### APP VIEWPORT BLOCK — for 5.6 only

```
BOTH VIEWPORTS, one design, genuinely different layouts:

· MOBILE 375px — bottom arc nav; a surveyor's centre button reads "Start
  survey". Single column, content as cards, primary action within thumb
  reach, a visit opens full screen.

· DESKTOP 1440px — NO bottom nav. A 240px left sidebar with icons and text
  labels instead. Multiple columns. Denser rows, not cards. A visit opens
  in a right-hand panel with the list still visible beside it. Rows have
  hover states.

Same data and copy in both. Desktop is not a stretched phone — if the two
layouts look alike, the desktop one is wrong.

Place them side by side on one canvas, mobile left, desktop right, aligned
to the same top edge.
```

---

## Things that are true of EVERY survey screen — attach to every prompt

```
TWO MODES EXIST, and the choice must be honest:
- REMOTE survey reads satellite imagery. It is enough to design and quote,
  and it is often the FIRST pass for a residential roof.
- PHYSICAL survey is someone on the roof. It confirms what imagery cannot.
A proposal built on remote data is legitimate — it just must never claim
to be a site survey.

PROVENANCE TRAVELS WITH EVERY MEASUREMENT:
- Remote figures are labelled "measured from satellite imagery".
- Physical figures are labelled "measured on site".
- Anything the surveyor or customer states, not measured, is labelled as
  reported, not confirmed.
Never show a number without its origin being knowable.

STRUCTURAL NOTES ARE OBSERVATIONS, NEVER A VERDICT. The app records
"visible crack near the parapet" — it never says "the roof is safe" or
"the roof can take the load". Structural safety is decided by an engineer.

ONE CAPTURE FLOW SERVES BOTH A REP AND A DEDICATED SURVEYOR (D15).

PHOTOS ARE REFERENCE FOR THE DESIGN, NOT MEASUREMENT. Capturing and
attaching photos of the roof, its obstructions and everything AROUND the
building is in scope, however they were taken — the phone on site, photos
the customer sends on WhatsApp, or a drone / other shot uploaded. Every
photo is kept and carried to the designer, who uses it when building the
3D proposal. What stays OUT of v1 is deriving numbers from photos
automatically: LiDAR, automatic roof measurement from photos, and AR
height estimation. A person still enters or estimates every dimension and
height (D35).

REALISTIC INDIAN DATA THROUGHOUT: real cities (Nashik, Pune, Kothrud,
Aundh, Baner), Indian names, DISCOM names (MSEDCL), sanctioned load in kW,
tariffs in ₹/kWh, meter readings, ₹ amounts in Indian format.

CONNECTS TO screens already built: the survey is started from a LEAD
(Phase 2, lead detail). A finished survey hands off to the DESIGNER. The
surveyor's home screen sits alongside My Day in the app.
```

---

## The screens, in order

```
START
  5.1  Start a survey — choose remote or physical; book a physical visit

REMOTE  (rep / designer, at a desk — desktop is a first-class surface)
  5.2  Locate the building
  5.3  Detect and review the roof         ← the star of the remote mode
  5.4  Coverage failure → manual outline or book a visit
  5.5  Gaps remote cannot fill + the honesty label

PHYSICAL  (surveyor, on a roof, on a phone — mobile is the product)
  5.6  My visits today — the surveyor's home
  5.7  Guided capture
  5.8  Shading capture
  5.9  Review and submit                   ← the star of the physical mode
  5.10 Sync and offline status
```

---

# 5.1 · Start a survey — choose the mode, book a visit

```
[+ EVERY-SURVEY-SCREEN block]

WHO: a rep or designer on a lead's detail screen, deciding how this roof
gets surveyed.
GOAL: pick the right mode without being told the wrong thing, and — if
physical — schedule it and let the customer know.

STARTED FROM: the lead (Priya Sharma · Nashik · 8.2 kWp target). The lead
already knows the address, so it carries over.

TWO CHOICES, presented honestly, not as equals-by-default:
- SURVEY REMOTELY NOW — reads satellite imagery, takes minutes, no travel,
  no appointment. Enough to design and send a real proposal today.
  Recommend this first for a simple residential roof.
- BOOK A PHYSICAL VISIT — someone goes and measures. Needed before
  installation, and for C&I, complex roofs, roofs recently rebuilt, or
  anywhere imagery has no coverage.

Show, in plain language, WHEN each is the right call — a homeowner-simple
roof leans remote-first; a factory or a doubtful roof leans physical.

BOOK A PHYSICAL VISIT collects:
- date and time window
- which surveyor (assign to a person, or to "whoever is free" / self)
- confirm the address, with a way to correct it if the lead's is wrong
- an optional note for the surveyor ("gate code, ask for Mr Kulkarni")
After booking, produce a ready-to-paste confirmation message for the
customer. The app does NOT send it — the rep pastes it into WhatsApp
themselves (this is the same rule as sharing a proposal).

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- the choice, before anything is picked
- physical branch: the booking form, empty and filled
- booked — a confirmation with the ready-to-paste message
- this lead already has a survey (remote done, or a visit booked) — show
  that, and offer to view it or start another (a revisit is versioned,
  never an overwrite)

WHAT GOES WRONG:
- the lead has no usable address yet → ask for it before either mode
- the customer wants a visit but no surveyor is free in the window → allow
  booking unassigned, flagged for someone to pick up

WIRE THESE — make them work in the prototype:
- "Survey remotely now"     → 5.2 Locate the building
- "Book a physical visit"   → the booking form → booked confirmation
- booked confirmation       → back to the lead, now showing a scheduled
                              visit; it also appears in the surveyor's
                              "My visits today" (5.6)
- "View existing survey"    → the relevant review screen

[+ NESTED VIEWPORT BLOCK — remote/desk emphasis]
```

---

# 5.2 · Locate the building  *(remote)*

```
[+ EVERY-SURVEY-SCREEN block]

WHO: a rep or designer at a desk, starting a remote survey.
GOAL: land on the exact building whose roof we are about to detect — the
right rooftop, not the one next door.

HOLDS:
- a way to search for the address, pre-filled from the lead where known
- a way to drop or drag a pin to correct where the address resolved
- a satellite preview with the chosen building clearly indicated
- confirmation that "this is the building" before detection runs

THE CRITICAL BEHAVIOUR: the address often resolves to the wrong building
or the wrong side of a plot. Correcting the pin must be effortless and
obvious, because everything downstream is measured off this footprint.

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- searching / typing, before a building is chosen
- a building located, pin on it, ready to detect
- pin being corrected to a neighbouring building
- imagery still loading — the screen is usable, not blank
- the address cannot be found at all → let them drop a pin manually by
  panning the map

WHAT GOES WRONG:
- resolves to the wrong building → correctable, and that is the whole point
- rural or new address with no searchable match → manual pin
- imagery is visibly old (construction that no longer matches) → let them
  proceed but this feeds the "imagery may be out of date" caveat later

WIRE THESE — make them work in the prototype:
- "Detect the roof"   → 5.3 Detect and review
- "No imagery here"   → 5.4 Coverage failure
- back                → 5.1

[+ NESTED VIEWPORT BLOCK — remote/desk emphasis]
```

---

# 5.3 · Detect and review the roof  *(remote — the star of this mode)*

```
[+ EVERY-SURVEY-SCREEN block]

WHO: a rep or designer, seconds after confirming the building.
GOAL: turn satellite imagery into a roof they trust enough to design on —
and to correct anything the detection got wrong.

FIRST, THE DETECTING MOMENT — honest, staged progress, not a fake bar:
"fetching imagery · detecting the roof · finding obstructions · estimating
pitch and shading". It must fail gracefully, never hang silently.

THEN, THE REVIEW — the detection is shown as something they can inspect
and change, never applied silently:
- the detected roof outline, editable
- detected obstructions (water tank, mumty, vent, existing panels), each
  editable, removable, and addable if one was missed
- estimated pitch, azimuth and usable area
- a CONFIDENCE indicator PER DETECTION — high for a crisp outline, low for
  a guessed pitch — so the reviewer knows what to double-check
- every figure carries "measured from satellite imagery"

EACH DETECTION IS ACCEPT / ADJUST / REJECT. Nothing is committed until the
person says so. Adjusting the outline or moving an obstruction updates the
area and the estimate live.

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- detecting, in progress
- detecting failed → retry, or fall through to 5.4
- detection returned, high confidence, little to change
- detection returned, low confidence, several things flagged to check
- an obstruction being added by hand
- the outline being reshaped
- detected result is obviously wrong (bad footprint) → reject and redraw,
  or send to a physical visit

WHAT GOES WRONG:
- a tall neighbour that shades the roof is invisible from above → cannot be
  detected here; it becomes a gap to fill (5.5), stated plainly
- imagery is years out of date and the roof has changed → a visible caveat,
  and the reviewer can correct the outline or escalate to a physical visit
- the roof is split across levels the detection merged → editable

WIRE THESE — make them work in the prototype:
- "Accept and continue"  → 5.5 Gaps remote cannot fill
- "Draw it myself"       → the manual outline path (shared with 5.4)
- "This needs a visit"   → 5.1 booking, pre-filled
- back                   → 5.2

[+ NESTED VIEWPORT BLOCK — remote/desk emphasis]
```

---

# 5.4 · Coverage failure → manual outline or book a visit  *(remote)*

```
[+ EVERY-SURVEY-SCREEN block]

WHO: a rep or designer whose address returned no detailed roof data —
which is real in parts of India.
GOAL: never a dead end. Give them two honest ways forward.

HOLDS:
- a plain statement: "No detailed roof data is available for this address."
  No jargon, no blame.
- TWO WAYS FORWARD:
  1. DRAW THE ROOF BY HAND — trace the outline on whatever imagery exists
     (even coarse), place obstructions, enter an approximate pitch. This
     produces a usable-but-rougher roof, clearly labelled lower-confidence
     and "outlined by hand from imagery".
  2. BOOK A PHYSICAL VISIT — go measure it properly.

THE HAND-DRAWN RESULT still flows into the same gaps step (5.5) and carries
its provenance honestly — it must never look as trustworthy as a clean
detection or a site measurement.

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- the coverage-failure message with the two choices
- manual outline in progress
- manual outline complete, marked lower-confidence
- imagery so poor even a hand outline is guesswork → steer firmly toward a
  physical visit

WIRE THESE — make them work in the prototype:
- "Draw the roof"        → manual outline → 5.5
- "Book a visit"         → 5.1 booking, pre-filled
- back                   → 5.2

[+ NESTED VIEWPORT BLOCK — remote/desk emphasis]
```

---

# 5.5 · Gaps remote cannot fill + the honesty label  *(remote)*

```
[+ EVERY-SURVEY-SCREEN block]

WHO: a rep or designer finishing a remote survey.
GOAL: be honest about what imagery could NOT determine, and capture what
they can by asking the customer — so the design is built on the truth.

HOLDS a checklist of what remote cannot see, each item resolvable as
"ask the customer", "capture on a site visit", or filled in now if known:
- the meter, the sanctioned load, the main panel and whether it has room
- roof condition, age, waterproofing, any structural doubt
- access: stairs, lift, crane, lane width for a delivery truck
- shading from anything not visible from above (a neighbour's wall, a
  ground-level tree)
- whether the customer actually owns this roof
- photos of the roof and everything around the building — offer to ask the
  customer to send them on WhatsApp, so the designer gets real imagery for
  the 3D proposal without anyone travelling. Attached photos are kept with
  the survey and handed to the designer.

Anything entered here as told-by-the-customer is labelled reported, not
confirmed.

THE HONESTY LABEL — shown clearly, and carried onto the design and proposal:
"Roof measured from satellite imagery. A site visit will confirm
 dimensions, shading and electrical access."
This must read as confidence, not as a disclaimer to hide.

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- gaps freshly listed, nothing resolved
- some gaps answered by the customer, some deferred to a visit
- all gaps deferred — the survey still completes; the design just inherits
  the open questions
- ready to finish → the remote survey is saved to the lead and the
  designer can start

WHAT GOES WRONG:
- customer does not know their sanctioned load → deferred to the visit,
  not blocked
- a deferred gap is critical (no meter info at all) → flagged so the
  designer sees it before sizing

WIRE THESE — make them work in the prototype:
- "Finish remote survey" → back to the lead, survey saved, designer
                           notified; provenance label attached
- "Book a visit for the rest" → 5.1 booking, pre-filled
- back                   → 5.3

[+ NESTED VIEWPORT BLOCK — remote/desk emphasis]
```

---

# 5.6 · My visits today — the surveyor's home  *(physical)*

```
[+ EVERY-SURVEY-SCREEN block]

WHO: a surveyor (or a rep wearing the surveyor hat) starting their day.
This is their home screen, the equivalent of My Day for a seller.
GOAL: know where to go, in what order, and get moving with one tap.

HOLDS today's visits, each showing: customer name, address, the time
window, distance from here, and the kind of roof if known. One tap to
navigate (hand off to the phone's maps), one tap to call the customer.

Also reachable: visits later this week, and anything overdue or missed.

A visit is where the survey is actually executed — opening one begins the
guided capture (5.7).

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- a normal day with several visits
- empty — nothing assigned yet: say what will appear here and who assigns
  it, do not show a blank screen
- all visits done for the day — this should feel like an accomplishment
- a visit that was booked unassigned and this surveyor is picking it up
- offline — the list still loads from local data; a calm indicator shows
  sync is pending, and it never blocks starting a survey

WHAT GOES WRONG:
- running late / out of order → visits can be started in any order
- a visit for an address the surveyor cannot find → the address is
  correctable on the spot (feeds 5.7)

STRUCTURAL NOTE ON NAVIGATION: this is a top-level destination for a
surveyor — treat it as a home screen, not a nested flow. The starting of
a survey is the surveyor's primary action.

WIRE THESE — make them work in the prototype:
- tap a visit          → 5.7 Guided capture
- navigate / call      → hand to the OS
- a finished survey    → its 5.9 review, read-only

[+ APP VIEWPORT BLOCK]
```

---

# 5.7 · Guided capture  *(physical — offline is the normal case)*

```
[+ EVERY-SURVEY-SCREEN block]

WHO: a surveyor on the roof — in the sun, one hand free, often with one
bar of signal or none.
GOAL: capture everything remote could not, so nobody has to come back.

THE CONSTRAINT THAT SHAPES EVERYTHING: OFFLINE IS NORMAL, not an edge case.
Everything saves to the phone first. Sync happens later, in the background,
on its own. Capture must NEVER depend on the network. The camera opens
INLINE inside the flow — it must never bounce out to the phone's camera app,
because a photo taken there is lost to the survey.

GUIDED, STEP BY STEP, through these groups — each step skippable but then
flagged as missing:
- ROOF — photos from each corner and an overall shot, roof type,
  approximate dimensions
- ELECTRICAL — the meter photo (reading and sanctioned load must be
  legible), the main panel / DB photo, the existing load
- SHADING — anything tall nearby; this has its own detailed step (5.8)
- ACCESS — how material reaches the roof: stairs, lift, crane needed,
  narrow lane for a truck
- STRUCTURAL NOTES — visible cracks, roof age, existing waterproofing.
  OBSERVATIONS ONLY. The app records what is seen; it never declares the
  roof safe or unsafe.
- SURROUNDINGS — photos of what sits AROUND and BESIDE the building:
  neighbouring structures, the street side, tall things nearby that a
  satellite cannot judge from above. These are reference for the
  designer's 3D model and shading, not measurements.

PHOTOS FEED THE 3D DESIGN. Every photo is tagged to its group and travels
with the survey to the designer — they are what the design studio opens
when building the 3D proposal, so nothing is left behind on the phone.
Live capture opens the camera inline; a photo taken another way — a drone
shot, for example — can instead be ATTACHED. No numbers are auto-derived
from any photo.

A clear sense of progress through the groups. What is done, what is
skipped, what is left.

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- a fresh capture, nothing done
- partway through, some groups done, some skipped
- the inline camera open, taking a photo
- a photo taken, kept or retaken
- offline — everything works; a calm, persistent indicator shows captures
  are held locally and will sync later
- a draft being resumed after the app was closed or the battery died —
  nothing captured is lost

WHAT GOES WRONG:
- no signal → the whole flow works; pending items are shown calmly, never
  as errors
- phone storage full → warn BEFORE capture begins, offer to compress
- battery dies mid-survey → on reopen, the draft is restored exactly
- customer not home / gate locked → "Could not complete", pick a reason,
  which starts a reschedule (the customer gets one WhatsApp); the visit is
  not silently dropped
- roof not accessible (no stairs, locked terrace) → recorded as an access
  constraint the designer will see, not a failure
- wrong address → corrected here, and it updates the site record

WIRE THESE — make them work in the prototype:
- the shading step        → 5.8 Shading capture
- "Review before submit"  → 5.9 Review and submit
- "Could not complete"    → reason → reschedule flow → back to 5.6
- exit mid-way            → draft saved to the visit, resumable from 5.6

[+ NESTED VIEWPORT BLOCK — physical/mobile emphasis]
```

---

# 5.8 · Shading capture  *(physical)*

```
[+ EVERY-SURVEY-SCREEN block]

WHO: the surveyor, still on the roof, recording what will cast shadows.
GOAL: capture every tall thing near the roof and roughly how tall it is,
because shading is what a satellite most often misses.

HOLDS:
- a way to add an obstruction, photograph it, and estimate its height
- a simple sketch of the roof to tap-to-place where each obstruction sits
  relative to the array — tap to add, drag to position
- common types to pick quickly: water tank, mumty / stair box, parapet,
  tree, adjacent building, pole
- heights are estimated and labelled as estimates, not precise
- add as many as needed

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- no obstructions added yet
- several placed on the sketch, each with a photo and a rough height
- an obstruction being placed and sized
- editing or removing one already added
- offline — same as everywhere: it all works locally

WHAT GOES WRONG:
- height genuinely unknown → allow "unsure", flagged, rather than a false
  precise number
- an obstruction only shades in winter (low sun) → let the surveyor note
  that; it matters to the designer

WIRE THESE — make them work in the prototype:
- "Done"        → back to 5.7 with the shading step marked complete
- add photo     → the inline camera (never the OS camera app)

[+ NESTED VIEWPORT BLOCK — physical/mobile emphasis]
```

---

# 5.9 · Review and submit  *(physical — the star of this mode)*

```
[+ EVERY-SURVEY-SCREEN block]

WHO: the surveyor, about to hand off to the designer.
GOAL: catch the one forgotten item that would cost a second trip — BEFORE
they leave the site.

MAKE THIS THE STRONGEST SCREEN IN THE PHASE. The surveyor's mistake is not
laziness; it is forgetting one thing. So this screen must, in plain
language, show:
- what was captured, group by group
- what is MISSING, said in consequence terms, not jargon: "Meter photo
  missing — the designer cannot size the system without it."
- what was FLAGGED (skipped on purpose, low confidence, height unsure)
- a total of photos and notes captured

Submitting hands the survey to the designer — the notes, the measurements
AND every photo (roof, obstructions, surroundings). Those photos are what
the design studio opens when building the 3D proposal, so the review must
show they are captured and going with it. It should be possible to jump
back to any group to fix a gap before submitting.

SUBMIT IS ALLOWED EVEN WITH GAPS — the surveyor is not trapped on a roof by
a validation wall — but every gap that remains is carried forward EXPLICITLY
so the designer sees exactly what is missing and who to ask. A forced-perfect
form that will not submit is worse than an honest, incomplete one.

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- everything captured, nothing missing — ready and clean
- meter photo (or another critical item) missing — flagged prominently
  with the consequence spelled out
- submitted while offline — queued to sync; the surveyor is told it will
  upload later and is free to move to the next visit
- submitted and synced — confirmed, handed to the designer
- a REVISIT of a site already surveyed — saved as a new version, the
  earlier survey preserved, never overwritten

WHAT GOES WRONG:
- surveyor submits anyway with the meter photo missing → allowed, but the
  designer inherits the explicit gap
- submit tapped with no signal → it queues; it does not fail or lose data

WIRE THESE — make them work in the prototype:
- "Fix" on any gap   → back to that group in 5.7 / 5.8
- "Submit"           → confirmation → designer notified → back to 5.6
- offline submit     → queued; see 5.10 for the sync picture

[+ NESTED VIEWPORT BLOCK — physical/mobile emphasis]
```

---

# 5.10 · Sync and offline status  *(physical)*

```
[+ EVERY-SURVEY-SCREEN block]

WHO: a surveyor who has done several visits, some captured with no signal.
GOAL: reassure that nothing is lost and show what is still waiting to
upload — without ever nagging or blocking.

HOLDS a calm, honest picture of what is local and what has synced:
"3 surveys waiting · 47 photos · will upload on Wi-Fi." Per-survey status:
captured / uploading / uploaded. A manual "upload now" is available but
never required — sync is a background fact, not a task.

STATES — switch the alternatives from a header chip on ONE frame pair
(never separate static frames); sheets, the camera and next steps are
reached by wiring, not the chip:
- everything synced — quiet, nothing to do
- several surveys and photos pending, offline — reassuring, not alarming
- uploading in progress, on Wi-Fi
- a photo failed to upload → it retries on its own; the surveyor is not
  asked to babysit it
- storage running low locally → a calm heads-up with the option to upload
  and free space

THE TONE RULE: pending sync is normal life for a field surveyor in India.
This screen must reassure, never scold. It is visible when wanted and
silent when not — it must never block starting or finishing a survey.

WIRE THESE — make them work in the prototype:
- reachable from        → 5.6 (a small, non-blocking indicator) and 5.9
- "Upload now"          → starts a sync, still non-blocking

[+ NESTED VIEWPORT BLOCK — physical/mobile emphasis]
```

---

## After Phase 5 — STOP

Run the nine-point review gate in `build-plan.md`, plus these specific to this phase:

- Is the **remote-vs-physical choice** honest and obvious — and does the app steer to the
  right one rather than treating them as interchangeable?
- Does every remote figure carry **"measured from satellite imagery"**, and does the honesty
  label reach the design and proposal?
- On the review-detection screen, is **nothing applied silently** — is every detection
  genuinely accept / adjust / reject, with confidence shown per detection?
- Is **coverage failure never a dead end**?
- Does the **entire physical capture flow work with the network off**, and does the camera
  stay **inline** rather than bouncing to the OS camera app?
- Does the **review-and-submit** screen state a missing item as a **consequence** ("the
  designer cannot size the system without it"), and does it still let an honest, incomplete
  survey through rather than trapping the surveyor?
- Do **structural notes read as observations**, never as a safety verdict?
- Is a **revisit versioned**, never an overwrite?
- Does **sync status reassure without nagging or blocking**?

Then bring all ten back before Phase 6.
