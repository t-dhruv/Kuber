import { buildReportingOverview, type ReportingAccountInput, type ReportingCashFlowEventInput, type ReportingDiagnosticsInput, type ReportingHoldingInput } from './reporting';

export interface ReportOverviewTotals {
  currentNetWorth: number;
  portfolioValue: number;
  currentMonthSavingsRate: number;
  income: number;
  expense: number;
  transferTotal: number;
  unmatchedTransfers: number;
  missingPrices: number;
  duplicateTransactions: number;
}

export interface ReportOverviewInput {
  accounts: ReportingAccountInput[];
  holdings: ReportingHoldingInput[];
  cashFlowEvents: ReportingCashFlowEventInput[];
  diagnostics: ReportingDiagnosticsInput;
}

export function buildReportOverview(input: ReportOverviewInput): ReportOverviewTotals {
  return buildReportingOverview(input);
}
