// ─── Sibling roof faces (one footprint → N adjacent Roofs) ──────────────────
// A pitched roof is modelled as several ADJACENT `Roof` objects (gable = 2,
// hip = 4, skeleton = N). They only describe a buildable roof while they share
// ONE eave height and ONE pitch: that is what makes the ridge level and the
// hips run true. Editing a single face used to break that silently — a 20° face
// next to a 30° one leaves a ~1 m step at the ridge that the tool would happily
// render, quote and export.
//
// `faceGroupId` links faces created together; this module is the one place that
// decides what a shared edit means. Roofs WITHOUT the field (i.e. everything
// ever saved before it existed) fall through to plain per-roof behavior.
import type { Roof } from '../types';

/**
 * Fields that define the roof PLANE the whole group shares. Editing one face's
 * value is really editing the roof, so it lands on every sibling.
 *
 * slopeAzimuthDeg is deliberately NOT here: each face genuinely faces its own
 * way (a gable's two halves are 180° apart), so propagating it would collapse
 * the roof into a single plane.
 */
export const FACE_GROUP_SHARED_KEYS = ['pitchDeg', 'heightM'] as const;

export type FaceGroupSharedKey = (typeof FACE_GROUP_SHARED_KEYS)[number];

/**
 * Every roof that a shared edit on `id` touches, target FIRST.
 * A roof with no faceGroupId is its own group of one — unchanged behavior.
 */
export function faceGroupMembers(roofs: Roof[], id: string): Roof[] {
  const target = roofs.find((r) => r.id === id);
  if (!target) return [];
  const gid = target.faceGroupId;
  if (!gid) return [target];
  return [target, ...roofs.filter((r) => r.id !== id && r.faceGroupId === gid)];
}

/** Ids a shared edit on `id` would touch, target first. */
export function faceGroupMemberIds(roofs: Roof[], id: string): string[] {
  return faceGroupMembers(roofs, id).map((r) => r.id);
}

/** The subset of a patch that belongs to the whole roof rather than one face. */
export function sharedPart(patch: Partial<Roof>): Partial<Roof> {
  const out: Partial<Roof> = {};
  for (const k of FACE_GROUP_SHARED_KEYS) {
    if (patch[k] !== undefined) (out as Record<string, unknown>)[k] = patch[k];
  }
  return out;
}

/**
 * Apply `patch` to roof `id`, and the plane-defining part of it (pitch, eave
 * height) to that roof's siblings. Pure — returns a new array, and returns the
 * SAME roof objects for anything untouched so referential checks stay cheap.
 *
 * `changedIds` lists every roof whose values actually moved, target first —
 * callers use it to remap the panels sitting on those faces in the same patch.
 */
export function applyFaceGroupPatch(
  roofs: Roof[],
  id: string,
  patch: Partial<Roof>,
): { roofs: Roof[]; changedIds: string[] } {
  const target = roofs.find((r) => r.id === id);
  if (!target) return { roofs, changedIds: [] };

  const shared = sharedPart(patch);
  const gid = target.faceGroupId;
  const propagates = !!gid && Object.keys(shared).length > 0;

  const changedIds: string[] = [id];
  const next = roofs.map((r) => {
    if (r.id === id) return { ...r, ...patch };
    if (!propagates || r.faceGroupId !== gid) return r;
    // skip siblings that already hold these values — no needless object churn
    if (FACE_GROUP_SHARED_KEYS.every((k) => shared[k] === undefined || r[k] === shared[k])) {
      return r;
    }
    changedIds.push(r.id);
    return { ...r, ...shared };
  });

  return { roofs: next, changedIds };
}
