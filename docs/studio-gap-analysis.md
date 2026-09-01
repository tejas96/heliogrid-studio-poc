# 3D Design Studio — competitor gap analysis

**Date:** 2026-09-01 · **Scope:** the design studio only (`src/features/solar-studio/`).
**Question answered:** where are we behind, missing, or half-built — not what we did well.

Evidence is from two places: the competitors' own pricing pages (what they gate to a paid
tier tells you what they think is valuable), and our own code (`grep` counts, file paths,
and the honest limits our own source comments already admit).

---

## 1 · Who we measured against

| Product | Market | Price | What they gate behind the paid tier |
|---|---|---|---|
| **ARKA 360** (the "solar arc 360") | India + 25 countries, resi + C&I | Lite ₹7,500/mo · Basic ₹11,500/mo · Premium ₹16,500/mo (+GST). US: $159–$999/mo | **Premium only:** SLD export · design with optimisers · **manual stringing** · **3D model export to SketchUp and PVsyst** · API. **Basic only:** micro-inverter design. Battery modelling + AI-assisted modelling + CAD export sit on the US Premium tier. CRM is a paid add-on on every tier. |
| **Reslink Energy** | India-only, EPC, mobile-first | 4 tiers by capacity cap: 100 kW → 500 kW → 5 MW → 100 MW. Pricing shown as ₹10,000–₹15,000/mo (India toggle) or $2,000–$10,000/yr (intl. toggle) — the page shows both, treat as indicative | **Tier 2:** detailed structure analysis · advanced shadow analysis · detailed energy reports · **standard obstructions** · design location editing. **Tier 3:** **industrial drawings** · ground-mount design · advanced structures · **all obstruction types**. **Tier 4:** white-label · custom integrations · SLA. |
| **Aurora Solar** | US, the design benchmark | Basic $135–159/user/mo · Premium $220–259 · Enterprise custom | **Premium:** **LIDAR-assisted modelling** · **bankable shade reports** · **battery storage modelling** (backup / self-consumption / arbitrage) · **AI site models** · **AI obstruction detection**. **Enterprise:** plan sets + engineering stamps · API · webhooks · SSO · teams. |
| **HelioScope** | US/global C&I engineering | ~$189–$319/mo | 3D, SLDs, auto CAD export, 45,000-component library, shade reports to 5 MW, PVsyst-grade models, carports + ground mounts. |
| **Scanifly** | US, drone-first | ~$150–450/user/mo + drone labour | Photogrammetry 3D at 1–3" accuracy, LiDAR-enabled shading, field-ops mobile app. No financials, no CRM. |
| **OpenSolar** | Global, **free** | ₹0 | Full 3D + shading + proposals + **battery, battery retrofit, EV, heat pump** modelling + hardware ordering + CRM — all free. |
| **SolarEdge Designer** | Global, free | ₹0 | AI roof detection, auto-stringing, DNV-GL-validated simulation within 1% of PVsyst — but SolarEdge hardware only, and **no SLD, no wire sizing, no carport, no tracker, no P75/P90**. |

**The read:** the paid tiers everywhere are converging on the same five things —
**LIDAR/AI modelling, battery, bankable shade numbers, industrial/commercial drawings,
and API/white-label.** We are short on all five.

---

## 2 · P0 — the eight gaps that actually cost us deals

### G1 · No battery / storage design at all
`grep -rli battery` → **0 files**. Same for `BESS`, `hybrid`, `self-consumption`.

Aurora gates battery modelling to Premium ($220/user/mo). ARKA advertises "Advanced Battery
Modelling". OpenSolar gives it away free. Storage now attaches to >40% of US residential
installs; India is following with hybrid inverters and DG replacement in C&I.

We cannot quote a hybrid system. Not the inverter, not the pack, not the backup load panel,
not the BOM lines, not the savings. A customer who asks "and battery?" ends the demo.

### G2 · Shading is 288 samples/year, not 8,760 hours — and our own code says the answer is optimistic
`lib/shading.ts` states its own limits in the file header. Verbatim from our source:

- *"POWER IS LINEAR IN UNSHADED AREA … partial-shade losses are OPTIMISTIC."* No bypass-diode
  cliff, no string mismatch.
- *"3 sample points along module depth ⇒ partial shade resolves to ~1/3 of a module."*
- *"288 sun samples/year … is a quadrature of the real integral, not the real integral."*
- *"Beam only"*, trees are bounding cylinders, structure members excluded.

