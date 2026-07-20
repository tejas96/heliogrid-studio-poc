# HelioGrid — Complete Product Journey

**The single working file for product design.** Journey, screens, scenarios, decisions and
the prompts we feed Claude Design. Grows as we walk the journey stage by stage.

Companions (already done, do not duplicate here):
- `docs/claude-design-system.md` — how it looks
- `docs/product-spec.md` — objects and screen inventory
- `docs/DESIGN-SYSTEM.md` — the Claude Code rulebook

---

## Decisions locked

| # | Decision | Date |
|---|---|---|
| D1 | Residential **and** C&I, both high volume | 2026-07-20 |
| D2 | Full mobile parity — every screen works at 375px, including the design studio | 2026-07-20 |
| D3 | Brand: "Instrument" — warm graphite + brass, ink label on brass fills | 2026-07-20 |
| D4 | WhatsApp is the primary customer channel; email secondary | 2026-07-20 |
| D5 | Customer never logs in — tokenised link only | 2026-07-20 |
| D6 | Tailwind + Radix in code; Claude Design for screens | 2026-07-20 |
| D7 | Three audiences: company **owner**, **employees**, and the **EPC's customer** | 2026-07-21 |
| D8 | A **voice agent** calls customers for follow-ups and answers inbound questions | 2026-07-21 |
| D9 | v1 = **Sell + light project tracking**. Won deal → Ordered → Installed → Commissioned → Handed over, plus a document checklist and customer-visible progress. **No** inventory, POs, scheduling engine or O&M. | 2026-07-21 |
| D10 | Voice agent may: follow up, answer FAQ, book callbacks/visits, gauge interest. It may **never** discuss discounts, negotiate, or accept a deal — price always escalates to a human. Every call is transcribed onto the lead timeline. | 2026-07-21 |
| D11 | **Self-serve signup**, free trial. Billing prompted later, not at signup. | 2026-07-21 |
| D12 | App UI **English**. Voice agent speaks **Hindi, Marathi, Gujarati, Tamil, Telugu + English**, chosen per customer. | 2026-07-21 |

## Constraints the voice agent inherits (India)

Not optional, and they shape the UI:
- **TRAI / DND** — commercial calls to DND-registered numbers are restricted. The app must
  hold consent per customer and visibly show call eligibility before an agent dials.
- **Calling hours** — no automated calls outside ~9am–9pm local. The scheduler enforces it.
- **AI disclosure** — the agent identifies itself as an automated assistant at call start.
- **Recording consent** — captured and stored; the customer can decline and still be served.
- **Human escape hatch** — "talk to a person" must always work, on every call.

| D13 | v1 lead sources: **manual quick-add, CSV import, inbound call via voice agent.** Website form and inbound WhatsApp are deferred — WhatsApp is outbound-only in v1. | 2026-07-21 |
| D14 | Assignment is **manual, with each rep's open load visible** at the moment of assigning. No auto-routing rules in v1. | 2026-07-21 |
| D15 | Survey is a **task assignable to anyone** with the capability — rep or dedicated surveyor. One capture flow for both. | 2026-07-21 |
| D16 | Customer sees **one recommended system** by default; the designer may add variants when the customer is price-sensitive or undecided. | 2026-07-21 |

| D17 | Voice agent triggers **two ways**: automatically as a safety net (proposal unopened 3d · rep task overdue 2d · 3 failed manual attempts), **and** on demand when a rep hands a lead to it. | 2026-07-21 |
| D18 | After a call the timeline shows **outcome + one-line summary + interest signal**, with transcript and recording available on tap. | 2026-07-21 |
| D19 | **The owner approves every discount.** ⚠️ Known bottleneck past ~3 people — mitigated by one-tap approve from the notification, batch approve, and quotes with zero discount needing no approval at all. Revisit when a team passes 5 reps. | 2026-07-21 |
| D20 | **Reps see only their own leads.** Managers see the team's, owner sees everything. | 2026-07-21 |
| D21 | **Two ways to send a proposal: WITH a design, or WITHOUT one.** Both use the same 11-step proposal builder. A design pre-fills most of it; without a design the user types or AI-fills the same fields. See Stage 6B. | 2026-07-21 |
| D25 | **The app UI is multilingual: English, Hindi, Marathi.** Supersedes the English-only half of D12. Voice agent languages stay configurable per tenant, defaulting to the same three. Devanagari support is a design-system change, not just a translation task — see "Multilingual". | 2026-07-21 |
| D26 | **Billing screens are MOCK for now.** Pricing, tiers and limits are not decided. Design the shape — plans, usage, upgrade, payment failure, suspension — with placeholder numbers, so the flows exist and the real pricing drops in later. | 2026-07-21 |
| D24 | **Everything commercial is configurable per tenant; everything about safety, honesty and compliance is locked by the platform.** The agent's instructions and business knowledge are configured through guided questions and a structured knowledge base — **never a raw prompt box**. Unanswered questions from real calls feed back as one-tap additions. See "Tenant configuration". | 2026-07-21 |
| D23 | **The design studio (Stage 5) and all 3D screens are LOW PRIORITY — design them last.** Everything else ships first: onboarding, CRM, survey, proposal builder, voice agent, close, project tracking. The studio already works in code; redesigning it is an improvement, not a blocker. | 2026-07-21 |
| D22 | **Components are MANDATORY on every proposal.** No lump-sum quotes. All 5 categories (Panel · Inverter · Cable · Electrical · Structure, + Battery when added) must be selected before Generate. Solved for speed with saved **component kits**, not by making it optional. | 2026-07-21 |

---

## The journey map

```
 STAGE 0   Company onboarding        owner signs up, configures, invites
 STAGE 1   User onboarding           employee joins, learns their job
 STAGE 2   Lead capture              lead arrives from any channel
 STAGE 3   Qualify & assign          owner/rep triages, assigns, schedules
 STAGE 4   Site survey               surveyor captures the roof, offline
 STAGE 5   Design                    the existing studio → variants → sign-off
 STAGE 6   Quote & proposal          BOM → approval → send on WhatsApp
 STAGE 7   Follow-up & close         tracking, VOICE AGENT, negotiate, won/lost
 STAGE 8   Handover                  won deal → execution (scope TBD, Q1)
 ─────────
 CROSS     Roles & permissions · notifications · search · settings · reporting
```

Each stage below is written as: **who · what they are trying to do · screens · happy
path · what goes wrong · what we deliberately leave out.**

---

## STAGE 0 — Company onboarding

**Who:** the EPC company owner, usually on a laptop, often with a salesperson on a call.
**Goal:** get from "I signed up" to "my team can quote a job" without a training session.

### The trap to avoid
Most B2B SaaS asks for everything up front — GST number, logo, price book, team — and
people abandon. **We ask for the minimum to produce one real quote, and collect the rest
when it is actually needed.**

### Screens
| Screen | Contains |
|---|---|
| **Sign up** | Phone number → OTP. Company name, your name, city. Nothing else. |
| **What do you sell?** | Residential / C&I / both. Typical system size. Sets sensible defaults so the first quote is close. |
| **Company profile** | Logo, GSTIN, address, bank details. **Skippable** — prompted later, when the first proposal is about to be sent. |
| **Invite team** | Add by phone number, pick a role. **Skippable.** |
| **You're ready** | Two doors: "Create your first lead" or "Try a demo project". |

### Happy path
Sign up → pick what you sell → skip the rest → land on an empty Leads screen that
teaches → create the first lead in under a minute.

### What goes wrong
- **Phone already registered** → offer login instead, do not create a duplicate company
- **OTP does not arrive** → resend after 30s, then offer "call me instead"
- **Wrong GSTIN format** → validate live, explain the format, allow skip
- **Owner abandons midway** → they are already an account; resume where they left off
- **Two people from the same company sign up** → detect by company name + city, offer
  "request to join" instead of creating a second workspace

### Deliberately not in v1
Payment/plan selection during signup (free trial first, billing when they invite a
3rd user), SSO, custom domains.

