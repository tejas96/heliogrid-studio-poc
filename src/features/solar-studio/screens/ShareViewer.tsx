import { SearchX } from 'lucide-react';
import { useStore } from '../store/store';
import { Scene3D } from '../three/Scene3D';

/** Public read-only 3D viewer (the QR/share link target). */
export function ShareViewer({ shareId }: { shareId: string }) {
  const { state } = useStore();
  const project = state.projects.find((p) => p.shareId === shareId);

  if (!project || !project.location) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          color: 'var(--ink-3)',
        }}
      >
        <SearchX size={40} strokeWidth={1.5} aria-hidden />
        <b>Shared design not found</b>
        <span style={{ fontSize: 13 }}>
          This link is invalid or the design isn't on this device (POC stores locally).
        </span>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Scene3D readOnly projectOverride={project} />
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 70,
          zIndex: 60,
          color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 15 }}>{project.info.name}</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{project.info.customerName}</div>
      </div>
    </div>
  );
}
