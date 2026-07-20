# HelioGrid — working notes for Claude Code

Solar EPC SaaS for the Indian market. Residential rooftop **and** C&I, both high volume.
v1 scope is **Sell**: CRM → survey → design → quote → proposal → close.

## Read before writing UI

**`docs/DESIGN-SYSTEM.md` is binding.** Read it before building any screen. It contains the
non-negotiables, the locked brand, the token contract, the touch/mobile contract and the
definition of done. When it and your instincts disagree, it wins.

Live reference: **`/design`** — open it to see every token rendered. If you add a token,
add it there too, or nobody can verify it looks right.

## The three rules people break most

1. **No raw values.** No hex, no arbitrary px, no inline `style={{}}`. Everything comes from
   `src/design/tokens.css` via Tailwind utilities. If the value you want does not exist, add
   it to tokens.css with a verified contrast ratio — do not inline it.
2. **Brass fills carry an INK label.** `bg-accent text-on-accent`. White on brass is 3.09:1
   and fails AA. The accent **brightens** on hover (`hover:bg-accent-hover`); darkening it
   drags the label toward failing.
3. **`text-accent` does not exist — use `text-accent-text`.** Brass at full chroma is 2.96:1
   as type. `accent` is a FILL and GRAPHIC colour only.

## Styling architecture

```
src/design/tokens.css   ← the ONLY file allowed to contain raw values
src/design/index.css    ← Tailwind wiring + @theme mapping + scoped base
src/app/design/page.tsx ← living reference at /design
docs/DESIGN-SYSTEM.md   ← the rules and the reasoning
```

**Cascade layers are load-bearing.** Order is `legacy, theme, base, components, utilities`.
The legacy Solar Studio stylesheet is imported into `layer(legacy)` from `index.css`. It
contains bare-element resets (`button { background: none }`) and, while it sat unlayered, it
silently overrode every Tailwind utility — a `bg-accent` button rendered with no fill.
Do not import `theme.css` directly from `layout.tsx` again.

**Tailwind preflight is deliberately NOT imported.** We pull in `tailwindcss/theme.css` and
`tailwindcss/utilities.css` only, so the utility API exists without a global reset that would
restyle the legacy screens. When the last legacy screen is replaced, swap those imports for
`@import "tailwindcss";` and delete `src/features/solar-studio/theme.css`.

**New screens opt in** by being wrapped in `.ds` (AppShell does this). Legacy screens are
untouched until replaced.

**Theme tokens use `@theme`, not `@theme inline`.** `inline` resolves `var()` at build time
and bakes the light value into every utility, so dark mode silently stops working for
utilities while the page background still flips. Verified the hard way.

## Domain rules that outrank design

- **Structural safety is engineer-led.** The app never computes wind load or roof capacity as
  a guarantee. The disclaimer travels with every structure-bearing output.
- **Every user-visible number carries a provenance tier** — measured / derived / estimated /
  assumed. The BOM and the quote are commercial documents.
- **Money never renders while stale.** If the design changed and the quote has not recomputed,
  the figure must read as provisional.
- **Units follow the user's m/ft preference — except procurement quantities**, which stay
  metric because Indian suppliers sell by the metre.
- **Canonical `Project` model is the only engineering source of truth.** Visual meshes never
  are. The one-frame gate (`lib/__tests__/one-frame.test.ts`) enforces that the scene and the
  model agree.

## Engineering practice

- **Use Edit/Write for all file changes.** Never sed/perl/python to mutate source — it has
  corrupted files in this repo before.
- **Verify in the browser, not just in tests.** Several real bugs here (the discount vanishing
  on reload, the unit selector resetting, the levitating tree) passed the entire suite.
- **Restart the dev server before believing a blank screen.** Stale HMR after many edits
  produces blank studio routes that a clean restart fixes — do not "fix" working code.
- Suite: `npx vitest run` · types: `npx tsc --noEmit` · both must be green before commit.
- Push to `main` directly; not in production yet.
