import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    // the Dashboard refuses on exactly this
    expect(gate.allowedStep).toBeLessThan(10);
    // ...and the Step 7 button is disabled on the same verdict
    expect(preProposalReview(p).issuable).toBe(false);
  });

  it('a finished project still reaches the proposal — the legitimate path', () => {
    const gate = stepGate(sited(fixtureProject()));
    expect(gate.allowedStep).toBe(10);
    expect(gate.blocker).toBeNull();
  });

  // This comment used to read "so /proposal is unreachable". It was not:
  // stepGate was consumed by Wizard.tsx and Dashboard.tsx only, while
  // ProposalView — the screen that actually prints the GST-inclusive quote —
  // never asked, and EnergyReportSheet had a "Quick Generate" button
  // navigating straight to it. Loading /proposal by URL rendered the whole
  // customer document. A test asserting a reachability property that no code
  // enforced is worse than no test.
  //
  // A WIRING assertion, deliberately: the defect was never in the predicate,
  // which these tests already covered. It was that the door did not ask. Only
  // the import can pin that, short of mounting a screen that needs the whole
  // store.
  it('every door to the commercial documents asks this predicate', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = (p: string) => readFileSync(join(here, '..', '..', p), 'utf8');
    for (const f of [
      'screens/ProposalView.tsx',
      'screens/Dashboard.tsx',
      'screens/Wizard.tsx',
      'components/EnergyReportSheet.tsx',
    ]) {
      expect(src(f), `${f} does not consult the gate`).toContain('stepGate');
    }
  });
});
