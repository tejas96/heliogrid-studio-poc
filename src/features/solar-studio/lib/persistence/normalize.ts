// ─── Stored-project normalization (schema resilience) ───────────────────────
// Every project loaded from storage passes through here: fields added after
// launch get defaults, malformed sub-entities are dropped item-by-item
// (all-or-nothing per item, never per project), and one-time field migrations
// run (sldParams snapshot → derived.sldOverrides diff). Pure — no storage I/O.
import type {
  ArraySegment,
  Keepout,
  Project,
  QuoteDiscount,
  SiteWeather,
} from '../../types';
import { isValidSiteWeather } from '../pvgis';
import { deriveSldDefaults, diffSldOverrides } from '../sld';
import { DEFAULT_MARGIN_PCT } from '../../data/pricebook';

/**
 * Validate persisted weather before it can drive energy numbers. A corrupt /
 * truncated / older-schema entry is DROPPED whole (all-or-nothing), so the app
 * cleanly falls back to the estimate instead of rendering NaN bars.
 */
export function normalizeWeather(w: unknown): SiteWeather | undefined {
  return isValidSiteWeather(w) ? w : undefined;
}

/** Additive migrations for arrays added after launch (all-or-nothing per item). */
function isValidSegment(s: unknown): s is ArraySegment {
  const o = s as ArraySegment;
  return (
    !!o &&
    typeof o.id === 'string' &&
    Array.isArray(o.polygon) &&
    Array.isArray(o.removed) &&
    typeof o.rows === 'number' &&
    !!o.racking
  );
}
/**
 * A malformed leg plan drops to AUTO — it does not take the whole table with
 * it. `isValidSegment` is a filter, so validating the plan there would delete
 * every panel on the segment over a bad coordinate.
 *
 * The key is REMOVED rather than set to undefined: `legPlan` is a lazy field,
 * and `layoutFp` appends only when it is present, so a segment that never had
 * a usable plan must serialise exactly as it did before the field existed.
 * An empty point list is treated as no plan for the same reason — it would
 * otherwise mean "a plan that supports nothing", which is not a design anyone
 * intends.
 */
