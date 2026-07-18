// ─── Analysis worker client: fallback + supersede protocol ──────────────────
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnalysisSuperseded,
  requestSolarAccess,
  resetAnalysisWorker,
} from '../analysis-client';
import { computeSolarAccess } from '../shading';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';

function located(p: Project): Project {
  return {
    ...p,
    location: {
      address: 'Pune',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

afterEach(() => {
  resetAnalysisWorker();
  // @ts-expect-error test shim
  delete globalThis.Worker;
});

describe('requestSolarAccess — no Worker available (SSR, tests, locked-down browsers)', () => {
  it('computes INLINE and returns exactly the engine\'s own numbers', async () => {
    const p = located(fixtureProject(4));
    const viaClient = await requestSolarAccess(p);
    const direct = computeSolarAccess(p);
    expect([...viaClient.entries()]).toEqual([...direct.entries()]);
  });
});

describe('requestSolarAccess — with a worker', () => {
  /** Minimal Worker double: records posts, replies when told to. */
  class FakeWorker {
    static last: FakeWorker | null = null;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    posted: Array<{ id: number; kind: string }> = [];
    terminated = false;
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(msg: { id: number; kind: string }) {
      this.posted.push(msg);
    }
    terminate() {
      this.terminated = true;
    }
    reply(id: number, access: Array<[string, number]>) {
      this.onmessage?.({ data: { id, ok: true, kind: 'access', access } });
    }
  }

  function installFakeWorker() {
    // @ts-expect-error test shim
    globalThis.Worker = FakeWorker;
    resetAnalysisWorker();
  }

  it('resolves with the worker\'s answer, keyed by request id', async () => {
    installFakeWorker();
    const p = located(fixtureProject(4));
    const promise = requestSolarAccess(p);
    const w = FakeWorker.last!;
    expect(w.posted).toHaveLength(1);
    w.reply(w.posted[0].id, [['panel_a', 0.5]]);
    await expect(promise).resolves.toEqual(new Map([['panel_a', 0.5]]));
  });

  it('cancelPrevious retires the in-flight request instead of applying stale geometry', async () => {
    installFakeWorker();
    const p = located(fixtureProject(4));
    const stale = requestSolarAccess(p, { cancelPrevious: true });
    const staleErr = stale.catch((e) => e);
    const fresh = requestSolarAccess(p, { cancelPrevious: true });
    const w = FakeWorker.last!;

    expect(await staleErr).toBeInstanceOf(AnalysisSuperseded);
    // answering the retired id must NOT resolve anything
    w.reply(w.posted[0].id, [['panel_a', 0.1]]);
    w.reply(w.posted[1].id, [['panel_a', 0.9]]);
    await expect(fresh).resolves.toEqual(new Map([['panel_a', 0.9]]));
  });

  it('a crashed worker degrades to INLINE compute — never to silent staleness', async () => {
    installFakeWorker();
    const p = located(fixtureProject(4));
    const promise = requestSolarAccess(p);
    FakeWorker.last!.onerror?.({});
    const result = await promise; // rejected by onerror, caught → inline
    expect([...result.entries()]).toEqual([...computeSolarAccess(p).entries()]);
  });

  it('an unusable Worker constructor falls back inline without throwing', async () => {
    globalThis.Worker = vi.fn(() => {
      throw new Error('bundler said no');
    }) as unknown as typeof Worker;
    resetAnalysisWorker();
    const p = located(fixtureProject(4));
    await expect(requestSolarAccess(p)).resolves.toEqual(computeSolarAccess(p));
  });
});
