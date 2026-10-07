// Right panel of the structure view: every structure control, in build order,
// acting on EVERY selected table. Each control shows the selection's shared
// value, or "Mixed" when the tables differ — picking a value then aligns them.
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ArraySegment, FoundationKind, Project, SectionDims } from '../../types';
import type { SegmentStructure } from '../../lib/structure-model';
import { resolveRacking, STRUCTURE_DISCLAIMER } from '../../lib/structure';
import { STRUCTURE_PROFILES } from '../../lib/segment-ops';
import { shapeOptionsFor } from '../../lib/structure-view';
import { foundationDeadLoadKg, foundationTooTall } from '../../lib/foundation';
import { mmsEngineering } from '../../lib/mms/engineering';
import { isTrackerKind } from '../../lib/energy/tracker';
import type { StructChoice } from '../../lib/structure-edit';
import {
  commonValue,
  FOUNDATION_HINT,
  FOUNDATION_LABEL,
  foundationChoicesFor,
  heightChoicesFor,
  STRUCTURE_TYPE_LABEL,
  steelTakeoff,
  partGroups,
  type TableRow,
} from '../../lib/structure-step';
import { StructurePreview } from '../../components/StructurePreview';
import { sectionSvgPath } from '../../three/profile-geometry';

export type DetailDialog = 'legs' | 'mms' | 'loads';

interface Actions {
  choice: (c: StructChoice, verb: string) => void;
  choiceEach: (of: (segId: string) => StructChoice | null, verb: string) => void;
  setLegSpacing: (m: number) => void;
}

