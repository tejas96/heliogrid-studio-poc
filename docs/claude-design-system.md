# HelioGrid — Design System ("Instrument")

Design system for a solar EPC SaaS used in India. Residential rooftop **and** commercial/
industrial, both high volume. Users: sales reps, surveyors, designers, engineers, owners.

**Every screen is designed at 375px first, then scaled to desktop.** Both must be excellent —
mobile is not a compressed desktop, desktop is not a stretched phone.

---

## 1. Character

Precision instrument, not a sales toy. This is software people trust with a ₹45,00,000 quote.

- Calm, dense-but-readable, confident typography, minimal chrome
- Warm neutrals — never cold grey, never pure white
- One accent, used sparingly. Colour earns its place
- Deliberately avoids the category cliché: no saturated orange, no sun icon

---

## 2. Colour

### Neutrals — warm, hue ≈ 35°
```
25  #FBFAF8    page background
50  #F6F4F1    sunken wells, table stripes
100 #EDEAE5    subtle borders
200 #DEDAD3    default borders
300 #C7C1B8    strong borders
400 #A39B90    disabled text
500 #837A6E    tertiary text (≥14px only)
600 #5C544A    secondary text
700 #453F38
800 #2C2823
900 #1A1712    primary text
950 #0F0D0A
```

### Brass — the accent
```
50  #FDF8EF    tinted backgrounds
100 #F9EDD6
200 #E7BF7B    badges
300 #D9A24E    hover fill / dark-mode fill
400 #CE8B2F
500 #C8842A    THE accent — fills only
600 #B4741F    active fill, borders
700 #8A5518    accent TEXT and links
800 #6E4315
900 #5A3714
```

### ⚠️ The single most important rule

**Brass fills carry a near-black label, never white.**

White on `#C8842A` is 3.09:1 and fails accessibility. Ink `#1A1712` on `#C8842A` is 5.78:1
and passes. It also looks better — dark-on-brass reads as a machined instrument.

- Primary button = `#C8842A` fill + `#1A1712` label
- **Hover BRIGHTENS to `#D9A24E`** (never darkens — darkening breaks the label contrast)
- Active = `#B4741F`
- **Accent text/links use `#8A5518`, not `#C8842A`.** Brass at full chroma is 2.96:1 as
  text — never use it for type or a meaningful icon.

### Status
```
success  text #1B6B3A  on  #EAF6EE
warning  text #8A5A17  on  #FDF6EC
danger   text #A32020  on  #FBECEC
info     text #1E4FA3  on  #EDF2FC
```

### Data colours — a SEPARATE system
Never style a button with a data colour. Never chart with the accent.
```
solar access   good #16A34A · mid #F59E0B · poor #DC2626
roof identity  #2563EB #7C3AED #0891B2 #C026D3 #0D9488 #E11D48 #4F46E5 #65A30D
```
Categorical colours must also carry a label or pattern — colour alone never conveys meaning.

### Dark theme
```
surface #141310 · raised #1D1B17 · sunken #0E0D0B
text #F2EFEA · muted #A8A096 · borders #302C26
accent fill moves UP to #D9A24E, label stays ink #141310
```
Canvas/map surfaces stay dark in **both** themes.

---

## 3. Typography

One sans family (Inter or similar). Weights 400 / 500 / 600 / 700 only.

```
36/44  page hero, proposal cover
28/36  screen title
22/30  section title
18/26  card heading
16/24  comfortable body · ALL mobile inputs
14/20  body default
13/18  secondary metadata
12/16  dense cells, badges — THE FLOOR
```

**Never below 12px. Ever.** Numbers in tables and money use tabular figures so columns
don't jitter.

---

## 4. Space, radius, elevation

**Spacing — 4px base, only these:** 4, 8, 12, 16, 24, 32, 48, 64, 80, 96

**Radius:** 6 (chips, inputs) · 10 (buttons, cards) · 14 (sheets, modals) · full (pills)
Nest them: inner radius = outer radius − padding.

**Elevation — three only:**
- 1 · cards — `0 1px 2px rgb(15 13 10 / .06)`
- 2 · popovers — `0 4px 12px rgb(15 13 10 / .08)`
- 3 · modals — `0 16px 40px rgb(15 13 10 / .16)`

**Motion:** 120ms fast · 200ms base · 320ms slow, ease-out `cubic-bezier(.2,.8,.2,1)`.
Motion explains where a thing came from. Nothing decorative. Nothing over 320ms.

---

## 5. Layout

