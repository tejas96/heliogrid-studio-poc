import { beforeEach, describe, expect, it } from 'vitest';
import type { Project, ShadowCapture } from '../../types';
import { preProposalReview } from '../review';
import { layoutFp } from '../fingerprints';
import { fixtureProject } from './fixtures/project';
import { clearAnalyzers } from '../insights/registry';
import { registerAllAnalyzers } from '../insights/analyzers';

beforeEach(() => {
  clearAnalyzers();
  registerAllAnalyzers();
});

const capture = (id: string, fp: string | null): ShadowCapture => ({
  id,
  label: id,
  dateIso: '2026-06-21',
  hour: 10,
  mode: 'shadow',
  imageBlobId: `blob_${id}`,
  forLayoutFp: fp,
});

function withCaptures(p: Project, fp: string | null, n = 4): Project {
  return { ...p, captures: Array.from({ length: n }, (_, i) => capture(`c${i}`, fp)) };
}

describe('preProposalReview — the four readiness signals', () => {
  it('always reports all four, each pointing at the step that can fix it', () => {
    const r = preProposalReview(fixtureProject());
    expect(r.items.map((i) => i.key)).toEqual([
      'electrical',
      'insights',
      'bom-confidence',
      'captures',
    ]);
    for (const i of r.items) expect(i.step).toBeGreaterThan(0);
  });

  it('a design with no strings is BLOCKED, and says so in the user’s language', () => {
    const p = { ...fixtureProject(), strings: [] };
    const r = preProposalReview(p);
    const el = r.items.find((i) => i.key === 'electrical')!;
    expect(el.status).toBe('blocked');
    expect(r.overall).toBe('blocked');
    expect(r.issuable).toBe(false);
  });

  it('agrees with the wizard gate — it derives from the SAME function', () => {
    // the whole point of §A0: two answers to "is this issuable?" cannot exist
    const good = preProposalReview(fixtureProject());
    expect(good.items.find((i) => i.key === 'electrical')!.status).not.toBe('blocked');
  });
});

describe('capture staleness', () => {
  it('flags captures taken against an older layout', () => {
    const p = withCaptures(fixtureProject(), 'some-old-fingerprint');
    const cap = preProposalReview(p).items.find((i) => i.key === 'captures')!;
    expect(cap.status).toBe('attention');
    expect(cap.detail).toMatch(/older version/);
  });

  it('passes when every capture matches the current layout', () => {
    const base = fixtureProject();
    const p = withCaptures(base, layoutFp(base));
    const cap = preProposalReview(p).items.find((i) => i.key === 'captures')!;
    expect(cap.status).toBe('ready');
  });

  it('counts missing captures separately from stale ones', () => {
    const base = fixtureProject();
    const p = withCaptures(base, layoutFp(base), 2);
    const cap = preProposalReview(p).items.find((i) => i.key === 'captures')!;
    expect(cap.status).toBe('attention');
    expect(cap.detail).toMatch(/2 of 4/);
  });

  it('never BLOCKS on imagery — a missing photo is not an engineering fault', () => {
    const p = { ...fixtureProject(), captures: [] };
    const cap = preProposalReview(p).items.find((i) => i.key === 'captures')!;
    expect(cap.status).not.toBe('blocked');
  });
});

describe('quantity confidence', () => {
  it('reports preliminary when any line is estimated or assumed', () => {
    const conf = preProposalReview(fixtureProject()).items.find(
      (i) => i.key === 'bom-confidence',
    )!;
    // the fixture carries cable/earthing allowances, which are assumed by design
    expect(conf.status).toBe('attention');
    expect(conf.detail).toMatch(/site verification/i);
  });
});

describe('overall status', () => {
  it('blocked beats attention', () => {
    const p = { ...fixtureProject(), strings: [] };
    expect(preProposalReview(p).overall).toBe('blocked');
  });

  it('issuable is true whenever nothing is blocked', () => {
    const base = fixtureProject();
    const r = preProposalReview(withCaptures(base, layoutFp(base)));
    expect(r.issuable).toBe(true);
  });

  it('is deterministic — same project, same result', () => {
    const p = fixtureProject();
    expect(preProposalReview(p)).toEqual(preProposalReview(p));
  });
});
