import { useState } from 'react';
import { Layers3, Settings2, ClipboardCheck } from 'lucide-react';
import type { Project } from '../../types';
import type { MmsConfig, MountStrategy } from '../../lib/mms/types';
import { defaultMms, MATERIALS, MOUNT_CATALOGUE } from '../../lib/mms/catalogue';
import { clearMms, configureMms } from '../../lib/mms/configure';
import { applyStructChoice } from '../../lib/structure-edit';
import { setSegmentStructureFields } from '../../lib/segment-ops';
import { deriveStructures } from '../../lib/derive/structures';
import { validateMms } from '../../lib/mms/validate';
import { panelFootprintM } from '../../lib/layout';
import { MmsField, MmsSection } from './MmsField';
import { MmsEngineeringPanel } from './MmsEngineeringPanel';

export function MmsConfiguration({ project, segmentId, prefix, onPatch }: { project: Project; segmentId: string; prefix: string; onPatch: (p: Partial<Project>) => void }) {
  const [tab, setTab] = useState('basic');
  const seg = project.segments.find(s => s.id === segmentId);
  const roof = project.roofs.find(r => r.id === seg?.roofId);
  if (!seg || !roof) return null;
  const cfg = seg.mms ?? defaultMms(roof.roofType);
  const update = (p: Partial<MmsConfig>) => onPatch(configureMms(project, seg.id, undefined, p));
  const choice = (c: Parameters<typeof applyStructChoice>[2]) => { const p = applyStructChoice(project, seg.id, c); if (p) onPatch(p); };
  const structures = deriveStructures(project);
  const mine = structures.find(s => s.segmentId === seg.id);
  const findings = validateMms(project, structures).filter(f => f.segmentId === seg.id);
  const errors = findings.filter(f => f.status === 'error');
  const moduleSlantM = project.components.panel ? panelFootprintM(project.components.panel, seg.orientation).h : 0;
  // On open ground the table may ALREADY be a tracker, or founded on ballast or a
  // cast pedestal, chosen in the older racking control in Step 6. Generating an
  // MMS must not overrule that, so the seed is read back from the RESOLVED
  // structure (which is where the lazy foundation field is settled) instead of
  // taking the catalogue's first ground entry.
  const ground = roof.roofType === 'ground';
  const groundSeed: MountStrategy | undefined = !ground ? undefined
    : seg.racking.kind === 'tracker_hsat' ? 'ground_tracker'
      : mine?.foundation === 'ballast' ? 'ground_ballast'
        : mine?.foundation === 'concrete' ? 'ground_pedestal'
          : 'ground_pile';
  const number = (field: 'attachmentSpacingM' | 'railStockLengthM' | 'railInsetRatio' | 'edgeClearanceM' | 'obstacleClearanceM', label: string, min: number, max: number, step = .01) => <MmsField id={`${prefix}-${field}`} label={label} value={cfg[field]} min={min} max={max} step={step} onChange={v => v !== undefined && update({ [field]: v })} />;
  return <section className="mms-config" data-testid={`${prefix}-configuration`}>
    <div className="mms-heading"><Layers3 size={17} /><strong>Mounting system</strong><span data-testid={`${prefix}-state`}>{seg.mms ? 'Live model' : 'Existing structure'}</span></div>
    {!seg.mms ? <button className="btn primary" data-testid={`${prefix}-generate`} onClick={() => onPatch(configureMms(project, seg.id, groundSeed ?? (roof.pitchDeg > 0 ? (roof.roofType === 'tile' ? 'roof_hook' : 'flush') : cfg.strategy)))}>Generate MMS</button> : <>
      {/* the way back out. Generating was one-way, so a table tried by mistake
          could only be undone in the same session — and never after a reload */}
      <button className="btn" data-testid={`${prefix}-remove`} onClick={() => onPatch(clearMms(project, seg.id))} title="Drop the modelled mounting system. Tilt, height and spacing stay as you set them.">Remove MMS</button>
      <div className="mms-tabs" role="tablist" aria-label="MMS configuration">
        {([['basic', 'Basic', Layers3], ['advanced', 'Advanced', Settings2], ['engineering', 'Engineering', ClipboardCheck]] as const).map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={tab === id} data-testid={`${prefix}-tab-${id}`} onClick={() => setTab(id)}><Icon size={14} />{label}</button>)}
      </div>
      {tab === 'basic' && <div className="mms-fields">
        <label className="mms-field">MMS type<select aria-label="MMS type" data-testid={`${prefix}-strategy`} value={cfg.strategy} onChange={e => onPatch(configureMms(project, seg.id, e.target.value as MountStrategy))}>{MOUNT_CATALOGUE.filter(p => p.roofs.includes(roof.roofType)).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        {seg.racking.kind !== 'flush' && <>
          {/* A tracker's tilt is the time of day, not a setting — setSegmentTilt
              refuses it — so this slider would have moved nothing at all. */}
          {seg.racking.kind !== 'tracker_hsat' && <MmsField id={`${prefix}-tilt`} label="Tilt (°)" value={seg.racking.tiltDeg} min={5} max={35} step={1} onChange={v => v !== undefined && choice({ kind: 'tilt', tiltDeg: v })} />}
          <MmsField id={`${prefix}-height`} label={ground ? 'Module clearance above grade (m)' : 'Low-edge height above roof (m)'} value={Math.max(seg.racking.frontLegM, seg.racking.clearanceM ?? 0)} min={.2} max={10} step={.05} onChange={v => v !== undefined && choice({ kind: 'clearance', clearanceM: v })} />
          <div className="mms-height-presets">{[3, 5, 6, 8].map(ft => <button className="btn" key={ft} data-testid={`${prefix}-height-${ft}ft`} onClick={() => choice({ kind: 'clearance', clearanceM: ft * .3048 })}>{ft} ft</button>)}</div>
          <MmsField id={`${prefix}-support-spacing`} label="Support / beam station spacing (m)" value={seg.racking.legSpacingM ?? 2} min={.3} max={6} onChange={v => v !== undefined && onPatch({ segments: project.segments.map(s => s.id === seg.id ? setSegmentStructureFields(s, { legSpacingM: v }) : s) })} />
        </>}
        {number('railInsetRatio', 'Rail inset / module length', 0, .4)}
        {moduleSlantM > 0 && <MmsField id={`${prefix}-rail-centres`} label="Rail centres along module (m)" value={Number((moduleSlantM * (1 - 2 * cfg.railInsetRatio)).toFixed(3))} min={moduleSlantM * .2} max={moduleSlantM} step={.01} onChange={v => v !== undefined && update({ railInsetRatio: (1 - v / moduleSlantM) / 2 })} />}
        {seg.racking.kind === 'flush' && number('attachmentSpacingM', 'Roof attachment centres (m)', .15, 4)}
        <dl className="mms-metrics" data-testid={`${prefix}-takeoff`}><dt>Members</dt><dd>{mine?.members.length ?? 0}</dd><dt>Connections</dt><dd>{mine?.nodes.length ?? 0}</dd><dt>Member mass · derived</dt><dd>{mine?.steelKg.toFixed(1) ?? '0'} kg</dd></dl>
      </div>}
      {tab === 'advanced' && <>
        <label className="mms-field">Material<select aria-label="MMS material" data-testid={`${prefix}-material`} value={cfg.material} onChange={e => update({ material: e.target.value as MmsConfig['material'] })}>{Object.entries(MATERIALS).map(([key, v]) => <option key={key} value={key}>{v.label}</option>)}</select></label>
        <MmsSection id={`${prefix}-clearance`} title="Clearances & structural layout">
          {number('edgeClearanceM', ground ? 'Boundary setback clearance (m)' : 'Roof-edge clearance (m)', 0, 3)}{number('obstacleClearanceM', 'Obstacle clearance (m)', 0, 2)}
          {number('railStockLengthM', 'Rail stock / splice interval (m)', .3, 12, .1)}
          {seg.racking.kind !== 'flush' && <><MmsField id={`${prefix}-rails`} label="Rails per module row" min={2} max={6} step={1} value={seg.racking.purlinCount ?? 2} onChange={v => v !== undefined && choice({ kind: 'mms', field: 'purlinCount', value: Math.round(v) })} /><label className="mms-field">Diagonal bracing<input data-testid={`${prefix}-bracing`} type="checkbox" checked={seg.racking.bracing !== false} onChange={e => choice({ kind: 'mms', field: 'bracing', value: e.target.checked })} /></label></>}
          {/* Only a FLUSH table is fixed to a roof surface, and the flag's single
              consumer is the flush `attachment_unverified` finding. On an
              elevated or ground table it cleared nothing. */}
          {seg.racking.kind === 'flush' && <label className="mms-field">Roof attachment survey confirmed<input type="checkbox" data-testid={`${prefix}-attachment-verified`} checked={cfg.attachmentVerified ?? false} onChange={e => update({ attachmentVerified: e.target.checked })} /></label>}
        </MmsSection>
        <MmsSection id={`${prefix}-anchors`} title="Anchors & base plate">
          <label className="mms-field">Anchor type<select data-testid={`${prefix}-anchor-type`} aria-label="Anchor type" value={cfg.anchor.type} onChange={e => update({ anchor: { ...cfg.anchor, type: e.target.value as MmsConfig['anchor']['type'] } })}><option value="chemical">Chemical</option><option value="mechanical">Mechanical</option><option value="cast_in">Cast-in</option></select></label>
          {([['count', 'Anchors per plate', 2, 16, 1], ['diameterMm', 'Diameter (mm)', 6, 36, 1], ['embedmentMm', 'Embedment (mm)', 20, 1000, 5], ['spacingMm', 'Anchor spacing (mm)', 20, 800, 5], ['plateSizeMm', 'Base plate size (mm)', 80, 1000, 10], ['plateThicknessMm', 'Plate thickness (mm)', 4, 50, 1], ['tensileCapacityKn', 'Certified tensile capacity (kN)', .1, 500, .1], ['shearCapacityKn', 'Certified shear capacity (kN)', .1, 500, .1]] as const).map(([key, label, min, max, step]) => <MmsField key={key} id={`${prefix}-anchor-${key}`} label={label} min={min} max={max} step={step} value={cfg.anchor[key]} onChange={v => (v !== undefined || ['embedmentMm', 'tensileCapacityKn', 'shearCapacityKn'].includes(key)) && update({ anchor: { ...cfg.anchor, [key]: v } })} />)}
          <label className="mms-field">Substrate / concrete grade<input data-testid={`${prefix}-anchor-substrate`} value={cfg.anchor.substrate ?? ''} onChange={e => update({ anchor: { ...cfg.anchor, substrate: e.target.value } })} /></label>
        </MmsSection>
        <MmsSection id={`${prefix}-ballast`} title="Ballast distribution">
          <label className="mms-field">Ballast type<select data-testid={`${prefix}-ballast-type`} value={cfg.ballast.type} onChange={e => update({ ballast: { ...cfg.ballast, type: e.target.value as 'precast_concrete' | 'custom' } })}><option value="precast_concrete">Precast concrete</option><option value="custom">Custom</option></select></label>
          {([['lengthM', 'Block length (m)', .1, 3, .05], ['widthM', 'Block width (m)', .1, 3, .05], ['heightM', 'Block height (m)', .05, 1, .01], ['massKg', 'Declared block mass (kg)', 1, 3000, 1], ['blocksPerSupport', 'Blocks per support', 1, 20, 1], ['frictionCoefficient', 'Tested friction coefficient', .01, 2, .01]] as const).map(([key, label, min, max, step]) => <MmsField key={key} id={`${prefix}-ballast-${key}`} label={label} min={min} max={max} step={step} value={cfg.ballast[key]} onChange={v => (v !== undefined || key === 'frictionCoefficient') && update({ ballast: { ...cfg.ballast, [key]: v } })} />)}
          <p className="mms-note" data-testid={`${prefix}-ballast-assumption`}>Dimensions and declared mass are separate inputs. Resistance is not calculated.</p>
        </MmsSection>
      </>}
      {tab === 'engineering' && <MmsEngineeringPanel project={project} prefix={prefix} onPatch={onPatch} />}
      <details className="mms-section" open={errors.length > 0}>
        <summary data-testid={`${prefix}-validation-toggle`}>{errors.length ? `${errors.length} geometric conflicts` : 'Validation & engineering notices'} · {findings.length}</summary>
        <div className="mms-findings" data-testid={`${prefix}-findings`}>{findings.map((f, i) => <div key={f.id} className={`mms-finding ${f.status}`} data-testid={`${prefix}-finding-${i}`}><b>{f.status === 'error' ? '×' : f.status === 'pass' ? '✓' : '!'}</b><span>{f.message}</span></div>)}</div>
      </details>
    </>}
  </section>;
}