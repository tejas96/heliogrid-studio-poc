// ─── Saved projects gain a site frame WITHOUT their geometry moving ─────────
// Spec decision A8. Stored local metres came from two sources: hand-traced (from
// the canvas, already true metres) and AI-detected (through the buggy projector,
// stretched 0.57%). There is no single correct inverse, so silently moving a
// user's traced roof would be worse than leaving it. The frame is added; the
// numbers are untouched. Re-running detection is what corrects an old design.
import { describe, expect, it } from 'vitest';
import { normalizeProject } from '../persistence/normalize';
import { frameFor, makeSiteFrame, toEN } from '../site/frame';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Project } from '../../types';

const PUNE = { lat: 18.5202, lng: 73.8567 };

/**
 * fixtureProject() is built on newProject(), which sets `location: null` — a
 * blank project has no site. These tests need a CONFIRMED location, so each
 * builds one explicitly rather than assuming the fixture has one.
 */
function locatedProject(): Project {
  const p = fixtureProject();
  return {
    ...p,
    location: {
      address: 'Test site, Pune',
      latLng: PUNE,
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'test',
    },
    siteFrame: makeSiteFrame(PUNE),
  };
}

/** Round-trip through JSON, the way a stored project actually arrives. */
const stored = (p: unknown) => JSON.parse(JSON.stringify(p));

