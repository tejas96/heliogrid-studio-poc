# Design System — Solar EPC Platform

**Audience: Claude Code.** This file is the contract for every screen built in this repo.
Read it before writing UI. When this file and your instincts disagree, this file wins.
When this file is silent, follow the nearest precedent in `src/design/` and add a rule here.

**Status:** v1 draft. Brand direction is a PROPOSAL pending sign-off (§3).

---

## 1. What we are building

A multi-tenant SaaS for Indian solar EPC businesses — residential rooftop *and* C&I, both
high volume. v1 scope is **Sell**: CRM → survey → design → quote → proposal → close.
Procurement, installation and O&M are explicitly out of v1.

Three facts shape every decision below:

1. **Full mobile parity, including the design studio.** Every screen works on a 375px
   phone — roof tracing and 3D included. This is a deliberate differentiator; no
   competitor does it. It is also the single hardest commitment in this document, so §7
   (Touch) is not optional reading.
2. **WhatsApp is the primary customer channel**, not email. Sending, follow-ups,
   reminders and acceptance all flow through it.
3. **The customer never logs in.** They open a tokenised link and accept or reject.
   Every customer-facing surface is designed for a stranger on a phone with no context.

---

## 2. Non-negotiables

These override aesthetics, convenience and speed. A screen that violates one is not done.

| # | Rule | Why |
|---|---|---|
| N1 | **No hover-only affordance may carry meaning.** Every icon-only control has a visible label, or a persistent text alternative within one tap. | The old UI had 56 `data-tip` + 68 `title` attributes as the *only* visible label. Touch users saw unlabelled arrows. |
| N2 | **Every interactive target ≥ 44×44 CSS px** on touch pointers. Visual size may be smaller; the hit area may not. | WCAG 2.5.8 / Apple HIG. Non-negotiable at 375px. |
| N3 | **No font size below 12px.** Ever. 14px is body. | The old UI shipped 23 sizes, nine below 11px. |
| N4 | **Text contrast ≥ 4.5:1**, UI/graphic boundaries ≥ 3:1, verified — not eyeballed. | `--ink-3` shipped at ~4.1:1 across 149 uses. |
| N5 | **Every control has an accessible name**, and modals trap + restore focus. | Ported from the existing, tested a11y layer. Do not regress it. |
| N6 | **UI colour and DATA colour are separate systems.** Never style a button with a data colour or a chart series with `--accent`. | Roof identity, string colours and solar-access heatmaps all encode meaning by hue. UI chrome competing with them makes both unreadable. |
| N7 | **Every number the user sees carries a provenance tier** — measured / derived / estimated / assumed. | Domain rule, pre-existing. The BOM and quote are commercial documents. |
| N8 | **Destructive and irreversible actions are confirmed and undoable.** Undo is reachable by thumb on mobile. | A stray tap must never cost a design. |
| N9 | **No layout may be tuned to a fixed viewport.** No magic pixel offsets that assume a height. | The old Step 6 was hand-tuned to an ~860px viewport and collided on anything else. |
| N10 | **Loading, empty, error and offline states are part of "done."** A screen without all four is unfinished. | The old app rendered `null` until hydration — a blank first paint on every route. |

---

## 3. Brand — Direction A, "Instrument" (LOCKED)

Precision-tool character: warm graphite base, one confident brass accent, generous space.
It should read as *engineering software you trust with a ₹40 lakh quote*, not a sales toy.
Deliberately avoids the category cliché — saturated orange plus a sun icon — which every
competitor uses and which would collide with our own energy-data colours (N6).

### 3.1 The palette

Neutrals are **warm** (hue ≈ 35°, very low chroma). Next to satellite imagery and dark
canvas, a warm grey reads as considered where a cool grey reads as clinical.

```
Neutral   25 #FBFAF8   50 #F6F4F1   100 #EDEAE5   200 #DEDAD3   300 #C7C1B8
          400 #A39B90  500 #837A6E  600 #5C544A   700 #453F38   800 #2C2823
          900 #1A1712   950 #0F0D0A

Brass     50 #FDF8EF   100 #F9EDD6  200 #E7BF7B   300 #D9A24E   400 #CE8B2F
          500 #C8842A  600 #B4741F  700 #8A5518   800 #6E4315   900 #5A3714
```

### 3.2 The one decision worth explaining: brass fills carry INK, not white

