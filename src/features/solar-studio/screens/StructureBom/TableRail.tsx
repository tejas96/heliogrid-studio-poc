// Left rail of the structure view: every table with what it stands on and
// whether it is ready, the module see-through, and the parts in the selection.
import { Check } from 'lucide-react';
import type { PartGroup, PartKey, TableRow, TableStatus } from '../../lib/structure-step';

const STATUS_DOT: Record<TableStatus, string> = {
  ok: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
};
const STATUS_TEXT: Record<TableStatus, string> = { ok: 'Ready', warning: 'Needs a check', error: 'Has an error' };

type PanelVis = 'show' | 'ghost' | 'hide';
const VIS: { value: PanelVis; label: string }[] = [
  { value: 'show', label: 'Solid' },
  { value: 'ghost', label: 'Ghost' },
  { value: 'hide', label: 'Hidden' },
];

export function TableRail({
  rows,
  selected,
  onToggle,
  onOnly,
  onAll,
  onNone,
  panelVis,
  onPanelVis,
  parts,
  part,
  onPart,
}: {
  rows: TableRow[];
  selected: ReadonlySet<string>;
  onToggle: (segId: string) => void;
  onOnly: (segId: string) => void;
  onAll: () => void;
  onNone: () => void;
  panelVis: PanelVis;
  onPanelVis: (v: PanelVis) => void;
  parts: PartGroup[];
  part: PartKey | null;
  onPart: (k: PartKey | null) => void;
}) {
  const all = rows.length > 0 && rows.every((r) => selected.has(r.segId));
  return (
    <aside
      aria-label="Tables and parts"
      className="flex w-2xs shrink-0 flex-col overflow-y-auto border-r border-border bg-surface-raised"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">
          Tables <span className="font-normal text-muted tabular-nums">{rows.length}</span>
        </h2>
        <button
          type="button"
          onClick={all ? onNone : onAll}
          className="min-h-6 rounded-sm px-2 text-xs font-medium text-accent-text hover:bg-accent-subtle"
        >
          {all ? 'Select none' : 'Select all'}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-xs text-muted">
          No tables yet. Place panels in Step 6 and they appear here.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 px-2 pb-2">
          {rows.map((r) => {
            const on = selected.has(r.segId);
            return (
              <li
                key={r.segId}
                className={
                  'flex items-start gap-2 rounded-md border p-2 ' +
                  (on ? 'border-accent-border bg-accent-subtle' : 'border-transparent hover:bg-surface-sunken')
                }
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Include table ${r.label} in the selection`}
                  onClick={() => onToggle(r.segId)}
                  className={
                    'mt-1 flex size-4 shrink-0 items-center justify-center rounded-sm border ' +
                    (on ? 'border-accent-border bg-accent text-on-accent' : 'border-border-strong bg-surface-raised')
                  }
                >
                  {on && <Check size={12} strokeWidth={3} aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => onOnly(r.segId)}
                  aria-label={`Work on table ${r.label} only`}
                  className="flex min-w-0 flex-1 flex-col gap-1 text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{r.label}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {r.panels} panels · {r.kwp.toFixed(2)} kWp
                    </span>
                    <span className="flex-1" />
                    <span className={'size-2 shrink-0 rounded-full ' + STATUS_DOT[r.status]} aria-hidden />
                    <span className="sr-only">{STATUS_TEXT[r.status]}</span>
                  </span>
                  <span className="truncate text-xs text-muted">{r.summary}</span>
                  {r.status !== 'ok' && (
                    <span className={'text-xs ' + (r.status === 'error' ? 'text-danger' : 'text-warning')}>
                      {r.issues[0]?.message}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mx-4 flex flex-col gap-2 border-t border-border pt-4">
        <h2 className="text-sm font-semibold" id="vis-label">
          Modules on selected tables
        </h2>
        <div role="radiogroup" aria-labelledby="vis-label" className="flex rounded-md bg-surface-sunken p-1">
          {VIS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={panelVis === v.value}
              onClick={() => onPanelVis(v.value)}
              className={
                'min-h-8 flex-1 rounded-sm text-xs font-medium ' +
                (panelVis === v.value ? 'bg-surface-raised shadow-1' : 'text-muted hover:text-text')
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-4 flex flex-col gap-1 border-t border-border pt-4 pb-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Parts in selection</h2>
          <span className="text-xs text-muted">click to light up</span>
        </div>
        {parts.length === 0 ? (
          <p className="text-xs text-muted">Select a table to see its parts.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {parts.map((g) => {
              const on = part === g.key;
              return (
                <li key={g.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onPart(on ? null : g.key)}
                    className={
                      'flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm ' +
                      (on ? 'bg-accent-subtle font-semibold' : 'hover:bg-surface-sunken')
                    }
                  >
                    <span
                      className={'size-2 shrink-0 rounded-sm ' + (on ? 'bg-accent' : 'bg-border-strong')}
                      aria-hidden
                    />
                    <span className="flex-1">{g.label}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {g.count}
                      {g.totalM != null ? ` · ${g.totalM.toFixed(1)} m` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
