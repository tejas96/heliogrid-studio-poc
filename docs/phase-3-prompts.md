# Phase 3 — The Money Path  ▸ 6 screens

**The highest-traffic surface in the product.** Every deal passes through the proposal
builder, and many never touch the design studio at all.

Reference: `product-journey.md` Stage 6 and Stage 6B.
Worklist and review gate: `build-plan.md`.

> **Phase convention from here on:** each phase gets its own prompt file
> (`phase-3-prompts.md`, `phase-4-prompts.md`, …) so no single file grows unmanageable.
> `build-plan.md` stays the index and the tracker.

---

## What Phase 3 must establish

| Pattern | Set by | Reused by |
|---|---|---|
| Multi-step wizard shell | 3.1 | all 11 steps |
| Dense form + live calculation | 3.2 | steps 4, 5 |
| Selection with a required gate | 3.3 | catalog, kits |
| Repeating rows that must total 100% | 3.4 | payment tracking (Phase 7) |
| Document preview | 3.5 | customer link (Phase 4) |
| Share + tracked link | 3.6 | progress link (Phase 7) |

---

## The viewport block — attach to EVERY prompt in this phase

```
BOTH VIEWPORTS, one design, genuinely different layouts:

· MOBILE 375px — bottom arc nav where the shell shows it, single column,
  content as cards, primary action within thumb reach, secondary panels
  open as bottom sheets

· DESKTOP 1440px — NO bottom nav. A 240px left sidebar with icons AND
  text labels. Multiple columns. Denser rows, not cards. Secondary
  panels open beside the content, not over it. Rows have hover states.

Same data and copy in both. Desktop is not a stretched phone — if the
two layouts look alike, the desktop one is wrong.

Place them side by side on one canvas, mobile left, desktop right,
aligned to the same top edge.
```

---

# 3.1 · Entry + the 11-step shell

```
Design the proposal builder ENTRY and its 11-step SHELL.

WHO: a sales rep or designer starting a proposal for Priya Sharma,
8.2 kWp residential, Nashik
GOAL: choose how this proposal gets built, then move through 11 steps
without losing their place

── PART A · ENTRY ──
Opened from a lead via "Create proposal". Three routes, as cards:

1. WITH A DESIGN — "Use the design you built. System size, generation,
   savings and components are filled in from it." Show it as recommended
   when a design exists.
2. WITHOUT A DESIGN — "Enter the system yourself. Faster, but generation
   and savings will be estimates until a survey confirms them."
3. DUPLICATE AN EARLIER PROPOSAL — "Same as the Kulkarni proposal, new
   customer." A searchable list of recent proposals. This is the fastest
   route and most residential jobs should use it.

── PART B · THE SHELL ──
Wraps all 11 steps:

STEP LIST — in order:
1 Company · 2 Achievements · 3 Solar System · 4 Performance ·
5 Financial · 6 Timeline · 7 Payment Terms · 8 Components ·
9 Terms & Conditions · 10 Client Details · 11 Bank Details

MOBILE step indicator: a single compact row — "‹ 3 / 11 · Solar System ›"
Tapping it opens the full 11-step list as a bottom sheet with each step's
state. DO NOT put 11 chips in a horizontal scroller at 375px.

DESKTOP step indicator: the full 11-step rail across the top, each step
tappable, showing its state.

STEP STATES in both: not started · in progress · complete · has errors ·
skipped (for the two optional steps, 2 and 9)

FOOTER: ‹ Back · "3 / 11 · Solar System" · Next ›
On step 11 the button becomes "Generate proposal".

NAVIGATION RULE — important: steps can be visited in ANY order. Do not
block Next on incomplete fields. Mark incomplete steps in the list and
block only the final "Generate proposal", which jumps to the first step
with a problem. People work out of order; validate at the end.

SAVING: every field commits on blur. A draft always exists and is
resumable from the lead. Show a quiet "Saved" indicator, never a Save
button.

STATES TO SHOW:
- Entry with all three routes
- Entry when NO design exists (route 1 disabled with a reason)
- Shell on step 3, mobile and desktop
- The mobile step list sheet, open, with mixed step states
- A draft resumed at step 7 — "Draft · 7 of 11" shown on the lead

[+ VIEWPORT BLOCK]
```

---

# 3.2 · Step 3 — Solar System Setup

**The densest screen in the product.** If this works, the other ten steps are easy.

