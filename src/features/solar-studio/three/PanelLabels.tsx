// ─── The sun figure, written on the modules themselves ──────────────────────
// Reading one module at a time answers "how is THIS one?"; it never answers
// "which ones are bad?". This layer writes each module's access percentage on
// the module, so a bad row is visible without a single click.
//
// It is deliberately NOT one <Html> per module. drei's Html mounts a wrapper,
// a transform group and a resize observer EACH, which a 200-module C&I roof
// cannot afford. Instead the whole layer is one plain DOM node outside the
// canvas, holding one span per module, and a single useFrame projects the
// positions and writes `transform` straight onto those spans. React never
// re-renders for a camera move.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { accessHex } from '../lib/shade-ramp';

export interface LabelItem {
  id: string;
  position: [number, number, number];
  access: number;
  /** half the module's short side — the label rides just above the glass */
  lift: number;
  /** the module's width in metres, for the apparent-size cull */
  w: number;
}

/**
 * A label is dropped once its module is narrower than this on screen. Culling
 * by DISTANCE was the first attempt and it was wrong: this site is a 75 m
 * tower, so the default isometric view sits ~150 m out and every figure
 * vanished — the toggle looked broken. Apparent size is the honest rule, and
 * it scales itself: back off far enough that you could not read the number and
 * it goes, zoom in and it returns, on a bungalow and on a 300 m shed alike.
 */
const MIN_MODULE_PX = 22;
/** Projecting every module every frame is waste; the eye cannot tell. */
const EVERY_N_FRAMES = 2;

export function PanelLabels({
  layer,
  items,
  enabled,
  onAnyVisible,
}: {
  /** the plain DOM node Scene3D keeps for this, sitting over the canvas */
  layer: React.RefObject<HTMLDivElement | null>;
  items: LabelItem[];
  enabled: boolean;
  /**
   * Whether ANY figure is currently drawn. Backing off far enough that no
   * module could carry a readable number is the correct behaviour, but a
   * toggle that quietly shows nothing reads as broken — so the scene says
   * "zoom in" instead of leaving the user to guess. Fires only on a change.
   */
  onAnyVisible?: (any: boolean) => void;
}) {
  const { camera, size } = useThree();
  const nodes = useRef<HTMLSpanElement[]>([]);
  const tick = useRef(0);

  // Build the spans once per item list. Rebuilding on every camera move is what
  // would make this expensive, so nothing here runs during a drag.
  useEffect(() => {
    const host = layer.current;
    if (!host) return;
    host.textContent = '';
    nodes.current = [];
    if (!enabled) return;
    for (const it of items) {
      const s = document.createElement('span');
      s.className = 'panel-label';
      s.textContent = `${Math.round(it.access * 100)}`;
      s.style.color = accessHex(it.access);
      s.style.visibility = 'hidden';
      host.appendChild(s);
      nodes.current.push(s);
    }
    return () => {
      host.textContent = '';
      nodes.current = [];
    };
  }, [layer, items, enabled]);

  const v = useRef(new THREE.Vector3()).current;
  const anyShown = useRef<boolean | null>(null);

  // leaving the mode must clear the hint, or it outlives what it described
  useEffect(() => {
    if (!enabled) {
      anyShown.current = null;
      onAnyVisible?.(true);
    }
  }, [enabled, onAnyVisible]);

  useFrame(() => {
    if (!enabled || nodes.current.length === 0) return;
    tick.current = (tick.current + 1) % EVERY_N_FRAMES;
    if (tick.current !== 0) return;
    const half = { w: size.width / 2, h: size.height / 2 };
    // pixels per metre at one metre, for this camera — the apparent-size cull
    // divides by the distance to get it at the module
    const fovRad = ((camera as THREE.PerspectiveCamera).fov ?? 40) * (Math.PI / 360);
    const pxPerMetreAt1m = half.h / Math.tan(fovRad);
    let shown = 0;
    for (let i = 0; i < items.length; i++) {
      const node = nodes.current[i];
      if (!node) continue;
      const it = items[i];
      v.set(it.position[0], it.position[1] + it.lift + 0.25, it.position[2]);
      const dist = camera.position.distanceTo(v);
      const modulePx = (it.w * pxPerMetreAt1m) / Math.max(0.01, dist);
      v.project(camera);
      // z outside [-1,1] means behind the camera or past the far plane
      if (modulePx < MIN_MODULE_PX || v.z < -1 || v.z > 1) {
        node.style.visibility = 'hidden';
        continue;
      }
      node.style.visibility = 'visible';
      shown++;
      node.style.transform = `translate(-50%,-50%) translate(${(v.x * half.w + half.w).toFixed(1)}px,${(-v.y * half.h + half.h).toFixed(1)}px)`;
    }
    const any = shown > 0;
    if (any !== anyShown.current) {
      anyShown.current = any;
      onAnyVisible?.(any);
    }
  });

  return null;
}