White on `#C8842A` measures **3.09:1 — it fails AA.** The usual fix is to darken the accent
until white passes, which lands at `#A0661A` and turns the brass into mud. So the primary
button is **brass fill with a near-black label** (`#1A1712` on `#C8842A` = **5.78:1**).

That is also the better-looking answer. Dark-on-brass is the machined-instrument look —
Leica, not lemonade — and it is what makes this palette feel expensive rather than sunny.

Consequence: **the accent BRIGHTENS on hover, it does not darken.** `#C8842A → #D9A24E`
(7.85:1 with ink). A darkening hover would drag the label toward failing.

### 3.3 Verified contrast — every pair we actually ship

| Pair | Ratio | Need |
|---|---|---|
| `text` #1A1712 on `surface` #FBFAF8 | **17.6:1** | 4.5 |
| `text-muted` #5C544A on surface | **7.1:1** | 4.5 |
| `text-muted` on `sunken` #F6F4F1 | **5.5:1** | 4.5 |
| **ink on brass fill** #1A1712 / #C8842A | **5.78:1** | 4.5 |
| ink on brass **hover** #D9A24E | **7.85:1** | 4.5 |
| accent **text/links** #8A5518 on surface | **5.93:1** | 4.5 |
| accent **border** #B4741F on surface | **3.69:1** | 3.0 |
| ink on `accent-200` #E7BF7B (badges) | **10.3:1** | 4.5 |
| success #1B6B3A on #EAF6EE | **5.89:1** | 4.5 |
| warning #8A5A17 on #FDF6EC | **5.50:1** | 4.5 |
| danger #A32020 on #FBECEC | **6.58:1** | 4.5 |
| info #1E4FA3 on #EDF2FC | **6.92:1** | 4.5 |
| **dark** text #F2EFEA on #141310 | **16.2:1** | 4.5 |
| dark text-muted #A8A096 on #141310 | **7.2:1** | 4.5 |
| dark accent text #D9A24E on #141310 | **8.16:1** | 4.5 |
| dark primary fill: ink #141310 on #D9A24E | **8.16:1** | 4.5 |
| canvas chrome #F2EFEA on #1A1916 | **15.3:1** | 4.5 |

**Accent text is `#8A5518`, not `#C8842A`.** The brand hue at full chroma is 2.96:1 as text
and must never be used for type or for a meaningful icon. It is a FILL and a GRAPHIC colour.

### 3.4 Focus ring — two-tone, because one tone cannot work everywhere

A single-colour ring fails somewhere: `#8A5518` is 5.93:1 on the page but **2.00:1 against
a brass button**, which is exactly where focus matters most.

```css
outline: 2px solid var(--focus-inner);   /* #FBFAF8 near-white */
outline-offset: 1px;
box-shadow: 0 0 0 4px var(--focus-outer); /* #1A1712 ink */
```

Light core against dark surfaces, dark halo against light ones — legible on the page, on a
brass fill, on a photo, and on the dark canvas. One ring, everywhere, no exceptions.

### 3.5 Dark theme

Dark is not inverted light. Surfaces are warm-black (`#141310` / raised `#1D1B17`), and the
**primary fill moves up the ramp** to `accent-300 #D9A24E` — a mid-brass that glows on the
page reads muddy on black. Label stays ink. Same names, different values (§4.2).

### 3.6 Name & mark

Keeping **HelioGrid**. The mark is a monogram, not a sun — the category is saturated with
suns, and a sun icon competes with the solar-access data colours in every screenshot.
Wordmark in the display weight; monogram in brass with an ink glyph, matching the button.

---

## 4. Foundations

Everything is a CSS custom property on `:root`, consumed through Tailwind theme extensions.
**Components never write raw values.** No `#hex`, no `px` spacing, no ad-hoc font sizes.

### 4.1 Colour — semantic, not literal

Name by ROLE. `--surface-raised`, never `--gray-100`.

```
Surfaces      --surface            page background
              --surface-raised     cards, sheets, popovers
              --surface-sunken     wells, inset areas, table stripes
              --surface-overlay    scrims behind modals
              --surface-canvas     the map/3D/drawing backdrop (dark in both themes)

Text          --text               primary
              --text-muted         secondary — MUST pass 4.5:1
              --text-subtle        tertiary; large/bold text only, never <14px
              --text-on-accent     text on accent fills

Lines         --border             default hairline
              --border-strong      emphasis, focused fields
              --border-subtle      internal table rules

Accent        --accent             primary action
              --accent-hover  --accent-active  --accent-subtle (tinted bg)

Status        --success --warning --danger --info
              each with -subtle (background) and -strong (text on subtle)

Focus         --focus              3:1 against BOTH adjacent surfaces
```

