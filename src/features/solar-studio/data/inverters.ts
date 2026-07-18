import type { InverterSpec } from '../types';

// Mock inverter database — representative Indian-market on-grid inverters.
export const INVERTER_DB: InverterSpec[] = [
  { id: 'inv_gw3', brand: 'GoodWe', model: 'GW3000-NS', acKw: 3, phases: 1, mppt: { count: 2, minV: 80, maxV: 550, maxCurrentA: 16, stringsPerMppt: 1 }, maxDcV: 600, efficiencyPct: 97.6, priceInr: 42000, warrantyYears: 5 },
  { id: 'inv_gw5', brand: 'GoodWe', model: 'GW5000-NS', acKw: 5, phases: 1, mppt: { count: 2, minV: 80, maxV: 550, maxCurrentA: 16, stringsPerMppt: 1 }, maxDcV: 600, efficiencyPct: 97.8, priceInr: 55000, warrantyYears: 5 },
  { id: 'inv_gr5', brand: 'Growatt', model: 'MIN 5000TL-X', acKw: 5, phases: 1, mppt: { count: 2, minV: 80, maxV: 550, maxCurrentA: 16, stringsPerMppt: 1 }, maxDcV: 600, efficiencyPct: 98.0, priceInr: 52000, warrantyYears: 5 },
  { id: 'inv_sg6', brand: 'Sungrow', model: 'SG6.0RS', acKw: 6, phases: 1, mppt: { count: 2, minV: 40, maxV: 560, maxCurrentA: 16, stringsPerMppt: 1 }, maxDcV: 600, efficiencyPct: 98.1, priceInr: 61000, warrantyYears: 5 },
  { id: 'inv_sg8', brand: 'Sungrow', model: 'SG8.0RT', acKw: 8, phases: 3, mppt: { count: 2, minV: 140, maxV: 1000, maxCurrentA: 26, stringsPerMppt: 2 }, maxDcV: 1100, efficiencyPct: 98.3, priceInr: 92000, warrantyYears: 10 },
  { id: 'inv_gr10', brand: 'Growatt', model: 'MID 10KTL3-X', acKw: 10, phases: 3, mppt: { count: 2, minV: 160, maxV: 950, maxCurrentA: 26, stringsPerMppt: 2 }, maxDcV: 1100, efficiencyPct: 98.4, priceInr: 105000, warrantyYears: 5 },
  { id: 'inv_sol10', brand: 'Solis', model: 'S5-GC10K', acKw: 10, phases: 3, mppt: { count: 2, minV: 160, maxV: 850, maxCurrentA: 26, stringsPerMppt: 2 }, maxDcV: 1100, efficiencyPct: 98.1, priceInr: 99000, warrantyYears: 5 },
  { id: 'inv_hua12', brand: 'Huawei', model: 'SUN2000-12KTL-M5', acKw: 12, phases: 3, mppt: { count: 2, minV: 140, maxV: 980, maxCurrentA: 27, stringsPerMppt: 2 }, maxDcV: 1100, efficiencyPct: 98.4, priceInr: 132000, warrantyYears: 10 },
  { id: 'inv_sg15', brand: 'Sungrow', model: 'SG15RT', acKw: 15, phases: 3, mppt: { count: 2, minV: 160, maxV: 1000, maxCurrentA: 30, stringsPerMppt: 2 }, maxDcV: 1100, efficiencyPct: 98.5, priceInr: 148000, warrantyYears: 10 },
  { id: 'inv_gr20', brand: 'Growatt', model: 'MID 20KTL3-X', acKw: 20, phases: 3, mppt: { count: 2, minV: 160, maxV: 1000, maxCurrentA: 30, stringsPerMppt: 3 }, maxDcV: 1100, efficiencyPct: 98.6, priceInr: 178000, warrantyYears: 5 },
  { id: 'inv_amz30', brand: 'Amaze Solar', model: 'AN HKVA 30 KVA-360V', acKw: 30, phases: 3, mppt: { count: 10, minV: 540, maxV: 730, maxCurrentA: 20, stringsPerMppt: 1 }, maxDcV: 1000, efficiencyPct: 97.9, priceInr: 255000, warrantyYears: 3 },
  { id: 'inv_sol25', brand: 'Solis', model: 'S5-GC25K', acKw: 25, phases: 3, mppt: { count: 3, minV: 180, maxV: 1000, maxCurrentA: 32, stringsPerMppt: 2 }, maxDcV: 1100, efficiencyPct: 98.3, priceInr: 215000, warrantyYears: 5 },
];
