// ─── Gate: a changed MODEL must invalidate the captures that depict it ──────
// Found by auditing Phase 22 for the pattern that produced the 9-tonne shed:
// a default changes, the new path is verified, and nobody asks what happens to
// data that already exists.
//
// `layoutFp` stringifies the STORED racking, and every structural field is
// lazy. A project that never chose a foundation has identical stored bytes
// before and after the built-in default moves — so its fingerprint does not
// change, and its captures keep reporting FRESH while the scene has gained a
// pedestal under every leg. No conditional-append trick can catch that: there
// is no field to append. The MODEL itself has to be part of the key.
import { describe, expect, it } from 'vitest';
import { layoutFp } from '../fingerprints';
import { projectStructures, structureModelVersion } from '../structure';
import { isCaptureFresh } from '../fingerprints';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { FoundationKind, Project } from '../../types';

function proj(foundation?: FoundationKind): Project {
  const base = fixtureProject(0);
  const p: Project = { ...base, roofs: [fixtureRoof()] };
  const f = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
    ...DEFAULT_FILL,
    maxPanels: 8,
  })!;
  const seg = foundation
    ? { ...f.segment, racking: { ...f.segment.racking, foundation } }
    : f.segment;
  return { ...p, segments: [seg], panels: f.panels };
}

describe('the structure model version is in the layout key', () => {
  it('layoutFp carries the stamp', () => {
    expect(layoutFp(proj())).toContain(`|sm:${structureModelVersion()}`);
  });

  it('the stamp is a real value, not an empty string', () => {
    expect(structureModelVersion().length).toBeGreaterThan(0);
  });

  it('a capture taken under the CURRENT model reads fresh', () => {
    const p = proj();
    const fp = layoutFp(p);
    const withCapture: Project = {
      ...p,
      captures: [
        {
          id: 'c1',
          imageBlobId: 'b1',
          forLayoutFp: fp,
        } as unknown as Project['captures'][number],
      ],
    };
    expect(isCaptureFresh(withCapture, withCapture.captures[0])).toBe(true);
  });

  it('a capture taken under an OLDER model reads STALE', () => {
    // this is the whole point: the same stored design, captured before the
    // model changed, must not claim to depict the current one
    const p = proj();
    const oldFp = layoutFp(p).replace(`|sm:${structureModelVersion()}`, '|sm:sm1');
    const withCapture: Project = {
      ...p,
      captures: [
        {
          id: 'c1',
          imageBlobId: 'b1',
          forLayoutFp: oldFp,
        } as unknown as Project['captures'][number],
      ],
    };
    expect(isCaptureFresh(withCapture, withCapture.captures[0])).toBe(false);
  });
});

describe('why the stamp is needed at all', () => {
  it('the fingerprint tracks STORED bytes, not the resolved structure', () => {
    // absent vs explicitly-set-to-the-same-value: identical resolved
    // structure, different fingerprint. That is the lazy-field contract
    // working — and the reason a moving default is invisible to it.
    const absent = proj();
    const explicitSame = proj('concrete');
    expect(projectStructures(absent)[0].foundation).toBe(
      projectStructures(explicitSame)[0].foundation,
    );
    expect(layoutFp(absent)).not.toBe(layoutFp(explicitSame));
  });

  it('a lazy field still contributes nothing when absent, apart from the stamp', () => {
    // the conditional-append contract is intact: the ONLY unconditional
    // additions to layoutFp are the ones that cannot be conditional
    const fp = layoutFp(proj());
    const withoutStamp = fp.slice(0, fp.lastIndexOf('|sm:'));
    expect(withoutStamp).not.toContain('|sm:');
    expect(withoutStamp.length).toBeGreaterThan(0);
  });
});
