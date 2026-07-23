# Phase 6 — The Voice Agent  ▸ 7 screens

**An automated assistant that calls customers, shaped entirely by the company that owns it.**
The agent is **fully configurable per tenant** — name, voice, tone, languages, what it says,
what it knows, when it hands over, when it calls. Our job is to make configuring it feel
**simple**, with good defaults, not a control panel.

Reference: `product-journey.md` — Stage 7, Tenant Configuration A & B, Agent Performance;
decisions **D8, D17, D18, D36** (D36 supersedes the "locked by platform" half of D24).
Worklist and review gate: `build-plan.md`.

---

## ⚠️ HOW TO USE THESE PROMPTS — read once

**Each prompt below is SELF-CONTAINED.** Copy the ONE fenced block for a screen and paste it
into Claude Design as-is — the context, states, wiring, viewport and rules are already inside
every block. Nothing to splice. The prose outside the blocks is for **you**; don't paste it.

Baked into every block so you needn't remember it:
- No colours, hex or token names in a prompt — the design system carries the look; Claude
  Design decides the layout.
- One page per screen, states swapped by a header chip (not separate static frames).
- It must be a working prototype — actions wired, sheets open and close, no dead ends.
- **Connect, don't duplicate** — if a screen, action or nav already exists in the project,
  wire into it and extend it; never build a second copy.

---

## The one principle: everything is the owner's, kept simple (D36)

**Nothing is locked.** The owner configures the agent their way — its whole personality,
script, knowledge, hand-over rules and calling schedule are theirs to set and change.

**Make it easy, not powerful-looking:**
- Every setting has a **sensible default already filled**, so the agent works on day one
  without touching anything.
- Plain questions and toggles in the owner's language — never a wall of technical options.
- The app ships **India's calling rules as the starting defaults** — DND respected, calls
  9am–9pm, and the agent mentioning it's an automated assistant. The owner can change or
  switch off any of these; they decide how their agent calls and are responsible for it.
  State this **once, plainly, as a helpful note — never as a lock or a warning wall.**

---

## 🔗 SCREENS THIS PHASE TOUCHES THAT ARE ALREADY BUILT — flag, don't rebuild

Phase 6 does **not** touch the Phase 5 survey screens. It connects to Phase 2:

| Built screen | What Phase 6 does to it |
|---|---|
| **My Day (2.1)** — already has an "Agent activity" block | **Wire only.** Each agent-activity row links to the call result (6.6). Do not redesign My Day. |
| **Lead detail (2.3)** — already shows 🤖 agent timeline entries with a [Transcript] link | **Wire + one real change.** The call result (6.6) is the expansion of that entry. AND add a new action **"Hand to the agent"** (on-demand, D17) plus a small **agent-status line** on the lead (queued for a call · do-not-call · will call at…). Call this modification out in the prompt. |
| **Settings** (in More / the sidebar) | The agent config screens (6.1–6.4) are reached from here. |
| **Notifications (Phase 9, not built yet)** | The agent hands some calls to the rep (e.g. a price question, if the owner set it to) — link to a labelled placeholder until Phase 9 exists. |

Close (mark won / lost) is **not** in this phase — lost lives on the lead as "Disqualify",
won → project belongs to Phase 7.

---

## The screens, in order

```
CONFIGURE  (owner, at a desk — reached from Settings)
  6.1  Set up your agent — who it is, how it talks, when it calls, when it hands over
  6.2  Business knowledge — what it knows
  6.3  Test your agent          ← hear it before any customer does
  6.4  Unanswered questions     ← the loop that keeps it improving

RUN
  6.5  Who the agent will call
  6.6  Call result + transcript ← expands the existing lead timeline

MEASURE
  6.7  Agent performance        ← with the correlation-not-attribution caveat
```

---

# 6.1 · Set up your agent