```
Design step 3 of the proposal builder — "Solar System Setup".

WHO: a rep, sometimes sitting in the customer's living room
GOAL: enter the system and its pricing, and show what the customer pays

Use the 11-step shell from 3.1.

── GROUP 1 · LOCATION ──
State (required) · District (required)
Pre-filled from the lead where known.

── GROUP 2 · SYSTEM ──
- System capacity in kW (required, 0.5 to 7000)
- System type (required) — segmented: ONGRID · OFFGRID · HYBRID

── GROUP 3 · BATTERY ──
A card with "Add battery backup".
- If ONGRID: optional
- If OFFGRID or HYBRID: show a warning that a battery is required, and
  block Generate until one is added
- Once added, the card becomes a summary with Edit and Remove

BATTERY SHEET (opens from the card):
- Capacity kWh (1 to 100)
- Cost, with excl./incl. GST toggle
- GST on battery %
- Cell chemistry — Lithium LFP · Lithium NMC · Lead-acid · Custom
  (Custom reveals a free-text field)
- Cancel · Save

── GROUP 4 · CATEGORY & SERVICE ──
- Category (required) — Residential · Commercial
- AMC (required) — Free AMC · No AMC · 1 to 8 years
- Commissioning included — toggle

── GROUP 5 · PRICING & SUBSIDIES ──
- System cost excluding battery, incl. GST (required)
- The same excluding GST (linked — editing one updates the other)
- GST % (required)
- GST amount — calculated, read only
- Subsidy ₹ (required) — labelled "PM Surya Ghar"
- Discount (required) — with a % ⇄ ₹ mode switch
- Easy financing EMI — toggle; when on, reveals EMI interest rate
  (0 to 100%)
- Electricity tariff ₹/kWh (required, 1 to 50)

── THE CLIENT-PAYABLE CARD ──
Visually distinct, updates live:
  System cost        ₹4,52,471
  + Battery              ₹0
  − Subsidy           ₹78,000
  − Discount          ₹22,624
  ─────────────────────────────
  Client pays        ₹3,51,847

Use these realistic values: 8.2 kW, Maharashtra / Pune, ₹4,52,471 incl.
GST at 13.8%, ₹78,000 subsidy, 5% discount.

── VALIDATION ──
- Capacity outside 0.5–7000 → "Capacity must be between 0.5 and 7000 kW"
- GST % empty → required
- Tariff outside 1–50 → "Tariff looks wrong. Enter ₹1 to ₹50 per unit."
- Discount driving client-payable to ₹0 or below → warn clearly, show
  the negative figure, and block Generate
- OFFGRID or HYBRID without a battery → "This system type needs a
  battery"
- Validate on blur. Once an error shows, clear it as soon as it is
  fixed. Never wipe what they typed.

── STATES TO SHOW ──
1. Empty, freshly opened
2. Fully filled, with the client-payable card populated
3. Battery sheet open
4. HYBRID selected with no battery — the warning
5. Discount pushed too far — payable at or below zero
6. Filled from a DESIGN (Path A) — the capacity and cost fields show
   they came from the design and are marked derived
7. Filled WITHOUT a design (Path B) — same fields, typed by hand

MOBILE: groups as stacked cards, the client-payable card sticky at the
bottom above the footer so it is always visible while editing.
DESKTOP: two columns — inputs on the left, the client-payable card
pinned in the right column.

[+ VIEWPORT BLOCK]
```

---

# 3.3 · Step 8 — Components (+ kits)

