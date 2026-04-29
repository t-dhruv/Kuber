export type ReportingGrain = 'day' | 'month';
export type ReportingPreset = 'thisMonth' | 'lastMonth' | 'last3months' | 'last6months' | 'thisYear' | 'lastYear' | 'custom';
export type ReportingComparison = 'mom' | 'yoy' | 'rolling' | 'custom' | 'none';
export type ReportSource = 'live' | 'snapshot';
export type ReportFreshnessState = 'live' | 'fresh' | 'stale' | 'recomputed';
export type CashFlowClassification = 'income' | 'expense' | 'transfer' | 'ignored';

export interface CanonicalReportingPeriod {
  grain: ReportingGrain;
  range: 'single' | 'rolling' | 'custom';
  months?: number;
  startDate?: string;
  endDate?: string;
  month?: string;
  year?: string;
}

export interface ReportingPeriodInput {
  preset?: ReportingPreset;
  startDate?: string;
  endDate?: string;
}

export interface ComparisonPeriodInput {
  period: CanonicalReportingPeriod;
  comparison?: ReportingComparison;
}

export interface CashFlowEventLike {
  amount: number;
  type: string;
  isTransfer?: boolean;
}

export interface ReportSourceInput {
  isCurrentPeriod: boolean;
  snapshotFresh: boolean;
}

export interface FreshnessStateInput {
  source: ReportSource;
  snapshotFresh?: boolean;
  recomputed?: boolean;
}
