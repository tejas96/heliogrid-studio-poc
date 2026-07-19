// ─── Derivation inputs for a section (Phase 22e) ────────────────────────────
// Facts the model cannot measure but the installer knows from the site survey.
// Only Electrical BOS has any today; the component renders nothing elsewhere
// rather than showing an empty card, so sections without inputs cost no space.
import { Ruler } from 'lucide-react';
import { NumberField } from '../../components/ui';
import { dcCableFromRoutes, acCableFromRoutes } from '../../lib/routing';
import type { BomCategory, Project } from '../../types';

export function SectionInputs({
  category,
  project,
  onSetInput,
}: {
  category: BomCategory;
  project: Project;
  onSetInput: (key: 'avgDcRunM' | 'avgAcRunM', v: number | undefined) => void;
}) {
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
        value={inputs?.avgDcRunM}
        routed={dcRouted}
        routedNote="using your routed cable runs"
        ariaLabel="Average DC run in metres, array to inverter"
        onCommit={(v) => onSetInput('avgDcRunM', v)}
      />
      <Field
        label="Avg AC run (inverter → LT panel)"
        value={inputs?.avgAcRunM}
        routed={acRouted}
        routedNote="using your routed AC run"
        ariaLabel="Average AC run in metres, inverter to LT panel"
        onCommit={(v) => onSetInput('avgAcRunM', v)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  routed,
  routedNote,
  ariaLabel,
  onCommit,
}: {
  label: string;
  value: number | undefined;
  routed: boolean;
  routedNote: string;
  ariaLabel: string;
  onCommit: (v: number | undefined) => void;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ color: 'var(--ink-2)' }}>{label}</span>
      <NumberField
        value={value}
        min={0}
        max={2000}
        suffix="m"
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
