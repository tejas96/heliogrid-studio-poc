# Build Plan — screen-by-screen, phase by phase

**This is the worklist. `product-journey.md` is the reference.**
Open this to know what to build today; open that to know what goes on the screen.

## How this works

```
build a phase  →  STOP  →  review together  →  fix  →  next phase
```

**Never build the next phase before the current one is reviewed and fixed.** Each phase
establishes patterns the next one reuses — an unfixed problem in Phase 1 gets copied into
40 screens.

Every screen is built **mobile 375px first, then desktop 1440px**, before moving to the
next screen in the phase.

---

## Review gate — run this after EVERY phase

Same nine checks, every time. A phase is not done until all pass.

| # | Check |
|---|---|
| 1 | Brass fills carry the **ink label** `#1A1712`, never white |
| 2 | Nothing below **12px**; touch targets **44px** |
| 3 | Colours all come from the system — no invented hex |
| 4 | Data colours never used for chrome, accent never used on a chart |
| 5 | Works at **375px AND 1440px** — no horizontal scroll at either |
| 6 | **Realistic Indian data** — ₹4,52,471 format, real cities, 8+ rows |
| 7 | **Empty / loading / error** states exist |
| 8 | Numbers show provenance where the journey says they should |
| 9 | Consistent with patterns established in earlier phases |

**At the gate, bring the screens back to Claude Code** and say *"review these against the
design system"* — you'll get an honest list of what fails, including where it's wrong.

---

## ONE-TIME SETUP — do this before Phase 1

Three things, once. After this, every prompt is just the screen.

| # | What | Where |
|---|---|---|
| S1 | **Design system** — brand, tokens, components | Already set up in Claude Design ✅ |
| S2 | **Arc nav component** — paste the block at the end of `product-journey.md` | Into that same design system, once |
| S3 | **Product context** — the blurb below | Project context on "Solar EPC Mobile Application", or the top of your first prompt |

**S3 — paste this as project context:**

```
HelioGrid is a mobile-first SaaS for solar EPC companies in India — the
businesses that sell, design and install rooftop and commercial solar.

It covers the sales cycle: capturing leads, assigning them to reps,
surveying the site, designing the array, building an itemised quote, and
sending the proposal to the customer over WhatsApp. An AI voice agent
follows up with customers who go quiet.

Users are sales reps, surveyors, designers, engineers and owners. Most
work on mid-range Android phones, often on a roof with poor signal.
Mobile (375px) and desktop (1440px) are both first-class.

Users quote jobs worth ₹5–50 lakh, so the interface must feel exact and
trustworthy. Content is Indian: ₹4,52,471 formatting, Indian names and
cities, kWp system sizes, GST, DISCOM utilities.
```

**Then every prompt describes only the screen** — never colours, never tokens. The design
system is selected in the dropdown and handles all of that.

---

## PHASE 1 · Entry & onboarding  ▸ 6 screens

**Goal: the first five minutes of the product — and a low-risk warm-up that proves the
pipeline works** before you hit anything dense.

⚠️ These screens set **no reusable patterns** (no nav, no lists, no tables). Do not linger
here. Go straight into Phase 2 after.

| # | Screen | Journey ref |
|---|---|---|
| 1.1 | **Login** — phone entry, then OTP | Stage 1 |
| 1.2 | **Sign up** — company + your name | Stage 0 |
| 1.3 | **What do you sell** — residential / C&I / both | Stage 0 |
| 1.4 | **You're ready** — two doors: first lead, or demo project | Stage 0 |
| 1.5 | **Invite landing** — an employee joining an existing company | Stage 1 |
| 1.6 | **Your role, explained** — first-run, role-specific | Stage 1 |

**Review focus:** Can someone sign up in under a minute? Is the OTP screen forgiving when
the code does not arrive? Does "You're ready" give a genuine next action rather than an
empty dashboard?

---

## PHASE 2 · Pattern foundation  ▸ 4 screens

