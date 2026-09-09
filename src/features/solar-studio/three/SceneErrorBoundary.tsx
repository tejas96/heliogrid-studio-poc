// ─── The 3D view's own error boundary ────────────────────────────────────────
// There was not one error boundary in the product. A WebGL context that could
// not be created ("Error creating WebGL context" — a blocklisted driver, a
// remote desktop, a browser with hardware acceleration off) threw out of
// <Canvas> and took the whole studio route to a blank page, and so did any
// render-time crash inside the scene. r3f re-throws errors from its own React
// root into the DOM tree, which is what lets a boundary HERE catch both.
//
// It is deliberately only the scene's boundary: the 2D editor, the store and
// the saved design are outside it and are untouched by anything it catches.
import { Component, type ReactNode } from 'react';
import { recordDiagnostic } from '../lib/diagnostics';

interface Props {
  children: ReactNode;
  /** what to show instead; `retry` remounts the children */
  fallback: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    recordDiagnostic('scene-crash', {
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 6).join('\n'),
    });
  }

  private retry = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.retry) : this.props.children;
  }
}
