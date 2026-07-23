# Phase 8 — Admin & settings  ▸ 8 screens

**Where a company makes the product theirs.** Almost everything a proposal shows — the logo,
the story, the components, the payment stages, the timeline, the terms, the bank details — is
a **tenant default configured here** and pre-filled into the proposal builder. This phase is
the home for all of it, plus the team and each person's own preferences. *(Billing &
subscription are deferred and planned separately — D38 — so there is no billing screen here.)*

Reference: `product-journey.md` — Tenant Configuration (A already built as the agent in
Phase 6; B & C here), Roles & Permissions, Multilingual; decisions **D24, D25, D27, D34, D38**
(D38 defers billing entirely). Worklist and review gate: `build-plan.md`.

---

## ⚠️ HOW TO USE THESE PROMPTS — read once

**Each prompt below is SELF-CONTAINED.** Copy the ONE fenced block for a screen and paste it
into Claude Design as-is — context, states, wiring, viewport and rules are already inside. The
prose outside the blocks is for **you**; don't paste it.

Baked into every block:
- No colours, hex or token names — the design system carries the look; you decide the layout.
- One page per screen, states swapped by a header chip (not separate static frames).
- A working prototype — actions wired, sheets open and close, no dead ends.
- **Connect, don't duplicate** — if a screen, action or nav already exists in the project,
  wire into it and extend it; never build a second copy.

---

## The one principle: defaults that work on day one (Tenant Config D)

- **Nothing is required on day one.** Every setting is pre-filled with a working default and a
  seeded example, so a company can send a real proposal without opening settings once.
- **Configure in context.** Most of these defaults are also created *from the proposal
  builder* ("save as template"). Settings is where they are **revisited and managed**, not
  where setup is forced.
- **Show the effect.** Config screens show a live preview — the proposal with your logo, the
  tranches as the customer sees them.
- **One Business profile feeds many places** — company name, logo, address and GSTIN are asked
  once and used by the proposal, the agent's script, the customer link and the invoice.

**Who sees what:** the company settings (8.1–8.7) are **owner-only** (Manage catalog / team /
catalog / team are Owner capabilities). **Profile & preferences (8.7) is every user's own.**

---

## 🔗 THE PROPOSAL-DEFAULTS MAP — every builder step's home is here

The proposal builder (Phase 3, built) pulls its pre-filled values from these screens. Wire the
config screen so its values are what the matching builder step shows:

| Proposal builder step (Phase 3) | Configured in |
|---|---|
| 1 · Company (name, logo, address, GSTIN, contact) | 8.2 Business profile & branding |
| 2 · Achievements / about (story, capacity, customers, **about-page image**) | 8.2 Business profile & branding |
| 3 · Solar system (subsidy, GST %, tariff, AMC defaults) | 8.4 Proposal defaults |
| 5 · Financial (inflation % default) | 8.4 Proposal defaults |
| 6 · **Timeline** (default phases + durations) | 8.4 Proposal defaults |
| 7 · **Payment terms** (named tranche templates) | 8.4 Proposal defaults |
| 8 · Components (**catalog + descriptions**, rates) | 8.3 Catalog & price book |
| 9 · **Terms & conditions** (default T&C, include-logo) | 8.4 Proposal defaults |
| 10 · Client details (support number, proposal number format) | 8.4 Proposal defaults |
| 11 · Bank details (default bank / account / IFSC) | 8.4 Proposal defaults |
| Share message (Phase 3.6) + follow-up nudges | 8.5 Message templates |