### Recommendation
**A demo project pre-loaded with a real Pune rooftop.** New users understand the product
by opening something finished, not by staring at an empty state. It is also the safest
place to learn the design studio without fear of breaking a real quote.

---

## STAGE 1 — User onboarding

**Who:** a sales rep, surveyor, designer or engineer invited by the owner. **Phone, almost
always.** Often standing in an office with the owner saying "just download it".

**Goal:** be useful within two minutes, without reading anything.

### Screens
| Screen | Contains |
|---|---|
| **Invite landing** | "Rajesh invited you to HelioGrid — Suryodaya Solar." Phone pre-filled. |
| **OTP** | 6 digits, auto-read from SMS where the platform allows. |
| **Your profile** | Name, photo (optional). That is all. |
| **Your role, explained** | One card: "You're a Sales Rep. You'll see your leads, your follow-ups, and you can send proposals." Sets expectations about what they cannot do. |
| **First-run coach marks** | Maximum **three**, on the screen they actually landed on. Dismissible. Never a carousel. |

### Happy path
Tap invite → OTP → name → see My Day with real work already assigned to them.

### What goes wrong
- **Invite expired** → "Ask Rajesh to invite you again", with a one-tap request
- **Wrong person got the invite** → decline, notifies the owner
- **Role has nothing assigned yet** → empty state that says what will appear here and
  who to ask, not a blank screen
- **Owner removes them later** → graceful "your access was removed", no crash

### Recommendation
**Role decides the home screen, not a setting.** Sales rep lands on My Day. Surveyor lands
on today's site visits. Designer lands on designs awaiting work. Engineer lands on the
sign-off queue. Owner lands on the pipeline dashboard. Same app, five different front
doors — this is the single highest-leverage UX decision in the product.

---

## STAGE 2 — Lead capture

**Who:** anyone. A lead can arrive while nobody is looking.
**Goal:** never lose an enquiry, and never create the same customer twice.

### The one thing that kills solar CRMs
**Duplicates.** A homeowner calls on Monday, fills the website form on Tuesday, and
WhatsApps on Wednesday. Three leads, three reps, three quotes, one very confused customer
— and two reps who wasted a week. **Phone number is the identity. Dedupe on capture, every
time, from every channel.**

### Channels
| Channel | How it arrives | Notes |
|---|---|---|
| **Manual** | Rep types it | Must take <30s on a phone |
| **Inbound call** | Voice agent answers when nobody picks | Captures name, city, bill amount, interest |
| **WhatsApp** | Customer messages the business number | Highest volume in India |
| **Website form** | Embedded form or link | |
| **Referral** | Existing customer refers | Tag the referrer — they get credited |
| **CSV import** | Bulk, from an old spreadsheet | Every EPC has one |

### Screens
| Screen | Contains |
|---|---|
| **Quick add** | Name, phone, city, type. Four fields. Everything else later. Live duplicate check on the phone number. |
| **Lead inbox** | Unassigned/new leads from all channels in one queue, newest first, with a source badge. The owner's morning triage. |
| **Duplicate found** | "Priya Sharma from Nashik already exists, owned by Rajesh, last contacted 4 days ago." Options: open existing · log as new enquiry on the existing lead · create anyway (needs a reason). |
| **Import** | Upload CSV → map columns → preview → shows how many are duplicates before importing. |
| **Capture settings** | Website form snippet, WhatsApp number, which sources are live. |

### Happy path
Lead lands in the inbox with its source → owner glances → assigns → rep is notified.

### What goes wrong
- **Duplicate** → detected on the phone number, before saving (see above)
- **Junk / wrong number** → mark as junk; it leaves the queue but is not deleted
- **Incomplete lead** (no name, only a number) → still accepted; the missing fields are
  visible as gaps to fill on first contact
- **Lead arrives at 11pm** → voice agent may capture but must not call back until 9am
- **CSV has 400 rows and 90 duplicates** → shown before import, not after
- **Same person, different number** (husband/wife) → dedupe cannot catch this; offer
  merge from the customer record later
- **Nobody triages for 3 days** → leads older than 24h unassigned escalate to the owner

### Deliberately not in v1
Lead scoring, marketing automation, campaign attribution, chatbot on the website.

### Recommendation
**The Lead Inbox is the owner's screen, not the rep's.** One queue, one decision per lead:
assign or bin. Everything else waits. If triage takes more than three seconds per lead,
it will not get done.

---

## STAGE 3 — Qualify & assign

**Who:** owner or sales manager assigns; the rep qualifies.
**Goal:** get the lead to the right person fast, and find out early whether it is real.

### Screens
| Screen | Contains |
|---|---|
| **Assign** | Pick a rep, or use a rule. Shows each rep's current open load so you do not bury someone. |
| **Lead detail** | Header: name, phone, city, value, stage, owner. Then activity timeline, site info, designs, quotes, tasks, files. Actions: Call · WhatsApp · Log activity · Book visit · Create design. |
| **Qualification** | Six things that decide whether this is real: monthly bill ₹, roof ownership (own/rent), roof type, shading obvious?, timeline, decision maker. Inline, not a separate form. |
| **Book site visit** | Date, time, surveyor, address confirm. Sends the customer a WhatsApp confirmation. |
| **Disqualify** | Requires a reason: renting · budget · not interested · unreachable · already installed · wrong number. **The reason list is the most valuable analytics in the product.** |

### Happy path
Assigned → rep calls within the hour → qualifies on the call → books the site visit →
customer gets a WhatsApp confirmation.

### What goes wrong
- **Customer does not answer** → log the attempt, auto-schedule a retry; after 3 failed
  attempts hand to the voice agent
- **Wrong number** → disqualify with that reason, no further calls
- **Not the decision maker** → capture who is, add as a second contact
- **Rents the property** → usually disqualified, but capture the landlord if offered
- **"Call me next month"** → snooze the lead with a wake-up date; it disappears from
  My Day until then and comes back automatically
- **Rep goes on leave** → owner bulk-reassigns; the timeline records why
- **Site visit no-show** → reschedule flow, and the customer gets one reminder, not five

### Recommendation
**Snooze is a first-class action, not a workaround.** In Indian residential solar, "call me
after Diwali" is the single most common outcome of a first call. If the product cannot
represent that cleanly, reps keep it in their head — and that is how pipeline leaks.

---

## STAGE 4 — Site survey

**Who:** whoever the survey task is assigned to (D15). **On a phone, on a roof, in the sun,
often with one bar of signal or none.**
**Goal:** capture everything the designer needs, so nobody has to go back.

### The constraint that shapes everything
**Offline is the normal case, not the edge case.** A terrace in a dense Pune neighbourhood
has no usable data. If capture depends on the network, the survey does not happen — the
surveyor takes photos in the phone's camera app instead and the structure is lost.
Everything saves locally first. Sync is a background fact, not a user action.

### What gets captured
| Group | Items |
|---|---|
| **Roof** | Photos from each corner, overall shot, roof type, approximate dimensions |
| **Electrical** | Meter photo (reading + sanctioned load visible), main panel/DB photo, existing load |
| **Shading** | Photos of anything tall nearby — water tanks, mumty, trees, adjacent buildings — with rough heights |
| **Access** | How material gets to the roof: stairs, lift, crane needed? Narrow lane? |
| **Structural notes** | Visible cracks, roof age, existing waterproofing — observations only, never a verdict |

### Screens
| Screen | Contains |
|---|---|
| **My visits today** | The surveyor's home screen. Address, customer, time, distance, one-tap navigation and one-tap call. |
| **Guided capture** | Step-by-step through the groups above. Progress bar. Each step skippable but flagged. Camera opens inline — never bounces to the OS camera app. |
| **Shading capture** | Add an obstruction, photograph it, estimate height. Tap-to-add on a simple roof sketch. |
| **Review & submit** | What is captured, what is missing, what is flagged. Submit hands off to the designer. |
| **Sync status** | "3 surveys waiting · 47 photos · will upload on Wi-Fi." Visible, never blocking. |

### Happy path
Open My Visits → navigate → capture through the guided steps → review → submit →
designer is notified.

