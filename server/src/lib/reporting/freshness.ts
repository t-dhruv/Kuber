import type { FreshnessStateInput, ReportFreshnessState, ReportSource, ReportSourceInput } from './types';

export function chooseReportSource(input: ReportSourceInput): ReportSource {
  return input.isCurrentPeriod || !input.snapshotFresh ? 'live' : 'snapshot';
}

export function resolveFreshnessState(input: FreshnessStateInput): ReportFreshnessState {
  if (input.recomputed) {
    return 'recomputed';
  }

  if (input.source === 'live') {
    return 'live';
  }

  return input.snapshotFresh ? 'fresh' : 'stale';
}
