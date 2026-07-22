# Phase 4 — The Customer's Side  ▸ ONE page, one prompt

**The highest-stakes surface in the product.** A stranger, on their own phone, in the
evening, deciding whether to spend ₹4.5 lakh with a company they met three weeks ago.

Reference: `product-journey.md` — customer journey C5, C8, C10, C12; decisions D5, D25, D32.

---

## Why this is one prompt and not three

The journey's rule: **one link, its whole life.** The tokenised URL the rep shares with the
proposal *becomes* the progress tracker once the deal is won, and the document pack after
handover. The customer bookmarks it once.

Designing those as three separate screens would be the mistake — they are **lifecycle
states of a single page.** So: one page, one prompt, every state as a frame on it.

---

## Things that are true of every state here

| | |
|---|---|
| **No login, ever** | Tokenised link. No account, no password, no app install (D5). |
| **No app chrome** | No bottom nav, no sidebar, no "Add lead". This is a public web page, not the app. |
| **The EPC's brand, not yours** | The customer sees *Suryodaya Solar*, not HelioGrid. Their logo, their colours if set, their contact. HelioGrid is at most a small "powered by" line. |
| **Mid-range Android, slow connection** | Must render usefully before images finish loading. |
| **English · Hindi · Marathi** | A language switch is visible (D25). A homeowner who needed a Marathi phone call needs a Marathi document. |
| **Read in 30 seconds** | A 55-year-old in Nashik, possibly with their spouse, possibly forwarding it to a son in Bengaluru. |

---

# THE PROMPT

