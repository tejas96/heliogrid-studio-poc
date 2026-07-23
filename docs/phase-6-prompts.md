# Phase 6 — The Voice Agent  ▸ 8 screens

**The most compliance-loaded surface in the product.** An automated assistant calls real
customers in India. Every screen here is shaped by law (TRAI/DND, calling hours), by honesty
(AI self-disclosure, no discount authority), and by trust (the owner must see exactly what a
machine did on their behalf).

Reference: `product-journey.md` — Stage 7, "Constraints the voice agent inherits", Tenant
Configuration A & B, Agent Performance; decisions **D8, D10, D17, D18, D24, D25**.
Worklist and review gate: `build-plan.md`.

---

## ⚠️ HOW TO USE THESE PROMPTS — read once

**Each prompt below is SELF-CONTAINED.** Copy the ONE fenced block for a screen and paste it
into Claude Design as-is. There is nothing to splice in — the context, the states, the
wiring, the viewport and the standing rules are already inside every block. (This is the
change from Phase 5, where you had to paste the prompt *and* the shared blocks.)

The prose outside the fenced blocks (this section, the maps below, the headings) is for **you**
— do not paste it.

Still true, and baked into every block so you don't have to remember it:
- No colours, hex or token names in a prompt — the design system in the dropdown carries the
  look; Claude Design decides the layout.
- One page per screen, states swapped by a header chip (not separate static frames).
- It must be a working prototype — actions wired, sheets open and close, no dead ends.

---

## 🔒 WHAT THE PLATFORM LOCKS — the tenant can never change these (D24, D10)

These appear as fixed, visibly-locked elements inside the relevant prompts. Listed here once
so you understand why:

- The agent **opens every call by identifying itself as an automated assistant**.
- **"Talk to a person" always works**, on every call, at any moment.
- The agent **never discusses, offers or agrees a discount** (D10), and never makes
  structural or engineering guarantees.
- Calls happen **only within legal hours (9am–9pm local)** and **respect DND / do-not-call**.
  The agent cannot dial a customer whose eligibility is not clear.
- **Recording consent** is captured; a customer may decline and still be served.
- The owner configures the agent by **answering guided questions and filling a structured
  knowledge base — NEVER a raw prompt box.**

Everything else — name, voice, tone, languages, what it knows, when it hands over — is theirs.

---

## 🔗 SCREENS THIS PHASE TOUCHES THAT ARE ALREADY BUILT — flag, don't rebuild

Phase 6 does **not** touch the Phase 5 survey screens at all. It connects to Phase 2:

| Built screen | What Phase 6 does to it |
|---|---|
| **My Day (2.1)** — already has an "Agent activity" block | **Wire only.** Each agent-activity row now links to the call result (6.7). Do not redesign My Day. |
| **Lead detail (2.3)** — already shows 🤖 agent timeline entries with a [Transcript] link | **Wire + one real change.** The call result (6.7) is the expansion of that timeline entry. AND add a new action **"Hand to the agent"** (on-demand trigger, D17) plus a small **agent-status line** on the lead (queued for a call · do-not-call · consent captured). This is a genuine modification to a built screen — call it out in the prompt. |
| **Settings** (in More / the sidebar) | The agent configuration screens (6.1–6.5) are reached from here. |
| **Notifications (Phase 9, not built yet)** | A price/discount escalation notifies the rep, not a task. Link to a labelled placeholder until Phase 9 exists. |

Close (mark won / lost) is **not** in this phase — lost already lives on the lead as
"Disqualify", and won → project belongs to Phase 7.

---

## The screens, in order

```
CONFIGURE  (owner, at a desk — reached from Settings)
  6.1  Agent setup — the guided 6 steps + the opening line
  6.2  Escalation rules & the calling window
  6.3  Test the agent            ← the most important config screen
  6.4  Business knowledge — the structured, seeded knowledge base
  6.5  Unanswered questions      ← the loop that keeps it honest

RUN  (rep- and owner-facing)
  6.6  Agent queue & call eligibility
  6.7  Call result + transcript  ← expands the existing lead timeline

MEASURE  (owner — retention)
  6.8  Agent performance         ← with the correlation-not-attribution caveat
```

---

# 6.1 · Agent setup — the guided 6 steps + the opening line

