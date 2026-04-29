import type { CashFlowClassification, CashFlowEventLike } from './types';

export function isTransferLike(event: CashFlowEventLike): boolean {
  return event.isTransfer === true || event.type === 'transfer';
}

export function isExcludedInvestmentFlow(event: CashFlowEventLike): boolean {
  return event.type === 'investment_buy';
}

export function classifyCashFlowEvent(event: CashFlowEventLike): CashFlowClassification {
  if (isTransferLike(event)) {
    return 'transfer';
  }

  if (isExcludedInvestmentFlow(event)) {
    return 'ignored';
  }

  return event.amount >= 0 ? 'income' : 'expense';
}