### What goes wrong
- **No signal** → everything works; a persistent, calm indicator shows what is pending
- **Phone storage full** → warn before capture starts, offer to compress
- **Battery dies mid-survey** → draft is restored on reopen, nothing lost
- **Customer not home / gate locked** → "Could not complete" with a reason → auto-reschedule
  flow → customer gets one WhatsApp
- **Roof not accessible** (no stairs, locked terrace) → captured as an access constraint;
  designer sees it before designing
- **Wrong address** → correct it on the spot; it updates the site record
- **Surveyor forgets the meter photo** → review screen flags it before submit; if submitted
  anyway, the designer sees the gap explicitly
- **Two surveys of the same site** (revisit) → versioned, not overwritten

### Deliberately not in v1
Drone capture, LiDAR, automatic roof measurement from photos, AR height estimation.

### Recommendation
**Make the review screen the star.** The surveyor's mistake is not laziness, it is
forgetting one item that costs a second trip. A review screen that says "meter photo
missing — the designer cannot size the system without it" in plain language prevents more
rework than any amount of validation.

---

## STAGE 5 — Design

**Who:** designer, on desktop or tablet. **This stage already exists in code.**
**Goal:** turn a survey into a system that is buildable and honest.

> 🔻 **LOW PRIORITY — DESIGN THIS LAST (D23).**
> The studio and every 3D screen come after all other design work is finished. They
> already work in code, so a customer can be quoted today; redesigning them is an
> improvement, not a blocker. Do not spend early design cycles here.
>
> Build first: onboarding → CRM → survey → **proposal builder** → voice agent → close →
> project tracking. Come back to the studio when those are done.

> ⚠️ **When you do get here: these screens EXIST — redesign them, do not invent them.** The codebase has a
> working 10-step studio with real satellite imagery, roof tracing, shading simulation, 3D,
> auto-layout and a bill of materials. When connecting the codebase, Claude Design should
> read the existing screens and improve the UX, not design a new solar tool from scratch.
> The engineering underneath is validated and must not be redesigned away.

### Existing steps (from the codebase)
Site setup → roof drawing → obstructions → components → panel layout → 3D shadow view →
proposal captures → single-line diagram → bill of materials → done.

### Known UX problems to fix (from the audit)
- **The BOM screen presents ~286 controls at once.** Needs progressive disclosure, not a
  smaller font.
- **Desktop-only throughout** — canvas tracing, vertex drag, hover tooltips, keyboard
  shortcuts. All need a touch model (D2).
- **"Step 5" is a phantom** — counted in the wizard, has no screen.
- **Three unrelated header systems** across dashboard, wizard and proposal.
- **No loading states** — blank screen until data hydrates.

### New screens this stage needs
| Screen | Contains |
|---|---|
| **Design list for a lead** | Variants side by side: size, generation, price, payback. Mark one recommended. |
| **Engineer sign-off queue** | Designs awaiting review, oldest first. |
| **Sign-off / return** | Approve, or return with comments pinned to what is wrong. |

### What goes wrong
- **Survey incomplete** → design cannot start; show exactly what is missing and who to ask
- **Roof too shaded** → the system is honest about it; offer a smaller layout rather than
  quietly producing bad numbers
- **Exceeds sanctioned load** → warn with the actual limit; this is a real approval blocker
- **Panel out of stock / discontinued** → catalog flags it; existing quotes keep their
  original pricing
- **Customer changes their mind on size** → variant, not a rewrite
- **Engineer returns the design** → back to the designer with comments; the customer never
  sees an unapproved design
- **Design edited after the quote exists** → quote goes stale and **must visibly say so**

### Recommendation
**Do not let Claude Design redesign the studio from imagination.** Connect the codebase,
have it read the existing screens, and ask it for a specific improvement — "redesign the
BOM screen for mobile using progressive disclosure" — one screen at a time. The domain
logic in there took months and is test-covered.

---

## STAGE 6 — Quote & proposal

**Who:** designer builds it, rep sends it, manager approves discounts.
**Goal:** a price the customer trusts, delivered where they will actually read it.

### Screens
| Screen | Contains |
|---|---|
| **Quote builder** | Line items grouped by category. Each: item, spec, qty, unit, rate, GST, total. Margin and discount at the bottom. **The densest screen in the product — mobile gets a card list with an edit sheet, never a wide table.** |
| **Quote versions** | v1 vs v2 with what changed, and why. |
| **Discount request** | Rep asks for more than their limit → goes to a manager with a reason. |
| **Approval queue** | Manager's list of pending discount requests with the margin impact shown. |
| **Proposal preview** | Exactly what the customer will see, before sending. |
| **Send** | Channel (WhatsApp default), message preview, attachments. One clear send. |
| **Delivery tracking** | Sent → delivered → opened → viewed for how long. Feeds the follow-up. |

### Happy path
Design approved → quote generated automatically from the BOM → margin applied → preview →
send on WhatsApp → delivered → a follow-up task is created automatically for +2 days.

### What goes wrong
- **Design changed after quoting** → quote is stale; **money must never render as final
  while stale** — this is a hard product rule
- **Discount exceeds the rep's limit** → blocked, routed to approval, rep can still send
  the undiscounted version meanwhile
- **Discount pushes the job below cost** → warned explicitly, with the loss stated in ₹
- **Customer's WhatsApp number is wrong** → delivery fails visibly; offer SMS or email
- **Customer never opens it** → tracked; this is exactly what the voice agent picks up
- **Customer asks for changes** → new version, old one preserved; the customer link always
  shows the latest
- **Proposal sent, then the price book changes** → the sent quote keeps its original prices
- **Two reps quote the same customer** → the duplicate check at Stage 2 should have caught
  it; if not, the customer record shows both and one must be withdrawn

### Recommendation
**Automatic follow-up task on send, always.** The single biggest leak in solar sales is a
proposal sent on Friday and remembered the following Thursday. The moment a proposal goes
out, the next action must already exist and be owned.

---

## STAGE 6B — The Proposal Builder (the two paths)

**This is the most-used screen in the product.** Every deal passes through it, and many
deals never touch the design studio at all.

### The two paths

```
PATH A — WITH DESIGN                    PATH B — WITHOUT DESIGN
Survey → studio → BOM → proposal        Lead → proposal, straight away

Used when: the job is won on                Used when: the customer wants a
engineering credibility, C&I, a             number today, a small residential
complex roof, a customer comparing          job, a repeat/standard system, or
vendors on technical detail.                the rep is standing in their living
                                            room.
Numbers are DERIVED from the model.      Numbers are ESTIMATED or ASSUMED.
```

**Both paths use the same 11-step builder.** The difference is only how much arrives
pre-filled. This is the key architectural decision — not two proposal systems, one builder
with two entry points.

### What a design pre-fills

| Step | With design | Without design |
|---|---|---|
| 3 · Solar System Setup | capacity, type, category **derived** | typed |
| 4 · Performance Metrics | generation from real shading simulation — **derived** | ✦ AI auto-fill — **estimated** |
| 5 · Financial Data | savings/payback from the real quote — **derived** | ✦ AI auto-fill — **estimated** |
| 8 · Components | the actual BOM — **derived** | picked from catalog — **assumed** |
| Cost | the real bill of materials | typed lump sum |

### ⚠️ The honesty rule this creates
The product already labels every number **measured / derived / estimated / assumed**. Path B
numbers are *not* derived — they are estimates from capacity and location heuristics.

**A proposal built without a design must say so.** Not in fine print — visibly, on the
document. Something like:

> *Indicative proposal. Generation and savings are estimated from system size and location.
> A site survey and shadow analysis will confirm the final figures.*

This is a genuine competitive advantage, not a disclaimer. Every competitor prints
estimates as though they were calculations. Being the one product that distinguishes them
is exactly the "shows its working" positioning — and it protects the EPC when the customer
compares the final numbers to the promise.