```
Design the VOICE AGENT SETUP for a solar company owner. Use the selected
design system; no colours or token names here — you decide the layout.

WHO: Rajesh Patil, owner of Suryodaya Solar, Nashik. Not technical. He
must NEVER see a prompt box — he answers questions and we assemble the
agent's instructions for him.
GOAL: a working agent in a few minutes, with safe defaults already filled.

THE 6 GUIDED STEPS — plain language, each pre-filled with a sensible
default so it works on day one:
1. Agent name — e.g. "Asha"
2. Voice — a small set of sample voices he can play and pick
3. Languages it speaks — English · हिंदी · मराठी (per customer, or
   auto-detect)
4. Tone — Professional · Friendly · Direct
5. What to say when asked something it doesn't know — offer a callback,
   never guess
6. When to hand to a human — sensible defaults, refined in 6.2

THE OPENING LINE — editable, with the mandatory AI disclosure fixed and
shown as LOCKED text he cannot remove:
  "Namaste, this is Asha calling from Suryodaya Solar. I'm an automated
   assistant — is now a good time?"
The bold parts (name, company) are his; the "I'm an automated assistant"
disclosure is locked.

VERSION HISTORY — every change is versioned; each call later records which
version answered it, so a dispute is answerable. Show this as a panel, not
a separate screen.

🔒 LOCKED, show as fixed and non-editable: the AI self-disclosure in the
opening line; "talk to a person" always available; the agent never
discusses or offers a discount and makes no structural guarantees. The
owner configures by answering questions — there is NO raw prompt box
anywhere on this screen.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); sheets are overlays reached by tapping, not chip
states:
- first-time setup, defaults pre-filled, nothing customised yet
- fully customised by the owner
- playing a voice sample (overlay)
- an invalid entry — e.g. he tries to edit out the AI disclosure → blocked
  with a plain explanation, his other edits kept
- version history panel open, showing 3 past versions

WIRE THESE — real prototype, actions connected:
- reached FROM Settings (in More / the sidebar) → this screen
- "Next / Continue" moves through the 6 steps on the same page
- "Set escalation & calling hours" → 6.2
- "Test it" → 6.3
- "Save" → confirmation, stays here

VIEWPORTS — build both, one design:
- DESKTOP 1440px is the primary surface (an owner configures at a desk);
  the 240px left sidebar stays, this occupies the main area.
- MOBILE 375px is a capable companion; this is a nested settings flow, so
  no bottom nav — full screen with a back ‹ in the header.
Same content in both; desktop is not a stretched phone. Place them side by
side, mobile left, desktop right.
```

---

# 6.2 · Escalation rules & the calling window

```
Design the AGENT ESCALATION RULES and CALLING WINDOW. Use the selected
design system; no colours or token names — you decide the layout.

WHO: the owner, deciding when the agent must step back and let a human in,
and when it is allowed to call at all.
GOAL: set the guardrails once, in plain toggles, and trust them.

ESCALATION RULES — a toggle list, each with an editable line of "what the
agent says as it hands over":
- price / discount question — LOCKED ON, cannot be turned off (D10)
- angry or upset customer
- customer asks for the owner by name
- a technical question the agent can't answer
- customer asks it to stop
When any fires, the rep is notified immediately (not buried in a task
list), and the reason is recorded ("customer asked for a discount").

CALLING WINDOW:
- days of the week, start and end time
- a holiday calendar (Indian festivals) when the agent stays silent
- BOUNDED by the legal window: the owner can NARROW it, never widen past
  9am–9pm local. Show the legal bound as a fixed edge he cannot cross.

🔒 LOCKED, shown as fixed: the price/discount escalation stays ON; calls
never fall outside 9am–9pm; DND / do-not-call is always respected. A
customer who said "stop" is never dialled again.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- default rules and window
- customised (narrower hours, extra escalations on)
- the owner tries to widen hours past the legal edge → blocked, explained
- a holiday added to the calendar

WIRE THESE — real prototype:
- reached from 6.1 ("Set escalation & calling hours") and from Settings
- editing an escalation's hand-over line opens an inline editor
- "Save" → confirmation, stays here
- "Test it" → 6.3

VIEWPORTS — build both, one design: DESKTOP 1440px primary (owner at a
desk, sidebar stays), MOBILE 375px companion, nested settings flow so no
bottom nav (back ‹ in the header). Side by side, mobile left, desktop
right; desktop is not a stretched phone.
```

---

# 6.3 · Test the agent