export function StructureInspector({
  project,
  rows,
  selected,
  structures,
  allStructures,
  heightDeltas,
  actions,
  fmtLen,
  onOpen,
  onShowIssue,
  onClear,
  onChangeLayout,
}: {
  project: Project;
  rows: TableRow[];
  selected: TableRow[];
  /** the SELECTED tables' structures */
  structures: SegmentStructure[];
  /** every table's — a roof's load is all of them */
  allStructures: SegmentStructure[];
  /** steel kg each type card would add (+) or remove (−); null = no change */
  heightDeltas: Record<'flush' | 'elevated' | 'walkunder', number | null>;
  actions: Actions;
  fmtLen: (m: number, dp?: number) => string;
  onOpen: (d: DetailDialog) => void;
  onShowIssue: (componentIds: string[]) => void;
  onClear: () => void;
  onChangeLayout: () => void;
}) {
  const spec = project.components.panel;
  if (rows.length === 0)
    return (
      <Shell>
        <Empty title="No tables yet">
          Place panels in Step 6. Each table appears here with its structure.
        </Empty>
      </Shell>
    );
  if (selected.length === 0 || !spec)
    return (
      <Shell>
        <Empty title="Pick the tables to work on">
          Click a table in the list or in the 3D view. Tick more tables to change them all at once.
        </Empty>
      </Shell>
    );

  const segs = selected
    .map((r) => project.segments.find((s) => s.id === r.segId))
    .filter((s): s is ArraySegment => !!s);
  const roofOf = (s: ArraySegment) => project.roofs.find((r) => r.id === s.roofId)!;
  const resolvedOf = (s: ArraySegment) => resolveRacking(project, roofOf(s), s, spec);
  const elevated = segs.filter((s) => s.racking.kind !== 'flush');
  const panels = selected.reduce((a, r) => a + r.panels, 0);
  const kwp = selected.reduce((a, r) => a + r.kwp, 0);
  const many = selected.length > 1;

  // ── 1 · type and height ───────────────────────────────────────────────────
  const heightable = segs.filter((s) => heightChoicesFor(roofOf(s), s).length > 0);
  const typeNow = commonValue(selected.map((r) => r.type));
  const clearNow = commonValue(
    elevated.map((s) => Math.round((resolvedOf(s)?.frontLegM ?? 0) * 100) / 100),
  );
  const facadeOnly = segs.every((s) => roofOf(s).roofType === 'facade');
  const azelAny = segs.some((s) => s.racking.kind === 'tracker_azel');
  const groundAny = segs.some((s) => roofOf(s).roofType === 'ground');
  const tiltNow = commonValue(selected.map((r) => r.tiltDeg));

  // ── 2 · profile — only tables whose members share one section ─────────────
  const profiled = elevated.filter((s) => s.racking.kind !== 'tracker_azel');
  const profileNow = commonValue(profiled.map((s) => (s.racking.kind !== 'flush' ? s.racking.profile.key : '')));

  // ── 3 · foundation — what EVERY selected elevated table can stand on ─────
  const foundationSets = elevated.map((s) => foundationChoicesFor(roofOf(s), s));
  const foundationOpts: FoundationKind[] = foundationSets.length
    ? foundationSets[0].filter((f) => foundationSets.every((set) => set.includes(f)))
    : [];
  const foundationNow = commonValue(elevated.map((s) => resolvedOf(s)?.foundation ?? null));
  const shapeNow = commonValue(elevated.map((s) => resolvedOf(s)?.foundationShape ?? null));
  const legBases = structures.reduce((n, st) => n + st.nodes.filter((x) => x.kind === 'roof_anchor').length, 0);
  // the roof carries EVERY table on it, selected or not
  const loadReport = mmsEngineering(project, allStructures);
  const selectedRoofIds = new Set(segs.map((s) => s.roofId));
  const roofLoads = loadReport.roofs.filter((r) => selectedRoofIds.has(r.roofId) && r.supportCount > 0);
  const capacityKpa = project.mmsEngineering?.roofCapacityKpa;

  // ── 4 · frame ─────────────────────────────────────────────────────────────
  const framed = profiled; // a dual-axis mast has no purlins or rafters to count
  const rk = (s: ArraySegment) => (s.racking.kind !== 'flush' ? s.racking : null);
  const purlinsNow = commonValue(framed.map((s) => rk(s)?.purlinCount ?? 2));
  const multNow = commonValue(framed.map((s) => rk(s)?.rafterMultiplier ?? 1));
  const bufferNow = commonValue(framed.map((s) => rk(s)?.endBufferM ?? 0));
  const bracedNow = commonValue(framed.map((s) => rk(s)?.bracing !== false));
  const spacingNow = commonValue(framed.map((s) => Math.round((resolvedOf(s)?.legSpacingM ?? 2) * 100) / 100));
  /** default ⇒ undefined, so the key is dropped and an untouched table stays byte-identical */
  const mmsStep = (field: 'purlinCount' | 'rafterMultiplier' | 'endBufferM', dflt: number, next: (v: number) => number | null) =>
    actions.choiceEach((segId) => {
      const s = framed.find((x) => x.id === segId);
      const r = s ? rk(s) : null;
      if (!r) return null;
      const cur = (r[field] as number | undefined) ?? dflt;
      const v = next(cur);
      if (v === null || v === cur) return null;
      return { kind: 'mms', field, value: v === dflt ? undefined : v };
    }, 'Frame');

  // ── 5–9 ───────────────────────────────────────────────────────────────────
  const single = selected.length === 1 ? segs[0] : null;
  const withMms = segs.filter((s) => s.mms).length;
  const issues = selected.flatMap((r) => r.issues.map((i) => ({ ...i, label: r.label })));
  const steel = steelTakeoff(structures);
  const groups = partGroups(structures).filter((g) => g.totalM != null);
  const eng = project.mmsEngineering ?? {};

  return (
    <Shell>
      <div className="sticky top-0 z-10 flex flex-col gap-1 border-b border-border bg-surface-raised px-4 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {many ? `Editing ${selected.length} tables` : `Editing table ${selected[0].label}`}
          </h2>
          <button type="button" onClick={onClear} className="min-h-6 rounded-sm px-2 text-xs font-medium text-accent-text hover:bg-accent-subtle">
            Clear
          </button>
        </div>
        <p className="text-xs text-muted tabular-nums">
          {selected.map((r) => r.label).join(', ')} · {panels} panels · {kwp.toFixed(2)} kWp
        </p>
        {many && (
          <p className="mt-1 rounded-sm bg-surface-sunken px-2 py-1 text-xs text-muted">
            Every change goes to all selected tables. Undo reverts it in one step.
          </p>
        )}
      </div>

      <Section n={1} title="Structure type" badge={typeNow === 'mixed' ? 'Mixed — pick one to align' : undefined}>
        {facadeOnly ? (
          <Note>
            Facade modules hang on wall brackets, flat to the wall. There is no table and no footing,
            so there is no type to pick. Choose rails or spandrel infill under Mounting system.
          </Note>
        ) : heightable.length === 0 ? (
          <Note>
            {azelAny
              ? 'A dual-axis tracker stands on one cast pier per mast. Its depth, size and hold-down are an engineer’s design for the soil and IS 875 Part 3.'
              : groundAny
                ? 'A ground table stands in the earth. Pick what it stands on under Foundation.'
                : `${STRUCTURE_TYPE_LABEL[selected[0].type]} — set the racking in Step 6.`}
          </Note>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {(['flush', 'elevated', 'walkunder'] as const).map((h) => {
                const on = typeNow === h;
                const sample = elevated[0] ? resolvedOf(elevated[0]) : null;
                const preview =
                  h === 'flush' || !sample
                    ? null
                    : { ...sample, frontLegM: h === 'walkunder' ? 2.2 : 0.3, backLegM: (h === 'walkunder' ? 2.2 : 0.3) + (sample.backLegM - sample.frontLegM) };
                return (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={on}
                    onClick={() => !on && actions.choice({ kind: 'height', height: h }, `Structure ${STRUCTURE_TYPE_LABEL[h].toLowerCase()}`)}
                    className={
                      'flex flex-col items-start gap-1 rounded-md border p-2 text-left ' +
                      (on ? 'border-accent-border bg-accent-subtle' : 'border-border bg-surface-raised hover:border-border-strong')
                    }
                  >
                    <StructurePreview racking={preview} spec={spec} flush={h === 'flush'} width={96} height={48} />
                    <span className="text-sm font-semibold">{STRUCTURE_TYPE_LABEL[h]}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {h === 'flush' ? 'on the roof' : fmtLen(h === 'walkunder' ? 2.2 : 0.3, 2)}
                    </span>
                    <span className="text-2xs text-muted tabular-nums">
                      {on ? 'current' : steelDelta(heightDeltas[h])}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {elevated.length > 0 && !azelAny && (
          <Stepper
            label="Clearance"
            value={clearNow === 'mixed' ? 'Mixed' : fmtLen(clearNow ?? 0, 2)}
            onMinus={() =>
              actions.choiceEach((segId) => {
                const s = elevated.find((x) => x.id === segId);
                const f = s ? (resolvedOf(s)?.frontLegM ?? 0) : 0;
                return s && f > 0.05 ? { kind: 'clearance', clearanceM: Math.max(0, Math.round((f - 0.3) * 10) / 10) } : null;
              }, 'Clearance −0.3 m')
            }
            onPlus={() =>
              actions.choiceEach((segId) => {
                const s = elevated.find((x) => x.id === segId);
                const f = s ? (resolvedOf(s)?.frontLegM ?? 0) : 0;
                return s && f < 3 ? { kind: 'clearance', clearanceM: Math.min(3, Math.round((f + 0.3) * 10) / 10) } : null;
              }, 'Clearance +0.3 m')
            }
          />
        )}
        {tiltNow !== null && !segs.some((s) => s.racking.kind !== 'flush' && isTrackerKind(s.racking.kind)) && (
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>
              Tilt <span className="text-text tabular-nums">{tiltNow === 'mixed' ? 'mixed' : `${tiltNow}°`}</span> · set with the layout
            </span>
            <button type="button" onClick={onChangeLayout} className="font-medium text-accent-text hover:underline">
              Change in Step 6
            </button>
          </div>
        )}
      </Section>

      {profiled.length > 0 && (
        <Section n={2} title="Profile" aside="kg per metre" badge={profileNow === 'mixed' ? 'Mixed' : undefined}>
          <div className="grid grid-cols-2 gap-1">
            {STRUCTURE_PROFILES.map((p) => {
              const on = profileNow === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${p.label}${p.sectionMm ? `, ${p.sectionMm} millimetres` : ''}, ${p.kgPerM} kilograms per metre`}
                  onClick={() => !on && actions.choice({ kind: 'profile', key: p.key }, `Section ${p.label}`)}
                  className={
                    'flex min-h-8 items-center gap-2 rounded-sm border px-2 text-left ' +
                    (on ? 'border-accent-border bg-accent-subtle' : 'border-border hover:border-border-strong')
                  }
                >
                  <SectionGlyph dims={p.dims} />
                  <span className="min-w-0 flex-1 truncate text-xs">{p.label}</span>
                  <span className="text-xs text-muted tabular-nums">{p.kgPerM}</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {elevated.length > 0 && (
        <Section n={3} title="Foundation" badge={foundationNow === 'mixed' ? 'Mixed' : undefined}>
          {foundationOpts.length === 0 ? (
            <Note>
              {azelAny
                ? 'One cast pier per mast — no other footing carries a dual-axis tracker.'
                : 'These tables mount through the roof covering, so there is no foundation to choose.'}
            </Note>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {foundationOpts.map((f) => {
                const on = foundationNow === f;
                const tooTall = elevated.some((s) => foundationTooTall(resolvedOf(s)?.frontLegM ?? 0, f));
                return (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={on}
                    onClick={() => !on && actions.choice({ kind: 'foundation', foundation: f }, FOUNDATION_LABEL[f])}
                    className={
                      'flex flex-col items-start gap-1 rounded-md border p-2 text-left ' +
                      (on ? 'border-accent-border bg-accent-subtle' : 'border-border hover:border-border-strong')
                    }
                  >
                    <span className="text-sm font-semibold">{FOUNDATION_LABEL[f]}</span>
                    <span className={'text-xs ' + (tooTall ? 'text-warning' : 'text-muted')}>
                      {tooTall ? 'Taller than the clearance' : FOUNDATION_HINT[f]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {foundationNow !== 'mixed' && foundationNow && shapeOptionsFor(foundationNow).length > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm">Pedestal shape</span>
              <Segmented
                label="Pedestal shape"
                value={shapeNow === 'mixed' ? null : shapeNow}
                options={shapeOptionsFor(foundationNow).map((sh) => ({ value: sh, label: sh === 'square' ? 'Square' : 'Circular' }))}
                onChange={(sh) => actions.choice({ kind: 'foundationShape', shape: sh }, `Pedestal ${sh}`)}
              />
            </div>
          )}
          {foundationNow && foundationNow !== 'mixed' && (
            <p className="mt-2 text-xs text-muted">
              Nominal size — assumed, engineer to confirm.
              {foundationDeadLoadKg(foundationNow, shapeNow === 'mixed' || !shapeNow ? undefined : shapeNow) > 0 &&
                ` ${legBases} footings on these tables.`}
            </p>
          )}
          {roofLoads.map((r) => {
            const added = r.memberKg + r.foundationKg;
            const pct = capacityKpa && r.averageLoadKpa != null ? Math.min(100, (r.averageLoadKpa / capacityKpa) * 100) : null;
            return (
              <div key={r.roofId} className="mt-3 flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
                <div className="flex justify-between gap-2 text-sm">
                  <span>Added load on {r.name}</span>
                  <span className="font-medium tabular-nums">+{Math.round(added).toLocaleString('en-IN')} kg</span>
                </div>
                {pct != null ? (
                  <>
                    <svg
                      className="h-2 w-full overflow-hidden rounded-full"
                      viewBox="0 0 100 2"
                      preserveAspectRatio="none"
                      role="meter"
                      aria-label={`Roof load ${Math.round(pct)}% of entered capacity`}
                      aria-valuenow={Math.round(pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <rect width="100" height="2" className="fill-border" />
                      <rect width={pct} height="2" className={pct > 80 ? 'fill-danger' : pct > 50 ? 'fill-warning' : 'fill-success'} />
                    </svg>
                    <span className="text-xs text-muted tabular-nums">
                      Roof-area average {r.averageLoadKpa!.toFixed(2)} kPa of {capacityKpa} kPa entered · estimate
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-muted">
                    Roof capacity is not entered, so this is not checked.{' '}
                    <button type="button" onClick={() => onOpen('loads')} className="font-medium text-accent-text hover:underline">
                      Add it in Site loads
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {framed.length > 0 && (
        <Section n={4} title="Frame">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Stepper
              stacked
              label="Purlins per row"
              value={purlinsNow === 'mixed' ? 'Mixed' : String(purlinsNow)}
              onMinus={() => mmsStep('purlinCount', 2, (v) => (v > 1 ? v - 1 : null))}
              onPlus={() => mmsStep('purlinCount', 2, (v) => (v < 6 ? v + 1 : null))}
            />
            <Stepper
              stacked
              label="Rafter density"
              value={multNow === 'mixed' ? 'Mixed' : `${multNow}×`}
              onMinus={() => mmsStep('rafterMultiplier', 1, (v) => (v > 1 ? Math.round((v - 0.5) * 10) / 10 : null))}
              onPlus={() => mmsStep('rafterMultiplier', 1, (v) => (v < 3 ? Math.round((v + 0.5) * 10) / 10 : null))}
            />
            <Stepper
              stacked
              label="End overhang"
              value={bufferNow === 'mixed' ? 'Mixed' : fmtLen(bufferNow ?? 0, 2)}
              onMinus={() => mmsStep('endBufferM', 0, (v) => (v > 0 ? Math.round((v - 0.1) * 100) / 100 : null))}
              onPlus={() => mmsStep('endBufferM', 0, (v) => (v < 1 ? Math.round((v + 0.1) * 100) / 100 : null))}
            />
            <Stepper
              stacked
              label="Leg spacing"
              value={spacingNow === 'mixed' ? 'Mixed' : fmtLen(spacingNow ?? 2, 2)}
              onMinus={() => {
                const base = spacingNow === 'mixed' || spacingNow == null ? 2 : spacingNow;
                if (base > 0.5) actions.setLegSpacing(Math.max(0.5, Math.round((base - 0.25) * 100) / 100));
              }}
              onPlus={() => {
                const base = spacingNow === 'mixed' || spacingNow == null ? 2 : spacingNow;
                if (base < 4) actions.setLegSpacing(Math.min(4, Math.round((base + 0.25) * 100) / 100));
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm">Bracing</span>
            <Segmented
              label="Bracing"
              value={bracedNow === 'mixed' ? null : bracedNow ? 'braced' : 'none'}
              options={[
                { value: 'none', label: 'None' },
                { value: 'braced', label: 'Braced' },
              ]}
              onChange={(v) =>
                actions.choice({ kind: 'mms', field: 'bracing', value: v === 'braced' ? undefined : false }, v === 'braced' ? 'Bracing on' : 'Bracing off')
              }
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Rafter density is a material allowance, not a safety factor. No structural analysis is done here.
          </p>
        </Section>
      )}

      <LinkRow
        n={5}
        title="Legs"
        sub={
          single
            ? `${single.legPlan ? 'Placed by hand' : 'Automatic'} · ${structures[0]?.nodes.filter((x) => x.kind === 'roof_anchor').length ?? 0} leg bases`
            : 'Select one table to edit its legs'
        }
        action="Edit legs"
        disabled={!single || single.racking.kind === 'flush'}
        onClick={() => onOpen('legs')}
      />
      <LinkRow
        n={6}
        title="Mounting system"
        sub={withMms === 0 ? 'Not generated · rails, clamps and anchors from the catalogue' : `Generated on ${withMms} of ${segs.length} selected`}
        action={withMms === 0 ? 'Set up' : 'Open'}
        onClick={() => onOpen('mms')}
      />
      <LinkRow
        n={7}
        title="Site loads"
        sub={[
          eng.basicWindSpeedMs != null ? `Wind ${eng.basicWindSpeedMs} m/s` : 'Wind not set',
          eng.terrainCategory != null ? `terrain ${eng.terrainCategory}` : null,
          eng.seismicZone ? `seismic ${eng.seismicZone}` : null,
          eng.roofCapacityKpa != null ? `roof ${eng.roofCapacityKpa} kPa` : 'roof capacity not set',
        ]
          .filter(Boolean)
          .join(' · ')}
        action="Edit"
        onClick={() => onOpen('loads')}
      />

      <Section
        n={8}
        title="Checks"
        aside={`${issues.filter((i) => i.status === 'error').length} errors · ${issues.filter((i) => i.status === 'warning').length} warnings`}
      >
        {issues.length === 0 ? (
          <p className="text-sm text-success">Everything passes for these tables.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {issues.map((i, k) => (
              <li
                key={k}
                className={'flex items-start gap-2 rounded-md p-2 text-xs ' + (i.status === 'error' ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning')}
              >
                <span className="flex-1">
                  <b className="font-semibold">{i.label}:</b> {i.message}
                </span>
                {i.componentIds.length > 0 && (
                  <button type="button" onClick={() => onShowIssue(i.componentIds)} className="shrink-0 rounded-sm border border-current px-2 font-medium">
                    Show
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section n={9} title="Take-off for selection" badge="derived">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-muted">
              <th className="py-1 text-left font-normal">Member</th>
              <th className="py-1 text-right font-normal">Qty</th>
              <th className="py-1 text-right font-normal">Length</th>
              <th className="py-1 text-right font-normal">Weight</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className="border-t border-border-subtle">
                <td className="py-1">{g.label}</td>
                <td className="py-1 text-right">{g.count}</td>
                <td className="py-1 text-right">{g.totalM!.toFixed(1)} m</td>
                <td className="py-1 text-right">{g.kg != null ? `${g.kg.toFixed(1)} kg` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-2 grid grid-cols-2 gap-y-1 text-xs tabular-nums">
          <dt>Net steel</dt>
          <dd className="text-right">{steel.netKg.toFixed(1)} kg</dd>
          <dt className="text-muted">Waste allowance {steel.wastePct} %</dt>
          <dd className="text-right text-muted">+{steel.wasteKg.toFixed(1)} kg</dd>
          <dt className="border-t border-text pt-1 font-semibold">To order</dt>
          <dd className="border-t border-text pt-1 text-right font-semibold">{steel.orderKg.toFixed(1)} kg</dd>
        </dl>
        <p className="mt-3 rounded-md border border-dashed border-border-strong p-2 text-xs text-muted">{STRUCTURE_DISCLAIMER}</p>
      </Section>
    </Shell>
  );
}

/** "+192 kg steel" — what a card would do before it is picked; derived. */
function steelDelta(kg: number | null): string {
  if (kg === null) return 'no change';
  const r = Math.round(kg);
  if (r === 0) return 'same steel';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toLocaleString('en-IN')} kg steel`;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <aside aria-label="Structure settings" className="flex w-sm shrink-0 flex-col overflow-y-auto border-l border-border bg-surface-raised">
      {children}
    </aside>
  );
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-6 py-12 text-center">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

function Section({ n, title, aside, badge, children }: { n: number; title: string; aside?: string; badge?: string; children: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-4" aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-sm bg-text text-2xs font-semibold text-surface tabular-nums" aria-hidden>
          {n}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {badge && <span className="rounded-full bg-accent-subtle px-2 text-2xs font-medium text-accent-text">{badge}</span>}
        <span className="flex-1" />
        {aside && <span className="text-xs text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-surface-sunken p-3 text-xs text-muted">{children}</p>;
}

function Stepper({ label, value, onMinus, onPlus, stacked }: { label: string; value: string; onMinus: () => void; onPlus: () => void; stacked?: boolean }) {
  const box = (
    <span className="flex h-8 items-center rounded-sm border border-border">
      <button type="button" onClick={onMinus} aria-label={`${label}: less`} className="flex size-8 items-center justify-center hover:bg-surface-sunken">
        −
      </button>
      <span className="min-w-16 flex-1 text-center text-sm tabular-nums">{value}</span>
      <button type="button" onClick={onPlus} aria-label={`${label}: more`} className="flex size-8 items-center justify-center hover:bg-surface-sunken">
        +
      </button>
    </span>
  );
  return stacked ? (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {box}
    </div>
  ) : (
    <div className="mt-3 flex items-center justify-between gap-2">
      <span className="text-sm">{label}</span>
      {box}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-surface-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => value !== o.value && onChange(o.value)}
          className={'min-h-6 rounded-sm px-3 text-xs font-medium ' + (value === o.value ? 'bg-surface-raised shadow-1' : 'text-muted hover:text-text')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LinkRow({ n, title, sub, action, onClick, disabled }: { n: number; title: string; sub: string; action: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-surface-sunken disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-text text-2xs font-semibold text-surface tabular-nums" aria-hidden>
        {n}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted">{sub}</span>
      </span>
      {!disabled && (
        <span className="flex items-center gap-1 text-xs font-medium text-accent-text">
          {action}
          <ChevronRight size={14} aria-hidden />
        </span>
      )}
    </button>
  );
}

/** Cross-section glyph from the SAME outline the 3D member extrudes. */
function SectionGlyph({ dims }: { dims?: SectionDims }) {
  if (!dims) return <span className="size-4 shrink-0" aria-hidden />;
  const { path, w, h } = sectionSvgPath(dims);
  return (
    <svg className="size-4 shrink-0 fill-surface-sunken stroke-muted" viewBox={`-1 -1 ${w + 2} ${h + 2}`} aria-hidden>
      <path d={path} fillRule="evenodd" strokeWidth={1.2} />
    </svg>
  );
}
