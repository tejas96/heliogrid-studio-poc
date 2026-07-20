// @vitest-environment jsdom
// ─── DOM gates for the Legs (2D) editor ─────────────────────────────────────
// The decisions are already pinned purely in lib/leg-plan-edit. What could
// only be checked by hand until the harness existed is the WIRING: that a key
// press reaches the right decision, that a refusal is announced rather than
// swallowed, and that every leg is actually focusable.
//
// This component is plain SVG with no R3F, so jsdom can render it. Anything
// inside <Canvas> still cannot be tested this way.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LegPlanEditor } from '../LegPlanEditor';
import { fixtureProject, fixtureRoof } from '../../lib/__tests__/fixtures/project';
import { segmentFrameAngle } from '../../lib/segment-ops';
import { rotate } from '../../lib/geo';
import type { ArraySegment, PlacedPanel, Project, XY } from '../../types';

afterEach(cleanup);

const W = 1.134;
const GAP = 0.05;

function scene(legPlan?: { points: XY[] }) {
  const base = fixtureProject(0);
  const roof = fixtureRoof();
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: roof.id,
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: 8,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 0,
      frontLegM: 0.3,
      backLegM: 0.3,
      profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 },
    },
    moduleGapM: GAP,
    removed: [],
    ...(legPlan ? { legPlan } : {}),
  };
  const angle = segmentFrameAngle(roof, seg, []);
  const panels: PlacedPanel[] = [0, 1, 2, 3].map((c) => ({
    id: `pv_${c}`,
    roofId: roof.id,
    center: rotate({ x: c * (W + GAP), y: 0 }, angle),
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: c,
  }));
  const project: Project = { ...base, roofs: [roof], segments: [seg], panels };
  return { project, roof, seg, panels };
}

function renderEditor(legPlan?: { points: XY[] }, onPatch = vi.fn()) {
  const { project, roof, seg, panels } = scene(legPlan);
  render(
    <LegPlanEditor
      project={project}
      roof={roof}
      seg={seg}
      spec={project.components.panel!}
      panels={panels}
      legSpacingM={2}
      onPatch={onPatch}
      fmtLen={(m) => `${m.toFixed(2)} m`}
    />,
  );
  return { onPatch, project };
}

const legs = () => screen.queryAllByRole('button').filter((b) => /^Leg \d+ of/.test(b.getAttribute('aria-label') ?? ''));

describe('what the editor shows', () => {
  it('AUTO shows the automatic stations rather than an empty roof', () => {
    // it used to draw nothing at all, which reads as "your legs are gone"
    const { container } = render(<div />);
    cleanup();
    renderEditor();
    expect(screen.getByText('AUTO')).toBeDefined();
    // dimmed, aria-hidden ghosts — visible but not in the tab order
    const ghosts = document.querySelectorAll('g[aria-hidden][opacity]');
    expect(ghosts.length).toBeGreaterThan(0);
    expect(legs()).toHaveLength(0); // nothing editable yet
    void container;
  });

  it('CUSTOM shows the real legs, each focusable and named', () => {
    renderEditor({ points: [{ x: 0, y: 0 }, { x: 1.5, y: 0 }] });
    expect(screen.getByText(/CUSTOM · 2 legs/i)).toBeDefined();
    const l = legs();
    expect(l).toHaveLength(2);
    for (const el of l) expect(el.getAttribute('tabindex')).toBe('0');
    expect(l[0].getAttribute('aria-label')).toMatch(/Leg 1 of 2/);
  });

  it('Reset to auto appears only when there is a plan to reset', () => {
    renderEditor({ points: [{ x: 0, y: 0 }] });
    expect(screen.getByText(/Reset to auto/i)).toBeDefined();
    cleanup();
    renderEditor();
    expect(screen.queryByText(/Reset to auto/i)).toBeNull();
  });

  it('the whole plan carries usage instructions for a screen reader', () => {
    renderEditor({ points: [{ x: 0, y: 0 }] });
    const svg = document.querySelector('svg[aria-label*="Leg plan"]')!;
    expect(svg.getAttribute('aria-label')).toMatch(/arrow keys/i);
    expect(svg.getAttribute('aria-label')).toMatch(/Delete/i);
  });
});

describe('keyboard reaches the decisions', () => {
  it('an arrow key on a focused leg commits ONE patch', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderEditor({ points: [{ x: 0, y: 0 }, { x: 1.5, y: 0 }] });

    legs()[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(onPatch).toHaveBeenCalledTimes(1);
    const patch = onPatch.mock.calls[0][0] as { segments: ArraySegment[] };
    expect(patch.segments[0].legPlan!.points[0].x).toBeCloseTo(0.25, 6);
  });

  it('Delete removes the focused leg', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderEditor({ points: [{ x: 0, y: 0 }, { x: 1.5, y: 0 }] });

    legs()[1].focus();
    await user.keyboard('{Delete}');
    expect(onPatch).toHaveBeenCalledTimes(1);
    const patch = onPatch.mock.calls[0][0] as { segments: ArraySegment[] };
    expect(patch.segments[0].legPlan!.points).toHaveLength(1);
  });

  it('Shift+Arrow is the fine step', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderEditor({ points: [{ x: 0, y: 0 }] });

    legs()[0].focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    const patch = onPatch.mock.calls[0][0] as { segments: ArraySegment[] };
    expect(patch.segments[0].legPlan!.points[0].x).toBeCloseTo(0.05, 6);
  });

  it('every action is announced', async () => {
    const user = userEvent.setup();
    renderEditor({ points: [{ x: 0, y: 0 }] });
    legs()[0].focus();
    await user.keyboard('{ArrowRight}');

    const live = document.querySelector('[role="status"][aria-live="polite"]')!;
    expect(live.textContent).toMatch(/moved/i);
  });
});

describe('a refusal is surfaced, never swallowed', () => {
  it('nudging a leg off the roof announces WHY and commits nothing', async () => {
    const user = userEvent.setup();
    // sits at the very edge of the buildable region, so one nudge leaves it
    const { onPatch } = renderEditor({ points: [{ x: 9998.9, y: 0 }] });

    // asserted, not guarded — an `if (found)` here would pass silently the day
    // the leg stops rendering, which is exactly the failure it should catch
    const l = legs();
    expect(l, 'the out-of-bounds leg must still render and be focusable').toHaveLength(1);

    l[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(onPatch).not.toHaveBeenCalled();
    const live = document.querySelector('[role="status"][aria-live="polite"]')!;
    expect(live.textContent).toMatch(/setback|buildable/i);
  });
});

describe('Reset to auto', () => {
  it('clears the plan through the same path the tests pin', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderEditor({ points: [{ x: 0, y: 0 }] });

    await user.click(screen.getByText(/Reset to auto/i));
    expect(onPatch).toHaveBeenCalledTimes(1);
    const patch = onPatch.mock.calls[0][0] as { segments: ArraySegment[] };
    expect('legPlan' in patch.segments[0]).toBe(false);
  });
});
