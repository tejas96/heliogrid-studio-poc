# Phase 9 — Dashboards & the rest  ▸ 5 screens

**The owner's honest, decision-oriented view — not a KPI wall (D37).** The whole product
refuses vanity metrics: My Day is a list of what to *do*, not a wall of numbers. Dashboards
keep that promise — every tile earns its place by answering **"what do I do about this?"** The
daily driver stays My Day; this is where an owner steps back, weekly or monthly.

Reference: `product-journey.md` — "Dashboards & reports" (D37), Cross-cutting (Notifications,
Search); decisions **D20** (visibility follows role), **D37**. Worklist and gate: `build-plan.md`.

---

## ⚠️ HOW TO USE THESE PROMPTS — read once

**Each prompt below is SELF-CONTAINED.** Copy the ONE fenced block for a screen and paste it
into Claude Design as-is — context, states, wiring, viewport and rules are already inside. The
prose outside the blocks is for **you**; don't paste it.

Baked into every block:
- No colours, hex or token names — the design system carries the look; you decide the layout.
- **Charts use the design system's DATA-visualization colours, never the brass accent** — the
  accent is a fill/graphic colour, not a data colour (N6). No data colour used for chrome.
- One page per screen, states swapped by a header chip (not separate static frames).
- A working prototype — actions wired, sheets open and close, no dead ends.
- **Connect, don't duplicate** — if a screen, action or nav already exists in the project,
  wire into it and extend it; never build a second copy.

---

## The one principle: these screens READ — they never create (D37)

Everything shown comes from data already captured elsewhere — leads (Phase 2), proposals
(Phase 3), the customer link (Phase 4), survey (Phase 5), the agent (Phase 6), projects and
payments (Phase 7). **A dashboard surfaces and links; it is never a place you enter data.**
Every attention item, chart segment and search result **deep-links to the real lead, proposal
or project.**

**The honesty rules (D37) — hold them on every figure:**
- **Forecast is a projection, never revenue** — weighted pipeline, labelled *expected, not
  promised*, never in the same total as won.
- **Won means signed;** a deal cancelled after Won stops counting immediately.
- **Agent contribution is correlation, not attribution** — link to Agent performance
  (Phase 6); don't re-claim credit.
- **Visibility follows role (D20)** — a rep sees only their own, a manager their team, the
  owner everything. Same screen, scoped.

---

## 🔗 WHAT THIS PHASE CONNECTS TO — flag, don't rebuild

| Built / existing | What Phase 9 does with it |
|---|---|
| **My Day (2.1)** | Stays the rep's task-driven daily home. The owner dashboard's "what needs you" is the *business-level* step-back, NOT a rebuild of My Day. |
| **Leads / proposals / projects / agent** | Dashboards READ and deep-link into them; every row opens the real thing. |
| **Agent performance (Phase 6)** | The owner dashboard's agent card links to it — don't duplicate its numbers. |
| **Settings home (Phase 8)** | The "settings hub" is that screen, reached from here — not rebuilt. |
| **Leads-list search (2.2)** | That search is scoped to leads. Global search (9.5) is app-wide and *additional* — connect it into the top-bar/nav, don't replace the leads filter. |
| **Nav (arc / sidebar)** | Dashboards are reached from **Reports** (More / sidebar); notifications from a bell; search from a global field. Wire into the existing nav. |

---

## The screens, in order

```
  9.1  Owner dashboard        (what-needs-you + cash lead; then the rest)
  9.2  Rep dashboard          (how am I doing — secondary to My Day)
  9.3  Pipeline funnel + win/loss
  9.4  Notifications centre
  9.5  Global search
```

---

# 9.1 · Owner dashboard

