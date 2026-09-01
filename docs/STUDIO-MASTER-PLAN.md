# Studio Master Plan — the complete design package

> **This file is the source of truth for the 3D Design Studio.**
> `product-journey.md` says what a screen shows. `build-plan.md` says what to build this week.
> **This file says what "finished" means, and it outranks both.**
>
> Scope: the studio only — site → design → structure → electrical → simulation → BOM → drawings
> → commercials → handover. CRM, marketing and field ops are elsewhere.
>
> **Audited:** 2026-09-01, against the full PVsyst 8 capability set (40 capabilities) plus the
> procurement, structural and drawing layers PVsyst does **not** cover. 12 parallel code audits,
> each independently re-verified against source. 310 findings. Every claim below cites a real
> file or a real grep.

---

## 0 · How to read this file

**Work is organised by STATION.** A station is one stop in the studio. You implement one station
at a time, top to bottom, and the product stays shippable throughout.

Every work item has a **stable ID** (`S6-04`, `E1-02`, `M-17`, `B-33`, `D-09`). Use the ID in
commits, branches and prompts. IDs never get reused.

| Mark | Means |
|---|---|
| 🔴 | **Blocker.** An EPC owner walks to a competitor because of this. |
| 🟠 | **Major.** We lose the comparison but not the meeting. |
| 🟡 | **Minor.** Polish, or correctness that nobody sees yet. |
| S / M / L / XL | Effort: days / 1-2 weeks / 3-6 weeks / a quarter |
| ✅ | Built and correct today |
| ◐ | Half built, or built but wrong |
| ✗ | Does not exist |

**One rule above all others:** a station is not done until its numbers survive an engineer
reading them. We already have the honesty discipline (provenance tiers, stale-money gates,
engineer sign-off). Every item below must inherit it.

---

## 1 · The verdict

### 1.1 Against PVsyst — all 40 capabilities

| # | PVsyst capability | Us | Evidence |
|---|---|---|---|
| 1 | Project / site definition (lat, lon, **altitude**, **timezone**, horizon) | ◐ | `LatLng` is lat/lng only; no altitude, no timezone, no horizon anywhere |
| 2 | Meteo databases, import, synthetic generation | ◐ | One hardcoded PVGIS `MRcalc` call → 24 numbers. No import, no second source |
| 3 | Irradiation — GHI/DHI/BHI, **albedo**, POA, transposition, clear-sky | ◐ | `grep -ri albedo src` → **0**. Diffuse is a flat orientation-neutral 35% |
| 4 | Orientation & tilt optimisation, unlimited orientations, trackers | ✗ | Flat-roof tilt is the literal constant `10`, azimuth `180`. No optimiser, no trackers |
| 5 | PV array design | ◐ | One panel model per project. No sub-arrays, no heterogeneous arrays |
| 6 | Inverter selection & sizing (DC/AC, MPPT window, **clipping**, IV curves) | ◐ | MPPT window ✅. Clipping is a warning with **zero** effect on energy |
| 7 | String / electrical configuration | ◐ | Autostring ✅ but a module can be wired into two strings and still pass the gate |
| 8 | **Far shading** (horizon profile) | ✗ | No horizon profile exists |
| 9 | Near shading (3D scene) | ◐ | Real raycasting ✅ — but neighbour buildings cast **nothing** |
| 10 | Shadow animation | ◐ | Hour scrub ✅. No seasonal sweep, no exportable shade study |
| 11 | **Electrical shading** (bypass diodes, mismatch) | ✗ | `shading.ts` header: *"partial-shade losses are OPTIMISTIC"* |
| 12 | Module-level layout | ✅ | Genuinely good — cell-indexed lattice, per-module access |
| 13 | Loss diagram | ◐ | A flat bar list of 5 constants that no design decision can move |
| 14 | Temperature losses (thermal model) | ✗ | Hardcoded **8.1%** for every site in India. No cell-temp model |
| 15 | IAM (incidence angle modifier) | ✗ | Absent from the loss chain |
| 16 | DC ohmic losses | ◐ | Hardcoded **2.0%** — although the app routes real cable and computes real drop |
| 17 | AC + transformer losses | ✗ | Loss chain stops at the inverter DC input. No AC loss, no transformer |
| 18 | Inverter loss model | ◐ | One datasheet efficiency number. No curve, no threshold, no night standby |
| 19 | **Battery / BESS** | ✗ | `grep -ri battery src` → **0 files** |
| 20 | Self-consumption + load profiles | ✗ | Consumption is one number: `monthlyBillInr` |
| 21 | Grid injection limit / curtailment | ✗ | `grep -ri curtail src` → **0** |
| 22 | Standalone / off-grid | ✗ | On-grid only |
| 23 | Solar pumping | ✗ | — |
| 24 | DC-grid systems | ✗ | — |
| 25 | **Hourly + sub-hourly (8760) simulation** | ✗ | `grep -r 8760 src` → **0**. The engine is 12 monthly multiplications |
| 26 | Monthly / annual energy | ◐ | Monthly bar charts. No numeric monthly table anywhere |
| 27 | PR, specific yield, **P50/P75/P90** | ◐ | PR is non-standard, never temperature-corrected. P-values → **0** |
| 28 | Economic analysis | ◐ | Simple payback only. No IRR, NPV, LCOE, discount rate, O&M or cashflow |
| 29 | Component database | ◐ | **15 modules, 12 inverters, 8 steel sections.** 0 batteries, 0 cables, 0 clamps |
| 30 | Weather DB management | ✗ | One source, no versioning, fetched weather never expires |
| 31 | Measured vs simulated | ✗ | No path from a commissioned plant back into the model |
| 32 | Graphs & tables | ◐ | Charts ✅, numeric tables mostly ✗ |
| 33 | Electrical engineering tools (mismatch, partial shading, heterogeneous) | ✗ | — |
| 34 | Preliminary / pre-sizing mode | ✗ | Ten linear steps with a hard electrical gate. No quick path |
| 35 | Professional reports | ◐ | Sales proposal ✅. No engineering report, no calc sheets |
| 36 | Simulation variants + comparison | ◐ | Component matrix ✅ — but it assumes **unshaded** panels |
| 37 | Scenario / optimisation studies | ✗ | — |
| 38 | PVsystCLI (batch / scripting) | ✗ | No headless service, no batch |
| 39 | Import / export interop | ◐ | Out: DXF, CSV, SVG, PNG. **In: nothing at all** |
| 40 | Large-scale plant modelling | ✗ | AI capped at 8 roofs / 40 m radius / 150 m site. Brute-force raycasting |

**Score: 1 full ✅ out of 40.** We are ahead of PVsyst on exactly one thing it does — module-level
layout — and behind on the physics that makes its answers bankable.

### 1.2 Beyond PVsyst — the layers we promised to own

This is where HelioGrid is supposed to win, because PVsyst does none of it.

| Layer | Us | The honest state |
|---|---|---|
| Procurement BOM / BOQ | ◐ | ~50 line keys. A real Indian BOQ is ~250. No glands, lugs, ferrules, ties, nuts, washers, screws, cement, sand, trays, bends |
| BOS automation | ◐ | Cable + protection derive correctly. Containment, earthing detail, monitoring: absent |
| SLD authoring | ✅ | Live-derived, shares sizing functions with the BOM. Genuinely good |
| Cable schedule | ✗ | Every route is modelled in 3D and nothing enumerates it |
| Engineering drawings | ◐ | 4 sheet types of ~20. No PDF set, no revision block, no title block |
| Structural drawings / calcs | ✗ | Policy-excluded. No wind load, no member sizing, no fabrication output |
| Equipment schedules | ✗ | — |
| Permit / statutory packs | ✗ | No CEIG, no DISCOM net-meter pack, no PM Surya Ghar pack |
| MMS coverage | ◐ | **3 racking kinds** cover ~4 of ~35 real Indian MMS families |
| 3D realism | ◐ | Correct PBR base, ACES tone mapping. No HDRI, no post-processing, no terrain, fabricated neighbours |
| Platform | ✗ | One browser's `localStorage`. No backend, no accounts, no API |

### 1.3 The five sentences that matter

1. **The energy engine is not a simulation.** It is `capacityKwp × monthlyGHI × fixed PR`, twelve
   times. Every bankable number — clipping, self-consumption, P90, battery dispatch, ToU capture —
   is an hourly phenomenon that this shape cannot express.
2. **The shading engine's own header says its answer is optimistic**, and neighbour buildings —
   the single biggest shading source on an Indian rooftop — cast nothing at all.
3. **The BOM is a good skeleton missing its flesh.** The derivation architecture (LineKey,
   provenance, waste, override-merge, money reconciliation) is genuinely excellent. It is
   deriving about a fifth of the items a storekeeper needs.
4. **We support 3 mounting structures.** An EPC that does tin sheds, tile roofs, carports or
   ground mount on sloping land cannot use this tool for the job in front of them.
5. **There is no product without a backend.** Every design lives in one browser. A share link
   only opens on the device that made it.

---

## 2 · What "100%" means

Written as acceptance criteria. If we cannot demonstrate these, we are not done.

**D1 · The five-minute residential design.** Address + a phone photo of the last bill → a
complete, accurate, priced, drawn, quotable 5 kW design. Under five minutes. Under ten taps.

**D2 · The one-hour C&I design.** A 500 kW factory with a north-light shed, a curved shed, a
DG set and a 1.5 acre ground mount → a full design package. Under one hour.

**D3 · Nothing is asked that can be derived.** Every input the software could compute is
computed, shown with its provenance, and editable. The user reviews; they do not author.

**D4 · The number survives a lender.** 8760 hourly simulation, real loss chain, P50/P75/P90 with
a stated uncertainty budget, validated against PVsyst within 3%.

**D5 · The storekeeper needs nothing else.** The BOQ is complete to the last washer, HSN-coded,
vendor-split, pack-rounded, lead-timed. Purchase orders come out of it directly.

**D6 · The site crew needs nothing else.** Dimensioned setting-out plans, module numbering,
cable schedule, member cut list with mark numbers, foundation coordinates, connection details.

**D7 · The inspector needs nothing else.** CEIG pack, DISCOM net-meter pack, earthing and
lightning calcs, load calcs, ALMM/DCR certificate, all on stamped, revision-controlled sheets.

**D8 · Every MMS an Indian EPC builds is buildable here.** All 35 families in §6.

**D9 · The 3D is the proposal.** Photoreal enough that the render sells the job, and
dimensionally exact enough that the render *is* the drawing.

**D10 · The design is never wrong about itself.** Model and scene agree, always. The one-frame
gate already enforces this — extend it, never weaken it.

---

## 3 · The target studio — 13 stations

Today: **10 linear steps**, strictly forward, one hard electrical gate, a phantom step 5.

Target: **13 stations, but almost nobody visits them.**

