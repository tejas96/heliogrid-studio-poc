// ─── Phase 22d gate: the BOM prices through the CATALOG ─────────────────────
// The emitters used to `import { PRICE_BOOK }` directly, which binds at module
// load. That works fine today — the bundled book IS the catalog's book — so a
// test comparing the two would pass either way and prove nothing. The only test
// that distinguishes them SWAPS the catalog and checks the money follows.
import { describe, expect, it, vi } from 'vitest';

const REAL = await vi.importActual<typeof import('../../data/catalog')>('../../data/catalog');
const BUMPED_VERSION = '9999.99-test';
const DEAR_CABLE = 999;

vi.mock('../../data/catalog', async () => {
  const actual = await vi.importActual<typeof import('../../data/catalog')>('../../data/catalog');
  const base = actual.resolveCatalog();
  return {
    ...actual,
    resolveCatalog: () => ({
      ...base,
      catalogVersion: '9999.99-test',
      // the whole by-size table is dear, so whichever size the fixture's
      // module derives, the quoted rate is DEAR_CABLE
      pricebook: {
        ...base.pricebook,
        dcCablePerMBySize: Object.fromEntries(
          Object.keys(base.pricebook.dcCablePerMBySize).map((k) => [k, 999]),
        ),
      },
    }),
  };
});

const { deriveBom } = await import('../bom');
const { designFp } = await import('../fingerprints');
const { fixtureProject } = await import('./fixtures/project');

describe('prices resolve through resolveCatalog(), not a frozen import', () => {
  it('a swapped catalog changes the quoted rate', () => {
    const cable = deriveBom(fixtureProject(8)).find((l) => l.id === 'elec.dc_cable')!;
    expect(cable.unitPriceInr).toBe(DEAR_CABLE);
    expect(cable.unitPriceInr).not.toBe(
      REAL.resolveCatalog().pricebook.dcCablePerMBySize[4],
    );
  });

  it('reaches the module-level sloped-hardware table too', () => {
    // that table is built once at import — the exact place a direct read would
    // have frozen the rate for the process lifetime
    const p = fixtureProject(8);
    const sloped = {
      ...p,
      roofs: p.roofs.map((r) => ({ ...r, roofType: 'tile' as const, pitchDeg: 20 })),
    };
    const lines = deriveBom(sloped);
    const hooks = lines.find((l) => l.id === 'mech.mms_sloped:tile');
    const flashing = lines.find((l) => l.id === 'mech.sloped_flashing:tile');
    // asserted present, NOT guarded by `if` — a conditional assertion here
    // would pass silently the day the line id changes and prove nothing
    expect(hooks, 'tile roof must emit its hook line').toBeDefined();
    expect(flashing, 'tile roof must emit its flashing line').toBeDefined();

    const book = REAL.resolveCatalog().pricebook;
    expect(hooks!.unitPriceInr).toBe(book.tileHookSetPerPanel);
    expect(flashing!.unitPriceInr).toBe(book.tileFlashingPerPanel);
  });
});

describe('designFp carries the catalog version', () => {
  it('a price-book revision re-keys the design', () => {
    const fp = designFp(fixtureProject(8));
    expect(fp).toContain(`|cat:${BUMPED_VERSION}`);
    expect(fp).not.toContain(REAL.resolveCatalog().catalogVersion);
  });
});
