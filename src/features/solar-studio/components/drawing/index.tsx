// ─── Drawing sheet primitives (Phase 22o) ───────────────────────────────────
// The three SLD sheets each hardcoded their own `viewBox="0 0 980 640"`, their
// own border rect, and their own title-block geometry — and `TitleBlock` was
// pinned to that one sheet size while not even being used by the SLD sheet it
// sat next to. Adding an A3 landscape sheet meant copying all of it a fourth
// time.
//
// These are deliberately PURE and hook-free: they take props and emit SVG. That
// keeps them testable without a store, and it is what lets the refactor be
// proved rather than eyeballed — the gate is that the markup is byte-identical
// to the inline version it replaces.
import type { ReactNode } from 'react';

/** Standard sheet sizes, in SVG units (1 unit ≈ 1 mm at A3). */
export const SHEET_SIZES = {
  /** the historical SLD sheet — kept exactly, so existing sheets do not move */
  sld: { w: 980, h: 640 },
  /** A3 landscape, for the printable set */
  a3: { w: 1120, h: 792 },
} as const;

export type SheetSize = keyof typeof SHEET_SIZES;

/**
 * A drawing sheet: the viewBox, the border and the printable surface.
 *
 * The default size and every style value reproduce the three inline sheets
 * exactly — same 6-unit border inset, same 1.4 stroke, same minWidth — so
 * moving a sheet onto this changes nothing about how it renders.
 */
export function Sheet({
  size = 'sld',
  children,
  minWidth = 900,
}: {
  size?: SheetSize;
  children: ReactNode;
  minWidth?: number;
}) {
  const { w, h } = SHEET_SIZES[size];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: '100%', minWidth, background: '#fff', border: '1px solid #ccc' }}
    >
      <rect x={6} y={6} width={w - 12} height={h - 12} fill="none" stroke="#111" strokeWidth={1.4} />
      {children}
    </svg>
  );
}

/**
 * The title block — who, what, when, and on what authority.
 *
 * Was hardcoded at x=30 y=560 w=920 for the 980×640 sheet. It now takes the
 * sheet size and sits itself, so an A3 sheet gets a title block in the right
 * place instead of one floating in the middle of the page.
 */
export function TitleBlock({
  rows,
  size = 'sld',
}: {
  rows: [string, string][];
  size?: SheetSize;
}) {
  const { w, h } = SHEET_SIZES[size];
  const x = 30;
  const width = w - 60;
  const height = 60;
  const y = h - 80;
  const cols = 3;
  // 310 at the SLD sheet width, scaled proportionally for any other size. NOT
  // `width / cols`: the original used 310 against a 920-wide block, which is
  // 306.67 — close enough to look right and wrong enough to shift every value
  // in the third column. The gate below pins the original numbers.
  const colW = 310 * (width / 920);
  return (
    <g fontFamily="monospace" fontSize={8.5}>
      <rect x={x} y={y} width={width} height={height} fill="none" stroke="#111" strokeWidth={1.2} />
      {rows.map(([k, v], i) => (
        <text
          key={k}
          x={x + 14 + (i % cols) * colW}
          y={y + 22 + Math.floor(i / cols) * 24}
        >
          <tspan fontWeight={800}>{k}: </tspan>
          {v}
        </text>
      ))}
    </g>
  );
}

/** A keyed legend. Was an inline literal array on the layout sheet. */
export function Legend({
  items,
  x,
  y,
  title = 'LEGEND',
}: {
  items: { swatch: string; label: string }[];
  x: number;
  y: number;
  title?: string;
}) {
  return (
    <g fontFamily="monospace" fontSize={8.5}>
      <text x={x} y={y} fontWeight={800}>
        {title}
      </text>
      {items.map((it, i) => (
        <g key={it.label}>
          <rect x={x} y={y + 8 + i * 14} width={10} height={8} fill={it.swatch} stroke="#111" strokeWidth={0.6} />
          <text x={x + 16} y={y + 15 + i * 14}>
            {it.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Numbered drawing notes. Where the honesty labels land on a printed sheet. */
export function Notes({
  items,
  x,
  y,
  title = 'NOTES',
  width = 300,
}: {
  items: string[];
  x: number;
  y: number;
  title?: string;
  width?: number;
}) {
  return (
    <g fontFamily="monospace" fontSize={7.5}>
      <text x={x} y={y} fontWeight={800} fontSize={8.5}>
        {title}
      </text>
      {items.map((t, i) => (
        <text key={i} x={x} y={y + 12 + i * 11}>
          {`${i + 1}. ${t}`.slice(0, Math.floor(width / 4))}
        </text>
      ))}
    </g>
  );
}

/**
 * A graphic scale bar.
 *
 * On a drawing that may be printed at any size, a stated ratio ("1:100") is a
 * claim about the paper, not about the file. A bar measures correctly whatever
 * the print scaling does, which is why survey drawings carry one.
 */
export function ScaleBar({
  x,
  y,
  metres,
  unitsPerMetre,
  label,
}: {
  x: number;
  y: number;
  metres: number;
  unitsPerMetre: number;
  label?: string;
}) {
  const len = metres * unitsPerMetre;
  const half = len / 2;
  return (
    <g fontFamily="monospace" fontSize={7.5}>
      <rect x={x} y={y} width={half} height={5} fill="#111" />
      <rect x={x + half} y={y} width={half} height={5} fill="#fff" stroke="#111" strokeWidth={0.6} />
      <text x={x} y={y + 14}>
        0
      </text>
      <text x={x + len - 6} y={y + 14}>
        {label ?? `${metres} m`}
      </text>
    </g>
  );
}

/** Sheet grid references (A,B,C… / 1,2,3…) so a detail can be cited. */
export function GridRefs({ size = 'sld', cols = 6, rows = 4 }: { size?: SheetSize; cols?: number; rows?: number }) {
  const { w, h } = SHEET_SIZES[size];
  const letters = 'ABCDEFGHIJKL'.split('');
  return (
    <g fontFamily="monospace" fontSize={8} fill="#666">
      {Array.from({ length: cols }, (_, i) => (
        <text key={`c${i}`} x={6 + ((i + 0.5) * (w - 12)) / cols} y={18} textAnchor="middle">
          {letters[i]}
        </text>
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <text key={`r${i}`} x={16} y={6 + ((i + 0.5) * (h - 12)) / rows} textAnchor="middle">
          {i + 1}
        </text>
      ))}
    </g>
  );
}
