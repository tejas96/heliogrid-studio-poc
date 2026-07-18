import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, ChevronRight, CircleHelp, HeartPulse, Home, Save } from 'lucide-react';
import { navigate } from '../router';
import { useActiveProject, useProjectPatch } from '../store/store';
import { useUnits } from '../lib/units';
import { UnitToggle, Sheet } from '../components/ui';
import { bandOf, describeHealthCode, explainDelta, healthKey, memoizedHealth, type HealthResult } from '../lib/health';
import { electricalGate } from '../lib/electrical/gate';
import { resolveRules } from '../data/rules/india';
import type { Project } from '../types';
import { Step1Setup } from './Step1Setup';
import { Step2Roof } from './Step2Roof';
import { Step3Obstructions } from './Step3Obstructions';
import { Step4Components } from './Step4Components';
import { Step6Editor } from './Step6Editor';
import { Step7Proposal } from './Step7Proposal';
import { Step8Sld } from './Step8Sld';
import { Step9Bom } from './Step9Bom';
import { Step10Done } from './Step10Done';

export const STEP_NAMES = [
  'Project Setup',
  'Roof Setup',
  'Obstructions',
  'Components',
  'Panel Placement',
  'Manual Edit',
  'Proposal',
  'SLD & Drawings',
  'BOM & Pricing',
  'Final',
];

/**
 * What each step is FOR, in the installer's language — the Help button used to
 * be inert, which the honesty audit counts as a dead control. Kept as plain
 * data so it stays next to STEP_NAMES and cannot drift out of sync with it.
 */
export const STEP_HELP: { does: string; tips: string[] }[] = [
  {
    does: 'Name the project and pin the exact site. The pin drives the weather data, so place it on the actual roof, not the street.',
    tips: [
      'Search the address, or type coordinates if the map will not load.',
      'The DISCOM you pick sets the default tariff — you can still edit it.',
      'Moving the pin more than 25 m later clears the design (the weather no longer applies).',
    ],
  },
  {
    does: 'Trace each roof surface and set its height, pitch and parapet.',
    tips: [
      'Click each corner, then close the shape on the first point.',
      'Use Measure against a known length to calibrate the imagery scale.',
      'Pitched roofs: convert to Gable or Hip to get one face per orientation.',
    ],
  },
  {
    does: 'Mark everything on the roof that panels must avoid or can span over.',
    tips: [
      'Set each object\u2019s real height — it drives the shadow it casts.',
      'A tall object can still be bridged if the table clears it.',
      'Anything that must stay open to sky blocks placement outright.',
    ],
  },
  {
    does: 'Choose the panel and inverter. The comparison matrix runs the full energy and money pipeline per candidate.',
    tips: [
      'DCR panels are required for the residential subsidy.',
      'Inverter MPPT count limits how many orientations you can string separately.',
      'DC optimisers remove that limit at extra cost.',
    ],
  },
  {
    does: 'Automatic placement: the engine ranks roof faces by real yield and fills them.',
    tips: ['Ranking uses measured solar access \u00d7 orientation yield, not area.'],
  },
  {
    does: 'Adjust the layout by hand — add, remove, move, string and route.',
    tips: [
      'Arrow keys nudge the selection 0.1 m (hold Shift for 0.5 m).',
      'Drag a panel to move it; a panel in a table moves its whole table.',
      'A move that breaks a setback or hits an obstruction is refused whole.',
      'Shortcuts: V select \u00b7 P panels \u00b7 E erase \u00b7 W walkway \u00b7 K no-build zone \u00b7 R rail \u00b7 L arrester \u00b7 I inverter \u00b7 G stringing \u00b7 H heatmap \u00b7 S strings.',
    ],
  },
  {
    does: 'Capture the shadow study and cover imagery the proposal will print.',
    tips: ['Captures are stamped to the design — edit the design and they are flagged stale.'],
  },
  {
    does: 'The single-line diagram and the drawing set for the DISCOM and the install team.',
    tips: [
      'Ratings derive from the components; edits are stored as overrides you can reset.',
      'Export DXF for the permit set, or PNG/SVG for the proposal.',
    ],
  },
  {
    does: 'The bill of materials and the price. Every line shows the formula behind it.',
    tips: [
      'Overridden lines keep your value and show a divergence badge.',
      'The margin here is the ONLY margin — the proposal prints this same total.',
    ],
  },
  {
    does: 'Issue the proposal and share it.',
    tips: ['The share link opens a read-only copy of this design.'],
  },
];

