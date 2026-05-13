import { buildDiagnosticsSummary as buildCanonicalDiagnosticsSummary, type ReportingDiagnosticsInput } from './reporting';

export type ReportDiagnosticsInput = ReportingDiagnosticsInput;

export interface ReportDiagnosticsSummary {
  unmatchedTransfers: number;
  missingPrices: number;
  duplicateTransactions: number;
}

export function buildDiagnosticsSummary(input: ReportDiagnosticsInput): ReportDiagnosticsSummary {
  return buildCanonicalDiagnosticsSummary(input);
}
