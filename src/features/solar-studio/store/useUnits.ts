// ─── The signed-in user's unit preference, bound to the formatters ──────────
//
// The conversion maths lives in lib/units.ts and stays pure. This hook is the
// only part that reads the store, and it lives here with the other store hooks
// rather than in lib/ — a lib/ module that imports the store puts pure logic
// underneath React, and nothing in lib/ can then be called from a worker, a
// server route or a plain test without dragging a provider in behind it.
import type { UnitSystem } from '../types';
import { useStore } from './store';
import {
  areaUnit,
  fmtArea,
  fmtLen,
  lenToM,
  lenUnit,
  lenValue,
} from '../lib/units';

/**
 * Units preference + bound formatters. Falls back to metric when no user is
 * logged in (share viewer / proposal links render without a session).
 */
export function useUnits() {
  const { state, dispatch } = useStore();
  const units: UnitSystem = state.user?.units ?? 'metric';
  return {
    units,
    setUnits: (u: UnitSystem) => dispatch({ type: 'set-units', units: u }),
    lenUnit: lenUnit(units),
    areaUnit: areaUnit(units),
    fmtLen: (m: number, dp = 2) => fmtLen(m, units, dp),
    lenValue: (m: number, dp = 2) => lenValue(m, units, dp),
    lenToM: (v: number) => lenToM(v, units),
    fmtArea: (m2: number) => fmtArea(m2, units),
  };
}
