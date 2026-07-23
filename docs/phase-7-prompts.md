# Phase 7 — Project management (light)  ▸ 7 screens

**After a deal is won, the money still has to be collected and the customer still asks "what's
the status?"** This phase is a **status + documents + money tracker — not project-management
software.** Small and mid-size Indian EPCs run a WhatsApp group and a notebook; we replace the
notebook, not sell them MS Project.

The one feature an owner will actually pay for: **payment collection against the tranches**.
Solar businesses die of cash flow, and money owed against a milestone that already passed is
the most common leak.

Reference: `product-journey.md` — Stage 8 (every screen and edge case), customer journey
C9–C12; decisions **D31** (Projects is a nav destination), **D32** (the customer link is
ours). Worklist and review gate: `build-plan.md`.

---

## ⚠️ HOW TO USE THESE PROMPTS — read once

**Each prompt below is SELF-CONTAINED.** Copy the ONE fenced block for a screen and paste it
into Claude Design as-is — context, states, wiring, viewport and rules are already inside. The
prose outside the blocks is for **you**; don't paste it.

Baked into every block:
- No colours, hex or token names — the design system carries the look; you decide the layout.
- One page per screen, states swapped by a header chip (not separate static frames).
- A working prototype — actions wired, sheets open and close, no dead ends.

---

## The one principle: "light" — replace the notebook, not MS Project

```
IN v1                              NOT in v1
─────                              ────────
a stage board                      inventory / stock levels
payment collection vs tranches     purchase orders to suppliers
a document checklist               crew rostering / scheduling engine
blockers with a named reason       Gantt charts, dependencies
the customer progress link         procurement, O&M, AMC, tickets
```

Two truths shape every screen:
- **Days-in-stage is the only metric that matters.** Not percentages, not burndown. "In DISCOM
  inspection for 34 days" is the whole insight.
- **Every blocker names who is waiting** — us, the customer, the DISCOM, or material. Over a
  year this becomes the honest answer to "why do our projects take so long", and the
  **"waiting on customer" state is the one that protects the EPC** from absorbing blame.

---

## 🔗 SCREENS THIS PHASE TOUCHES / REUSES — flag, don't rebuild

| Built / existing | What Phase 7 does with it |
|---|---|
| **Lead detail (2.3)** | Add a **"Mark won"** action. Winning **creates the project automatically** (no "create project" step) — a won deal *is* a project. Flag this modification. |
| **Payment tranches (Phase 3.4 proposal builder)** | The 10/60/20/10 schedule set there **is** the collection schedule here. Same figures — don't invent new ones. |
| **Customer progress link (Phase 4, States E & F)** | Already built. Moving a stage, setting a blocker, or sending the handover pack **updates what that link shows.** Do NOT rebuild the customer view — Phase 7 only feeds it. |
| **InstallationSheet (existing code component)** | The installation stage **reuses the existing InstallationSheet** (foundation → legs → rafters → purlins → modules → stringing → BOS, crew ticks persisted). **Do not rebuild it** — link to it as a connect-to-existing placeholder, like the studio. |
| **Owner dashboard (Phase 9, not built)** | Stuck projects and money-due surface to the owner there — link to a labelled placeholder until Phase 9 exists. |

**Roles note (gap):** Stage 8 needs a **Coordinator/ops** and **Installer/crew** actor, but
neither is in the six preset roles (D27). Until Phase 8 resolves it, use "coordinator" as the
actor and keep the installation checklist financial-free (crew ticks steps, sees no money).

---

## The screens, in order

```
  7.1  Mark won → the project is created         (entry; modifies the lead)
  7.2  Projects board                            (a top-level destination)
  7.3  Project detail                            (the screen ops lives in)
  7.4  Payments                                  (collect against the tranches)
  7.5  Document checklist
  7.6  Blockers                                  (name who is waiting)
  7.7  Handover                                  (pack out, project closed)
```

---

# 7.1 · Mark won → the project is created

