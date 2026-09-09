// @vitest-environment jsdom
// ─── Plain mode must not MOUNT the model, only hide it ───────────────────────
// The plain/realistic switch exists to avoid the cost of the photoreal props,
// so the one thing it must never do is fetch and parse a GLB and then draw a
// box over it. `useGLTF` fires from a component's render, so "did it download"
// is decided entirely by whether the child is mounted at all.
//
// That is a plain React question — no Canvas, no WebGL — so it is asked here
// rather than by squinting at a scene.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AssetBoundary } from '../ObstructionMesh';

afterEach(cleanup);

/** Stands in for the GLB component: records that it was rendered at all. */
function Model({ onRender }: { onRender: () => void }) {
  onRender();
  return <div data-testid="model">photoreal</div>;
}

describe('AssetBoundary', () => {
  it('renders the model when plain is off', () => {
    const rendered = vi.fn();
    render(
      <AssetBoundary fallback={<div data-testid="primitive">box</div>}>
        <Model onRender={rendered} />
      </AssetBoundary>,
    );
    expect(screen.getByTestId('model')).toBeTruthy();
    expect(rendered).toHaveBeenCalled();
  });

  it('renders the primitive in plain mode', () => {
    render(
      <AssetBoundary plain fallback={<div data-testid="primitive">box</div>}>
        <Model onRender={() => {}} />
      </AssetBoundary>,
    );
    expect(screen.getByTestId('primitive')).toBeTruthy();
    expect(screen.queryByTestId('model')).toBeNull();
  });

  it('NEVER RENDERS THE CHILD in plain mode — the whole point of the switch', () => {
    // If the child rendered even once, `useGLTF` inside it would have started
    // the download that plain mode exists to avoid. A test that only checked
    // what is on screen would pass while the model was still being fetched.
    const rendered = vi.fn();
    render(
      <AssetBoundary plain fallback={<div data-testid="primitive">box</div>}>
        <Model onRender={rendered} />
      </AssetBoundary>,
    );
    expect(rendered).not.toHaveBeenCalled();
  });

  it('still falls back to the primitive when the model throws', () => {
    // the original reason this boundary exists: a 404 or corrupt GLB must not
    // take the whole 3D scene down with it
    const boom = () => {
      throw new Error('404');
    };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken() {
      boom();
      return null;
    }
    render(
      <AssetBoundary fallback={<div data-testid="primitive">box</div>}>
        <Broken />
      </AssetBoundary>,
    );
    expect(screen.getByTestId('primitive')).toBeTruthy();
    quiet.mockRestore();
  });
});