```
Design the TEST THE AGENT screen — the most important screen in the agent
configuration. Use the selected design system; no colours or token names —
you decide the layout.

WHO: the owner, about to let an automated voice represent his company.
GOAL: hear exactly what a customer will hear, BEFORE any customer does.

TWO WAYS TO TEST, both on this screen:
1. CALL YOURSELF — enter a number, the agent calls it, the owner has a
   real spoken conversation and hears the voice, tone and opening line.
2. TYPED CONVERSATION — a chat-style simulation for a quick check without
   a phone call: the owner types what a customer might say and sees how
   the agent responds, in the chosen language.

It must be obvious which agent version is being tested, and the owner can
jump back to 6.1 / 6.2 / 6.4 to fix anything that sounds wrong, then
re-test.

🔒 LOCKED and audible/visible in the test: the opening AI disclosure; the
agent refusing to discuss a discount and offering a human instead; "talk
to a person" working mid-conversation.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); the live call is an overlay, not a chip state:
- idle, choose how to test
- a live test call in progress (overlay) — connected, with a way to end it
- a typed simulation mid-conversation, showing several turns
- the owner triggers a discount question in the sim → the agent declines
  and offers a human (proving the lock works)
- "talk to a person" tapped mid-sim → hand-over message shown

WIRE THESE — real prototype:
- reached from 6.1 / 6.2 ("Test it")
- "Fix the script" → back to 6.1; "Fix knowledge" → 6.4
- "Looks good — turn the agent on" → confirmation

VIEWPORTS — build both, one design: DESKTOP 1440px primary, MOBILE 375px
companion, nested settings flow, no bottom nav (back ‹). Side by side,
mobile left, desktop right; desktop is not a stretched phone.
```

---

# 6.4 · Business knowledge — the structured knowledge base

```
Design the BUSINESS KNOWLEDGE base — what the agent knows about this
company. Use the selected design system; no colours or token names — you
decide the layout.

WHO: the owner, teaching the agent his business in his own words.
GOAL: a reviewable, structured knowledge base — NOT a document upload, NOT
a prompt box.

STRUCTURED SECTIONS, each editable in plain language, and SEEDED on day
one with correct generic solar answers the owner then personalises:
- About us — years in business, installations done, certifications, area
- Products — panel and inverter brands offered, why chosen
- Warranty — panel 25yr performance / 12yr product, inverter 5yr,
  workmanship 2yr
- Process & timeline — survey 2 days · design 3 · install 1–2 days ·
  net-metering 3–6 weeks
- Pricing policy — what's included, what's extra. NO discount authority
  (locked).
- Subsidy — how PM Surya Ghar works, who qualifies, timeline
- Financing — which banks / NBFCs, typical EMI, documents
- Common objections — "too expensive", "I'll wait for prices to drop",
  "does it work in monsoon?", "what about cleaning?" — each with the
  answer the owner wants given

Make clear each section is SEEDED (a generic default is already there) and
editable — day one it works, week four it sounds like him.

🔒 LOCKED, shown as fixed: the "Pricing policy" section carries no discount
authority — the agent cannot be taught to offer one.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); editing a section is an inline editor / sheet,
not a chip state:
- seeded defaults, nothing personalised yet
- personalised by the owner
- a section being edited
- a contradiction flagged on save — e.g. two different warranty answers →
  shown plainly, not silently accepted
- an attempt to add discount authority → rejected with a plain reason

WIRE THESE — real prototype:
- reached from Settings and from 6.1
- "See what customers asked" → 6.5 Unanswered questions
- "Test how it answers" → 6.3
- "Save" → confirmation, stays here

VIEWPORTS — build both, one design: DESKTOP 1440px primary (owner at a
desk, sidebar stays), MOBILE 375px companion, nested settings flow, no
bottom nav (back ‹). Side by side, mobile left, desktop right; desktop is
not a stretched phone.
```

---

# 6.5 · Unanswered questions — the improvement loop

