# New step after Step 6: "Structure & BOM"

Date: 2026-10-07. Status: **built** (parts 1–4), verified in the browser on a copy of the project.

## Status — what shipped and what changed from this plan

- Parts 1–4 are in `main`. Step numbers live in `lib/steps.ts`; saved projects carry
  `stepsVersion` and an older save's 7/8/9 is moved on load.
- **Not done, on purpose:** the per-line unit list stays the full list. The BOM row
  tests encode that a line may change unit family (cable by metre or by coil), so
  narrowing it would remove a valid choice, not a mistake.
- **Moved out of Step 6 and not repeated there:** module show / ghost / hide. It only
  served structure inspection, which is now Step 7's.
- **Part 5 (ResLink new BOM lines) is not built** — the owner asked for no new features
  in this change.
- The BOM view keeps the table full width (a side column would make its eleven
  columns scroll sideways): a sticky section bar with filters, one quote strip, one
  attention card, and the steel cut list under Mechanical BOS.
- Design canvas: https://claude.ai/artifact/7s6BqPSremEF1rnqFWYuN3

## 1. What is wrong today (seen live on `/wizard/6` and `/wizard/9`)

1. **Structure is edited in two places in Step 6, and they do not match.**
   - Plan view: select a table → "Table…" → "Table settings" sheet
     (`screens/Step6Editor.tsx:2556-3254`).
   - 3D view: click a panel → "Edit table" → small card
     (`three/StructEditPanel.tsx`, mounted at `three/Scene3D.tsx:4831-4847`).
   - The sheet saves through the ops kernel (`ops.runMany`). The card and
     `MmsConfiguration` save with a raw `patchProject(p, true)`. So undo labels
     and history differ for the same change.
2. **The 3D card is too small for the job.** It is 340 px wide. Its content is
   1107 px tall in a 650 px box. It mixes four jobs in one scroll: component
   inspect, panel sun yield, module show/ghost/hide, and structure design.
3. **"Inspect component" is a dropdown of ~300 raw items**
   ("front leg · 0", "rafter purlin · 17", "panel clamp mid · 27"…). Nobody can use it.
4. **The price table is only in Step 9, but the Proposal is Step 7.**
   `/proposal` already prints the Step 9 total. So the customer quote can go out
   before anyone has looked at the price. (Also ResLink gap register, BOM verdict.)
5. **Steel shows two numbers with no reason given.** The Table sheet says
   `312.332 kg` (three decimals). Step 9 says `324.79 kg`. The difference is the 4 %
   waste, but neither screen says so.
6. **Faint option text in the Table sheet.** Unselected options (Flush,
   Walk-under, East-west, Landscape, 10 mm, 20 mm) are almost invisible. This is a
   contrast failure.
7. **Every BOM line offers every unit.** Steel can be set to "day" or "panel-set".
   `UNIT_OPTIONS` (`lib/bom/registry.ts:207`) is one global list.
8. **Steel is one lump line** ("Structure Steel — C-Channel, 324.79 kg"). The member
   model already knows each leg, rafter, purlin and brace with its length. A
   fabricator needs that cut list, not one weight.
9. **"Generate MMS" / "Existing structure"** gives no hint what it does or what changes.
10. The Table sheet opens while the table chip and the "Table A1" card are still on
    top of it for about one second (overlap flash).

## 2. The rule that splits Step 6 from the new step

- **Step 6 = where the panels go and which way they face.** Layout only.
- **New step = what holds them up and what it all costs.** Structure + BOM + price.

| Control | Today | After |
|---|---|---|
| Add/move/delete panels, tables, rows, columns, duplicate | Step 6 | Step 6 |
| Racking kind (flush / fixed tilt / east-west / tracker) | Step 6 sheet | Step 6 (it changes the layout and the energy) |
| Tilt, azimuth, orientation, module gap, row pitch / GCR | Step 6 sheet + 3D card | Step 6 only. New step shows tilt read-only with a "Change in Step 6" link |
| Tracker rotation limit | Step 6 sheet | Step 6 |
| Structure preset (Flush 0.3 m / Std / Walk-under 2.2 m) — as a **height** choice | Step 6 sheet + 3D card | New step |
| Clearance / height, leg spacing | Step 6 sheet + 3D card | New step |
| Structure profile (C-Channel, RHS, CHS…) | Step 6 sheet + 3D card | New step |
| Foundation (PCC pedestal, chemical anchor, ballast, pile) + shape | Step 6 sheet + 3D card | New step |
| Customize MMS (purlins/row, rafter density, end overhang, bracing) | 3D card | New step |
| Edit legs (2D) — `LegPlanEditor` | 3D card | New step |
| `MmsConfiguration` — Basic / Advanced / Engineering tabs, Generate / Remove MMS, validation | Step 6 sheet + 3D card | New step |
| Member model readout (legs, rafters, purlins, braces, kg), disclaimer | Step 6 sheet | New step |
| Inspect component (member/joint details) | 3D card dropdown | New step, by clicking the member in 3D or from a grouped list |
| Panel sun yield, module show/ghost/hide | 3D card | Step 6 (not structure) |
| Inverter, battery, boxes, walkways, rails, arrester placement, wiring | Step 6 | Step 6 |
| Full BOM table, margin, discount, GST, CSV, custom lines, re-sync, DISCOM checklist | Step 9 | New step |