```
                    ┌──────────────── THE EXPRESS LANE ────────────────┐
                    │                                                   │
  S0 Intake ────────┴──> S1 Site Capture ──> [ AUTO ] ──> S12 Issue ────┘
                              │                  │
                              │                  ├─ S2  Site Truth        review
                              │                  ├─ S3  Intent            review
                              │                  ├─ S4  Auto-Design       review
                              │                  ├─ S5  Array & Layout    review
                              │                  ├─ S6  Structure & MMS   review
                              │                  ├─ S7  Electrical & BOS  review
                              │                  ├─ S8  Simulation        review
                              │                  ├─ S9  BOM & Procurement review
                              │                  ├─ S10 Drawings & Docs   review
                              │                  └─ S11 Commercials       review
                              │
                              └──> every station has a computed answer before it is opened
```

**The contract: every station opens already answered.** A station is a place to *disagree with
the software*, never a place to author from scratch. That is what "less control, more work"
means, expressed as architecture.

### 3.1 Mapping to today's screens

Backward-compat is a standing rule (CLAUDE.md) — nothing gets orphaned.

| Station | Today's screen | Change |
|---|---|---|
| S0 Intake | `Step1Setup.tsx` | Gains consumption/load capture; loses everything derivable |
| S1 Site Capture | `Step2Roof.tsx` + `Step3Obstructions.tsx` | Becomes one automatic run |
| S2 Site Truth | (new — review surface over S1) | The **only** genuinely manual gate |
| S3 Intent | (new) | Absorbs the sizing questions scattered across Steps 1 and 4 |
| S4 Auto-Design | `Step5` (the phantom) becomes real | Variant generation + ranking |
| S5 Array & Layout | `Step6Editor.tsx` | Stays; becomes review-first |
| S6 Structure & MMS | `three/StructEditPanel.tsx` | Promoted from a panel to a station |
| S7 Electrical & BOS | `Step4Components.tsx` + routing/stringing in Step 6 | Merged, auto-first |
| S8 Simulation | `EnergyReportSheet.tsx` | Promoted to a station |
| S9 BOM | `Step9Bom/` | Stays, explodes in item count |
| S10 Drawings | `Step8Sld.tsx` | Stays, explodes in sheet count |
| S11 Commercials | finance inside `Step7Proposal` / `ProposalView` | Promoted to a station |
| S12 Issue | `Step10Done.tsx` | Gains freeze, approvals, handover |

---

## 4 · The station worklist

---

### S0 · Intake

> Who is the customer, where is the site, and what do they use?

**Today** — `screens/Step1Setup.tsx` (760 lines). Name, customer, phone, state, DISCOM, site
type, connection type, sanctioned load, ground-mount flag, logo, `monthlyBillInr`,
`tariffInrPerKwh`. State is a **hard gate**. Consumption is one number, used once, in a one-line
sizing hint (`suggestKwpFromBill`, `lib/solar.ts:248`).

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S0-01** | **Hourly load profile — 4 ingestion paths.** (a) CSV/XLSX smart-meter or energy-audit upload; (b) 12-month bill entry (kWh + max demand + PF) fitted to a segment archetype; (c) typical curves by segment — 1BHK/3BHK/villa, school, hospital, hotel, cold storage, textile mill, IT office, 1/2/3-shift factory — scaled to annual kWh; (d) sanctioned load × diversity factor as last resort. Stamp every profile with its provenance tier. This is the input that unblocks battery, self-consumption, ToU, peak shaving and DG offset. | 🔴 | XL |
| **S0-02** | **Bill OCR.** Photograph the DISCOM bill → consumer number, sanctioned load, connection type, tariff category, 12 months of kWh, max demand, PF. Removes almost every field on this screen. | 🟠 | L |
| **S0-03** | **Derive the state, DISCOM and tariff from the pin.** Today State is a hard gate that blocks the whole wizard; the lat/lng already answers it. | 🟠 | S |
| **S0-04** | **Site altitude + timezone** on `SiteLocation`. Altitude changes air mass, cell temperature and design temperatures; today `LatLng` is lat/lng only and every design temperature is a 5-row latitude table stamped `assumed`. | 🟠 | S |
| **S0-05** | **Existing-generation and DG capture** — connected DG kVA, running hours, diesel ₹/L, existing solar kWp. The DG-offset business case is the strongest C&I pitch in India and we do not know the set exists. | 🟠 | M |
| **S0-06** | **Company defaults / templates.** Preferred panel, inverter, MMS family, price book, approved makes, T&C, margin. Every project starts from an empty struct today. | 🟠 | M |
| **S0-07** | **Consumption provenance on the proposal.** A savings number built on an archetype curve must say so. | 🟡 | S |

**Done when:** a rep photographs a bill and taps once, and S0 is complete with every field
carrying an honest provenance tier.

---

### S1 · Site Capture

> Address in → complete, accurate 3D site out. No drawing.

**Today** — `Step2Roof.tsx` (3260 lines) + `Step3Obstructions.tsx` (1103 lines).
`lib/roof-ai/` (9 files) does real work: Google `dataLayers` DSM plane fitting with a Gemini
vision fallback. But: **hard-capped at 8 roof surfaces, a 40 m request radius and a 150 m site
extent**; the AI never produces a multi-plane pitched roof (a gable returns one tilted plane
with a "review by hand" warning); imported roofs are always stamped `rcc_flat`; DSM obstructions
are always type `other`; the Gemini prompt **explicitly excludes neighbouring buildings**;
Step 3 has no AI path at all. The oblique site-photo detector exists on the server with no
client caller — a dead capability.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S1-01** | **Lift the C&I caps.** 8 roofs → unbounded; 40 m radius and 150 m extent → derived from the parcel. Today a factory cannot be detected at all. Needs tiled DSM fetch + a work queue. | 🔴 | L |
| **S1-02** | **Multi-plane pitched-roof detection.** Segment the DSM into planes, fit a roof skeleton, emit a face group. `lib/skeleton-wavefront.ts` already does straight-skeleton work — feed it detected ridges instead of only hand-drawn footprints. | 🔴 | XL |
| **S1-03** | **Terrain.** DEM/DTM import (SRTM 30 m, Google Elevation, or surveyed spot levels), contours, ground slope. Today every building and every ground array sits on a perfectly flat `y=0`. This blocks accurate ground mount, accurate shading and accurate site drawings. | 🔴 | XL |
| **S1-04** | **Neighbour buildings as real geometry.** Detect surrounding building footprints and heights from the DSM and import them as **shade-casting** objects. Today the 3D neighbours are *fabricated random boxes seeded from the latitude* and the engine ignores them entirely. On an Indian street this is *the* shading question. | 🔴 | L |
| **S1-05** | **Far-shading horizon profile.** Build a 360° horizon from the DEM; allow a fisheye/panorama photo capture on site; allow manual entry. Nothing beyond the 250 m raycast cut is visible to the model today. | 🔴 | M |
| **S1-06** | **Roof covering detection.** RCC vs metal sheet vs tile drives the **entire** mechanical BOM, and every AI-imported roof is stamped `rcc_flat`. Detect it from imagery colour/texture + Gemini. | 🟠 | M |
| **S1-07** | **Sheet profile + purlin direction detection** for metal sheds: trapezoidal / standing-seam / corrugated / curved, rib pitch, purlin spacing and **direction**. Standoff counts today assume rails always cross the purlins. | 🟠 | M |
| **S1-08** | **AI obstruction detection in Step 3.** All 11 types, polygon footprints, real heights. Today Step 3 has no AI button at all, DSM obstructions are always `other`, and Gemini recognises 8 of 11 kinds. This is the slowest step in the wizard. | 🔴 | L |
| **S1-09** | **Import paths — the whole set.** DXF/DWG underlay, KML/KMZ, GeoJSON, shapefile, total-station points, drone photogrammetry mesh, LiDAR point cloud. Today: **zero imports of any kind.** | 🔴 | XL |
| **S1-10** | **Parapet detail** — per-edge height, coping, railing, and automatic detection. One height for the whole roof today. | 🟠 | M |
| **S1-11** | **Polygon obstructions.** Rectangle or circle only today. | 🟠 | M |
| **S1-12** | **Roof solids that are real** — eave overhang, deck thickness, chajja/sunshade. Every roof is the footprint extruded straight to the ground. | 🟡 | M |
| **S1-13** | **Courtyard / atrium / light-well cut-outs.** A roof footprint is a single ring; a hole is unrepresentable. | 🟡 | M |
| **S1-14** | **Wire up the oblique site-photo detector** — built on the server, no client caller. | 🟡 | S |
| **S1-15** | **One-shot capture.** Address → detect → align → accept → finish, as a single automatic run with a progress rail. Today all four are separate manual triggers. | 🔴 | M |
| **S1-16** | **Persist imagery vintage + quality onto the imported geometry** — shown during review, then discarded. | 🟡 | S |
| **S1-17** | **Roof shapes beyond a single plane per face.** `surfaceHeightAt` is one linear plane, and `FACE_GROUP_SHARED_KEYS = ['pitchDeg','heightM']` pushes both to every sibling — so **mansard, gambrel, butterfly and dormers are unrepresentable** (`grep -ri 'mansard\|gambrel\|dormer\|butterfly'` → 0). Multi-pitch *across separate roofs* does work today; multi-pitch *within one footprint* does not. | 🟠 | L |
| **S1-18** | **Industrial roof profiles** — north-light / sawtooth, curved / arched AC-sheet shed, monitor roof. `grep -ri 'north light\|sawtooth\|curved'` → 0. Indian factories are overwhelmingly these shapes and half our v1 scope is C&I; today we model them as a flat "metal shed". | 🔴 | XL |

**Done when:** paste an address for a Pune factory and get roofs, coverings, sheet profiles,
obstructions, neighbours, terrain and horizon, with per-entity provenance, with no drawing.

---

### S2 · Site Truth

> The one screen where a human is genuinely required.

**Today** — folded into Steps 2 and 3 as scattered "accept the ghost" affordances.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S2-01** | **A single review surface.** Every detected entity with its confidence, side by side with imagery. Accept-all, or fix the three the AI got wrong. | 🔴 | M |
| **S2-02** | **Confidence-ranked fix queue.** Sort by what most changes the answer, not by draw order. | 🟠 | M |
| **S2-03** | **Provenance visible in 3D.** Assumed geometry must not render as confidently as measured geometry. | 🟡 | S |
| **S2-04** | **Field verification mode.** On the roof, on a phone: tap an entity, confirm or correct it, capture a photo as evidence against it. | 🟠 | L |
| **S2-05** | **Measured-dimension override** with a tape/total-station reading, which promotes the entity's provenance tier to `measured`. | 🟠 | M |

**Done when:** a designer can accept an entire detected site in one tap and knows exactly what
they accepted.

---

### S3 · Intent