Aurora runs **all 8,760 hours**, NREL-validated, 2–3% error, with **sub-module shading**, and
sells the result as a **bankable shade report**. Reslink claims hour-by-hour across twelve
months and 3–5% first-year accuracy. HelioScope uses PVsyst models directly.

For a residential sale our number is fine. For a C&I job where a bank or a CFO reads the
report, it is not defensible. **This is the single biggest credibility gap.**

### G3 · Neighbour buildings do not cast shadows
Our 3D scene shows neighbour buildings as **decoration only** — deliberately excluded from
the shading engine (`audit R6`). To make a neighbour shade the roof, the designer must
manually re-place it as a "building" obstruction in Step 3, guessing its height.

Reslink explicitly models "surrounding structures". Aurora and Scanifly get them free from
LIDAR/photogrammetry. In an Indian city where the next building is 3 m away and 4 storeys
tall, this is the shading question — and we make the user answer it by hand.

### G4 · The studio is still a desktop CAD tool — the touch-first rewrite was never built
`docs/build-plan.md` marks **Phase 10 as ⛔ NOT BEING DESIGNED (D39)**. The census file says
of the 2D canvas: *"PINCH-ZOOM and two-finger pan — the original lacks these, add them"*, and
lists keyboard shortcuts and Shift-modifiers throughout (ortho-snap, 15° rotate, Esc-to-cancel,
arrow-key orbit, +/− zoom, numbered view presets).

Reslink's entire wedge is *"the world's first mobile-first 3D solar PV design platform"* —
full 3D design, shadow sim, ALMM check, BOM and proposal **in under 10 minutes from a phone,
on the roof**. That is exactly the Indian EPC's job to be done, and today we cannot do it.

### G5 · Only four roof types — no industrial profiles
`types.ts:131` → `RoofType = 'rcc_flat' | 'metal_shed' | 'tile' | 'ground'`, plus gable / hip /
skeleton footprint shapes.

Missing (all confirmed 0 hits in code): **north-light / sawtooth**, **curved / arched AC-sheet
shed**, **dormer**, **mansard / gambrel**, **multi-pitch industrial**, **parapet curves**.

Reslink advertises **"100+ roof profiles"** — *"flat, gable, hip, multi-face, dormer and
industrial profiles"*, *"parapets, curves, and pitch variations"* — and gates industrial
drawings to its 5 MW tier. Half our declared v1 scope is C&I, and Indian factories are
overwhelmingly north-light and curved sheds. We currently model them as a flat "metal shed".

### G6 · Obstructions are 100% manual — no AI detection
We have AI **roof** detection (Google `dataLayers` DSM + Gemini fallback, 9 files under
`lib/roof-ai/`). We have **no AI obstruction detection**. All 11 obstruction types are
hand-placed, hand-sized, hand-rotated, and each has a four-level-deep bridging settings chain.

Aurora gates **AI-assisted obstruction detection** to Premium. ARKA sells "AI-optimized
designs within 5 mins". This is the slowest step in our wizard and the one AI most obviously
removes.

### G7 · No consumption model — only a monthly bill number
`load profile: 0` · `time-of-use: 0` · `self-consumption: 0` · `8760: 0`.

We take one figure: ₹/month. Everyone else models an hourly load curve against hourly
generation. Without it we cannot size a battery, cannot answer C&I self-consumption vs export,
cannot use ToU/slab tariffs, and cannot model peak shaving. It is the missing input that
blocks G1.

### G8 · A panel or inverter not in the catalog is a dead end
`screens/Step4Components.tsx:778` — *"or enter specs manually · upload datasheet (PDF
extraction) — **mocked in POC**"*.

Both escape hatches are labels only. If the EPC's actual panel isn't in `data/panels.ts`,
they cannot design. HelioScope ships 45,000 components; Aurora and ARKA both ship a component
database plus manual entry.

---

## 3 · P1 — what we lose the comparison on

