// ─── The one constructor every emitter builds its lines with ────────────────
import type { BomLine } from '../../types';
import { wastePctFor, type LineKey } from './registry';
import { gstPctFor } from '../../data/gst';

/** Everything an emitter supplies; the rest is filled in here. */
export type LineInput = Omit<BomLine, 'id' | 'auto' | 'overridden' | 'confidence'> &
  Partial<Pick<BomLine, 'confidence' | 'sourceRoofId' | 'sourceSegmentId'>>;

/**
 * @param key      what this line MEANS (stable across designs)
 * @param instance for line kinds emitted once PER source (profile, covering);
 *                 appended as `key:instance` so ids stay unique in a derivation
 */
export function line(l: LineInput & { key: LineKey; instance?: string }): BomLine {
  const { key, instance, ...rest } = l;
  // 'derived' is the honest default: a quantity computed from the design. Lines
  // that are a direct COUNT (stronger) or depend on unmodelled facts (weaker)
  // pass their own confidence.
  const id = instance === undefined ? key : `${key}:${instance}`;
  return {
    confidence: 'derived',
    // Procurement defaults resolve from the registry by LineKey (Phase 22d).
    // An emitter may still pass its own — an explicit value always wins.
    included: true,
    wastePct: wastePctFor(id),
    gstPct: gstPctFor(rest.category, id),
    ...rest,
    id,
    auto: true,
    overridden: false,
  };
}

/**
 * The roof/segment a line genuinely came from — or nothing.
 *
 * Several lines aggregate over sources (one steel line per PROFILE, one flashing
 * line per COVERING, one down-conductor line for all arresters). Naming a single
 * source on such a line is only honest when there IS a single source; otherwise
 * the field stays undefined rather than arbitrarily picking the first, which
 * would make BOM↔3D focus highlight the wrong roof.
 */
export function soleSource(ids: (string | undefined)[]): string | undefined {
  const present = new Set(ids.filter((v): v is string => v !== undefined));
  return present.size === 1 ? [...present][0] : undefined;
}