```
Design the UNANSWERED QUESTIONS screen — the loop that keeps the agent
honest and improving. Use the selected design system; no colours or token
names — you decide the layout.

WHO: the owner (or a manager), turning real gaps into knowledge.
GOAL: answer, in one tap, what customers actually asked that the agent
couldn't handle — so it knows it from the next call.

HOLDS a short, grouped list of questions the agent could not answer,
clustered when several customers asked the same thing:
  "3 customers asked about hail damage this week"
  "2 asked whether panels can be moved if they shift house"
  "1 asked about a specific bank's loan"
Each shows how many asked, when, and (on tap) the calls it came from.

ANSWERING is the point: one tap opens a place to write the answer in the
owner's words; saving adds it to the right knowledge section (6.4) and the
agent uses it next time. Dismiss a question that isn't worth answering.

Make it feel like progress, not a chore — the list should shrink as he
answers, and it should be reachable from the performance screen too.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); the answer editor is a sheet, not a chip state:
- several clustered questions waiting
- the answer editor open for one question
- one answered → it leaves the list, confirmation that the agent now knows
- empty — nothing outstanding, the agent is fully briefed (a good state,
  not a blank screen)

WIRE THESE — real prototype:
- reached from 6.4, from 6.8 Agent performance, and from a notification
- answering a question → writes to 6.4 and confirms
- tapping the source calls → 6.7 Call result

VIEWPORTS — build both, one design. This one is genuinely used on MOBILE
too (an owner clears these from his phone), so make mobile first-class;
DESKTOP 1440px keeps the sidebar. Nested flow, no bottom nav on mobile
(back ‹). Side by side, mobile left, desktop right; desktop is not a
stretched phone.
```

---

# 6.6 · Agent queue & call eligibility

```
Design the AGENT QUEUE and CALL ELIGIBILITY screen. Use the selected
design system; no colours or token names — you decide the layout.

WHO: the owner or manager, seeing who the agent is about to call, when,
and why — and being sure it is allowed to.
GOAL: full visibility and control over automated calls before they happen.

THE QUEUE — who is scheduled, each row showing: customer, when the call is
planned, and WHY it was queued (the trigger):
- proposal unopened for 3 days
- a rep's follow-up task overdue 2 days
- 3 failed manual attempts
- handed to the agent on demand by a rep (D17)
Anyone can be removed from the queue.

CALL ELIGIBILITY — per customer, shown before the agent may dial, because
the agent CANNOT call without this being clear:
- consent captured?
- DND-listed?
- a do-not-call flag a rep or the customer set?
- inside the calling window?
A customer who is not clearly eligible is shown as blocked from calling,
with the reason.

🔒 LOCKED, shown as fixed: the agent will not dial a DND / do-not-call
number or one outside 9am–9pm, whatever the queue says. A "stop calling"
flag is irreversible without the customer's say-so.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- a normal queue with several scheduled calls
- a customer blocked (DND / do-not-call) — visibly not callable, reason shown
- empty queue — nobody scheduled, explained (not a blank screen)
- a call in progress right now
- removing someone from the queue (confirmation)

WIRE THESE — real prototype:
- reached from Settings / the agent area, and from My Day
- a queued row → 6.7 Call result once the call happens
- "Remove from queue" → confirmation → row leaves
- a blocked row → the lead, to fix consent / flags

TOUCHES A BUILT SCREEN: the on-demand trigger comes from the lead-detail
"Hand to the agent" action (added in this phase) — a lead handed over
appears here.

VIEWPORTS — build both, one design: DESKTOP 1440px primary (sidebar
stays), MOBILE 375px companion, nested flow, no bottom nav on mobile (back
‹). Side by side, mobile left, desktop right; desktop is not a stretched
phone.
```

---

# 6.7 · Call result + transcript