Other built things this phase connects to (don't rebuild): the **agent settings** (Phase 6)
are linked from the Settings home; **role decides the home screen** (Stage 1); the **More →
Profile / Settings** nav already exists.

---

## The screens, in order

```
  8.1  Settings home              (the hub; owner-only areas + lead sources)
  8.2  Business profile & branding (identity + story — feeds the proposal)
  8.3  Catalog & price book       (what they sell + rates, versioned)
  8.4  Proposal defaults & templates ← the one that pre-fills the builder
  8.5  Message templates          (WhatsApp proposal / follow-up / reminder)
  8.6  Team & roles               (six stackable presets)
  8.7  Profile & preferences      (per-user: language, name, notifications)
```
*(Billing is DEFERRED — planned separately, D38. No billing screen and no subscription
restrictions anywhere in the plan.)*

---

# 8.1 · Settings home

```
Design the SETTINGS HOME — the hub that organises everything a company can
configure. Use the selected design system; no colours or token names — you
decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner (Rajesh Patil, Suryodaya Solar), occasionally dipping into
settings to change one thing.
GOAL: find the right area fast, and see at a glance what's set up vs still
on defaults.

Reached from "Settings" in the More sheet (mobile) and the sidebar
(desktop). Organise the areas into clear groups, each a row/card that
opens its screen:
- BUSINESS — Business profile & branding (8.2) · Catalog & price book
  (8.3) · Proposal defaults & templates (8.4) · Message templates (8.5) ·
  Lead sources
- YOUR AGENT — Agent setup, knowledge, performance → these ALREADY EXIST
  (Phase 6). Link to them; do not rebuild.
- TEAM — Team & roles (8.6)
- ACCOUNT — Profile & preferences (8.7)  *(no Billing — deferred, D38)*

LEAD SOURCES is small enough to live here as an inline section: which
channels are live (manual quick-add, CSV import, inbound call via the
agent) — toggles, with website form / inbound WhatsApp shown as "later".

Each area shows a tiny status ("using defaults" / "customised") so the
owner knows what they've personalised. Nothing here is required — the
defaults already work.

ACCESS: this hub is owner-only for the company areas. A non-owner who
opens Settings sees only Profile & preferences (8.7).

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- owner view — all areas, most on defaults
- owner view — several areas customised
- non-owner view — only Profile & preferences visible
- lead-sources section expanded

WIRE THESE — make them work in the prototype:
- each area row → its screen (8.2–8.7)
- the agent rows → the existing Phase 6 agent screens (connect)
- reached from More → Settings and the desktop sidebar

VIEWPORTS — build both, one design: DESKTOP 1440px primary (owner at a
desk, the 240px sidebar stays), MOBILE 375px a simple list; nested, no
bottom nav on mobile (back ‹). Side by side, mobile left, desktop right;
desktop is not a stretched phone.
```

---

# 8.2 · Business profile & branding

```
Design BUSINESS PROFILE & BRANDING — the company identity that feeds the
whole product. Use the selected design system; no colours or token names —
you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner, setting up (or tidying) how the company appears to
customers.
GOAL: fill this once — it feeds the proposal (steps 1 & 2), the agent's
script, the customer link and the invoice.

IDENTITY:
- Company name (Suryodaya Solar) · logo · letterhead
- Brand colours used on CUSTOMER documents (the proposal PDF and link) —
  a small, safe set, with a live preview; this does NOT restyle the app
- Address · GSTIN · phone · email · website
Some fields are shared with the account (phone/email) — show those as
linked, not re-entered.

COMPANY STORY (feeds proposal step 2 — Achievements):
- About us — a short paragraph shown on the proposal cover
- Numbers: total capacity installed (200 kW) · happy customers (350+) ·
  cities served (10+)
- The ABOUT-PAGE IMAGE — a photo (team, an installation) shown on the
  proposal's about page. Constraints stated inline (max size, JPG/PNG).

LIVE PREVIEW: show the proposal cover / about page updating as they edit,
so the effect is visible.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); image upload / logo change are sheets:
- seeded defaults (a generic story), nothing personalised
- fully personalised, preview reflecting it
- uploading the logo / about image
- an invalid asset (too large / wrong format) — plain error, other fields
  kept

WIRE THESE — make them work in the prototype:
- reached from 8.1
- "Save" → confirmation; the values now pre-fill proposal steps 1 & 2
  (connect to the built builder)
- "Preview" → the proposal cover/about with these values

VIEWPORTS — build both, one design: DESKTOP 1440px primary (sidebar
stays), MOBILE 375px companion; nested, no bottom nav (back ‹). Side by
side, mobile left, desktop right; desktop is not a stretched phone.
```

---

# 8.3 · Catalog & price book

```
Design CATALOG & PRICE BOOK — the components a company sells and what they
cost. Use the selected design system; no colours or token names — you
decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner, curating the list the proposal builder's component step
(step 8) picks from.
GOAL: manage what they sell and its price, with old quotes protected.

THE CATALOG — grouped by the five categories (plus battery):
Panel · Inverter · Cable · Electrical · Structure · Battery.
Each product carries: brand, model, the type-specific spec (e.g. a panel's
watt-peak, type, warranties), a DESCRIPTION (the plain line the customer
reads on the proposal), and its warranty.
Add, edit, archive. Archived products stay attached to any proposal that
already used them.

THE PRICE BOOK — a rate per product, and it is VERSIONED: updating a rate
creates a new version; proposals already sent keep the rate they were
built with. Show the current rate and that history is kept.

Seeded with a realistic starter set (AESOLAR 610 Wp, Growatt 5 kW,
Polycab copper, a GI structure) the owner edits.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); add/edit a product is a sheet:
- the catalog, several products across categories
- adding / editing a product (its spec + description)
- a rate being changed — the "old quotes keep their price" note visible
- archiving a product still used by a draft → allowed, the draft keeps it,
  the product is archived not deleted
- an empty category — nothing added yet, explained

WIRE THESE — make them work in the prototype:
- reached from 8.1
- a saved product → available in the proposal builder's component picker
  (step 8) — connect
- "Edit rate" → version note → saved

VIEWPORTS — build both, one design. This is a DENSE screen: DESKTOP 1440px
primary as a table by category (sidebar stays); MOBILE 375px a card list
with an edit sheet, never a wide scrolling table. Side by side, mobile
left, desktop right; desktop is not a stretched phone.
```

---

# 8.4 · Proposal defaults & templates

```
Design PROPOSAL DEFAULTS & TEMPLATES — everything that pre-fills a new
proposal. Use the selected design system; no colours or token names — you
decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner, setting the defaults so every proposal starts 90% filled.
GOAL: one place to manage what pre-fills the builder — each section maps to
a builder step, and many are also editable in-context via "save as
template".

SECTIONS (each clearly labelled with the step it feeds):
- PAYMENT TERMS templates (→ step 7): named tranche sets that total 100% —
  10/60/20/10, 30/60/10, 50/50 — add / edit / set a default. These are the
  chips the builder offers.
- PROJECT TIMELINE templates (→ step 6): the default phases with durations,
  reorderable — Survey & design 2 days · Material 5–7 days · Installation
  1–2 days · Net metering & DISCOM 3–6 weeks · Commissioning 1 day.
- TERMS & CONDITIONS templates (→ step 9): default T&C text (rich, up to
  3 pages), an "include our logo" toggle; save several, mark one default.
- PROPOSAL COVER & SECTIONS (→ the proposal template): which sections
  appear, cover style.
- DEFAULT BANK DETAILS (→ step 11): bank name, account, IFSC, and the
  "include in proposal" default.
- FINANCIAL DEFAULTS (→ steps 3 & 5): subsidy (PM Surya Ghar), GST %,
  electricity tariff ₹/kWh, inflation %, AMC default, EMI interest —
  sensible India values pre-filled.
- OTHER DEFAULTS (→ step 10): customer support number, proposal number
  format (HG-2026-0142).

Everything is seeded and editable. A live preview shows a new proposal
built from these defaults.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); editing a template / section is a sheet:
- the sections overview, on defaults
- payment-terms templates being edited (a tranche set that must total 100%)
- the timeline template being reordered
- the T&C editor open (rich text, page-count warning past 3 pages)
- financial defaults being set
- a template saved from the builder appearing here (in-context creation)

WIRE THESE — make them work in the prototype:
- reached from 8.1
- each section's values → the matching proposal builder step (connect):
  payment terms → step 7, timeline → step 6, T&C → step 9, bank → step 11,
  financial → steps 3/5, support number → step 10
- "Preview a proposal" → the builder pre-filled from these defaults

VIEWPORTS — build both, one design: DESKTOP 1440px primary (sidebar
stays), MOBILE 375px with sections as an accessible list, editors as
sheets; nested, no bottom nav (back ‹). Side by side, mobile left, desktop
right; desktop is not a stretched phone.
```

---

# 8.5 · Message templates

```
Design MESSAGE TEMPLATES — the ready-to-paste messages the team sends. Use
the selected design system; no colours or token names — you decide the
layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner, setting the wording the team pastes into WhatsApp.
GOAL: consistent, editable messages with the right blanks filled in.

TEMPLATES, each editable, each with insertable placeholders (customer
name, system size, amount, link):
- Proposal share message (feeds Phase 3.6 Share) — "Namaste {name}, here
  is your solar proposal for the {size} system…"
- Follow-up nudge — a gentle reminder when a proposal is unopened
- Payment request reminder — reused by project payments (Phase 7)
Show each in the three languages the app supports (English · हिंदी ·
मराठी), since the customer may need a different one.

IMPORTANT: the app does NOT send — these are copy-paste templates the rep
pastes into their own WhatsApp (same rule as everywhere). Say so plainly.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); editing a template is a sheet:
- the templates on their seeded defaults
- one being edited, placeholders shown
- a language variant (Hindi) of the same template
- a preview with placeholders filled from a real example

WIRE THESE — make them work in the prototype:
- reached from 8.1
- the proposal message → used by the built Share screen (Phase 3.6) —
  connect
- the payment reminder → used by project Payments (Phase 7) — connect

VIEWPORTS — build both, one design: DESKTOP 1440px primary (sidebar
stays), MOBILE 375px companion; nested, no bottom nav (back ‹). Side by
side, mobile left, desktop right; desktop is not a stretched phone.
```

---

# 8.6 · Team & roles

```
Design TEAM & ROLES — who is on the team and what they can do. Use the
selected design system; no colours or token names — you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner, managing their team.
GOAL: invite people and grant access by picking roles — simply, with no
permission matrix to fight.

SIX FIXED PRESET ROLES (no custom-role builder in v1): Owner · Manager ·
Sales rep · Surveyor · Designer · Engineer. ONE PERSON CAN HOLD SEVERAL —
permission is granted if ANY held role grants it; lead visibility takes the
widest. This is how a small firm's "one person does three jobs" is solved.

THE TEAM LIST: each person with the roles they hold (as chips), status
(active / invited / removed), last active. Invite by phone number.
  Rajesh Patil — Owner
  Amit Deshmukh — Surveyor
  Meera Kulkarni — Manager
  Priya Nair — Sales rep · Surveyor

ASSIGN ROLES: a person with the six presets as toggles, and a LIVE
PLAIN-ENGLISH LINE that updates as they toggle: "Rajesh can sell, survey
and design." This line is how a non-technical owner verifies what they
granted.

ROLES REFERENCE (read-only in v1): the six presets and the capability
matrix, so an owner sees what each grants before assigning — and how many
people hold each.

PROJECT ROLES NOTE: project coordination (move stages, record payments,
upload docs) is the Manager role — there is no separate "coordinator"
preset. A dedicated Installer/crew role (the install checklist only) is
DEFERRED in v1; the coordinator runs the checklist for now.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); invite / assign are sheets:
- the team list with mixed roles and statuses
- assigning roles to one person, the plain-English line updating
- inviting a new person (name, phone, one or more roles)
- the roles reference (read-only matrix)
- an error: removing the last Owner, or leaving someone with no role at
  all → blocked with a plain explanation
- a person deactivated (never deleted) — their history stays attributed

WIRE THESE — make them work in the prototype:
- reached from 8.1
- "Invite" → the invite sheet → the person appears as "invited"
- "Assign roles" → toggles + live line → saved
- role decides that person's home screen (connect to Stage 1 / built homes)

VIEWPORTS — build both, one design: DESKTOP 1440px primary (sidebar
stays), MOBILE 375px a card list with sheets; nested, no bottom nav (back
‹). Side by side, mobile left, desktop right; desktop is not a stretched
phone.
```

---

# 8.7 · Profile & preferences (per-user)

```
Design PROFILE & PREFERENCES — each user's own settings. Use the selected
design system; no colours or token names — you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: ANY user — owner, rep, surveyor — managing their own account. This is
NOT owner-only; everyone reaches it.
GOAL: change your language, name, photo and notifications in seconds.

HOLDS (per-user, not per-company):
- LANGUAGE — English · हिंदी · मराठी (D25). Shown each in its own script.
  Defaults to the device locale; changing it re-renders the WHOLE app
  immediately, no reload. This is the headline setting — a Marathi
  surveyor and an English owner in the same company each pick their own.
- Name · photo
- Notifications — which push/in-app alerts they get (proposal opened,
  agent escalation, follow-up due, payment due…)
- Phone / email — shown as the account login, linked not freely editable
- Sign out

Reachable by everyone from More → Profile (mobile) and the sidebar
(desktop) — distinct from the owner-only company settings.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); the language picker and photo upload are sheets:
- the profile on defaults (device language)
- the language picker open, three scripts
- app shown AFTER switching to Hindi — labels in Devanagari, proving the
  layout survives (numbers/₹ stay Indian format)
- notifications being toggled

WIRE THESE — make them work in the prototype:
- reached from More → Profile and the sidebar (connect to built nav)
- picking a language → the app re-renders in it
- "Sign out" → confirm

VIEWPORTS — build both, one design. Genuinely used on MOBILE by field
users, so mobile is first-class; DESKTOP 1440px keeps the sidebar. Nested,
no bottom nav on mobile (back ‹). Side by side, mobile left, desktop
right; desktop is not a stretched phone.
```

---

## After Phase 8 — STOP

Run the nine-point review gate in `build-plan.md`, plus these specific to this phase:

- Can a company **send a real proposal without opening settings** — is everything seeded with
  working defaults?
- Does every **proposal-builder default have a home here**, and does editing it here change
  what the built builder shows (timeline, payment terms, T&C, catalog, about image, bank,
  financial defaults)?
- Is the **price book versioned** so sent quotes keep their prices, and does archiving a
  product keep it on drafts that used it?
- Do **roles use the six stackable presets** with the live plain-English line — and is the
  ops/installer question resolved (coordinator = Manager; installer deferred)?
- Is there **no subscription gating anywhere** — no plan limits, trial locks or upgrade prompts
  (billing is deferred, D38)?
- Is the **language switch per-user**, reachable by everyone, and does it re-render the app
  (including a Hindi frame that proves the layout holds)?

Then bring all eight back before Phase 9.
