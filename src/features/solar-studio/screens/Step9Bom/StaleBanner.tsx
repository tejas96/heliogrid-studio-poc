// ─── "your edit no longer matches the design" (Phase 22e, detail in E17) ────
// Staleness needs no machinery of its own: `autoAtEdit` recorded what the
// engine said when the user overrode a field, so a field is stale exactly when
// the engine now says something else. This surfaces that comparison.
//
// It matters because the failure is silent otherwise: someone prices 30 panels,
// the design grows to 44, and the quote keeps billing 30 while looking current.
//
// E17 made the report FIELD-level. The banner used to say "Mounting Rail (qty)"
// — which field drifted, but not by how much, so the only way to decide whether
// to keep your figure was to reset it and watch what happened. It now shows
// both numbers and lets you take the derived one for that field alone; the old
// bulk refresh is still there, because "take all of it" is the common case.
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { staleRows } from '../../lib/bom/view';
import type { BomLine } from '../../types';

/** Beyond this the banner becomes the page; the rest are counted instead. */
const MAX_ROWS = 4;

export function StaleBanner({
  lines,
  onRefresh,
  onResetField,
}: {
  lines: BomLine[];
  onRefresh: (lineKeys: string[]) => void;
  onResetField: (lineKey: string, field: string) => void;
}) {
  const rows = staleRows(lines);
  const n = rows.length;
  const shown = rows.slice(0, MAX_ROWS);
  const hidden = n - shown.length;

  return (
    <div
      className="banner-warn"
      role="status"
      style={{ borderRadius: 8, marginBottom: 8, fontSize: 11.5 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <AlertTriangle size={14} aria-hidden />
          <span>
            <b>
              {n} edited {n === 1 ? 'field has' : 'fields have'} drifted from the design.
            </b>{' '}
            Your figures are still being used.
          </span>
        </span>
        <button
          className="btn btn-secondary"
          style={{ padding: '3px 8px', fontSize: 11, flex: '0 0 auto' }}
          onClick={() => onRefresh(lines.map((l) => l.id))}
        >
          <RefreshCw size={12} /> Refresh these
        </button>
      </div>

      <ul
        style={{
          listStyle: 'none',
          margin: '7px 0 0',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        {shown.map((r) => (
          <li
            key={`${r.lineKey}:${r.field}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
          >
            <span style={{ fontWeight: 650 }}>{r.item}</span>
            <span style={{ color: 'var(--ink-3)' }}>{r.label}</span>
            <span>
              yours <b>{r.yoursText}</b>
            </span>
            <span style={{ color: 'var(--ink-3)' }}>·</span>
            <span>
              design now <b>{r.nowText}</b>
            </span>
            {r.now !== undefined && (
              <button
                className="btn btn-secondary"
                style={{ padding: '1px 7px', fontSize: 10.5 }}
                // Resets THIS field only. clearFieldOverride has always existed;
                // nothing was calling it from here, so the only way to accept one
                // derived value was to discard every edit on the line.
                onClick={() => onResetField(r.lineKey, r.field)}
                aria-label={`Take the design value ${r.nowText} for ${r.label} on ${r.item}`}
              >
                Take {r.nowText}
              </button>
            )}
          </li>
        ))}
        {hidden > 0 && (
          <li style={{ color: 'var(--ink-3)' }}>and {hidden} more</li>
        )}
      </ul>
    </div>
  );
}
