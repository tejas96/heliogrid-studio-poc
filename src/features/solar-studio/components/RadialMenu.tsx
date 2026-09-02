// ─── Halo: the radial control menu ──────────────────────────────────────────
// The 3D scene used to carry FOUR vertical tool rails, one per corner. On a
// phone they ate the canvas from both sides and the model had to be zoomed
// out to be seen past them. A rail also grows downwards without limit, so a
// short screen simply clipped its last buttons.
//
// Halo is one trigger. Opening it blooms an INNER ring of groups and an OUTER
// arc holding the chosen group's tools. Both fans open UP AND RIGHT from a
// trigger parked in the bottom-left thumb zone, so the whole control surface
// lives inside roughly a 210 × 300 px box that never wraps off a small screen
// however many tools a group holds — a crowded group tightens its arc instead
// of growing past the edge.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface RadialItem {
  id: string;
  icon: ReactNode;
  /** the word under the icon — keep it to one short token */
  label: string;
  /** the longer explanation, shown as the usual editor tooltip */
  tip?: string;
  /** the tool is currently ON (a toggle that is engaged, a mode that is live) */
  active?: boolean;
  /** an engaged tool that deserves the brand colour rather than plain white */
  accent?: boolean;
  disabled?: boolean;
  /**
   * A one-shot action (open a sheet, fly the camera, copy a link) — the menu
   * closes behind it. Toggles and modes leave it open, because they are
   * normally set two or three at a time.
   */
  oneShot?: boolean;
  onClick: () => void;
}

export interface RadialGroup {
  id: string;
  label: string;
  icon: ReactNode;
  items: RadialItem[];
}

/**
 * Where the fans live, in degrees measured anticlockwise from due east. The
 * menu is parked against the LEFT EDGE, half way down, and both rings sweep
 * the right-hand half circle: a corner would only give a 90° quadrant, and
 * seven tools need about 130° of arc before their circles start to touch.
 */
const ARC_START = -68;
const ARC_END = 68;
/** the group ring */
const R_INNER = 88;
/** the tool arc */
const R_OUTER = 178;
/** the widest a tool may sit from its neighbour before the arc tightens */
const STEP_MAX = 24;

/** Place `n` things evenly across [from, to]; one thing sits in the middle. */
function spread(n: number, from: number, to: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(from + to) / 2];
  const step = (to - from) / (n - 1);
  return Array.from({ length: n }, (_, i) => from + i * step);
}

/**
 * Where the group hubs sit. ARC_END is the top of the sweep, so the list is
 * laid out end-first and reads top to bottom like every other menu here.
 */
export function hubArcAngles(n: number): number[] {
  return spread(n, ARC_END, ARC_START);
}

/**
 * Where a group's tools sit. The fan is centred on the same sweep the hubs
 * use, so it can never leave the screen however long the group is: a short
 * group keeps a comfortable step and occupies the middle, a long one tightens
 * its step until it fills the sweep. Getting this wrong is what put the first
 * draft's buttons off the left edge.
 */
export function toolArcAngles(n: number): number[] {
  if (n <= 0) return [];
  const step = n > 1 ? Math.min(STEP_MAX, (ARC_END - ARC_START) / (n - 1)) : 0;
  const span = step * (n - 1);
  const mid = (ARC_START + ARC_END) / 2;
  return spread(n, mid + span / 2, mid - span / 2);
}

/** The sweep both rings live in, for anything that needs to check it. */
export const ARC = { start: ARC_START, end: ARC_END } as const;

/** Degrees → the offset from the menu's centre, in px (screen y grows down). */
function place(angleDeg: number, radius: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(a) * radius, y: -Math.sin(a) * radius };
}

export function RadialMenu({
  groups,
  ariaLabel,
  style,
}: {
  groups: RadialGroup[];
  ariaLabel: string;
  /** where the trigger sits inside its positioned parent */
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  // The group last worked in re-opens with the menu: reaching a tool you just
  // used is then one tap, not two. Held by id so a group appearing or
  // disappearing (heatmap hides three of them) cannot leave a dangling index.
  const [groupId, setGroupId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // memoised: it is an effect dependency, and a fresh array every render would
  // re-run that effect forever
  const live = useMemo(() => groups.filter((g) => g.items.length > 0), [groups]);
  const current = live.find((g) => g.id === groupId) ?? live[0] ?? null;

  // A group can vanish under the menu — the heatmap hides all but Scene. Fall
  // back rather than showing an empty arc.
  useEffect(() => {
    if (groupId && !live.some((g) => g.id === groupId)) setGroupId(null);
  }, [groupId, live]);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes, and a click anywhere off the menu closes it — a radial menu
  // that stays open over the model is the rails' problem all over again.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    // capture, so Escape closes the menu before the scene reads it for its own
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open, close]);

  const hubAngles = useMemo(() => hubArcAngles(live.length), [live.length]);
  const toolAngles = useMemo(() => toolArcAngles(current?.items.length ?? 0), [current]);

  const total = live.length + (current?.items.length ?? 0);

  return (
    <div
      ref={rootRef}
      className={`halo ${open ? 'open' : ''}`}
      style={style}
      // the glow reaches past the buttons; only the buttons should take clicks
      onPointerDown={(e) => e.stopPropagation()}
    >
      {open && <div className="halo-glow" aria-hidden />}

      <div className="halo-ring" role="menu" aria-label={ariaLabel} aria-hidden={!open}>
        {live.map((g, i) => {
          const at = place(hubAngles[i], R_INNER);
          const on = current?.id === g.id;
          return (
            <button
              key={g.id}
              role="menuitem"
              className={`halo-hub ${on ? 'on' : ''}`}
              style={{ '--x': `${at.x}px`, '--y': `${at.y}px`, '--i': i } as React.CSSProperties}
              tabIndex={open ? 0 : -1}
              aria-label={`${g.label} tools`}
              aria-expanded={on}
              onClick={() => setGroupId(g.id)}
            >
              <span className="halo-icon">{g.icon}</span>
              <span className="halo-label">{g.label}</span>
            </button>
          );
        })}

        {current?.items.map((it, i) => {
          const at = place(toolAngles[i], R_OUTER);
          return (
            <button
              key={`${current.id}:${it.id}`}
              role="menuitem"
              className={`halo-item ${it.active ? (it.accent ? 'accent' : 'on') : ''}`}
              style={
                { '--x': `${at.x}px`, '--y': `${at.y}px`, '--i': live.length + i } as React.CSSProperties
              }
              tabIndex={open ? 0 : -1}
              disabled={it.disabled}
              aria-label={it.tip ?? it.label}
              aria-pressed={it.active}
              data-tip={it.tip}
              onClick={() => {
                it.onClick();
                if (it.oneShot) close();
              }}
            >
              <span className="halo-icon">{it.icon}</span>
              <span className="halo-label">{it.label}</span>
            </button>
          );
        })}
      </div>

      <button
        className="halo-trigger"
        aria-label={open ? `Close ${ariaLabel}` : ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        // no tooltip while open — it would land on top of the ring it opened
        data-tip={open ? undefined : ariaLabel}
        onClick={() => setOpen((v) => !v)}
        style={{ '--n': total } as React.CSSProperties}
      >
        <span className="halo-trigger-mark" aria-hidden />
      </button>
    </div>
  );
}