> What does the customer actually want? Asked once, in their language.

**Today** — does not exist. The questions are scattered: capacity in Step 4, ground-mount in
Step 1, nothing at all for backup or export.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S3-01** | **The intent object** — goal (bill offset % / budget / max roof / target kWp), backup requirement (hours × critical load), export policy (net / gross / zero-export), DG-offset target, phasing. One place, plain language. | 🔴 | M |
| **S3-02** | **Export / metering policy per state.** Net vs gross, capacity caps against sanctioned load, banking and settlement rules. Today `data/discoms.ts` is a tariff table with a self-declared "MOCK REPRESENTATIVE" label and no policy layer. | 🔴 | L |
| **S3-03** | **Ownership structure** — CAPEX, OPEX/RESCO, PPA, captive, group-captive, open-access. Today `lib/financing.ts` amortises four modes off four global constants. | 🟠 | L |
| **S3-04** | **Subsidy scheme selection** — PM Surya Ghar residential slabs ✅ today, but no GHS/RWA slab, no state top-ups, no PM-KUSUM/agri, no effective-from date. | 🟠 | M |

**Done when:** the auto-designer has everything it needs and never has to guess intent.

---

### S4 · Auto-Design

> The engine proposes; the human disposes.

**Today** — `lib/auto-design.ts` (282 lines) ranks roof faces by real solar access × orientation
yield and fills them. That part is good. What is missing is everything around it: there is
**zero** tilt, azimuth, orientation or row-pitch optimisation; flat-roof tilt is the literal
constant `10` and azimuth `180`; there are no design variants; `lib/comparison.ts` compares
components on an explicitly **unshaded** hypothetical layout; "Duplicate" makes an orphan
project, not a variant.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S4-01** | **Tilt / azimuth / row-pitch optimiser.** Sweep the design space against real shading and real cost, report the yield-vs-cost frontier. The single biggest "less control, more work" miss in the product. | 🔴 | L |
| **S4-02** | **Variant generation.** Produce N candidate designs from one site — max-yield, max-capacity, best-payback, lowest-capex, best-₹/kWh — each fully simulated, ranked, and openable. | 🔴 | L |
| **S4-03** | **Variants as first-class objects.** `parentProjectId`, `variantLabel`, side-by-side compare, promote-to-primary. Today `project-duplicate.ts` returns a detached clone with no lineage. | 🔴 | M |
| **S4-04** | **Comparison against the REAL layout.** The component matrix currently assumes unshaded panels, so it can recommend the wrong panel on a shaded roof. | 🟠 | M |
| **S4-05** | **MMS family selection is automatic.** Roof covering + pitch + parapet + wind zone + access → the right family, chosen and justified. | 🔴 | M |
| **S4-06** | **Inverter topology selection is automatic.** String vs central vs micro vs optimiser, from orientation count, shading severity and capacity. | 🟠 | M |
| **S4-07** | **The one-tap path.** S0 → S1 → *Design it* → S12. Automation exists today but is buried five gated screens deep. | 🔴 | L |
| **S4-08** | **Design templates and presets** beyond the three structure presets. | 🟠 | M |

**Done when:** the studio produces five fully-simulated, priced, drawn designs before the
designer has opened a single editor.

---

### S5 · Array & Layout

> Review the placement. Fix the three modules that are wrong.

**Today** — `Step6Editor.tsx` (3511 lines). Genuinely strong: cell-indexed lattice, segments,
keepout-aware fill, per-module enable, direct drag, one-frame gate. Weaknesses are in *what the
layout can express*, not in the editor.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S5-01** | **Sub-arrays / heterogeneous arrays.** One panel model and one inverter model per project today. A real C&I job mixes both. | 🔴 | XL |
| **S5-02** | **True east-west (`dual_tilt`).** It is a label with no geometry: modules never flip azimuth and the structure is knowingly wrong. Alternate row parity must flip azimuth 180°, rows pair back-to-back on a shared apex, row pitch collapses to the module gap. Pin it with a `dual-tilt.test.ts`. | 🔴 | M |
| **S5-03** | **Per-face energy breakdown.** A multi-face roof returns one blended number. | 🟠 | M |
| **S5-04** | **Direct manipulation in 3D** — gizmos, drag, snapping, live dimension readouts. Today all editing is 2D-only. | 🟠 | L |
| **S5-05** | **Touch model on the two heaviest screens.** Pinch-zoom, two-finger pan, tap-then-big-handles, visible mode buttons instead of keyboard modifiers. The mobile-on-the-roof story depends on it. | 🔴 | L |
| **S5-06** | **Undo everywhere, and surviving reload.** The store has undo; it is unreachable on 7 of 10 steps. | 🟠 | M |
| **S5-07** | **Module numbering scheme** — stable marks that the layout sheet, the string sheet, the BOM and the site all share. | 🟠 | M |

---

### S6 · Structure & MMS

> Every mounting structure an Indian EPC builds. Promoted from a side panel to a station.

**Today** — `lib/structure.ts` (1078 lines) is the parametric owner of a real member/node graph
with deterministic structural ids, real steel tonnage, real fastener counts, foundations and
rendered hardware. **The architecture is excellent.** The coverage is not: `RackingSpec` has
**three** kinds (`flush`, `fixed_tilt`, `dual_tilt`) covering ~4 of ~35 real families. Pitched
roofs get **no member model at all** — they fall back to a per-panel price guess. Steel catalog
is 8 sections with no structural properties. `IS 875` is a state→speed lookup used only as a
display flag.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S6-01** | **MMS family as a first-class, versioned entity.** `mmsFamilyId` on the segment resolving to a record that declares: topology builder, allowed surfaces, allowed foundations, member kinds, node/hardware kinds, 3D assets, drawing template, BOM emitter. Refactor `buildStructure`/`buildMonorail` behind one `StructureBuilder` interface, registering the existing two first so golden snapshots hold. Make `MemberKind` and `NodeKind` family-declared, not closed unions. **Every later family then inherits determinism, DRC, DXF, drawings and BOM for free.** This is the keystone item of the whole station. | 🔴 | XL |
| **S6-02** | **Pitched-roof member model.** Decompose runs in the *roof plane* via `surfaceHeightAt`; emit rails along module rows and anchor nodes at rail × rafter/purlin intersections. Add a `RafterSet` to `Roof` (spacing, direction, offset, provenance) so anchor count stops being "~4, assumed". Tile, sheet and sloped-RCC then all reduce to different anchor node kinds on one rail model. | 🔴 | L |
| **S6-03** | **Sheet-attachment variants.** `sheetProfile: trapezoidal \| standing_seam \| corrugated \| curved` with rib/seam pitch, and a matching node kind per type (seam clamp, crown clamp + washer, hook + L-key, curved saddle). **Standing seam emits zero penetrations and zero sealing washers — that must reach the BOM, the DRC and the proposal as a selling point.** Rail-less and mini-rail become attachment variants. | 🔴 | L |
| **S6-04** | **Tile hook differentiation** — interlocking / flat / Mangalore / slate, with tile pitch and batten spacing, hooks derived at rail × rafter, flashing per real penetration, and breakage as its own line. | 🟠 | M |
| **S6-05** | **Carport / canopy family** — single post, double post, cantilever, T-shape, back-to-back. Column grid driven by the parking module, main beams, secondary purlins, gutter + downpipe, clearance height, isolated RCC footings. **Members extend beyond the module envelope, so they must enter `buildShadowCasters`** — today the shading engine explicitly assumes structure never shades. | 🔴 | XL |
| **S6-06** | **Trackers** — HSAT, tilted single-axis, dual-axis, with backtracking. Torque tube, bearing housings at post pitch, drive bay, per-timestep rotation from solar position with a rotation limit. Backtracking must feed the shading engine. | 🔴 | XL |
| **S6-07** | **Ground mount on real terrain.** Sample the DEM under each leg station; leg base Z from terrain, module plane stays planar per table. Emit per-pier embedment/reveal, a pile-length schedule bucketed to orderable lengths, cut/fill volumes, and a table-step rule past a level limit. Row pitch recomputes against the along-slope component. | 🔴 | L |
| **S6-08** | **Elevated / high-clearance frame** — column grid at an independent bay pitch, primary beams, secondary rafters, explicit two-way bracing, and **no 3 m clearance cap**. Gains the mandatory walkway + handrail package. | 🟠 | L |
| **S6-09** | **Wind-derived ballast.** IS 875-3 pressure with corner/edge/field zoning over the roof polygon; emit ballast **mass** per node, not a count. Render the zoning as a heat overlay. Today: one fixed-size block per leg. | 🔴 | L |
| **S6-10** | **Structural engineering layer, staged.** *Phase 1:* IS 875-3 wind (basic speed → k1/k2/k3 → design pressure) with roof zoning, IS 875-1/2 dead + live, IS 1893 seismic; member forces by tributary area. *Phase 2:* section properties + yield on `StructureProfile`, then bending/axial/combined and deflection to IS 800, plus anchor pull-out and shear. *Phase 3:* size foundations from uplift and overturning so pedestal and ballast dimensions stop being constants. The member graph already carries real geometry, sections and joints, so this is **additive**. | 🔴 | XL |
| **S6-11** | **Change what the disclaimer disclaims.** Keep it forever, but move from *"we compute nothing"* to *"we compute, we show our working, a licensed engineer signs"*. Add a calculation report (loads, combinations, utilisations, anchor checks, code clauses cited). Extend `structuralVerification` from a two-state flag to a per-output sign-off record — engineer, licence, design revision, signature, **auto-expiry when the design fingerprint moves.** That is a stronger liability position than today's, because it is auditable. | 🟠 | L |
| **S6-12** | **Solve spans instead of asking for them.** Leg spacing, rafter density and purlin count are user knobs with no span logic — the tool buys material without knowing whether it spans. Invert: solve from the governing load case, section and deflection limit; show utilisation live; keep the material allowance as a visibly separate control. | 🟠 | L |
| **S6-13** | **Foundation registry** — open `FoundationKind` with per-kind geometry rules and soil inputs (bearing capacity, class, water table, pull-out test), so embedment is derived, not constant. Add `screw_pile`, `precast_block`, and a `seasonal_tilt` variant (slotted rear leg, 2-3 pinned positions) whose tilt positions **feed the energy model** so the gain is quotable. | 🟠 | M |
| **S6-14** | **Steel catalog with real properties.** 8 fixed sections → user-editable catalog keyed by id, with Ixx, Iyy, Zxx, ry, yield strength and thickness variants. Add a site **corrosion class** (ISO 9223 C1–C5 from distance-to-coast and industrial proximity) driving the coating spec per project — today a coastal C5-M site is priced with the same HDG 80 µm as an inland one. | 🟠 | M |
| **S6-15** | **Module-frame interface data.** `frameThicknessMm`, clamp-zone ranges along both edges, `maxDesignLoadPa` front and rear, and `weightKg` required. Frame thickness selects the clamp part; the clamp zone positions the purlins (today purlins sit at the module edges by construction, which may fall **outside the certified zone** and void warranty); `maxDesignLoadPa` becomes the acceptance criterion once wind pressure exists. | 🟠 | M |
| **S6-16** | **Fix the roof dead-load check.** It counts foundation concrete only — the steel and the modules never reach it, so the figure given to the building owner is materially low. Sum all three, report total **and kg/m²** over the array footprint, broken out by contribution. | 🟠 | S |
| **S6-17** | **Fabrication output** — member schedule with mark numbers grouped by cut length for nesting, bolt/hardware schedule by node kind, foundation schedule with setting-out coordinates, GA drawing with a real grid and dimension chains, typical connection details per joint kind. Marks derive from the existing structural ids so drawing, BOM and site all name the same piece. | 🟠 | L |
| **S6-18** | **Parapet-mounted and walkway-integrated mounting.** The parapet is only a shading/keepout object today. | 🟡 | M |
| **S6-19** | **Floating / canal-top / BIPV / wall / pole families.** Pole mount ships first (simplest); floating needs a water-body surface, float grid, mooring layout and water-level range; wall/facade needs a 90° module plane feeding POA. | 🟠 | XL |
| **S6-20** | **Accessory members** — wind deflectors tied to the ballast calc, rail end caps, cable-management clips. Cheap once `MemberKind` is family-declared. | 🟡 | S |