```
Design "Mark won" and the project it creates. Use the selected design
system; no colours or token names — you decide the layout.

WHO: a sales rep or owner, on a lead whose customer just said yes.
GOAL: record the win in seconds and land in a live project — with no
"create a project" busywork.

MARK WON is a short confirmation opened from the lead (Priya Sharma ·
Nashik · 8.2 kWp · ₹3,51,847). It collects only:
- final value (pre-filled from the accepted proposal, editable)
- expected installation date
That's all. On confirm, the project is CREATED AUTOMATICALLY from the deal
— customer, design, accepted proposal and the payment tranches all carry
over. The user lands on the new Project detail (7.3), already populated.

Never ask them to re-enter the customer or the system — a won deal IS a
project; re-typing is how data diverges.

TOUCHES A BUILT SCREEN: "Mark won" is a NEW action on the existing
lead-detail screen (Phase 2). Do not redesign the lead — add the action
and its confirmation.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); the confirmation is a sheet, not a chip state:
- the lead, with "Mark won" available among its actions
- the Mark-won confirmation sheet, pre-filled
- confirmed → a brief "Project created" moment that leads into 7.3
- won on a deal with an unpaid nothing yet — the booking tranche is now
  due (hands to 7.4)

WIRE THESE — real prototype:
- lead action "Mark won" → the confirmation sheet
- "Confirm" → "Project created" → 7.3 Project detail
- "Cancel" → back to the lead unchanged

VIEWPORTS — build both, one design. This opens from the lead, so it is a
nested action: MOBILE 375px as a sheet over the lead, no bottom nav;
DESKTOP 1440px as a centred confirmation with the sidebar still visible.
Side by side, mobile left, desktop right; desktop is not a stretched phone.
```

---

# 7.2 · Projects board

```
Design the PROJECTS BOARD — every won deal in execution, by stage. Use the
selected design system; no colours or token names — you decide the layout.

WHO: the owner and the operations coordinator, seeing what's moving and
what's stuck.
GOAL: spot what's stuck in three seconds, and see where money is owed.

THE STAGES a solar project moves through after Won:
Won → Material ordered → Dispatched → Installation → Electrical & metering
→ DISCOM inspection → Commissioned → Subsidy claimed → Handed over.

EACH PROJECT CARD shows: customer, system size, value, DAYS IN STAGE,
payment collected vs due, and a blocker flag if it has one. Aged cards
(stuck a long time) must surface, not hide at the bottom.

Use a realistic mix:
- Priya Sharma · Nashik · 8.2 kWp · ₹3,51,847 · Installation · day 2 ·
  70% collected
- Deshmukh Textiles · Nashik · 250 kWp · ₹1.28 Cr · DISCOM inspection ·
  day 34 · 🚩 waiting on DISCOM · 80% collected
- Rohit Mehta · Aundh · 10 kWp · ₹5,60,000 · Material ordered · day 1 ·
  10% collected
- Kavita Joshi · Wakad · 7.6 kWp · ₹4,10,000 · Commissioned · day 3 ·
  🚩 waiting on customer (payment) · 90% collected

DAYS-IN-STAGE IS THE METRIC. A project installed but stuck in
commissioning for a month must NOT read as "nearly finished" — days-in-
stage tells the truth.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- the normal board
- filtered to one stage
- an aged / stuck project highlighted (34 days in DISCOM)
- a money-owed project flagged (tranche due, not paid)
- empty — no live projects yet, explained (not a blank screen)

WIRE THESE — real prototype:
- a card → 7.3 Project detail
- the stage filter changes the board in place
- a blocker flag → the blocker on 7.6
- stuck/owed projects also surface to the owner dashboard (Phase 9
  placeholder)

VIEWPORTS — build both, one design. Projects is a TOP-LEVEL DESTINATION:
- MOBILE 375px keeps the arc bottom nav (Projects active); the board is
  ONE column with a stage filter (a full kanban doesn't fit a phone).
- DESKTOP 1440px is the full board across stages, sidebar present.
Side by side, mobile left, desktop right; desktop is not a stretched phone.
```

---

# 7.3 · Project detail

