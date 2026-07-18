import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, HardHat, Link2, ReceiptText } from 'lucide-react';
import { useActiveProject, useProjectPatch } from '../store/store';
import { navigate } from '../router';
import { InstallationSheet } from './InstallationSheet';

export function Step10Done() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const [installSheet, setInstallSheet] = useState(false);

  // arriving here marks the project proposal-ready
  useEffect(() => {
    if (project.status !== 'proposal_ready') {
      patch({ status: 'proposal_ready' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Path route (app/(studio)/share/[shareId]) — the old #/share hash was never
  // parsed by the Next router. NOTE: resolution is still this-device-only (POC
  // stores projects in localStorage; no share backend exists).
  const shareUrl = `${location.origin}/share/${project.shareId}`;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 74,
          height: 74,
          borderRadius: '50%',
          background: 'var(--good-bg)',
          color: 'var(--good)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <CheckCircle2 size={36} strokeWidth={2.2} aria-hidden />
      </div>
      <h2 style={{ margin: 0 }}>Project Complete</h2>
      <p style={{ color: 'var(--ink-2)', margin: 0 }}>
        Your solar design for <b>{project.info.name}</b> is ready.
      </p>
      <p style={{ color: 'var(--ink-3)', fontSize: 12.5, margin: '0 0 18px' }}>
        You can return to edit this project anytime from the home screen.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/proposal')}>
          <FileText size={15} /> View Proposal
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/wizard/9')}>
          <ReceiptText size={15} /> BOM & Pricing
        </button>
        <button className="btn btn-secondary" onClick={() => setInstallSheet(true)}>
          <HardHat size={15} /> Installation Plan
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => navigator.clipboard.writeText(shareUrl)}
        >
          <Link2 size={15} /> Copy 3D Share Link
        </button>
        <button className="btn btn-primary" onClick={() => navigate('/projects')}>
          Done <ArrowRight size={15} />
        </button>
      </div>
      {installSheet && (
        <InstallationSheet project={project} onClose={() => setInstallSheet(false)} />
      )}
    </div>
  );
}