The "walk-under" preset also sets a tilt today. In the new step it sets **height
only**. Tilt stays a Step 6 decision. One control, one home.

## 3. The new step — what the user sees

One step, two views, switched by tabs at the top: **Structure** and **Bill of materials**.

### View 1 — Structure (3D left, wide panel right)

- **Left: 3D scene in a new "structure" mode.** Tables and structure members are
  clickable. Nothing else is: no table chip (+row/+col), no placing, no wiring, no
  Delete key. Click a table → it is selected. Click a member or a joint → the panel
  shows that component.
- **Right panel, top: table list.** Every table with its size, kWp, structure type,
  profile, foundation and a status dot (OK / warning / error from `validateMms`).
  Checkboxes + "Select all". **Every change applies to all checked tables.** Today
  a 40-table C&I roof means 40 trips through a small card.
- **Right panel, sections (one per job, in build order):**
  1. Structure type and height (Flush / Elevated / Walk-under + clearance)
  2. Profile (with the section drawing and kg/m)
  3. Foundation (type + shape + the roof-load note)
  4. Frame details (purlins/row, rafter density, end overhang, bracing, leg spacing)
  5. Legs — opens the 2D leg editor in a large dialog, not inside the card
  6. Mounting system (MMS) — the Basic / Advanced tabs
  7. Engineering — wind, terrain, seismic, roof capacity (`mmsEngineering`)
  8. Checks — `validateMms` findings, each one clicks to the table/member in 3D
  9. Live take-off for the selection: members by type with count, length and kg;
     net kg **and** order kg (with waste %) side by side, so the two numbers explain
     each other.
- The engineer disclaimer stays on every structure output (CLAUDE.md domain rule).

### View 2 — Bill of materials (full width)

- The whole current Step 9 screen moves here unchanged first: summary strip,
  margin, discount, GST, banners (freshness, orphan, below-cost, engineer,
  preliminary), sections, row edits, re-sync, CSV, custom lines, DISCOM checklist.
- Added on top:
  - **Structure cut list** under Mechanical BOS: member type, profile, count, cut
    length, total m, kg. The steel line stays the priced line; the cut list explains it.
  - Unit dropdown limited to the units that make sense for that line.
  - Steel and weights rounded for people (1 decimal kg, 2 decimal m).

## 4. New step order

| # | Step | Was |
|---|---|---|
| 1–6 | Setup … Manual Edit | same |
| **7** | **Structure & BOM** | new (absorbs old Step 9) |
| 8 | Proposal | 7 |
| 9 | SLD & Drawings | 8 |
| 10 | Final | 10 |

Still 10 steps. The price is now set **before** the proposal.

## 5. Every place the renumber touches (nothing missed)

**Shell and routing**
- `screens/Wizard.tsx`: `STEP_NAMES` `:22-33`, `STEP_HELP` `:40-108`, Cmd+Z
  ownership `step === 2 || step === 6` `:189` (add 7), dark background steps
  `2/3/6` `:229` (add 7), `switch` `:232-243`.
- `router.ts:46-49` and `src/app/(studio)/wizard/[step]/page.tsx` clamp 1..10 (unchanged count, check only).

**Gate** — `lib/wizard-gate.ts`
- `nextBlocker`: add a case for step 7 (block Next only on MMS **errors**, not warnings).
- `stepGate` loop and the `allowedStep === 10` meaning stay; re-check the order.

**Saved projects** — `project.wizardStep`
- Add a migration in `lib/persistence/normalize.ts`: old 7 → 8, old 8 → 9,
  old 9 → 7. Without it, the Dashboard "resume" link (`Dashboard.tsx:108`) opens the wrong step.
- Fix the "1..10" comment at `types.ts:1324`.

**Hard-coded links**
- `Step5AutoDesign.tsx:50` → 6 (no change)
- `Step8Sld.tsx:314` → 6 (no change; the file moves to step 9)
- `Step10Done.tsx:64` → 9 becomes 7
- `Dashboard.tsx:304` "Show 3D" → 6; `:305` "BOM & Pricing" → 9 becomes 7
- `ProposalView.tsx:164` → 7 becomes 8
- `EnergyReportSheet.tsx:294` → 7 becomes 8
- `Step7Proposal.tsx:258` (`it.step !== 7`) and `:262` → 8
- `lib/review.ts`: BOM targets `:110,121` → 7; capture targets `:139,147,154` → 8