### Entry points to the builder
- Lead detail → **Create proposal** → "With design or without?"
- Design complete → **Generate proposal** (goes straight to Path A, most steps filled)
- Duplicate an earlier proposal → all steps pre-filled from it (the fastest path of all,
  and how repeat residential jobs should actually work)

---

### The 11-step builder — full specification

**Shell & navigation**
- **Chip rail (top)** — 11 jump chips, one per step. Tap any to jump, in any order.
  Completed steps turn sage green.
- **Footer bar** — `‹ Back` · `{step} / 11 · {step title}` · `Next ›`. The last step's
  button becomes **Generate PDF ⤓**.
- **Gating** — Next is disabled until that step's required (\*) fields are valid. A pill
  reads *"Complete the required (\*) fields to continue."*

#### 1 · Company
- Phone number \* — locked, 🔗 linked to account
- Company name \*
- Email address \* — locked, 🔗 linked to account
- Website
- Company address
- Company logo — "HG" swatch + **Change logo** (max 5 MB · 12×6 cm · PNG/JPG)

→ **Proposal Type modal** (bottom sheet, fires after Company → Next): drag handle,
"Choose proposal type", two radio cards — **CAPEX** (purchase outright) / **OPEX / PPA**
(PRO badge, per-unit billing). Actions: Back · Continue ›

#### 2 · Achievements *(optional, skippable)*
- About your company (textarea — "shown on proposal cover")
- Total capacity installed (kW) → "200 kW"
- Happy customers → "350+"
- Cities served → "10+"
- Numbers only; units auto-added

#### 3 · Solar System Setup
- **Location:** State \* · District \*
- **System configuration:** System capacity kW \* (0.5–7000) · System type \* segmented
  **ONGRID / OFFGRID / HYBRID**
- **Battery storage card** — *Add battery backup*. OFFGRID/HYBRID force a
  ⚠ "Battery required" notice. Added state shows a summary with Edit / Remove.
- **Category** \* — Residential / Commercial
- **AMC** \* — Free AMC · NO AMC · 1–8 years
- **Commissioning included** (toggle)
- **Pricing & subsidies:** System cost excl. battery incl. GST \* · excl. GST · GST % \* ·
  GST amount (auto) · Subsidy ₹ \* (PM Surya Ghar) · Discount \* (% ⇄ ₹ mode switch) ·
  Easy financing EMI (toggle → EMI interest rate 0–100%) · Electricity tariff ₹/kWh \* (1–50)
- **Client-payable summary card** — live: `cost + battery − subsidy − discount = payable`.
  Warns if the discount drives payable ≤ ₹0.

→ **Battery modal** (bottom sheet): Battery capacity kWh (1–100) · Cost excl./incl. GST ·
GST on battery % · Cell chemistry — Lithium LFP / Lithium NMC / Lead-acid / Custom
(Custom reveals a free-text field). Cancel · Save.

#### 4 · Performance Metrics
✦ **AI Auto-fill**. Chart with **Generation / Savings / ROI** tabs.
Efficiency / PR % \* (50–100) · Monsoon dip % \* (0–50) · Units per kW/day \*
↺ Reset to AI values

#### 5 · Financial Data
✦ **AI Auto-fill**. Same tabbed chart.
Yearly savings ₹ \* · Payback years \* · Lifetime lakhs \* (25 yr) ·
Electricity inflation % \* (~6%)
↺ Reset to AI values

#### 6 · Project Timeline
Reorderable phase rows (⌃ / ⌄ arrows, 🗑 delete). Each: Title \* (char count) +
Description \* (char count).
↺ Reset to System Default · ＋ Add Step

#### 7 · Payment Terms
↺ Reset + templates **10/60/20/10 · 30/60/10 · …**
Tranche rows (label + % + ✕) · ＋ Add tranche
Progress bar + validation: **"Total allocation must = 100%"**

#### 8 · Components
**Required — all categories must be selected before Generate (D22).**

Sections: **Panel · Inverter · Cable · Electrical · Structure** (＋ **Battery** when added).
Each shows Selected / Empty status, ＋ add, brand rows (✎ edit / ✕ remove), and count
fields for Panel and Inverter.
Footer: **"Components Selected X/5 ✓"** — this is the gate, not a status.

**Apply a kit** sits at the top of this step: one tap fills all five categories from a
saved combination (see recommendation 1b). Path A fills them from the BOM automatically.

→ **Component Edit sheet** (bottom sheet, per type): Brand Name (locked), plus:
| Type | Fields |
|---|---|
| Panel | Watt Peak Range · Panel Type (Mono PERC / TOPCon / Bifacial / Mono / Poly / HJT / Thin-film) · Product & Performance Warranty |
| Inverter | Capacity kW · Inverter Type (On / Off / Hybrid) · Warranty |
| Cable | Cable Type · Specification · Warranty |
| Electrical | Includes · Standard |
| Structure | Warranty · Weight per kW · Standard |
| Battery | Capacity kWh · Chemistry · Warranty |

Plus **Description** (max 110 chars). Cancel · Done.

#### 9 · Terms & Conditions *(optional, up to 3 pages)*
Add / Skip choice. When added: Add-logo toggle · rich-text toolbar + textarea ·
"Save as template" · char count · ≈ PDF page estimate.

#### 10 · Client Details
Proposal number \* (auto, disabled) · Prepared by \* · Prepared for \* · Client address \* ·
Client phone \* (10-digit validation) · Date \* · Time generated \* · Customer support number

#### 11 · Bank Details *(optional)*
Include-in-proposal toggle · Bank name · Account name · Account number · IFSC.
Note when hidden: details save but will not print.

→ **Add 3D Design prompt** and **"Almost done!" bank prompt** (bottom sheets) — Yes / No,
then **Add Bank Details** · ⤓ **Generate Proposal**

---

### Product recommendations on this flow

**1. Eleven steps is a lot for Path B.** A rep in a customer's living room needs a number
in minutes. Recommendation: a **Quick mode** asking only steps **1, 3, 8, 10** (company,
system, **components**, client), AI-filling 4 and 5, and using defaults for 6, 7, 9, 11 —
with a "review the rest" link. Full mode stays for C&I. *Same builder, one toggle.*

**1b. Component kits — the answer to mandatory components (D22).** Components are required
on every proposal, which is right for credibility but slow if a rep must pick five items
from a catalog every time. An EPC actually sells the same three or four combinations over
and over.

So: **saved kits.** "5 kW Residential — Standard" fills all five categories in one tap.
- Owner creates kits in settings; reps select, then adjust if needed
- The first kit is created automatically from the first proposal they complete
- On a design-backed proposal (Path A) the BOM fills components directly and no kit is needed
- Kits are the reason mandatory components cost seconds instead of minutes

Without this, D22 makes Quick mode pointless — the rep would abandon the app and send a
WhatsApp message with a number in it, which is exactly what we are replacing.

**2. The chip rail and the gating fight each other.** Free jumping plus per-step required
fields means a user can land on step 8 with step 3 incomplete. Recommendation: allow the
jump, but show incomplete steps in the rail with a subtle dot, and block only the final
**Generate PDF** — not each Next. Let people work out of order; validate at the end.

**3. Duplicate-from-previous should be the primary path for residential.** Most residential
jobs are near-identical. "Same as the Sharma proposal, new customer, 6 kW" should take
under a minute. This deserves to be a first-class entry point, not buried.

**4. On mobile, the chip rail must not eat the screen.** Eleven chips at 375px is a
horizontal scroller nobody reads. Recommendation: mobile shows `‹ 3 / 11 · Solar System ›`
with a tap to open the full step list as a sheet. Desktop keeps the full rail.

**5. Save continuously, never on Next.** Someone will lose a network mid-build. Every field
commits on blur; a draft always exists and is resumable from the lead.

### What goes wrong
- **Rep abandons at step 7** → draft saved, resumable, visible on the lead as "Proposal
  draft — 7/11"
- **Discount makes payable ≤ ₹0** → warned at step 3 (already in the spec) and blocked at
  Generate