**Data colours live in a separate namespace and are never used for chrome (N6):**

```
--data-roof-1 … --data-roof-8      categorical, roof identity
--data-string-1 … --data-string-12 categorical, electrical strings
--data-scale-0 … --data-scale-10   sequential, solar access / irradiance
--data-good --data-mid --data-poor diverging, performance
```

Categorical data colours must be distinguishable under deuteranopia AND carry a
non-colour encoding (label, pattern, or position) — colour alone never conveys meaning.

### 4.2 Theming

Light and dark are **one semantic system, two value sets** — not two hand-maintained
palettes (the old app had exactly that mistake and it made real dark mode impossible).

```css
:root { color-scheme: light; /* semantic values */ }
[data-theme="dark"] { color-scheme: dark; /* same names, dark values */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }
```

`--surface-canvas` stays dark in both themes — satellite imagery and 3D need it.
Chrome *over* the canvas uses the dark token set regardless of page theme.

### 4.3 Type

One family. **Load it with `next/font`** — the old app declared Inter and never shipped it,
so every user saw a fallback and every layout was tuned against the wrong metrics.

Scale — 8 steps, no half-pixels, nothing below 12px:

| Token | Size / line-height | Use |
|---|---|---|
| `text-2xs` | 12 / 16 | dense table cells, badges. **Floor.** |
| `text-xs` | 13 / 18 | secondary metadata |
| `text-sm` | 14 / 20 | **body default** |
| `text-base` | 16 / 24 | comfortable body, mobile inputs |
| `text-lg` | 18 / 26 | section headings |
| `text-xl` | 22 / 30 | screen titles |
| `text-2xl` | 28 / 36 | page heroes |
| `text-3xl` | 36 / 44 | marketing / proposal covers |

Weights: 400, 500, 600, 700 only. **No 550** — it silently snaps without a variable font.

**Mobile inputs are ≥16px** or iOS zooms the viewport on focus.

Numerals in tables and money use `font-variant-numeric: tabular-nums`.

### 4.4 Space

4px base. Only these steps: `0 1 2 3 4 6 8 12 16 20 24 32 40 48 64` (×4px).
The old app had 72 distinct padding values and 15 gap values. That is the thing we are
replacing; do not reintroduce it with arbitrary values.

### 4.5 Radius, elevation, motion

```
--radius-sm 6   --radius-md 10   --radius-lg 14   --radius-full 9999
--elev-1 (cards)  --elev-2 (popovers)  --elev-3 (modals)   — no other shadows
--motion-fast 120ms   --motion-base 200ms   --motion-slow 320ms
--ease-out cubic-bezier(.2,.8,.2,1)
```

All motion respects `prefers-reduced-motion` — the existing global block is correct, keep it.
Motion communicates *origin and direction*; it never decorates. Nothing animates longer
than 320ms. Nothing blocks input while animating.

---

## 5. Layout & responsive

**Mobile-first, always.** Author at 375px, then add complexity upward. Never the reverse.

| Token | Min width | Reality |
|---|---|---|
| `base` | 0 | phone portrait — the design target |
| `sm` | 480 | large phone / landscape |
| `md` | 768 | tablet portrait — studio becomes comfortable |
| `lg` | 1024 | tablet landscape / small laptop |
| `xl` | 1280 | desktop — the density ceiling |
| `2xl` | 1536 | wide desktop |

Use **container queries** for components that appear at multiple widths (a card in a
sidebar vs a grid). Reserve media queries for page-level structure.

**Viewport units:** `dvh`/`svh` only. Never `vh` — the iOS URL bar makes it overflow, which
is exactly what put the old app's fixed bottom bar under the browser chrome.

**App shell:**
- Mobile: bottom tab bar (≤5 destinations), sheets from the bottom, full-screen detail views.
- Desktop: persistent left nav, content column, optional right inspector.
- **One shell for the whole product.** The old app had three unrelated header systems.

Respect `env(safe-area-inset-*)` on all fixed chrome.

---

## 6. Density doctrine

The old BOM screen presented **~286 focusable controls at once**, 12.5px, inside a
1060px-min-width horizontally scrolling table. That is the failure mode this section exists
to prevent.

**Rules for dense data:**

1. **Progressive disclosure by default.** Show identity + the one number that matters.
   Everything else is one tap away in a detail sheet.
