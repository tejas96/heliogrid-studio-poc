# HelioGrid — Product Spec (v1)

Companion to the design system. That file says how things should LOOK.
This file says WHAT to build — screens, content, actions and flows.

---

## 1. What this is

Software an Indian solar EPC company runs their sales on. An EPC ("engineering,
procurement, construction") company sells, designs and installs solar systems.

**v1 covers selling only:** a lead arrives → someone visits the site → a system is
designed → a quote is produced → a proposal is sent → the customer accepts or rejects.

Two customer types, both high volume:
- **Residential** — 3–15 kW rooftop, homeowner decides, often decided in days, price-driven
- **C&I** (commercial & industrial) — 50 kW–5 MW, factory or warehouse, several
  decision-makers, weeks to months, engineering scrutiny

---

## 2. Who uses it

| Role | Does | Mostly on |
|---|---|---|
| **Sales rep** | Leads, calls, follow-ups, sends proposals | Phone |
| **Surveyor** | Visits site, photos, measurements, shading notes | Phone |
| **Designer** | Draws roof, lays out panels, builds the quote | Desktop / tablet |
| **Engineer** | Reviews and signs off structural/electrical | Desktop |
| **Manager / owner** | Pipeline, approves discounts, sees numbers | Both |

One person often wears several hats in a small residential firm. Roles control what
you can see and do, not which app you open.

---

## 3. The core flow

```
NEW LEAD → CONTACTED → SITE VISIT → DESIGNING → QUOTED → NEGOTIATING → WON / LOST
```

1. Lead arrives (phone call, website, referral, WhatsApp)
2. Assigned to a sales rep
3. Rep calls, qualifies, books a site visit
4. Surveyor captures the site on a phone — photos, roof measurements, meter, shading
5. Designer builds the system and the quote
6. Proposal sent on **WhatsApp** (a link + PDF)
7. Customer opens the link, views it, accepts or asks questions — **no login**
8. Follow-ups until won or lost, with a reason recorded

---

## 4. The things in the system

**Lead** — name, phone, city, source, type (residential/C&I), monthly bill ₹, roof type,
stage, owner, next follow-up date, notes

**Customer** — a converted lead. Company or individual. May have several sites.

**Contact** — a person at a customer. C&I needs several (owner, facility manager,
procurement, finance).

**Site** — an address with a roof. Latitude/longitude, roof type, sanctioned load,
DISCOM (the electricity utility), tariff ₹/unit.

**Survey** — photos, roof measurements, shading obstructions, meter/panel photos,
access notes. Captured on a phone, often with poor signal.

**Design** — the solar system: panels, inverter, layout, expected annual generation.
Can have variants (a 5 kW option and an 8 kW option for the same customer).

**Quote** — itemised bill of materials with prices, margin, discount, GST. Versioned.

**Proposal** — the customer-facing document generated from a design + quote.

**Task** — a follow-up with a due date and an owner.

**Activity** — a logged call, visit, WhatsApp message or note, on a timeline.

---

## 5. Screens

### Auth & organisation
- **Login** — phone number + OTP. India standard. No password.
- **Sign up** — company name, GSTIN, city, your name and phone.
- **Company profile** — logo, letterhead, GSTIN, address, bank details, quote terms.
  These appear on every proposal.
- **Team** — list of members, role, status. Invite by phone number.
- **Roles & permissions** — who can see all leads vs only their own, who can approve
  discounts, who can sign off engineering.
- **Billing** — current plan, usage this month, invoices.
- **My profile** — name, photo, notification preferences.

### CRM
- **Leads list** — the sales rep's home screen. Search, filter (stage, owner, city, type),
  sort. Each row: name, city, size kWp, value ₹, stage chip, owner, next follow-up.
  Mobile = cards. Desktop = table with bulk select.
- **Lead detail** — everything about one lead. Header with name/phone/value/stage.
  Tabs or sections: activity timeline, site info, designs, quotes, tasks, notes, files.
  Primary actions: Call · WhatsApp · Log activity · Book site visit · Create design.
- **Quick add lead** — under 30 seconds on a phone. Name, phone, city, type. Everything
  else optional.
- **Pipeline board** — columns by stage, cards you drag between them. Column totals in ₹.
- **Customers list / detail** — converted customers, their sites and history.
- **Contacts** — people at a customer, with role and which site they care about.
- **Sites** — one customer can have many. Each links to its own designs and quotes.
- **Activity timeline** — calls, visits, WhatsApp, notes, quote sent, quote viewed.
- **Follow-ups / My Day** — the second home screen. Today's calls and visits, overdue
  items in red, upcoming this week. This is what a rep opens each morning.
- **Calendar** — site visits scheduled, by day and week.

### Survey (phone-first, must work offline)
- **Survey capture** — guided steps: roof photos, roof measurements, meter photo,
  electrical panel photo, shading obstructions, access constraints, notes.
- **Survey checklist** — what still needs capturing before design can start.
- **Sync status** — what's saved locally and what's uploaded.

### Design (already built — needs redesign, not invention)
- **Design studio** — site → roof drawing → obstructions → components → panel layout →
  3D shadow view → captures → single-line diagram → bill of materials → done.
- **Design variants** — offer the customer two or three system sizes side by side.
- **Engineer sign-off** — engineer reviews and approves, or returns with comments.

### Quote & proposal
- **Quote builder** — itemised lines grouped by category (modules, inverter, electrical,
  mechanical, safety, civil). Each line: item, spec, quantity, unit, rate, GST, total.
  Editable. Margin and discount at the bottom. **This is the densest screen — needs
  progressive disclosure on mobile, not a wide table.**
- **Quote versions** — compare v1 vs v2, see what changed.
- **Discount approval** — a discount above a threshold needs a manager's approval.
- **Proposal preview** — the customer-facing document, before sending.
- **Proposal template** — company branding, cover, sections included.
- **Send proposal** — choose WhatsApp (default) or email. Preview the message. Send.
- **Delivery & view tracking** — sent / delivered / opened / viewed for how long.
- **Accept / reject** — the customer's decision, recorded with date and any comment.

### Customer-facing (no login — a tokenised link opened on a phone)
- **Proposal view** — system size, annual generation, savings, price, payback,
  a 3D view of their own roof, financing options.
- **Accept / Ask a question** — two clear buttons. Accepting may collect an advance.
- Must work for a stranger with no context, on a mid-range Android phone.

### Reporting & admin
- **Dashboard** — differs by role. Rep: my pipeline, my follow-ups, my conversion.
  Manager: team pipeline, forecast, leaderboard, stuck deals.
- **Pipeline funnel** — how many leads convert at each stage, win/loss reasons.
- **Product catalog** — panels, inverters, cables, structures. Brand, model, specs, price.
- **Price book** — rates, versioned, so old quotes keep their original prices.
- **Templates** — proposal, WhatsApp message, email.
- **Notifications** — quote viewed, follow-up due, approval needed.
- **Global search** — find any lead, customer, site or quote.
- **Settings hub** — everything above in one place.

---

## 6. Flows worth designing carefully

**Sending a proposal on WhatsApp**
Quote ready → Send → pick WhatsApp → preview the message and the attached PDF →
send → activity logged → status becomes "Proposal sent" → a follow-up task is created
automatically for 2 days later → when the customer opens the link, the rep is notified.

**A follow-up**
My Day shows what's due → tap a lead → call or WhatsApp directly from the screen →
log the outcome → set the next follow-up → stage updates.

**Assignment**
A manager assigns or reassigns a lead. The new owner is notified. The change is
recorded on the timeline — who reassigned, when, why.

**Discount approval**
Rep applies a discount above the allowed limit → quote goes to "Pending approval" →
manager sees it in their queue → approves or rejects with a comment → rep notified.

**Offline survey**
Surveyor on a roof with no signal → captures photos and measurements → everything
saves locally → a clear indicator shows "3 surveys waiting to upload" → syncs when
signal returns. **Nothing is ever lost.**

---

## 7. India specifics — these are not optional

- **WhatsApp is the primary channel**, not email. Design for it first.
- **Phone number is the identity.** Login by OTP, no passwords.
- **₹ formatting is Indian:** ₹4,52,471 — not ₹452,471.
- **GST** appears on every quote, and rates differ per line (5% on modules, 18% on
  civil work).
- **DISCOM** is the local electricity utility. It determines tariff and paperwork.
- **Subsidy** (PM Surya Ghar) applies to residential and has strict conditions.
- **Sanctioned load** is a real constraint on system size.
- Many users are on mid-range Android phones with patchy connectivity.

---

## 8. Rules the product must never break

1. **Every number shows where it came from** — measured, derived, estimated or assumed.
2. **Money never displays while stale.** If the design changed and the quote hasn't
   recalculated, it must visibly read as provisional.
3. **Structural safety is engineer-led.** The app never states wind load or roof
   capacity as a guarantee. A disclaimer travels with every structural output.
4. **The customer never sees your cost or margin** — only the final price.
5. **Nothing is deleted without undo.**
