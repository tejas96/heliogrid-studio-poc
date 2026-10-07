import type { Project } from '../../types';
import type { MmsEngineeringInputs } from '../../lib/mms/types';
import { deriveStructures } from '../../lib/derive/structures';
import { mmsEngineering } from '../../lib/mms/engineering';
import { validateMms } from '../../lib/mms/validate';
import { MmsField, MmsSection } from './MmsField';

export function MmsEngineeringPanel({ project, prefix, onEngineering }: { project: Project; prefix: string; onEngineering: (inputs: MmsEngineeringInputs) => void }) {
  const inputs = project.mmsEngineering ?? {};
  const update = (p: Partial<MmsEngineeringInputs>) => onEngineering({ ...inputs, ...p });
  const structures = deriveStructures(project);
  const report = mmsEngineering(project, structures);
  const fields: [keyof MmsEngineeringInputs, string, number, number][] = [
    ['basicWindSpeedMs', 'Basic wind speed (m/s)', 20, 100], ['riskFactorK1', 'Risk factor k₁', .1, 3], ['terrainHeightFactorK2', 'Terrain / height factor k₂', .1, 3], ['topographyFactorK3', 'Topography factor k₃', .1, 3], ['importanceFactorK4', 'Importance factor k₄', .1, 3], ['netPressureCoefficient', 'Net pressure coefficient', -5, 5], ['roofCapacityKpa', 'Reported roof capacity (kPa)', .01, 100], ['liveLoadKpa', 'Live load (kPa)', 0, 100], ['snowLoadKpa', 'Snow load (kPa)', 0, 100],
  ];
  const exportModel = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 'heliogrid-mms/1', projectId: project.id, roofs: project.roofs, panels: project.panels, segments: project.segments, walkways: project.walkways, structures, validation: validateMms(project, structures), engineering: report }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'heliogrid-mms-engineering.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div data-testid={`${prefix}-engineering`}>
    <MmsSection id={`${prefix}-wind`} title="Wind & engineering inputs">
      <div className="mms-note" data-testid={`${prefix}-site-data`}>{project.location?.address || 'Site location not supplied'} · Building height {Math.max(0, ...project.roofs.map(r => r.heightM)).toFixed(2)} m · IS 875 Part 3</div>
      <label className="mms-field">Terrain category<select aria-label="Terrain category" data-testid={`${prefix}-terrain`} value={inputs.terrainCategory ?? ''} onChange={e => update({ terrainCategory: e.target.value ? Number(e.target.value) as 1 | 2 | 3 | 4 : undefined })}><option value="">Not supplied</option>{[1, 2, 3, 4].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
      {fields.map(([key, label, min, max]) => <MmsField key={key} id={`${prefix}-${key}`} label={label} min={min} max={max} value={inputs[key] as number | undefined} onChange={v => update({ [key]: v })} />)}
      <label className="mms-field">Seismic zone<select data-testid={`${prefix}-seismic-zone`} aria-label="Seismic zone" value={inputs.seismicZone ?? ''} onChange={e => update({ seismicZone: (e.target.value || undefined) as MmsEngineeringInputs['seismicZone'] })}><option value="">Not supplied</option>{['II', 'III', 'IV', 'V'].map(z => <option key={z}>{z}</option>)}</select></label>
      <label className="mms-field">Engineer’s assumptions<textarea data-testid={`${prefix}-engineering-notes`} aria-label="Engineering assumptions" value={inputs.notes ?? ''} onChange={e => update({ notes: e.target.value })} /></label>
    </MmsSection>
    <div className="mms-note" data-testid={`${prefix}-wind-pressure`}>{report.referencePressureKpa == null ? 'Wind pressure: Not calculated — wind speed and k₁–k₄ required.' : `Reference pressure 0.6 Vz² = ${report.referencePressureKpa.toFixed(3)} kPa. Not net roof-zone pressure or design uplift.`}</div>
    {report.roofs.filter(r => r.supportCount > 0).map(r => <dl key={r.roofId} className="mms-metrics" data-testid={`${prefix}-roof-load-${r.roofId}`}><dt>{r.name} · derived mass</dt><dd>{r.knownMassKg.toFixed(1)} kg</dd><dt>Members / foundations</dt><dd>{r.memberKg.toFixed(1)} / {r.foundationKg.toFixed(1)} kg</dd><dt>Modules</dt><dd>{r.moduleKg == null ? 'Mass unavailable' : `${r.moduleKg.toFixed(1)} kg`}</dd><dt>Roof-area average · estimate</dt><dd>{r.averageLoadKpa?.toFixed(3) ?? '—'} kPa</dd></dl>)}
    <MmsSection id={`${prefix}-checks`} title="Structural checks · Not calculated">
      {report.checks.map(c => <div className="mms-check" key={c.key} data-testid={`${prefix}-check-${c.key}`}><strong>{c.label}</strong><span>Not calculated · {c.standard}</span><small>{c.reason}</small></div>)}
    </MmsSection>
    <p className="mms-note" data-testid={`${prefix}-engineering-disclaimer`}>{report.disclaimer}</p>
    <button className="btn" data-testid={`${prefix}-export-model`} onClick={exportModel}>Export engineering model · JSON</button>
  </div>;
}