| # | Gap | Evidence | Who sells it |
|---|---|---|---|
| G9 | **No OPEX / PPA proposal output.** `lib/financing.ts` computes cash/loan/lease/PPA, but the header says *"the proposal financing page … deferred"* and *"terms are representative — a real deployment wires actual lender/PPA offers"*. | `lib/financing.ts:1–7` | Reslink generates **both CAPEX and OPEX proposals from one design**. ARKA integrates real loan products (fetch products, calculate payments, submit applications). |
| G10 | **No approval/permit pack.** We produce SLD + PV layout + string route + structure sheets. We do not produce a **CEIG / electrical-inspector submission set**, a **DISCOM net-metering application pack**, or a stamped plan set. `plan-set` appears in 1 file. | `screens/Step8Sld.tsx` | Aurora gates **plan sets + engineering stamps** to Enterprise. ARKA sells **Permit & PE Stamp services**. Reslink ships DISCOM-accepted layout + string drawings and gates "industrial drawings" to tier 3. |
| G11 | **Export/import is thin.** We export SVG · PNG · DXF · CSV · print-PDF. Missing: **PVsyst export**, **SketchUp export**, **DWG**, a **PDF plan set**. No imports at all — no DXF-in, no KML/KMZ/GeoJSON, no drone mesh. | `sketchup: 0` · `kml: 0` · `lib/export-dxf.ts` | **ARKA charges ₹16,500/mo (Premium) specifically for SketchUp + PVsyst export.** HelioScope ships auto CAD export. |
| G12 | **No P50 / P75 / P90.** Nothing in code. We publish one annual number with a PVGIS-vs-estimate provenance label — honest, but not bankable. | `grep P90 → 0` | Commercial EPC proposals need P75/P90 for financing. SolarEdge Designer is criticised for exactly this lack. |
| G13 | **No carport, canopy, or shed-over-parking.** `carport: 0`. | — | HelioScope and the 2026 tool set ship carport templates with column shading and bay-level layout. Growing fast in Indian C&I. |
| G14 | **No fast path — no "quick quote" mode.** Ten linear steps with a hard electrical gate before the proposal. | `screens/Wizard.tsx` | ARKA: *"AI-optimized designs within 5 mins"*, *"proposals under 5 minutes"*. Reslink: *"under 10 minutes from a phone"*. A rep on a call cannot use our studio. |
| G15 | **No DG-set / genset interaction.** `genset\|diesel\|DG: 0`. | — | Nobody automates this well yet — but every Indian C&I site has a DG, and solar-DG sync is a real design constraint. **This is an opening, not just a gap.** |
| G16 | **No API, no webhooks, no white-label.** | `grep webhook/sso → 0` | ARKA gates API to Premium. Aurora gates API + webhooks + SSO to Enterprise. Reslink gates white-label + custom integrations to its top tier. This is how they hold enterprise accounts. |

---

## 4 · P2 — later, but on the map

| # | Gap | Note |
|---|---|---|
| G17 | Trackers (`tracker: 0`) | Ground-mount C&I only. HelioScope has it; SolarEdge Designer doesn't. |
| G18 | EV charger + heat-pump electrification story | OpenSolar models *"solar, batteries, battery retrofits, EVs and heat pumps"* in one before/after view. Depends on G7. |
| G19 | Drone / photogrammetry mesh import | Scanifly's whole business (1–3" accuracy). Our D35 rule says survey photos are *reference, not measurement* — a deliberate choice, but revisit once mesh import is cheap. |
| G20 | Real utility rate engine (ToU, slabs, demand charges) | We ship `data/discoms.ts` but a flat tariff. Aurora ships a full utility rate database. Depends on G7. |
| G21 | Premium imagery (Nearmap / EagleView) | Aurora ships all three. Not available in India — low priority. We already surface Google imagery **date and quality**, which is the actual Indian problem. |
| G22 | Post-install monitoring | `monitor: 0`. Outside studio scope, but it's how competitors keep the account. |

---

## 5 · Half-built / mocked — the honest list

| Item | Where | State |
|---|---|---|
| Manual panel spec entry + datasheet PDF extraction | `screens/Step4Components.tsx:778` | **Label only — "mocked in POC"** |
| Real lender / PPA products in financing | `lib/financing.ts:1–7` | Math done, **draw half deferred**, terms are representative |
| Windmill 3D asset reference dims | `three/ObstructionMesh.tsx:598` | `// placeholder — updated after regeneration` |
| Ladder obstruction | census 10.4 | Ships with a **BETA** marker |
| Google Solar Building Insights | `docs/build-plan.md:383` | Only a **cross-check line** ("Google estimates N panels"), not a design input |
| Tutorial video | `screens/Step1Setup.tsx:43` | Placeholder box |
| Structure = material estimate only | `lib/structure.ts`, census 10.6 | **Deliberate** (engineer-led rule) — but Reslink sells "Detailed Structure Analysis" at tier 2 and "Advanced Structures" at tier 3. We compete on honesty, not on the word. No wind/uplift/roof-capacity check by design. |

---

## 6 · The simplicity gaps (you asked for "very very simple")