2. **Editing is a mode, not a state.** Rows are readable first. Tapping a value opens an
   editor; the whole table is not 12 live inputs per row.
3. **A table wider than the viewport is a design failure, not a scroll problem.** Below
   `md`, tabular data becomes a **card list**: primary line, secondary line, one metric,
   chevron to detail. Above `md`, real tables with sticky header and sticky first column.
4. **Three densities** — `comfortable` (mobile default), `compact` (desktop default),
   `dense` (opt-in for power users on `xl`+). One prop, not three components.
5. **Bulk actions over per-row controls.** Select rows, act once — do not put a delete
   button on every row.
6. Every table states its total count, its filter state, and what an empty result means.

---

## 7. Touch & pointer — the full-parity contract

We committed to drawing and 3D on a phone. This is how.

### 7.1 Input model

Build for **pointer events**, then branch on capability — never on screen width.

```ts
const coarse = matchMedia('(pointer: coarse)').matches;
const hoverable = matchMedia('(hover: hover)').matches;
```

A tablet with a stylus is `fine` + no hover. A touchscreen laptop is both. Width tells you
nothing about the hand.

### 7.2 Canvas gestures — one vocabulary everywhere

Applies to the satellite canvas, the layout editor and the 3D scene.

| Gesture | Action |
|---|---|
| One-finger drag on empty space | Pan |
| Pinch | Zoom about the pinch centroid |
| Two-finger rotate | Rotate (3D orbit / roof rotate) |
| Tap | Select |
| Long-press (350ms) | Contextual action — place vertex, open context menu |
| Drag a selected object | Move, with snap feedback |
| Two-finger tap | Undo |

**Never** require a wheel, a middle-click, or a keyboard shortcut to reach a function.
The old canvas was wheel-only zoom with middle-click pan and had **zero touch handlers**.

### 7.3 Precision under a fingertip

Vertex placement is the hard case: the target is under the thumb.

- **Loupe.** On long-press and during vertex drag, show a magnified inset of the area under
  the finger, offset toward screen centre, with a crosshair at the true point.
- **Offset dragging.** The manipulated point sits above the contact point, never beneath it.
- **Snap first, nudge after.** Snap to edges, angles and guides aggressively on touch; then
  offer an arrow-pad or numeric entry for fine correction. Numeric entry is always available —
  it is the accessible path and the precise one.
- **Commit explicitly.** Drawing has a visible Done/Cancel; it never ends on an ambiguous tap.

### 7.4 Reachability

On mobile, primary actions live in the **bottom third**. Destructive actions are never
adjacent to primary ones. Undo is persistently reachable while any canvas tool is active.

---

## 8. Component contracts

Built on **Radix primitives + Tailwind**, owned in-repo (shadcn approach). Radix gives us
focus management, dismissal, positioning and ARIA — which is where accessibility bugs live.

```
src/design/
  tokens.css        the only place raw values exist
  primitives/       Button Input Select Checkbox Radio Switch Slider
                    Dialog Sheet Popover Tooltip Tabs Toast Menu Combobox
  patterns/         DataTable/DataList  EntityCard  Timeline  StatTile
                    FilterBar  EmptyState  ErrorState  LoadingState
                    Stepper  ApprovalBadge  ProvenanceChip  MoneyRow
  canvas/           TouchCanvas  Loupe  GestureLayer  ToolPalette
  layout/           AppShell  PageHeader  BottomNav  SideNav  Inspector
```

### Ported behaviour — do not re-derive

Four things in the old `ui.tsx` encode real bug fixes. Port the *contracts*, restyle freely:

| Contract | Why it exists |
|---|---|
| `NumberField` / `TextField` **commit on blur/Enter**, Escape abandons | Per-keystroke commits wrote one undo entry per character on the pricing screen. |
| `DataTable` **requires a `caption`** | Screen-reader users need to know what a table is before its cells. |
| `NumberField`/`TextField` **require `ariaLabel`** | Makes the unlabelled control a compile error, not a review finding. |
| `useFocusTrap` — move focus in, wrap Tab, **restore to opener** | `aria-modal` without a trap is a lie. |

Radix covers the trap and dismissal; keep the required-prop discipline.

### Universal props

Every interactive component supports: `disabled`, `loading` (with `aria-busy`), `invalid` +
`error` (wired to `aria-invalid` / `aria-describedby`), and a `size` from one shared scale.

### Buttons

Variants: `primary` (one per view), `secondary`, `ghost`, `danger`, `link`.
Loading shows a spinner **and keeps the label** — never a bare spinner.
Icon-only requires `aria-label` AND a tooltip AND, on mobile, a visible text label.

