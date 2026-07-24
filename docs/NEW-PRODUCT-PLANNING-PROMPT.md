# Hand-off prompt — start the production SaaS planning (for Fable 5, new session)

**How to use:** open a NEW session with **Fable 5**, attach/open THIS repository
(`Solar-App-POC`) as context, and paste the single fenced block below as your first message.

It asks for *planning only* — business model, architecture, tech stack, folder structure, DB
schema and a module-by-module roadmap. No application code yet.

---

```
You are planning a production, multi-tenant SaaS from scratch. I have attached an existing
repository — it is NOT the codebase we will continue in. It is (a) the complete product
specification and (b) a working proof-of-concept whose domain logic we will carry over. We
will start a brand-new git repository, locally and remotely, from zero.

Read the attached repo before you plan. Ask me questions when something is genuinely
ambiguous. Do not write application code in this session — I want the plan first.

═══════════════════════════════════════════════════════════════════
1 · WHAT THE PRODUCT IS
═══════════════════════════════════════════════════════════════════
"HelioGrid" — a multi-tenant SaaS that solar EPC companies in India run their business on.
EPC = engineering, procurement, construction: companies that sell, design and install solar.
Both residential rooftop and commercial & industrial, both high volume.

The end-to-end journey the product covers:
  company onboarding → user onboarding & roles → lead capture → qualify & assign →
  site survey (remote from satellite imagery, or physical on-site) → 3D design studio →
  proposal builder → a customer-facing link → follow-up (incl. an AI voice agent) → close →
  project management (stages, payments, documents) → dashboards → tenant settings.

India is not a locale here, it is the domain: GST, DISCOM utilities, sanctioned load, net
metering, PM Surya Ghar subsidy, ₹ lakh/crore formatting, TRAI/DND rules for automated
calling, and an English/Hindi/Marathi interface.

═══════════════════════════════════════════════════════════════════
2 · WHAT IS IN THE ATTACHED REPO
═══════════════════════════════════════════════════════════════════
A) THE PRODUCT SPECIFICATION — treat `docs/` as the source of truth.
   · `docs/product-journey.md` — the master reference. Every stage, screen, edge case, and
     THIRTY-EIGHT numbered locked decisions (D1–D38). When anything disagrees, this wins.
   · `docs/build-plan.md` — the phase-by-phase screen tracker (10 phases).
   · `docs/phase-3-prompts.md` … `phase-10-prompts.md` — per-screen functional specs. These
     describe, screen by screen, every tool, state, action and edge case in the product. They
     are the most detailed functional spec you have. Read them.
   · `docs/DESIGN-SYSTEM.md` — the binding visual system ("Instrument": warm graphite + brass).
   The full UX has been designed against these specs already, for mobile 375px and desktop
   1440px.

B) A PROOF-OF-CONCEPT 3D SOLAR DESIGN STUDIO — `src/features/solar-studio/`.
   A working 10-step wizard: site setup → roof tracing (with AI roof detection from satellite
   imagery) → obstructions → components → panel layout → 3D shadow simulation → proposal
   captures → single-line diagram → bill of materials → done.

   ★ THIS IS THE ASSET TO CARRY OVER. The geometry, the engineering logic and the compute are
   real and validated, and must be REUSED — not rewritten. Specifically:
     · `types.ts` — the canonical `Project` model (site, roofs, obstructions, components,
       panel layout, array segments, structure, strings, cable routes, BOM state, pricing,
       captures). This is your best starting point for the database schema.
     · `lib/solar.ts`, `lib/pvgis.ts`, `lib/poa.ts` — energy modelling. Irradiance comes from
       PVGIS (real, measured) with a labelled built-in fallback.
     · `lib/electrical/*`, `lib/electrical-sizing.ts`, `lib/stringing.ts`, `lib/sld.ts` —
       string sizing windows, cold-Voc limits, conductor sizing by ampacity AND voltage drop,
       combiner boxes, single-line diagram parameters, and a hard validity gate.
     · `lib/bom/*` (+ `emitters/`) — the bill of materials across six categories, with
       provenance tiers (measured / derived / estimated / assumed).
     · `lib/roof-ai/*` — roof detection from Google Solar dataLayers + DSM rasters, with a
       Gemini photo-analysis fallback, confidence scoring and a review step.
     · `lib/structure.ts`, `lib/foundation.ts`, `lib/drc.ts` — the parametric mounting
       structure, foundations, and design-rule checks (material estimation only).
     · `lib/health.ts`, `lib/finance.ts`, `lib/insights/*`, `lib/roof-topology.ts`,
       `data/rules/india.ts` — design health scoring, financials, advisory insights, and the
       India rules/config pack.
     · `three/*` — the 3D scene, shadow simulation, instanced panels/structure, heatmap.

C) WHAT THE POC IS NOT — be clear-eyed about the starting point:
   · There is NO backend. No database. No authentication. No multi-tenancy — `types.ts` has
     no tenant, organisation or user concept at all.
   · Persistence is browser-local: project JSON in localStorage (schema v2) plus images in
     IndexedDB. Nothing is shared, synced or durable.
   · The only server code is five thin third-party proxies under `src/app/api/`: PVGIS,
     Gemini, and Google Solar (building-insights, data-layers, geotiff).
   · It is desktop-first: many interactions are hover, right-click, keyboard shortcuts and
     tiny drag handles, with no touch equivalents.
   · It carries leftover freemium gates (a 10 kW capacity cap, "PRO" locks). These must NOT
     survive — see the constraints below.
   · It is single-user, single-device, and not production-hardened.

═══════════════════════════════════════════════════════════════════
3 · CONSTRAINTS — these are decided; plan within them
═══════════════════════════════════════════════════════════════════
1. NEW REPOSITORY, from scratch — do not fork or extend the attached repo. Port the domain
   logic across deliberately, improving it as you go.
2. MULTI-TENANT from day one. Every EPC company is a tenant; users belong to a tenant; all
   data is tenant-scoped. Retrofitting tenancy later is not acceptable.
3. WEB **AND** A REAL MOBILE APP, built together — not a responsive site pretending to be an
   app. Field surveyors need genuine offline capture, a camera, and local-first sync; reps
   and owners need the web app. Plan a shared TypeScript domain layer consumed by both.
4. THE DOMAIN LAYER STAYS TYPESCRIPT. The engineering/compute code above is the product's
   moat; it must be shared by web, mobile and server without a rewrite. Choose a backend that
   respects that.
5. DEPLOYMENT ON FLY.IO. Prefer an India region for latency and data residency. Plan the
   database, object storage, background workers and secrets around Fly.
6. THIS WILL BE BUILT ENTIRELY BY AN AI AGENT (Fable 5 driving Claude Code), not a human
   team. Optimise the architecture for that:
     · schema-first, strongly-typed, explicit contracts everywhere — no implicit magic
     · tests as the executable specification, with machine-verifiable "done" per module
     · repeated, predictable patterns an agent can pattern-match rather than one-off cleverness
     · small modules with clear boundaries and narrow interfaces
     · a conventions file in the repo the agent reads every session
     · every module must be verifiable by running typecheck + tests, not by eyeballing
7. BILLING AND SUBSCRIPTION ARE DEFERRED (decision D38). Design the business model on paper,
   but NO feature is gated by a subscription, and no capacity caps exist in the product.
8. OFFLINE-FIRST WHERE IT MATTERS. Physical survey capture must work with no network at all —
   local first, background sync, never a blocking spinner.
9. MULTILINGUAL: English, Hindi, Marathi. Per-user, not per-tenant. Devanagari affects
   typography and layout, not just strings.
10. THE HONESTY RULES ARE PRODUCT REQUIREMENTS, not polish. Carry them into the data model:
    every user-visible number has a provenance tier (measured / derived / estimated /
    assumed); structural safety is engineer-signed, never computed as a guarantee; money never
    renders as final while stale; the voice agent's contribution is correlation, not
    attribution.
11. THE DESIGN SYSTEM in `docs/DESIGN-SYSTEM.md` is binding for all new UI, and the ported
    studio must be refactored to match it.

═══════════════════════════════════════════════════════════════════
4 · WHAT I WANT FROM YOU — the deliverables
═══════════════════════════════════════════════════════════════════
Produce these as written planning documents in the new project. Be decisive: recommend one
approach and justify it; don't hand me a menu of options.

1. BUSINESS MODEL — keep it simple and concrete. Who pays, for what, and how the pricing is
   shaped (per seat, per project, per kWp, usage-based — pick and defend one). Rough tiers and
   what would eventually limit them. A sketch of unit economics and the main cost drivers
   (voice-agent minutes, satellite/imagery API calls, storage, compute). Who it is sold to and
   how. Remember billing is not being implemented yet — this is the model on paper.

2. SYSTEM ARCHITECTURE — the whole picture: services and module boundaries; how web, mobile
   and server share the domain layer; the offline/sync strategy and conflict resolution;
   background/async work (shading simulation, roof detection, voice-agent calls, document
   generation); third-party integrations (Google Solar, PVGIS, Gemini, telephony for the
   agent, WhatsApp, payments later); file and image storage; authentication, tenancy
   isolation and role-based access for six stackable roles; observability; and India data
   residency.

3. TECH STACK — with justification for each choice: web framework, mobile framework, backend
   runtime and framework, database, ORM/migrations, background jobs/queue, object storage,
   auth, realtime, i18n, testing, CI/CD, and how it all runs on Fly.io. Call out anything the
   3D/geometry work constrains.

4. REPOSITORY & FOLDER STRUCTURE — the actual tree. Decide monorepo vs multi-repo and justify
   it. Show exactly where the shared TypeScript domain package lives and how web, mobile and
   server consume it. Include the conventions/agent-instructions file.

5. DATABASE SCHEMA — full, multi-tenant, with tenancy enforced at the data layer. Cover the
   whole product, not just the studio: tenants, users, roles, leads, activities, surveys and
   their photos, designs (derive this from `types.ts`), proposals and versions, the customer
   link, projects, payment tranches, documents, blockers, the voice agent's config/calls/
   knowledge, catalog and price book (versioned so sent quotes keep their prices), and
   tenant settings. Note where JSONB is the right call versus relational columns — the design
   `Project` object is deeply nested and evolves.

6. MODULE-BY-MODULE IMPLEMENTATION ROADMAP — ordered, starting with authentication and
   tenancy. For EACH module give me:
     · scope and the user-visible outcome
     · the backend work, the web work, and the mobile work — planned together, not separately
     · the data model it introduces or touches, and the API contract
     · which modules it depends on
     · ★ WHAT FUTURE MODULES WILL NEED FROM IT — see the rule below
     · the tests that prove it works, and the definition of done
     · a rough effort/complexity estimate

7. THE FORWARD-COMPATIBILITY RULE — this matters to me more than anything else in the plan.
   When we build module X, it must already account for what modules Y and Z will need from
   it, so we are never forced to rework a finished module. Example: authentication must be
   designed knowing that roles are stackable, that a surveyor's mobile app will authenticate
   offline, that the customer link is a tokenised no-login URL, and that the voice agent acts
   on behalf of a tenant. Make this explicit for every module — I do not want to discover a
   missing foreign key three modules later.

═══════════════════════════════════════════════════════════════════
5 · HOW WE WILL WORK AFTER PLANNING
═══════════════════════════════════════════════════════════════════
Once the plan is agreed, we implement module by module — starting with auth — and for each
module we plan and build backend, web and mobile together before moving on. Structure the
roadmap so each module is a self-contained, verifiable unit of work an agent can complete in
a session or a few, ending green on typecheck and tests.

Start by reading `docs/product-journey.md` and the phase prompts, then the studio's `lib/` and
`types.ts`. Tell me what you have understood and what you need clarified BEFORE you write the
plan. Then produce the deliverables above.
```

---

## What changed alongside this

**Phase 10 is no longer a UX redesign.** The existing 3D studio is kept and *refactored* to the
design system and to production quality — its geometry, engineering logic and code carry over
as-is. `docs/build-plan.md` and `docs/phase-10-prompts.md` are annotated accordingly.