**Text that says a step number**
- `ProposalView.tsx:118,324` ("Step 7" → 8), `:580` ("Step 8" → 9)
- `Step9Bom/index.tsx:389` ("Step 8" → 9)
- `Step8Sld.tsx`, `CableScheduleSheet.tsx`, `lib/bom/emitters/electrical.ts`,
  `battery.ts`, `lib/insights/analyzers-access.ts`, `lib/auto-design.ts`,
  `Step6Editor.tsx` say "Step 6" or "Step 2" — no change, but re-read each.
- `docs/*.md` that name `/wizard/N`.

**File names** — rename screens by job, not number, so the next insert does not
repeat this: `Step9Bom/` → `StructureBom/`, `Step7Proposal` → `ProposalStep`,
`Step8Sld` → `DrawingsStep`. Update imports in tests
(`BomRow.dom.test.tsx`, `DiscountField.dom.test.tsx`, `axe.dom.test.tsx:15,83`).

**Tests that assert step numbers**
- `lib/__tests__/wizard-gate.test.ts:34,37,44,58-70`
- `lib/__tests__/step-help.test.ts:9,26`
- `lib/__tests__/finance.test.ts:32` (test name)

## 6. What leaves Step 6 (and what replaces it)

- **Table settings sheet:** remove preset, profile, member model, leg
  spacing/clearance/anchoring, `MmsConfiguration`. Keep racking kind, tilt,
  tracker limit, pitch/GCR, orientation, gap, azimuth, delete rows/cols,
  duplicate, delete. Add one summary line: "Structure: Std · C-Channel · PCC
  pedestal — Edit in Step 7 →" that opens Step 7 with that table selected.
- **3D card:** remove presets, profiles, foundation, shape, clearance, Customize MMS,
  Edit legs, `MmsConfiguration`, the component dropdown. Keep panel yield and
  module show/ghost/hide. Same summary line + link.
- Clicking a steel member in Step 6 3D: opens Step 7 with that member selected
  (today it opens the card).
- Energy report sheet in Step 6 shows ₹ cost from the BOM. Keep it, but mark it
  "provisional — price set in Step 7" until the user has visited Step 7.

## 7. One way to save

- All structure edits in Step 7 go through the ops kernel (`lib/ops/layout-ops.ts`),
  including the ones that use `patchProject` today (`applyStructChoice`,
  `configureMms`, `clearMms`, leg plan edits, `mmsEngineering`).
- Result: one undo entry per change, with a real label ("Change foundation on 4 tables").
- Note: `applyStructChoice` and `configureMms` also rewrite `panels`
  (re-pose + `reconcileBridgedPanels`). That stays. It is why tilt must not be
  edited in two places.

## 8. Things that must keep working

- Proposal captures key on `layoutFp`, which includes structure
  (`lib/fingerprints.ts:103-150`). Structure now comes before the proposal, so the
  captures are taken after it. Good — check that nothing goes stale on arrival.
- "Money never renders while stale" — the freshness banner and "provisional"
  total move with the BOM view.
- Every number keeps its provenance tier (measured / derived / estimated / assumed).
- Procurement quantities stay metric.
- The one-frame gate (`lib/__tests__/one-frame.test.ts`) stays green — the structure
  mode only changes what is clickable, not what is drawn.
- Step 9 (drawings) Structure tab and Cable Schedule stay read-only; add a
  "Edit in Step 7" link.
- Step 10 installation sheet reads `mergedBom` — no change.
- Share viewer (`readOnly projectOverride`) — no change.

## 9. Build order (each part ends green and verified in the browser)

1. **Plumbing.** Insert the step, renumber, migrate `wizardStep`, fix every link and
   text in section 5, move the Step 9 screen in as the BOM view. App works end to
   end in the new order.
2. **Structure view.** Scene3D `mode="structure"`, table list with multi-select, the
   nine sections, one save path, grouped component inspect.
3. **Empty Step 6.** Remove the moved controls, add the summary lines and links.
4. **Fix what we saw.** Items 5–10 in section 1 (steel numbers, faint text, units,
   cut list, MMS wording, overlap flash).
5. **ResLink structure gaps that belong here** (`docs/RESLINK-GAP-REPORT.md`
   BOM register): #11 splice plates and end caps, #12 fasteners by joint size
   (M8 clamp / M12 leg-rafter / M10 rafter-purlin), #16 MMS assumptions and
   structure waste % editable (`structureWastePct` is declared and read by nothing).

Gates after each part: `npx tsc --noEmit` · `npx vitest run` (with
`set -o pipefail`) · `npm run cycles` · `npm run lint` · `npm run dead`.