---

## 9. Accessibility contract

The existing a11y layer is the best thing in the old codebase. It is tested with axe-core
and focus-behaviour suites. **Write the new system against those suites before deleting the
old components.**

Required on every screen:
- One `<h1>`. Logical heading order, no skips. (Most old screens had no `<h1>` at all.)
- Landmarks: `<header> <nav> <main> <aside> <footer>`. (The old app had 2 landmarks total.)
- A **skip-to-content** link. (There was none.)
- `:focus-visible` on everything, ≥3:1 against both adjacent surfaces.
- Live regions for async results, validation and long operations.
- Roving tabindex on every composite widget — radiogroups, toolbars, tab lists. The old
  `Seg` and `UnitToggle` declared `role="radiogroup"` with no arrow-key navigation.
- Never `aria-disabled` without `disabled` — it creates a focusable no-op.
- Reduced motion, and no meaning conveyed by colour alone.

**Canvas accessibility** (WebGL is invisible to assistive tech): every canvas has a text
alternative describing the design, a keyboard path to every function, and a non-visual way
to read out what is selected. The existing `LegPlanEditor` `aria-live` pattern is the model.

Automated axe checks run in CI. They cannot see contrast in jsdom — contrast is verified
against the token pairs, not by hoping.

---

## 10. Content & tone

- **Sentence case** everywhere. No ALL CAPS except 2-letter units.
- **Say the number and its provenance.** "18.4 kWh/day (estimated — no shading survey yet)".
- **Errors state cause and next action.** Never "Something went wrong."
- **Empty states teach.** Title, one line of why, one primary action.
- **Money:** Indian grouping (₹4,52,471), never abbreviated in commercial documents.
- **Units follow the user's m/ft preference** — except procurement quantities, which stay
  metric because Indian suppliers sell by the metre. That rule already exists; keep it.
- **Never imply engineering certainty we do not have.** Structural adequacy is engineer-led;
  the disclaimer travels with every structure-bearing output.

---

## 11. Anti-patterns — these killed the old UI

| Do not | Instead |
|---|---|
| Inline `style={{}}` objects | Tailwind classes off tokens |
| Raw hex or arbitrary px | Semantic tokens |
| Fixed `minWidth` on tables | Card list below `md` |
| `title=` / CSS tooltips as the only label | Visible label + Radix Tooltip |
| Absolute pixel offsets tuned to a viewport | Flex/grid, container queries |
| `100vh` | `100dvh` |
| A second dark palette | One semantic system, two value sets |
| A control that does nothing | Ship it working, or do not ship it |
| Blank screen while loading | Skeleton matching final layout |
| New font size / spacing value | Use the scale; if it truly cannot, change the scale here |

---

## 12. Craft — the small things that decide whether this feels expensive

None of these are individually visible. Collectively they are the entire difference between
software people tolerate and software people like. Treat them as spec, not polish.

### Geometry & optics

- **Nested radius:** inner radius = outer radius − padding. A 10px card with 8px padding
  holds a 6px child. Concentric corners are the single most common tell of careless UI.
- **Optical centring beats mathematical centring.** Triangular glyphs (play, chevron, send)
  need ~1px of counter-nudge. Trust the eye over the box model.
- **Icons sit on the text baseline**, not the line box. Align by cap-height.
- **Hairlines are 1 device pixel.** On 2× screens that is 0.5px — use a scaled border or a
  box-shadow, never a fattened 1px CSS border that renders as 2 physical pixels.
- **Nothing is centred that will grow.** Left-align anything of variable length; centring is
  for single, short, fixed strings only.

### Numbers — this is a money product

- **`tabular-nums` on every figure** in tables, stat tiles and money. Proportional digits make
  a column of rupees jitter as it updates.
- **Align decimals, right-align numerics, left-align text.** Always.
- **Never truncate money or a quantity.** Truncate the item name instead.
- **Non-breaking space between value and unit** — `8.2 kWp`, `₹4,52,471` must never wrap.
- **Animate a changing stat only on the digits that changed**, ≤200ms, and never under
  `prefers-reduced-motion`. A total that silently swaps looks like a bug; one that spins like
  a slot machine looks like a toy.

### State & feedback

- **No spinner before 400ms.** Faster than that, show nothing — a flashed spinner reads as
  jank. Slower than 400ms, show a skeleton whose shape matches the final layout so nothing
  reflows on arrival.