function sanitizeLegPlan(s: ArraySegment): ArraySegment {
  const pts = s.legPlan?.points;
  if (pts === undefined) return s;
  const usable =
    Array.isArray(pts) &&
    pts.length > 0 &&
    pts.every((p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (usable) return s;
  const { legPlan: _dropped, ...rest } = s;
  return rest as ArraySegment;
}

function isValidKeepout(k: unknown): k is Keepout {
  const o = k as Keepout;
  return (
    !!o && typeof o.id === 'string' && Array.isArray(o.shape) && typeof o.heightM === 'number'
  );
}

/** Fill fields added after launch so older saved projects keep working. */
/** A persisted health snapshot must be structurally sound or the health
 *  sheet's delta panel would crash on it — garbage resets to "never scored". */
function isValidHealthSnapshot(hs: unknown): hs is NonNullable<Project['derived']['healthSnapshot']> {
  if (hs == null || typeof hs !== 'object') return false;
  const entryOk = (e: unknown): boolean =>
    e != null &&
    typeof e === 'object' &&
    typeof (e as { key?: unknown }).key === 'string' &&
    Array.isArray((e as { categories?: unknown }).categories);
  const h = hs as { current?: unknown; prev?: unknown };
  return entryOk(h.current) && (h.prev == null || entryOk(h.prev));
}

/**
 * Repair a stored discount, or drop it.
 *
 * Returns a SPREADABLE fragment so an absent rule appends nothing — the
 * lazy-field contract, so a project that never discounted keeps serializing
 * byte-identically and its captures stay fresh. A zero or nonsense value is
 * treated as no discount rather than as a discount of nothing.
 */
function normalizeDiscount(d: QuoteDiscount | undefined): { discount?: QuoteDiscount } {
  if (!d || typeof d !== 'object') return {};
  const kind: QuoteDiscount['kind'] = d.kind === 'amount' ? 'amount' : 'percent';
  if (typeof d.value !== 'number' || !Number.isFinite(d.value) || d.value <= 0) return {};
  // a percentage beyond 100 gives the job away; bomMoney clamps to the quote
  // anyway, but storing 5000% invites a UI to redisplay it as a real setting
  const value = kind === 'percent' ? Math.min(100, d.value) : d.value;
  return { discount: { kind, value, ...(d.label ? { label: d.label } : {}) } };
}

export function normalizeProject(p: Project): Project {
  return {
    ...p,
    // pricing was added after launch — default it (and repair NaN/out-of-range).
    //
    // ⚠️ This REBUILDS the object rather than spreading `p.pricing`, so every
    // field has to be named here or it is silently dropped on load. That is
    // deliberate — it is what repairs a corrupt margin — but it means adding a
    // sibling field to PricingSettings without touching this function produces
    // a value that saves correctly and then vanishes on the next normalize
    // pass. The discount did exactly that until this line existed.
    pricing: {
      marginPct:
        typeof p.pricing?.marginPct === 'number' && Number.isFinite(p.pricing.marginPct)
          ? Math.min(60, Math.max(0, p.pricing.marginPct))
          : DEFAULT_MARGIN_PCT,
      ...normalizeDiscount(p.pricing?.discount),
    },
    // derived-state stamps were added with the fingerprint graph — default them.
    // A legacy project loads with solarAccessFp=null (= "provisional"), so the
    // recompute host re-verifies its shading on first open and stamps it fresh.
    // A legacy sldParams snapshot migrates to the override layer as a DIFF vs
    // freshly-derived params: fields the user never touched go back to being
    // live-derived; only real edits survive as overrides.
    derived: {
      solarAccessFp: typeof p.derived?.solarAccessFp === 'string' ? p.derived.solarAccessFp : null,
      sldOverrides:
        p.derived?.sldOverrides ??
        (p.sldParams ? diffSldOverrides(p.sldParams, deriveSldDefaults(p)) : null),
      sldIntroSeen: p.derived?.sldIntroSeen ?? p.sldParams != null,
      healthSnapshot: isValidHealthSnapshot(p.derived?.healthSnapshot)
        ? p.derived!.healthSnapshot
        : null,
    },
    sldParams: null,
    captures: Array.isArray(p.captures)
      ? p.captures.map((c) => ({
          ...c,
          imageBlobId: c.imageBlobId ?? null,
          forLayoutFp: c.forLayoutFp ?? null,
        }))
      : [],
    coverImageBlobId: p.coverImageBlobId ?? null,
    coverForLayoutFp: p.coverForLayoutFp ?? null,
    insightState: p.insightState ?? {},
    calibration: {
      scaleFactor:
        typeof p.calibration?.scaleFactor === 'number' &&
        Number.isFinite(p.calibration.scaleFactor) &&
        p.calibration.scaleFactor > 0
          ? p.calibration.scaleFactor
          : 1,
      northOffsetDeg:
        typeof p.calibration?.northOffsetDeg === 'number' &&
        Number.isFinite(p.calibration.northOffsetDeg)
          ? p.calibration.northOffsetDeg
          : 0,
      reference: p.calibration?.reference ?? null,
    },
    segments: Array.isArray(p.segments)
      ? p.segments.filter(isValidSegment).map(sanitizeLegPlan)
      : [],
    keepouts: Array.isArray(p.keepouts) ? p.keepouts.filter(isValidKeepout) : [],
    // every entity array must BE an array — a stored shape that passed the
    // top-level parse but carries a non-array field would otherwise crash the
    // recompute host (p.panels.map) on every route, bricking the whole app
    obstructions: Array.isArray(p.obstructions) ? p.obstructions : [],
    panels: Array.isArray(p.panels) ? p.panels : [],
    walkways: Array.isArray(p.walkways) ? p.walkways : [],
    rails: Array.isArray(p.rails) ? p.rails : [],
    arresters: Array.isArray(p.arresters) ? p.arresters : [],
    inverterPlacements: Array.isArray(p.inverterPlacements) ? p.inverterPlacements : [],
    strings: Array.isArray(p.strings) ? p.strings : [],
    bomOverrides: Array.isArray(p.bomOverrides) ? p.bomOverrides : [],
    bom: normalizeBomState(p.bom),
    location: p.location
      ? { ...p.location, weather: normalizeWeather(p.location.weather) }
      : p.location,
    roofs: (Array.isArray(p.roofs) ? p.roofs : []).map((r) => ({
      ...r,
      pitchDeg: r.pitchDeg ?? 0,
      slopeAzimuthDeg: r.slopeAzimuthDeg ?? 180,
      perEdgeSetbacksM: r.perEdgeSetbacksM ?? null,
      parapet: {
        enabled: r.parapet?.enabled ?? false,
        // renderers always drew the band inward regardless of the stored
        // direction, so force 'inward' to preserve what saved projects showed
        direction: 'inward',
        heightM: r.parapet?.heightM ?? 1,
        widthM: r.parapet?.widthM ?? 0.3,
        // perEdge is now boolean[]; coerce any earlier object form
        perEdge: Array.isArray(r.parapet?.perEdge)
          ? r.parapet.perEdge.map((e: unknown) =>
              typeof e === 'boolean' ? e : (e as { enabled?: boolean })?.enabled ?? true,
            )
          : null,
        suppressSharedEdges: r.parapet?.suppressSharedEdges ?? true,
      },
    })),
  };
}

/**
 * Validate a persisted `bom` block (Phase 22c).
 *
 * Deliberately does NOT migrate legacy `bomOverrides` here. Migration re-derives
 * the whole BOM to resolve the old `category|item` key, which normalize must
 * stay clear of — it runs on every load, for every project, before the store
 * exists. The store migrates lazily on the first BOM edit instead, and until
 * then `mergedBomResult` keeps honouring the legacy array unchanged.
 */
function normalizeBomState(b: unknown): Project['bom'] {
  if (!b || typeof b !== 'object') return undefined;
  const raw = b as Record<string, unknown>;
  const overrides = Array.isArray(raw.overrides)
    ? raw.overrides.filter(
        (o): o is { lineKey: string; fields: Record<string, { value: unknown; autoAtEdit: unknown }> } =>
          !!o &&
          typeof o === 'object' &&
          typeof (o as Record<string, unknown>).lineKey === 'string' &&
          !!(o as Record<string, unknown>).fields &&
          typeof (o as Record<string, unknown>).fields === 'object',
      )
    : [];
  const custom = Array.isArray(raw.custom) ? (raw.custom as Project['bomOverrides']) : [];
  const inputsRaw = raw.inputs as Record<string, unknown> | undefined;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const inputs =
    inputsRaw && typeof inputsRaw === 'object'
      ? { avgDcRunM: num(inputsRaw.avgDcRunM), avgAcRunM: num(inputsRaw.avgAcRunM) }
      : undefined;
  // an empty block is indistinguishable from absent — keep it absent so the
  // fingerprint stays byte-identical for a project that never edited its BOM
  if (overrides.length === 0 && custom.length === 0 && !inputs?.avgDcRunM && !inputs?.avgAcRunM) {
    return undefined;
  }
  return { overrides, custom, ...(inputs ? { inputs } : {}) };
}
