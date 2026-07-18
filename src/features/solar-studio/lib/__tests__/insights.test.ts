import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAnalyzers,
  computeInsights,
  listAnalyzers,
  memoizedInsights,
  registerAnalyzer,
  resetInsightMemo,
} from '../insights/registry';
import type { Insight, InsightAnalyzer } from '../insights/types';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';

afterEach(() => {
  clearAnalyzers();
  resetInsightMemo();
});

function ins(over: Partial<Insight>): Insight {
  return {
    key: 'a1:x',
    analyzerId: 'a1',
    category: 'energy',
    severity: 'suggestion',
    impact: 0.5,
    confidence: 1,
    title: 't',
    detail: 'd',
    evidence: ['e'],
    ...over,
  };
}

function analyzer(id: string, out: (p: Project) => Insight[]): InsightAnalyzer {
  return { id, title: id, analyze: out };
}

describe('insight registry', () => {
  it('registers and lists analyzers; rejects duplicate ids', () => {
    registerAnalyzer(analyzer('a1', () => []));
    expect(listAnalyzers().map((a) => a.id)).toEqual(['a1']);
    expect(() => registerAnalyzer(analyzer('a1', () => []))).toThrow(/already registered/);
  });

  it('dedupes by key, keeping the higher severity', () => {
    registerAnalyzer(analyzer('a1', () => [ins({ key: 'shared', severity: 'suggestion' })]));
    registerAnalyzer(
      analyzer('a2', () => [ins({ key: 'shared', analyzerId: 'a2', severity: 'critical' })]),
    );
    const out = computeInsights(fixtureProject());
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('critical');
    expect(out[0].analyzerId).toBe('a2');
  });

  it('orders by severity, then impact×confidence', () => {
    registerAnalyzer(
      analyzer('a1', () => [
        ins({ key: 'a1:low', severity: 'info', impact: 1 }),
        ins({ key: 'a1:big', severity: 'warning', impact: 0.4 }),
        ins({ key: 'a1:sug-strong', severity: 'suggestion', impact: 0.9 }),
        ins({ key: 'a1:sug-weak', severity: 'suggestion', impact: 0.9, confidence: 0.3 }),
      ]),
    );
    const keys = computeInsights(fixtureProject()).map((i) => i.key);
    expect(keys).toEqual(['a1:big', 'a1:sug-strong', 'a1:sug-weak', 'a1:low']);
  });

  it('filters ignored insights via project.insightState; accepted stay visible', () => {
    registerAnalyzer(
      analyzer('a1', () => [ins({ key: 'a1:x' }), ins({ key: 'a1:y' }), ins({ key: 'a1:z' })]),
    );
    const p: Project = {
      ...fixtureProject(),
      insightState: { 'a1:x': 'ignored', 'a1:y': 'accepted' },
    };
    const keys = computeInsights(p).map((i) => i.key);
    expect(keys).toContain('a1:y');
    expect(keys).toContain('a1:z');
    expect(keys).not.toContain('a1:x');
    // audit view still sees everything
    expect(computeInsights(p, { includeIgnored: true }).map((i) => i.key)).toContain('a1:x');
  });

  it('isolates a throwing analyzer — others still report', () => {
    registerAnalyzer(
      analyzer('boom', () => {
        throw new Error('bad rule');
      }),
    );
    registerAnalyzer(analyzer('ok', () => [ins({ key: 'ok:1', analyzerId: 'ok' })]));
    expect(computeInsights(fixtureProject()).map((i) => i.key)).toEqual(['ok:1']);
  });
});

describe('memoized selector', () => {
  it('returns the identical array for unchanged design state', () => {
    registerAnalyzer(analyzer('a1', () => [ins({})]));
    const p = fixtureProject();
    const first = memoizedInsights(p);
    expect(memoizedInsights(structuredClone(p))).toBe(first); // value-equal project ⇒ same instance
  });

  it('recomputes when the design or the insight state changes', () => {
    let calls = 0;
    registerAnalyzer(
      analyzer('a1', () => {
        calls += 1;
        return [ins({})];
      }),
    );
    const p = fixtureProject();
    memoizedInsights(p);
    memoizedInsights({ ...p, pricing: { marginPct: 33 } }); // designFp changed
    expect(calls).toBe(2);
    memoizedInsights({ ...p, pricing: { marginPct: 33 }, insightState: { 'a1:x': 'ignored' } });
    expect(calls).toBe(3);
  });
});
