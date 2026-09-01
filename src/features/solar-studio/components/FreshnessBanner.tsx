import { AlertTriangle } from 'lucide-react';
import type { Project } from '../types';
import { designFreshness, freshnessReasons } from '../lib/derive/freshness';

/**
 * "Money never renders while stale" — the visible half. Every screen that
 * shows a rupee or a kWh mounts this above the figure. With `print`, the
 * banner survives Print/Save-PDF so a provisional document says so on paper.
 *
 * Colours: legacy `theme.css` defines `--warn` / `--warn-bg` (no `--warn-ink`),
 * and its existing `.banner-warn` class already pairs `--warn` as both the
 * accent AND the text colour — reused here rather than adding a raw hex.
 */
export function FreshnessBanner({ project, print = false }: { project: Project; print?: boolean }) {
  if (designFreshness(project).all) return null;
  const reasons = freshnessReasons(project);
  return (
    <div
      role="status"
      className={print ? 'freshness-banner' : 'freshness-banner no-print'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--warn-bg)',
        borderBottom: '1px solid var(--warn)',
        color: 'var(--warn)',
        padding: '8px 16px',
        fontSize: 12.5,
      }}
    >
      <AlertTriangle size={14} aria-hidden />
      <span>
        {print ? 'PROVISIONAL — not for issue. ' : 'Provisional — '}
        {reasons.join(', ')}. Figures update when recalculation finishes.
      </span>
    </div>
  );
}
