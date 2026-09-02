import { describe, expect, it } from 'vitest';
import { bayInverters } from '../../components/InverterBay';
import type { InverterSpec, StringDef } from '../../types';

const inverter = {
  id: 'inv',
  brand: 'Test',
  model: 'T15',
  acKw: 15,
  phases: 3,
  mppt: { count: 4, minV: 160, maxV: 1000 },
  maxDcV: 1100,
  efficiencyPct: 98.5,
  priceInr: 0,
} as unknown as InverterSpec;

function str(inverterIndex: number, mpptIndex: number, n: number): StringDef {
  return {
    id: `s${inverterIndex}-${mpptIndex}`,
    name: 'String',
    inverterIndex,
    mpptIndex,
    panelIds: Array.from({ length: n }, (_, i) => `p${inverterIndex}-${mpptIndex}-${i}`),
    color: '#fff',
  };
}

/**
 * The gate for what the Bay exists to show. Before it there was nowhere at all
 * to see how the DC load had landed across the inverters — you read
 * "INV 2 · MPPT 3" off one string card at a time and did the sums in your head.
 */
describe('the Inverter Bay', () => {
  it('splits the load across the inverters the strings actually name', () => {
    const bay = bayInverters([str(0, 0, 10), str(0, 1, 10), str(1, 0, 6)], inverter, 2, 540, 2);
    expect(bay).toHaveLength(2);
    expect(bay[0].kwp).toBeCloseTo(10.8, 3);
    expect(bay[0].usedMppts).toBe(2);
    expect(bay[0].strings).toBe(2);
    expect(bay[1].kwp).toBeCloseTo(3.24, 3);
    expect(bay[1].usedMppts).toBe(1);
  });

  it('counts an MPPT once however many strings sit on it in parallel', () => {
    const bay = bayInverters([str(0, 0, 10), { ...str(0, 0, 10), id: 'twin' }], inverter, 1, 540, 1);
    expect(bay[0].usedMppts).toBe(1);
    expect(bay[0].strings).toBe(2);
  });

  it('shows an inverter the design names but the user has not hung', () => {
    // its cable run cannot be measured, so the card has to say so (lib/routing
    // marks those runs assumedTarget)
    const bay = bayInverters([str(1, 0, 8)], inverter, 2, 540, 1);
    expect(bay[0].placed).toBe(true);
    expect(bay[1].placed).toBe(false);
  });

  it('lists every inverter, including the empty ones', () => {
    const bay = bayInverters([], inverter, 3, 540, 0);
    expect(bay.map((b) => b.kwp)).toEqual([0, 0, 0]);
    expect(bay.every((b) => !b.placed)).toBe(true);
  });
});