- **Payment tranches ≠ 100%** → blocked with the remainder shown ("12% unallocated")
- **No components selected** → **hard block at Generate** (D22). The footer counter
  "Components Selected 3/5" is the gate; tapping Generate with gaps jumps to step 8 and
  highlights exactly which categories are missing. Offer "Apply a kit" right there rather
  than making them start picking.
- **Logo too large / wrong format** → validated on upload with the actual limits stated
- **OFFGRID chosen, no battery** → hard block; the system cannot work
- **Design changed after the proposal was generated** → the proposal is stale and must say
  so; regenerate offered
- **Proposal number collides** (two users at once) → server-assigned, never client-generated
- **Path B proposal later gets a design** → offer to upgrade the numbers from estimated to
  derived, showing what changed before committing

---

## STAGE 7 — Follow-up, the voice agent, and close

**Who:** the rep, and the voice agent working alongside them.
**Goal:** nothing goes quiet by accident.

### The core screen: My Day
The rep's home. Not a dashboard of numbers — a **list of what to do today**.

```
OVERDUE (2)          red, first, always
  Priya Sharma · follow-up 3 days late · 8.2 kWp · ₹4.5L
  Anand Traders · proposal unopened 5 days · 180 kWp · ₹92L

TODAY (5)
  10:00  Site visit · Kothrud
  14:00  Call back Mehta · asked about subsidy
  …

AGENT ACTIVITY (3)          what the agent did while you slept
  🤖 Rakesh Patil · interested · wants callback Thu 4pm
  🤖 Sunita D. · no answer · will retry tomorrow
  🤖 Vinod K. · asked about warranty · answered · still deciding

UPCOMING THIS WEEK (8)
```

### Voice agent screens
| Screen | Contains |
|---|---|
| **Agent settings** | On/off. Which triggers are live (D17). Calling window (default 9am–9pm). Language per customer or auto-detect. Max attempts before it gives up. |
| **Agent queue** | Who is scheduled to be called, when, and why. The owner can remove anyone from it. |
| **Call result** | On the lead timeline: outcome, one-line summary, interest signal, any action taken. Transcript and recording on tap. |
| **Consent & eligibility** | Per customer: consent captured? DND-listed? Do-not-call flag set by a rep? **The agent cannot dial without this being clear.** |
| **Escalations** | Calls the agent handed to a human, and why — with the reason visible ("customer asked for a discount"). |

### What the agent may and may not do
| May | May not |
|---|---|
| Ask whether the proposal was received and reviewed | Discuss, offer or agree any discount |
| Answer FAQs: timeline, subsidy, warranty, process, financing options | Negotiate price |
| Book a callback or a site visit | Accept or confirm a deal |
| Record interest level and objections | Make technical or structural commitments |
| Hand off to a human at any point | Continue after the customer asks to stop |

**Every call opens by identifying itself as an automated assistant, and "talk to a person"
works at any moment.**

### Close
| Screen | Contains |
|---|---|
| **Mark won** | Final value, expected install date, and it creates the project (Stage 8). |
| **Mark lost** | Requires a reason: price · chose competitor · postponed · not reachable · roof unsuitable · financing failed. **This list is the most valuable data in the product.** |
| **Reopen** | A lost lead can come back. Postponed ones auto-resurface on their wake-up date. |

### What goes wrong
- **Customer is on DND** → the agent will not dial; the rep is told to call manually
- **Customer says "stop calling"** → do-not-call set instantly, agent never dials again,
  and this is irreversible without the customer's say-so
- **Agent misunderstands** → the rep sees the transcript and can correct the outcome;
  corrections train nothing automatically without review
- **Agent reaches a wrong/reassigned number** → flagged, number marked unverified
- **Customer asks about price** → immediate escalation; the rep gets a notification, not a
  task buried in a list
- **Agent calls during a festival or at a bad time** → calling window plus a holiday
  calendar; a customer complaint sets a permanent quiet flag
- **Rep disagrees with the agent's read** → rep's assessment always wins
- **Customer goes silent for 30 days** → auto-move to a dormant state, not deleted

### Recommendation
**Show agent activity as a separate block in My Day, never mixed with the rep's own tasks.**
The rep must be able to see at a glance what a machine did on their behalf. Blurring that
line is how people stop trusting the automation.

---

## STAGE 8 — Handover & light project tracking

**Who:** owner and operations. **Goal:** the customer knows what is happening without calling.

Scope is deliberately small (D9): a status board and a document checklist. **No inventory,
no purchase orders, no crew scheduling.**

### Screens
| Screen | Contains |
|---|---|
| **Projects board** | Won deals by stage: Ordered → Installed → Commissioned → Handed over. Card shows customer, size, value, days in stage. |
| **Project detail** | The deal's history, the approved design, the final quote, documents, and the stage timeline. |
| **Document checklist** | Per project: signed proposal, advance receipt, net-metering application, DISCOM approval, commissioning certificate, warranty documents. Each: pending / uploaded / verified. |
| **Customer progress link** | The same tokenised link the proposal used, now showing progress. No login. |
| **Handover** | Final documents pack, sent on WhatsApp. |

### What goes wrong
- **Stuck in a stage for weeks** → aged cards surface to the owner
- **DISCOM approval delayed** → a blocked flag with a reason; the customer sees "waiting for
  DISCOM approval", which prevents the "what is happening?" phone call
- **Customer wants a change after Won** → change request creates a new quote version; the
  original stays intact
- **Documents missing at handover** → checklist blocks marking Handed over
- **Project cancelled after Won** → allowed, with a reason; reporting must not silently
  count it as revenue

### Recommendation
**The customer-visible progress link is the highest-value screen in this stage.** Most
support calls in Indian solar are "what is the status?". One honest link answers them.

---

## THE CUSTOMER'S JOURNEY — the other side of the glass

Everything above is written from the EPC's side. This is the same story from the
customer's — a homeowner or a factory owner about to spend ₹5–50 lakh with a company
they do not yet trust.

### The framing that matters
**The customer almost never touches the app.** They have no login (D5). Their entire
experience is:

```
WhatsApp messages  ·  phone calls  ·  ONE link
```

So the product's job on this side is not screens. It is **making sure the right message
arrives at the right moment, and that the one link always answers "what is happening?"**

Trust is the actual product here. A ₹8 lakh decision made from a WhatsApp message.

---

### C1 · They make an enquiry
**Trigger:** they call, or a rep adds them. **What they experience:** a phone call.

They are shopping. They have probably contacted two or three companies the same week.
**Speed of first response is the single biggest predictor of who wins the job.**

- Called back within an hour → strong signal
- Called back in three days → the job is already lost
- Called by three different people from the same company → looks disorganised
  *(this is what the duplicate check at Stage 2 prevents)*

**Goes wrong:** nobody calls back · they get called at 10pm · they are asked the same
questions twice by two different reps.

### C2 · First conversation
**They experience:** a rep asking about their electricity bill, roof and timeline.

What they are silently judging: does this person know more than I do? A rep fumbling
basic subsidy questions loses the deal here, before any price is discussed.

*(This is why the agent's business-knowledge base matters — the same answers must be
right whoever, or whatever, is speaking.)*

**They receive:** a WhatsApp confirming the site visit — date, time, name of who is
coming, and the person's phone number.

### C3 · The site visit
**They experience:** somebody on their roof for 30–45 minutes with a phone.

What builds trust: the surveyor explaining what they are photographing and why. What
destroys it: silent photographing, then leaving without saying what happens next.

**They receive:** a WhatsApp — *"Survey done. Your proposal will reach you by Thursday."*
**A promise with a date.**

**Goes wrong:** surveyor arrives late, or not at all · nobody tells them what happens next
· the surveyor gives a verbal price that the real quote later contradicts.

### C4 · The wait
**They experience:** silence, for 1–3 days.

This is where enthusiasm decays and competitors land their proposals first. **Nothing in
the product should let this gap be silent** — an automatic "we are working on your design"
message on day two costs nothing and holds the position.

### C5 · The proposal arrives
**They experience:** a WhatsApp with a message, a PDF, and a link.

This is the moment of maximum attention. They will open it once, properly, probably in the
evening, probably on a phone, possibly with their spouse.