**Goal: establish the four patterns every other screen reuses.** Get these right and 40
screens follow. Get them wrong and you fix 40 screens later. **This is the most important
phase in the plan.**

| # | Screen | Pattern it sets | Journey ref |
|---|---|---|---|
| 2.1 | **My Day** (rep home) | app shell · **arc nav** · grouped list | Stage 7 |
| 2.2 | **Leads list** | list + search + filter · card↔table | Stage 2/3 |
| 2.3 | **Lead detail** | detail header · timeline · action bar | Stage 3 |
| 2.4 | **Quick add lead** | form · validation · duplicate warning | Stage 2 |

**Review focus:** Is the shell right? Does the arc nav work in practice? Does the list
survive 40 rows? Does the detail screen have room for everything a lead accumulates?

---

## PHASE 3 · The money path  ▸ 5 screens

**Goal: the proposal builder.** Highest-traffic surface in the product.

| # | Screen | Journey ref |
|---|---|---|
| 3.1 | **Proposal builder — step 3** (Solar System Setup) — the densest step | Stage 6B |
| 3.2 | **Proposal builder — step 8** (Components) + Apply a kit | Stage 6B |
| 3.3 | **Proposal builder — step 7** (Payment terms) — tranche pattern | Stage 6B |
| 3.4 | **Proposal preview** | Stage 6B |
| 3.5 | **Send proposal** (WhatsApp) + delivery tracking | Stage 6 |

**Review focus:** Does the 11-step shell work at 375px without a chip scroller? Is step 3
readable with all its pricing fields? Does the mandatory-components gate feel helpful or
punishing?

---

## PHASE 4 · The customer's side  ▸ 3 screens

**Goal: what a stranger sees on their phone.** No login, no context, ₹8 lakh decision.

| # | Screen | Journey ref |
|---|---|---|
| 4.1 | **Customer proposal link** — the single most important screen in the product | C5 |
| 4.2 | **Accept / Ask a question** | C8 |
| 4.3 | **Customer progress link** (same URL, post-Won) | C10 / Stage 8 |

**Review focus:** Would a 55-year-old homeowner in Nashik understand this in 30 seconds?
Does the estimate label read as honest rather than hedging? One link, three lives — does it
feel like one thing?

---

## PHASE 5 · Survey — both modes  ▸ 4 screens

| # | Screen | Journey ref |
|---|---|---|
| 5.1 | **Remote survey** — address → detecting → review detection | Stage 4 Mode A |
| 5.2 | **Coverage failure** → manual outline or book a visit | Stage 4 Mode A |
| 5.3 | **My visits today** (surveyor home) | Stage 4 Mode B |
| 5.4 | **Guided capture** + review & submit + sync status | Stage 4 Mode B |

**Review focus:** Is the remote/physical choice obvious? Does the accept-or-adjust review
feel controllable? Does offline status reassure without nagging?

---

## PHASE 6 · Voice agent  ▸ 4 screens

| # | Screen | Journey ref |
|---|---|---|
| 6.1 | **Agent setup** — the 6 guided steps | Tenant config A |
| 6.2 | **Business knowledge** + unanswered questions | Tenant config B |
| 6.3 | **Call result on the timeline** + transcript | Stage 7 |
| 6.4 | **Agent performance** | Agent performance |

**Review focus:** Could a non-technical owner configure this without help? Is the locked-vs-
editable distinction visible? Does "deals it touched" state its limit honestly?

---

## PHASE 7 · Project management  ▸ 4 screens

| # | Screen | Journey ref |
|---|---|---|
| 7.1 | **Projects board** — stages, days-in-stage, blockers | Stage 8 |
| 7.2 | **Project detail** | Stage 8 |
| 7.3 | **Payments** — tranches, request on WhatsApp | Stage 8 |
| 7.4 | **Document checklist** + blockers | Stage 8 |

**Review focus:** Can the owner see what's stuck in three seconds? Does the payment schedule
make money owed obvious?

---

## PHASE 8 · Admin & settings  ▸ 4 screens