/** Per-step gate: returns a blocking message or null when Next is allowed. */
function nextBlocker(step: number, p: NonNullable<ReturnType<typeof useActiveProject>>): string | null {
  switch (step) {
    case 1:
      if (!p.info.state) return 'Select a state to continue';
      if (!p.location?.confirmed) return 'Confirm the installation location to continue';
      return null;
    case 2:
      return p.roofs.length === 0 ? 'Draw at least one roof to continue' : null;
    case 4:
      if (!p.components.panel) return 'Select a panel to continue';
      if (!p.components.inverter) return 'Select an inverter to continue';
      if (p.components.targetKwp <= 0) return 'Set a target capacity to continue';
      return null;
    case 6: {
      if (p.panels.filter((x) => x.enabled).length === 0)
        return 'Place at least one panel to continue';
      // THE HARD GATE (plan §B/§9): the proposal, SLD and quote are where a
      // mistake leaves the building. Held HERE, on the editor's own Next, so
      // the user stays on the screen that can fix it. This also drives
      // `allowedStep`, so a design that becomes invalid later cannot sit on a
      // downstream step showing numbers derived from strings that can't exist.
      const gate = electricalGate(p);
      return gate
        ? gate.message + (gate.autoStringable ? ' — use Stringing → Auto string' : '')
        : null;
    }
    default:
      return null;
  }
}