**Done when:** §6's family matrix is all ✅, and every family renders, draws, DRCs and bills
through the same graph.

---

### S7 · Electrical & BOS

> Strings, inverters, protection, routing, earthing, monitoring — all derived.

**Today** — genuinely the strongest engineering area. `lib/electrical/` autostrings with a real
MPPT window and real temperature coefficients; `electrical-sizing.ts` sizes AC cable against
ampacity **and** voltage drop at 70 °C; the SLD shares its sizing functions with the BOM so the
two documents cannot disagree; `data/rules/india.ts` is a proper rule config with fuse ladders,
breaker ladders, ampacity and resistance tables. Then it stops short.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S7-01** | **Fix the double-string defect.** A module can be wired into two strings and the design still passes the electrical gate. | 🔴 | S |
| **S7-02** | **Fix the degraded stringing shim.** Step 8 and the comparison matrix string the array through a shim that discards roofs, MLPE and every refusal — so the SLD can describe a design the editor would reject. | 🔴 | M |
| **S7-03** | **Fix home-run routing.** Every string routes to inverter placement `[0]` regardless of which inverter it belongs to, so DC lengths and drops are wrong on any multi-inverter job. | 🔴 | M |
| **S7-04** | **Size DC cable by voltage drop.** The drop check hard-codes 4 mm² at 20 °C while the AC path correctly uses 70 °C. | 🟠 | M |
| **S7-05** | **Full `InverterSpec`.** 9 fields today; a real datasheet has ~30 — max DC power, per-MPPT Isc and current limits, startup voltage, MPPT window per input, efficiency curve, Euro/CEC efficiency, night consumption, reactive capability. | 🔴 | M |
| **S7-06** | **Hybrid / battery / off-grid inverters.** The catalog is on-grid only and `InverterSpec` cannot describe a hybrid. | 🔴 | L |
| **S7-07** | **Microinverters and 1500 V systems.** Whole product classes unsupported. | 🟠 | L |
| **S7-08** | **Transformer and MV/HV.** The AC model is hard-coded to 415 V / 230 V, so no plant above LT can be designed. | 🔴 | L |
| **S7-09** | **Grid export limit / zero-export controller** — and its curtailment loss in the energy model. | 🔴 | M |
| **S7-10** | **DG interlock and solar-DG sync.** Every Indian C&I site has a diesel set; the tool does not know it exists. Interlock contactor, changeover, controller, reverse-power relay, and the resulting equipment schedule. | 🔴 | M |
| **S7-11** | **Cable / conductor schedule.** Every routed cable is modelled in 3D and nothing enumerates it. From/to, size, cores, material, armour, length, drop %, containment. This is exactly where we must exceed PVsyst. | 🔴 | M |
| **S7-12** | **Protection coordination** — fault current, breaking capacity, selectivity, RCD/earth-fault device sizing. | 🟠 | L |
| **S7-13** | **Earthing and LPS as a design**, not fixed counts. Electrode count from IS 3043 resistance targets and soil resistivity; LPS from an IS/IEC 62305 risk assessment; a real bonding network over the member graph. | 🟠 | L |
| **S7-14** | **Combiner boxes with location, output sizing and a feeder.** Today an even fan-out with none of the three. | 🟠 | M |
| **S7-15** | **Monitoring and metering design** — datalogger, RS485/Modbus routing, gateway, SIM/router, CTs, MFM, export meter, and WMS sensors above the MNRE threshold. Today: one "Net Meter + Generation Meter" BOM line. | 🟠 | M |
| **S7-16** | **Reactive power, PF and harmonics** so CEA grid-compliance statements can be produced. | 🟠 | M |
| **S7-17** | **Per-inverter DC loading check.** Inverter 0 fills first and the imbalance is never reported. | 🟠 | M |
| **S7-18** | **Manual stringing guards at authoring time** — MPPT window, parallel limit, orientation and capacity. Today the refusal only arrives at the gate. | 🟠 | M |
| **S7-19** | **Auto-string on entry, not on a buried button.** The gate names the one-click fix and then refuses to offer it as a click. | 🔴 | S |
| **S7-20** | **Design temperatures from real weather**, not a 5-row latitude table stamped `assumed` with altitude ignored. | 🟠 | S |
| **S7-21** | **Pmax coefficient on every catalog module.** Not one module carries one, so every string minimum length is an assumption. | 🟠 | S |

---

### S8 · Simulation

> The number a lender will read. Promoted from a sheet to a station.

**Today** — `lib/solar.ts` `computeEnergyReport` is `capacityKwp × monthlyGHI × Π(1−lᵢ) ×
poaShaded`, twelve times. The multiplicative composition is correct and the provenance labelling
is honest. Everything else in this station is missing. `lib/shading.ts` does real raycasting
against real casters — and its own header says the answer is **optimistic**.

> **This station is the deepest hole in the product, and it gates §D4, batteries, ToU,
> clipping, P90 and every C&I sale.** Sequence it as one project, not as scattered items.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S8-01** | **The 8760 core.** Replace `SiteWeather` with a time-series-first model: PVGIS `seriescalc` hourly (G(h), Gb(n), Gd(h), T2m, WS10m), persisted per site as compressed typed arrays in IndexedDB — *not* in the `Project` JSON. Keep the monthly aggregation as a derived view so nothing downstream breaks on day one. Rewrite `computeEnergyReport` as an hourly loop. Add a 15-minute interpolation path for clipping and BESS. **This single change unblocks about twelve other items.** | 🔴 | XL |
| **S8-02** | **Transposition model.** Perez or Hay-Davies, plus the **ground-reflected term** `Ir = GHI × albedo × (1−cos β)/2`. Add `albedoMonthly[12]` to `SiteLocation` (default 0.20) with a ground-type picker — concrete 0.25-0.30, dry soil 0.20, grass 0.20, white membrane 0.55-0.70, sand 0.35 — and monsoon-wet overrides. Today diffuse is orientation-neutral, so **tilt does not change the diffuse 30-50%** of the resource. | 🔴 | L |
| **S8-03** | **Bifacial.** Two bifacial SKUs are sold from the catalog today and earn **identical energy to monofacial**, while costing more in the BOM — the software argues against the product the EPC is selling. Add `bifacialityFactor` to `PanelSpec`, rear POA from view-factor integration over ground albedo given height, tilt and GCR, minus a rack-shading derate. | 🔴 | L |
| **S8-04** | **Cell temperature model.** Faiman U0/Uv (or Sandia) from ambient temperature and wind speed — both of which arrive free with S8-01. Today temperature loss is the hardcoded constant **8.1%** for every site in India. | 🔴 | L |
| **S8-05** | **Module performance model.** One-diode (Rs, Rsh, Iph, I0, n) or the IEC 61853 low-light matrix, so irradiance-level efficiency and low-light behaviour are real. Today energy is `kWp × irradiation`. | 🔴 | XL |
| **S8-06** | **Inverter model.** Efficiency curve vs load and voltage, MPPT threshold, **clipping at AC**, night standby consumption. Today one datasheet number, and DC/AC ratio is a warning with zero effect on predicted energy. | 🔴 | L |
| **S8-07** | **Electrical shading.** Bypass-diode step losses and string mismatch, with sub-module (cell-string) shading resolution. Today power is linear in unshaded area, sampled at 3 points along module depth only, and the array **mean** access is applied — so shading is smeared and no string is ever the limiter. Three modes, as PVsyst does: linear / by module string / detailed electrical. | 🔴 | XL |
| **S8-08** | **Shading at 8760 with spatial acceleration.** 288 samples/year today, brute-force raycast, `raycaster.far = 250 m`. Needs a BVH and a shading-factor table cached per (module, sun position) so a C&I site is tractable. | 🔴 | L |
| **S8-09** | **Diffuse and albedo shading factors** — sky view factor per module. Beam-only today. | 🟠 | L |
| **S8-10** | **Every real caster casts.** Neighbour buildings (S1-04), structure members, safety rails, lightning masts, walkways, wall inverters — all visible in the 3D scrub, all invisible to the engine. Trees are bounding cylinders to the engine and trunk-plus-spheres in the view, with no canopy transmissivity. **The scrub and the numbers must agree; that is the product's core honesty claim.** | 🔴 | L |
| **S8-11** | **IAM + spectral correction.** Front-glass reflection at glancing incidence is missing entirely from the loss chain. | 🟠 | M |
| **S8-12** | **Real DC and AC ohmic losses.** DC is a flat 2.0% although the app routes real cable and computes real drop; the AC side has **no loss at all** — no cable, no transformer, no auxiliary/night consumption, no availability factor. | 🟠 | M |
| **S8-13** | **Soiling with Indian seasonality.** Flat 3.0% for the whole country today, in the dustiest major solar market on earth. Dust zone, monsoon washing, cleaning-cycle model. | 🟠 | M |
| **S8-14** | **Degradation done properly.** Flat 0.75%/yr global constant today — a catalog field with a year-1 LID step, linked to the module's own warranty curve. Every module currently produces an identical 25-year curve and an identical IRR. | 🟠 | S |
| **S8-15** | **P50 / P75 / P90 with a stated uncertainty budget** — interannual variability (already computed from PVGIS and thrown away), model uncertainty, soiling, availability, degradation. | 🔴 | M |
| **S8-16** | **A real loss diagram.** Waterfall/Sankey that reconciles end to end, with orientation/POA **inside** the accounting and near/far/diffuse/electrical shading separated. Today: a flat bar list of five constants that no design decision can move. | 🟠 | M |
| **S8-17** | **Numeric monthly tables** everywhere charts exist. The printed proposal shows no monthly numbers at all. | 🟠 | S |
| **S8-18** | **IEC 61724 Performance Ratio**, temperature-corrected, with specific yield. Today PR is non-standard and excludes orientation. | 🟠 | S |
| **S8-19** | **Validate against PVsyst.** Build a reference-case suite (flat/tilted/shaded/multi-orientation) and pin agreement to ≤3%. The test suite today only checks self-consistency and monotonicity — it can never catch a wrong model. **This is the item that makes the number bankable.** | 🔴 | L |
| **S8-20** | **Measured vs simulated.** Import a commissioned plant's generation data and reconcile against the model. Also the basis for reconciling savings against the customer's actual bills. | 🟠 | L |
| **S8-21** | **Exportable shade study** — seasonal sweep, per-module readout during scrub, a bankable shade report artefact. | 🟠 | M |
| **S8-22** | **Fix the integral mismatch.** The POA tilt-gain integral (50 samples/yr, 5 months) and the shading integral (288 samples/yr, 12 months) sample **different domains** and are then multiplied together. Beam is weighted by `sin(altitude)` with no air-mass attenuation, so low-sun hours are over-credited. Sun samples are weighted by geometry alone, so **monsoon shade is priced like December shade**. | 🟠 | M |
| **S8-23** | **Sum over modules, not a product of means.** The energy model drops the orientation × shading covariance. | 🟠 | S |
| **S8-24** | **Stop re-quantising.** Money and comparison round energy to the nearest 100 kWh while the exact figure sits unused on the same object. | 🟡 | S |
| **S8-25** | **Weather DB management** — a second source, import (TMY3 / EPW / CSV / Meteonorm / NASA POWER / Solargis), source comparison, database versioning, and an expiry on fetched weather. Today one hardcoded source that never expires, and when it is unreachable **real customer quotes are driven by a function literally named `mockIrradiance`**. | 🟠 | XL |

