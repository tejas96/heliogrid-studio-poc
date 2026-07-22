# Phase 3 — Proposals, complete  ▸ ONE page, ONE prompt

**Replaces the eight separate prompts in `phase-3-prompts.md`.** Delete whatever was built
for proposals in Claude Design and run this once.

Reference: `product-journey.md` Stage 6 and 6B; decisions D19, D21, D22, D32.

---

## What was missing before

The earlier prompts covered the builder but not the feature. This adds:

| Missing | Why it matters |
|---|---|
| **Proposals list** | There was no way to see all proposals at all |
| **Navigation** | No entry point — sidebar on desktop, More on mobile |
| **Standalone creation** | A walk-in customer forced you to create a lead first, then start over |
| **Versions** | The journey says a change creates v2 and preserves v1. No screen showed it. |
| **Discount request + approval** | D19 says the owner approves *every* discount. A two-screen workflow that did not exist — so step 3's discount field wrote a number nobody approved. |
| **BOM detail** | Path A's line items had nowhere to be seen |

---

## ⚠️ A note on size

This is roughly 3× Phase 4. If the output comes back shallow, split at the line marked
**`── SPLIT HERE IF NEEDED ──`** and run the two halves as separate prompts onto the same
page.

---

# THE PROMPT

```
Design the complete PROPOSALS area of a solar EPC app. Everything below
goes on ONE page as frames laid side by side. Do NOT create a separate
page per screen or per state.

Every screen must be shown at BOTH sizes, side by side:
· MOBILE 375px   · DESKTOP 1440px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
An Indian solar EPC company sells rooftop and commercial solar. A
proposal is the customer-facing document containing the system, the
generation estimate, the price and the terms. It is built in 11 steps.

Users here: sales reps (build and share), owners (approve discounts),
designers (build from a design).

Money is Indian: ₹4,52,471 — never ₹452,471. System sizes in kWp.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NAVIGATION — where Proposals lives
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESKTOP: "Proposals" is an item in the left sidebar, alongside My Day,
Leads, Projects and Settings.

MOBILE: the bottom navigation is an arc bar with five slots —
My Day · Leads · [+ Add lead] · Projects · More.
"Proposals" lives under MORE. Show the More sheet open, listing:
Proposals · Designs · Customers · Reports · Settings · Profile.

THIRD ENTRY: from a lead's detail screen, an action "Create proposal".

Show all three entry points.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK 1 — THE PROPOSALS LIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The landing screen for this area.

EACH ROW SHOWS: customer name · city · system size · value · status ·
version · last activity date.

STATUSES, each visually distinct:
  Draft              · still being built, shows "7 of 11"
  Pending approval   · a discount is awaiting the owner
  Ready              · complete, not yet shared
  Shared             · sent, link not opened
  Opened             · customer viewed it
  Accepted           · customer said yes
  Rejected           · customer said no
  Expired            · past its validity date

USE THESE TEN ROWS:
  Priya Sharma · Nashik · 8.2 kWp · ₹4,52,471 · Shared · v1 · 2d ago
  Anand Traders · Pune · 180 kWp · ₹92,00,000 · Opened · v2 · 4h ago
  Suresh Kulkarni · Kothrud · 6.5 kWp · ₹3,40,000 · Draft 7/11 · v1 · 1d
  Rohit Mehta · Aundh · 10 kWp · ₹5,60,000 · Pending approval · v1 · 3h
  Deshmukh Textiles · Nashik · 250 kWp · ₹1,28,00,000 · Accepted · v3 · 5d
  Kavita Joshi · Wakad · 7.6 kWp · ₹4,10,000 · Ready · v1 · today
  Vikram Deshpande · Baner · 5.4 kWp · ₹2,90,000 · Rejected · v1 · 8d
  Imran Shaikh · Camp · 14 kWp · ₹7,80,000 · Opened · v1 · 1d ago
  Sunita Deshmukh · Hadapsar · 4.8 kWp · ₹2,65,000 · Expired · v1 · 32d
  Ganesh Patil · Chinchwad · 9.1 kWp · ₹4,95,000 · Shared · v2 · 6h ago

CONTROLS: search by customer or proposal number · filter by status ·
sort by date, value or status · a visible count and filter state
("10 proposals · Shared · this month").

ROW ACTIONS: open · duplicate · share · delete (drafts only).

PRIMARY ACTION: "New proposal".

STATES: normal list · empty (no proposals ever) · filtered-empty (these
are DIFFERENT messages) · loading skeleton.

MOBILE: cards. DESKTOP: table with sticky header, sortable columns, row
hover, bulk select.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK 2 — CREATING A PROPOSAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 OF ENTRY — WHO IS IT FOR?
Only asked when started from the Proposals list (from a lead it is
already known).
- A search field: "Search existing leads and customers"
- Results as you type
- OR "New customer — not in the system yet"

THE NEW-CUSTOMER PATH IS IMPORTANT: a walk-in or a phone enquiry must
not force the rep to create a lead first and start over. Choosing it
goes straight into the builder. The lead is created automatically from
step 10 (Client Details) when the proposal is generated. Say so plainly
on screen: "We'll add them to your leads automatically."

STEP 2 OF ENTRY — HOW SHOULD IT BE BUILT?
Three cards:
1. FROM A DESIGN — "System size, generation, savings and components come
   from the design." Marked recommended when a design exists; disabled
   with a reason when none does.
2. WITHOUT A DESIGN — "Enter the system yourself. Faster, but generation
   and savings are estimates until a survey confirms them."
3. DUPLICATE AN EARLIER PROPOSAL — a searchable list of recent ones.
   Its components and terms come across. Most residential jobs are
   near-identical, so this is the fastest route.

STATES: entry from the list (both questions) · entry from a lead (only
the second question) · new-customer chosen · duplicate picker open ·
"from a design" disabled because none exists.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK 3 — THE 11-STEP SHELL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Wraps every step below.

⚠️ NO BOTTOM NAVIGATION anywhere in the builder. It is a nested flow
entered from a lead or the list and exited by finishing or cancelling.
Mobile builder screens are FULL SCREEN with a close ✕ in the header.
On desktop the sidebar stays but the builder fills the content area.

THE STEPS:
1 Company · 2 Achievements · 3 Solar System · 4 Performance ·
5 Financial · 6 Timeline · 7 Payment Terms · 8 Components ·
9 Terms & Conditions · 10 Client Details · 11 Bank Details

MOBILE step indicator: one compact row — "‹ 3 / 11 · Solar System ›".
Tapping it opens the full step list as a bottom sheet. DO NOT put 11
chips in a horizontal scroller at 375px.

DESKTOP step indicator: the full 11-step rail across the top.

STEP STATES: not started · in progress · complete · has errors ·
skipped (only steps 2 and 9 are optional).

FOOTER: ‹ Back · "3 / 11 · Solar System" · Next ›
On step 11 the button becomes "Generate proposal".

NAVIGATION RULE: steps are visitable in ANY order. Do NOT block Next on
incomplete fields. Mark incomplete steps in the list and block only
"Generate proposal", which jumps to the first problem.

SAVING: every field commits on blur. A draft always exists and is
resumable. Show a quiet "Saved", never a Save button.

── SPLIT HERE IF NEEDED ──

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK 4 — THE 11 STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 · COMPANY
Phone (LOCKED, "from your account") · Company name (required) ·
Email (LOCKED) · Website · Company address · Company logo with "Change
logo", max 5 MB, PNG or JPG.
→ After Next, a PROPOSAL TYPE sheet: CAPEX (purchase outright) or
  OPEX / PPA (per-unit billing, PRO badge). Back · Continue.
Validation: company name required; oversized logo states the actual size.

STEP 2 · ACHIEVEMENTS (optional, skippable)
About your company (textarea, "shown on the cover") · Total capacity
installed kW → "200 kW" · Happy customers → "350+" · Cities served →
"10+". Numbers only, units added automatically.

STEP 3 · SOLAR SYSTEM  ← THE DENSEST SCREEN, design it most carefully
Location: State (required) · District (required)
System: capacity kW (required, 0.5–7000) · type segmented
  ONGRID / OFFGRID / HYBRID
Battery card: "Add battery backup". OFFGRID or HYBRID force a warning
  that a battery is required and block Generate without one. Once added
  the card becomes a summary with Edit and Remove.
  BATTERY SHEET: capacity kWh (1–100) · cost with excl./incl. GST
  toggle · GST on battery % · chemistry (Lithium LFP · Lithium NMC ·
  Lead-acid · Custom, which reveals a text field). Cancel · Save.
Category (required): Residential · Commercial
AMC (required): Free AMC · No AMC · 1–8 years
Commissioning included: toggle
Pricing: system cost excl. battery incl. GST (required) · the same
  excl. GST (linked — editing one updates the other) · GST % (required) ·
  GST amount (calculated, read-only) · Subsidy ₹ (required, "PM Surya
  Ghar") · Discount (required, with a % ⇄ ₹ switch) · Easy financing EMI
  toggle revealing an interest rate 0–100% · Electricity tariff ₹/kWh
  (required, 1–50)

CLIENT-PAYABLE CARD — visually distinct, live:
    System cost      ₹4,52,471
    + Battery            ₹0
    − Subsidy         ₹78,000
    − Discount        ₹22,624
    ──────────────────────────
    Client pays      ₹3,51,847

Validation: capacity out of range · GST % required · tariff out of range ·
discount driving payable to ₹0 or below (warn, show the negative, block
Generate) · OFFGRID/HYBRID without a battery.
Validate on blur; clear the error as soon as it is fixed; never wipe
what was typed.
MOBILE: groups as cards, the payable card sticky above the footer.
DESKTOP: inputs left, payable card pinned right.

STEP 4 · PERFORMANCE METRICS
"✦ AI auto-fill" prominent · chart with Generation / Savings / ROI tabs ·
Efficiency-PR % (required, 50–100) · Monsoon dip % (required, 0–50) ·
Units per kW per day (required) · "↺ Reset to AI values" appears once
edited.
PROVENANCE: from a design these are DERIVED from a real shading
simulation; AI-filled without a design they are ESTIMATES. Label which.

STEP 5 · FINANCIAL DATA
Same "✦ AI auto-fill" and tabbed chart · Yearly savings ₹ · Payback
years · Lifetime savings in lakhs over 25 years · Electricity inflation %
(~6%) · Reset.
Validation: payback over 25 years warns "longer than the system's
expected life"; inflation above 15% warns as unrealistic.

STEP 6 · PROJECT TIMELINE
Reorderable rows (⌃ ⌄ 🗑), each Title + Description with character
counts. Defaults:
  Site survey & design 2 days · Material procurement 5–7 days ·
  Installation 1–2 days · Net metering & DISCOM approval 3–6 weeks ·
  Commissioning & handover 1 day
"↺ Reset to system default" · "＋ Add step".
At least one phase required; empty fields block Generate.

STEP 7 · PAYMENT TERMS
Templates: [10/60/20/10] [30/60/10] [50/50] [↺ Reset]
Rows: label + % + ✕, each showing the RUPEE VALUE calculated live from
the client-payable figure:
  On booking             10%   ₹35,185
  On material dispatch   60%   ₹2,11,108
  On installation        20%   ₹70,369
  On commissioning       10%   ₹35,185
"＋ Add tranche".
Progress bar. At 100%: "100% allocated ✓". Under: "88% allocated · 12%
unallocated" — state the remainder. Over: "112% allocated · 12% too
much". Generate blocked unless exactly 100%.
Validation: no 0% or negative tranches · empty label ("the customer sees
these words") · duplicate labels warned · changing step 3's payable
figure recalculates every rupee value and FLAGS it so the rep notices.
These tranches become the project's collection schedule after the deal
is won, so labels must read as milestones a customer recognises.

STEP 8 · COMPONENTS  ← MANDATORY, this is a gate
All five categories must be selected before Generate. There are no
lump-sum proposals and there are no saved "kits".
Components arrive three ways: from a DESIGN (the bill of materials fills
all five) · from a DUPLICATED proposal · picked by hand from the
company's catalog.

Categories: Panel · Inverter · Cable · Electrical · Structure
(+ Battery, only when a battery was added in step 3)
Each shows Selected/Empty, brand rows with ✎ and ✕, and a ＋ to add.
Panel and Inverter also have count fields.
  Panel       ✓  AESOLAR CMER-132BDS 610 Wp  ×12    ✎ ✕
  Inverter    ✓  Growatt MIN 5000TL-X         ×2    ✎ ✕
  Cable       ✓  Polycab 4 sq.mm Cu                 ✎ ✕
  Electrical  ✓  Standard AC/DC protection kit      ✎ ✕
  Structure   ✓  GI elevated table, 2.5 m           ✎ ✕

FOOTER IS THE GATE, not a status: "Components Selected 5 / 5 ✓".
Incomplete shows "3 / 5" and blocks Generate — tapping Generate jumps
here and highlights the missing categories.

COMPONENT EDIT SHEET, per type. Brand name locked, then:
  Panel      Watt peak range · Panel type (Mono PERC / TOPCon /
             Bifacial / Mono / Poly / HJT / Thin-film) · Product
             warranty · Performance warranty
  Inverter   Capacity kW · Type (On-grid / Off-grid / Hybrid) · Warranty
  Cable      Cable type · Specification · Warranty
  Electrical Includes · Standard
  Structure  Warranty · Weight per kW · Standard
  Battery    Capacity kWh · Chemistry · Warranty
All types: Description, max 110 characters with a live count.
Validation:
- Panel or Inverter count of 0 or blank → "Enter how many"
- Negative count → not allowed
- Description over 110 characters → the counter turns to a warning and
  Done is blocked; the text is NOT silently truncated
- Removing the last brand from a category returns it to Empty and the
  footer counter drops
- A battery was added in step 3 but no battery component is selected →
  blocked with "This system has a battery — add the battery component"

STEP 9 · TERMS & CONDITIONS (optional, up to 3 pages)
Add / Skip choice. When added: include-logo toggle · rich-text toolbar
and editor · "Save as template" · live character count · approximate PDF
page count. Warn above 3 pages.

STEP 10 · CLIENT DETAILS  ← this is what creates the lead
Proposal number (auto, disabled, e.g. HG-2026-0142) · Prepared by
(required, defaults to the signed-in user) · Prepared for (required) ·
Client address (required) · Client phone (required, 10 digits) · Date
(required, defaults to today) · Time generated (auto) · Customer support
number (optional).
When the proposal was started for a NEW CUSTOMER, show a quiet line:
"These details will create a new lead when you generate this proposal."
Validation: phone 10 digits starting 6–9 · required fields · date not in
the past · duplicate phone warns "A lead with this number already
exists" and offers to link to it instead of creating another.

STEP 11 · BANK DETAILS (optional)
"Include bank details in the proposal" toggle, off by default · Bank
name · Account name · Account number · IFSC.
When off: "Your details are saved but will not be printed."
Validation: IFSC 11 characters, 4 letters + 0 + 6 alphanumeric →
"Example: HDFC0001234"; account number 9–18 digits.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK 5 — DISCOUNT REQUEST & APPROVAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE OWNER APPROVES EVERY DISCOUNT. Any discount entered in step 3 puts
the proposal into "Pending approval" and it cannot be shared until
approved.

REP SIDE — request:
A sheet after entering a discount: the amount and percentage, its effect
on the price, and a required reason ("Customer comparing two other
vendors"). Submit → the proposal shows "Pending approval · sent to
Rajesh" and Share is disabled with that explanation.

OWNER SIDE — approval queue:
A list of pending requests. Each shows: customer · system size ·
proposal value · discount asked · **the margin impact in ₹, not just a
percentage** · who asked · the reason · how long it has waited.
Actions per row: Approve · Reject with a reason · Approve a different
amount.
A bulk "Approve all" for small discounts.

REP NOTIFICATION: approved (Share becomes available) or rejected (with
the owner's reason, and the option to revise and resubmit).

STATES: request sheet · pending state on the proposal · owner queue with
4 requests · one approved · one rejected with a reason · empty queue.

⚠️ This is a known bottleneck past about three people. Design the
approval to be one tap from a notification, so it does not become the
thing that delays every deal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK 6 — PREVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Exactly what the customer will see, shown to the rep before sharing.
A paginated document: cover · your system · generation and savings ·
your investment with the payment stages · what is included · timeline,
terms and bank details.

HONESTY LABEL: if built WITHOUT a design, the document carries a visible
line — not fine print:
  "Indicative proposal. Generation and savings are estimated from system
   size and location. A site survey and shadow analysis will confirm the
   final figures."
If built FROM a design, no such line.

Controls: page navigation · "Edit" jumps to the relevant step · a toggle
to include the technical/SLD page when a design exists · Continue to
share.
STATES: from a design · without a design (label visible) · incomplete
(shows what is missing, links to that step) · generating.
MOBILE: one page at a time, swipe, pinch to zoom.
DESKTOP: continuous scroll with a page thumbnail rail.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK 7 — SHARE & LINK TRACKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE APP DOES NOT SEND ANYTHING. There is no WhatsApp integration. The
rep sends it from their own phone.

Two equal primary actions: [ ⤓ Download PDF ]  [ 🔗 Copy link ]
Below, a suggested message the rep can copy in one tap, editable:
  "Namaste Priya, here is your solar proposal for the 8.2 kWp system at
   Nashik. Total after subsidy: ₹3,51,847. You can view it here: [link].
   Happy to answer any questions."
Then "Mark as shared" — this starts the clock and creates the follow-up
task. Explain it: "We can't see your WhatsApp, so tell us once you've
sent it."

TRACKING STATES afterwards:
  Shared        21 Jul, 09:12
  Not opened    3 days
  Opened        22 Jul, 21:40
  Viewed        4 min 20 s
  Opened again  24 Jul          ← a buying signal
There is NO "delivered" state. We do not control the sending, so we
cannot know it arrived — only whether the link was opened. Do not invent
a delivered tick.

AUTOMATIC: a follow-up task at +2 days · if unopened for 3 days the
voice agent may call · the rep is notified when it is opened.

STATES: ready to share · shared and waiting · opened · opened several
times · never opened after 5 days (visually urgent) · accepted.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK 8 — VERSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A proposal can be revised after sharing. The original is never
destroyed.

VERSION LIST on the proposal: v1 shared 18 Jul · v2 shared 21 Jul
(current) · each with its value and status.

COMPARISON VIEW: v1 beside v2 showing only WHAT CHANGED —
  System         8.2 kWp        →  10.4 kWp
  Panels         12             →  16
  Price          ₹4,52,471      →  ₹5,68,200
  Discount       5%             →  8%
  Payment terms  unchanged
Plus a reason field: "Customer asked for a larger system".

RULES: the customer's link always shows the CURRENT version · earlier
versions stay readable internally · an accepted version is locked and
creating v3 requires confirmation.
STATES: single version (no comparison offered) · two versions compared ·
three versions · an accepted version locked.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCK 9 — BOM DETAIL (internal, Path A only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The line items behind the price, when the proposal came from a design.
INTERNAL ONLY — the customer never sees this.

Grouped by category (Modules · Inverter · Electrical BOS · Mechanical
BOS · Safety · Civil & Misc). Each line: item · spec · quantity · unit ·
rate · GST % · total. Category subtotals and a grand total.

⚠️ THIS IS THE DENSEST DATA IN THE PRODUCT — around 25 lines with 7
columns. On MOBILE it must NOT be a wide scrolling table. Use a card
list: item name, quantity and total on the card; tapping opens the full
detail as a sheet. On DESKTOP a real table with sticky header and
category grouping.

Each figure carries its provenance — measured, derived, estimated or
assumed — shown quietly beside it.
STATES: full BOM from a design · the mobile card list · a line's detail
sheet open · Path B (no BOM exists — explain why rather than showing an
empty table).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRAMES TO PRODUCE — all on ONE page, mobile and desktop side by side
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every state below is a required frame. Do not summarise them away.

 1. NAVIGATION
    a. Desktop sidebar with Proposals highlighted
    b. Mobile More sheet open, listing Proposals
    c. Lead detail showing the "Create proposal" action

 2. PROPOSALS LIST
    a. Normal, all ten rows, mixed statuses
    b. Empty — no proposals ever created
    c. Filtered-empty — filters match nothing (a DIFFERENT message)
    d. Loading skeleton matching the real row shape
    e. Row actions menu open
    f. Bulk select active (desktop)

 3. ENTRY
    a. Who is it for — search existing
    b. New customer chosen — "we'll add them to your leads"
    c. How to build — the three route cards
    d. "From a design" disabled because none exists
    e. Duplicate picker open, searching earlier proposals

 4. SHELL
    a. Mobile compact step indicator "‹ 3 / 11 ›"
    b. Mobile step-list sheet open, showing mixed step states
       (not started · in progress · complete · errors · skipped)
    c. Desktop 11-step rail
    d. A resumed draft — "Draft · 7 of 11" shown on the lead

 5. STEP 1 · COMPANY
    a. Empty  b. Filled, locked fields visibly locked
    c. Logo too large — error stating the actual file size
    d. Proposal type sheet open (CAPEX / OPEX-PPA)

 6. STEP 2 · ACHIEVEMENTS
    a. Empty  b. Filled  c. Skipped

 7. STEP 3 · SOLAR SYSTEM  ← most carefully designed
    a. Empty, freshly opened
    b. Fully filled, client-payable card populated
    c. Battery sheet open
    d. HYBRID selected with no battery — the warning
    e. Discount pushed too far — payable at or below zero, blocked
    f. Filled FROM A DESIGN (Path A) — capacity and cost show they came
       from the design, marked derived
    g. Filled WITHOUT a design (Path B) — same fields, typed by hand

 8. STEP 4 · PERFORMANCE
    a. AI-filled  b. Manually edited, "Reset to AI values" now visible
    c. Derived from a design vs estimated — the two labelled differently

 9. STEP 5 · FINANCIAL
    a. AI-filled  b. Edited  c. Unrealistic-payback warning

10. STEP 6 · TIMELINE
    a. Default phases  b. Reordered  c. A row mid-drag
    d. Empty-field error

11. STEP 7 · PAYMENT TERMS
    a. A template applied — a clean 100%
    b. Under-allocated at 88%, remainder stated
    c. Over-allocated at 112%
    d. A custom set of six tranches
    e. Empty label error on one row
    f. A row mid-drag / being reordered

12. STEP 8 · COMPONENTS
    a. Empty — "0 / 5", catalog picker prominent
    b. All five filled by hand
    c. Partially filled — "3 / 5", the two gaps obvious
    d. The block — Generate tapped with gaps, jumps here, gaps
       highlighted
    e. Component edit sheet open, for a Panel
    f. Filled automatically FROM A DESIGN (Path A), marked derived
    g. Battery present — six categories instead of five

13. STEP 9 · TERMS
    a. The Add / Skip choice  b. Editor with content
    c. Over three pages — warned

14. STEP 10 · CLIENT DETAILS
    a. Empty  b. Filled
    c. The new-customer note — "will create a new lead"
    d. Phone already exists — offers to link instead of duplicating
    e. Phone validation error

15. STEP 11 · BANK DETAILS
    a. Toggle off — "saved but will not print"
    b. Toggle on, filled  c. IFSC format error

16. DISCOUNT
    a. Request sheet with the required reason
    b. Proposal in "Pending approval", Share disabled with the reason
    c. Owner queue with four requests, margin impact in ₹
    d. One approved — Share now available
    e. One rejected with the owner's reason, revise-and-resubmit offered
    f. Empty queue

17. PREVIEW
    a. Built FROM a design — no estimate label
    b. Built WITHOUT a design — estimate label visible
    c. Incomplete — shows what is missing, links to that step
    d. Generating the PDF

18. SHARE & TRACKING
    a. Ready to share — PDF and link buttons, message preview
    b. Marked as shared, waiting — "Not opened · shared 2 hours ago"
    c. Opened — with time and duration
    d. Opened several times — presented as a buying signal
    e. Never opened after 5 days — visually urgent, agent escalation
       noted
    f. Customer accepted — the terminal happy state

19. VERSIONS
    a. Single version — no comparison offered
    b. Two versions compared, showing only what changed
    c. Three versions
    d. An accepted version, locked

20. BOM DETAIL (Path A only)
    a. Desktop table, grouped by category, with subtotals
    b. Mobile card list — NOT a scrolling table
    c. A single line's detail sheet open
    d. Path B — no BOM exists, explained rather than shown empty

Use these figures throughout: Priya Sharma · Nashik, Maharashtra ·
8.2 kWp · 12 panels · ₹4,52,471 system cost · ₹78,000 subsidy ·
₹22,624 discount · ₹3,51,847 payable · 11,840 kWh annual ·
Suryodaya Solar · Rajesh Patil.
```

---

## Review focus

- Is **Proposals** reachable from the sidebar, from More, and from a lead?
- Does the new-customer path genuinely avoid creating a lead first?
- Does step 10 explain that it will create the lead?
- Is the 11-step shell usable at 375px **without** a chip scroller?
- Does the components gate jump to the gaps rather than just refusing?
- Does the approval queue show **rupee margin impact**, not just a percentage?
- Is the BOM a **card list** on mobile, never a wide scrolling table?
- Does the version comparison show only **what changed**?
