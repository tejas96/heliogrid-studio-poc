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

## PHASE 1 · Pattern foundation  ▸ 4 screens

**Goal: establish the four patterns every other screen reuses.** Get these right and 40
screens follow. Get them wrong and you fix 40 screens later.

| # | Screen | Pattern it sets | Journey ref |
|---|---|---|---|
| 1.1 | **My Day** (rep home) | app shell · bottom nav · grouped list | Stage 7 |
| 1.2 | **Leads list** | list + search + filter · card↔table | Stage 2/3 |
| 1.3 | **Lead detail** | detail header · timeline · action bar | Stage 3 |
| 1.4 | **Quick add lead** | form · validation · duplicate warning | Stage 2 |

**Review focus:** Is the shell right? Does the list survive 40 rows? Does the detail screen
have room for everything a lead accumulates? Is the form fast enough for 30 seconds?

---

## PHASE 2 · The money path  ▸ 5 screens

**Goal: the proposal builder.** Highest-traffic surface in the product.

| # | Screen | Journey ref |
|---|---|---|
| 2.1 | **Proposal builder — step 3** (Solar System Setup) — the densest step | Stage 6B |
| 2.2 | **Proposal builder — step 8** (Components) + Apply a kit | Stage 6B |
| 2.3 | **Proposal builder — step 7** (Payment terms) — tranche pattern | Stage 6B |
| 2.4 | **Proposal preview** | Stage 6B |
| 2.5 | **Send proposal** (WhatsApp) + delivery tracking | Stage 6 |

**Review focus:** Does the 11-step shell work at 375px without a chip scroller? Is step 3
readable with all its pricing fields? Does the mandatory-components gate feel helpful or
punishing?

---

## PHASE 3 · The customer's side  ▸ 3 screens

**Goal: what a stranger sees on their phone.** No login, no context, ₹8 lakh decision.

| # | Screen | Journey ref |
|---|---|---|
| 3.1 | **Customer proposal link** — the single most important screen in the product | C5 |
| 3.2 | **Accept / Ask a question** | C8 |
| 3.3 | **Customer progress link** (same URL, post-Won) | C10 / Stage 8 |

**Review focus:** Would a 55-year-old homeowner in Nashik understand this in 30 seconds?
Does the estimate label read as honest rather than hedging? One link, three lives — does it
feel like one thing?

---

## PHASE 4 · Survey — both modes  ▸ 4 screens

| # | Screen | Journey ref |
|---|---|---|
| 4.1 | **Remote survey** — address → detecting → review detection | Stage 4 Mode A |
| 4.2 | **Coverage failure** → manual outline or book a visit | Stage 4 Mode A |
| 4.3 | **My visits today** (surveyor home) | Stage 4 Mode B |
| 4.4 | **Guided capture** + review & submit + sync status | Stage 4 Mode B |

**Review focus:** Is the remote/physical choice obvious? Does the accept-or-adjust review
feel controllable? Does offline status reassure without nagging?

---

## PHASE 5 · Voice agent  ▸ 4 screens

| # | Screen | Journey ref |
|---|---|---|
| 5.1 | **Agent setup** — the 6 guided steps | Tenant config A |
| 5.2 | **Business knowledge** + unanswered questions | Tenant config B |
| 5.3 | **Call result on the timeline** + transcript | Stage 7 |
| 5.4 | **Agent performance** | Agent performance |

**Review focus:** Could a non-technical owner configure this without help? Is the locked-vs-
editable distinction visible? Does "deals it touched" state its limit honestly?

---

## PHASE 6 · Project management  ▸ 4 screens

| # | Screen | Journey ref |
|---|---|---|
| 6.1 | **Projects board** — stages, days-in-stage, blockers | Stage 8 |
| 6.2 | **Project detail** | Stage 8 |
| 6.3 | **Payments** — tranches, request on WhatsApp | Stage 8 |
| 6.4 | **Document checklist** + blockers | Stage 8 |

**Review focus:** Can the owner see what's stuck in three seconds? Does the payment schedule
make money owed obvious?

---

## PHASE 7 · Onboarding & admin  ▸ 6 screens

| # | Screen | Journey ref |
|---|---|---|
| 7.1 | **Sign up** → what do you sell → ready | Stage 0 |
| 7.2 | **Invite & first run** (employee) | Stage 1 |
| 7.3 | **Team** + assign roles (stackable) | Roles |
| 7.4 | **Component kits** — create, edit, apply | D22 |
| 7.5 | **Catalog & price book** | Tenant config C |
| 7.6 | **Billing** (mock) — plans, usage, states | Billing |

**Review focus:** Can a new company reach their first proposal without opening settings?

---

## PHASE 8 · Dashboards & the rest  ▸ 4 screens

| # | Screen |
|---|---|
| 8.1 | **Owner dashboard** — pipeline, forecast, stuck deals |
| 8.2 | **Rep dashboard** — my pipeline, my conversion |
| 8.3 | **Pipeline funnel + win/loss reasons** |
| 8.4 | **Notifications · global search · settings hub** |

> ⚠️ Dashboards are **not yet specced** in the journey doc. Spec them before this phase.

---

## PHASE 9 · Studio & 3D  🔻 LAST (D23)

Only after everything above ships. These screens **already exist and work in code** —
connect the codebase and improve one at a time. Do not reinvent.

| # | Screen |
|---|---|
| 9.1 | **BOM screen for mobile** — the 286-control problem, progressive disclosure |
| 9.2 | Roof drawing — touch model |
| 9.3 | Panel layout — touch model |
| 9.4 | 3D scene + captures |

---

## Progress

| Phase | Screens | Status | Reviewed |
|---|---|---|---|
| 1 · Pattern foundation | 4 | ⬜ not started | — |
| 2 · Money path | 5 | ⬜ | — |
| 3 · Customer side | 3 | ⬜ | — |
| 4 · Survey | 4 | ⬜ | — |
| 5 · Voice agent | 4 | ⬜ | — |
| 6 · Project management | 4 | ⬜ | — |
| 7 · Onboarding & admin | 6 | ⬜ | — |
| 8 · Dashboards | 4 | ⬜ | — |
| 9 · Studio 🔻 | 4 | ⬜ | — |

**38 screens, mobile + desktop each.**

---

## Known gaps to close before their phase

| Gap | Needed by |
|---|---|
| Component kits screen not specced | Phase 2 (2.2) and Phase 7 (7.4) |
| Dashboards not specced | Phase 8 |
| Only 2 worked example prompts exist | Phase 1 onward — write them as you go |

---

## Start here

**Phase 1, screen 1.1 — My Day, mobile.** The ready-to-paste prompt is at the bottom of
`product-journey.md`. Build it, then the desktop version, then 1.2.

**Stop after 1.4 and bring all four back for review.** Do not start Phase 2 first.