describe('normalizeProject adds a site frame', () => {
  it('builds one from the confirmed location when absent', () => {
    const raw = stored({ ...locatedProject(), siteFrame: undefined });
    const out = normalizeProject(raw);
    expect(out.siteFrame).not.toBeNull();
    expect(out.siteFrame!.origin).toEqual(PUNE);
    expect(out.siteFrame!.utmZone).toBe(43);
  });

  it('seeds scaleFactor and northOffsetDeg from the existing calibration', () => {
    const raw = stored({
      ...locatedProject(),
      siteFrame: undefined,
      calibration: { scaleFactor: 1.031, northOffsetDeg: 7.5, reference: null },
    });
    const out = normalizeProject(raw);
    expect(out.siteFrame!.scaleFactor).toBeCloseTo(1.031, 6);
    expect(out.siteFrame!.northOffsetDeg).toBeCloseTo(7.5, 6);
  });

  it('leaves the frame null when there is no location — the blank-project case', () => {
    const raw = stored({ ...fixtureProject(), siteFrame: undefined });
    expect(raw.location).toBeNull();
    expect(normalizeProject(raw).siteFrame).toBeNull();
  });

  it('does not move one single coordinate', () => {
    const p = locatedProject();
    p.roofs = [fixtureRoof()];
    const raw = stored({ ...p, siteFrame: undefined });
    const before = JSON.stringify(raw.roofs);
    const out = normalizeProject(raw);
    expect(JSON.stringify(out.roofs)).toBe(before);
  });

  it('keeps an already-stored frame rather than rebuilding it', () => {
    // The stored frame must AGREE with its calibration to be kept — a frame at
    // 12° beside a calibration at 0° is the stale state the F2 block below
    // rebuilds. So the calibration carries 12° too, and the by-reference check
    // is what proves the keep-stored branch ran (a rebuild would also read 12).
    const raw = stored({
      ...locatedProject(),
      calibration: { scaleFactor: 1, northOffsetDeg: 12, reference: null },
    });
    raw.siteFrame = { ...raw.siteFrame, northOffsetDeg: 12 };
    const out = normalizeProject(raw);
    expect(out.siteFrame!.northOffsetDeg).toBe(12);
    expect(out.siteFrame).toBe(raw.siteFrame);
  });

  it('rebuilds a frame whose origin no longer matches the location', () => {
    // An older build could have moved the pin without updating the frame.
    // The location is authoritative.
    const raw = stored(locatedProject());
    raw.siteFrame = { ...raw.siteFrame, origin: { lat: 0, lng: 0 } };
    expect(normalizeProject(raw).siteFrame!.origin).toEqual(PUNE);
  });

  it('rebuilds when the stored frame has scaleFactor: 0 — matches typeof but fails the domain check', () => {
    // typeof 0 === 'number' is true, so a type-only guard would wrongly trust
    // this. The fresh-build path already refuses a non-positive scaleFactor
    // (falls back to 1); the stored-frame branch must refuse one exactly the
    // same way rather than passing a zero scale through unchanged.
    const raw = stored({
      ...locatedProject(),
      calibration: { scaleFactor: 1.2, northOffsetDeg: 3, reference: null },
    });
    raw.siteFrame = { ...raw.siteFrame, scaleFactor: 0 };
    expect(normalizeProject(raw).siteFrame!.scaleFactor).toBe(1.2);
  });

  it('rebuilds when the stored frame has a negative scaleFactor', () => {
    const raw = stored({
      ...locatedProject(),
      calibration: { scaleFactor: 1.2, northOffsetDeg: 3, reference: null },
    });
    raw.siteFrame = { ...raw.siteFrame, scaleFactor: -1 };
    expect(normalizeProject(raw).siteFrame!.scaleFactor).toBe(1.2);
  });

  it('still trusts a stored frame by reference when its scaleFactor is genuinely valid', () => {
    // Regression guard for the two tests above: the stricter check must not
    // start rejecting a valid stored frame. The calibration carries the same
    // 2.5 (a frame that disagrees with its calibration is rebuilt — see the
    // F2 block below), so the by-reference assertion is what distinguishes
    // the "keep stored" branch from a rebuild that would also read 2.5.
    const raw = stored({
      ...locatedProject(),
      calibration: { scaleFactor: 2.5, northOffsetDeg: 0, reference: null },
    });
    raw.siteFrame = { ...raw.siteFrame, scaleFactor: 2.5 };
    const out = normalizeProject(raw);
    expect(out.siteFrame!.scaleFactor).toBe(2.5);
    expect(out.siteFrame).toBe(raw.siteFrame);
  });

  it('rebuilds a stored frame that is missing utmOrigin — the first slice-2 read would crash', () => {
    // Every field of SiteFrame is validated, not just the four the original
    // guard looked at. A frame without utmOrigin passed before this check and
    // would have thrown on the first `frame.utmOrigin.e` (toUtm/fromUtm).
    const raw = stored(locatedProject());
    delete raw.siteFrame.utmOrigin;
    const out = normalizeProject(raw).siteFrame!;
    expect(out).not.toBe(raw.siteFrame);
    expect(out.utmOrigin).toEqual(makeSiteFrame(PUNE).utmOrigin);
    expect(Number.isFinite(out.utmOrigin.e)).toBe(true);
    expect(Number.isFinite(out.utmOrigin.n)).toBe(true);
  });

  it('rebuilds when utmOrigin, utmNorth or convergenceDeg is malformed', () => {
    const fresh = makeSiteFrame(PUNE);
    const cases: Record<string, (f: Record<string, unknown>) => void> = {
      'utmOrigin.e is a string': (f) => { f.utmOrigin = { e: '386730', n: 2047619 }; },
      'utmOrigin.n is null': (f) => { f.utmOrigin = { e: 386730, n: null }; },
      'utmNorth missing': (f) => { delete f.utmNorth; },
      'utmNorth is a string': (f) => { f.utmNorth = 'N'; },
      'convergenceDeg missing': (f) => { delete f.convergenceDeg; },
      'convergenceDeg is null': (f) => { f.convergenceDeg = null; },
    };
    for (const [label, mangle] of Object.entries(cases)) {
      const raw = stored(locatedProject());
      mangle(raw.siteFrame);
      const out = normalizeProject(raw).siteFrame!;
      expect(out, label).not.toBe(raw.siteFrame);
      expect(out.utmNorth, label).toBe(fresh.utmNorth);
      expect(out.utmOrigin, label).toEqual(fresh.utmOrigin);
      expect(out.convergenceDeg, label).toBe(fresh.convergenceDeg);
    }
  });
});