**What the link shows:**
- System size, annual generation, monthly savings
- Total price, subsidy, what they actually pay
- Payback period
- **A 3D view of their own roof** — this is the moment that separates you from a PDF
  emailed by a competitor
- Financing options
- **Accept** · **Ask a question**

**The honesty rule shows up here.** If the proposal came from Path B — no design — it says
so on the document: *"Indicative proposal. A site survey and shadow analysis will confirm
the final figures."* Competitors print estimates as certainties. When a customer compares
three proposals and only yours admits which numbers are estimated, that reads as
confidence, not weakness.

**Goes wrong:** the PDF is too large to open on a slow connection · the link expires · the
numbers on the PDF and the link disagree · it is in English and they read Marathi (D25).

### C6 · They think about it
**They experience:** comparing quotes, asking a relative who "knows about solar",
searching the panel brand online, worrying about the roof leaking.

**Nothing happens in the app. Everything happens in their head.** Typical decision window:
3 days to 3 weeks.

Their real questions are rarely about price:
- Will this actually reduce my bill?
- What if it does not work?
- Who fixes it if something breaks in year four?
- Will it damage my roof?
- Is the subsidy real, and who does that paperwork?

**This is exactly what the voice agent must be able to answer** (D24 knowledge base). Not
a sales pitch — the boring, specific reassurance a person needs before spending ₹8 lakh.

### C7 · The follow-up
**They experience:** a call. Sometimes from the rep, sometimes from the agent.

The agent opens by saying it is automated (locked rule). Handled well, this is fine —
people are increasingly used to it, and an agent that answers a warranty question at 8pm
is more useful than a rep who calls back on Tuesday.

Handled badly it is insulting: calling three times in a week, calling at dinner, not
understanding Marathi, not letting them reach a human. **Every one of those is prevented by
a locked platform rule, not by tenant configuration** — which is exactly why those rules
are locked.

**Goes wrong:** they ask about a discount and the agent tries to answer *(cannot — it
escalates, D10)* · they say stop and get called again *(cannot — irreversible flag)*.

### C8 · The decision
**They experience:** tapping **Accept** on the link, or going quiet, or saying no.

- **Accept** → they expect immediate acknowledgement. A WhatsApp within seconds, not a
  silence that makes them wonder if the tap registered.
- **Negotiate** → they ask for a discount. It goes to the owner (D19). **They should not
  wait two days for an answer** — this is where the owner-approves-everything bottleneck
  costs real deals.
- **No** → the reason is recorded (Stage 7). They should not then be called for six months.

### C9 · Paying the advance
**They experience:** a payment link, then a receipt.

Highest-anxiety moment in the entire journey — first real money to a company they met three
weeks ago. What reduces the anxiety: an instant receipt, a named person to contact, and a
clear statement of what happens next and when.

### C10 · The long wait — the most under-served part of solar
**They experience:** weeks. Material ordering, scheduling, and **net metering approval,
which alone can take 3–6 weeks with the DISCOM.**

**This is where every Indian solar customer becomes unhappy**, and almost always because
of silence rather than delay. They call the rep. The rep does not know. They call again.

**The single highest-value screen in Stage 8 is the customer progress link** — the same URL
the proposal used, now showing:

```
✅ Advance received          12 Aug
✅ Material ordered          14 Aug
🔵 Installation scheduled    22 Aug
⬜ Commissioning
⬜ Net metering — waiting for DISCOM approval
    Applied 15 Aug · typically 3–6 weeks
```

**That last line prevents more support calls than anything else in the product.** A delay
you explained is tolerable; a delay you hid is a complaint.

### C11 · Installation
**They experience:** a crew on their roof for 1–2 days.

They want to know: who is coming, when, how long, and will there be noise and mess.
A WhatsApp the evening before with the crew lead's name and number covers it.

*(The existing Installation Plan already derives the real work sequence from the structural
model — foundation → legs → rafters → purlins → modules → stringing → BOS. It plugs in
here rather than being rebuilt.)*

### C12 · Commissioning & handover
**They experience:** the system switching on, and a pile of documents.

**They receive:** the handover pack on WhatsApp — warranty documents, commissioning
certificate, net-metering approval, and how to read their generation.

This is the moment they will decide whether to refer you. **Ask for the referral here**,
while the roof is new and the first bill is about to drop — not six months later.

### C13 · Living with it *(beyond v1)*
They will want: generation monitoring, cleaning reminders, service contact, and eventually
warranty claims. Out of scope for v1 (D9), but the handover should leave them knowing
exactly who to call.

---

### The customer's actual surface area

| Touchpoint | Count in a whole project |
|---|---|
| WhatsApp messages | ~12–18 |
| Phone calls | 3–6 (mix of human and agent) |
| Web link | **1** — reused for proposal, then progress, then handover |
| Logins | **0** |
| App installs | **0** |

**One link, its whole life.** The tokenised URL sent with the proposal becomes the progress
tracker after Won, and the document pack after handover. The customer bookmarks it once.
Designing it as three separate things would be the mistake.

### The three moments that decide everything
1. **Speed of first callback** — decides whether you are in the running at all
2. **The proposal link, opened once, on a phone, in the evening** — decides the sale
3. **Visible progress during the net-metering wait** — decides whether they refer you

---

## TENANT CONFIGURATION — everything an EPC can make their own

Every company on the platform is different: different brands, different warranties,
different pitch, different service area. **Configuration is a first-class product surface,
not a settings dumping ground.**

### The governing principle

```
LOCKED BY THE PLATFORM          CONFIGURED BY THE TENANT
─────────────────────           ────────────────────────
safety, honesty, compliance     everything commercial
cannot be overridden by         and everything about
any tenant, ever                how they sell
```

**What a tenant may never change** — because these protect their customer, and them:
- The agent identifies itself as an automated assistant
- "Talk to a person" always works
- The agent never discusses, offers or agrees a discount (D10)
- The agent never makes structural or engineering guarantees
- Calling stays inside legal hours and respects DND / do-not-call
- Numbers keep their provenance labels; estimates are never printed as calculations
- The customer is never told something the system cannot support

Everything else is theirs.

---

### A · Voice agent configuration

**The design problem:** a solar business owner cannot and should not write a prompt.
So we never show them one. They answer questions about their business; we assemble the
instructions.

| Screen | Contains |
|---|---|
| **Agent setup — guided** | 6 short steps, plain language. Agent name · voice · languages · tone (Professional / Friendly / Direct) · what to say when asked something it doesn't know · when to hand to a human. Defaults are pre-filled and work on day one. |
| **Opening line** | Editable, with the mandatory AI disclosure fixed and visible as locked text. "Namaste, this is *Asha* calling from *Suryodaya Solar*. I'm an automated assistant — is now a good time?" The bold parts are theirs; the disclosure is not. |
| **Escalation rules** | Toggle list: price/discount questions (locked ON) · angry customer · asks for the owner · technical question the agent can't answer · customer asks to stop. Each with "what the agent says as it hands over". |
| **Calling window** | Days, hours, holiday calendar. Bounded by the legal window — a tenant can narrow it, never widen it past 9am–9pm. |
| **Test the agent** | **The most important screen here.** Call yourself, or run a typed conversation. Hear exactly what a customer hears, before anyone else does. |
| **Version history** | Every change is versioned. Each call records which version answered it — so a dispute about what the agent said is answerable. |

### B · Business knowledge — what the agent knows

Not a document upload. A **structured, reviewable knowledge base** in the owner's own words.

| Section | Examples |
|---|---|
| **About us** | Years in business, installations completed, certifications, service area |
| **Products** | Panel brands offered, inverter brands, why we chose them |
| **Warranty** | Panel 25yr performance / 12yr product, inverter 5yr, workmanship 2yr |
| **Process & timeline** | Survey in 2 days · design in 3 · install 1–2 days · net-metering 3–6 weeks |
| **Pricing policy** | What's included, what's extra. **No discount authority** — locked. |
| **Subsidy** | How PM Surya Ghar works, who qualifies, who applies, typical timeline |
| **Financing** | Which banks/NBFCs, typical EMI, documents needed |
| **Common objections** | "Too expensive" · "I'll wait for prices to drop" · "Does it work in monsoon?" · "What about cleaning?" — with the answer the owner wants given |

