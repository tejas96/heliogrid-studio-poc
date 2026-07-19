// ─── "your edit no longer matches the design" (Phase 22e) ───────────────────
// Staleness needs no machinery of its own: `autoAtEdit` recorded what the
// engine said when the user overrode a field, so a field is stale exactly when
// the engine now says something else. This surfaces that comparison.
//
// It matters because the failure is silent otherwise: someone prices 30 panels,
// the design grows to 44, and the quote keeps billing 30 while looking current.
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { BomLine } from '../../types';

export function StaleBanner({
  lines,
  onRefresh,
}: {
  lines: BomLine[];
  onRefresh: (lineKeys: string[]) => void;
}) {
  const n = lines.reduce((s, l) => s + (l.staleFields?.length ?? 0), 0);
  return (
    <div
      className="banner-warn"
      role="status"
      style={{
        borderRadius: 8,
        marginBottom: 8,
        fontSize: 11.5,
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
          {lines
            .map((l) => `${l.item} (${(l.staleFields ?? []).join(', ')})`)
            .slice(0, 3)
            .join('; ')}
          {lines.length > 3 && ` and ${lines.length - 3} more`}. Your figures are still being
          used — refresh to take the derived values instead.
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
  );
}
