// ─── Derivation inputs for a section (Phase 22e) ────────────────────────────
// Facts the model cannot measure but the installer knows from the site survey.
// Only Electrical BOS has any today; the component renders nothing elsewhere
// rather than showing an empty card, so sections without inputs cost no space.
import { Ruler } from 'lucide-react';
import { NumberField } from '../../components/ui';
import { dcCableFromRoutes, acCableFromRoutes } from '../../lib/routing';
import { useUnits } from '../../lib/units';
import type { BomCategory, Project } from '../../types';

/**
 * The stored ceiling, in meters. Converted for display like everything else —
 * left raw it would cap an imperial user at 2000 ft, which is 610 m and not
 * the limit anyone intended.
 */
const MAX_RUN_M = 2000;

export function SectionInputs({
  category,
  project,
  onSetInput,
}: {
  category: BomCategory;
  project: Project;
  onSetInput: (key: 'avgDcRunM' | 'avgAcRunM', v: number | undefined) => void;
}) {
  // E19: these two are the only figures on Step 9 a user MEASURES, so they are
  // the only ones that follow the m/ft toggle. The procurement table stays in
  // meters deliberately — cable, strip and rail are sold by the meter here, and
  // a feet-denominated purchase order would be wrong at the supplier.
  const { units, lenUnit, lenValue, lenToM } = useUnits();
  const unitWord = units === 'imperial' ? 'feet' : 'metres';

  if (category !== 'Electrical BOS') return null;

  const inputs = project.bom?.inputs;
  // Routed geometry outranks a typed figure, so when routes exist the input is
  // shown DISABLED with the reason. Silently ignoring a number the user typed
  // is the version of this that generates support tickets.
  const dcRouted = dcCableFromRoutes(project).routed;
  const acRouted = acCableFromRoutes(project).routed;

  return (
    <div
      className="card"
      style={{
        padding: '10px 12px',
        marginBottom: 8,
        background: 'var(--paper-2)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 18,
        alignItems: 'center',
        fontSize: 11.5,
      }}
    >
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
      >
        <Ruler size={14} aria-hidden /> Survey inputs
      </span>

      <Field
        label="Avg DC run (array → inverter)"
        value={toDisplay(inputs?.avgDcRunM, lenValue)}
        routed={dcRouted}
        routedNote="using your routed cable runs"
        ariaLabel={`Average DC run in ${unitWord}, array to inverter`}
        unitSuffix={lenUnit}
        max={Number(lenValue(MAX_RUN_M))}
        onCommit={(v) => onSetInput('avgDcRunM', v === undefined ? undefined : lenToM(v))}
      />
      <Field
        label="Avg AC run (inverter → LT panel)"
        value={toDisplay(inputs?.avgAcRunM, lenValue)}
        routed={acRouted}
        routedNote="using your routed AC run"
        ariaLabel={`Average AC run in ${unitWord}, inverter to LT panel`}
        unitSuffix={lenUnit}
        max={Number(lenValue(MAX_RUN_M))}
        onCommit={(v) => onSetInput('avgAcRunM', v === undefined ? undefined : lenToM(v))}
      />
    </div>
  );
}

/** Stored meters → the number shown in the box. `undefined` stays unset, so
 *  the field keeps showing its "auto" placeholder rather than a hard 0. */
function toDisplay(m: number | undefined, lenValue: (m: number) => string) {
  return m === undefined ? undefined : Number(lenValue(m));
}

function Field({
  label,
  value,
  routed,
  routedNote,
  ariaLabel,
  unitSuffix,
  max,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  routed: boolean;
  routedNote: string;
  ariaLabel: string;
  unitSuffix: string;
  max: number;
  onCommit: (v: number | undefined) => void;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ color: 'var(--ink-2)' }}>{label}</span>
      <NumberField
        value={value}
        min={0}
        max={max}
        suffix={unitSuffix}
        placeholder="auto"
        disabled={routed}
        ariaLabel={ariaLabel}
        onCommit={onCommit}
      />
      {routed && (
        <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>— {routedNote}</span>
      )}
    </label>
  );
}
