/**
 * Living design-system reference at /design.
 *
 * Not a throwaway: this is the page you open to SEE the system, and the page
 * Tailwind scans to prove every token resolves. If a token is not used here,
 * nobody can check it renders correctly.
 *
 * Rules it demonstrates, from docs/DESIGN-SYSTEM.md:
 *   §3.2  brass fills carry an INK label (white fails AA at 3.09:1)
 *   §3.4  two-tone focus ring — try tabbing through the buttons
 *   N6    data colours are a separate namespace from chrome
 *   N3    12px is the floor
 */
export const metadata = { title: 'Design System · HelioGrid' };

function Swatch({ cls, name, note }: { cls: string; name: string; note?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-8 w-8 shrink-0 rounded-sm border border-border ${cls}`} />
      <div className="min-w-0">
        <div className="text-xs font-medium">{name}</div>
        {note ? <div className="text-2xs text-muted">{note}</div> : null}
      </div>
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 text-2xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <div className="ds min-h-screen-d">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <header className="mb-12">
          <h1 className="text-2xl font-bold tracking-tight">Instrument</h1>
          <p className="mt-1 text-sm text-muted">
            Design system reference. Every value here comes from{' '}
            <code className="text-accent-text">src/design/tokens.css</code>.
          </p>
        </header>

        <Row title="Primary action — ink on brass, 5.78:1">
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:bg-accent-active">
              Send on WhatsApp
            </button>
            <button className="rounded-md border border-border-strong bg-surface-raised px-4 py-2 text-sm font-semibold text-text transition-colors duration-150 hover:bg-surface-sunken">
              Open design
            </button>
            <button className="rounded-md px-4 py-2 text-sm font-semibold text-accent-text transition-colors duration-150 hover:bg-accent-subtle">
              Add note
            </button>
            <button
              disabled
              className="rounded-md bg-surface-sunken px-4 py-2 text-sm font-semibold text-subtle"
            >
              Disabled
            </button>
            <button className="rounded-md bg-danger-subtle px-4 py-2 text-sm font-semibold text-danger">
              Delete
            </button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Tab through these — the focus ring is light-core + ink-halo, so it stays legible on
            the brass fill as well as on paper.
          </p>
        </Row>

        <Row title="Surfaces & text">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface-raised p-4 shadow-1">
              <div className="text-sm font-semibold">surface-raised · elev-1</div>
              <div className="mt-1 text-sm text-muted">text-muted — 7.1:1</div>
              <div className="mt-1 text-xs text-subtle">text-subtle — ≥14px or bold only</div>
            </div>
            <div className="rounded-lg bg-surface-sunken p-4">
              <div className="text-sm font-semibold">surface-sunken</div>
              <div className="mt-1 text-sm text-muted">wells, table stripes, inset areas</div>
            </div>
          </div>
        </Row>

        <Row title="Status">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-success-subtle px-3 py-1 text-xs font-medium text-success">
              Approved
            </span>
            <span className="rounded-full bg-warning-subtle px-3 py-1 text-xs font-medium text-warning">
              Awaiting survey
            </span>
            <span className="rounded-full bg-danger-subtle px-3 py-1 text-xs font-medium text-danger">
              Lost
            </span>
            <span className="rounded-full bg-info-subtle px-3 py-1 text-xs font-medium text-info">
              Proposal sent
            </span>
            <span className="rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent-text">
              Follow up
            </span>
          </div>
        </Row>

        <Row title="Type scale — 12px floor">
          <div className="space-y-2">
            <div className="text-3xl font-bold tracking-tight">36 · proposal cover</div>
            <div className="text-2xl font-bold tracking-tight">28 · page hero</div>
            <div className="text-xl font-semibold">22 · screen title</div>
            <div className="text-lg font-semibold">18 · section heading</div>
            <div className="text-base">16 · comfortable body, mobile inputs</div>
            <div className="text-sm">14 · body default</div>
            <div className="text-xs text-muted">13 · secondary metadata</div>
            <div className="text-2xs text-muted">12 · dense cells and badges — the floor</div>
          </div>
        </Row>

        <Row title="Numbers — tabular, aligned, never truncated">
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Example quote lines</caption>
              <thead className="bg-surface-sunken">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left text-2xs font-semibold text-muted">
                    Item
                  </th>
                  <th scope="col" className="px-4 py-2 text-right text-2xs font-semibold text-muted">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Modules · 12 × 610 Wp', '₹1,68,360'],
                  ['Inverter · 5 kW', '₹1,04,000'],
                  ['Mounting structure', '₹48,200'],
                ].map(([a, b]) => (
                  <tr key={a} className="border-t border-border-subtle">
                    <td className="px-4 py-2">{a}</td>
                    <td className="px-4 py-2 text-right font-medium">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            Digits are tabular, so a column of rupees does not jitter as values update.
          </p>
        </Row>

        <Row title="Data colours — a separate namespace (N6)">
          <div className="mb-2 flex gap-1">
            <div className="h-7 flex-1 rounded-sm bg-data-good" />
            <div className="h-7 flex-1 rounded-sm bg-data-good" />
            <div className="h-7 flex-1 rounded-sm bg-data-mid" />
            <div className="h-7 flex-1 rounded-sm bg-data-poor" />
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-2">
              <i className="h-2 w-2 rounded-full bg-data-good" />
              &gt;95% access
            </span>
            <span className="flex items-center gap-2">
              <i className="h-2 w-2 rounded-full bg-data-mid" />
              85–95%
            </span>
            <span className="flex items-center gap-2">
              <i className="h-2 w-2 rounded-full bg-data-poor" />
              &lt;85%
            </span>
          </div>
          <p className="mt-3 text-xs text-muted">
            Never <code>bg-accent</code> on a chart, never <code>bg-data-good</code> on a button.
          </p>
        </Row>

        <Row title="Space & radius">
          <div className="flex flex-wrap items-end gap-3">
            {(['1', '2', '3', '4', '6', '8'] as const).map((s) => (
              <div key={s} className="text-center">
                <div className={`bg-accent-subtle border border-accent-border p-${s}`}>
                  <div className="h-4 w-4 bg-accent" />
                </div>
                <div className="mt-1 text-2xs text-muted">p-{s}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="rounded-sm border border-border bg-surface-raised px-3 py-2 text-xs">
              rounded-sm
            </div>
            <div className="rounded-md border border-border bg-surface-raised px-3 py-2 text-xs">
              rounded-md
            </div>
            <div className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs">
              rounded-lg
            </div>
            <div className="rounded-full border border-border bg-surface-raised px-3 py-2 text-xs">
              rounded-full
            </div>
          </div>
        </Row>

        <Row title="Elevation">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-surface-raised p-4 text-xs shadow-1">elev-1 · cards</div>
            <div className="rounded-lg bg-surface-raised p-4 text-xs shadow-2">elev-2 · popovers</div>
            <div className="rounded-lg bg-surface-raised p-4 text-xs shadow-3">elev-3 · modals</div>
          </div>
        </Row>

        <Row title="Canvas chrome — dark in both themes">
          <div className="rounded-lg bg-surface-canvas p-4">
            <div className="inline-flex items-center gap-2 rounded-md bg-surface-canvas-panel px-3 py-2">
              <span className="text-xs text-on-canvas">12 panels · 7.3 kWp</span>
              <span className="h-2 w-2 rounded-full bg-data-good" />
            </div>
          </div>
        </Row>

        <Row title="Ramps">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Swatch cls="bg-surface" name="surface" />
            <Swatch cls="bg-surface-sunken" name="surface-sunken" />
            <Swatch cls="bg-accent" name="accent" note="fill only — 500" />
            <Swatch cls="bg-accent-subtle" name="accent-subtle" />
            <Swatch cls="bg-success-subtle" name="success-subtle" />
            <Swatch cls="bg-warning-subtle" name="warning-subtle" />
            <Swatch cls="bg-danger-subtle" name="danger-subtle" />
            <Swatch cls="bg-info-subtle" name="info-subtle" />
          </div>
        </Row>
      </div>
    </div>
  );
}