| # | Screen | Journey ref |
|---|---|---|
| 8.1 | **Team** + assign roles (stackable) | Roles |
| 8.2 | **Component kits** — create, edit, apply | D22 |
| 8.3 | **Catalog & price book** | Tenant config C |
| 8.4 | **Billing** (mock) — plans, usage, states | Billing |

*(Signup and first-run moved to Phase 1.)*

**Review focus:** Can a new company reach their first proposal without opening settings?

---

## PHASE 9 · Dashboards & the rest  ▸ 4 screens

| # | Screen |
|---|---|
| 9.1 | **Owner dashboard** — pipeline, forecast, stuck deals |
| 9.2 | **Rep dashboard** — my pipeline, my conversion |
| 9.3 | **Pipeline funnel + win/loss reasons** |
| 9.4 | **Notifications · global search · settings hub** |

> ⚠️ Dashboards are **not yet specced** in the journey doc. Spec them before this phase.

---

## PHASE 10 · Studio & 3D  🔻 LAST (D23)

Only after everything above ships. These screens **already exist and work in code** —
connect the codebase and improve one at a time. Do not reinvent.

| # | Screen |
|---|---|
| 10.1 | **BOM screen for mobile** — the 286-control problem, progressive disclosure |
| 10.2 | Roof drawing — touch model |
| 10.3 | Panel layout — touch model |
| 10.4 | 3D scene + captures |

---

## Progress

| Phase | Screens | Status | Reviewed |
|---|---|---|---|
| 1 · Entry & onboarding | 6 | ⬜ not started | — |
| 2 · Pattern foundation | 4 | ⬜ | — |
| 3 · Money path | 5 | ⬜ | — |
| 4 · Customer side | 3 | ⬜ | — |
| 5 · Survey | 4 | ⬜ | — |
| 6 · Voice agent | 4 | ⬜ | — |
| 7 · Project management | 4 | ⬜ | — |
| 8 · Admin & settings | 4 | ⬜ | — |
| 9 · Dashboards | 4 | ⬜ | — |
| 10 · Studio 🔻 | 4 | ⬜ | — |

**42 screens, mobile + desktop each.**

---

## Known gaps to close before their phase

| Gap | Needed by |
|---|---|
| Component kits screen not specced | Phase 3 (3.2) and Phase 8 (8.2) |
| Dashboards not specced | Phase 9 |
| Only 2 worked example prompts exist | Phase 1 onward — write them as you go |

---

## Start here

**Phase 1, screen 1.1 — My Day, mobile.** The ready-to-paste prompt is at the bottom of
`product-journey.md`. Build it, then the desktop version, then 1.2.

**Stop after 1.4 and bring all four back for review.** Do not start Phase 2 first.

---

# PHASE 1 — THE PROMPT SEQUENCE

Run these in order. After each mobile screen, immediately ask for the desktop version
before moving on — while the context is fresh.

**Reminder: never put colours, hex values or token names in a prompt.** The design system
is selected in the dropdown. Prompts describe content, actions and states only.

---

### 1.1 · Login

```
Design the Login screen for mobile, 375px.

WHO: a solar sales rep or company owner in India, signing in on an
Android phone
GOAL: get in with a phone number, no password

SHOWS — state 1, phone entry:
- App logo mark and name
- "Welcome back" heading, one line of supporting text
- Country prefix +91 (fixed) and a 10-digit phone field
- Continue button, disabled until 10 digits are entered
- A small line: "New company? Create an account"

SHOWS — state 2, OTP:
- "Enter the code sent to +91 98765 43210" with a change-number link
- 6 separate digit boxes, auto-advancing
- "Resend code" — disabled with a 30 second countdown, then active
- After two failed resends, offer "Call me with the code instead"

STATES: show both states side by side. Also show the error state for a
wrong OTP — the entered digits stay visible so the user can correct
rather than retype.

No password anywhere. Phone number is the identity.
```