```
Design the CALL RESULT and TRANSCRIPT — what a rep sees after the agent
talks to their customer. Use the selected design system; no colours or
token names — you decide the layout.

WHO: a rep, opening what the agent did on their behalf.
GOAL: understand the call in seconds, trust it, and correct it if wrong.

THIS EXPANDS AN ALREADY-BUILT SCREEN. On the lead-detail timeline (Phase 2)
an agent call already appears as a 🤖 entry with a [Transcript] link, and
it appears in My Day's "Agent activity" block. This screen is what opens
when either is tapped. Do NOT redesign the timeline or My Day — this is the
detail they open into.

THE CALL RESULT shows (D18):
- outcome — interested · not interested · callback requested · no answer ·
  asked to stop
- a one-line summary in plain language ("asked about the subsidy timeline,
  wants a callback Thursday 4pm")
- interest signal, and any action the agent took (booked a callback / site
  visit)
- which config version answered (so a dispute is answerable)
- date, duration, language spoken

THE TRANSCRIPT & RECORDING on tap: the full turn-by-turn transcript and an
audio player. If the customer declined recording, say so plainly — no
recording, but the outcome still stands.

THE REP CAN CORRECT IT: the rep's read always wins (they can change the
outcome); a correction is logged and trains nothing automatically without
review.

ESCALATION: if this call was handed to a human (e.g. a price question), the
reason is shown clearly, and the rep sees it was routed to them.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); the transcript and audio are overlays, not chip
states:
- a normal result (interested, callback booked)
- an escalated call — handed to a human, reason shown ("asked for a
  discount")
- no answer — nothing said, next attempt noted
- customer asked to stop — do-not-call set, shown as irreversible
- recording declined — transcript only, or a plain "no recording" note
- the rep correcting the outcome (overlay)

WIRE THESE — real prototype:
- reached FROM the lead-detail timeline [Transcript] and from My Day's
  agent-activity rows
- "Play recording" / "Read transcript" → overlays that close back
- "Correct the outcome" → editor → saved to the lead
- "Call the customer" → hand to the OS
- an escalation → links to the rep's notification (Phase 9 placeholder)

VIEWPORTS — build both, one design. MOBILE 375px is primary (a rep reads
this on their phone), DESKTOP 1440px shows it beside the lead. Nested, no
bottom nav on mobile (back ‹ to the lead). Side by side, mobile left,
desktop right; desktop is not a stretched phone.
```

---

# 6.8 · Agent performance

```
Design the AGENT PERFORMANCE screen — the reason an owner keeps paying for
the agent. Use the selected design system; no colours or token names — you
decide the layout.

WHO: the owner, a month in, deciding whether the automated calling was
worth it.
GOAL: show honestly what the agent did — enough to justify it, never
inflated.

HEADLINE NUMBERS, this month vs last:
- calls attempted, connected (with connect rate), callbacks booked, site
  visits booked, handed to a human, questions it couldn't answer
OUTCOMES as a simple breakdown: interested · not interested · callback
requested · no answer · asked to stop.
WHAT IT SAVED YOU: conversations the team didn't have to start, and rough
hours of calling time.

DEALS IT TOUCHED — and THE HONESTY RULE THIS MUST FOLLOW: this is
correlation, NOT attribution, and the screen must SAY SO on the screen, not
in a tooltip:
  "The agent called and the customer responded within 3 days. We cannot
   prove the call caused it."
Never claim the agent "generated ₹X". State the limit — it is the whole
point of this product's honesty.

SUPPORTING VIEWS (as states/sections on this page):
- Call log — every call: customer, duration, outcome, language, config
  version, transcript, recording; filterable
- Unanswered questions — the 6.5 list, linked
- Cost — calls made, minutes used, against the plan (placeholder numbers,
  pricing not set — D26)
- Per-rep view — which reps lean on the agent, whose leads it rescued
  (manager-only)

WARN, don't hide: if the connect rate collapses, surface it with the likely
cause; if the agent escalates almost everything, link straight to 6.5.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- the normal dashboard
- call log view
- per-rep view (manager-only)
- cost view (placeholder pricing)
- a warning state — connect rate dropped, cause shown
- empty / first month — not enough data yet, explained honestly

WIRE THESE — real prototype:
- reached from the agent area / Reports
- "Review unanswered" → 6.5
- a call-log row → 6.7 Call result
- filters change the log in place

VIEWPORTS — build both, one design: DESKTOP 1440px primary (an owner reads
reports at a desk, sidebar stays), MOBILE 375px a readable summary. Side by
side, mobile left, desktop right; desktop is not a stretched phone.
```

---

## After Phase 6 — STOP

Run the nine-point review gate in `build-plan.md`, plus these specific to this phase:

- Is the **AI self-disclosure** visibly locked everywhere it appears, and is **"talk to a
  person"** present on every call surface?
- Does the owner configure **without ever seeing a prompt box** (D24)?
- Is the **price/discount escalation** locked ON, and does the agent visibly refuse discounts
  in the test (6.3)?
- Is **call eligibility** (consent, DND, do-not-call, hours) shown *before* a dial, and is a
  blocked customer genuinely un-callable?
- Does the **unanswered-questions loop** actually write back to the knowledge base and shrink?
- Does **Agent performance** state "deals it touched" as **correlation, not attribution**, on
  the screen itself?
- **Backward compatibility:** does the call result (6.7) open cleanly from the existing lead
  timeline and My Day without redesigning them, and does the lead now carry a working "Hand to
  the agent" action?

Then bring all eight back before Phase 7.
