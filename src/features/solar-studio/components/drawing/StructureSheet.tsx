// ─── Structure sheet: isometric + side elevation (Phase 22o part 3) ─────────
// The structure has been modelled since 22a, foundations since 22k, and priced
// throughout — but nothing printed it. This is the sheet an engineer marks up
// and a fabricator works from.
//
// Everything comes from `projectStructures`, so the drawing, the 3D scene and
// the BOM are one model (§A0). Nothing here invents a dimension.
import { Sheet, TitleBlock, Notes, ScaleBar, GridRefs, SHEET_SIZES } from './index';
import {
  elevationProject,
  fitToBox,
  isoProject,
  projectMembers,
  type Pt2,
} from '../../lib/drawing-project';
import { projectStructures, STRUCTURE_DISCLAIMER } from '../../lib/structure';
import { foundationAssembly, ruleFor } from '../../lib/foundation';
import type { Project } from '../../types';

/** Line weight by member class — a leg reads heavier than a purlin, as drawn. */
const WEIGHT: Record<string, number> = {
  front_leg: 1.6,
  back_leg: 1.6,
  rafter: 1.2,
  purlin: 0.9,
  brace: 0.7,
  rail: 1.1,
};

export function StructureSheet({ project }: { project: Project }) {
  const structures = projectStructures(project);
  const { w, h } = SHEET_SIZES.a3;

  if (structures.length === 0) {
    return (
      <Sheet size="a3">
        <text x={w / 2} y={h / 2} textAnchor="middle" fontFamily="monospace" fontSize={13}>
          No mounting structure is modelled for this design.
        </text>
        <text x={w / 2} y={h / 2 + 20} textAnchor="middle" fontFamily="monospace" fontSize={9} fill="#555">
          Flush and pitched-roof arrays carry per-panel hardware rather than a member model.
        </text>
      </Sheet>
    );
  }

  const members = structures.flatMap((s) => s.members);
  const anchors = structures.flatMap((s) =>
    s.nodes.filter((n) => n.kind === 'roof_anchor').map((n) => ({ n, s })),
  );

  // ── ISOMETRIC (main view) ────────────────────────────────────────────────
  const isoBox = { x: 40, y: 60, w: w - 380, h: h - 200 };
  const isoSegs = projectMembers(members, isoProject);
  const isoFit = fitToBox(
    isoSegs.flatMap((s) => [s.a, s.b]),
    isoBox,
  );
  const IX = (p: Pt2) => isoFit.toX(p.x);
  const IY = (p: Pt2) => isoFit.toY(p.y);

  // ── SIDE ELEVATION (detail), with the foundation in section ──────────────
  // One representative table: an elevation of every table overlaid is noise.
  const first = structures[0];
  const elBox = { x: w - 320, y: 90, w: 270, h: 210 };
  // ONE frame, not the whole table. An elevation keeps the depth axis, so
  // drawing every member overlays each row side by side — four frames under a
  // heading that says "TYPICAL SECTION", which is not what that heading means.
  // A section is one leg pair and the rafter they carry.
  const rafter0 = first.members.find((m) => m.kind === 'rafter');
  const near = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.01;
  const frame = rafter0
    ? first.members.filter(
        (m) =>
          m === rafter0 ||
          ((m.kind === 'front_leg' || m.kind === 'back_leg') &&
            (near(m.b, rafter0.a) || near(m.b, rafter0.b))),
      )
    : first.members.slice(0, 3);
  const elSegs = projectMembers(frame, elevationProject);
  const rule = ruleFor(first.foundation, first.foundationShape);
  const asm = foundationAssembly(first.foundation, first.foundationShape);
  const deckZ = Math.min(...first.nodes.filter((n) => n.kind === 'roof_anchor').map((n) => n.position.z));
  // include the foundation body in the fit, or it prints clipped
  const elPts = [
    ...elSegs.flatMap((s) => [s.a, s.b]),
    ...asm.parts.map((p) => elevationProject({ x: 0, y: 0, z: deckZ + p.offset.y + p.size.y / 2 })),
    elevationProject({ x: 0, y: 0, z: deckZ }),
  ];
  const elFit = fitToBox(elPts, elBox, 16);
  const EX = (p: Pt2) => elFit.toX(p.x);
  const EY = (p: Pt2) => elFit.toY(p.y);

  const rows: [string, string][] = [
    ['PROJECT', project.info.name || '—'],
    ['CLIENT', project.info.customerName || '—'],
    ['SITE', project.info.state || '—'],
    ['TABLES', String(structures.length)],
    ['FOUNDATION', `${first.foundation}${first.foundation === 'concrete' ? ` · ${first.foundationShape}` : ''}`],
    ['DRAWING', 'MOUNTING STRUCTURE — ISOMETRIC & SECTION'],
  ];

  return (
    <Sheet size="a3">
      <GridRefs size="a3" />
      <text x={w / 2} y={40} textAnchor="middle" fontSize={15} fontWeight={800} fontFamily="monospace">
        MOUNTING STRUCTURE · ISOMETRIC & TYPICAL SECTION
      </text>

      {/* ── isometric ─────────────────────────────────────────────────── */}
      <text x={isoBox.x} y={isoBox.y - 8} fontSize={9} fontWeight={800} fontFamily="monospace">
        ISOMETRIC — ALL TABLES
      </text>
      {isoSegs.map((s, i) => (
        <line
          key={i}
          x1={IX(s.a)}
          y1={IY(s.a)}
          x2={IX(s.b)}
          y2={IY(s.b)}
          stroke="#111"
          strokeWidth={WEIGHT[s.kind] ?? 1}
          strokeLinecap="round"
        />
      ))}
      {/* footings, at the leg bases */}
      {anchors.map(({ n }, i) => {
        const p = isoProject(n.position);
        return <circle key={i} cx={IX(p)} cy={IY(p)} r={2.2} fill="#111" />;
      })}
      <ScaleBar
        x={isoBox.x}
        y={isoBox.y + isoBox.h + 14}
        metres={5}
        unitsPerMetre={isoFit.unitsPerMetre}
      />

      {/* ── side elevation with the foundation in SECTION ──────────────── */}
      <text x={elBox.x} y={elBox.y - 8} fontSize={9} fontWeight={800} fontFamily="monospace">
        TYPICAL SECTION — {first.foundation.toUpperCase()}
      </text>
      <rect
        x={elBox.x}
        y={elBox.y}
        width={elBox.w}
        height={elBox.h}
        fill="none"
        stroke="#999"
        strokeWidth={0.6}
        strokeDasharray="3 2"
      />
      {/* the deck line — everything below it is inside the roof */}
      <line
        x1={elBox.x + 8}
        y1={EY(elevationProject({ x: 0, y: 0, z: deckZ }))}
        x2={elBox.x + elBox.w - 8}
        y2={EY(elevationProject({ x: 0, y: 0, z: deckZ }))}
        stroke="#111"
        strokeWidth={1.2}
      />
      {elSegs.map((s, i) => (
        <line
          key={i}
          x1={EX(s.a)}
          y1={EY(s.a)}
          x2={EX(s.b)}
          y2={EY(s.b)}
          stroke="#111"
          strokeWidth={WEIGHT[s.kind] ?? 1}
        />
      ))}
      {/* foundation body, hatched — this is the "in section" part */}
      {/* One body under EACH leg of the frame, at that leg's own depth — a
          foundation floating at some arbitrary y is not a section of anything.
          This is the same assembly the 3D scene draws and the BOM counts. */}
      {frame
        .filter((m) => m.kind === 'front_leg' || m.kind === 'back_leg')
        .flatMap((leg) =>
          asm.parts
            .filter((p) => p.bucket === 'pedestal' || p.bucket === 'ballast' || p.bucket === 'pile')
            .map((p, i) => {
              const cz = deckZ + p.offset.y;
              const top = EY(elevationProject({ x: 0, y: leg.a.y, z: cz + p.size.y / 2 }));
              const bot = EY(elevationProject({ x: 0, y: leg.a.y, z: cz - p.size.y / 2 }));
              const halfW = (p.size.z / 2) * elFit.unitsPerMetre;
              const cx = EX(elevationProject({ x: 0, y: leg.a.y, z: 0 }));
              return (
                <rect
                  key={`${leg.id}-${i}`}
                  x={cx - halfW}
                  y={top}
                  width={halfW * 2}
                  height={Math.max(1, bot - top)}
                  fill="#ddd"
                  stroke="#111"
                  strokeWidth={0.9}
                />
              );
            }),
        )}
      <text x={elBox.x + 8} y={elBox.y + elBox.h - 6} fontSize={7.5} fontFamily="monospace" fill="#333">
        {rule.shape === 'circular'
          ? `⌀${rule.d} × ${rule.heightMm} mm — ASSUMED`
          : `${rule.l} × ${rule.w ?? rule.l} × ${rule.heightMm} mm — ASSUMED`}
      </text>

      {/* ── notes: where the honesty labels land on paper ──────────────── */}
      <Notes
        x={w - 320}
        y={elBox.y + elBox.h + 40}
        width={280}
        items={[
          STRUCTURE_DISCLAIMER,
          'Foundation size is NOMINAL, not calculated — uplift and overturning are not analysed by this software. Engineer to confirm.',
          'Roof capacity is NOT checked. Confirm the slab or purlins can carry the added dead load.',
          'Dimensions in millimetres unless noted. Do not scale from the screen — use the bar.',
        ]}
      />

      <TitleBlock size="a3" rows={rows} />
    </Sheet>
  );
}
