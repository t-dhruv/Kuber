/** Mortgage regions supported by the system. */
export type MortgageRegion = 'US' | 'CA';
export type LoanRateType = 'fixed' | 'variable';
export type PaymentFrequency = 'monthly' | 'biweekly' | 'weekly';

export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'property' | 'other';
export type CategoryType = 'income' | 'expense' | 'transfer';
export type GoalType = 'save_up' | 'pay_down';
export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
export type AssetClass = 'us_stock' | 'intl_stock' | 'bond' | 'real_estate' | 'cash' | 'crypto' | 'commodity' | 'other';
/** Currency and dates should follow ISO/UTC conventions in this codebase. */
export type HouseholdRole = 'owner' | 'member' | 'viewer';

// Core DTOs / common data shapes (subset moved here for consolidation)
export interface AmortizationPeriod {
  period: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface PayoffResult {
  newPayoffMonths: number;
  monthsSaved: number;
  interestSaved: number;
  totalInterestBase: number;
  totalInterestNew: number;
}

export interface AmortizationResponse {
  effectiveMonthlyRate: number;
  calculatedPayment: number;
  nextPrincipalPortion: number;
  nextInterestPortion: number;
  remainingPayments: number;
  payoffDate: string;
  totalInterestRemaining: number;
  periods: AmortizationPeriod[];
}