---

### S9 · BOM & Procurement

> Not a single nut, bolt, washer or lug left. The full register is §7.

**Today** — the architecture is genuinely excellent and must be preserved: stable `LineKey`
semantics, per-line provenance, waste allowances, discrete-unit ceiling, override-merge with
orphan handling, discount apportionment, GST by category, money that never renders stale.
**~50 line keys.** A real Indian BOQ has ~250.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S9-01** | **Emit the full item register** in §7 — every item, with the derivation formula given there. Nothing needs new user input; every quantity is a pure function of data the context already holds. | 🔴 | XL |
| **S9-02** | **HSN/SAC on every line.** The field exists on the type and **no emitter ever populates it**, so no GST tax invoice can be raised. A static `HSN_BY_LINE` table costs one line per key. Then derive the GST rate *from* the HSN rather than the category. Add it to overrides and to the CSV. One-day change, moves the export from unusable to importable. | 🔴 | S |
| **S9-03** | **Vendor offers instead of flat rates.** `Record<LineKey, number>` → `Record<LineKey, VendorOffer[]>` with vendorId, brand, model, MRP, net rate, HSN, MOQ, pack size, lead time, approved-for. Org-level approved-make list; `line()` picks the cheapest approved offer and exposes alternates. | 🔴 | L |
| **S9-04** | **Pack rounding and lead time.** Order qty rounds up to pack size after waste (`orderQtyOf` already has the hook) and shows required vs ordered. Derive a project lead time and flag any line that misses the commissioning date. Today cable is ordered as 137.4 m and washers as bare counts. | 🟠 | M |
| **S9-05** | **Procurement packages.** An orthogonal dimension on `line()` — modules / inverter+MLPE / MMS steel / MMS hardware / DC electrical / AC switchgear / containment / earthing+LPS / civil / safety+monitoring / services — assigned per key like `WASTE_PCT_BY_LINE` already is. Then three free views: **PO** (by vendor), **GRN/store-issue** (required vs ordered vs pack-rounded, with a tick column), and **dispatch schedule** ordered by the `installationPlan` phase that consumes each item. `materialsFor` already maps BOM items to steps — invert it and the schedule is free. | 🟠 | M |
| **S9-06** | **Spares as a distinct concept.** A `sparePct` beside `wastePct` on a whitelist (modules 0.5%, string fuses 10%, SPD cartridges 10%, MC4 5%), shown as its own sub-line. **Do not fold it into waste** — waste is consumed on site, spares are handed over, and conflating them makes the handover list underivable. | 🟠 | S |
| **S9-07** | **Waste on every prefix.** 7 prefixes covered today. Add fasteners 5%, clamps 2%, connectors 3%, ties/ferrules 10%, glands 3%, cement 3%, sand/aggregate 5%, shuttering 15%, tile breakage 8% (already documented in a comment with nowhere to put it). Remove the hardcoded `+ 4` MC4 spare. | 🟠 | S |
| **S9-08** | **Derive labour, transport and logistics from the design.** `installationPlan` already emits every step with a count off the structural graph — attach productivity norms per phase and emit skilled/unskilled man-days plus supervision. Transport from real tonnage (steel kg is exact) × distance from the org's store. Add packing & forwarding (2-3%), transit insurance (0.15%) and unloading. **Four lumpsums today, and four places margin leaks.** | 🟠 | M |
| **S9-09** | **Export set.** One `bomExportModel` feeding: XLSX with real sheets (Summary / BOQ with live formulas / Vendor POs / GRN checklist / Notes), a printed BOQ PDF with letterhead, revision block and the confidence footnote (`bomConfidence` already computes exactly what it needs), a stable JSON keyed by LineKey + catalogVersion + designFp, and a Tally-shaped CSV once HSN exists. | 🟠 | M |
| **S9-10** | **BOQ revision control.** `BomRevision { rev, issuedAt, issuedBy, note, designFp, catalogVersion, lines }` plus `diffBomRevisions` keyed on LineKey returning added / removed / qty / rate / spec changes. The stable-LineKey design exists precisely to make this trivial — this is its payoff. Surface as a revision banner and a "Schedule of Changes" page. | 🟠 | M |
| **S9-11** | **Itemise-vs-bundle toggle.** Residential quotes show one DCDB line; the C&I BOQ explodes it. Money must reconcile either way through `bomMoney`. | 🟠 | S |
| **S9-12** | **Battery BOM slice** — but only behind the sizing model. An unsized battery on a quote is worse than none. | 🔴 | L |
| **S9-13** | **The mock-provenance label must travel.** It reaches exactly one comparison-matrix footnote today, and never the BOM, the SLD or the proposal. | 🟠 | S |

---

### S10 · Drawings & Documents

> The design package. The full register is §8.

**Today** — `Step8Sld.tsx` (934 lines), `Tab = 'sld' | 'layout' | 'strings' | 'structure'`.
**4 sheet types of ~20.** No PDF set — one sheet at a time, printed by the browser. No drawing
number, revision, scale or approval block. `lib/export-dxf.ts` emits a minimal AC1015 DXF of the
layout sheet only.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S10-01** | **A real sheet engine** — title block, drawing number, revision, scale, north arrow, key plan, approval signatures, drawing register. Every sheet inherits it. | 🔴 | L |
| **S10-02** | **Multi-page PDF plan set** with a cover, index and consistent scale. | 🔴 | M |
| **S10-03** | **The missing sheets** — earthing layout, LPS layout, cable routing/trench layout, access/walkway plan, elevations, sections, penetration/waterproofing detail, enclosure GA + internal wiring, foundation setting-out, connection details, module numbering plan. See §8. | 🔴 | XL |
| **S10-04** | **Cable schedule sheet** (pairs with S7-11). | 🔴 | M |
| **S10-05** | **Engineering calculation sheets** — cable sizing, voltage drop, earthing (IS 3043), lightning risk (IS/IEC 62305), load calc, structural calc. The math mostly exists and is never printed as a signable document; `voltDropPct` surfaces in exactly one place — a BOM formula string. | 🔴 | L |
| **S10-06** | **Indian statutory packs** — CEIG/electrical inspector, DISCOM net-metering application, PM Surya Ghar, ALMM/DCR certificate. **This is the India moat: nobody outside India builds these.** | 🔴 | XL |
| **S10-07** | **Fix the fake section.** The layout sheet prints a hardcoded `PV TABLE SECTION (10° TILT)` with fixed geometry regardless of the actual design. | 🔴 | S |
| **S10-08** | **Fix the string-route sheet.** The sheet titled `DC STRING CABLE ROUTE` draws straight lines between module centres — not the routed cable that the app has modelled. | 🟠 | M |
| **S10-09** | **Setting-out dimensions on the layout sheet.** A site crew cannot position a single module from it today. | 🔴 | M |
| **S10-10** | **Structure sheet with a member schedule**, mark numbers and fabrication dimensions (pairs with S6-17). Also: flush and pitched-roof arrays — the highest-volume Indian residential case — get **no structure drawing at all**. | 🟠 | M |
| **S10-11** | **Equipment schedule + datasheet compilation.** | 🟠 | M |
| **S10-12** | **Handover pack** — ITP/QAP, commissioning checklist, test reports, O&M manual, warranty pack, as-built set. | 🟠 | XL |
| **S10-13** | **Interop out** — DWG, richer DXF across all sheets, IFC, SKP, PVsyst `.PRJ`/CSV, HelioScope, glTF/USDZ scene export. ARKA charges ₹16,500/mo specifically for SketchUp + PVsyst export. | 🟠 | L |
| **S10-14** | **Printed BOQ sheet** (pairs with S9-09) — the BOM leaves the system only as CSV today. | 🟠 | S |
| **S10-15** | **Fix the sheet defects** — the legend advertises three symbols nothing draws; sheet numbering is hardcoded and wrong past a fourth sheet; scale is nominal and internally inconsistent; layout and string sheets have no scale bar; PNG export rasterises at the browser's default size and only captures the visible tab. | 🟠 | S |
| **S10-16** | **Test coverage on sheets.** Zero today — only the empty primitives are gated. | 🟠 | M |

---

### S11 · Commercials

> Savings a CFO will accept.

