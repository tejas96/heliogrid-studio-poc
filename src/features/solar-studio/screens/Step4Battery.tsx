// ─── Step 4 · Battery storage picker (optional) ─────────────────────────────
// A plain grid-tied system needs no battery, so "None" is a real, first-class
// choice. Picking a battery sets the bank (spec × count) and how it couples to
// the PV; Step 6 then stands the cabinets at a wall and the BOM bills them.
import { useState } from 'react';
import { BatteryCharging, CheckCircle2 } from 'lucide-react';
import { BATTERY_DB, CHEMISTRY_LABEL } from '../data/batteries';
import type { BatteryCoupling, BatterySpec } from '../types';
import { Seg } from '../components/ui';

export function BatteryPicker({
  selected,
  count,
  coupling,
  onSelect,
  onCount,
  onCoupling,
}: {
  selected: BatterySpec | null;
  count: number;
  coupling: BatteryCoupling;
  onSelect: (b: BatterySpec | null) => void;
  onCount: (n: number) => void;
  onCoupling: (k: BatteryCoupling) => void;
}) {
  const [q, setQ] = useState('');
  const list = BATTERY_DB.filter(
    (b) => !q || (b.brand + ' ' + b.model + ' ' + b.chemistry).toLowerCase().includes(q.toLowerCase()),
  );
  const bankKwh = selected ? selected.kwh * count : 0;
  const bankKw = selected ? selected.powerKw * count : 0;

  return (
    <div className="card">
      {selected && (
        <div className="card" style={{ background: 'var(--paper-2)', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <b>{selected.brand}</b>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{selected.model}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
                {CHEMISTRY_LABEL[selected.chemistry]} · {selected.nominalV} V · {selected.cycleLife} cycles ·{' '}
                {selected.warrantyYears ?? '—'} y warranty
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{bankKwh.toFixed(1)}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>kWh usable · {bankKw.toFixed(1)} kW</div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid var(--line)',
              paddingTop: 10,
              marginTop: 10,
              fontSize: 13,
            }}
          >
            <span>No. of Batteries</span>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              aria-label="Number of batteries"
              style={{ width: 70, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, textAlign: 'right' }}
              onChange={(e) => onCount(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <label style={{ marginTop: 12, display: 'block' }}>Coupling</label>
          <Seg
            options={[
              { value: 'dc_hybrid', label: 'Hybrid inverter (DC)' },
              { value: 'ac_coupled', label: 'AC-coupled' },
            ]}
            value={coupling}
            onChange={(v) => onCoupling(v)}
          />
          <span className="hint">
            {coupling === 'ac_coupled'
              ? 'A separate battery inverter hangs off the AC side — retrofits and large C&I. The BOM adds an assumed battery-inverter line until a product is chosen.'
              : 'The hybrid inverter charges the bank on its DC bus — one box, the residential default. Make sure the selected inverter is a hybrid model.'}
          </span>
        </div>
      )}

      <input
        className="input"
        placeholder="Search batteries…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search batteries"
        style={{
          marginBottom: 10,
          width: '100%',
          padding: '8px 10px',
          border: '1px solid var(--line)',
          borderRadius: 8,
          background: 'var(--paper)',
        }}
      />

      <div style={{ display: 'grid', gap: 8 }}>
        <button
          type="button"
          className="card"
          aria-pressed={!selected}
          onClick={() => onSelect(null)}
          style={{
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            border: `1px solid ${!selected ? 'var(--accent)' : 'var(--line)'}`,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontWeight: 700 }}>None — grid-tied only</span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>No storage, no backup</span>
          {!selected && <CheckCircle2 size={16} style={{ marginLeft: 'auto', color: 'var(--good)' }} aria-hidden />}
        </button>
        {list.map((b) => {
          const on = selected?.id === b.id;
          return (
            <button
              key={b.id}
              type="button"
              className="card"
              aria-pressed={on}
              onClick={() => onSelect(b)}
              style={{
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                cursor: 'pointer',
              }}
            >
              <BatteryCharging size={18} style={{ flex: 'none', color: 'var(--ink-3)' }} aria-hidden />
              <span style={{ display: 'grid' }}>
                <span style={{ fontWeight: 700 }}>
                  {b.brand} <span style={{ fontWeight: 500, color: 'var(--ink-2)' }}>{b.model}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {b.kwh} kWh usable · {b.powerKw} kW · {CHEMISTRY_LABEL[b.chemistry]} · {b.cycleLife} cycles ·{' '}
                  {b.weightKg} kg
                </span>
              </span>
              <span style={{ marginLeft: 'auto', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontWeight: 700 }}>₹{b.priceInr.toLocaleString('en-IN')}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)' }}>
                  ₹{Math.round(b.priceInr / b.kwh / 1000)}k / kWh
                </span>
              </span>
              {on && <CheckCircle2 size={16} style={{ color: 'var(--good)', flex: 'none' }} aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
