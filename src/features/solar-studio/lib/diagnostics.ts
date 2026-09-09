// ─── Diagnostics: what broke on this machine, kept where it can be read ─────
// The studio had no record of its own failures. A lost WebGL context went
// black with no message, no recovery and no trace — "looks like your app
// broke, not the browser" — and the next support call started from nothing.
//
// This is the local half of telemetry. Every diagnostic is written to a ring in
// memory, mirrored to localStorage so it survives the reload the user will
// certainly do, and announced as a window event so a future sink (the
// HelioGrid backend, a Sentry, anything) can subscribe without this file
// knowing it exists. Nothing leaves the machine from here.
export interface Diagnostic {
  kind: string;
  /** ISO time */
  at: string;
  detail: Record<string, unknown>;
}

/** localStorage key; read it in devtools when someone reports a black 3D view */
export const DIAGNOSTICS_KEY = 'solar-studio-diagnostics';
/** window event fired for every record, `detail` = the Diagnostic — a sink subscribes by this name */
const DIAGNOSTIC_EVENT = 'solar-studio:diagnostic';
/** most recent kept */
const KEEP = 40;

function stored(): Diagnostic[] {
  try {
    const raw = window.localStorage.getItem(DIAGNOSTICS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as Diagnostic[]) : [];
  } catch {
    return [];
  }
}

export function recordDiagnostic(kind: string, detail: Record<string, unknown> = {}): Diagnostic {
  const d: Diagnostic = { kind, at: new Date().toISOString(), detail };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify([...stored(), d].slice(-KEEP)));
    } catch {
      // quota or private mode: the console line below is the record then
    }
    try {
      window.dispatchEvent(new CustomEvent(DIAGNOSTIC_EVENT, { detail: d }));
    } catch {
      // a listener threw — never let that stop the record
    }
  }
  console.warn(`[diagnostic] ${kind}`, detail);
  return d;
}

/** Everything recorded on this machine, oldest first. */
export function readDiagnostics(): Diagnostic[] {
  return typeof window === 'undefined' ? [] : stored();
}