```
Design "Set up your agent" for a solar company owner. Use the selected
design system; no colours or token names — you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: Rajesh Patil, owner of Suryodaya Solar, Nashik. Not technical. He
should feel like he's answering a few easy questions, not operating a
console. No prompt box, no jargon.
GOAL: a working, personalised agent in a few minutes, with everything
pre-filled so he could also just accept the defaults and move on.

ONE simple guided setup, everything editable, sensible defaults filled:
- Name — e.g. "Asha"
- Voice — a few samples he can play and pick
- Languages it speaks — English · हिंदी · मराठी, per customer or auto-detect
- Tone — Professional · Friendly · Direct
- Opening line — pre-written and fully editable, e.g. "Namaste, this is
  Asha from Suryodaya Solar. Is now a good time?"
- What it does when it doesn't know something — default: offer a callback
- When to hand the call to a person — a short, editable list (price
  questions, an upset customer, asks for the owner, asks to stop), each
  with what the agent says as it hands over. He can add, edit or remove any.
- When it may call — days, hours, and a holiday calendar
- One free-text box: "Anything else you'd like Asha to know or do" — so he
  is never boxed in by our fields

THE ONE HONEST NOTE (a single calm line, NOT a lock or a warning wall):
"These are set to India's calling rules — DND respected, calls between
9am and 9pm, and Asha mentioning she's an automated assistant. Change any
of them; you decide how your agent calls."
Everything in that note is editable like anything else on the screen.

Keep it SIMPLE: grouped, skippable, defaults visible. It must be possible
to reach "Test it" without changing a single field.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); voice samples and the free-text box are inline,
not chip states:
- fresh, all defaults filled (he could stop here)
- personalised (his name, tone, hours, extra hand-over rules)
- playing a voice sample
- the "anything else" free-text in use

WIRE THESE — real prototype:
- reached FROM Settings (More / the sidebar)
- moving through the groups happens on the same page
- "Test it" → 6.3
- "What it knows" → 6.2
- "Save" → confirmation, stays here

VIEWPORTS — build both, one design: DESKTOP 1440px primary (an owner sets
this up at a desk; the 240px sidebar stays, this fills the main area),
MOBILE 375px a capable companion; nested settings flow, no bottom nav
(back ‹ in the header). Side by side, mobile left, desktop right; desktop
is not a stretched phone.
```

---

# 6.2 · Business knowledge — what it knows

```
Design "Business knowledge" — what the agent knows about this company. Use
the selected design system; no colours or token names — you decide the
layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner, teaching the agent his business in his own words.
GOAL: a simple, editable set of answers — filled in already, so it works
day one and he only tweaks what he cares about.

SECTIONS, each in plain language and SEEDED with correct generic solar
answers he can personalise (or leave as-is):
- About us — years, installations, certifications, area
- Products — panel and inverter brands, why chosen
- Warranty — panel 25yr / inverter 5yr / workmanship 2yr
- Process & timeline — survey 2 days · design 3 · install 1–2 · net
  metering 3–6 weeks
- Pricing & offers — what's included, what's extra, and whatever he wants
  the agent to say about price. It's HIS call what the agent may discuss.
- Subsidy — how PM Surya Ghar works
- Financing — banks / NBFCs, typical EMI
- Common objections — "too expensive", "I'll wait", "does it work in
  monsoon?", "what about cleaning?" — with the answer he wants given
- A free-text "Anything else" so he's never limited to our sections

Make clear every section is already filled (seeded) and editable — day one
it works, over weeks it sounds like him.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); editing a section is an inline editor / sheet:
- seeded defaults, nothing personalised yet
- personalised by the owner
- a section being edited
- the free-text "anything else" in use

WIRE THESE — real prototype:
- reached from Settings and from 6.1
- "See what customers asked" → 6.4 Unanswered questions
- "Test how it answers" → 6.3
- "Save" → confirmation, stays here

VIEWPORTS — build both, one design: DESKTOP 1440px primary (sidebar
stays), MOBILE 375px companion, nested settings flow, no bottom nav (back
‹). Side by side, mobile left, desktop right; desktop is not a stretched
phone.
```

---

# 6.3 · Test your agent

```
Design "Test your agent" — where the owner hears exactly what a customer
will hear, before anyone else does. Use the selected design system; no
colours or token names — you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner, about to let an automated voice represent his company.
GOAL: try it, trust it, and fix anything that sounds off — in one place.

TWO WAYS TO TEST:
1. CALL YOURSELF — enter a number, the agent calls, he has a real spoken
   conversation and hears the voice, tone and opening line.
2. TYPED CONVERSATION — a quick chat-style simulation without a call: he
   types what a customer might say and sees the agent's replies, in the
   chosen language.

He can jump back to 6.1 / 6.2 to fix anything, then re-test. Keep it
light and obvious — this should feel like pressing play, not configuring
a test harness.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); the live call is an overlay, not a chip state:
- idle, choose how to test
- a live test call in progress (overlay), with a way to end it
- a typed simulation mid-conversation, several turns
- something sounded wrong → quick links back to fix the script or knowledge

WIRE THESE — real prototype:
- reached from 6.1 / 6.2 ("Test it")
- "Fix the script" → 6.1; "Fix knowledge" → 6.2
- "Turn the agent on" → confirmation

VIEWPORTS — build both, one design: DESKTOP 1440px primary, MOBILE 375px
companion, nested settings flow, no bottom nav (back ‹). Side by side,
mobile left, desktop right; desktop is not a stretched phone.
```