Then:
```
Now the desktop version, 1440px. Same two states.
Centred card on a calm background, max 420px wide. Do not stretch the
form across the screen.
```

---

### 1.2 · Sign up

```
Design the Sign up screen for mobile, 375px.

WHO: a solar EPC company owner creating an account for the first time
GOAL: get to a working account in under a minute

SHOWS:
- "Create your account"
- Your name
- Company name
- City
- Phone number (+91, 10 digits) — this becomes the login
- Continue

That is the entire form. Five fields. We ask for GSTIN, logo, address
and team later, only when they are actually needed.

Below the form, one reassuring line: "Free to try. No card needed."

STATES: empty, filled, and the error when a phone number already has an
account — which should offer "Sign in instead" rather than just showing
an error.
```

Then:
```
Now desktop, 1440px. Centred card, max 480px. Same five fields.
```

---

### 1.3 · What do you sell

```
Design the "What do you sell?" onboarding step for mobile, 375px.

WHO: the owner, immediately after signing up
GOAL: one question that lets us set sensible defaults, so their first
quote is close to right

SHOWS:
- Step indicator: step 1 of 2
- Heading: "What do you install?"
- Three large selectable cards, single choice:
  · Residential rooftop — homes, 1 to 15 kW
  · Commercial & industrial — factories and warehouses, 20 kW and above
  · Both
- Below that, one optional field: "Typical system size" with a sensible
  default based on the choice
- Continue button
- A "Skip for now" text link

STATES: nothing selected (Continue disabled), one selected.

Cards should feel tappable and substantial — this is the only question
we ask, so it should not look like a form field.
```

Then:
```
Now desktop, 1440px. Three cards in a row instead of stacked.
```

---

### 1.4 · You're ready

```
Design the "You're ready" screen for mobile, 375px.

WHO: the owner, having just finished a 60-second signup
GOAL: give them a real next action, not an empty dashboard

SHOWS:
- A brief, warm confirmation — "You're set up, Rajesh"
- Two clear doors, as cards:
  1. "Add your first lead" — primary. Start selling immediately.
  2. "Explore a demo project" — secondary. A finished 8.2 kWp Pune
     rooftop they can open and poke at without fear of breaking
     anything.
- Below, a quiet collapsed list: "Finish setting up later — company
  logo, GST details, invite your team" with a chevron. Not a nag, not a
  progress bar.

This screen must NOT be a checklist of incomplete tasks. It is a
doorway, and the demo project is how people actually learn this
product.
```

Then:
```
Now desktop, 1440px. Two doors side by side.
```

---

### 1.5 · Invite landing

```
Design the invite landing screen for mobile, 375px.

WHO: a sales rep or surveyor who was just invited by their company owner
and tapped a WhatsApp link
GOAL: join and be useful in two minutes

SHOWS:
- "Rajesh Patil invited you to join Suryodaya Solar"
- The company name and city
- Their phone number, pre-filled and not editable — the invite was sent
  to it
- "Continue" → goes to OTP (reuse the pattern from 1.1)
- Then a single screen asking only for their name, with an optional
  photo

STATES: normal, plus the expired-invite state — "This invite has
expired" with a one-tap "Ask Rajesh to invite me again".
```

---

### 1.6 · Your role, explained

```
Design the first-run role explainer for mobile, 375px.

WHO: an employee who just joined, before they see the app
GOAL: they understand what they can and cannot do, in one screen

SHOWS:
- "You're a Sales Rep"
- Three short lines of what that means:
  · You'll see the leads assigned to you
  · You can create designs, quotes and send proposals
  · Your owner approves discounts
- A single "Got it" button

If the person holds several roles — for example Sales Rep and Surveyor —
show both, and say they can do both jobs.

Keep this to ONE screen. Never a swipeable carousel.

STATES: single role, and the multi-role version.
```

---

## After Phase 1 — STOP

Bring all six screens back and run the nine-point review gate. Do not start Phase 2 until
Phase 1 is reviewed and fixed.