```
Design PROJECT DETAIL — the one screen the coordinator lives in. Use the
selected design system; no colours or token names — you decide the layout.

WHO: the operations coordinator (and owner), running one project.
GOAL: everything about this project in one place, and the next thing to do
obvious.

FOR Priya Sharma · Nashik · 8.2 kWp · ₹3,51,847, it holds:
- the STAGE TIMELINE (Won → … → Handed over), with the current stage and
  DAYS IN STAGE, and a way to advance to the next stage
- the approved DESIGN and the accepted PROPOSAL (links to what exists)
- PAYMENTS — a summary of collected vs due, opening 7.4
- DOCUMENTS — the checklist summary, opening 7.5
- BLOCKERS — any active blocker with who's waiting, opening 7.6
- ACTIVITY — a log of stage moves, payments, uploads
- "What the customer sees" — a preview of the progress link (Phase 4),
  so the coordinator knows the customer's view matches reality

ADVANCING A STAGE is the core action: moving to the next stage updates the
customer link, and when a stage completes the matching payment tranche
becomes due (7.4).

REUSE, DON'T REBUILD: the Installation stage opens the EXISTING
InstallationSheet (foundation → legs → rafters → … → BOS, crew ticks) —
link to it as a connect-to-existing placeholder, do not redesign it.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); payments/docs/blockers open as their own screens
via wiring, not chip states:
- early stage (Material ordered), little collected
- mid-project (Installation), some documents in, one tranche due
- blocked (DISCOM), the blocker prominent, customer-link preview showing
  the honest waiting line
- near handover, most done
- cancelled after Won — allowed with a reason, and clearly no longer
  counted as active revenue

WIRE THESE — real prototype:
- reached from a 7.2 card
- "Advance stage" → confirms → timeline moves, customer link updates
- "Payments" → 7.4 · "Documents" → 7.5 · "Blockers" → 7.6
- Installation stage → the existing InstallationSheet (placeholder)
- "Handover" (once ready) → 7.7

VIEWPORTS — build both, one design. Nested (opened from the board):
MOBILE 375px no bottom nav, back ‹ to the board, sections stacked; DESKTOP
1440px shows the project with the sidebar. Side by side, mobile left,
desktop right; desktop is not a stretched phone.
```

---

# 7.4 · Payments

```
Design PAYMENTS — collecting the money against the proposal's tranches.
Use the selected design system; no colours or token names — you decide the
layout.

WHO: the coordinator, chasing and recording payment.
GOAL: see what's owed the moment a milestone passes, and record what came
in — with a ready-to-send request in one tap.

THE SCHEDULE is the SAME 10/60/20/10 tranches set in the proposal builder
(Phase 3.4). Do NOT invent figures — reuse them, on the ₹3,51,847 payable:
  10%  on booking          ✅ received   12 Aug   ₹35,185
  60%  on material dispatch ✅ received   14 Aug   ₹2,11,108
  20%  on installation      🔵 due now              ₹70,369   [Copy request]
  10%  on commissioning     ⬜ upcoming             ₹35,185
When a stage completes, the matching tranche becomes DUE.

FOR A DUE TRANCHE:
- "Copy request message" — a ready-to-paste WhatsApp message with the
  amount and milestone (the app doesn't send; the coordinator pastes it,
  same rule as proposals)
- "Mark received" — record the mode (UPI / NEFT / cheque), the date, and
  attach a receipt

NEVER block the customer's progress link over money — chase the person,
don't punish the view.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); "mark received" and "copy request" are a sheet /
action, not chip states:
- the schedule with two paid, one due, one upcoming
- a due tranche with the request message ready to copy
- marking a payment received (mode, date, receipt)
- fully collected — every tranche paid
- overdue — a tranche due for a while, flagged for chasing (but the
  customer link is untouched)

WIRE THESE — real prototype:
- reached from 7.3
- "Copy request message" → "Copied" confirmation
- "Mark received" → the record sheet → the tranche flips to received
- overdue also surfaces on the board (7.2) and owner dashboard (placeholder)

VIEWPORTS — build both, one design. Nested: MOBILE 375px no bottom nav,
back ‹ to the project, the schedule as stacked rows; DESKTOP 1440px as a
table beside the project, sidebar present. Side by side, mobile left,
desktop right; desktop is not a stretched phone.
```

---

# 7.5 · Document checklist

```
Design the DOCUMENT CHECKLIST for a project. Use the selected design
system; no colours or token names — you decide the layout.

WHO: the coordinator, gathering every document a solar project needs.
GOAL: at a glance, what's collected, what's missing, and what's verified.

THE DOCUMENTS, each with a status — pending · uploaded · verified:
- Signed proposal
- Advance receipt
- Net-metering application
- DISCOM approval
- Subsidy application & sanction (PM Surya Ghar)
- Commissioning certificate
- Warranty documents
- Handover pack
Some of these arrive automatically from earlier stages (the signed
proposal, the advance receipt); others are uploaded here.

The subsidy documents matter most to the customer — it's their money —
so a missing or pending subsidy sanction should be visible, not buried.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); uploading / viewing a document is a sheet, not a
chip state:
- early — most pending, a couple auto-filled from earlier stages
- mid — several uploaded, some verified
- a document being uploaded
- all verified — ready to assemble the handover pack
- a rejected / re-upload-needed document, with the reason

WIRE THESE — real prototype:
- reached from 7.3
- "Upload" → a sheet → the document flips to uploaded
- "Verify" → verified
- once complete → enables the handover pack (7.7)

VIEWPORTS — build both, one design. Nested: MOBILE 375px no bottom nav,
back ‹, documents as a list; DESKTOP 1440px beside the project, sidebar
present. Side by side, mobile left, desktop right; desktop is not a
stretched phone.
```

