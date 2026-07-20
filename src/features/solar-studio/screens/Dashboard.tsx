import { useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  FileText,
  Globe,
  Home,
  LogOut,
  MoreVertical,
  Plus,
  ReceiptText,
  Search,
  Sun,
  Trash2,
  Copy,
} from 'lucide-react';
import { useStore, newProject, newShareId } from '../store/store';
import { genId } from '../lib/geo';
import { duplicateProject } from '../lib/project-duplicate';
import { navigate } from '../router';
import { Dialog, EmptyState } from '../components/ui';
import type { Project } from '../types';
import { staticSatelliteUrl } from '../lib/maps';
import { computeEnergyReport } from '../lib/solar';

type Filter = 'all' | 'in_progress' | 'proposal_ready';

function relTime(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

// Only English is actually translated. The other three stay VISIBLE (they are
// the roadmap) but are not selectable: a picker that stores a language nothing
// renders in is a control that lies about what it did.
const LANGUAGES = [
  ['en', 'English', true],
  ['hi', 'हिन्दी (Hindi)', false],
  ['th', 'ไทย (Thai)', false],
  ['vi', 'Tiếng Việt (Vietnamese)', false],
] as const;

export function Dashboard() {
  const { state, dispatch } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [showLang, setShowLang] = useState(false);

  const projects = useMemo(() => {
    let list = [...state.projects];
    if (filter !== 'all') list = list.filter((p) => p.status === filter);
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(
        (p) =>
          p.info.name.toLowerCase().includes(needle) ||
          p.info.customerName.toLowerCase().includes(needle) ||
          (p.location?.address ?? '').toLowerCase().includes(needle),
      );
    }
    list.sort((a, b) =>
      sort === 'updated'
        ? b.updatedAt - a.updatedAt
        : a.info.name.localeCompare(b.info.name),
    );
    return list;
  }, [state.projects, filter, q, sort]);

  const counts = {
    all: state.projects.length,
    in_progress: state.projects.filter((p) => p.status === 'in_progress')
      .length,
    proposal_ready: state.projects.filter(
      (p) => p.status === 'proposal_ready',
    ).length,
  };

  function duplicate(p: Project) {
    const copy = duplicateProject(
      p,
      { id: genId('prj'), shareId: newShareId(), now: Date.now() },
      state.projects.map((x) => x.info.name),
    );
    dispatch({ type: 'create-project', project: copy });
    setMenuFor(null);
  }

  function createProject() {
    dispatch({ type: 'create-project', project: newProject() });
    navigate('/wizard/1');
  }

  function openProject(p: Project) {
    dispatch({ type: 'open-project', id: p.id });
    navigate(`/wizard/${p.wizardStep}`);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper-2)' }}>
      <style>{`
        .proj-card { transition: transform var(--t-med), box-shadow var(--t-med); }
        .proj-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-2); }
      `}</style>
      {state.quarantinedIds.length > 0 && (
        <div
          role="alert"
          style={{
            background: '#fffbeb',
            borderBottom: '1px solid #f59e0b',
            color: '#92400e',
            padding: '8px 24px',
            fontSize: 12.5,
          }}
        >
          {state.quarantinedIds.length} saved project
          {state.quarantinedIds.length > 1 ? 's' : ''} couldn&apos;t be read and{' '}
          {state.quarantinedIds.length > 1 ? 'were' : 'was'} set aside without touching your
          other projects. The raw data is preserved in browser storage under
          &ldquo;solar-studio-quarantine:&rdquo; keys for recovery.
        </div>
      )}
      {/* top bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'var(--paper)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, letterSpacing: 0.4 }}>
          <Sun size={18} color="var(--brand)" aria-hidden />
          SOLAR STUDIO
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <span style={{ color: 'var(--ink-3)' }}>
            {state.user?.companyName}
          </span>
          <span className="badge badge-almm">v0.1-poc</span>
          <button
            className="btn-ghost"
            onClick={() => setShowLang(true)}
            aria-label="Language"
            data-tip="Language"
            data-tip-left=""
          >
            <Globe size={16} />
          </button>
          <button
            className="btn-ghost"
            aria-label="Logout"
            data-tip="Logout"
            data-tip-left=""
            onClick={() => {
              dispatch({ type: 'logout' });
              navigate('/login');
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1060, margin: '0 auto', padding: '28px 24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 20,
          }}
        >
          <div>
            <h1 style={{ fontSize: 30, margin: 0 }}>My Projects</h1>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
              <b>{counts.all}</b> project{counts.all === 1 ? '' : 's'} ·{' '}
              <b>{counts.in_progress}</b> in progress
            </div>
          </div>
          <button className="btn btn-primary" onClick={createProject}>
            <Plus size={16} /> New Project
          </button>
        </div>

        {/* filters + search */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(
              [
                ['all', 'All'],
                ['in_progress', 'In progress'],
                ['proposal_ready', 'Proposal ready'],
              ] as [Filter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                className={`chip ${filter === f ? 'on' : ''}`}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {label} <span className="n">{counts[f]}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                size={15}
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-3)',
                  pointerEvents: 'none',
                }}
              />
              <input
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 36px',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                }}
                placeholder="Search name, customer, address"
                aria-label="Search projects"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              value={sort}
              aria-label="Sort projects"
              onChange={(e) => setSort(e.target.value as 'updated' | 'name')}
              style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '0 10px' }}
            >
              <option value="updated">Last updated</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {/* project grid */}
        {projects.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Home size={34} />}
              text="No projects yet — create your first solar design."
            />
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 18,
            }}
          >
            {projects.map((p) => {
              const report = computeEnergyReport(p);
              const thumb = p.location
                ? staticSatelliteUrl(
                    p.location.latLng.lat,
                    p.location.latLng.lng,
                    18,
                    320,
                  )
                : null;
              const menuItems: { label: string; icon: ReactNode; fn: () => void }[] = [
                { label: 'Show Proposal', icon: <FileText size={14} />, fn: () => { dispatch({ type: 'open-project', id: p.id }); navigate('/proposal'); } },
                { label: 'Show 3D', icon: <Box size={14} />, fn: () => { dispatch({ type: 'open-project', id: p.id }); navigate('/wizard/6'); } },
                { label: 'BOM & Pricing', icon: <ReceiptText size={14} />, fn: () => { dispatch({ type: 'open-project', id: p.id }); navigate('/wizard/9'); } },
                { label: 'Duplicate', icon: <Copy size={14} />, fn: () => duplicate(p) },
              ];
              return (
                <div
                  key={p.id}
                  className="card proj-card"
                  // Phase 22p. This was a bare div with an onClick: no tab
                  // stop, no role, no accessible name — so the ONLY thing a
                  // keyboard or screen-reader user could reach on a project
                  // card was its ⋮ menu. Opening a project, the primary action
                  // of the home screen, was mouse-only.
                  role="button"
                  tabIndex={0}
                  aria-label={`Open project ${p.info.name || 'Untitled'}${
                    p.info.customerName ? `, customer ${p.info.customerName}` : ''
                  }`}
                  style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}
                  onClick={() => openProject(p)}
                  onKeyDown={(e) => {
                    // Enter and Space are what a button responds to; Space also
                    // scrolls the page unless prevented
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openProject(p);
                    }
                  }}
                >
                  <div
                    style={{
                      height: 130,
                      background: thumb
                        ? `url(${thumb}) center/cover`
                        : 'linear-gradient(135deg,#1d2432,#2b3a52)',
                      position: 'relative',
                    }}
                  >
                    <span
                      className="chip"
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        background:
                          p.status === 'proposal_ready'
                            ? 'var(--good-bg)'
                            : 'rgba(255,255,255,0.92)',
                        color:
                          p.status === 'proposal_ready'
                            ? 'var(--good)'
                            : 'var(--ink-2)',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: 'currentColor',
                          display: 'inline-block',
                          flex: 'none',
                        }}
                      />
                      {p.status === 'proposal_ready' ? 'Proposal ready' : 'In progress'}
                    </span>
                    <button
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.45)',
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      aria-label={`Project actions for ${p.info.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menuFor === p.id}
                      data-tip="Actions"
                      data-tip-left=""
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor(menuFor === p.id ? null : p.id);
                      }}
                    >
                      <MoreVertical size={15} />
                    </button>
                    {menuFor === p.id && (
                      <div
                        role="menu"
                        style={{
                          position: 'absolute',
                          top: 40,
                          right: 8,
                          background: 'var(--paper)',
                          borderRadius: 10,
                          boxShadow: 'var(--shadow-2)',
                          zIndex: 20,
                          overflow: 'hidden',
                          minWidth: 160,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {menuItems.map((item) => (
                          <button
                            key={item.label}
                            role="menuitem"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 9,
                              width: '100%',
                              textAlign: 'left',
                              padding: '10px 14px',
                              fontSize: 13,
                            }}
                            onClick={() => { setMenuFor(null); item.fn(); }}
                          >
                            {item.icon} {item.label}
                          </button>
                        ))}
                        <button
                          role="menuitem"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 9,
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px 14px',
                            fontSize: 13,
                            color: 'var(--bad)',
                            borderTop: '1px solid var(--line)',
                          }}
                          onClick={() => { setMenuFor(null); setConfirmDelete(p); }}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.info.name}</div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--ink-3)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: 2,
                      }}
                    >
                      {p.location?.address ?? 'No location set'}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: '1px solid var(--line)',
                        fontSize: 11,
                        color: 'var(--ink-3)',
                      }}
                    >
                      <div>
                        CAPACITY
                        <div style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 12.5 }}>
                          {report.capacityKwp > 0 ? `${report.capacityKwp} kWp` : '—'}
                        </div>
                      </div>
                      <div>
                        CUSTOMER
                        <div style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 12.5 }}>
                          {p.info.customerName || '—'}
                        </div>
                      </div>
                      <div>
                        UPDATED
                        <div style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 12.5 }}>
                          {relTime(p.updatedAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {confirmDelete && (
        <Dialog
          title="Delete project?"
          icon={<Trash2 size={18} />}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  dispatch({ type: 'delete-project', id: confirmDelete.id });
                  setConfirmDelete(null);
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p>
            “{confirmDelete.info.name}” and its design will be permanently
            removed from this browser.
          </p>
        </Dialog>
      )}

      {showLang && (
        <Dialog
          title="Language"
          icon={<Globe size={18} />}
          actions={
            <button className="btn btn-primary" onClick={() => setShowLang(false)}>
              OK
            </button>
          }
        >
          {LANGUAGES.map(([code, label, ready]) => (
            <label
              key={code}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '11px 12px',
                border: '1px solid var(--line)',
                borderRadius: 10,
                marginBottom: 8,
                fontSize: 13.5,
                cursor: ready ? 'pointer' : 'not-allowed',
                opacity: ready ? 1 : 0.55,
              }}
            >
              <span>
                {label}
                {!ready && (
                  <span
                    style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}
                  >
                    Not translated yet — the app stays in English
                  </span>
                )}
              </span>
              <input
                type="radio"
                name="language"
                disabled={!ready}
                checked={state.user?.language === code}
                onChange={() => dispatch({ type: 'set-language', language: code })}
              />
            </label>
          ))}
        </Dialog>
      )}
    </div>
  );
}
