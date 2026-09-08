import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { stepGate } from '../wizard-gate';
import { preProposalReview } from '../review';
import { fixtureProject } from './fixtures/project';

/** The lib fixture never confirms a pin — Step 1 is not what these tests are about. */
function sited(p: Project): Project {
  return {
    ...p,
    location: {
      address: 'Pune, Maharashtra',
      latLng: { lat: 18.52, lng: 73.86 },
      confirmed: true,
      irradiance: 5.2,
      peakSunHours: 5.2,
      dataSource: 'test',
    },
  };
}

// The Dashboard's "Show Proposal" row action used to jump straight to
// /proposal, past the gate the wizard's Next holds on Step 6. Both now ask
// stepGate, so an unstrung design cannot reach an issuable proposal from
// EITHER door — and the two doors cannot drift apart, because there is one
// predicate.
describe('the commercial-document gate has one definition', () => {
  it('an unstrung design stops at Step 6, and says why', () => {
    const p = sited({ ...fixtureProject(), strings: [] });
    const gate = stepGate(p);
    expect(gate.allowedStep).toBe(6);
    expect(gate.blocker).toBeTruthy();
    // the Dashboard refuses on exactly this, so /proposal is unreachable
    expect(gate.allowedStep).toBeLessThan(10);
    // ...and the Step 7 button is disabled on the same verdict
    expect(preProposalReview(p).issuable).toBe(false);
  });

  it('a finished project still reaches the proposal — the legitimate path', () => {
    const gate = stepGate(sited(fixtureProject()));
    expect(gate.allowedStep).toBe(10);
    expect(gate.blocker).toBeNull();
  });
});
