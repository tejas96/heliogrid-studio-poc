// @vitest-environment jsdom
// ─── Gate: setting a capacity must not re-design the whole site ─────────────
// The defect this exists for froze the wizard on any utility-scale project,
// and every other test in the suite passed while it was live — because it was
// not in the arithmetic. It was in WHERE a computation ran.
//
// Step 4 derived its DC numerator like this, during RENDER:
//
//     const cur = memoizedComparison(project).rows.find((r) => r.isCurrent);
//
// `memoizedComparison` lays out the entire site once per shortlisted module —
// six full designs — and runs an energy report on each. The line was reached
// only once `targetKwp > 0`, which is exactly the state the "Auto" button
// creates. So on a 23 ha field the op ran, the reducer produced the right
// capacity, React re-rendered, and the main thread went into the comparison:
// measured in the browser, still blocked 30,003 ms later. The commit never
// landed, the field stayed empty, nothing was saved, and `lib/wizard-gate.ts`
// kept refusing to advance while `targetKwp <= 0`. The app looked dead rather
// than busy, and a large ground-mount project could not be designed at all.
//
// TIMING IS NOT THE GATE. In jsdom, with no neighbourhood height map and no
// typical-year weather loaded, the same comparison finishes in about three
// seconds — fast enough to pass a stopwatch assertion while the real browser
// hangs. So this pins the STRUCTURE instead: the capacity path must never
// reach the comparison engine at all. That is true on a roof and on a field,
// on a fast machine and a slow one.
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreProvider, useStore, newProject } from '../../store/store';
import { META_KEY, SCHEMA_VERSION, projectKey } from '../../lib/persistence/schema';
import { PANEL_DB } from '../../data/panels';
import type { Project, Roof } from '../../types';

/**
 * Count every call into the comparison engine, keeping the real behaviour.
 * A spy rather than a stub: the screen still renders whatever it would, so a
 * future change that re-introduces the call fails here instead of silently
 * rendering a different tree.
 */
const comparisonCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../../lib/comparison', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/comparison')>();
  return {
    ...real,
    memoizedComparison: (project: Project) => {
      comparisonCalls.n += 1;
      return real.memoizedComparison(project);
    },
  };
});

const { Step4Components } = await import('../Step4Components');

afterEach(cleanup);

/** A square ground field of `side` metres, centred on the site pin. */
function fieldProject(side: number): Project {
  const base = newProject();
  const panel = PANEL_DB.find((p) => p.widthMm === 1133 && p.lengthMm === 2382) ?? PANEL_DB[0];
  const roof: Roof = {
    id: 'roof_1',
    name: 'Array Area A',
    polygon: [
      { x: -side / 2, y: -side / 2 },
      { x: side / 2, y: -side / 2 },
      { x: side / 2, y: side / 2 },
      { x: -side / 2, y: side / 2 },
    ],
    roofType: 'ground',
    heightM: 0,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 1.5,
    perEdgeSetbacksM: null,
    parapet: {
      enabled: false,
      direction: 'inward',
      heightM: 1,
      widthM: 0.3,
      perEdge: null,
      suppressSharedEdges: true,
    },
  };
  return {
    ...base,
    info: { ...base.info, groundMount: true },
    components: { ...base.components, panel },
    roofs: [roof],
  };
}

function Harness() {
  const { state } = useStore();
  if (!state.hydrated || !state.activeProjectId) return null;
  return (
    <>
      <div data-testid="stored">{String(state.projects[0]?.components.targetKwp)}</div>
      <Step4Components />
    </>
  );
}

/**
 * Seed STORAGE, not the reducer. StoreProvider runs its own async
 * `loadState()` on mount and dispatches `hydrate` with whatever it finds, so a
 * hydrate dispatched from a child is overwritten a tick later and the screen
 * renders against an empty store.
 */
async function mount(project: Project) {
  localStorage.clear();
  comparisonCalls.n = 0;
  localStorage.setItem(projectKey(project.id), JSON.stringify(project));
  localStorage.setItem(
    META_KEY,
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      user: null,
      activeProjectId: project.id,
      projectIds: [project.id],
    }),
  );
  render(
    <StrictMode>
      <StoreProvider>
        <Harness />
      </StoreProvider>
    </StrictMode>,
  );
  await waitFor(() => expect(screen.getByTestId('stored')).toBeTruthy(), { timeout: 15_000 });
}

describe('the Auto capacity button on a field', () => {
  it('applies its result — to the store, and to the control the user reads', async () => {
    const user = userEvent.setup();
    await mount(fieldProject(560));
    await user.click(await screen.findByRole('button', { name: /Auto/i }));

    const input = screen.getByLabelText(/Target capacity/i) as HTMLInputElement;
    await waitFor(() => expect(screen.getByTestId('stored').textContent).not.toBe('0'));
    const stored = Number(screen.getByTestId('stored').textContent);
    // a 31 ha field holds tens of MWp — the exact figure follows the catalogue,
    // so this asserts the ORDER, not a number that drifts with the pricebook
    expect(stored).toBeGreaterThan(1000);
    // THE assertion the defect failed: the control shows what the store holds.
    // It rendered empty for 30 s because the commit was stuck in the comparison.
    expect(input.value).toBe(String(stored));
  }, 120_000);

  it('never runs the site-wide comparison to do it', async () => {
    const user = userEvent.setup();
    await mount(fieldProject(560));
    await user.click(await screen.findByRole('button', { name: /Auto/i }));
    await waitFor(() => expect(screen.getByTestId('stored').textContent).not.toBe('0'));
    // The comparison is a user-initiated sheet ("Compare options"), not a step
    // on the way to setting a capacity. Reaching it from render is what made a
    // click cost six full designs of the whole site plus six energy reports.
    expect(
      comparisonCalls.n,
      'setting a capacity must not lay out the site once per catalogue module',
    ).toBe(0);
  }, 120_000);

  it('typing a capacity does not re-lay the field between keystrokes', async () => {
    // The replacement reads the roofs' own maximum, which is ONE fill — so it
    // must be keyed on the geometry, not on the project. Keying it on the
    // project would re-fill the whole site on every character typed into this
    // very box, which is the same failure wearing a smaller hat.
    const user = userEvent.setup();
    await mount(fieldProject(560));
    await user.click(await screen.findByRole('button', { name: /Auto/i }));
    await waitFor(() => expect(screen.getByTestId('stored').textContent).not.toBe('0'));

    const input = screen.getByLabelText(/Target capacity/i) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '1234');
    await waitFor(() => expect(screen.getByTestId('stored').textContent).toBe('1234'));
    expect(input.value).toBe('1234');
    expect(comparisonCalls.n).toBe(0);
  }, 180_000);
});
