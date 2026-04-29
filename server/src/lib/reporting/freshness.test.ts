import { describe, expect, it } from 'vitest';
import { chooseReportSource, resolveFreshnessState } from './freshness';

describe('chooseReportSource', () => {
  it('prefers live data for current periods and stale snapshots', () => {
    expect(chooseReportSource({ isCurrentPeriod: true, snapshotFresh: true })).toBe('live');
    expect(chooseReportSource({ isCurrentPeriod: false, snapshotFresh: false })).toBe('live');
  });

  it('prefers snapshot data for historical fresh periods', () => {
    expect(chooseReportSource({ isCurrentPeriod: false, snapshotFresh: true })).toBe('snapshot');
  });
});

describe('resolveFreshnessState', () => {
  it('describes live, snapshot, and recomputed states', () => {
    expect(resolveFreshnessState({ source: 'live' })).toBe('live');
    expect(resolveFreshnessState({ source: 'snapshot', snapshotFresh: true })).toBe('fresh');
    expect(resolveFreshnessState({ source: 'snapshot', snapshotFresh: false })).toBe('stale');
  });
});
