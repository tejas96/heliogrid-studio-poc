// ─── Saved edits with nowhere to land (Phase 22c) ───────────────────────────
// An override whose line key no longer resolves — the user swapped the inverter
// and their edit to a combiner line has no home. The old model dropped these
// silently, which meant pricing work disappeared with no way to notice.
//
// Two explicit choices, never an automatic one. Discarding someone's numbers
// for them is the behaviour this replaces.
import { HelpCircle } from 'lucide-react';
import type { BomOrphan } from '../../lib/bom/merge';

export function OrphanBanner({
  orphans,
  onKeep,
  onDiscard,
}: {
  orphans: BomOrphan[];
  onKeep: (o: BomOrphan) => void;
  onDiscard: (o: BomOrphan) => void;
}) {
  return (
    <div className="banner-warn" role="status" style={{ borderRadius: 8, marginBottom: 14, fontSize: 11.5 }}>
      <b style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <HelpCircle size={14} aria-hidden />
        {orphans.length} saved {orphans.length === 1 ? 'edit no longer matches' : 'edits no longer match'} your design
      </b>
      <div style={{ marginTop: 4, color: 'var(--ink-2)' }}>
        These were edited on lines the current design no longer produces. Keep each one as a
        hand-entered line, or discard it.
      </div>
      <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
        {orphans.map((o) => (
          <li
            key={o.lineKey}
            style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}
          >
            <span>
              <b>{o.label}</b>{' '}
              <span style={{ color: 'var(--ink-3)' }}>
                ({Object.keys(o.fields).join(', ')})
              </span>
            </span>
            <span style={{ display: 'flex', gap: 6, flex: '0 0 auto' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => onKeep(o)}
              >
                Keep as custom line
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => onDiscard(o)}
              >
                Discard
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
