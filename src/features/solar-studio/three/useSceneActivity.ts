// ─── Awake while someone is using the scene; asleep once they stop ───────────
// The 3D view rendered flat out — `frameloop="always"` — from the moment it
// opened until it closed, whether or not anyone was touching it. A laptop left
// open on the studio in a customer meeting ran its GPU at full tilt for an
// hour to redraw a picture that never changed. Gap-report: "demand mode is
// half-built and currently a no-op".
//
// Pure `demand` rendering is the wrong fix here, because the scene has motion
// that is not driven by a state change: the tree sway, the turbine vent and the
// windmill rotors advance by `delta` in `useFrame`. Under `demand` they would
// have to invalidate every frame to keep moving — which is `always` again, on
// every project with a tree.
//
// So the loop has two states. AWAKE — any pointer, wheel or key on the scene
// within the last SCENE_IDLE_MS — renders continuously, and the decoration
// moves. ASLEEP renders a frame only when something asks for one: r3f asks on
// every scene-graph change, drei's CameraControls asks while a tween or a
// damped move is still settling, and the handful of imperative writers
// (instance buffers, textures, the label layer) ask for themselves. Nothing the
// user can see is lost; only the frames nobody was looking at.
import { useCallback, useEffect, useRef, useState } from 'react';

/** how long after the last input the loop keeps rendering flat out */
export const SCENE_IDLE_MS = 3000;

export function useSceneActivity(active: boolean): { awake: boolean; wake: () => void } {
  const [awake, setAwake] = useState(true);
  // mirrors `awake` so a pointermove storm does not schedule a render per event
  const awakeRef = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wake = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      awakeRef.current = false;
      setAwake(false);
    }, SCENE_IDLE_MS);
    if (!awakeRef.current) {
      awakeRef.current = true;
      setAwake(true);
    }
  }, []);

  // (re)appearing is activity — the first frames after a mount or an unhide
  // are the ones that load textures and settle the camera. A parked scene
  // keeps no timer: `frameloop="never"` already stops it, and a stale timer
  // firing into a hidden scene would only flip state nobody reads.
  useEffect(() => {
    if (active) wake();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [active, wake]);

  return { awake, wake };
}
