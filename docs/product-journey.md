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

> ⚠️ **These screens EXIST — redesign them, do not invent them.** The codebase has a
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
Sections: **Panel · Inverter · Cable · Electrical · Structure** (＋ **Battery** when added).
Each shows Selected / Empty status, ＋ add, brand rows (✎ edit / ✕ remove), and count
fields for Panel and Inverter.
Footer: **"Components Selected X/5 ✓"**

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
in minutes. Recommendation: a **Quick mode** that asks only steps 1, 3, 10 (company,
system, client), AI-fills 4 and 5, and uses defaults for 6, 7, 9, 11 — with a "review the
rest" link. Full mode stays for C&I. *Same builder, one toggle.*

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
- **No components selected** → allowed for Path B (a lump-sum quote is legitimate) but the
  proposal then omits the component table rather than printing an empty one
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
12. Settings: team, roles, catalog, price book
