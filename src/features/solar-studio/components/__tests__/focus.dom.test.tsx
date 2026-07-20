// @vitest-environment jsdom
// ─── Phase 22p gates: focus management ──────────────────────────────────────
// `aria-modal="true"` is a PROMISE that the rest of the page is inert. Both
// surfaces made it and neither kept it — Tab walked straight out into the page
// behind, and on close focus was dumped on <body>.
//
// The restore half is the one people forget, and it is the one that matters:
// it is the difference between closing a dialog and being teleported.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Dialog, Sheet } from '../ui';

afterEach(cleanup);

/** A page with a trigger, so "restore focus to the opener" is observable. */
function Harness({ kind }: { kind: 'dialog' | 'sheet' }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open it</button>
      <button>Somewhere else</button>
      {open &&
        (kind === 'dialog' ? (
          <Dialog
            title="Confirm"
            onClose={() => setOpen(false)}
            actions={<button onClick={() => setOpen(false)}>Done</button>}
          >
            <button>Inside one</button>
            <button>Inside two</button>
          </Dialog>
        ) : (
          <Sheet title="Panel" onClose={() => setOpen(false)}>
            <button>Inside one</button>
            <button>Inside two</button>
          </Sheet>
        ))}
    </div>
  );
}

for (const kind of ['dialog', 'sheet'] as const) {
  describe(`${kind} focus management`, () => {
    it('moves focus INTO the surface when it opens', async () => {
      const user = userEvent.setup();
      render(<Harness kind={kind} />);
      await user.click(screen.getByText('Open it'));

      const surface = screen.getByRole('dialog');
      expect(surface.contains(document.activeElement)).toBe(true);
      // and not left on the container when there is a real control to take it
      expect(document.activeElement).not.toBe(document.body);
    });

    it('RESTORES focus to whatever opened it', async () => {
      const user = userEvent.setup();
      render(<Harness kind={kind} />);
      const opener = screen.getByText('Open it');

      await user.click(opener);
      await user.keyboard('{Escape}');

      // the half everyone forgets — without it a keyboard user loses their
      // place and a screen reader restarts from the top of the document
      expect(document.activeElement).toBe(opener);
    });

    it('Tab does not escape into the page behind', async () => {
      const user = userEvent.setup();
      render(<Harness kind={kind} />);
      await user.click(screen.getByText('Open it'));

      const surface = screen.getByRole('dialog');
      // walk further than there are controls; focus must still be inside
      for (let i = 0; i < 8; i++) {
        await user.tab();
        expect(surface.contains(document.activeElement), `after ${i + 1} tabs`).toBe(true);
      }
    });

    it('Shift+Tab wraps backwards inside too', async () => {
      const user = userEvent.setup();
      render(<Harness kind={kind} />);
      await user.click(screen.getByText('Open it'));

      const surface = screen.getByRole('dialog');
      for (let i = 0; i < 5; i++) {
        await user.tab({ shift: true });
        expect(surface.contains(document.activeElement)).toBe(true);
      }
    });

    it('is announced as modal, with a name', () => {
      render(<Harness kind={kind} />);
      // opened directly so the assertion does not depend on the click path
      const { container } = render(
        kind === 'dialog' ? (
          <Dialog title="Confirm" actions={null} onClose={vi.fn()}>
            x
          </Dialog>
        ) : (
          <Sheet title="Panel" onClose={vi.fn()}>
            x
          </Sheet>
        ),
      );
      const surface = container.querySelector('[role="dialog"]')!;
      expect(surface.getAttribute('aria-modal')).toBe('true');
      expect(surface.getAttribute('aria-label')).toBeTruthy();
    });
  });
}

describe('Escape closes, as a modal must', () => {
  it('dialog', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Dialog title="Confirm" actions={null} onClose={onClose}>
        <button>x</button>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('sheet', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Sheet title="Panel" onClose={onClose}>
        <button>x</button>
      </Sheet>,
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
