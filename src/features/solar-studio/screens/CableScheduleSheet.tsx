// ─── Cable schedule: every routed run as a line an installer can buy from ───
// Derived from the routes the editor drew (master plan S7-11): tag, ends,
// conductor, roof metres, drop, slack, metres to buy. Nothing here is typed
// in — move the inverter or drag a corner and the sheet changes with it.
import { Sheet, TitleBlock } from '../components/drawing';
import { useActiveProject } from '../store/store';
import { sizeAcCable } from '../lib/electrical-sizing';
import { dcCableSizesInUse, dcSizeLabel, dcStringCables } from '../lib/electrical/dc-cable';
import { dcdbForInverter, polylineLengthM } from '../lib/routing';
import { resolveRules } from '../data/rules/india';

const COLS = { tag: 40, from: 140, to: 300, size: 430, plan: 610, drop: 670, slack: 725, total: 785 } as const;
const ROW_H = 14;
const MAX_ROWS = 34;

export function CableScheduleSheet() {
  const project = useActiveProject()!;
  const spec = project.components.panel;
  const inv = project.components.inverter;
  const rules = resolveRules().cable;
  const routes = project.cableRoutes ?? [];
  const hasDcdb = (project.electricalBoxes ?? []).some((b) => b.kind === 'dcdb');
  const hasAcdb = (project.electricalBoxes ?? []).some((b) => b.kind === 'acdb');
  // each string's conductor: fuse-rated until routed, then sized for its loop's drop too
  const cableByString = new Map(dcStringCables(project).map((c) => [c.string.id, c]));
  const dcSizes = spec ? dcCableSizesInUse(project) : [];
  const acKw = inv ? inv.acKw * Math.max(1, project.components.inverterCount) : 0;

  const pairIndex = new Map<string, number>();
  const invNo = (ref: string) => {
    const m = /^inverter\/(\d+)$/.exec(ref);
    return m ? Number(m[1]) + 1 : 1;
  };
  const rows = routes
    .filter((r) => r.kind === 'string_homerun' || r.kind === 'inverter_ac' || r.kind === 'battery_dc')
    .map((r) => {
      const plan = polylineLengthM(r.waypoints);
      const total = (plan + r.verticalDropM) * (1 + r.slackPct);
      if (r.kind === 'string_homerun') {
        const k = pairIndex.get(r.fromRef) ?? 0;
        pairIndex.set(r.fromRef, k + 1);
        const s = project.strings.find((x) => x.id === r.fromRef);
        const sName = s?.name ?? 'String ?';
        const inverter = invNo(r.toRef);
        const cable = cableByString.get(r.fromRef);
        return {
          id: r.id,
          tag: `DC-${sName.replace('String ', 'S')}${k === 0 ? '+' : '−'}`,
          from: `${sName} ${k === 0 ? '+ end' : '− end'}`,
          to: hasDcdb && dcdbForInverter(project, inverter - 1) ? `DCDB of INV ${inverter}` : `INV ${inverter}`,
          size: cable ? `${cable.mm2} sq.mm Cu 1.1 kV${cable.sizing?.governedBy === 'voltage-drop' ? ' (drop)' : ''}` : '—',
          plan,
          drop: r.verticalDropM,
          slack: r.slackPct,
          total,
          manual: !!r.manual,
          ac: false,
          battery: false,
        };
      }
      if (r.kind === 'battery_dc') {
        const n = (project.batteryPlacements ?? []).findIndex((b) => b.id === r.fromRef) + 1;
        return {
          id: r.id,
          tag: `BAT-${n}`,
          from: `Battery ${n}`,
          to: `INV ${invNo(r.toRef)} DC`,
          size: 'per battery OEM (+ and −)',
          plan,
          drop: r.verticalDropM,
          slack: r.slackPct,
          total,
          manual: !!r.manual,
          ac: false,
          battery: true,
        };
      }
      // AC: each inverter's own run is sized on that inverter; the ACDB → meter
      // main carries every inverter and is sized on the total
      const fromAcdb = r.fromRef === 'acdb';
      const kw = inv ? (fromAcdb ? acKw : inv.acKw) : 0;
      const acSize = inv ? sizeAcCable(kw, inv.phases, plan + r.verticalDropM) : null;
      return {
        id: r.id,
        tag: fromAcdb ? 'AC-MAIN' : `AC-INV${invNo(r.fromRef)}`,
        from: fromAcdb ? 'ACDB' : `INV ${invNo(r.fromRef)}`,
        to: r.toRef === 'acdb' ? 'ACDB' : hasAcdb && !fromAcdb ? 'ACDB' : 'Meter',
        size: acSize && inv ? `${inv.phases === 3 ? 4 : 3}-core ${acSize.mm2} sq.mm Cu` : '—',
        plan,
        drop: r.verticalDropM,
        slack: r.slackPct,
        total,
        manual: !!r.manual,
        ac: true,
        battery: false,
      };
    });
  // read in string order, + before −, the AC run last
  const stringNo = (tag: string) => Number(tag.replace(/^DC-S/, '').replace(/[+−]$/, '')) || 0;
  rows.sort(
    (a, b) =>
      Number(a.ac) - Number(b.ac) ||
      Number(a.battery) - Number(b.battery) ||
      stringNo(a.tag) - stringNo(b.tag) ||
      a.tag.localeCompare(b.tag),
  );
  const dcTotal = rows.filter((r) => !r.ac && !r.battery).reduce((a, r) => a + r.total, 0);
  const acRows = rows.filter((r) => r.ac);
  const acTotal = acRows.reduce((a, r) => a + r.total, 0);
  const shown = rows.slice(0, MAX_ROWS);

  return (
    <Sheet>
      <text x={490} y={32} textAnchor="middle" fontSize={15} fontWeight={800} fontFamily="monospace">
        CABLE SCHEDULE · DERIVED FROM THE ROUTED RUNS
      </text>
      <g fontFamily="monospace" fontSize={8.5}>
        <rect x={30} y={52} width={920} height={22 + (shown.length + 3) * ROW_H} fill="none" stroke="#111" strokeWidth={1} />
        <g fontWeight={800}>
          <text x={COLS.tag} y={68}>TAG</text>
          <text x={COLS.from} y={68}>FROM</text>
          <text x={COLS.to} y={68}>TO</text>
          <text x={COLS.size} y={68}>CONDUCTOR</text>
          <text x={COLS.plan} y={68} textAnchor="end">ROOF m</text>
          <text x={COLS.drop} y={68} textAnchor="end">DROP m</text>
          <text x={COLS.slack} y={68} textAnchor="end">SLACK</text>
          <text x={COLS.total} y={68} textAnchor="end">BUY m</text>
        </g>
        <line x1={30} y1={74} x2={950} y2={74} stroke="#111" strokeWidth={0.8} />
        {shown.map((r, i) => {
          const y = 88 + i * ROW_H;
          return (
            <g key={r.id} fill={r.ac ? '#047857' : r.battery ? '#b45309' : '#111'}>
              <text x={COLS.tag} y={y}>{r.tag}{r.manual ? ' *' : ''}</text>
              <text x={COLS.from} y={y}>{r.from}</text>
              <text x={COLS.to} y={y}>{r.to}</text>
              <text x={COLS.size} y={y}>{r.size}</text>
              <text x={COLS.plan} y={y} textAnchor="end">{r.plan.toFixed(1)}</text>
              <text x={COLS.drop} y={y} textAnchor="end">{r.drop.toFixed(1)}</text>
              <text x={COLS.slack} y={y} textAnchor="end">{Math.round(r.slack * 100)}%</text>
              <text x={COLS.total} y={y} textAnchor="end" fontWeight={700}>{Math.ceil(r.total)}</text>
            </g>
          );
        })}
        {rows.length > MAX_ROWS && (
          <text x={COLS.tag} y={88 + shown.length * ROW_H} fill="#666">
            … {rows.length - MAX_ROWS} more runs (export the BOM for the full list)
          </text>
        )}
        <line x1={30} y1={88 + (shown.length + 0.5) * ROW_H} x2={950} y2={88 + (shown.length + 0.5) * ROW_H} stroke="#111" strokeWidth={0.8} />
        <g fontWeight={800}>
          <text x={COLS.from} y={88 + (shown.length + 1.5) * ROW_H}>DC conductor to buy (all home runs)</text>
          <text x={COLS.total} y={88 + (shown.length + 1.5) * ROW_H} textAnchor="end">{Math.ceil(dcTotal)} m</text>
          <text x={COLS.from} y={88 + (shown.length + 2.5) * ROW_H} fill="#047857">
            {acRows.length ? 'AC conductor to buy' : 'AC run — not routed yet: place the meter in Step 6'}
          </text>
          <text x={COLS.total} y={88 + (shown.length + 2.5) * ROW_H} textAnchor="end" fill="#047857">
            {acRows.length ? `${Math.ceil(acTotal)} m` : '—'}
          </text>
        </g>
      </g>
      {rows.length === 0 && (
        <text x={490} y={320} textAnchor="middle" fontSize={12} fill="#777" fontFamily="monospace">
          No routed runs yet — mount the inverter in Step 6 (and place the meter for the AC run)
        </text>
      )}
      <g fontSize={8.5} fill="#555" fontFamily="monospace">
        <text x={40} y={498}>
          DERIVED — each run is its routed path on the roof plus the wall drop, with {Math.round(rules.slackPct * 100)}%
          installation slack. DC sized for the string fuse and a ≤ {rules.maxDcDropPct}% drop at STC; (drop) = the drop governed. * = hand-routed in the 3D model.
        </text>
        <text x={40} y={511}>
          The BOM&apos;s DC cable line sums these same runs — the two cannot disagree.
        </text>
      </g>
      <TitleBlock
        rows={[
          ['PROJECT', project.info.name],
          ['CLIENT', project.info.customerName || '—'],
          ['DRAWING', 'CABLE SCHEDULE'],
          ['RUNS', `${rows.length} (${rows.filter((r) => r.manual).length} hand-routed)`],
          ['DC SIZE', dcSizes.length ? `${dcSizeLabel(dcSizes)} sq.mm Cu` : '—'],
          ['SHEET', 'CS-01 · A2'],
        ]}
      />
    </Sheet>
  );
}