```
Design the OWNER DASHBOARD — the honest view of the whole business. Use the
selected design system; no colours or token names — you decide the layout.
Charts use the system's data-visualization colours, never the brass accent.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: Rajesh Patil, owner of Suryodaya Solar, stepping back weekly or
monthly — NOT his daily driver (that's My Day).
GOAL: see what needs action and whether the business is healthy, honestly.

SECTIONS, IN THIS PRIORITY ORDER (the attention list and cash lead; the
totals sit quietly below):

1. WHAT NEEDS YOU — the honest attention list, first and prominent. Each
   row deep-links to the real thing:
   - deals going cold — a lead with an overdue next action or no activity
     for a while ("Anand Traders · Negotiating · no activity 18 days").
     (Pre-Won deals: this is "no recent activity / overdue follow-up", not
     project days-in-stage.)
   - proposals sent, not opened — "Priya Sharma · shared 4 days ago"
   - projects blocked — "Deshmukh Textiles · waiting on DISCOM · 34 days
     in stage" (post-Won projects DO track days-in-stage, Phase 7)
   - payments overdue — "Kavita Joshi · ₹70,369 due since 20 Aug"

2. CASH — collected vs due this month (from the project tranches, Phase 7),
   and the overdue total. This is what an owner actually worries about.

3. PIPELINE — value and count by stage (New → … → Won).

4. THIS PERIOD — WON (signed) value vs last period, and vs target IF one is
   set. Won means signed only — never mixed with forecast. A target is
   OPTIONAL and set INLINE here (a small "set target" action) — there is no
   separate targets settings screen in v1; the dashboard works fine without
   one and never nags.

5. FORECAST — weighted pipeline (value × how likely each stage is), clearly
   labelled "expected, not promised". Never in the same figure as won.

6. WIN / LOSS — win rate this period and the loss-reason breakdown (BOTH
   the early "disqualified" reasons and the late "lost" reasons — see 9.3);
   links to the funnel detail (9.3).

7. AGENT — a compact card linking to Agent performance (Phase 6). Do NOT
   restate its numbers or claim revenue; it is correlation, not attribution.

8. TEAM — a per-rep pipeline / conversion snapshot (owner and manager
   only), each rep linking to their detail.

SCOPED BY ROLE (D20): an owner sees everything; a manager sees this
team-scoped; a rep does not see this screen (they get 9.2).

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- the normal dashboard, with data
- brand-new company, no data yet — teach what will appear and why, never a
  broken empty chart
- mid-month — "so far this month", honest, not projected to full month
- no target set — works fine, no nag
- an outlier ₹92L C&I deal flagged so it doesn't make the pipeline look
  healthier than it is
- manager view — the same screen scoped to their team

WIRE THESE — make them work in the prototype:
- reached from Reports (More / the sidebar)
- every "what needs you" row → the real lead / proposal / project
- Win/loss → 9.3 · Agent card → Agent performance (Phase 6) · a rep → their
  detail
- a short monthly summary is pushed in-app (where owners actually read)

VIEWPORTS — build both, one design. A destination reached from Reports:
MOBILE 375px keeps the arc nav, a readable stacked summary (what-needs-you
and cash first); DESKTOP 1440px the full dashboard with the sidebar. Side
by side, mobile left, desktop right; desktop is not a stretched phone.
```

---

# 9.2 · Rep dashboard

```
Design the REP DASHBOARD — "how am I doing", secondary to My Day. Use the
selected design system; no colours or token names — you decide the layout.
Charts use the system's data-visualization colours, never the brass accent.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: a sales rep (Priya Nair) checking their own progress. Their DAILY
driver stays My Day (tasks); this is the occasional step-back.
GOAL: understand my own pipeline and conversion — my data only (D20).

HOLDS, all scoped to this rep:
- my pipeline value and count by stage
- my win rate, and my proposals out / opened / accepted
- my follow-up load (how many are due / overdue)
- my target for the period, if one is set (optional)
Keep it modest and honest — this is not a leaderboard; the numbers are
descriptive. Win/loss counts on CLOSED deals, not on self-marked interest.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- normal, with data
- a brand-new rep with little data — teach, don't show broken charts
- no target set — fine, no nag
- mid-month — "so far", honest

WIRE THESE — make them work in the prototype:
- reached from Reports (More / the sidebar)
- my pipeline stage → my leads in that stage
- my proposals → the proposals list, filtered to mine
- a rep never sees the owner/team view

VIEWPORTS — build both, one design. A destination from Reports: MOBILE
375px keeps the arc nav, a compact personal summary; DESKTOP 1440px with
the sidebar. Side by side, mobile left, desktop right; desktop is not a
stretched phone.
```

---

# 9.3 · Pipeline funnel + win/loss

```
Design the PIPELINE FUNNEL + WIN/LOSS — where and why deals leak. Use the
selected design system; no colours or token names — you decide the layout.
Charts use the system's data-visualization colours, never the brass accent.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: the owner or manager, asking "where and why do we lose deals?"
GOAL: see the leaks in the pipeline and the honest reasons behind losses.

THE FUNNEL — the stages a deal moves through, with count and value at each
and the CONVERSION between them, so the leak points are obvious. Use the
lead pipeline's ACTUAL stages as built in the leads list (2.2):
  New lead → Contacted → Qualified → Survey → Designing → Proposal sent →
  Negotiating → Won
Highlight the biggest drop-off (e.g. "half the deals stall between Proposal
and Negotiating"). Also show TIME-IN-STAGE — where deals sit longest.

WIN / LOSS REASONS — by count AND value (a few high-value losses matter
more than many small ones). THERE ARE TWO reason lists in the app, and the
journey calls BOTH the most valuable analytics — show both, kept distinct,
because they teach different lessons:
- LOST LATE — a quoted deal that fell through (Mark lost, Phase 7):
  price · chose a competitor · postponed · not reachable · roof unsuitable ·
  financing failed
- DISQUALIFIED EARLY — a lead ruled out before a quote (Disqualify on the
  lead, Phase 2): renting · budget · not interested · unreachable ·
  already installed · wrong number
Losing a warm, quoted deal to a competitor is a different problem from
disqualifying a renter on day one — don't merge them into one list.

Filterable by period and by rep (manager/owner scope, D20).

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- the normal funnel + win/loss
- a leaking stage highlighted, with the drop-off called out
- win/loss reasons sorted by value vs by count
- filtered to one rep / one period
- no data yet — teach what will appear

WIRE THESE — make them work in the prototype:
- reached from the owner dashboard (9.1) "Win/loss" and from Reports
- a funnel stage → the leads sitting in it
- a loss reason → the deals lost for that reason

VIEWPORTS — build both, one design: DESKTOP 1440px primary (an owner reads
this at a desk, sidebar stays), MOBILE 375px a readable vertical funnel.
Side by side, mobile left, desktop right; desktop is not a stretched phone.
```