describe('calibration is authoritative for scaleFactor and northOffsetDeg', () => {
  // CalibrateDialog (Step2Roof.tsx) writes calibration.scaleFactor and
  // calibration.northOffsetDeg and never touches siteFrame, so every project
  // calibrated before this check carried e.g. calibration.northOffsetDeg = 7
  // beside siteFrame.northOffsetDeg = 0 — permanently, because the origin
  // still matched and the origin was all that was compared. toEN applies the
  // offset, so that was a live 2.4 m error in the roof-hint matcher.
  it('normalizeProject rebuilds a stored frame that still carries the pre-calibration offset', () => {
    const raw = stored({
      ...locatedProject(),
      calibration: { scaleFactor: 1, northOffsetDeg: 7, reference: null },
    });
    expect(raw.siteFrame.northOffsetDeg).toBe(0); // the stale state, as saved
    const out = normalizeProject(raw).siteFrame!;
    expect(out).not.toBe(raw.siteFrame);
    expect(out.northOffsetDeg).toBe(7);
    expect(out.origin).toEqual(PUNE); // only the offset was stale
  });

  it('normalizeProject rebuilds when scaleFactor drifts from the calibration', () => {
    const raw = stored({
      ...locatedProject(),
      calibration: { scaleFactor: 1.031, northOffsetDeg: 0, reference: null },
    });
    expect(raw.siteFrame.scaleFactor).toBe(1);
    const out = normalizeProject(raw).siteFrame!;
    expect(out).not.toBe(raw.siteFrame);
    expect(out.scaleFactor).toBeCloseTo(1.031, 6);
  });

  it('normalizeProject keeps a frame that agrees with its calibration, by reference', () => {
    const raw = stored({
      ...locatedProject(),
      calibration: { scaleFactor: 1.031, northOffsetDeg: 7, reference: null },
      siteFrame: makeSiteFrame(PUNE, { scaleFactor: 1.031, northOffsetDeg: 7 }),
    });
    expect(normalizeProject(raw).siteFrame).toBe(raw.siteFrame);
  });

  it('frameFor rebuilds a stored frame that disagrees with the calibration', () => {
    const p = locatedProject(); // frame at scale 1, offset 0
    const calibrated: Project = {
      ...p,
      calibration: { scaleFactor: 1.02, northOffsetDeg: 7, reference: null },
    };
    const f = frameFor(calibrated)!;
    expect(f).not.toBe(p.siteFrame);
    expect(f.scaleFactor).toBe(1.02);
    expect(f.northOffsetDeg).toBe(7);
    // and the rebuilt frame really rotates: a point due north now leans onto
    // +x by sin(7°) — the number the roof-hint matcher was getting wrong
    const en = toEN(f, { lat: PUNE.lat + 0.001, lng: PUNE.lng });
    expect(en.x).toBeCloseTo(110.686 * Math.sin((7 * Math.PI) / 180), 1);
    expect(en.y).toBeCloseTo(110.686 * Math.cos((7 * Math.PI) / 180), 1);
  });

  it('frameFor returns a frame that agrees with its calibration by reference', () => {
    const p = locatedProject();
    const calibrated: Project = {
      ...p,
      calibration: { scaleFactor: 1.02, northOffsetDeg: 7, reference: null },
      siteFrame: makeSiteFrame(PUNE, { scaleFactor: 1.02, northOffsetDeg: 7 }),
    };
    expect(frameFor(calibrated)).toBe(calibrated.siteFrame);
  });
});

describe('frameFor', () => {
  it('returns the stored frame when its origin matches the location', () => {
    const p = locatedProject();
    expect(frameFor(p)).toBe(p.siteFrame);
  });

  it('rebuilds when the stored frame is stale', () => {
    const p = locatedProject();
    const stale = { ...p, siteFrame: makeSiteFrame({ lat: 0, lng: 0 }) };
    expect(frameFor(stale)!.origin).toEqual(PUNE);
  });

  it('returns null for a project with no location', () => {
    expect(frameFor(fixtureProject())).toBeNull();
  });
});