**How it stays current — the feature that makes this work:**

> When a customer asks something the agent could not answer, it is captured as an
> **unanswered question**. The owner sees a short list: *"3 customers asked about hail
> damage this week."* One tap to answer it, and the agent knows it from the next call.

The knowledge base grows from real calls instead of a blank page. This is the difference
between a config screen people fill in once and abandon, and one that gets better weekly.

**Seeded, not empty.** Every new tenant starts with a solar-industry default pack —
generic but correct answers for subsidy, warranty, monsoon, cleaning, net metering. The
owner reviews and personalises. Day one it works; week four it sounds like them.

### C · Everything else configurable per tenant

| Area | What |
|---|---|
| **Branding** | Logo, letterhead, colours on customer documents, company details |
| **Component kits** | Saved combinations that fill step 8 in one tap (D22) |
| **Price book** | Rates per component, versioned so old quotes keep their prices |
| **Catalog** | Which panels/inverters/BOS this company actually sells |
| **Proposal templates** | Cover, sections included, default T&C, bank details |
| **Payment terms** | Named tranche templates — 10/60/20/10, 30/60/10 |
| **Project timeline** | Default phases and descriptions (Stage 6B, step 6) |
| **Discount limits** | Currently owner-approves-all (D19); the limit lives here when that changes |
| **Lead sources** | Which channels are live |
| **Roles** | Who sees what, who approves what |
| **Message templates** | WhatsApp proposal message, follow-up nudge, reminder |

### D · Making configuration not feel like work

1. **Nothing is required on day one.** Every setting has a working default. A tenant can
   sign up and send a real proposal without opening settings once.
2. **Configure in context, not in a settings maze.** The moment a rep needs a component
   kit, offer to create one *there*. The first proposal they complete offers to become the
   template. Settings screens exist for revisiting, not for setup.
3. **Show the effect.** Every config screen shows a live preview — the proposal with your
   logo, the agent's opening line spoken aloud, the payment tranches as the customer sees
   them.
4. **One "Business profile" screen that feeds many places.** Company name, logo, address
   and GSTIN are asked once and used by the proposal, the agent's script, the customer link
   and the invoice.

### What goes wrong
- **Owner writes an instruction that breaks a locked rule** ("offer 10% if they hesitate")
  → rejected at save with a plain explanation, not silently ignored
- **Knowledge base contradicts itself** (two different warranty answers) → flagged on save
- **Agent config changed mid-campaign** → versioned; calls already scheduled use the
  version they were queued with, and the owner is told
- **Tenant deletes a component kit still referenced by a draft proposal** → draft keeps
  its components; the kit is archived, not destroyed
- **Price book updated after quotes were sent** → sent quotes keep original prices, always
- **A tenant with no config at all** → everything falls back to platform defaults and
  nothing breaks
- **Agent's tone set to "Direct" but the knowledge is verbose** → preview shows the
  mismatch before it goes live

### Recommendation
**Build the "unanswered questions" loop early, even before the agent is live.** It is the
mechanism that keeps the whole system honest and improving, and it costs almost nothing:
capture what the agent couldn't handle, show the owner, make answering it one tap. Without
it, every tenant's agent decays into a script nobody maintains.

---

## AGENT PERFORMANCE — proving the voice agent is worth keeping

**The retention problem.** An owner paying for automated calls who cannot see what they
bought will cancel within a month. This dashboard is not analytics garnish; it is the
reason the agent survives its first invoice.

### The screen: Agent performance

```
THIS MONTH                          vs last month
  412  calls attempted                   ↑ 18%
  246  connected                    60%  ↑  4%
   38  callbacks booked
   17  site visits booked
   29  handed to a human
   11  questions it could not answer   → review

OUTCOMES
  ▇▇▇▇▇▇▇▇  Interested            94
  ▇▇▇▇▇     Not interested        61
  ▇▇▇▇      Callback requested    38
  ▇▇▇       No answer            166
  ▇▇        Asked to stop          9

WHAT IT SAVED YOU
  246 conversations your team did not have to start
  ≈ 20 hours of calling time

DEALS IT TOUCHED                              (see note)
  31 proposals were quiet, the agent called,
     and the customer responded within 3 days
  ₹ 1.4 Cr of pipeline in those deals
```

### The honesty rule this must follow
**"Deals it touched" is correlation, not attribution — and the screen must say so.**

> *The agent called and the customer responded within 3 days. We cannot prove the call
> caused it.*

Every competitor's AI dashboard claims credit for revenue. Claiming an agent "generated
₹1.4 Cr" when it made one follow-up call is exactly the dishonesty this product exists to
avoid — and an owner who catches you inflating it stops trusting every other number you
show them. Being the one product that states the limit is consistent with everything else
here (N7, D21).

### Supporting screens
| Screen | Contains |
|---|---|
| **Call log** | Every call: customer, duration, outcome, language, which config version, transcript, recording. Filterable. |
| **Unanswered questions** | The list from D24 — what customers asked that the agent could not handle. One tap to answer. **This is where the dashboard turns into improvement.** |
| **Cost** | Calls made, minutes used, against whatever the plan allows. Placeholder until pricing exists (D26). |
| **Per-rep view** | Which reps lean on the agent, whose leads it rescued. Manager-only. |

### What goes wrong
- **Connect rate collapses** (wrong numbers, bad timing) → surfaced as a warning with the
  likely cause, not left for the owner to notice
- **Agent escalating almost everything** → its knowledge is too thin; link straight to the
  unanswered-questions list
- **Owner sees a big "deals touched" number and over-trusts it** → the caveat is on the
  screen, not in a tooltip
- **Nobody opens this screen** → a monthly summary goes to the owner on WhatsApp, where
  they actually read things

---

## BILLING & SUBSCRIPTION — mock, shape only (D26)

**Pricing is undecided.** Design the flows with placeholder numbers so the screens exist
and the real model drops in later without a redesign.

| Screen | Contains |
|---|---|
| **Plans** | Three placeholder tiers. Whatever the axis turns out to be — users, proposals, agent minutes, system size — the card shape holds. Use obviously-fake numbers so nobody mistakes them for real. |
| **Current plan & usage** | What they are on, what they have used this cycle, when it renews. Usage bars for whichever limits end up mattering. |
| **Upgrade / change plan** | Compare, pick, confirm. Show the price difference clearly, prorated. |
| **Payment method** | Card / UPI / netbanking — India needs UPI as a first-class option, not an afterthought. |
| **Invoices** | List, download GST invoice. Indian businesses need this for input tax credit. |
| **Trial status** | A quiet banner: "12 days left in your trial." It grows more prominent in the last 3 days, and never blocks work. |

### The states that actually matter
| State | What the user sees |
|---|---|
| **Trial active** | Everything works. Quiet countdown. |
| **Trial ending (≤3 days)** | Persistent but dismissible banner, one-tap upgrade. |
| **Trial expired** | **Read-only.** They can see and export everything; they cannot create. |
| **Payment failed** | 7-day grace with full access, clear banner, one-tap retry. Not instant lockout — cards fail for boring reasons. |
| **Suspended** | **Read-only, never locked out.** Data stays visible and exportable. |
| **Cancelled** | Export window, then archive. Tell them exactly when data is deleted. |

### The rule I would not bend
**Never hold a customer's data hostage.** A suspended tenant keeps read access and full
export of their own leads and quotes. It is the right thing to do, it is likely required
under DPDP anyway, and practically — an owner locked out of their pipeline turns into a
public complaint, while one who can still see it usually just pays.

### What goes wrong
- **Card fails silently** → grace period, banner, WhatsApp reminder, then read-only
- **Owner upgrades mid-cycle** → prorate, show the maths
- **Team exceeds the seat limit** → block *new* invites, never disable working users
- **Limit hit mid-proposal** → let them finish and send it; enforce on the next one
- **The current app's dead "Upgrade" button** → this is what replaces it (audit finding)

