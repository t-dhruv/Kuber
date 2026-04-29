export type ReportingAccountType = string;

export interface ReportingAccountInput {
  balance: number;
  type: ReportingAccountType;
  excludeFromNetWorth?: boolean;
}

export interface ReportingHoldingInput {
  currentPrice: number | null;
  shares: number;
}

export interface ReportingCashFlowEventInput {
  amount: number;
  type: string;
  isTransfer?: boolean;
}

export interface ReportingDiagnosticsInput {
  unmatchedTransferGroupIds: string[];
  holdingsWithMissingPrices: number;
  duplicateTransactions: number;
}

export interface ReportingNetWorthSummary {
  assets: number;
  liabilities: number;
  netWorth: number;
}

export interface ReportingPortfolioSummary {
  portfolioValue: number;
  missingPrices: number;
}

export interface ReportingCashFlowSummary {
  income: number;
  expense: number;
  transferTotal: number;
}

export interface ReportingDiagnosticsSummary {
  unmatchedTransfers: number;
  missingPrices: number;
  duplicateTransactions: number;
}

export interface ReportingOverviewSummary extends ReportingCashFlowSummary, ReportingDiagnosticsSummary {
  currentNetWorth: number;
  portfolioValue: number;
  currentMonthSavingsRate: number;
}

function isTransferLike(event: ReportingCashFlowEventInput): boolean {
  return event.isTransfer === true || event.type === 'transfer';
}

function isExcludedInvestmentFlow(event: ReportingCashFlowEventInput): boolean {
  return event.type === 'investment_buy';
}

function isLiabilityAccountType(type: ReportingAccountType): boolean {
  const normalized = type.toLowerCase();
  return normalized === 'credit' || normalized === 'loan' || normalized === 'credit_card' || normalized === 'credit card' || normalized === 'liability';
}

export function summarizeNetWorth(accounts: ReportingAccountInput[]): ReportingNetWorthSummary {
  const visibleAccounts = accounts.filter((account) => !account.excludeFromNetWorth);

  const assets = visibleAccounts
    .filter((account) => account.balance >= 0 && !isLiabilityAccountType(account.type))
    .reduce((sum, account) => sum + account.balance, 0);

  const liabilities = visibleAccounts
    .filter((account) => account.balance < 0 || isLiabilityAccountType(account.type))
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);

  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
  };
}

export function summarizePortfolio(holdings: ReportingHoldingInput[]): ReportingPortfolioSummary {
  const missingPrices = holdings.filter((holding) => holding.currentPrice == null).length;
  const portfolioValue = holdings.reduce((sum, holding) => sum + (holding.currentPrice ?? 0) * holding.shares, 0);

  return { portfolioValue, missingPrices };
}

export function buildCashFlowSummary(events: ReportingCashFlowEventInput[]): ReportingCashFlowSummary {
  let income = 0;
  let expense = 0;
  let transferTotal = 0;

  for (const event of events) {
    if (isTransferLike(event)) {
      transferTotal += Math.abs(event.amount);
      continue;
    }

    if (isExcludedInvestmentFlow(event)) {
      continue;
    }

    if (event.amount >= 0) {
      income += event.amount;
    } else {
      expense += Math.abs(event.amount);
    }
  }

  return { income, expense, transferTotal };
}

export function buildDiagnosticsSummary(input: ReportingDiagnosticsInput): ReportingDiagnosticsSummary {
  return {
    unmatchedTransfers: input.unmatchedTransferGroupIds.length,
    missingPrices: input.holdingsWithMissingPrices,
    duplicateTransactions: input.duplicateTransactions,
  };
}

export function buildReportingOverview(input: {
  accounts: ReportingAccountInput[];
  holdings: ReportingHoldingInput[];
  cashFlowEvents: ReportingCashFlowEventInput[];
  diagnostics: ReportingDiagnosticsInput;
}): ReportingOverviewSummary {
  const netWorth = summarizeNetWorth(input.accounts);
  const portfolio = summarizePortfolio(input.holdings);
  const cashFlow = buildCashFlowSummary(input.cashFlowEvents);
  const diagnostics = buildDiagnosticsSummary(input.diagnostics);
  const savingsRate = cashFlow.income > 0 ? Math.max(0, (cashFlow.income - cashFlow.expense) / cashFlow.income) : 0;

  return {
    currentNetWorth: netWorth.netWorth,
    portfolioValue: portfolio.portfolioValue,
    currentMonthSavingsRate: savingsRate,
    income: cashFlow.income,
    expense: cashFlow.expense,
    transferTotal: cashFlow.transferTotal,
    unmatchedTransfers: diagnostics.unmatchedTransfers,
    missingPrices: diagnostics.missingPrices,
    duplicateTransactions: diagnostics.duplicateTransactions,
  };
}