**Today** — `lib/finance.ts` (82 lines) computes 8 numbers and binds correctly to `mergedBom`
so cost can never diverge from the BOM. `lib/financing.ts` amortises cash/loan/lease/PPA off
four global constants. Tariff is one flat ₹/kWh from a hand-written 10-state table labelled
"MOCK REPRESENTATIVE". **Savings assume 100% of generation offsets grid at full retail tariff.**

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S11-01** | **Tariff engine.** ToU/ToD, telescopic slabs, demand charge, fixed charge, electricity duty, PF incentive/penalty, per-state, per-DISCOM, per-category, with effective-from dates and a versioned update path. | 🔴 | XL |
| **S11-02** | **Real energy accounting.** Self-consumed vs exported vs imported, hour by hour, against net / gross / behind-the-meter and the state's banking and settlement rules. | 🔴 | L |
| **S11-03** | **IRR, NPV, LCOE, discount rate, full cashflow table.** Economics stop at simple payback today. | 🔴 | L |
| **S11-04** | **Recurring costs** — O&M, insurance, cleaning cycles, inverter replacement at year N, battery replacement. None exist. | 🔴 | M |
| **S11-05** | **C&I tax levers** — accelerated depreciation, tax shield, GST input credit. The two biggest C&I economic levers in India, both absent. | 🔴 | M |
| **S11-06** | **Battery dispatch economics** — self-consumption, peak shaving, arbitrage, backup, **DG replacement**, weak-grid islanding. | 🔴 | XL |
| **S11-07** | **DG-offset model** — diesel ₹/kWh baseline, DG running hours displaced, maintenance saved. The strongest solar+storage business case in India. | 🟠 | L |
| **S11-08** | **Open-access / captive / group-captive / wheeling** economics for the ground-mount segment the UI already advertises. | 🟠 | L |
| **S11-09** | **Honest OPEX/PPA/lease.** Lifetime economics currently ignore degradation, escalation and offtake, which makes the ₹0-down options the **least trustworthy numbers in the proposal**. | 🟠 | M |
| **S11-10** | **Escalation, horizon and lender terms as deal inputs**, not hardcoded literals outside the rule config. | 🟠 | S |
| **S11-11** | **Subsidy engine** — GHS/RWA slab, state top-ups, PM-KUSUM/agri, effective-from stamping. | 🟠 | M |
| **S11-12** | **Sensitivity + P-value banding** on both yield and money, using S8-15. | 🟠 | M |
| **S11-13** | **Bill reconciliation** — compare modelled savings against the customer's actual post-install bills. | 🟡 | L |

---

### S12 · Issue & Handover

> Freeze it, sign it, ship it.

**Today** — `Step10Done.tsx`. `ProjectStatus` has exactly two states. Nothing is ever frozen;
there is no approval, no comment, no change order, and no handoff to procurement or installation.

| ID | Work | Sev | Eff |
|---|---|---|---|
| **S12-01** | **Design freeze.** Issue snapshots design, BOM, drawings and simulation under one revision + fingerprint. | 🔴 | M |
| **S12-02** | **Review, sign-off, comments, change orders.** Nothing can be returned to a designer today. | 🔴 | L |
| **S12-03** | **Handoff to procurement and installation** — the PO set, the GRN checklist, the dispatch schedule and the install plan, all already derivable. | 🟠 | M |
| **S12-04** | **Approvals tracker** — CEIG, DISCOM, subsidy, with status and document set per gate. | 🟠 | M |
| **S12-05** | **Share that actually shares.** The share link only opens on the device that created the design. | 🔴 | M |

---

## 5 · Cross-cutting engines

These are not stations. They are the substrate the stations sit on, and each one is a project.

### E1 · The physics core
**E1-01** the 8760 time-series spine (S8-01) · **E1-02** transposition + albedo (S8-02) ·
**E1-03** cell temperature (S8-04) · **E1-04** module IV model (S8-05) · **E1-05** inverter
model + clipping (S8-06) · **E1-06** electrical shading (S8-07) · **E1-07** the PVsyst
validation suite (S8-19).

> Sequence strictly in that order. Each one is meaningless without its predecessor.

### E2 · Catalogs
**E2-01** module spec with real physics — one-diode params, IEC 61853 matrix, NOCT, bifaciality,
Isc/Voc/Pmax coefficients, max series fuse, max system voltage, fire/mechanical-load class,
frame thickness, clamp zones, `maxDesignLoadPa`, weight ·
**E2-02** inverter spec with ~30 fields (S7-05) · **E2-03** battery catalog ·
**E2-04** cable, protection-device and connector catalogs ·
**E2-05** MMS / rail / clamp / hardware catalog · **E2-06** steel sections with properties
(S6-14) · **E2-07** manual component entry + datasheet PDF extraction — both are **labels only**
today, marked "mocked in POC" · **E2-08** PAN/OND import + export (PVsyst interop) ·
**E2-09** ALMM/DCR sourced from the real published list, not unsourced booleans that gate a
₹78,000 subsidy · **E2-10** price book as data with a supplier feed, not a second hardcoded
TypeScript literal.

> **Today: 15 modules, 12 inverters, 8 steel sections, 0 batteries, 0 cables, 0 clamps.**
> HelioScope ships 45,000 components.

### E3 · The MMS library
**E3-01** family registry + builder interface (S6-01) · then one family per release, per §6.

### E4 · The BOM engine
**E4-01** the item register (§7) · **E4-02** HSN + vendor offers · **E4-03** package/PO/GRN
views · **E4-04** revisions and diff.

### E5 · The 3D engine
| ID | Work | Sev | Eff |
|---|---|---|---|
| **E5-01** | **HDRI / image-based lighting.** Every material has nothing to reflect today. Single biggest realism win per hour spent. | 🔴 | M |
| **E5-02** | **Post-processing** — SSAO, contact shadows, bloom, TAA/SMAA. Zero today. | 🔴 | M |
| **E5-03** | **Asset pipeline.** 169 MB of uncompressed GLB obstruction assets, no Draco/meshopt/KTX2, no LOD, culling disabled everywhere, one GLB cloned per instance so every tree is byte-identical and its own draw call. This is a mid-range-Android blocker. | 🔴 | L |
| **E5-04** | **Terrain in the scene** (pairs with S1-03). | 🔴 | XL |
| **E5-05** | **Real satellite drape.** One ~90 m static tile today — a C&I site runs off the edge of its own imagery. | 🔴 | L |
| **E5-06** | **Real neighbours.** They are fabricated random boxes seeded from the latitude (pairs with S1-04). | 🔴 | M |
| **E5-07** | **A real module.** Scaled box + canvas grid + hardcoded 45 mm thickness today. Needs cell count from the spec, busbars/fingers, AR coating response, frame anodising, junction box, real thickness. | 🟠 | L |
| **E5-08** | **Roof coverings render.** RCC, metal sheet and tile all draw as the same flat concrete. The roof solid has no UV attribute and one material paints deck, four facades and the underside. | 🟠 | M |
| **E5-09** | **Cascaded shadow maps.** One 2048 map over a fixed ±60 m box at the world origin — nothing beyond 60 m of the pin casts or receives a shadow. | 🟠 | M |
| **E5-10** | **BOS in 3D** — cables, conduits, trays, earthing, keepouts, setbacks. None are drawn. | 🟠 | L |
| **E5-11** | **Offscreen high-res render + video + AR.** Proposal heroes are captured from the live canvas as JPEG 0.85 at viewport size. | 🟠 | M |
| **E5-12** | **Consume the exact site frame.** It is built and almost nothing reads it, and the working tree currently reverts the roof detector to the biased projector. | 🟠 | M |
| **E5-13** | **Weather / season / atmosphere** — one hardcoded Preetham sky whose turbidity never varies with Indian haze or monsoon and never reaches the irradiance model. | 🟡 | M |
| **E5-14** | **Vegetation library** — one tree, a missing windmill asset, no species or growth variation. | 🟡 | M |

### E6 · Platform
**E6-01** backend + accounts + multi-tenancy — **all data lives in one browser's `localStorage`
today** · **E6-02** API, webhooks, SSO, roles, audit trail · **E6-03** headless simulation
service + batch/CLI (PVsyst has `PVsystCLI`; consider using it as a **validation backend**
rather than reimplementing every model) · **E6-04** mobile + offline + PWA, for a product whose
primary input is a rooftop survey · **E6-05** shared org catalog and price book ·
**E6-06** rule engine that actually varies by state/DISCOM/org — `resolveRules()` ignores its
context · **E6-07** portfolio recompute after a catalog or price change · **E6-08** i18n (four
languages are typed, only English exists).

---

## 6 · MMS family register

The complete matrix. **✅ 3 of 35.**

### Flat RCC roof
| Family | State | Item |
|---|---|---|
| Elevated fixed tilt | ✅ | — |
| East-west / dual tilt | ◐ label only, no geometry | S5-02 |
| Ballasted non-penetrating | ◐ fixed block per leg | S6-09 |
| High-rise walkable elevated | ✗ | S6-08 |
| Parapet-mounted | ✗ | S6-18 |
| Seasonal tilt-adjustable | ✗ | S6-13 |

### Metal sheet roof
| Family | State | Item |
|---|---|---|
| Penetrating L-foot | ✅ | — |
| Trapezoidal crown clamp | ✗ | S6-03 |
| Standing-seam clamp (non-penetrating) | ✗ | S6-03 |
| Corrugated / AC sheet hook + L-key | ✗ | S6-03 |
| Curved / arched sheet saddle | ✗ | S6-03 |
| Mini-rail | ✗ | S6-03 |
| Rail-less | ✗ | S6-03 |
| Purlin-fixed | ✗ | S6-02 |

### Tile roof
| Family | State | Item |
|---|---|---|
| Interlocking hook | ◐ blended "~4 hooks/panel" | S6-04 |
| Flat tile hook | ✗ | S6-04 |
| Mangalore tile hook | ✗ | S6-04 |
| Slate hook | ✗ | S6-04 |

### Ground mount
| Family | State | Item |
|---|---|---|
| Fixed tilt on level ground | ✅ | — |
| Fixed tilt on **slope** | ✗ | S6-07 |
| Driven / rammed pile | ✅ | — |
| Screw pile | ✗ | S6-13 |
| Cast pedestal | ✅ | — |
| Precast block | ✗ | S6-13 |
| HSAT single-axis tracker | ✗ | S6-06 |
| Tilted single-axis tracker | ✗ | S6-06 |
| Dual-axis tracker | ✗ | S6-06 |
| Backtracking control | ✗ | S6-06 |

### Elevated & special
| Family | State | Item |
|---|---|---|
| Carport — single post | ✗ | S6-05 |
| Carport — double post | ✗ | S6-05 |
| Carport — cantilever | ✗ | S6-05 |
| Carport — T-shape / back-to-back | ✗ | S6-05 |
| Agri-PV high clearance | ✗ | S6-08 |
| Shed-over-parking / pergola | ✗ | S6-08 |
| BIPV / facade | ✗ | S6-19 |
| Wall mount | ✗ | S6-19 |
| Pole mount | ✗ | S6-19 |
| Floating (pontoon + mooring) | ✗ | S6-19 |
| Canal-top | ✗ | S6-19 |

---

## 7 · BOM / BOS item register

**The rule: if a part is real it has a count. If it has no count it is not in the BOM.**
Delete every lump-sum "kit" as its contents become countable.

