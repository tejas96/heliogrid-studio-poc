import { useMemo, useState } from 'react';
import { AlertTriangle, Camera, Check, FileText, ImageOff, RefreshCw, XCircle } from 'lucide-react';
import { useActiveProject, useProjectPatch } from '../store/store';
import { navigate } from '../router';
import { Scene3D, seasonDate } from '../three/Scene3D';
import type { ShadowCapture } from '../types';
import { computeEnergyReport } from '../lib/solar';
import { isCaptureFresh, layoutFp } from '../lib/fingerprints';
import { putImage } from '../lib/persistence/blobs';
import { BlobImg } from '../components/BlobImg';
import { preProposalReview } from '../lib/review';

interface CapturePreset {
  id: string;
  label: string;
  date: Date;
  hour: number;
  mode: 'shadow' | 'solar_access';
}

function presets(): CapturePreset[] {
  return [
    { id: 'sum_am', label: 'Summer Morning', date: seasonDate('summer'), hour: 9, mode: 'shadow' },
    { id: 'sum_noon', label: 'Summer Noon', date: seasonDate('summer'), hour: 12, mode: 'shadow' },
    { id: 'sa_summer', label: 'Solar Access (Summer)', date: seasonDate('summer'), hour: 12, mode: 'solar_access' },
    { id: 'sa_winter', label: 'Solar Access (Winter)', date: seasonDate('winter'), hour: 12, mode: 'solar_access' },
  ];
}

