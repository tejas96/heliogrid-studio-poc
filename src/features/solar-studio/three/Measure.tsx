// ─── Measure on the model: distance, angle, area, elevation ────────────────
// A measurement is taken on REAL geometry: the tool casts its own ray at the
// scene (roof, modules, steel, the Google surround) and lands on whatever the
// pointer is over. While a measure mode is on, the fiber's object events are
// switched off so a click measures instead of picking; the camera still
// orbits because camera-controls listens to the canvas on its own.
//
// Results stay as dimension annotations until "Clear" — view state only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';

export type MeasureMode = 'off' | 'distance' | 'angle' | 'area' | 'elevation';
type Vec3 = [number, number, number];

interface Annotation {
  id: number;
  mode: Exclude<MeasureMode, 'off'>;
  points: Vec3[];
  /** where the label sits */
  at: Vec3;
  text: string[];
}

const NEEDED: Record<Exclude<MeasureMode, 'off'>, number> = { distance: 2, angle: 3, area: 0, elevation: 1 };
const COLOR = '#ffc766';

function fmt(m: number, d = 2): string {
  return `${m.toFixed(d)} m`;
}

/** Scene point → plan metres for the deck lookup (scene z is −north). */
function planOf(p: Vec3): { x: number; y: number } {
  return { x: p[0], y: -p[2] };
}

