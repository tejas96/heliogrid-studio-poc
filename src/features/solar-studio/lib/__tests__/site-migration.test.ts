// ─── Saved projects gain a site frame WITHOUT their geometry moving ─────────
// Spec decision A8. Stored local metres came from two sources: hand-traced (from
// the canvas, already true metres) and AI-detected (through the buggy projector,
// stretched 0.57%). There is no single correct inverse, so silently moving a
// user's traced roof would be worse than leaving it. The frame is added; the
// numbers are untouched. Re-running detection is what corrects an old design.
import { describe, expect, it } from 'vitest';
import { normalizeProject } from '../persistence/normalize';
import { frameFor, makeSiteFrame } from '../site/frame';
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
    const raw = stored(locatedProject());
    raw.siteFrame = { ...raw.siteFrame, northOffsetDeg: 12 };
    expect(normalizeProject(raw).siteFrame!.northOffsetDeg).toBe(12);
  });

  it('rebuilds a frame whose origin no longer matches the location', () => {
    // An older build could have moved the pin without updating the frame.
    // The location is authoritative.
    const raw = stored(locatedProject());
    raw.siteFrame = { ...raw.siteFrame, origin: { lat: 0, lng: 0 } };
    expect(normalizeProject(raw).siteFrame!.origin).toEqual(PUNE);
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