---

# 6.4 · Unanswered questions

```
Design "Unanswered questions" — the simple loop that keeps the agent
improving. Use the selected design system; no colours or token names —
you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner (or a manager), turning real gaps into knowledge.
GOAL: answer, in one tap, what customers actually asked that the agent
couldn't handle — so it knows it next time.

A short list of what the agent couldn't answer, clustered when several
customers asked the same thing:
  "3 customers asked about hail damage this week"
  "2 asked whether panels move if they shift house"
Each shows how many asked and when. One tap opens a place to write the
answer in his words; saving adds it to the right knowledge section (6.2)
and the agent uses it next time. He can dismiss ones not worth answering.

Make it feel like progress — the list shrinks as he answers.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); the answer editor is a sheet:
- several clustered questions waiting
- the answer editor open for one
- one answered → it leaves the list, confirmed
- empty — nothing outstanding (a good state, not a blank screen)

WIRE THESE — real prototype:
- reached from 6.2, from 6.7 Agent performance, and from a notification
- answering → writes to 6.2 and confirms
- the source calls → 6.6 Call result

VIEWPORTS — build both, one design. Genuinely used on MOBILE too (an owner
clears these from his phone), so make mobile first-class; DESKTOP 1440px
keeps the sidebar. Nested, no bottom nav on mobile (back ‹). Side by side,
mobile left, desktop right; desktop is not a stretched phone.
```

---

# 6.5 · Who the agent will call

```
Design "Who the agent will call" — the owner's view of upcoming automated
calls, and easy control over them. Use the selected design system; no
colours or token names — you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner or manager, seeing who's about to be called and why, and
staying in control.
GOAL: full visibility and one-tap control — nothing calls that shouldn't.

THE LIST — who is scheduled, each row: customer, when, and WHY it was
queued:
- proposal unopened for 3 days
- a rep's follow-up overdue 2 days
- 3 failed manual attempts
- handed to the agent on demand by a rep (D17)
Anyone can be removed, and the "why" is always visible.

PER-CUSTOMER STATUS shown simply, as information, so the owner understands
what will happen — not a blocking wall:
- will call at [time] · on do-not-call (won't be called) · outside calling
  hours (waits until the window)
These reflect the owner's own settings from 6.1; a customer who asked to
stop is shown as do-not-call and isn't called.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- a normal list of scheduled calls
- a customer on do-not-call — shown plainly as won't-be-called
- empty — nobody scheduled, explained (not a blank screen)
- a call happening right now
- removing someone (quick confirm)

WIRE THESE — real prototype:
- reached from Settings / the agent area, and from My Day
- a scheduled row → 6.6 Call result once the call happens
- "Remove" → quick confirm → row leaves
- a row → the lead

TOUCHES A BUILT SCREEN: the on-demand entries come from the lead-detail
"Hand to the agent" action added in this phase.

VIEWPORTS — build both, one design: DESKTOP 1440px primary (sidebar
stays), MOBILE 375px companion, nested flow, no bottom nav on mobile (back
‹). Side by side, mobile left, desktop right; desktop is not a stretched
phone.
```

---

# 6.6 · Call result + transcript