---

# 9.4 · Notifications centre

```
Design the NOTIFICATIONS CENTRE — everything that happened that a user
should know about. Use the selected design system; no colours or token
names — you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: any user — a rep, an owner — catching up on what needs attention.
GOAL: see what happened, grouped and actionable, and jump straight to it.

THE NOTIFICATIONS (push + in-app; never email-only), each deep-linking to
the thing that changed:
- a proposal was opened by a customer
- the agent escalated a call (e.g. a price question) — prominent, this is
  time-sensitive
- a follow-up is due / overdue
- a survey was submitted (to the designer)
- a design was returned by the engineer — NOTE: the design / engineer
  sign-off screens are Phase 10 (the studio, deferred — D23). Link this
  one notification to a labelled placeholder until Phase 10 is built.
- a payment is due
Group by time and/or type, show read / unread, and let the user act (open,
mark read, snooze) without leaving. Every other notification deep-links to
a screen that already exists.

Opened from a bell in the top bar / nav (wire into the existing nav — do
not invent a second notification surface).

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- a full list with unread items, grouped
- an agent escalation at the top, visually urgent
- all caught up — a calm empty state, not a blank screen
- read vs unread styling
- grouped by type

WIRE THESE — make them work in the prototype:
- the bell in the nav → this centre
- each notification → the real lead / proposal / project / call result
- "Mark all read", per-item snooze

VIEWPORTS — build both, one design. Reached from the nav everywhere:
MOBILE 375px full screen (nested from the bell, back ‹); DESKTOP 1440px as
a panel from the bell with the sidebar visible. Side by side, mobile left,
desktop right; desktop is not a stretched phone.
```

---

# 9.5 · Global search

```
Design GLOBAL SEARCH — one field that finds anything in the app. Use the
selected design system; no colours or token names — you decide the layout.

EXISTING APP — CONNECT, DON'T DUPLICATE: this project already contains
built screens and shared navigation. Wherever this prompt refers to a
screen, action or nav that already exists, wire into it and extend it —
do not create a duplicate, a second copy, or a new isolated page. Claude
Design tends to add pages; here, connect first.

WHO: anyone trying to jump straight to a customer, deal or project by name.
GOAL: type a name, phone or city and land on the right thing in seconds.

ONE FIELD that searches ACROSS everything, results grouped by type:
- Leads / customers (by name, phone, city)
- Sites / addresses
- Quotes / proposals (by customer or proposal number)
- Projects
NOTE: this is APP-WIDE and additional to the leads-list search (2.2), which
stays scoped to leads. Do not replace that filter — this is the global one,
opened from a search field in the top bar / nav.

Results appear as you type, grouped and labelled by type, each opening the
real screen. Recent / suggested items before typing.

STATES — switch from a header chip on ONE mobile+desktop frame pair (never
separate static frames):
- empty / just opened — recent and suggested items
- typing, results grouped by type ("Priya Sharma" → a lead, a proposal,
  a project)
- no results — a plain, helpful message, not a dead end
- a result focused, ready to open

WIRE THESE — make them work in the prototype:
- the global search field in the nav → this
- a result → the real lead / customer / quote / project
- clearing / cancelling → back where they were

VIEWPORTS — build both, one design. Opened from the nav everywhere: MOBILE
375px a full-screen search overlay; DESKTOP 1440px a search field with a
results dropdown / panel. Side by side, mobile left, desktop right; desktop
is not a stretched phone.
```

---

## After Phase 9 — STOP

Run the nine-point review gate in `build-plan.md`, plus these specific to this phase:

- Does the owner dashboard **lead with "what needs you" and cash**, with the vanity totals
  sitting quietly below (D37)?
- Is **forecast clearly a projection**, never mixed into the won total — and does **won mean
  signed** with cancelled-after-won not counted?
- Does the **agent card link to Agent performance** rather than re-claiming revenue?
- Do **charts use the data-visualization colours, never the brass accent** (gate #4)?
- Do **all figures scope by role** — rep sees own, manager team, owner all (D20)?
- Does everything **deep-link into the real lead / proposal / project** — and does nothing on
  these screens let you *enter* data (they READ only)?
- Is **global search app-wide** and additive to the leads-list filter, not a replacement?

Then bring all five back before Phase 10 (the studio — LAST, D23).
