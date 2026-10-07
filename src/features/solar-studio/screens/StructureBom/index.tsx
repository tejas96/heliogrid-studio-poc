// ─── Step 7 · Structure & BOM ───────────────────────────────────────────────
// What holds the panels up, and what it all costs. The editor (Step 6) decides
// where the panels go; this step owns the structure and the price, and it sits
// BEFORE the proposal so the quote the customer sees has been looked at.
//
// Two views of one job, switched by tabs: Structure (3D + every structure
// control) and Bill of materials (every line and the quote). The readiness
// chips say, from either view, what still needs a look.
import { useMemo, useState } from 'react';
import { Building2, ListChecks } from 'lucide-react';
import { useActiveProject } from '../../store/store';
import { useUnits } from '../../store/useUnits';
import { deriveBomResult, deriveMoney, deriveStructures } from '../../lib/derive';
import { bomConfidence } from '../../lib/bom';
import { validateMms } from '../../lib/mms/validate';
import { tableRows } from '../../lib/structure-step';
import { navigate } from '../../router';
import { STEP, stepPath } from '../../lib/steps';
import { BomView } from './BomView';
import { StructureView } from './StructureView';

type View = 'structure' | 'bom';

/** `?view=bom` opens the BOM — links that are about prices land on prices. */
function initialView(): View {
  if (typeof window === 'undefined') return 'structure';
  return new URLSearchParams(window.location.search).get('view') === 'bom' ? 'bom' : 'structure';
}

export function StructureBomStep() {
  const project = useActiveProject();
  const { fmtLen } = useUnits();
  const [view, setViewState] = useState<View>(initialView);
  const setView = (v: View) => {
    setViewState(v);
    // keep the tab across a reload without a history entry per click
    const url = new URL(window.location.href);
    if (v === 'bom') url.searchParams.set('view', 'bom');
    else url.searchParams.delete('view');
    window.history.replaceState(window.history.state, '', url);
  };

  const facts = useMemo(() => {
    if (!project) return null;
    const structures = deriveStructures(project);
    const rows = tableRows(project, structures, validateMms(project, structures), fmtLen);
    const conf = bomConfidence(deriveBomResult(project).lines);
    return {
      tables: rows.length,
      errors: rows.filter((r) => r.status === 'error').length,
      warnings: rows.filter((r) => r.status === 'warning').length,
      unsure: conf.counts.assumed + conf.counts.estimated,
      total: deriveMoney(project).total,
    };
  }, [project, fmtLen]);
  if (!project || !facts) return null;
  const signedOff = project.structuralVerification?.status === 'engineer_approved';
  const lakh = (v: number) => `₹${(v / 100000).toFixed(2)} L`;

  return (
    <div className="ds flex h-full min-h-0 flex-col bg-surface text-text">
      <div className="flex flex-wrap items-center gap-4 border-b border-border bg-surface px-4 py-2">
        <div role="tablist" aria-label="Structure and BOM views" className="flex gap-1 rounded-md bg-surface-sunken p-1">
          <Tab on={view === 'structure'} onClick={() => setView('structure')} icon={<Building2 size={16} aria-hidden />}>
            Structure
          </Tab>
          <Tab on={view === 'bom'} onClick={() => setView('bom')} icon={<ListChecks size={16} aria-hidden />}>
            Bill of materials <span className="font-normal text-muted tabular-nums">{lakh(facts.total)}</span>
          </Tab>
        </div>
        <span className="flex-1" />
        <ul aria-label="What still needs a look" className="m-0 flex list-none flex-wrap gap-2 p-0">
          <Chip tone={facts.tables > 0 ? 'good' : 'warn'}>
            {facts.tables > 0 ? `${facts.tables} table${facts.tables === 1 ? '' : 's'} structured` : 'No tables yet'}
          </Chip>
          <Chip
            tone={facts.errors > 0 ? 'bad' : facts.warnings > 0 ? 'warn' : 'good'}
            onClick={facts.errors + facts.warnings > 0 ? () => setView('structure') : undefined}
          >
            {facts.errors > 0
              ? `${facts.errors} table${facts.errors === 1 ? '' : 's'} with errors`
              : facts.warnings > 0
                ? `${facts.warnings} table${facts.warnings === 1 ? '' : 's'} to check`
                : 'No structure warnings'}
          </Chip>
          <Chip tone={facts.unsure > 0 ? 'warn' : 'good'} onClick={facts.unsure > 0 ? () => setView('bom') : undefined}>
            {facts.unsure > 0 ? `${facts.unsure} BOM lines to confirm on site` : 'Every BOM line confirmed'}
          </Chip>
          <Chip tone={signedOff ? 'good' : 'neutral'} onClick={signedOff ? undefined : () => navigate(stepPath(STEP.drawings))}>
            {signedOff ? 'Engineer approved' : 'Engineer sign-off pending'}
          </Chip>
        </ul>
      </div>

      {view === 'structure' ? (
        <StructureView project={project} />
      ) : (
        // `relative` keeps the BOM's absolutely-placed screen-reader labels
        // inside this scroll box — without it they size the wizard's own
        // scroller and the tab bar scrolls away under the header
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <BomView />
        </div>
      )}
    </div>
  );
}

function Tab({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={
        'flex min-h-8 items-center gap-2 rounded-sm px-3 text-sm ' +
        (on ? 'bg-surface-raised font-semibold shadow-1' : 'text-muted hover:text-text')
      }
    >
      {icon}
      {children}
    </button>
  );
}

const CHIP_TONE = {
  good: 'bg-success-subtle text-success',
  warn: 'bg-warning-subtle text-warning',
  bad: 'bg-danger-subtle text-danger',
  neutral: 'bg-surface-sunken text-muted',
} as const;

function Chip({ tone, onClick, children }: { tone: keyof typeof CHIP_TONE; onClick?: () => void; children: React.ReactNode }) {
  const cls = 'flex min-h-6 items-center rounded-full px-3 text-xs font-medium ' + CHIP_TONE[tone];
  return (
    <li>
      {onClick ? (
        <button type="button" onClick={onClick} className={cls + ' hover:underline'}>
          {children}
        </button>
      ) : (
        <span className={cls}>{children}</span>
      )}
    </li>
  );
}