```
Design step 8 of the proposal builder — "Components".

WHO: a rep who needs five component categories filled before they can
generate anything
GOAL: complete all five in seconds, not minutes

COMPONENTS ARE MANDATORY. All five categories must be selected before
Generate. There are no lump-sum proposals.

── APPLY A KIT — at the top, before anything else ──
An EPC sells the same three or four combinations repeatedly, so:
  [Apply a kit ▾]  → "5 kW Residential — Standard"
                     "10 kW Residential — Premium"
                     "C&I 100 kW — Standard"
One tap fills all five categories. The rep can then adjust any of them.
If no kit exists yet, show "Save these as a kit" once all five are
filled.

── THE FIVE CATEGORIES ──
Panel · Inverter · Cable · Electrical · Structure
(+ Battery appears as a sixth only when a battery was added in step 3)

Each category shows:
- Its name and a Selected / Empty state
- When selected: brand row(s) with edit ✎ and remove ✕
- Panel and Inverter also show a count field
- A ＋ to add

Example filled state:
  Panel       ✓  AESOLAR CMER-132BDS 610 Wp  ×12    ✎ ✕
  Inverter    ✓  Growatt MIN 5000TL-X         ×2    ✎ ✕
  Cable       ✓  Polycab 4 sq.mm Cu                 ✎ ✕
  Electrical  ✓  Standard AC/DC protection kit      ✎ ✕
  Structure   ✓  GI elevated table, 2.5 m           ✎ ✕

── FOOTER — this is the GATE, not a status ──
"Components Selected 5 / 5 ✓"
When incomplete: "Components Selected 3 / 5" and Generate is blocked.

── COMPONENT EDIT SHEET — per type ──
Brand name is locked (chosen when adding). Then type-specific fields:

Panel      — Watt peak range · Panel type (Mono PERC / TOPCon /
             Bifacial / Mono / Poly / HJT / Thin-film) · Product warranty ·
             Performance warranty
Inverter   — Capacity kW · Type (On-grid / Off-grid / Hybrid) · Warranty
Cable      — Cable type · Specification · Warranty
Electrical — Includes · Standard
Structure  — Warranty · Weight per kW · Standard
Battery    — Capacity kWh · Chemistry · Warranty

All types also have: Description, max 110 characters with a live count.
Cancel · Done.

── STATES TO SHOW ──
1. Empty — nothing selected, "0 / 5", kit picker prominent
2. A kit applied — all five filled in one action
3. Partially filled — 3 / 5, the two gaps obvious
4. The block: user taps Generate with gaps → jumps here, highlights the
   missing categories, offers "Apply a kit" right there rather than
   dumping them into a catalog
5. Component edit sheet open, for a Panel
6. Filled automatically from a DESIGN (Path A) — components come from
   the bill of materials, marked as derived, still editable
7. Battery present — six categories instead of five

MOBILE: categories as stacked cards, edit opens as a bottom sheet.
DESKTOP: a two-column grid of categories, edit opens in a side panel.

[+ VIEWPORT BLOCK]
```

---

# 3.4 · Step 7 — Payment terms

```
Design step 7 of the proposal builder — "Payment Terms".

WHO: a rep setting out how the customer pays across the project
GOAL: tranches that add to exactly 100%, fast

── TEMPLATES — at the top ──
[10 / 60 / 20 / 10]  [30 / 60 / 10]  [50 / 50]  [↺ Reset]
One tap fills the rows. These are the combinations Indian EPCs actually
use.

── TRANCHE ROWS ──
Each row: a label, a percentage, and a remove ✕.
Default set:
  On booking                    10%   ₹35,185
  On material dispatch          60%   ₹2,11,108
  On installation               20%   ₹70,369
  On commissioning              10%   ₹35,185

Each row shows the RUPEE VALUE calculated live from the client-payable
figure in step 3. The percentage is what is entered; the rupee amount is
what the customer will actually care about.

＋ Add tranche

── THE 100% RULE ──
A progress bar across the top showing allocation.
- At 100%: "100% allocated ✓"
- Under: "88% allocated · 12% unallocated" — state the remainder, do not
  just say invalid
- Over: "112% allocated · 12% too much"
Generate is blocked unless it totals exactly 100%.

── VALIDATION ──
- A tranche of 0% → not allowed, remove it instead
- A negative percentage → not allowed
- An empty label → "Give this tranche a name" — the customer sees these
  words on the proposal
- Fewer than one tranche → at least one is required

── STATES TO SHOW ──
1. A template applied — a clean 100%
2. Under-allocated at 88%, remainder stated
3. Over-allocated at 112%
4. A custom set of six tranches
5. Empty label error on one row
6. Mid-edit: a row being dragged or reordered, if reordering is offered

── WHY THIS MATTERS DOWNSTREAM ──
These tranches become the project's payment collection schedule after
the deal is won. What is typed here is what gets chased later, so the
labels must read as milestones a customer would recognise.

MOBILE: rows stacked, percentage entry with a numeric keypad, the
progress bar sticky at the top.
DESKTOP: a table of rows with inline editing, progress bar above it.

[+ VIEWPORT BLOCK]
```

---

# 3.5 · Proposal preview