export function Step7Proposal() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const all = useMemo(presets, []);
  const [activeIdx, setActiveIdx] = useState<number | null>(
    project.captures.length >= 4 ? null : 0,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const report = computeEnergyReport(project);

  const captured = (id: string) =>
    project.captures.find((c) => c.id === id)?.imageBlobId ?? null;

  async function saveCapture(preset: CapturePreset, dataUrl: string) {
    // image bytes go to IndexedDB; the project stores only the reference.
    // If the blob store is unavailable (private mode, storage pressure) the
    // capture is NOT silently dropped — the user sees why and can retry.
    let blobId: string;
    try {
      blobId = await putImage(dataUrl);
      setSaveError(null);
    } catch {
      setSaveError(
        `${preset.label} could not be saved — browser image storage is unavailable (private mode or storage full). Free space and capture again.`,
      );
      return;
    }
    const fp = layoutFp(project);
    const cap: ShadowCapture = {
      id: preset.id,
      label: preset.label,
      dateIso: preset.date.toISOString().slice(0, 10),
      hour: preset.hour,
      mode: preset.mode,
      imageBlobId: blobId,
      forLayoutFp: fp,
    };
    const others = project.captures.filter((c) => c.id !== preset.id);
    const captures = [...others, cap];
    patch({
      captures,
      // first capture becomes the cover (same blob — GC is reference-counted
      // per project, so sharing the id is safe)
      coverImageBlobId: project.coverImageBlobId ?? blobId,
      coverForLayoutFp: project.coverImageBlobId ? project.coverForLayoutFp : fp,
    });
    // advance to next un-captured preset
    const next = all.findIndex((p) => !captures.some((c) => c.id === p.id && c.imageBlobId));
    setActiveIdx(next === -1 ? null : next);
  }

  // capture studio phase
  if (activeIdx !== null) {
    const preset = all[activeIdx];
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <Scene3D
          key={preset.id}
          captureMode
          initial={{ date: preset.date, hour: preset.hour, solarAccess: preset.mode === 'solar_access' }}
          onCapture={(dataUrl) => saveCapture(preset, dataUrl)}
        />
        {/* capture checklist */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            background: 'rgba(20,23,28,0.92)',
            border: '1px solid var(--editor-line)',
            borderRadius: 12,
            padding: '8px 14px',
            color: '#fff',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            fontSize: 12,
          }}
        >
          <b style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Camera size={14} aria-hidden />
            {preset.label} · {preset.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ·{' '}
            {preset.hour}:00
          </b>
          <span style={{ color: '#9ca3af' }}>
            Shadow captures: {project.captures.filter((c) => c.imageBlobId).length}/4
          </span>
          {all.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setActiveIdx(i)}
              title={p.label}
              aria-label={`${p.label}${captured(p.id) ? ' (captured)' : ''}`}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                fontSize: 11,
                background: captured(p.id) ? 'var(--good)' : i === activeIdx ? '#fff' : '#374151',
                color: captured(p.id) ? '#fff' : i === activeIdx ? '#111' : '#9ca3af',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {captured(p.id) ? <Check size={12} strokeWidth={3} /> : i + 1}
            </button>
          ))}
          <button
            className="chip"
            style={{ background: '#374151', color: '#fff', borderColor: 'transparent' }}
            onClick={() => setActiveIdx(null)}
          >
            Skip to review
          </button>
        </div>
        {saveError && (
          <div
            role="alert"
            style={{
              position: 'absolute',
              top: 60,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 60,
              background: '#7f1d1d',
              color: '#fff',
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: 12.5,
              maxWidth: 520,
            }}
          >
            {saveError}
          </div>
        )}
      </div>
    );
  }

  // review phase
  const review = preProposalReview(project);
  const REVIEW_TONE: Record<typeof review.overall, { bg: string; fg: string; label: string }> = {
    blocked: { bg: 'var(--bad-bg, #fef2f2)', fg: 'var(--bad, #dc2626)', label: 'Not ready to issue' },
    attention: { bg: 'var(--warn-bg, #fffbeb)', fg: 'var(--warn, #b45309)', label: 'Ready — with caveats' },
    ready: { bg: 'var(--good-bg, #f0fdf4)', fg: 'var(--good, #15803d)', label: 'Ready to issue' },
  };
  const tone = REVIEW_TONE[review.overall];

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '26px 20px 90px' }}>
      {/* Pre-proposal review (Phase 15): the four readiness signals gathered
          from the four screens that own them, so "is this ready to send?"
          is answered in one place instead of by remembering to check four. */}
      <SectionLabel>BEFORE YOU ISSUE</SectionLabel>
      <div
        className="card"
        style={{ padding: 12, marginBottom: 18, borderLeft: `3px solid ${tone.fg}`, background: tone.bg }}
        role="status"
        aria-live="polite"
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: tone.fg, marginBottom: 8 }}>
          {tone.label}
        </div>
        {review.items.map((it) => (
          <div key={it.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 7 }}>
            <span aria-hidden style={{ marginTop: 1 }}>
              {it.status === 'ready' ? (
                <Check size={14} color="var(--good, #15803d)" />
              ) : it.status === 'blocked' ? (
                <XCircle size={14} color="var(--bad, #dc2626)" />
              ) : (
                <AlertTriangle size={14} color="var(--warn, #b45309)" />
              )}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                {it.title}
                <span className="sr-only">
                  {' — '}
                  {it.status === 'ready' ? 'ready' : it.status === 'blocked' ? 'blocked' : 'needs attention'}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{it.detail}</div>
            </div>
            {it.status !== 'ready' && it.step !== 7 && (
              <button
                className="btn-ghost"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => navigate(`/wizard/${it.step}`)}
              >
                Step {it.step}
              </button>
            )}
          </div>
        ))}
      </div>

      <SectionLabel>COVER IMAGE</SectionLabel>
      {project.coverImageBlobId ? (
        <BlobImg
          blobId={project.coverImageBlobId}
          alt="cover"
          placeholderHeight={220}
          style={{ width: '100%', borderRadius: 12, marginBottom: 18, border: '1px solid var(--line)' }}
        />
      ) : (
        <div
          className="card"
          style={{
            marginBottom: 18,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            padding: 28,
            color: 'var(--ink-3)',
          }}
        >
          <ImageOff size={22} strokeWidth={1.6} aria-hidden />
          No cover captured yet
        </div>
      )}

      <SectionLabel>SHADOW ANALYSIS</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        {all.map((p) => {
          const blobId = captured(p.id);
          const cap = project.captures.find((c) => c.id === p.id);
          const stale = !!blobId && !!cap && !isCaptureFresh(project, cap);
          return (
            <div key={p.id} className="card" style={{ padding: 8, position: 'relative' }}>
              {stale && (
                <button
                  onClick={() => setActiveIdx(all.findIndex((x) => x.id === p.id))}
                  title="The design changed after this image was captured — click to retake"
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    zIndex: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'var(--warn, #b45309)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 7,
                    padding: '3px 8px',
                    fontSize: 10.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={11} aria-hidden /> Outdated — retake
                </button>
              )}
              {blobId ? (
                <BlobImg blobId={blobId} alt={p.label} style={{ width: '100%', borderRadius: 8 }} />
              ) : (
                <div
                  style={{
                    height: 110,
                    borderRadius: 8,
                    background: 'var(--paper-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    color: 'var(--ink-3)',
                    fontSize: 12,
                  }}
                >
                  <ImageOff size={18} strokeWidth={1.6} aria-hidden />
                  Not captured
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, textAlign: 'center' }}>
                {p.label}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'center' }}>
                {p.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                {p.hour}:00
              </div>
              {/* which capture leads the proposal is the user's choice, not just
                  "the first one saved". Only a captured image can be the cover. */}
              {blobId &&
                (project.coverImageBlobId === blobId ? (
                  <div
                    style={{
                      marginTop: 6,
                      textAlign: 'center',
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: 'var(--good, #15803d)',
                      display: 'inline-flex',
                      gap: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '100%',
                    }}
                  >
                    <Check size={12} aria-hidden /> Cover image
                  </div>
                ) : (
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: 6, padding: '3px 8px', fontSize: 11 }}
                    onClick={() =>
                      patch({ coverImageBlobId: blobId, coverForLayoutFp: layoutFp(project) }, true)
                    }
                  >
                    Set as cover
                  </button>
                ))}
            </div>
          );
        })}
      </div>

      <SectionLabel>SYSTEM SUMMARY</SectionLabel>
      <div className="card" style={{ marginBottom: 24 }}>
        <Row k="Capacity" v={`${report.capacityKwp} kWp`} />
        <Row k="Panels" v={`${report.panelCount} × ${project.components.panel?.watt}W`} />
        <Row k="Solar Access" v={`${report.avgSolarAccessPct}%`} />
        <Row k="Annual Generation" v={`${report.annualMwh} MWh`} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-secondary" onClick={() => setActiveIdx(0)}>
          <Camera size={15} /> Edit Photos
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => {
            patch({ status: 'proposal_ready' });
            navigate('/proposal');
          }}
        >
          <FileText size={15} /> Generate Proposal
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: 'var(--ink-3)', margin: '4px 0 8px' }}>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--ink-3)' }}>{k}</span>
      <b>{v}</b>
    </div>
  );
}