```
Design the CALL RESULT and TRANSCRIPT — what a rep sees after the agent
talks to their customer. Use the selected design system; no colours or
token names — you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: a rep, opening what the agent did on their behalf.
GOAL: understand the call in seconds, trust it, and correct it if wrong.

THIS EXPANDS AN ALREADY-BUILT SCREEN. On the lead-detail timeline (Phase 2)
an agent call already appears as a 🤖 entry with a [Transcript] link, and
in My Day's "Agent activity" block. This screen opens when either is
tapped. Do NOT redesign the timeline or My Day — this is their detail view.

THE RESULT shows (D18):
- outcome — interested · not interested · callback requested · no answer ·
  asked to stop
- a plain one-line summary ("asked about the subsidy timeline, wants a
  callback Thursday 4pm")
- interest signal, and any action taken (booked a callback / site visit)
- date, duration, language spoken

THE TRANSCRIPT & RECORDING on tap: full turn-by-turn transcript and audio.
If the customer declined recording, say so plainly — outcome still stands.

THE REP CAN CORRECT IT: the rep's read always wins; they can change the
outcome, and the change is logged.

HANDED TO A HUMAN: if the agent handed this call over (per the owner's
settings), the reason is shown and the rep sees it was routed to them.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames); transcript and audio are overlays:
- a normal result (interested, callback booked)
- a handed-over call — reason shown ("asked about a discount")
- no answer — next attempt noted
- customer asked to stop — shown as do-not-call going forward
- recording declined — transcript only / plain "no recording" note
- the rep correcting the outcome (overlay)

WIRE THESE — real prototype:
- reached FROM the lead-detail [Transcript] link and My Day's agent rows
- "Play recording" / "Read transcript" → overlays that close back
- "Correct the outcome" → editor → saved to the lead
- "Call the customer" → hand to the OS
- a hand-over → the rep's notification (Phase 9 placeholder)

VIEWPORTS — build both, one design. MOBILE 375px primary (a rep reads this
on their phone), DESKTOP 1440px shows it beside the lead. Nested, no bottom
nav on mobile (back ‹ to the lead). Side by side, mobile left, desktop
right; desktop is not a stretched phone.
```

---

# 6.7 · Agent performance

```
Design "Agent performance" — the reason an owner keeps the agent. Use the
selected design system; no colours or token names — you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner, a month in, deciding whether the automated calling was
worth it.
GOAL: show honestly what the agent did — enough to justify it, never
inflated.

HEADLINE NUMBERS, this month vs last: calls attempted, connected (with
rate), callbacks booked, site visits booked, handed to a human, questions
it couldn't answer.
OUTCOMES breakdown: interested · not interested · callback · no answer ·
asked to stop.
WHAT IT SAVED YOU: conversations the team didn't have to start, rough hours
of calling time.

DEALS IT TOUCHED — and THE HONESTY RULE: this is correlation, NOT
attribution, and the screen must SAY SO on the screen, not in a tooltip:
  "The agent called and the customer responded within 3 days. We cannot
   prove the call caused it."
Never claim the agent "generated ₹X".

SUPPORTING VIEWS (as states on this page):
- Call log — every call: customer, duration, outcome, language,
  transcript, recording; filterable
- Unanswered questions — the 6.4 list, linked
- Usage — calls made and minutes used this period, as a plain activity stat
  (no plan cap or limit — billing is deferred, D38)
- Per-rep view — which reps lean on the agent (manager-only)

WARN, don't hide: if the connect rate collapses, surface it with the likely
cause; if it escalates almost everything, link straight to 6.4.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- the normal dashboard
- call log view
- per-rep view (manager-only)
- usage view (activity only, no plan cap)
- a warning — connect rate dropped, cause shown
- empty / first month — not enough data yet, explained honestly

WIRE THESE — real prototype:
- reached from the agent area / Reports
- "Review unanswered" → 6.4
- a call-log row → 6.6 Call result
- filters change the log in place

VIEWPORTS — build both, one design: DESKTOP 1440px primary (an owner reads
reports at a desk, sidebar stays), MOBILE 375px a readable summary. Side by
side, mobile left, desktop right; desktop is not a stretched phone.
```

---

## After Phase 6 — STOP

Run the nine-point review gate in `build-plan.md`, plus these specific to this phase:

- Could a non-technical owner set up the agent in a few minutes, **accepting the defaults**
  without touching a thing?
- Is **everything editable** — script, hand-over rules, calling hours, what it may discuss —
  with nothing presented as a locked wall (D36)?
- Is the "India's calling rules are the defaults, change them if you like" note **a single
  calm line**, not a warning?
- Does the **unanswered-questions loop** write back to the knowledge base and shrink?
- Does **Agent performance** state "deals it touched" as **correlation, not attribution**, on
  the screen itself?
- **Backward compatibility:** does the call result (6.6) open cleanly from the existing lead
  timeline and My Day without redesigning them, and does the lead now carry a working "Hand to
  the agent" action?

Then bring all seven back before Phase 7.