```
Design the CUSTOMER-FACING page for a solar proposal — the single page an
EPC's customer opens from a link. Everything below goes on ONE page as
frames side by side. Do NOT create a separate page per state.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHO: Priya Sharma, a homeowner in Nashik, Maharashtra. She is not a
solar expert. She received a WhatsApp message from her salesperson with
a PDF and a link. It is 9pm. She is on a mid-range Android phone,
possibly showing it to her husband.

WHAT SHE IS DECIDING: whether to spend ₹3,51,847 with Suryodaya Solar.

CRITICAL CONSTRAINTS:
- She has NO login and NO account. The link just opens.
- This is NOT the app. No bottom navigation, no sidebar, no app menus.
  It is a public web page.
- It carries the EPC's branding — "Suryodaya Solar" — not the software
  vendor's. Their logo at the top, their phone number at the bottom.
- A language switch (English · हिंदी · मराठी) sits in the header.
- It must be understandable in 30 seconds by someone who has never
  bought solar.

THE SAME URL is reused across the project's life. It shows the proposal
first, then project progress once the deal is won, then the document
pack at handover. Design it as one page with lifecycle states, not as
three different pages.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATE A — THE PROPOSAL  (the main state, design this most carefully)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HEADER
- Suryodaya Solar logo and name
- "Solar proposal for Priya Sharma"
- Nashik, Maharashtra · Proposal HG-2026-0142 · 21 July 2026
- Language switch: English · हिंदी · मराठी

SECTION 1 — THE HEADLINE, above the fold
The three things she actually wants to know, large and immediate:
    8.2 kWp system
    Saves about ₹4,100 every month
    Pays for itself in 4.6 years
Nothing else competes with these three.

SECTION 2 — YOUR ROOF
- A 3D view or satellite image of HER OWN roof with the panels on it.
  This is the moment that separates this from a PDF a competitor
  emailed. Make it prominent.
- Caption: "12 panels on your rooftop, facing south"
- If no design exists, show a simple illustration instead and do not
  pretend it is her roof.

SECTION 3 — WHAT YOU WILL GENERATE
- Annual generation: 11,840 units (kWh)
- A simple month-by-month bar chart. Label the monsoon dip honestly —
  people notice July and August are lower and it builds trust to name it
  rather than hide it.
- "That is about 88% of your current electricity use"

SECTION 4 — WHAT IT COSTS
Show the arithmetic plainly. Do not bury the subsidy.
    System cost              ₹4,52,471
    Government subsidy      − ₹78,000     (PM Surya Ghar)
    Discount                − ₹22,624
    ─────────────────────────────────
    You pay                  ₹3,51,847
Then payment stages as the four tranches:
    10% on booking · 60% on material dispatch ·
    20% on installation · 10% on commissioning
And, if enabled, an EMI line: "or about ₹7,400/month for 5 years".

SECTION 5 — WHAT IS INCLUDED
The five component categories with brand, model and warranty, in plain
language:
    Panels     AESOLAR 610 Wp × 12   25-year performance warranty
    Inverter   Growatt 5 kW          5-year warranty
    Structure  GI elevated table     10-year warranty
    Cabling    Polycab copper        included
    Electrical Protection & earthing kit   included
Plus: "Installation, commissioning and net-metering paperwork included."

SECTION 6 — WHAT HAPPENS NEXT
A simple 5-step timeline with realistic durations:
    Survey & design 2 days → Material 5–7 days → Installation 1–2 days →
    Net metering 3–6 weeks → Commissioning 1 day
Be honest that net metering is the long one and outside anyone's control.

SECTION 7 — WHO WE ARE
Suryodaya Solar · 8 years in business · 350+ installations ·
200 kW installed · serving Nashik, Pune and Ahmednagar.

FOOTER — always reachable
    [ Accept this proposal ]      primary
    [ Ask a question ]            secondary
    Call Rajesh: +91 98765 43210
On mobile these stay pinned at the bottom of the screen while scrolling —
she must never have to hunt for them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATE B — THE PROPOSAL, WITHOUT A DESIGN  (the honesty label)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Identical to State A, with two differences:

1. Below the headline, a visible line — NOT fine print, NOT a warning
   colour, just calm and clear:
   "Indicative proposal. Generation and savings are estimated from your
    system size and location. A site survey will confirm the final
    figures."

2. Section 2 shows an illustration rather than her actual roof, captioned
   "Your roof will be surveyed before installation".

This must read as CONFIDENCE, not hedging. When she compares three
proposals and only this one distinguishes estimates from calculations,
that should feel like the honest company.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATE C — ASK A QUESTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A sheet, not a new page.
- "What would you like to know?"
- Four common questions as one-tap chips:
  · Can I pay in instalments?
  · What if it does not generate as promised?
  · Will it damage my roof?
  · How long does the subsidy take?
- A free-text box for anything else
- Send

After sending: "Rajesh will call you shortly." Show his name and photo so
it feels like a person, not a ticket.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATE D — ACCEPTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tapping Accept opens a confirmation sheet, NOT an instant commit:
- "You are accepting the 8.2 kWp system for ₹3,51,847"
- The payment stages restated
- Name and phone pre-filled, read-only
- A tickbox: "I have read and agree to the terms"
- [ Confirm ]  ·  [ Go back ]

AFTER CONFIRMING — this must be instant and warm:
- "Thank you, Priya. Suryodaya Solar has been notified."
- What happens next, with a date: "Rajesh will call you within 24 hours
  to arrange the advance payment."
- The page now shows the ACCEPTED state permanently.

Never leave a blank moment after Accept. She has just committed ₹3.5
lakh — silence at that instant is the worst possible response.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATE E — PROJECT PROGRESS  (same URL, after the deal is won)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THIS PREVENTS MORE SUPPORT CALLS THAN ANYTHING ELSE IN THE PRODUCT.

The page becomes a status view. The proposal is still reachable below,
collapsed.

    Your 8.2 kWp system · Nashik

    ✅ Advance received            12 Aug
    ✅ Material ordered            14 Aug
    ✅ Installed                   22 Aug
    🔵 Commissioning               in progress
    ⬜ Net metering
       Waiting for DISCOM approval
       Applied 15 Aug · typically 3–6 weeks
    ⬜ Handover

The waiting line is the most important text on the page. A delay that was
explained is tolerable; a delay that was hidden becomes a complaint.

Also show: next payment due if there is one, and the contact for
questions. Do NOT show internal blockers, margins or supplier problems —
only what is true and useful to her.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STATE F — HANDOVER COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "Your system is live" with the commissioning date
- Documents to download: warranty certificates, commissioning
  certificate, net-metering approval, invoice
- "How to read your generation"
- Service contact
- A quiet referral ask: "Know someone who is thinking about solar?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDGE STATES — all required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. LOADING — a skeleton that matches the real layout. The headline
   numbers should appear before the roof image finishes loading.
2. EXPIRED LINK — "This proposal has expired" with the company's phone
   number and a "Request a new one" button. Never a dead end.
3. INVALID / WRONG LINK — "We could not find this proposal." Same
   escape: call the company.
4. SUPERSEDED — a newer version exists: "This is version 1. Version 2
   was sent on 24 July." with a link to the current one.
5. ALREADY ACCEPTED — someone reopens the link after accepting. Show
   the accepted state, not the Accept button again.
6. DECLINED — after declining, a calm state, no guilt, with a way to
   reopen the conversation.
7. SLOW CONNECTION — text and numbers render first; the roof image and
   chart load progressively with placeholders.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Show State A once more in Hindi (हिंदी), to prove the layout survives
Devanagari — it runs longer than English and the headline numbers must
still fit. Rupee figures and units stay in Indian format.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRAMES TO PRODUCE — all on ONE page
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 1. State A — proposal, with a design           mobile + desktop
 2. State B — proposal, estimate label          mobile + desktop
 3. State C — ask a question sheet              mobile
 4. State D — accept confirmation + confirmed   mobile
 5. State E — project progress                  mobile + desktop
 6. State F — handover complete                 mobile
 7. Edge states 1–7                             mobile
 8. State A in Hindi                            mobile

BOTH VIEWPORTS, one design:
· MOBILE 375px — the primary target; most customers open this on a
  phone. Single column, actions pinned at the bottom, generous type.
· DESKTOP 1440px — a centred document column, maximum 720px wide, with
  generous margins. This is a DOCUMENT, not an app screen: no sidebar,
  no dashboard layout. It should read like something you would print.

NO app navigation of any kind in either viewport.

Use these exact figures throughout: 8.2 kWp · 12 panels · ₹4,52,471
system cost · ₹78,000 subsidy · ₹22,624 discount · ₹3,51,847 payable ·
11,840 kWh annual · ₹4,100 monthly saving · 4.6 year payback ·
Priya Sharma · Nashik, Maharashtra · Suryodaya Solar · Rajesh Patil.
```

---

## Review focus for this phase

- Would a 55-year-old in Nashik understand the headline in **30 seconds**?
- Does the estimate label read as **confidence** or as an excuse?
- Is **Accept** reachable at every scroll position on mobile?
- Does the net-metering waiting line explain the delay well enough to **prevent a phone
  call**?
- Does it look like **Suryodaya Solar's** document, or like a SaaS product's screen?
- Does the Hindi version still fit?
