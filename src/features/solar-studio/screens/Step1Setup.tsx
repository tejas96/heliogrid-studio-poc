import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  CirclePlay,
  Home,
  Image as ImageIcon,
  Info,
  Lock,
  MapPin,
  Satellite,
  Sun,
  Upload,
} from 'lucide-react';
import type { Project, SolarInsights } from '../types';
import { useActiveProject, useProjectPatch } from '../store/store';
import { Seg } from '../components/ui';
import { INDIAN_STATES, discomsForState, tariffFor } from '../data/discoms';
import { loadGoogleMaps } from '../lib/maps';
import { latLngNear, mockIrradiance } from '../lib/solar';
import { fetchBuildingInsights } from '../lib/solarApi';
import { fetchWeather } from '../lib/weatherApi';
import { useUnits } from '../lib/units';

const headingStyle: React.CSSProperties = {
  fontSize: 15,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

export function Step1Setup() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const info = project.info;

  function setInfo(p: Partial<typeof info>) {
    patch({ info: { ...info, ...p } });
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '26px 20px 80px' }}>
      {/* tutorial video placeholder */}
      <div
        style={{
          height: 170,
          borderRadius: 12,
          background: 'linear-gradient(120deg,#12233c,#1d3a5f 60%,#2b567f)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          position: 'relative',
          marginBottom: 26,
        }}
      >
        <CirclePlay size={44} strokeWidth={1.5} aria-hidden />
        <span
          style={{
            position: 'absolute',
            left: 12,
            bottom: 10,
            fontSize: 11.5,
            background: 'rgba(0,0,0,0.5)',
            padding: '4px 8px',
            borderRadius: 6,
          }}
        >
          Tutorial: Getting Started
        </span>
      </div>

      <h3 style={{ ...headingStyle, margin: '0 0 14px' }}>
        <Info size={16} aria-hidden /> Project Information
      </h3>

      <div className="field">
        <label>Project Name</label>
        <input
          value={info.name}
          placeholder="e.g., Smith Residence Solar"
          aria-label="Project name"
          onChange={(e) => setInfo({ name: e.target.value })}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Customer Name</label>
          <input
            value={info.customerName}
            placeholder="e.g., John Smith"
            aria-label="Customer name"
            onChange={(e) => setInfo({ customerName: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Customer Phone (for proposal)</label>
          <input
            value={info.customerPhone}
            placeholder="98765 43210"
            aria-label="Customer phone"
            onChange={(e) => setInfo({ customerPhone: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label>Country</label>
        <select value="India" aria-label="Country" onChange={() => undefined}>
          <option>India</option>
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>State</label>
          <select
            value={info.state}
            aria-label="State"
            onChange={(e) =>
              setInfo({
                state: e.target.value,
                discom: '',
                tariffInrPerKwh: tariffFor(e.target.value, '', info.siteType),
              })
            }
          >
            <option value="">Select State</option>
            {INDIAN_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>DISCOM</label>
          <select
            value={info.discom}
            disabled={!info.state}
            aria-label="DISCOM provider"
            onChange={(e) =>
              setInfo({
                discom: e.target.value,
                tariffInrPerKwh: tariffFor(info.state, e.target.value, info.siteType),
              })
            }
          >
            <option value="">
              {info.state ? 'Select Provider' : 'Select State First'}
            </option>
            {info.state &&
              discomsForState(info.state).map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div
        className="card"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, opacity: 0.55 }}
      >
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>
            Ground Mount Project <span className="badge badge-beta">BETA</span>{' '}
            <span className="badge badge-pro">
              <Lock aria-hidden /> PRO
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
            Open access / PPA — no sanctioned load required
          </div>
        </div>
        <div className="toggle" />
      </div>

      <div className="field">
        <label>Site Type</label>
        <Seg
          options={[
            {
              value: 'residential',
              label: (
                <>
                  <Home aria-hidden /> Residential
                </>
              ),
            },
            {
              value: 'commercial',
              label: (
                <>
                  <Building2 aria-hidden /> Commercial
                </>
              ),
            },
          ]}
          value={info.siteType}
          onChange={(v) => setInfo({ siteType: v, tariffInrPerKwh: tariffFor(info.state, info.discom, v) })}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Connection Type</label>
          <Seg
            options={[
              { value: 'single', label: 'Single Phase' },
              { value: 'three', label: 'Three Phase' },
            ]}
            value={info.connectionType}
            onChange={(v) => setInfo({ connectionType: v })}
          />
        </div>
        <div className="field">
          <label>Sanctioned Load (kW)</label>
          <input
            type="number"
            min={0}
            value={info.sanctionedLoadKw || ''}
            placeholder="0"
            aria-label="Sanctioned load in kilowatts"
            onChange={(e) => setInfo({ sanctionedLoadKw: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="field">
        <label>Electricity Tariff (₹/kWh)</label>
        <input
          type="number"
          min={0}
          step={0.1}
          value={info.tariffInrPerKwh || ''}
          placeholder="e.g., 8.5"
          aria-label="Electricity tariff in rupees per kilowatt-hour"
          onChange={(e) => setInfo({ tariffInrPerKwh: Number(e.target.value) })}
        />
        <span className="hint">
          Auto-filled from {info.discom || info.state || 'your DISCOM'} (
          {info.siteType}) — representative rate; edit to match your actual bill.
        </span>
      </div>

      {/* improvement: consumption-based sizing input */}
      <div className="field">
        <label>Avg Monthly Electricity Bill (₹) — for sizing suggestion</label>
        <input
          type="number"
          min={0}
          value={info.monthlyBillInr ?? ''}
          placeholder="e.g., 4500"
          aria-label="Average monthly electricity bill in rupees"
          onChange={(e) =>
            setInfo({ monthlyBillInr: e.target.value ? Number(e.target.value) : null })
          }
        />
        <span className="hint">
          Used to recommend system size from your consumption (tariff ₹
          {info.tariffInrPerKwh}/kWh for {info.state || 'your state'}).
        </span>
      </div>

      <LogoUpload
        logo={info.logoDataUrl}
        onChange={(dataUrl) => setInfo({ logoDataUrl: dataUrl })}
      />

      <LocationSection />
    </div>
  );
}

function LogoUpload({
  logo,
  onChange,
}: {
  logo: string | null;
  onChange: (v: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <h3 style={{ ...headingStyle, margin: '26px 0 6px' }}>
        <ImageIcon size={16} aria-hidden /> Company Logo
      </h3>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 0 }}>
        This logo will appear on generated proposals
      </p>
      <div className="card" style={{ textAlign: 'center' }}>
        {logo ? (
          <img src={logo} alt="Company logo" style={{ maxHeight: 70, maxWidth: 200, marginBottom: 10 }} />
        ) : (
          <div style={{ marginBottom: 8, color: 'var(--ink-3)' }}>
            <ImageIcon size={28} strokeWidth={1.5} aria-hidden />
          </div>
        )}
        <button
          className="btn btn-secondary btn-block"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={15} /> {logo ? 'Change Logo' : 'Upload Logo'}
        </button>
        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 8 }}>
          Max size: 5 MB | Formats: PNG, JPG
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          hidden
          aria-label="Upload company logo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result as string);
            reader.readAsDataURL(f);
          }}
        />
      </div>
    </>
  );
}

function LocationSection() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  // stable refs so the async Solar API callback always sees fresh state
  const projectRef = useRef(project);
  projectRef.current = project;
  const patchRef = useRef(patch);
  patchRef.current = patch;
  const [method, setMethod] = useState<'search' | 'coords'>('search');
  const [mapsReady, setMapsReady] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ lat: number; lng: number; address: string } | null>(
    project.location
      ? {
          lat: project.location.latLng.lat,
          lng: project.location.latLng.lng,
          address: project.location.address,
        }
      : null,
  );
  const [coordsText, setCoordsText] = useState('');
  const mapDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const confirmed = project.location?.confirmed ?? false;

  useEffect(() => {
    loadGoogleMaps()
      .then(() => setMapsReady(true))
      .catch(() => setMapsError('Google Maps could not load — check the API key / network.'));
  }, []);

  // attach places autocomplete
  useEffect(() => {
    if (!mapsReady || !searchRef.current || method !== 'search') return;
    const ac = new google.maps.places.Autocomplete(searchRef.current, {
      fields: ['geometry', 'formatted_address'],
    });
    const listener = ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      const loc = place.geometry?.location;
      if (!loc) return;
      setPending({
        lat: loc.lat(),
        lng: loc.lng(),
        address: place.formatted_address ?? '',
      });
    });
    return () => listener.remove();
  }, [mapsReady, method]);

  // init/update map when a pending location exists
  useEffect(() => {
    if (!mapsReady || !pending || !mapDiv.current) return;
    if (!mapRef.current) {
      mapRef.current = new google.maps.Map(mapDiv.current, {
        center: pending,
        zoom: 20,
        mapTypeId: 'satellite',
        disableDefaultUI: true,
        zoomControl: true,
        tilt: 0,
      });
    } else {
      mapRef.current.setCenter(pending);
    }
  }, [mapsReady, pending]);

  function confirmLocation() {
    if (!pending) return;
    // With the Maps SDK loaded, the (draggable) map centre is authoritative.
    // Without it (bad key / network / ad-blocker) the typed coordinates still
    // work — otherwise Step 1 is a hard dead end with no way to confirm.
    const c = mapRef.current?.getCenter();
    const lat = c ? c.lat() : pending.lat;
    const lng = c ? c.lng() : pending.lng;
    const irr = mockIrradiance(lat);
    // Every roof/panel/obstruction is stored in local metres anchored to the
    // OLD map centre. Confirming a DIFFERENT site invalidates all of it, so wipe
    // the design and start fresh. Threshold is generous (25 m): getCenter drifts
    // several metres on map re-layout, and destroying work on that jitter is far
    // worse than keeping stale roofs — a real relocation moves the pin far more.
    const prev = project.location?.latLng;
    let movedM = 0;
    if (prev) {
      const dLat = (lat - prev.lat) * 111320;
      const dLng = (lng - prev.lng) * 111320 * Math.cos((prev.lat * Math.PI) / 180);
      movedM = Math.hypot(dLat, dLng);
    }
    const moved = !!prev && movedM > 25;
    const freshDesign: Partial<Project> = moved
      ? {
          roofs: [],
          obstructions: [],
          panels: [],
          segments: [],
          keepouts: [],
          walkways: [],
          rails: [],
          arresters: [],
          inverterPlacements: [],
          strings: [],
          captures: [],
          sldParams: null,
          bomOverrides: [],
          coverImageBlobId: null,
          coverForLayoutFp: null,
          // stamps/overrides describe the wiped design — reset them with it
          derived: { solarAccessFp: null, sldOverrides: null, sldIntroSeen: false, healthSnapshot: null },
          // new location = new imagery — the old imagery calibration is void
          calibration: { scaleFactor: 1, northOffsetDeg: 0, reference: null },
          wizardStep: 1,
        }
      : {};
    // a >25m relocation wipes the whole design — make THAT patch undoable so
    // one mis-click on the map is recoverable with Ctrl+Z instead of fatal
    patch(
      {
        ...freshDesign,
        location: {
          address: pending.address,
          latLng: { lat, lng },
          confirmed: true,
          irradiance: irr,
          peakSunHours: irr,
          dataSource: 'Built-in irradiance model (latitude fit, ±10%) — verify with site data',
        },
      },
      moved,
    );
    // Enhancement layers — async, never block the manual flow, and DECOUPLED
    // (Phase 5 task 24): each result lands the moment it arrives. Writes
    // compose safely because each patch spreads the LATEST location from
    // projectRef at resolve time — a slow Solar call can no longer delay or
    // drop measured PVGIS weather (audit ★16; both fetches are also bounded
    // by timeouts now, Solar via its server proxy).
    const stillCurrent = () => {
      const latest = projectRef.current;
      if (!latest?.location?.confirmed) return null;
      // user moved the pin while the request was in flight → discard
      if (!latLngNear(latest.location.latLng, { lat, lng }, 1e-6)) return null;
      return latest;
    };
    void fetchBuildingInsights(lat, lng).then((insights) => {
      const latest = stillCurrent();
      if (!latest) return;
      patchRef.current({ location: { ...latest.location!, solarInsights: insights } });
    });
    void fetchWeather(lat, lng).then((weather) => {
      const latest = stillCurrent();
      if (!latest || !weather) return;
      const ghi = Math.round(weather.annualGhi * 100) / 100; // display scalar
      patchRef.current({
        location: {
          ...latest.location!,
          weather,
          irradiance: ghi,
          peakSunHours: ghi,
          dataSource: `Real irradiance — PVGIS ${weather.raddatabase ?? '(measured)'}`,
        },
      });
    });
  }

  return (
    <>
      <h3 style={{ ...headingStyle, margin: '28px 0 14px' }}>
        <MapPin size={16} aria-hidden /> Installation Location
      </h3>

      <div className="field">
        <label>Location Input Method</label>
        <select
          value={method}
          aria-label="Location input method"
          onChange={(e) => setMethod(e.target.value as 'search' | 'coords')}
        >
          <option value="search">Search Address</option>
          <option value="coords">Enter Coordinates</option>
        </select>
      </div>

      {method === 'search' ? (
        <div className="field">
          <label>Search Address</label>
          <input
            ref={searchRef}
            placeholder="Enter full address..."
            aria-label="Search address"
            disabled={!mapsReady}
          />
          {mapsError && <span className="hint" style={{ color: 'var(--bad)' }}>{mapsError}</span>}
        </div>
      ) : (
        <div className="field">
          <label>Coordinates (lat, lng)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1 }}
              placeholder="16.8524, 74.5815"
              aria-label="Coordinates as latitude, longitude"
              value={coordsText}
              onChange={(e) => setCoordsText(e.target.value)}
            />
            <button
              className="btn btn-secondary"
              onClick={() => {
                const m = coordsText.split(',').map((s) => Number(s.trim()));
                if (m.length === 2 && m.every((v) => Number.isFinite(v))) {
                  setPending({ lat: m[0], lng: m[1], address: `${m[0].toFixed(5)}, ${m[1].toFixed(5)}` });
                }
              }}
            >
              Locate
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          height: 300,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--line)',
          position: 'relative',
          background: 'var(--paper-3)',
        }}
      >
        {pending ? (
          <>
            <div ref={mapDiv} style={{ position: 'absolute', inset: 0 }} />
            {mapsError && (
              <span
                style={{
                  position: 'absolute',
                  bottom: 10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.65)',
                  color: '#fff',
                  fontSize: 11.5,
                  padding: '4px 10px',
                  borderRadius: 6,
                  maxWidth: '90%',
                  textAlign: 'center',
                }}
              >
                Satellite view unavailable ({mapsError}) — you can still confirm the typed
                coordinates.
              </span>
            )}
            {/* fixed center pin — drag map to adjust */}
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -100%)',
                pointerEvents: 'none',
                filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))',
                display: 'flex',
              }}
              aria-hidden
            >
              <MapPin size={34} color="#dc2626" fill="#fecaca" strokeWidth={1.8} />
            </div>
            <span
              style={{
                position: 'absolute',
                top: 10,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                fontSize: 11.5,
                padding: '4px 10px',
                borderRadius: 6,
              }}
            >
              Drag map to adjust
            </span>
          </>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-3)',
              fontSize: 13,
              gap: 6,
            }}
          >
            <MapPin size={26} strokeWidth={1.6} aria-hidden />
            Search for an address to see satellite view
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}>
        {confirmed ? (
          <>
            <button className="btn btn-good btn-block" disabled>
              <Check size={16} /> Location Confirmed
            </button>
            <div className="card" style={{ marginTop: 12, background: 'var(--paper-2)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Sun size={15} color="var(--brand)" aria-hidden /> Solar Data Fetched
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 4 }}>
                Irradiance: <b>{project.location!.irradiance} kWh/m²/day</b> · Peak Sun
                Hours: <b>{project.location!.peakSunHours} hrs</b>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                Source: {project.location!.dataSource}
              </div>
            </div>
            <SiteIntelligenceCard insights={project.location!.solarInsights} />
            <button
              className="btn btn-secondary btn-block"
              style={{ marginTop: 10 }}
              onClick={() => patch({ location: { ...project.location!, confirmed: false } })}
            >
              <MapPin size={15} /> Change Location
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary btn-block"
            disabled={!pending}
            onClick={confirmLocation}
          >
            <Check size={16} /> Confirm Location
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Google Solar Building Insights — enhancement layer with explicit fallback.
 * Never blocks the manual flow; every state (loading/ok/unavailable/error)
 * explains where the data comes from (audit: no false precision).
 */
function SiteIntelligenceCard({ insights }: { insights?: SolarInsights }) {
  const { fmtArea } = useUnits();
  if (!insights) {
    return (
      <div className="card" style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>
        <Satellite size={13} aria-hidden style={{ verticalAlign: -2, marginRight: 6 }} />
        Checking Google Solar coverage…
      </div>
    );
  }
  if (insights.status !== 'ok') {
    return (
      <div className="card" style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
          <Satellite size={13} aria-hidden />
          {insights.status === 'unavailable'
            ? 'Google Solar has no coverage here — manual design mode'
            : 'Google Solar unreachable — manual design mode'}
        </div>
        {insights.message && (
          <div style={{ marginTop: 3, fontSize: 11 }}>{insights.message}</div>
        )}
      </div>
    );
  }
  const googleKwp =
    insights.maxPanels && insights.panelCapacityWatts
      ? Math.round((insights.maxPanels * insights.panelCapacityWatts) / 100) / 10
      : null;
  return (
    <div className="card" style={{ marginTop: 10, background: 'var(--info-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700 }}>
        <Satellite size={15} color="var(--info)" aria-hidden /> Site Intelligence
        <span className="badge badge-almm">Google Solar</span>
        {insights.imageryQuality && (
          <span
            className="badge"
            style={{
              background:
                insights.imageryQuality === 'HIGH' ? 'var(--good-bg)' : 'var(--warn-bg)',
              color: insights.imageryQuality === 'HIGH' ? 'var(--good)' : 'var(--warn)',
            }}
            title="Imagery quality — confidence indicator"
          >
            {insights.imageryQuality}
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 14px',
          marginTop: 8,
          fontSize: 12,
          color: 'var(--ink-2)',
        }}
      >
        {insights.maxPanels !== undefined && (
          <span>
            Max panels: <b>{insights.maxPanels}</b>
            {googleKwp !== null && <> (~{googleKwp} kWp)</>}
          </span>
        )}
        {insights.roofAreaM2 !== undefined && (
          <span>
            Roof area: <b>{fmtArea(insights.roofAreaM2)}</b>
          </span>
        )}
        {insights.maxSunshineHoursPerYear !== undefined && (
          <span>
            Sunshine: <b>{insights.maxSunshineHoursPerYear} h/yr</b>
          </span>
        )}
        {insights.roofSegmentCount !== undefined && (
          <span>
            Roof faces: <b>{insights.roofSegmentCount}</b>
          </span>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 6 }}>
        Imagery {insights.imageryDate ?? 'date unknown'} · independent cross-check for
        your traced design — Google's panel model may differ from your selection
      </div>
    </div>
  );
}