---

## MULTILINGUAL — English · Hindi · Marathi (D25)

### This is a design-system change, not a translation task

**The font.** Our design system specifies **Inter**, which has no Devanagari coverage.
Hindi and Marathi both need it. Pair Inter with **Noto Sans Devanagari**, matched for
optical size and weight, or Devanagari text will render in a system fallback that looks
broken beside the Latin.

**Text expansion.** Hindi and Marathi run roughly 15–30% longer than English, and
Devanagari needs more line height for its headline stroke and matras. **Any layout tuned
to English string lengths will break.** Buttons, chips, table headers and the 11 proposal
step titles are the usual casualties.

**Line height.** Devanagari needs more than the Latin scale allows. The type scale keeps
its sizes; line heights get a per-script adjustment.

### What is translated, and what is not
| Translated | Not translated |
|---|---|
| All UI labels, buttons, navigation | Customer names, addresses |
| Empty states, errors, help text | Brand and model names (panels, inverters) |
| Notifications and WhatsApp templates | Technical units — kW, kWh, kWp |
| Voice agent speech | ₹ formatting stays Indian in every language |

### Screens
| Screen | Contains |
|---|---|
| **Language picker** | In onboarding and in profile. Shows each language *in its own script* — English · हिंदी · मराठी — never translated names. |
| **Per-user, not per-tenant** | One company can have an English-speaking owner and a Marathi-speaking surveyor. Language is a user setting. |

### What goes wrong
- **Missing translation** → falls back to English, never shows a raw key
- **Long string breaks a button** → buttons wrap or truncate with the full text available;
  they never overflow
- **Mixed script in one line** ("8.2 kWp सिस्टम") → normal and must look deliberate; test it
- **Agent language ≠ app language** → they are independent; a Marathi-speaking rep may call
  a Hindi-speaking customer
- **Numbers** → Indian grouping in all three languages, always

### Recommendation
**Design every screen in Hindi at least once, early.** English-only design that gets
translated later always breaks — and the breakage is invisible until a real user opens it.
Building one screen in Devanagari now surfaces the font, spacing and line-height issues
while they are cheap to fix.

---

## CROSS-CUTTING

**Roles** — Owner (everything, approves discounts) · Manager (team's leads, reassigns) ·
Sales rep (own leads) · Surveyor (assigned surveys) · Designer (designs) · Engineer
(sign-off queue). Role decides the home screen (Stage 1).

**Notifications** — proposal opened · discount awaiting approval · agent escalation ·
follow-up due · survey submitted · design returned. Push + in-app. Never email-only.

**Search** — one field, finds leads, customers, sites, quotes by name, phone or city.

**Offline** — survey capture fully offline. Everything else degrades gracefully with a
clear indicator, never a spinner that never resolves.

**Empty states** — every list teaches on first use: what goes here, why it matters, one
action.

---

# PROMPT LIBRARY FOR CLAUDE DESIGN

Paste the design system into the **Design systems** tab once. Put the product blurb in
project context once. Then each prompt below is self-contained.

**Template every prompt follows:**

```
Design [SCREEN] for [mobile 375px / desktop 1440px].
Follow the HelioGrid — Instrument design system exactly.

WHO: [role] · WHERE: [context] · GOAL: [what they're trying to do]

SHOWS: [the content, with realistic Indian data]
ACTIONS: [what they can do]
STATES: [empty · loading · error · the edge case that matters]

Primary buttons are brass #C8842A with a near-black #1A1712 label.
Nothing below 12px. Touch targets 44px minimum.
```

### Example — the first screen to build

```
Design the "My Day" home screen for a sales rep, mobile 375px.
Follow the HelioGrid — Instrument design system exactly.

WHO: sales rep at an Indian solar EPC, opening the app at 9am
GOAL: know exactly who to contact today, in one glance

SHOWS, in this order:
1. OVERDUE — 2 items, red. Priya Sharma (follow-up 3 days late,
   8.2 kWp, ₹4.5L) and Anand Traders (proposal unopened 5 days,
   180 kWp, ₹92L)
2. TODAY — 5 items with times. Mix of site visits and callbacks.
3. AGENT ACTIVITY — 3 items, visually distinct with a robot marker,
   showing what the AI voice agent did overnight: one interested
   with a callback request, one no-answer, one question answered
4. UPCOMING THIS WEEK — collapsed count

ACTIONS: tap any item to open the lead · call or WhatsApp directly
from the row · bottom tab bar (My Day, Leads, Designs, More)

STATES: show the normal state. Also describe the empty state for a
brand-new rep with nothing assigned.

Agent activity must be clearly separated from the rep's own tasks —
the rep has to see at a glance what a machine did on their behalf.

Primary buttons are brass #C8842A with a near-black #1A1712 label.
Nothing below 12px. Touch targets 44px minimum.
```

Then immediately:

```
Now the desktop version, 1440px. Same content and data.
Persistent left sidebar nav. Three columns: Overdue+Today,
Agent activity, Upcoming. Denser, but same hierarchy.
```

### Example — the proposal builder (the highest-traffic screen)

```
Design step 3 of 11 — "Solar System Setup" — in the proposal builder.
Mobile 375px. Follow the HelioGrid — Instrument design system exactly.

WHO: sales rep building a proposal, sometimes sitting in the
customer's living room
GOAL: enter the system and pricing, and see what the customer pays

SHELL:
- Mobile step indicator at top: "‹ 3 / 11 · Solar System ›" — tapping
  it opens the full 11-step list as a bottom sheet. Do NOT put 11
  chips in a horizontal scroller at this width.
- Footer: ‹ Back · Next ›

SHOWS, grouped in cards:
1. Location — State, District (both required)
2. System — capacity kW (0.5–7000), and a segmented control
   ONGRID / OFFGRID / HYBRID
3. Battery storage — an "Add battery backup" card. If OFFGRID or
   HYBRID is selected, show a warning that a battery is required.
4. Category — Residential / Commercial. AMC dropdown.
   Commissioning included toggle.
5. Pricing — system cost incl. GST, GST %, GST amount (auto,
   read-only), subsidy ₹ (PM Surya Ghar), discount with a % ⇄ ₹
   mode switch, EMI toggle, electricity tariff ₹/kWh
6. A live "Client pays" summary card, visually distinct:
   cost + battery − subsidy − discount = ₹ payable

Use realistic values: 8.2 kW, Maharashtra / Pune, ₹4,52,471 incl.
GST at 13.8%, ₹78,000 subsidy, 5% discount.

STATES: show the filled state. Also show what the warning looks like
when a discount drives the payable amount to zero or below.

ACTIONS: every numeric field commits on blur, never per keystroke.

Primary buttons are brass #C8842A with a near-black #1A1712 label.
Nothing below 12px. Touch targets 44px minimum.
```

### Build order
0. **Proposal builder step 3** — the densest, most-used step. Get it right and the
   other ten steps follow the same pattern.
1. My Day (rep home) — mobile, then desktop
2. Leads list → Lead detail
3. Quick add lead + duplicate-found
4. Lead inbox (owner triage) + assign
5. Survey: my visits → guided capture → review
6. Agent: settings → queue → call result on timeline
7. Quote builder (mobile card list first — this is the hard one)
8. Proposal preview → send → tracking
9. Customer proposal link (no login)
10. Projects board → project detail → customer progress link
11. Onboarding: signup → what do you sell → ready
12. Settings: team, roles, catalog, price book, **component kits**
12b. **Agent setup (guided, 6 steps) + business knowledge base + test-the-agent**
     — including the *unanswered questions* review list

**— everything above ships before anything below —**

13. 🔻 Design studio redesign (Stage 5) — one screen at a time, starting with the BOM
    screen for mobile. Read the codebase first; do not reinvent.
14. 🔻 3D scene and capture screens — the hardest touch problem in the product, and the
    least urgent. Leave it until the pattern language is settled everywhere else.
