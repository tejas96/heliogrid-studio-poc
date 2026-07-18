'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useRoute, navigate } from '@/features/solar-studio/router';
import { StoreProvider, useStore, useActiveProject } from '@/features/solar-studio/store/store';
import { useDesignSync } from '@/features/solar-studio/store/useDesignSync';
import { useHealthSync } from '@/features/solar-studio/store/useHealthSync';

/**
 * Recompute host for derived design data (per-panel shading). Lives at the
 * layout level — NOT inside the wizard — so a stale project heals no matter
 * which route it is opened on (/proposal, /share, /projects, deep links).
 */
function DesignSync() {
  useDesignSync();
  useHealthSync();
  return null;
}

/**
 * Persistent "Not saved" chip. Storage writes fail silently by default
 * (quota, private-mode restrictions) — the ONE unacceptable failure mode is
 * the user designing for an hour on top of unsaved state without knowing.
 */
function PersistStatusChip() {
  const { persistStatus, retryPersist } = useStore();
  if (persistStatus === 'ok') return null;
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#7f1d1d',
        color: '#fff',
        borderRadius: 10,
        padding: '9px 13px',
        fontSize: 12.5,
        boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
      }}
    >
      <AlertTriangle size={15} aria-hidden />
      {persistStatus === 'quota'
        ? 'Not saved — browser storage is full. Delete old projects to free space.'
        : 'Not saved — browser storage is unavailable.'}
      <button
        onClick={retryPersist}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          background: 'rgba(255,255,255,0.16)',
          color: '#fff',
          border: 'none',
          borderRadius: 7,
          padding: '4px 9px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <RefreshCw size={12} aria-hidden /> Retry
      </button>
    </div>
  );
}

/** Another tab saved a newer version of the open project (last-writer-wins). */
function ExternalConflictBanner() {
  const { state, dispatch } = useStore();
  if (!state.externalConflictAt) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        background: '#1e3a8a',
        color: '#fff',
        borderRadius: 10,
        padding: '8px 12px',
        fontSize: 12.5,
        boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
      }}
    >
      This project was updated in another tab — showing the latest version.
      <button
        aria-label="Dismiss"
        onClick={() => dispatch({ type: 'dismiss-external-conflict' })}
        style={{
          display: 'inline-flex',
          background: 'transparent',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          padding: 2,
        }}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

function RouteGuards({ children }: { children: React.ReactNode }) {
  const route = useRoute();
  const { state } = useStore();
  const project = useActiveProject();

  useEffect(() => {
    if (!state.hydrated) return;
    if (route.name === 'share') return;
    if (!state.user && route.name !== 'login') navigate('/login');
    else if (state.user && route.name === 'login') navigate('/projects');
    else if (route.name === 'wizard' && !project) navigate('/projects');
    else if (route.name === 'proposal' && !project) navigate('/projects');
  }, [route, state.hydrated, state.user, project]);

  // Server and first-client render must be identical. Project state lives in
  // localStorage, so do not render stateful route content until it is loaded.
  return state.hydrated ? <>{children}</> : null;
}

export default function StudioClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StoreProvider>
      <DesignSync />
      <PersistStatusChip />
      <ExternalConflictBanner />
      <RouteGuards>{children}</RouteGuards>
    </StoreProvider>
  );
}
