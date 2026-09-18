import { describe, expect, it } from 'vitest';
import { siteStateMismatch, stateFromAddress } from '../site-state';

const at = (address: string | null, state: string) => ({
  info: { state } as { state: string },
  location: address === null ? null : ({ address } as { address: string }),
}) as Parameters<typeof siteStateMismatch>[0];

describe('stateFromAddress', () => {
  it('reads the state a geocoded address names', () => {
    expect(stateFromAddress('XJJ8+RGM, Kavathe Ekand, Maharashtra, India')).toBe('Maharashtra');
  });

  it('keeps the Pradeshes apart', () => {
    expect(stateFromAddress('Vijayawada, Andhra Pradesh, India')).toBe('Andhra Pradesh');
    expect(stateFromAddress('Bhopal, Madhya Pradesh, India')).toBe('Madhya Pradesh');
  });

  it('says nothing when the evidence is thin', () => {
    expect(stateFromAddress('221B Baker Street, London')).toBeNull();
    expect(stateFromAddress('')).toBeNull();
    expect(stateFromAddress(null)).toBeNull();
  });
});

describe('siteStateMismatch — the SLD, the wind zone and the tariff all follow the State', () => {
  it('flags the real case: an Andhra board on a Maharashtra roof', () => {
    expect(siteStateMismatch(at('Kavathe Ekand, Maharashtra, India', 'Andhra Pradesh'))).toEqual({
      typed: 'Andhra Pradesh',
      pinned: 'Maharashtra',
    });
  });

  it('stays quiet when they agree, or when either is missing', () => {
    expect(siteStateMismatch(at('Kavathe Ekand, Maharashtra, India', 'Maharashtra'))).toBeNull();
    expect(siteStateMismatch(at('Kavathe Ekand, Maharashtra, India', ''))).toBeNull();
    expect(siteStateMismatch(at(null, 'Maharashtra'))).toBeNull();
    expect(siteStateMismatch(at('somewhere unnamed', 'Maharashtra'))).toBeNull();
  });
});