- **Skeletons mirror real geometry** — right number of rows, right column widths. A generic
  grey box is worse than nothing because it lies about what is coming.
- **Optimistic for cheap and reversible** (toggling a line into a quote). **Pending state for
  expensive or irreversible** (sending a proposal). Never optimistic about something a
  customer will receive.
- **A disabled control must say why.** On hover and on focus. A dead button with no
  explanation is the single most frustrating thing in enterprise software.
- **Undo beats confirm.** Prefer doing the thing plus an undo toast. Reserve modal
  confirmation for the genuinely irreversible, and type-to-confirm for the catastrophic only.
- **Toasts:** bottom-centre on mobile (thumb reach, above the tab bar and the safe area),
  bottom-right on desktop. Max 3 stacked, oldest collapses. Anything with an action stays
  until dismissed — never time out an Undo.

### Motion

- **Motion explains origin.** A sheet rises from the edge it is anchored to; a popover scales
  from its trigger. Nothing fades in from nowhere.
- **Enter can be eased; exit is faster and near-linear.** Users have already decided to leave.
- **Never animate layout on first paint.** Animate on change only.
- Everything obeys `prefers-reduced-motion` — transforms become instant, opacity may remain.

### Forms & input

- **Validate on blur, not on keystroke.** Nobody should be told their email is invalid while
  typing the third character. Re-validate on change only *after* the first error is shown.
- **Errors sit beneath the field, wired via `aria-describedby`**, and the field keeps the
  user's bad value so they can fix rather than retype.
- **Numeric fields select-all on focus** when the likely action is replacement.
- **`inputMode` on every numeric input** so phones show the right keypad. `decimal` for
  measurements, `numeric` for counts, `tel` for phone.
- **Autofocus only when intent is unambiguous** — a search field inside a picker the user
  just opened. Never autofocus on page load on mobile; the keyboard eats the screen.
- **Enter submits single-field forms.** Escape reverts the field and does not close the sheet
  on the first press.

### Lists & tables

- **Sticky headers gain their shadow on scroll**, not at rest. A permanent shadow on an
  unscrolled list is noise.
- **Preserve scroll position, filters and sort on back-navigation.** Losing a scroll position
  in a 200-lead list is a small tragedy repeated forty times a day.
- **Row click targets are the whole row**, but a row with inline actions needs those actions
  to stop propagation — and to be ≥44px on touch.
- **Empty, filtered-empty and error are three different states** with three different
  messages. "No leads yet, add your first" ≠ "No leads match *Pune + this week*" ≠ "Couldn't
  load leads."
- **Show the count and the filter state** always. A list that might be filtered and does not
  say so causes people to distrust the data.

### Mobile specifics

- Respect `env(safe-area-inset-*)` on every fixed element. Test with the iOS home indicator.
- **Long-press gives haptic feedback** (`navigator.vibrate(10)` where supported) plus a
  visual pulse. A long-press with no acknowledgement feels broken.
- **Pull-to-refresh on primary lists**, and it must not fight the canvas pan gesture.
- **The keyboard must never cover the field being typed into** — scroll the focused input into
  view above the keyboard on `focus`.
- **Bottom sheets are drag-dismissible** with a visible grabber, and snap to sensible heights.

### Domain-specific craft

- **Every number carries its provenance chip** (N7) — but it is quiet: muted, small, adjacent.
  Available when scrutinised, invisible when scanning.
- **Money never renders while stale.** If the design changed and the quote has not recomputed,
  the figure is visibly provisional. A confidently-wrong price is the worst thing this product
  can do.
- **Structure-bearing outputs carry the engineer disclaimer**, always, without exception.
- **Units follow the user's preference — except procurement quantities**, which stay metric
  because Indian suppliers sell by the metre.

---

## 13. Definition of done

A screen ships when **all** are true:

- [ ] Works at 375px and at 1536px, no horizontal scroll at either
- [ ] Loading, empty, error and offline states exist
- [ ] Keyboard-operable end to end; focus visible and ordered
- [ ] axe clean; contrast verified against token pairs
- [ ] Touch targets ≥44px; no hover-only meaning
- [ ] Light and dark both correct
- [ ] Every number carries its provenance
- [ ] Destructive actions confirmed and undoable
- [ ] Zero raw hex, zero off-scale spacing, zero inline styles
- [ ] Real data at realistic volume — a 40-line BOM, a 200-lead list, a 221-panel design.
      Designs die at volume, not in mockups.