export function Measure({
  mode,
  clearSignal,
  deckHeightAt,
  onCount,
}: {
  mode: MeasureMode;
  /** bump to clear every annotation */
  clearSignal: number;
  /** height of the roof deck under a plan point, or null when over open ground */
  deckHeightAt: (p: { x: number; y: number }) => number | null;
  onCount?: (n: number) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const setEvents = useThree((s) => s.setEvents);
  const [draft, setDraft] = useState<Vec3[]>([]);
  const [hover, setHover] = useState<Vec3 | null>(null);
  const [done, setDone] = useState<Annotation[]>([]);
  const nextId = useRef(1);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // clicks measure, not pick, while a mode is on
  useEffect(() => {
    setEvents({ enabled: mode === 'off' });
    return () => setEvents({ enabled: true });
  }, [mode, setEvents]);
  useEffect(() => {
    setDraft([]);
    setHover(null);
  }, [mode]);
  useEffect(() => {
    if (clearSignal > 0) {
      setDone([]);
      setDraft([]);
    }
  }, [clearSignal]);
  useEffect(() => onCount?.(done.length), [done.length, onCount]);

  // our own ray: everything visible with geometry, except helpers we draw
  const raycaster = useMemo(() => {
    const r = new THREE.Raycaster();
    r.params.Line = { threshold: 0 };
    r.params.Points = { threshold: 0 };
    return r;
  }, []);
  const hit = (ev: PointerEvent): Vec3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(scene.children, true).filter((h) => {
      const o = h.object;
      if (!o.visible || o.userData?.noMeasure) return false;
      if (!(o as THREE.Mesh).isMesh) return false; // lines, sprites, helpers
      let p: THREE.Object3D | null = o;
      while (p) {
        if (p.userData?.noMeasure) return false;
        p = p.parent;
      }
      return true;
    });
    const h = hits[0];
    return h ? [h.point.x, h.point.y, h.point.z] : null;
  };

  useEffect(() => {
    const el = gl.domElement;
    let downAt: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => {
      if (modeRef.current === 'off' || ev.button !== 0) return;
      downAt = { x: ev.clientX, y: ev.clientY };
    };
    const onMove = (ev: PointerEvent) => {
      if (modeRef.current === 'off') return;
      setHover(hit(ev));
    };
    const onUp = (ev: PointerEvent) => {
      const m = modeRef.current;
      if (m === 'off' || !downAt) return;
      const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
      downAt = null;
      if (moved > 4) return; // an orbit, not a click
      const p = hit(ev);
      if (!p) return;
      const pts = [...draftRef.current, p];
      const need = NEEDED[m];
      if (m === 'area') {
        // close the polygon by clicking near the first point
        if (pts.length >= 4) {
          const a = pts[0];
          if (Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]) < 0.6) {
            finish(m, pts.slice(0, -1));
            setDraft([]);
            return;
          }
        }
        setDraft(pts);
        return;
      }
      if (pts.length >= need) {
        finish(m, pts);
        setDraft([]);
      } else setDraft(pts);
    };
    const onDbl = () => {
      if (modeRef.current === 'area' && draftRef.current.length >= 3) {
        finish('area', draftRef.current);
        setDraft([]);
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('dblclick', onDbl);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('dblclick', onDbl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, scene]);

  function finish(m: Exclude<MeasureMode, 'off'>, pts: Vec3[]) {
    const a: Annotation = { id: nextId.current++, mode: m, points: pts, at: pts[pts.length - 1], text: [] };
    if (m === 'distance') {
      const [p, q] = pts;
      const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      const flat = Math.hypot(q[0] - p[0], q[2] - p[2]);
      const rise = q[1] - p[1];
      a.at = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      a.text = [fmt(d), `${fmt(flat)} on plan · ${rise >= 0 ? '↑' : '↓'} ${fmt(Math.abs(rise))}`];
    } else if (m === 'angle') {
      const [p, v, q] = pts;
      const u1 = new THREE.Vector3(p[0] - v[0], p[1] - v[1], p[2] - v[2]);
      const u2 = new THREE.Vector3(q[0] - v[0], q[1] - v[1], q[2] - v[2]);
      const deg = (u1.angleTo(u2) * 180) / Math.PI;
      a.at = v;
      a.text = [`${deg.toFixed(1)}°`, `at the middle point · arms ${fmt(u1.length(), 1)} and ${fmt(u2.length(), 1)}`];
    } else if (m === 'area') {
      // true area of the 3D polygon (fan about its centroid) + its plan area
      const c = pts.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length) as Vec3;
      let area = 0;
      let plan = 0;
      let per = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        const e1 = new THREE.Vector3(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
        const e2 = new THREE.Vector3(q[0] - c[0], q[1] - c[1], q[2] - c[2]);
        area += e1.cross(e2).length() / 2;
        plan += (p[0] * -q[2] - q[0] * -p[2]) / 2;
        per += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      }
      a.at = c;
      a.text = [`${area.toFixed(1)} m²`, `${Math.abs(plan).toFixed(1)} m² on plan · ${fmt(per, 1)} around`];
    } else {
      const [p] = pts;
      const deck = deckHeightAt(planOf(p));
      a.at = p;
      a.text = [
        `${fmt(p[1])} above ground`,
        deck === null ? 'over open ground' : `${fmt(p[1] - deck)} above the roof deck (${fmt(deck, 1)})`,
      ];
    }
    setDone((d) => [...d, a]);
  }

  const live: Vec3[] = hover && mode !== 'off' && mode !== 'elevation' ? [...draft, hover] : draft;

  return (
    <group userData={{ noMeasure: true }}>
      {/* the measurement in progress */}
      {live.length >= 2 && (
        <Line points={mode === 'area' && live.length >= 3 ? [...live, live[0]] : live} color={COLOR} lineWidth={2} dashed dashSize={0.3} gapSize={0.15} />
      )}
      {draft.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color={COLOR} toneMapped={false} />
        </mesh>
      ))}
      {hover && mode !== 'off' && (
        <mesh position={hover}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      )}
      {mode !== 'off' && hover && (
        <Html position={hover} center style={{ pointerEvents: 'none' }}>
          <div
            style={{
              transform: 'translate(14px, 14px)',
              background: 'rgba(20,24,30,0.85)',
              color: '#f2f4f6',
              fontSize: 11,
              padding: '2px 7px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              fontFamily: 'var(--mono)',
            }}
          >
            {mode === 'distance' && draft.length === 1 && `${fmt(Math.hypot(hover[0] - draft[0][0], hover[1] - draft[0][1], hover[2] - draft[0][2]))}`}
            {mode === 'distance' && draft.length === 0 && 'click the first point'}
            {mode === 'angle' && `${draft.length === 0 ? 'first arm' : draft.length === 1 ? 'the corner' : 'second arm'}`}
            {mode === 'area' && (draft.length < 3 ? `corner ${draft.length + 1}` : 'next corner · click the first one or double-click to close')}
            {mode === 'elevation' && `${fmt(hover[1])} above ground`}
          </div>
        </Html>
      )}
      {/* dimension annotations */}
      {done.map((a) => (
        <group key={a.id}>
          {a.points.length >= 2 && (
            <Line points={a.mode === 'area' ? [...a.points, a.points[0]] : a.points} color={COLOR} lineWidth={2.5} />
          )}
          {a.points.map((p, i) => (
            <mesh key={i} position={p}>
              <sphereGeometry args={[0.1, 10, 10]} />
              <meshBasicMaterial color={COLOR} toneMapped={false} />
            </mesh>
          ))}
          <Html position={a.at} center style={{ pointerEvents: 'none' }}>
            <div
              style={{
                transform: 'translate(0, -22px)',
                background: 'rgba(20,24,30,0.9)',
                color: '#ffe0a3',
                fontSize: 11,
                lineHeight: 1.25,
                padding: '3px 8px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
                fontFamily: 'var(--mono)',
                border: '1px solid rgba(255,199,102,0.5)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 12 }}>{a.text[0]}</div>
              {a.text[1] && <div style={{ opacity: 0.85 }}>{a.text[1]}</div>}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