```
Design the Proposal PREVIEW — exactly what the customer will see, shown
to the rep before sharing.

WHO: a rep about to send a ₹4.5 lakh proposal to a homeowner
GOAL: confidence that what goes out is right

── WHAT IT SHOWS ──
A paginated document preview:

Page 1 — COVER
  Company logo and name · "Solar Proposal for Priya Sharma" ·
  Nashik, Maharashtra · proposal number · date · prepared by Rajesh Patil

Page 2 — YOUR SYSTEM
  8.2 kWp rooftop solar · ONGRID · 12 × 610 Wp panels ·
  Growatt 5 kW inverter · a 3D or site image if a design exists

Page 3 — WHAT YOU WILL GENERATE AND SAVE
  Annual generation 11,840 kWh · monthly savings ₹4,100 ·
  25-year savings ₹18.4 lakh · payback 4.6 years
  A simple generation or savings chart

Page 4 — YOUR INVESTMENT
  System cost ₹4,52,471 · subsidy −₹78,000 · discount −₹22,624 ·
  You pay ₹3,51,847
  Payment terms as the four tranches from step 7
  EMI option if enabled

Page 5 — WHAT IS INCLUDED
  The five component categories with brand, model and warranty

Page 6 — TIMELINE, TERMS, BANK DETAILS
  Project phases · terms and conditions · bank details if included

── THE HONESTY LABEL — required when there is no design ──
If this proposal was built WITHOUT a design (Path B), the document
carries a visible line, not fine print:

  "Indicative proposal. Generation and savings are estimated from
   system size and location. A site survey and shadow analysis will
   confirm the final figures."

If it WAS built from a design, no such line — those numbers are derived
from a real shading simulation.

── REP CONTROLS AROUND THE PREVIEW ──
- Page thumbnails or a page counter
- "Edit" jumps back to the relevant step
- Toggle: include the SLD / technical page (only when a design exists)
- Continue to share

── STATES TO SHOW ──
1. A complete proposal built FROM a design — no estimate label
2. The same proposal built WITHOUT a design — estimate label visible
3. A proposal missing something required — preview shows what is
   incomplete and links to that step
4. Generating — the PDF being produced

MOBILE: one page at a time, swipe between pages, pinch to zoom.
DESKTOP: continuous scroll with a page thumbnail rail on the left.

[+ VIEWPORT BLOCK]
```

---

# 3.6 · Share proposal + link tracking

```
Design the SHARE screen and the tracking that follows.

WHO: a rep who has just finished a proposal
GOAL: get it to the customer and know whether they looked at it

IMPORTANT: the app does NOT send anything. There is no WhatsApp
integration in v1. The rep sends it themselves from their own phone.

── THE SHARE SCREEN ──
Two primary actions, equally weighted:
  [ ⤓ Download PDF ]     [ 🔗 Copy link ]

Below them, a suggested message the rep can copy in one tap:

  "Namaste Priya, here is your solar proposal for the 8.2 kWp system
   at Nashik. Total after subsidy: ₹3,51,847. You can view it here:
   [link]. Happy to answer any questions."

Editable before copying. Saved as a reusable template.

Then: "Mark as shared" — this is what starts the clock and creates the
follow-up task. Explain it plainly: "We can't see your WhatsApp, so tell
us once you've sent it."

── AFTER SHARING — the tracking states ──
Shown on the lead and in My Day:

  Shared          21 Jul, 09:12   — you sent it
  Not opened      3 days           — link never tapped
  Opened          22 Jul, 21:40    — first open
  Viewed          4 min 20 s       — how long
  Opened again    24 Jul           — repeat opens are a buying signal

There is NO "delivered" state. We do not control the sending, so we
cannot know it arrived — only whether the link was opened. Do not invent
a delivered tick.

── WHAT HAPPENS AUTOMATICALLY ──
- A follow-up task is created for +2 days, owned by the rep
- If the link is not opened for 3 days, the voice agent may call
- When the customer opens it, the rep gets a notification

── STATES TO SHOW ──
1. Ready to share — PDF and link buttons, message preview
2. Marked as shared, waiting — "Not opened yet · shared 2 hours ago"
3. Opened — with time and duration
4. Opened several times — shown as a signal, not just a count
5. Never opened after 5 days — visually urgent, with the agent
   escalation noted
6. Customer accepted — the terminal happy state

MOBILE: the two share actions as large buttons, message in a card below.
DESKTOP: share panel on the left, live tracking timeline on the right.

[+ VIEWPORT BLOCK]
```

---

## After Phase 3 — STOP

Run the review gate in `build-plan.md`, plus these five specific to this phase:

- Does the 11-step shell work at 375px **without** a horizontal chip scroller?
- Is step 3 readable with every pricing field visible, and is the client-payable card
  always in view while editing?
- Does the mandatory-components gate feel **helpful** — offering a kit — rather than
  punishing?
- Do the payment tranches show rupee values, not just percentages?
- Does the estimate label on a Path B proposal read as **confidence** rather than hedging?

Then bring all six back before Phase 4.