---

# 7.6 · Blockers

```
Design BLOCKERS — why a project is stuck, and who is waiting. Use the
selected design system; no colours or token names — you decide the layout.

WHO: the coordinator and owner, recording and reading delays honestly.
GOAL: make every delay attributable, so the EPC stops absorbing blame for
a utility's or a customer's timeline.

A BLOCKER always names WHO IS WAITING, with a reason and the date it
started:
- waiting on DISCOM — e.g. "net-metering applied 15 Aug, typically 3–6
  weeks"
- waiting on the customer — site access, a document, or payment. THIS IS
  THE ONE THAT PROTECTS THE EPC: the date it started is recorded, so
  responsibility for the delay is visible.
- waiting on material — with an expected date; the customer sees "material
  ordered", not the supplier's problem
- waiting on us — honest when it's our own delay

Setting a blocker updates the customer link with the honest waiting line
(e.g. "waiting for DISCOM approval, applied 15 Aug, typically 3–6 weeks")
— which prevents most "what's the status?" support calls.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); adding / clearing a blocker is a sheet:
- no blocker — the project is moving
- waiting on DISCOM, with the applied date and typical wait
- waiting on the customer, with the date it started
- waiting on material, with an expected date
- a blocker being cleared → the project resumes, customer link updates

WIRE THESE — real prototype:
- reached from 7.3 and from a board flag (7.2)
- "Add blocker" → a sheet (who / reason / date) → shows on the project and
  the customer link
- "Clear blocker" → resumes, updates the customer link

VIEWPORTS — build both, one design. Nested: MOBILE 375px no bottom nav,
back ‹; DESKTOP 1440px beside the project, sidebar present. Side by side,
mobile left, desktop right; desktop is not a stretched phone.
```

---

# 7.7 · Handover

```
Design HANDOVER — closing the project and handing the customer their pack.
Use the selected design system; no colours or token names — you decide the
layout.

WHO: the rep or coordinator, finishing a project.
GOAL: give the customer everything they need and close the project cleanly.

HANDOVER assembles the document pack (warranty documents, commissioning
certificate, net-metering approval, invoice) and hands it over:
- "Download pack" and "Copy link" — the rep shares it themselves (the app
  doesn't send, same rule as proposals)
- a short "how to read your generation" pointer for the customer
- a quiet referral ask — "know someone thinking about solar?"
On completion the project is CLOSED, and the customer's progress link
(Phase 4, State F) flips to the "your system is live" handover view — do
NOT rebuild that view, this only triggers it.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- not ready — something is still pending (documents / commissioning),
  showing what's left
- ready to hand over — the pack assembled
- handed over — shared, project closed, the referral ask shown
- reopened — a closed project that needed to come back (rare, allowed)

WIRE THESE — real prototype:
- reached from 7.3 once documents and commissioning are done
- "Download pack" → success · "Copy link" → "Copied"
- "Mark handed over" → project closed → the customer link flips to State F
  (Phase 4 placeholder)

VIEWPORTS — build both, one design. Nested: MOBILE 375px no bottom nav,
back ‹; DESKTOP 1440px beside the project, sidebar present. Side by side,
mobile left, desktop right; desktop is not a stretched phone.
```

---

## After Phase 7 — STOP

Run the nine-point review gate in `build-plan.md`, plus these specific to this phase:

- Is **days-in-stage** the metric on the board — and does a long-stuck project read as stuck,
  never as "nearly finished"?
- Do the **payment tranches match the proposal builder's** exactly (same 10/60/20/10, same
  figures), and does a passed milestone make its tranche visibly due?
- Does **every blocker name who is waiting**, and does "waiting on customer" record the date it
  started?
- Does setting a stage or a blocker **update the customer link** (Phase 4) without rebuilding
  it — and is the link **never blocked over money**?
- Is the project **created automatically on Won**, with no re-entry of the customer?
- Does the Installation stage **reuse the existing InstallationSheet**, not a new one?

Then bring all seven back before Phase 8.