Every one of these is where our own studio is *harder* than a competitor's, independent of
features:

1. **No one-tap design.** Address → finished draft design should be a single action. Today
   it is: locate → detect → accept ghosts → set pitch/azimuth/parapet → place 11 obstruction
   types by hand → pick panel → pick capacity → pick inverter → auto-fill → string → validate.
2. **The bridging settings chain is four levels deep** (blocks placement → may bridge above →
   must remain open to sky → clearance above). Correct engineering, punishing UI.
3. **The BOM is ~286 controls in one 11-column table** (census 10.10 says so outright).
4. **Keyboard shortcuts and modifier keys** where a phone needs visible mode buttons.
5. **A hard electrical gate blocks the next step** with no "I just need a ballpark" escape.
6. **No design templates or reusable presets** beyond the three structure presets.

---

## 7 · What to do first — recommended order

The ranking below weighs *how often it kills a deal* against *how much it costs to build*.

| Order | Work | Why first |
|---|---|---|
| **1** | **Touch-first 2D canvas** (pinch-zoom, two-finger pan, tap-then-big-handles, mode buttons) | Cheapest of the P0s, unblocks the mobile-on-the-roof story that Reslink is winning on, and every later feature inherits it. |
| **2** | **Battery + load profile** (G1 + G7 together — G7 is the input G1 needs) | The most common "and battery?" demo-killer. OpenSolar gives it away free, so it is now table stakes, not a differentiator. |
| **3** | **Shading fidelity: 8,760 hours + bypass-diode/mismatch + neighbour shadows** (G2 + G3) | Fixes the one place our own source says the answer is *optimistic*. Required before any C&I or bank-facing claim. Unlocks P75/P90 (G12) and a bankable shade report. |
| **4** | **Industrial roof profiles** — north-light, curved shed, sawtooth, dormer (G5) | Half our v1 scope is C&I and Indian factories are these shapes. Reslink gates this to its top tier; matching it opens the C&I market. |
| **5** | **AI obstruction detection** (G6) + **quick-quote mode** (G14) | Together these are the "5-minute design" every competitor advertises. Both ride on the roof-AI pipeline we already have. |
| **6** | **Catalog escape hatches** (G8) + **PVsyst/SketchUp export** (G11) | Small, cheap, and each one removes a hard stop. ARKA charges ₹16,500/mo for the exports alone. |
| **7** | **DISCOM / CEIG approval pack** (G10) + **OPEX/PPA proposal** (G9) | The India-specific moat. Nobody outside India builds these, and Reslink is the only one who does them well. |

---

## 8 · Where we are genuinely ahead (keep, don't rebuild)

Short list, only so we don't accidentally trade it away:

- **Provenance on every number** (measured / derived / estimated / assumed) — nobody else does this.
- **Money never renders while stale** — the BOM reconciliation, stale notices and orphan handling.
- **All 11 obstruction types free** — Reslink gates obstruction types by tier.
- **SLD + manual stringing free** — ARKA charges Premium (₹16,500/mo) for both.
- **Structure member model with a real steel bill** (legs/rafters/purlins/braces, kg) + the
  honest "not a safety verdict" disclaimer and human engineer sign-off.
- **Indian compliance already in the box** — PM Surya Ghar, ALMM/DCR, GST, DISCOM checklist,
  IS/IEC 62548/CEA + NEC 690 standard selection, sanctioned-load net-metering check.

---

## Sources

- [ARKA 360 — India pricing](https://www.arka360.com/pricing-in) · [ARKA 360 — US pricing](https://www.arka360.com/pricing) · [ARKA 360 — product](https://www.arka360.com/)
- [Reslink Energy — pricing](https://www.reslink.org/pricing/) · [Reslink — product](https://www.reslink.org/) · [Reslink — the 3D shift in solar EPCs](https://www.reslink.org/blogs/design-first-visit-once-the-3d-shift-in-solar-epcs/)
- [Aurora Solar — pricing](https://aurorasolar.com/pricing/)
- [Scanifly — PV design](https://scanifly.com/product/pv-design/)
- [OpenSolar Pro](https://www.opensolar.com/pro/)
- [SolarEdge Designer review 2026 — SurgePV](https://www.surgepv.com/reviews/solaredge)
- [HelioScope vs SolarEdge Designer](https://sourceforge.net/software/compare/HelioScope-vs-SolarEdge-Designer/)
- [Best solar design software 2026 — SPOTIO](https://spotio.com/blog/solar-design-software/)
