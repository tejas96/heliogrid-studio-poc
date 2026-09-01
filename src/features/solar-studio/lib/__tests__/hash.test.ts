import { describe, expect, it } from 'vitest';
import { fnv1a, stringIdFor } from '../hash';

describe('fnv1a / stringIdFor', () => {
  it('is deterministic and order-sensitive', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('acb'));
    expect(stringIdFor(['pv_1', 'pv_2'])).toBe(stringIdFor(['pv_1', 'pv_2']));
    expect(stringIdFor(['pv_1', 'pv_2'])).not.toBe(stringIdFor(['pv_2', 'pv_1']));
  });
  it('produces a short, prefix-stable id', () => {
    const id = stringIdFor(['pv_1']);
    expect(id.startsWith('str_')).toBe(true);
    expect(id.length).toBeLessThan(16);
  });
});
