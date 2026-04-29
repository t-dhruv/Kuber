import { buildCashFlowSummary as buildCanonicalCashFlowSummary, type ReportingCashFlowEventInput } from './reporting';

export type CashFlowEventType = 'income' | 'expense' | 'transfer' | 'investment_buy' | 'investment_sell' | 'dividend' | 'fee' | 'other';

export interface CashFlowEventInput extends ReportingCashFlowEventInput {
  type: CashFlowEventType | string;
}

export interface CashFlowSummary {
  income: number;
  expense: number;
  transferTotal: number;
}

export function buildCashFlowSummary(events: CashFlowEventInput[]): CashFlowSummary {
  return buildCanonicalCashFlowSummary(events);
}