export function Wizard({ step }: { step: number }) {
  const project = useActiveProject();
  const patch = useProjectPatch();
  const { units, setUnits } = useUnits();
  const [toast, setToast] = useState<string | null>(null);
  const [healthSheet, setHealthSheet] = useState(false);
  const [helpSheet, setHelpSheet] = useState(false);
  // the chip reads the debounce-stamped snapshot — NEVER live computeHealth:
  // Step 2/3 drags patch the store per pointermove, and a memo-missing
  // computeHealth (O(panels²) DRC) in the header render path costs 10-40ms
  // per move on large arrays. healthKey alone is ~0.1ms — cheap enough to
  // tell "stamp still settling" for the provisional marker.
  const snapEntry = project?.derived.healthSnapshot?.current ?? null;
  const chipTotal = snapEntry?.total ?? null;
  const chipBand = bandOf(chipTotal);
  const chipProvisional =
    snapEntry != null &&
    ((snapEntry.provisional ?? false) || (project != null && snapEntry.key !== healthKey(project)));

  // Prerequisite gating: a step reached via deep link or stale state without its
  // required data would crash (e.g. Step 6 reading a null panel spec). The highest
  // viewable step is the first one whose "Next" requirements aren't yet met.
  const allowedStep = project
    ? (() => {
        for (let s = 1; s <= 9; s++) if (nextBlocker(s, project)) return s;
        return 10;
      })()
    : 1;
  useEffect(() => {
    if (project && step > allowedStep) navigate(`/wizard/${allowedStep}`);
  }, [project, step, allowedStep]);

  if (!project) return null;
  if (step > allowedStep) return null;

  function go(next: number) {
    const clamped = Math.max(1, Math.min(10, next));
    patch({ wizardStep: Math.max(project!.wizardStep, clamped) });
    navigate(`/wizard/${clamped}`);
  }

  function onNext() {
    const blocker = nextBlocker(step, project!);
    if (blocker) {
      setToast(blocker);
      setTimeout(() => setToast(null), 2600);
      return;
    }
    // steps 4→6: auto-placement (step 5) happens inside the editor mount
    go(step === 4 ? 6 : step + 1);
  }

  function onBack() {
    go(step === 6 ? 4 : step - 1);
  }

  const dark = step === 2 || step === 3 || step === 6;

  let body: ReactNode;
  switch (step) {
    case 1: body = <Step1Setup />; break;
    case 2: body = <Step2Roof />; break;
    case 3: body = <Step3Obstructions />; break;
    case 4: body = <Step4Components />; break;
    case 5:
    case 6: body = <Step6Editor />; break;
    case 7: body = <Step7Proposal />; break;
    case 8: body = <Step8Sld />; break;
    case 9: body = <Step9Bom />; break;
    default: body = <Step10Done />; break;
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: dark ? 'var(--editor-bg)' : 'var(--paper)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'var(--paper)',
          borderBottom: '1px solid var(--line)',
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn-ghost"
            onClick={onBack}
            disabled={step <= 1}
            aria-label="Back"
            data-tip="Back"
            data-tip-right=""
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            Step {step} of 10 · {STEP_NAMES[step - 1]}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {chipTotal !== null && (
            <button
              className="chip"
              aria-haspopup="dialog"
              aria-label={`Design health: ${BAND_LABEL[chipBand!]} ${chipTotal} of 100${chipProvisional ? ', provisional — recalculating' : ''}`}
              data-tip={chipProvisional ? 'Design health — provisional (recalculating)' : 'Design health'}
              data-tip-left=""
              onClick={() => setHealthSheet(true)}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: BAND_COLOR[chipBand!],
                  flex: 'none',
                  opacity: chipProvisional ? 0.45 : 1,
                }}
              />
              <span style={{ opacity: chipProvisional ? 0.6 : 1 }}>
                {BAND_LABEL[chipBand!]}
                {chipProvisional ? '…' : ''}
              </span>
              <span className="n" style={{ opacity: chipProvisional ? 0.6 : 1 }}>
                {chipTotal}
              </span>
            </button>
          )}
          {chipTotal === null && project && (
            <span
              className="chip"
              aria-disabled="true"
              data-tip="Design health appears once panels are placed"
              data-tip-left=""
              style={{ color: 'var(--ink-3)', cursor: 'default' }}
            >
              Health —
            </span>
          )}
          <UnitToggle
            unit={units === 'imperial' ? 'ft' : 'm'}
            onChange={(u) => setUnits(u === 'ft' ? 'imperial' : 'metric')}
          />
          <button
            className="btn-ghost"
            aria-label="Save project"
            data-tip="Save project"
            data-tip-left=""
            onClick={() => { patch({}); setToast('Project saved'); setTimeout(() => setToast(null), 1400); }}
          >
            <Save size={16} />
          </button>
          <button
            className="btn-ghost"
            aria-label="Save & go home"
            data-tip="Save & go home"
            data-tip-left=""
            onClick={() => { patch({}); navigate('/projects'); }}
          >
            <Home size={16} />
          </button>
          <button
            className="btn-ghost"
            aria-label={`Help with step ${step}: ${STEP_NAMES[step - 1]}`}
            aria-haspopup="dialog"
            data-tip="Help"
            data-tip-left=""
            onClick={() => setHelpSheet(true)}
          >
            <CircleHelp size={16} />
          </button>
          {step < 10 ? (
            <button className="btn btn-primary" onClick={onNext} style={{ padding: '8px 16px 8px 20px' }}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => navigate('/projects')} style={{ padding: '8px 20px' }}>
              <Check size={16} /> Done
            </button>
          )}
        </div>
      </header>
      {/* progress bar */}
      <div style={{ height: 3, background: 'var(--paper-3)' }}>
        <div
          style={{
            height: '100%',
            width: `${(step / 10) * 100}%`,
            background: 'var(--ink)',
            transition: 'width .3s',
          }}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>{body}</div>

      {helpSheet && (
        <Sheet
          title={`Step ${step} — ${STEP_NAMES[step - 1]}`}
          icon={<CircleHelp size={16} />}
          onClose={() => setHelpSheet(false)}
        >
          <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
            {STEP_HELP[step - 1].does}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            {STEP_HELP[step - 1].tips.map((t) => (
              <li key={t} style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {t}
              </li>
            ))}
          </ul>
        </Sheet>
      )}
      {healthSheet && project && (
        <HealthSheet
          health={memoizedHealth(project)}
          project={project}
          onClose={() => setHealthSheet(false)}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 26,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--ink)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 10,
            fontSize: 13,
            zIndex: 100,
            boxShadow: 'var(--shadow-2)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}


// ─── Design Health widget (§8.2 v1) ─────────────────────────────────────────

const BAND_LABEL = { good: 'Good', fair: 'Fair', poor: 'Poor' } as const;
const BAND_COLOR = {
  good: 'var(--good)',
  fair: 'var(--warn)',
  poor: 'var(--bad)',
} as const;
const CATEGORY_LABEL = {
  energy: 'Energy',
  electrical: 'Electrical',
  utilization: 'Roof utilization',
} as const;

function HealthSheet({
  health,
  project,
  onClose,
}: {
  health: HealthResult;
  project: Project;
  onClose: () => void;
}) {
  const snap = project.derived.healthSnapshot;
  // deltas render only when the persisted snapshot matches the LIVE result —
  // during the stamp debounce the "to" values would contradict the cards above
  const inSync = snap?.current.key === health.key;
  const deltas = inSync && snap?.prev ? explainDelta(snap.prev, snap.current) : [];
  const rules = resolveRules().health;
  return (
    <Sheet title="Design health" icon={<HeartPulse size={16} />} onClose={onClose}>
      {health.provisional && (
        <div className="banner-warn" style={{ borderRadius: 8, marginBottom: 10 }}>
          Shading is recalculating — the energy score is provisional until it lands.
        </div>
      )}
      {health.categories.map((c) => (
        <div key={c.key} className="card" style={{ marginBottom: 8, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>{CATEGORY_LABEL[c.key]}</div>
            {c.score === null ? (
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>not scored yet</span>
            ) : (
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: BAND_COLOR[bandOf(c.score)!],
                }}
              >
                {c.score} / 100
              </span>
            )}
          </div>
          {c.score !== null && c.deductions.length === 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>No issues found.</div>
          )}
          {c.deductions.map((d) => (
            <div
              key={d.code}
              style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, display: 'flex', gap: 8 }}
            >
              <span style={{ color: 'var(--warn)', fontWeight: 700, flex: 'none' }}>−{d.points}</span>
              <span>{d.label}</span>
            </div>
          ))}
        </div>
      ))}
      {deltas.length > 0 && (
        <>
          <div
            style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: 'var(--ink-3)', margin: '12px 0 6px' }}
          >
            WHAT CHANGED
          </div>
          {deltas.map((d) => (
            <div key={d.category} className="card" style={{ marginBottom: 8, padding: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                {CATEGORY_LABEL[d.category]}: {d.from ?? '—'} → {d.to ?? '—'}
              </div>
              {d.added.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--bad)' }}>
                  New: {d.added.map(describeHealthCode).join(' · ')}
                </div>
              )}
              {d.removed.filter((c) => project.insightState[c] !== 'ignored').length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--good)' }}>
                  Resolved:{' '}
                  {d.removed
                    .filter((c) => project.insightState[c] !== 'ignored')
                    .map(describeHealthCode)
                    .join(' · ')}
                </div>
              )}
              {d.removed.filter((c) => project.insightState[c] === 'ignored').length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  Dismissed (not fixed):{' '}
                  {d.removed
                    .filter((c) => project.insightState[c] === 'ignored')
                    .map(describeHealthCode)
                    .join(' · ')}
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {health.context.length > 0 && (
        <p style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 6 }}>
          Context (not scored): {health.context.join(' · ')}
        </p>
      )}
      <p style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 6 }}>
        {health.total !== null &&
          `Total ${health.total} = weighted mean of the scored categories (energy ×${rules.weights.energy}, electrical ×${rules.weights.electrical}, utilization ×${rules.weights.utilization}). `}
        Deterministic rule-based deductions — every point traces to a named issue above. Bands:
        Good ≥ {rules.bands.goodMin}, Fair ≥ {rules.bands.fairMin}.
      </p>
    </Sheet>
  );
}