Every formula below is a pure function of data the BOM context **already holds**. No new user
input is required for any of them — which is exactly what "less control, more work" means.

### 7.1 DC side
| Item | Derivation |
|---|---|
| MC4 male / female | `strings × 2` each `+ 5%` spare (split today's single count; the hardcoded `+4` goes) |
| MC4 Y-branch | `max(0, parallelStringsPerMppt − 1) × mppt.count × invCount` |
| Inline fuse + holder | `strings × 2` when `strings > rules.dcSizing.maxUnfusedParallel` (IEC 62548), **regardless of combiner topology** — today it only fires when a plan exists |
| DC cable by size **and colour** | routed length by size, red/black split |
| Cable ties (UV) | `ceil(ductM / rules.cable.tieSpacingM) × 1.15 + ceil(acRunM / 0.3)` |
| Cable clips | `ceil(dcCableM / 0.5)` on rail runs |
| Spiral wrap | `ductM × 0.15` for exposed drops |
| Glands PG / brass | `2 × strings` in + `1` out per DCDB, `4` per ACDB, sized from the derived cable mm² |
| Ferrules | `(strings × 4) + (invCount × 8) + 12` |
| DC lugs | same count as ferrules, sized by mm² |
| Heat shrink | `0.15 m × ferrule count` |
| DIN rail | `0.3 m/DCDB + 0.5 m/ACDB` |
| Wire duct | `1.2 m/DCDB + 1.8 m/ACDB` |
| Junction box | per enclosure |
| **DCDB enclosure** (split from the blended line) | `invCount`, spec `${strings}-in ${mppt.count}-out IP65` |
| DC isolator | `invCount × mppt.count`, rating from the **same** `dcIsolatorA` the SLD reads |
| DC SPD | `invCount`; Type-1+2 when `project.arresters.length > 0`, else Type-2 — derivable today |
| DC busbar | `invCount`, section from `ΣIsc × rules.combiner.outputFactor` |
| Fuse base | = fuse qty |

### 7.2 AC side
| Item | Derivation |
|---|---|
| ACDB enclosure | sheet size from device count |
| MCCB incomer | `invCount`, `acBreakerA(inv.acKw, phases)` |
| MCCB outgoing | 1, `acBreakerA(acKw × invCount, phases)` |
| RCCB | 1; 30 mA residential / 100–300 mA above the commercial threshold |
| AC isolator | 1, from the shared `acIsolatorA` |
| AC SPD | 1; Type-1+2 if arresters present |
| Contactor + changeover | 1 each, when DG backup is present |
| CT | `phases`, ratio = next rung above `acFullLoadA × 1.25` |
| MFM / export meter | 1 when `kwp > 10` |
| Phase indicator, V/A selector | 1 + 2 |
| AC cable — **Al and armoured too** | Cu below `alThresholdMm2` (25 mm²), Al above; armoured when the route is trenched or leaves the footprint (`routing.ts` knows); Al derated ~0.78 so the size step-up is automatic |

> **Also fix:** `sld.ts:49` hardcodes an AC size the BOM engine already proved wrong. One sizing
> path, as that file's own header claims.

### 7.3 Containment — derived from the routed polyline
> This is the automation nobody else does: **count the vertices.**

| Item | Derivation |
|---|---|
| Cable tray by width | width = next rung (50/100/150/200/300) above `Σ(cable OD × 1.4)` sharing the duct; length = `ductM` |
| Tray cover | same length, outdoors (all rooftop runs) |
| **Tray bend** | **every waypoint whose turn angle exceeds 15°** |
| **Tray tee** | count of route junction points where home runs merge |
| Tray support | `ceil(trayM / supportPitchM)` at 1.5 m |
| Threaded rod | `2 × supports × dropM` |
| GI conduit | size from `Σ cable area / 0.4` fill; length = the vertical drop portion |
| Flexible conduit | `1.5 m` per inverter + per DCDB/ACDB |
| Saddles | `ceil(conduitM / 1.0)` |
| HDPE pipe | the trenched portion only |

### 7.4 Earthing & LPS
| Item | Derivation |
|---|---|
| Earth electrode | = pits; Cu-bonded 3 m × 17.2 mm for LPS/DC, GI for AC |
| Chemical compound | `pits × compoundBagsPerPit` (3 × 25 kg) |
| Pit chamber + cover | = pits |
| Test link | = pits |
| Earth busbar | `invCount + 1` |
| Earth strip GI | `Σ segment perimeter` from the member graph |
| Earth wire Cu | `Σ string route length × 1.05` |
| **Module earth lug** | **`n`** — one per module, confidence `measured`, exactly like the module count |
| **Module earth washer** | `n × 2` star washers, or `clampsMid + clampsEnd` for bonded clamps |
| Bonding jumper | `structures × 2 + invCount + 2` |

### 7.5 Mechanical / MMS
| Item | Derivation |
|---|---|
| Hex bolt | `ft.bolts`, size from `profile.t` — M8 < 2.0 mm, M10 to 3.0, M12 above |
| Hex nut | `ft.bolts` |
| Spring washer | `ft.bolts` |
| **Flat washer** | **`ft.bolts × 2`** — one under head, one under nut |
| Chemical anchor | `ft.anchors` |
| Anchor cartridge | `ceil(ft.anchors / anchorsPerCartridge)` (~8) |
| Self-drilling screw | `ft.standoffs × 2` |
| Thread lock | `ceil(ft.bolts / 250)` bottles |
| Anti-seize | `ceil(ft.anchors / 200)` |
| Silicone sealant | `ceil((ft.standoffs + ft.anchors) / 25)` cartridges |
| **Rail splice** | `Σ per row max(0, ceil(rowLengthM / railStockLengthM) − 1)` — exact, not estimated |
| Rail end cap | `2 × rowCount` |
| Gusset plate | `front_leg.count + back_leg.count` |
| Purlin cleat | `purlin.count × 2` |
| Rubber pad | `ft.plates` on RCC decks only |
| Wind deflector | rear-row module count, when ballasted on a flat roof |
| Module earth clip | `n` when bonded clamps are not used |
| Seam clamp (standing seam) | = node count, **zero sealing washers, zero penetrations** |
| Carport column / beam / gutter / downpipe / base bolt | from the carport member summary |
| Tracker torque tube / bearing / damper / motor / controller | tube = row length; bearings = `ceil(rowM / bearingPitch) + 1`; motors = `ceil(rowCount / rowsPerDrive)` |

> Delete `mech.fasteners` (the lump kit) once the above are counted.

### 7.6 Civil — the volume is already computed, just explode it
| Item | Derivation |
|---|---|
| PCC M15 / RCC M20 | `foundationVolumeM3 × ft.pedestals`, already in scope |
| Cement | `m³ × 8.06` bags (M20 = 1 : 1.5 : 3) |
| Sand | `m³ × 0.42` |
| Aggregate 20 mm | `m³ × 0.84` |
| Reinforcement steel | `m³ × steelKgPerM3` (~80) |
| Shuttering | square `4 × l × h × count`; circular `π × d × h × count` |
| Curing compound | `shutteringM² × 0.15 L` |
| Excavation | `foundationVolumeM3 × 2.5`, **ground pedestals only** (`pedestalsBySurface` already splits them) |
| Waterproofing | `ft.anchors × 0.25 m²` per penetration + chemical at `m² × 0.6 L` |
| Trench sand / brick / marker / warning tape | `trenchM × 0.06 m³` · `× 20` nos · `ceil(trenchM/25) + turns` · `= trenchM` |

### 7.7 Safety & monitoring
| Item | Derivation |
|---|---|
| CO₂ + ABC extinguisher | `max(2, ceil(kwp / kwPerExtinguisher))` each (~100) |
| Sand bucket | `2 × inverterRoomCount` |
| Rubber mat | `1.0 m` per ACDB + per inverter |
| First aid box, shock-treatment chart | 1 each |
| Arc-flash label | `invCount + strings + 2` — one per energised enclosure |
| Danger board, LOTO kit | per boundary; 1 |
| Datalogger | `ceil(invCount / invertersPerLogger)` |
| RS485 / Modbus cable | the routed inverter→logger path (reuse `routePath`) |
| SIM router, antenna, Modbus meter | 1 each |
| Pyranometer ×2, module temp ×2, ambient, anemometer, WMS mast | above the C&I/MNRE threshold (~500 kWp) |

### 7.8 Storage (behind the sizing model — never ship the line without it)
`bess.module` (`ceil(targetKwh / battery.kwh)`) · rack · BMS · DC breaker (`maxDischargeA ×
1.25`) · DC cable + lugs + glands at the array rule · enclosure · HVAC above threshold ·
fire suppression · changeover + critical-load panel for backup topology.

### 7.9 Commercial layer
HSN/SAC per line · GST derived from HSN chapter · vendor / brand / approved-make · MOQ · pack
size · lead time · procurement package · waste % · spare % · revision · labour man-days by
phase · transport by tonnage × distance · packing & forwarding 2–3% · transit insurance 0.15% ·
unloading.

---

## 8 · Document & drawing register

| # | Sheet / document | State | Item |
|---|---|---|---|
| 1 | Single line diagram (DC + AC) | ✅ | — |
| 2 | PV array layout plan | ◐ no dimensions, fake section | S10-07, S10-09 |
| 3 | String layout plan | ◐ draws straight lines, not the route | S10-08 |
| 4 | Structure sheet | ◐ one table, no schedule; **none at all on pitched roofs** | S10-10 |
| 5 | Module numbering plan | ✗ | S5-07 |
| 6 | Cable routing / trench layout | ✗ | S10-03 |
| 7 | **Cable schedule** | ✗ | S10-04 |
| 8 | Earthing layout | ✗ | S10-03 |
| 9 | Lightning protection layout | ✗ | S10-03 |
| 10 | Walkway / access plan | ✗ | S10-03 |
| 11 | Building elevations | ✗ | S10-03 |
| 12 | Sections | ◐ one typical structure section only (`StructureSheet.tsx:139`) | S10-03 |
| 13 | Roof penetration / waterproofing detail | ✗ | S10-03 |
| 14 | Foundation setting-out + detail | ◐ foundation drawn in section; no setting-out coordinates | S6-17 |
| 15 | Structure GA + fabrication + connection details | ✗ | S6-17 |
| 16 | Inverter / ACDB / DCDB mounting detail | ✗ | S10-03 |
| 17 | Panel GA + internal wiring | ✗ | S10-03 |
| 18 | Equipment schedule | ✗ | S10-11 |
| 19 | Load calculation sheet | ✗ | S10-05 |
| 20 | Cable sizing + voltage drop calc | ✗ (math exists, never printed) | S10-05 |
| 21 | Earthing calc (IS 3043) | ✗ | S10-05 |
| 22 | Lightning risk assessment (IS/IEC 62305) | ✗ | S10-05 |
| 23 | Structural + wind load calc | ✗ | S6-10, S10-05 |
| 24 | BOQ (printed, priced) | ✗ (CSV only) | S10-14 |
| 25 | Datasheet compilation | ✗ | S10-11 |
| 26 | Shade report (bankable) | ✗ | S8-21 |
| 27 | Simulation / energy report (engineering grade) | ◐ sales only | S8-16, S8-17 |
| 28 | ITP / QAP | ✗ | S10-12 |
| 29 | Commissioning checklist | ✗ | S10-12 |
| 30 | Test reports | ✗ | S10-12 |
| 31 | O&M manual | ✗ | S10-12 |
| 32 | Warranty pack | ✗ | S10-12 |
| 33 | As-built set | ✗ | S10-12 |
| 34 | CEIG / electrical inspector pack | ✗ | S10-06 |
| 35 | DISCOM net-metering application pack | ✗ | S10-06 |
| 36 | PM Surya Ghar pack | ✗ | S10-06 |
| 37 | ALMM / DCR compliance certificate | ✗ | S10-06 |
| 38 | Drawing register + revision control | ✗ | S10-01 |

---

## 9 · Release trains

Ordered by *deals lost per week of delay ÷ cost*. Each train ships something an EPC can sell.

### R1 · Stop the bleeding — S · 2 weeks
The defects in §10, plus S9-02 (HSN), S10-07 (fake section), S7-19 (auto-string on entry),
S0-03 (derive state), S6-16 (dead load).
**Why first:** every one is a wrong number or a wrong price shipping today, and all are cheap.

### R2 · The express lane — M · 6 weeks
S1-15 · S4-07 · S4-05 · S4-06 · S2-01 · S5-05 · plus the wizard restructure (§3).
**Why:** this is the "less control, more work" promise, made visible. It also unblocks every
demo. Reslink's entire wedge is a 10-minute design from a phone.

### R3 · The physics core — XL · a quarter
E1-01 → E1-07 in strict order, plus S8-15 (P50/P75/P90) and S8-10 (every caster casts).
**Why:** it is the deepest hole, it gates batteries, ToU, clipping and every C&I sale, and
nothing above it can be trusted until it lands. **Do not start R3 in parallel with itself.**

### R4 · The complete bill — L · 8 weeks
S9-01 (the §7 register) · S9-03 · S9-04 · S9-05 · S9-08 · S9-09 · S9-10.
**Why:** "not a single nut and bolt left" is the owner's hardest requirement and nobody else
does it. The architecture is already right; this is emission work, not redesign.

### R5 · Every structure — XL · a quarter
S6-01 (the keystone) → S6-02 → S6-03 → S6-04 → S6-05 → S6-07 → S6-09 → S6-06 → S6-19.
**Why:** half our v1 scope is C&I and we cannot model an Indian factory shed. Each family after
the keystone is cheap because it inherits everything.

### R6 · Battery & money — XL · a quarter
S0-01 (load profile) → S11-01 (tariff) → S11-02 (accounting) → S9-12/S7-06 (battery) →
S11-06 (dispatch) → S11-03/04/05 (real economics).
**Why:** OpenSolar gives battery away free, so it is table stakes now. Depends on R3.

### R7 · The package — L · 10 weeks
S10-01 → S10-02 → S10-03 → S10-04 → S10-05 → S10-06 · plus S6-17.
**Why:** this is the actual deliverable the product is named for. **S10-06 (Indian statutory
packs) is the moat — nobody outside India builds it.**

### R8 · Realism — L · 8 weeks
E5-01 → E5-02 → E5-03 → E5-05 → E5-06 → E5-07 → E5-04.
**Why:** cheap wins first (HDRI + post-processing are days, not weeks), then the expensive
truthful ones.

### R9 · Platform — XL · ongoing, start now
E6-01 first. **Nothing else in this file survives without a backend.** Start it in parallel with
R1 because everything downstream assumes it.

---

## 10 · Live defects found in this audit

Not gaps. **Bugs shipping today.** Fix in R1.

| # | Defect | Where | Effect |
|---|---|---|---|
| 1 | **SPD is double-priced inside every String Combiner Box line** | `lib/bom/emitters/electrical.ts` | A live ₹1,900/box overcharge on every C&I quote |
| 2 | **A module can be wired into two strings and still pass the electrical gate** | `lib/electrical/gate.ts` | An electrically impossible design reaches the SLD and the BOM |
| 3 | **Every string's home run routes to inverter placement `[0]`** | `lib/routing.ts` | Wrong DC lengths, wrong drop, wrong cable quantity on every multi-inverter job |
| 4 | **Monorail members emitted at a constant Z** | `lib/structure.ts` | On a pitched tin shed the whole structure detaches from the roof plane and the steel is under-measured |
| 5 | **The layout sheet prints a hardcoded fake section** — `PV TABLE SECTION (10° TILT)` with fixed geometry | `Step8Sld.tsx` | A drawing that describes a design nobody built |
| 6 | **The sheet titled `DC STRING CABLE ROUTE` draws straight lines between module centres** | drawing components | Not the routed cable; a crew following it pulls the wrong length |
| 7 | **The roof dead-load check counts foundations only** | `lib/drc.ts` | The load reported to a building owner is materially low |
| 8 | **Step 8 and the comparison matrix string through a degraded shim** that discards roofs, MLPE and refusals | stringing shim | The SLD can describe a design the editor would reject |
| 9 | **DC drop check hardcodes 4 mm² at 20 °C** while the AC path correctly uses 70 °C | `lib/electrical-sizing.ts` | Understates DC drop by ~20% |
| 10 | **`sld.ts` hardcodes an AC cable size** the BOM engine already proved wrong | `lib/sld.ts:49` | The sheet and the bill disagree — the exact failure the shared-sizing design exists to prevent |
| 11 | **Bifacial modules cost more and produce the same** | catalog + `poa.ts` | The software argues against the product the EPC is selling |
| 12 | **Lightning-arrester masts cast a shadow on screen and nothing in the engine** | `shading.ts` vs `Scene3D.tsx` | The exact scrub/engine disagreement the codebase claims to have removed |
| 13 | **Legend advertises three symbols nothing draws**; sheet numbering wrong past the fourth sheet | drawing sheets | — |
| 14 | **Savings computed from the ROUNDED MWh** while the exact kWh sits on the same object | `lib/finance.ts` | Small but systematic error in every quote |
| 15 | **Fetched weather never expires** and is never re-validated against the PVGIS DB version | `lib/weatherApi.ts` | Stale climate silently drives live quotes |
| 16 | **The freshness fingerprint has no year term** | `lib/shading.ts` | Stamped-fresh solar access silently changes across a year boundary |
| 17 | **Phantom step 5** makes the progress indicator lie | `Wizard.tsx` | — |

---

## 11 · Rules that do not change

Whatever we build, these survive. They are the reasons to pick HelioGrid over a bigger tool.

1. **Provenance on every user-visible number** — measured / derived / estimated / assumed.
   Nobody else does this. Every item in this file must carry it.
2. **Money never renders while stale.** The BOM reconciliation, stale notices and orphan
   handling stay exactly as they are.
3. **The canonical `Project` model is the only engineering source of truth.** Visual meshes never
   are. `lib/__tests__/one-frame.test.ts` enforces it — **extend that gate with every new
   station; never weaken it.**
4. **Structural safety is engineer-signed.** S6-10 computes and shows its working; S6-11 keeps a
   licensed human on the signature. The disclaimer travels with every structure-bearing output,
   forever.
5. **Units follow the user's m/ft preference — except procurement quantities**, which stay metric
   because Indian suppliers sell by the metre.
6. **The scene and the numbers agree.** If it casts a shadow on screen it casts one in the
   engine, and vice versa. Defect #12 and S8-10 exist to restore this.
7. **A stable `LineKey` is a semantic identity.** It is what makes BOM diff, override survival
   and revision control possible. Never key on a display string.
8. **New screens wire into old ones.** Nothing gets orphaned (CLAUDE.md standing rule).
9. **No raw values in UI.** `docs/DESIGN-SYSTEM.md` is binding and outranks instinct.
10. **If a part is real it has a count.** Lump-sum kits are a confession that the model does not
    know something.

---

## 12 · Evidence appendix

Grep counts over `src/`, 2026-09-01. `0` means the concept does not exist in the product.

```
battery 0    BESS 0       hybrid 0     self-consumption 0   load profile 0
8760 0       hourly 0     time-of-use 0   demand charge 0   peak shaving 0
albedo 0     Perez 0      Hay 0        Reindl 0             Klucher 0
far shading 0   horizonProfile 0   sky view 0   IAM 0       spectral 0
NOCT 0       Faiman 0     one-diode 0  IV curve 0           IEC 61853 0
P90 0        P75 0        uncertainty 0                     curtail 0
tracker 0    carport 0    pergola 0    agri 0    canal 0    floating(MMS) 0
north light 0   sawtooth 0   curved 0  dormer 0  mansard 0  gambrel 0  butterfly 0
genset 0     diesel 0     DG 0
DWG 0        IFC 0        SketchUp 0   KML 0     PAN file 0 OND 0
LiDAR 0      point cloud 0   photogrammetry 0
webhook 0    white label 0   multi-tenant 0

catalog: 15 modules · 12 inverters · 8 steel sections · 0 batteries · 0 cables · 0 clamps
racking kinds: 3   (flush, fixed_tilt, dual_tilt)
BOM line keys: ~50   (a real Indian BOQ: ~250)
drawing sheet types: 4   (of ~20 needed, ~38 documents total)
roof types: 4   (rcc_flat, metal_shed, tile, ground)
obstruction types: 11   (all manual; AI detects 8, always typed 'other' from DSM)
shading samples: 288/year   (PVsyst: 8,760)
POA samples: 50/year, 5 months   (and multiplied against the 288 — different domains)
AI site caps: 8 roofs · 40 m request radius · 150 m site extent · 250 m raycast cut
```

**Self-incriminating comments already in our own source** — these are ours, not an auditor's:

- `lib/shading.ts` — *"partial-shade losses are OPTIMISTIC"* · *"288 sun samples/year … is a
  quadrature of the real integral, not the real integral"* · *"Beam only"*
- `lib/poa.ts` — *"a deliberately conservative first-order transposition model"*
- `lib/solar.ts` — `mockIrradiance()`, which drives real quotes when PVGIS is unreachable
- `data/discoms.ts:46` — *"MOCK REPRESENTATIVE, not a live tariff feed"*
- `screens/Step4Components.tsx:778` — manual spec entry + datasheet extraction, *"mocked in POC"*
- `three/ObstructionMesh.tsx:598` — *"placeholder — updated after regeneration"*

---

*Audited 2026-09-01 · 12 parallel code audits, each independently re-verified against source ·
310 findings · next review after R3 lands.*
