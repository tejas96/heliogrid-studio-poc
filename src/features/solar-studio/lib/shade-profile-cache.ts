// ─── The last shading analysis, in full, for this session ───────────────────
// computeSolarAccess stores ONE number per module on the project (solar
// access). The engine knows much more per run: every module at every sun
// sample, and which caster took each blocked ray. That detail is what string
// electrical shading and "this tree costs you 1,200 kWh" need — too big to
// persist on the project, cheap to keep in memory keyed by the same
// fingerprint the design sync stamps on `derived.solarAccessFp`.
export interface ShadeProfile {
  /** the sun samples, in engine order */
  samples: { month: number; hour: number; weight: number }[];
  /** module id → clear fraction per sample (0..1), −1 where the sun is behind the module's plane */
  bySample: Map<string, Float32Array>;
  /** module id → caster key ("obstruction:<id>", "panel:<id>", "surround:…") → share of that module's beam budget lost to it */
  byCaster: Map<string, Map<string, number>>;
  /** module id → annual solar access, identical to what the project stores */
  access: Map<string, number>;
}

let current: { fp: string; profile: ShadeProfile } | null = null;
let version = 0;
const listeners = new Set<() => void>();

/** the cards re-render when a profile lands: nothing on the project changes then */
export function subscribeShadeProfile(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function shadeProfileVersion(): number {
  return version;
}

export function setShadeProfile(fp: string, profile: ShadeProfile): void {
  current = { fp, profile };
  version++;
  for (const l of listeners) l();
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    (window as unknown as { __shadeProfile?: unknown }).__shadeProfile = {
      fp: fp.slice(0, 40),
      modules: profile.bySample.size,
      casters: profile.byCaster.size,
      samples: profile.samples.length,
    };
  }
}

/** The profile for exactly this fingerprint, or null when the analysis has not run (or ran for another design). */
export function peekShadeProfile(fp: string | null | undefined): ShadeProfile | null {
  const hit = fp && current && current.fp === fp ? current.profile : null;
  if (!hit && process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    (window as unknown as { __shadeMiss?: unknown }).__shadeMiss = {
      asked: (fp ?? '').slice(0, 40),
      have: current ? current.fp.slice(0, 40) : null,
    };
  }
  return hit;
}