| | Mobile | Desktop |
|---|---|---|
| Width | 375px design target | 1280–1440 |
| Navigation | bottom tab bar, max 5 | persistent left nav |
| Overlays | bottom sheets, drag to dismiss | centred modals, right inspector |
| Detail views | full screen | side panel or split |
| Tables | **card list** | real table, sticky header |
| Primary action | bottom third, thumb reach | top right of its section |

Breakpoints: 480 · 768 · 1024 · 1280 · 1536.
Respect device safe areas on all fixed mobile chrome.

---

## 6. Components

**Buttons** — 10px radius, 14px semibold, 8px/16px padding, 44px min height on mobile.
Primary (brass + ink) · Secondary (white, 1px border `#C7C1B8`) · Ghost (accent text) ·
Danger (`#FBECEC` + `#A32020`). Loading keeps the label and adds a spinner.

**Inputs** — 16px text on mobile (smaller zooms the page on iOS). 1px `#DEDAD3` border,
`#B4741F` when focused. Label above, error below in `#A32020`. Validate on blur, not on
every keystroke.

**Cards** — white, 1px `#DEDAD3`, 10–14px radius, elevation 1, 16px padding.

**Chips / status pills** — full radius, 12px medium, subtle bg + matching text colour.

**Sheets** — mobile: from the bottom, 14px top corners, visible drag grabber.
Desktop: from the right, 420–520px wide.

**Empty states** — icon, one-line title, one line of why, one primary action. Never
just "No data".

**Focus ring** — light core + dark halo, so one ring stays visible on paper, on a brass
button, on satellite imagery and on dark canvas: 2px `#FBFAF8` outline + 4px `#1A1712` glow.

---

## 7. Non-negotiables

1. Touch targets ≥ 44×44px
2. Nothing below 12px
3. Text contrast ≥ 4.5:1, borders/icons ≥ 3:1
4. No hover-only meaning — every icon control has a visible label on mobile
5. Colour is never the only carrier of meaning
6. UI colour and data colour never mix
7. Loading, empty, error and offline are all designed — not afterthoughts
8. Destructive actions are confirmed and undoable
9. One `H1` per screen, logical heading order
10. Every number shows where it came from (see §8)

---

## 8. Domain rules — these make it feel like solar software

- **Every figure carries a provenance tag** — measured / derived / estimated / assumed.
  Quiet, small, muted, next to the number. Example:
  `11,840 kWh — derived · PVGIS ERA5, 19-yr record`
- **Money never displays while stale.** If the design changed and the quote hasn't
  recalculated, it must visibly read as provisional.
- **Structural claims always carry the engineer disclaimer.** The product never states
  wind load or roof capacity as a guarantee.
- **Indian number formatting** — ₹4,52,471, never abbreviated on commercial documents.
- Value and unit never wrap apart: `8.2 kWp`, `₹4,52,471`.
- Procurement quantities stay metric even if the user prefers feet — Indian suppliers
  sell by the metre.

---

## 9. Craft — small things, big difference

- Concentric corners: inner radius = outer − padding
- Optically centre triangular icons (play, send, chevron) — ~1px counter-nudge
- Right-align numbers, left-align text, align decimals
- Never truncate money or a quantity — truncate the item name instead
- No spinner before 400ms; use a skeleton that matches the real layout
- Prefer an undo toast over a confirmation dialog
- A disabled control must say why it's disabled
- Sticky headers gain their shadow on scroll, not at rest
- Preserve scroll position and filters when navigating back
- Long-press gives haptic + visual feedback
- Keyboard must never cover the field being typed into

---

## 10. Screens to build (v1 — Sell)

**Auth & org** — login (phone + OTP), signup, invite, company profile, team & roles,
billing, user settings

**CRM** — leads list, lead detail, quick capture, pipeline board, customers, contacts,
sites, activity timeline, follow-ups / My Day, calendar, assignment

**Survey** — site survey capture (photos, measurements, shading, access), checklist, offline

**Design** — the solar design studio (roof, layout, 3D), design variants, engineer sign-off

**Quote & proposal** — BOM/quote builder, quote versions, discount approval, proposal
template, **send via WhatsApp**, view tracking, e-sign accept/reject, payment link

**Customer-facing** — tokenised proposal link, no login: proposal, 3D view, accept/reject

**Reporting & admin** — role dashboards, pipeline funnel, catalog & price book, templates,
notifications, global search, settings

---

## 11. Tone

Sentence case. Say the number and its source. Errors state cause and next action.
Never imply engineering certainty the product doesn't have.
