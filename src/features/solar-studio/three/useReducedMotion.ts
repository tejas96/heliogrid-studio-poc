// ─── prefers-reduced-motion, for the part of the app CSS cannot reach ────────
// The repo honours reduced motion in three CSS blocks (`src/design/index.css`,
// `solar-studio/theme.css` twice). None of them can touch the 3D scene: its
// decorative motion lives in `useFrame` callbacks that write straight to
// `Object3D.rotation`, and a media query has no opinion about a WebGL frame.
//
// So every animation in `three/` was running regardless of the setting — the
// tree sway, the turbine-vent rotor and both windmills. CLAUDE.md keeps the
// accessibility rules binding in this repo ("Keyboard operability, focus order,
// contrast, accessible names and `prefers-reduced-motion` ... still bind"), and
// DESIGN-SYSTEM §9 and §12 say the same. This is the JavaScript half of that
// rule.
//
// SSR-safe by construction: `matchMedia` does not exist while Next renders on
// the server, so it starts `false` and subscribes on mount. It also keeps
// listening — the setting can be changed while the studio is open, and a user
// who turns it on to stop the motion should not have to reload to be obeyed.
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
