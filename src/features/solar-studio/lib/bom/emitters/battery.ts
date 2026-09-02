import type { BomLine } from '../../../types';
import type { BomContext } from '../context';
import { line } from '../line';
import { CHEMISTRY_LABEL } from '../../../data/batteries';

/**
 * Battery storage — only when a battery is selected. The bank is a COUNT
 * (measured); its leads are measured off the placed cabinets when they exist
 * and an allowance otherwise; the AC-coupled interface depends on a product
 * the model does not hold, so it is assumed and says so.
 */
export function emitBattery(ctx: BomContext): BomLine[] {
  const { battery, batteryCount, batteryCoupling, batteryCable, pricebook, rules } = ctx;
  if (!battery) return [];
  const bankKwh = battery.kwh * batteryCount;
  const bankKw = battery.powerKw * batteryCount;
  const out: BomLine[] = [
    line({
      key: 'battery.unit',
      category: 'Battery Storage',
      confidence: 'measured',
      item: `${battery.brand} ${battery.model}`,
      spec: `${battery.kwh} kWh usable · ${battery.nominalV} V · ${CHEMISTRY_LABEL[battery.chemistry]} · ${battery.cycleLife} cycles`,
      qty: batteryCount,
      unit: 'nos',
      unitPriceInr: battery.priceInr,
      formula: `Selected in Components step — bank ${bankKwh.toFixed(1)} kWh / ${bankKw.toFixed(1)} kW, ${
        batteryCoupling === 'ac_coupled' ? 'AC-coupled' : 'DC-coupled via hybrid inverter'
      }`,
    }),
    line({
      key: 'battery.cable',
      category: 'Battery Storage',
      confidence: batteryCable.routed ? 'derived' : 'assumed',
      item: 'Battery DC Leads',
      spec: '2 × 35 sq.mm Cu · 1.1kV, flexible, red+black pair',
      qty: batteryCable.meters,
      unit: 'm',
      unitPriceInr: pricebook.batteryCablePerM,
      formula: batteryCable.routed
        ? `Each cabinet → nearest inverter (plan distance + ${rules.cable.defaultVerticalDropM} m drop) × 2 conductors, +${Math.round(rules.cable.slackPct * 100)}% slack`
        : `ALLOWANCE — 3 m per cabinet × 2 conductors, +${Math.round(rules.cable.slackPct * 100)}% slack. Place the cabinet(s) and the inverter in Step 6 to measure the real run.`,
    }),
    line({
      key: 'battery.isolator',
      category: 'Battery Storage',
      confidence: 'derived',
      item: 'Battery DC Isolator + Fuse',
      spec: `${battery.nominalV >= 100 ? 'HV' : '48 V'} rated · 1 per cabinet`,
      qty: batteryCount,
      unit: 'nos',
      unitPriceInr: pricebook.batteryDcIsolator,
      formula: 'One isolator + fuse per battery cabinet (IEC 62619 / IS 16270)',
    }),
  ];
  if (batteryCoupling === 'ac_coupled') {
    out.push(
      line({
        key: 'battery.interface',
        category: 'Battery Storage',
        confidence: 'assumed',
        item: 'Battery Inverter (AC-coupled)',
        spec: `${bankKw.toFixed(1)} kW battery inverter + comms kit`,
        qty: 1,
        unit: 'set',
        unitPriceInr: Math.round(bankKw * pricebook.batteryAcInterfacePerKw),
        formula: `ASSUMED ₹${pricebook.batteryAcInterfacePerKw.toLocaleString('en-IN')}/kW × ${bankKw.toFixed(1)} kW — no battery-inverter product selected; engineer to confirm the model`,
      }),
    );
  }
  return out;
}
