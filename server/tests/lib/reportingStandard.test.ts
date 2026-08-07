import { describe, expect, it } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import {
  buildCashFlowReport,
  buildAccountReport,
  buildBudgetReport,
  buildCategoryReport,
  buildIncomeExpenseReport,
  buildMerchantReport,
  buildAuditDataQualityReport,
  buildInvestmentReport,
  buildNetWorthReport,
  buildBenchmarksReport,
  buildOverviewReport,
  buildReportDrilldown,
  buildTagReport,
  buildAllocationReport,
  buildContributionRoomReport,
  buildDividendForecastReport,
  buildRetirementReport,
  normalizeReportQuery,
  fetchStandardReportRows,
  type StandardReportCategory,
  type StandardReportRow,
} from '../../src/lib/reporting/standard';

const category = (overrides: Partial<StandardReportCategory> = {}): StandardReportCategory => ({
  id: 'cat-food',
  name: 'Food',
  groupId: 'group-living',
  groupName: 'Living',
  excludeFromReports: false,
  bucketType: 'wants',
  isTaxDeductible: false,
  ...overrides,
});

const row = (overrides: Partial<StandardReportRow>): StandardReportRow => ({
  id: 'journal-1',
  date: new Date('2026-01-10T00:00:00.000Z'),
  description: 'Grocer',
  transactionType: 'withdrawal',
  amountDecimal: new Decimal('100.00'),
  signedAmountDecimal: new Decimal('-100.00'),
  currencyCode: 'CAD',
  isPending: false,
  isHidden: false,
  isDeleted: false,
  isSplit: false,
  isTransfer: false,
  category: category(),
  merchant: { id: 'merchant-market', name: 'Market' },
  account: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false, excludeFromNetWorth: false, isHidden: false, isDeleted: false },
  tags: [],
  splits: [],
  reconciled: false,
  ...overrides,
});

describe('standard reporting module', () => {
  it('normalizes report query defaults and rejects invalid ranges', () => {
    const valid = normalizeReportQuery({
      reportType: 'overview',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      tagIds: 'tag-a,tag-b',
    });

    expect(valid).toMatchObject({
      reportType: 'overview',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      groupBy: 'month',
      includePending: false,
      includeHidden: false,
      includeDeleted: false,
      includeTransfers: false,
      tagIds: ['tag-a', 'tag-b'],
      page: 1,
      pageSize: 50,
    });

    expect(() =>
      normalizeReportQuery({ reportType: 'overview', startDate: '2026-02-01', endDate: '2026-01-31' }),
    ).toThrow('endDate must be greater than or equal to startDate');
  });

  it('builds overview responses with the unified contract and Decimal-safe values', () => {
    const report = buildOverviewReport({
      query: normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31', currencyCode: 'CAD' }),
      rows: [
        row({ id: 'income', transactionType: 'deposit', signedAmountDecimal: new Decimal('1000.00'), amountDecimal: new Decimal('1000.00') }),
        row({ id: 'expense', signedAmountDecimal: new Decimal('-200.25'), amountDecimal: new Decimal('200.25') }),
        row({ id: 'pending', isPending: true, signedAmountDecimal: new Decimal('-25.00'), amountDecimal: new Decimal('25.00') }),
        row({ id: 'hidden', isHidden: true, signedAmountDecimal: new Decimal('-15.00'), amountDecimal: new Decimal('15.00') }),
      ],
      generatedAt: new Date('2026-01-31T12:00:00.000Z'),
    });

    expect(report.reportType).toBe('overview');
    expect(report.currencyCode).toBe('CAD');
    expect(report.summaryCards.find((card) => card.key === 'totalIncome')?.value).toBe('1000.00');
    expect(report.summaryCards.find((card) => card.key === 'totalExpenses')?.value).toBe('200.25');
    expect(report.summaryCards.find((card) => card.key === 'netCashFlow')?.value).toBe('799.75');
    expect(report.metadata.warnings).toContain('1 pending transaction is excluded. Enable includePending to include it.');
    expect(report.metadata.warnings).toContain('1 hidden transaction is excluded. Enable includeHidden to include it.');
  });

  it('uses split-level amounts for category totals', () => {
    const report = buildOverviewReport({
      query: normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31' }),
      rows: [
        row({
          id: 'split',
          isSplit: true,
          signedAmountDecimal: new Decimal('-100.00'),
          amountDecimal: new Decimal('100.00'),
          splits: [
            { id: 'split-food', amountDecimal: new Decimal('40.00'), category: category({ groupId: null, groupName: null }) },
            { id: 'split-home', amountDecimal: new Decimal('60.00'), category: category({ id: 'cat-home', name: 'Home', groupId: null, groupName: null }) },
          ],
        }),
      ],
    });

    const topCategories = report.tables.find((table) => table.key === 'topSpendingCategories')?.rows;
    expect(topCategories).toEqual([
      expect.objectContaining({ id: 'cat-home', amount: '60.00' }),
      expect.objectContaining({ id: 'cat-food', amount: '40.00' }),
    ]);
  });

  it('builds income versus expense periods and cash flow running balances', () => {
    const query = normalizeReportQuery({ reportType: 'income_vs_expense', startDate: '2026-01-01', endDate: '2026-02-28', groupBy: 'month' });
    const rows = [
      row({ id: 'jan-income', date: new Date('2026-01-05T00:00:00.000Z'), transactionType: 'deposit', signedAmountDecimal: new Decimal('500.00'), amountDecimal: new Decimal('500.00') }),
      row({ id: 'jan-expense', date: new Date('2026-01-10T00:00:00.000Z'), signedAmountDecimal: new Decimal('-125.50'), amountDecimal: new Decimal('125.50') }),
      row({ id: 'feb-expense', date: new Date('2026-02-10T00:00:00.000Z'), signedAmountDecimal: new Decimal('-25.00'), amountDecimal: new Decimal('25.00') }),
    ];

    const incomeExpense = buildIncomeExpenseReport({ query, rows });
    const cashFlow = buildCashFlowReport({ query: { ...query, reportType: 'cash_flow' }, rows });

    expect(incomeExpense.charts[0].data).toEqual([
      { period: '2026-01', income: '500.00', expenses: '125.50', net: '374.50' },
      { period: '2026-02', income: '0.00', expenses: '25.00', net: '-25.00' },
    ]);
    expect(cashFlow.charts.find((chart) => chart.key === 'runningCashFlow')?.data).toEqual([
      { period: '2026-01', net: '374.50', runningBalance: '374.50' },
      { period: '2026-02', net: '-25.00', runningBalance: '349.50' },
    ]);
  });

  it('returns a tag multi-count warning and paginated drill-down rows', () => {
    const query = normalizeReportQuery({ reportType: 'tag', startDate: '2026-01-01', endDate: '2026-01-31', pageSize: '1' });
    const rows = [
      row({
        id: 'tagged',
        tags: [
          { id: 'tag-home', name: 'Home', color: '#111111' },
          { id: 'tag-food', name: 'Food', color: '#222222' },
        ],
      }),
      row({ id: 'second', description: 'Second', signedAmountDecimal: new Decimal('-10.00'), amountDecimal: new Decimal('10.00') }),
    ];

    const report = buildOverviewReport({ query, rows });
    const drilldown = buildReportDrilldown({ query, rows, params: { tagId: 'tag-home' } });

    expect(report.metadata.warnings).toContain('Tag totals may exceed total spending because one transaction can have multiple tags.');
    expect(drilldown.total).toBe(1);
    expect(drilldown.items).toEqual([expect.objectContaining({ id: 'tagged', amountDecimal: '-100.00' })]);
  });

  it('builds a category report with split-level totals and combined filters', () => {
    const query = normalizeReportQuery({
      reportType: 'category',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      accountIds: 'acct-checking',
      tagIds: 'tag-home',
      merchantIds: 'merchant-market',
    });
    const report = buildCategoryReport({
      query,
      rows: [
        row({
          id: 'split',
          isSplit: true,
          tags: [{ id: 'tag-home', name: 'Home', color: null }],
          splits: [
            { id: 'split-food', amountDecimal: new Decimal('40.00'), category: category() },
            { id: 'split-home', amountDecimal: new Decimal('60.00'), category: category({ id: 'cat-home', name: 'Home' }) },
          ],
        }),
        row({ id: 'filtered-account', account: { id: 'acct-other', name: 'Other', type: 'bank', excludeFromReports: false, excludeFromNetWorth: false, isHidden: false, isDeleted: false } }),
      ],
    });

    expect(report.reportType).toBe('category');
    expect(report.tables.find((table) => table.key === 'categoryTotals')?.rows).toEqual([
      expect.objectContaining({ id: 'cat-home', spending: '60.00', groupName: 'Living' }),
      expect.objectContaining({ id: 'cat-food', spending: '40.00', groupName: 'Living' }),
    ]);
    expect(report.tables.find((table) => table.key === 'categoryGroups')?.rows).toEqual([
      expect.objectContaining({ id: 'group-living', spending: '100.00' }),
    ]);
  });

  it('drills into split category totals with a matched split amount', () => {
    const query = normalizeReportQuery({ reportType: 'category', startDate: '2026-01-01', endDate: '2026-01-31' });
    const drilldown = buildReportDrilldown({
      query,
      params: { categoryId: 'cat-home' },
      rows: [
        row({
          id: 'split',
          isSplit: true,
          category: category({ groupId: null, groupName: null }),
          splits: [
            { id: 'split-food', amountDecimal: new Decimal('40.00'), category: category({ groupId: null, groupName: null }) },
            { id: 'split-home', amountDecimal: new Decimal('60.00'), category: category({ id: 'cat-home', name: 'Home', groupId: null, groupName: null }) },
          ],
        }),
      ],
    });

    expect(drilldown.total).toBe(1);
    expect(drilldown.items[0]).toMatchObject({
      id: 'split',
      amountDecimal: '-100.00',
      matchedAmountDecimal: '-60.00',
    });
  });

  it('builds budget utilization from existing budget limits', () => {
    const query = normalizeReportQuery({ reportType: 'budget', startDate: '2026-01-01', endDate: '2026-01-31' });
    const report = buildBudgetReport({
      query,
      rows: [row({ signedAmountDecimal: new Decimal('-80.00'), amountDecimal: new Decimal('80.00') })],
      budgets: [
        {
          id: 'budget-food',
          name: 'Food Budget',
          categoryId: 'cat-food',
          categoryName: 'Food',
          limitAmount: new Decimal('100.00'),
          spentAmount: new Decimal('80.00'),
          rolloverAmount: new Decimal('10.00'),
          periodKey: '2026-01',
        },
      ],
    });

    expect(report.summaryCards.find((card) => card.key === 'budgetedAmount')?.value).toBe('100.00');
    expect(report.tables.find((table) => table.key === 'budgetUtilization')?.rows).toEqual([
      expect.objectContaining({
        id: 'budget-food',
        budgeted: '100.00',
        actualSpent: '80.00',
        remaining: '30.00',
        utilizationPercent: 80,
      }),
    ]);
    expect(report.metadata.calculationNotes).toContain('Budget report uses existing BudgetLimit values when provided.');
  });

  it('builds tag, account, and merchant reports with expected warnings and totals', () => {
    const taggedRows = [
      row({
        id: 'multi-tag',
        tags: [
          { id: 'tag-home', name: 'Home', color: '#111111' },
          { id: 'tag-food', name: 'Food', color: '#222222' },
        ],
      }),
      row({
        id: 'income',
        transactionType: 'deposit',
        signedAmountDecimal: new Decimal('250.00'),
        amountDecimal: new Decimal('250.00'),
        merchant: { id: 'merchant-payroll', name: 'Payroll' },
      }),
    ];

    const tagReport = buildTagReport({ query: normalizeReportQuery({ reportType: 'tag', startDate: '2026-01-01', endDate: '2026-01-31' }), rows: taggedRows });
    const accountReport = buildAccountReport({ query: normalizeReportQuery({ reportType: 'account', startDate: '2026-01-01', endDate: '2026-01-31' }), rows: taggedRows });
    const merchantReport = buildMerchantReport({ query: normalizeReportQuery({ reportType: 'merchant', startDate: '2026-01-01', endDate: '2026-01-31' }), rows: taggedRows });

    expect(tagReport.metadata.warnings).toContain('Tag totals may exceed total spending because one transaction can have multiple tags.');
    expect(tagReport.tables.find((table) => table.key === 'tagTotals')?.rows).toEqual([
      expect.objectContaining({ id: 'tag-food', spending: '100.00' }),
      expect.objectContaining({ id: 'tag-home', spending: '100.00' }),
    ]);
    expect(accountReport.tables.find((table) => table.key === 'accountMovement')?.rows[0]).toMatchObject({
      id: 'acct-checking',
      inflow: '250.00',
      outflow: '100.00',
      netChange: '150.00',
    });
    expect(merchantReport.tables.find((table) => table.key === 'merchantTotals')?.rows).toEqual([
      expect.objectContaining({ id: 'merchant-market', spending: '100.00' }),
    ]);
  });

  it('builds an actionable audit and data quality report', () => {
    const report = buildAuditDataQualityReport({
      query: normalizeReportQuery({ reportType: 'audit', startDate: '2026-01-01', endDate: '2026-01-31', includeHidden: 'true', includeDeleted: 'true', includePending: 'true' }),
      rows: [
        row({ id: 'uncategorized', category: null, merchant: null, tags: [], reconciled: false }),
        row({ id: 'pending-old', isPending: true, date: new Date('2025-12-01T00:00:00.000Z') }),
        row({ id: 'hidden', isHidden: true }),
        row({ id: 'deleted', isDeleted: true }),
        row({ id: 'large', amountDecimal: new Decimal('5000.00'), signedAmountDecimal: new Decimal('-5000.00') }),
      ],
      audit: {
        dismissedDuplicateCount: 2,
        importIssueCount: 1,
        ruleFailureCount: 3,
        accountsExcludedFromReports: 1,
        categoriesExcludedFromReports: 1,
      },
    });

    expect(report.reportType).toBe('audit');
    expect(report.summaryCards.find((card) => card.key === 'totalIssues')?.value).toBe('21');
    expect(report.tables.find((table) => table.key === 'auditIssues')?.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ issueType: 'uncategorized_transactions', count: 1, drilldownAction: 'categoryId=__uncategorized__' }),
      expect.objectContaining({ issueType: 'rule_execution_failures', count: 3, severity: 'warning' }),
    ]));
    expect(report.drilldowns).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'audit-uncategorized_transactions' }),
    ]));
  });

  it('builds net worth from snapshots and current wealth inputs', () => {
    const report = buildNetWorthReport({
      query: normalizeReportQuery({ reportType: 'net_worth', startDate: '2026-01-01', endDate: '2026-01-31', currencyCode: 'CAD' }),
      rows: [],
      wealth: {
        cashValue: new Decimal('1000.00'),
        investmentValue: new Decimal('2500.00'),
        manualAssetValue: new Decimal('750.00'),
        manualLiabilityValue: new Decimal('300.00'),
        accountContributions: [
          { id: 'acct-checking', name: 'Checking', value: new Decimal('1000.00') },
        ],
        snapshots: [
          { date: '2026-01-01', assets: new Decimal('4000.00'), liabilities: new Decimal('500.00'), netWorth: new Decimal('3500.00') },
          { date: '2026-01-31', assets: new Decimal('4250.00'), liabilities: new Decimal('300.00'), netWorth: new Decimal('3950.00') },
        ],
      },
    });

    expect(report.summaryCards.find((card) => card.key === 'totalAssets')?.value).toBe('4250.00');
    expect(report.summaryCards.find((card) => card.key === 'totalLiabilities')?.value).toBe('300.00');
    expect(report.summaryCards.find((card) => card.key === 'netWorth')?.value).toBe('3950.00');
    expect(report.charts.find((chart) => chart.key === 'netWorthTrend')?.data).toEqual([
      { date: '2026-01-01', assets: '4000.00', liabilities: '500.00', netWorth: '3500.00' },
      { date: '2026-01-31', assets: '4250.00', liabilities: '300.00', netWorth: '3950.00' },
    ]);
  });

  it('returns a safe investment placeholder with holdings and dividend summaries', () => {
    const report = buildInvestmentReport({
      query: normalizeReportQuery({ reportType: 'investment', startDate: '2026-01-01', endDate: '2026-01-31' }),
      rows: [],
      investments: {
        holdings: [
          { id: 'holding-1', accountId: 'acct-invest', accountName: 'Investing', symbol: 'ABC', name: 'ABC Fund', shares: new Decimal('10'), currentValue: new Decimal('1200.00'), costBasis: new Decimal('1000.00'), assetClass: 'equity' },
        ],
        dividendTotal: new Decimal('25.00'),
        recurringInvestmentCount: 2,
      },
    });

    expect(report.summaryCards.find((card) => card.key === 'currentValue')?.value).toBe('1200.00');
    expect(report.summaryCards.find((card) => card.key === 'unrealizedGainLoss')?.value).toBe('200.00');
    expect(report.metadata.warnings).toContain('Investment performance excludes TWR/MWR return calculations until portfolio cash-flow timing is audited.');
    expect(report.tables.find((table) => table.key === 'holdings')?.rows).toEqual([
      expect.objectContaining({ id: 'holding-1', currentValue: '1200.00', costBasis: '1000.00', unrealizedGainLoss: '200.00' }),
    ]);
  });

  it('emits a donut spec whose slice values are all non-negative', () => {
    const report = buildOverviewReport({
      query: normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31' }),
      rows: [
        row({ id: 'income', transactionType: 'deposit', signedAmountDecimal: new Decimal('1000.00'), amountDecimal: new Decimal('1000.00') }),
        row({ id: 'expense', signedAmountDecimal: new Decimal('-200.25'), amountDecimal: new Decimal('200.25') }),
      ],
    });

    const chart = report.charts.find((item) => item.key === 'spendingByCategory');
    expect(chart?.kind).toBe('donut');
    expect(chart && 'data' in chart ? chart.data : []).not.toHaveLength(0);
    if (chart && 'valueKey' in chart) {
      for (const dataRow of chart.data) {
        expect(Number(dataRow[chart.valueKey])).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('marks stacked series with a shared stack group', () => {
    const query = normalizeReportQuery({ reportType: 'cash_flow', startDate: '2026-01-01', endDate: '2026-01-31' });
    const report = buildCashFlowReport({
      query,
      rows: [
        row({ id: 'income', transactionType: 'deposit', signedAmountDecimal: new Decimal('500.00'), amountDecimal: new Decimal('500.00') }),
        row({ id: 'expense', signedAmountDecimal: new Decimal('-100.00'), amountDecimal: new Decimal('100.00') }),
      ],
    });

    const chart = report.charts.find((item) => item.key === 'cashFlowByPeriod');
    expect(chart && 'series' in chart ? chart.series.map((series) => series.stack) : []).toEqual(['flow', 'flow']);
  });

  it('keeps net worth composition free of negative slices', () => {
    const report = buildNetWorthReport({
      query: normalizeReportQuery({ reportType: 'net_worth', startDate: '2026-01-01', endDate: '2026-01-31', currencyCode: 'CAD' }),
      rows: [],
      wealth: {
        cashValue: new Decimal('1000.00'),
        investmentValue: new Decimal('2500.00'),
        manualAssetValue: new Decimal('750.00'),
        manualLiabilityValue: new Decimal('300.00'),
        accountContributions: [],
        snapshots: [],
      },
    });

    const chart = report.charts.find((item) => item.key === 'netWorthComposition');
    expect(chart?.kind).toBe('donut');
    const data = chart && 'data' in chart ? chart.data : [];
    expect(data).toEqual([
      { name: 'Cash', value: '1000.00' },
      { name: 'Investments', value: '2500.00' },
      { name: 'Manual Assets', value: '750.00' },
    ]);
    for (const dataRow of data) {
      expect(Number(dataRow.value)).toBeGreaterThanOrEqual(0);
    }
    expect(data.some((dataRow) => dataRow.name === 'Manual Liabilities')).toBe(false);
  });

  it('emits a chart for the audit and investment reports', () => {
    const auditReport = buildAuditDataQualityReport({
      query: normalizeReportQuery({ reportType: 'audit', startDate: '2026-01-01', endDate: '2026-01-31' }),
      rows: [row({ id: 'uncategorized', category: null, merchant: null, tags: [], reconciled: false })],
    });
    const investmentReport = buildInvestmentReport({
      query: normalizeReportQuery({ reportType: 'investment', startDate: '2026-01-01', endDate: '2026-01-31' }),
      rows: [],
      investments: {
        holdings: [
          { id: 'holding-1', accountId: 'acct-invest', accountName: 'Investing', symbol: 'ABC', name: 'ABC Fund', shares: new Decimal('10'), currentValue: new Decimal('1200.00'), costBasis: new Decimal('1000.00'), realizedGainLoss: new Decimal('0'), assetClass: 'equity' },
        ],
        dividendTotal: new Decimal('25.00'),
        recurringInvestmentCount: 2,
      },
    });

    expect(auditReport.charts.length).toBeGreaterThan(0);
    expect(investmentReport.charts.length).toBeGreaterThan(0);
  });

  it('applies an inclusive amount range', () => {
    const query = normalizeReportQuery({
      reportType: 'overview',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      minAmount: '100',
      maxAmount: '500',
    });
    const report = buildOverviewReport({
      query,
      rows: [
        row({ id: 'low', amountDecimal: new Decimal('50.00'), signedAmountDecimal: new Decimal('-50.00') }),
        row({ id: 'mid', amountDecimal: new Decimal('100.00'), signedAmountDecimal: new Decimal('-100.00') }),
        row({ id: 'high', amountDecimal: new Decimal('500.00'), signedAmountDecimal: new Decimal('-500.00') }),
      ],
    });

    const total = report.tables.find((table) => table.key === 'topSpendingCategories')?.rows.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    expect(total).toBe(2);
  });

  it('rejects an inverted amount range', () => {
    expect(() =>
      normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31', minAmount: '500', maxAmount: '100' }),
    ).toThrow();
  });

  it('rejects a negative amount bound', () => {
    expect(() =>
      normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31', minAmount: '-1' }),
    ).toThrow();
  });

  it('matches search text against description and merchant name', () => {
    const query = normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31', searchText: 'insurance' });
    const report = buildOverviewReport({
      query,
      rows: [
        row({ id: 'desc-match', description: 'Car Insurance Payment', merchant: { id: 'merchant-market', name: 'Market' } }),
        row({ id: 'merchant-match', description: 'Monthly Bill', merchant: { id: 'merchant-insurance', name: 'Insurance Co' } }),
        row({ id: 'no-match', description: 'Groceries', merchant: { id: 'merchant-market', name: 'Market' } }),
      ],
    });

    const total = report.tables.find((table) => table.key === 'topSpendingCategories')?.rows.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    expect(total).toBe(2);
  });

  it('keeps only rows with no Category on the Transaction or its Splits', () => {
    const query = normalizeReportQuery({ reportType: 'category', startDate: '2026-01-01', endDate: '2026-01-31', onlyUncategorized: 'true' });
    const report = buildCategoryReport({
      query,
      rows: [
        row({ id: 'categorized', category: category() }),
        row({
          id: 'split-categorized',
          category: null,
          isSplit: true,
          splits: [{ id: 'split-a', amountDecimal: new Decimal('100.00'), category: category({ id: 'cat-home', name: 'Home', groupId: null, groupName: null }) }],
        }),
        row({ id: 'uncategorized', category: null }),
      ],
    });

    expect(report.tables.find((table) => table.key === 'categoryTotals')?.rows).toEqual([
      expect.objectContaining({ id: '__uncategorized__', count: 1 }),
    ]);
  });

  it('filters by reconciliation state', () => {
    const rows = [
      row({ id: 'reconciled', reconciled: true }),
      row({ id: 'unreconciled', reconciled: false }),
    ];

    const reconciledQuery = normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31', reconciledState: 'reconciled' });
    const unreconciledQuery = normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31', reconciledState: 'unreconciled' });
    const anyQuery = normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31' });

    const reconciledTotal = buildOverviewReport({ query: reconciledQuery, rows }).tables
      .find((table) => table.key === 'topSpendingCategories')?.rows.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    const unreconciledTotal = buildOverviewReport({ query: unreconciledQuery, rows }).tables
      .find((table) => table.key === 'topSpendingCategories')?.rows.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
    const anyTotal = buildOverviewReport({ query: anyQuery, rows }).tables
      .find((table) => table.key === 'topSpendingCategories')?.rows.reduce((sum, item) => sum + Number(item.count ?? 0), 0);

    expect(reconciledTotal).toBe(1);
    expect(unreconciledTotal).toBe(1);
    expect(anyTotal).toBe(2);
  });

  it('defaults every new predicate to inert', () => {
    const query = normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31' });

    expect(query.minAmount).toBeUndefined();
    expect(query.maxAmount).toBeUndefined();
    expect(query.searchText).toBeUndefined();
    expect(query.onlyUncategorized).toBe(false);
    expect(query.reconciledState).toBe('any');
  });

  it('warns when a predicate narrows the result set', () => {
    const query = normalizeReportQuery({ reportType: 'overview', startDate: '2026-01-01', endDate: '2026-01-31', searchText: 'insurance' });
    const report = buildOverviewReport({ query, rows: [row({ id: 'no-match', description: 'Groceries' })] });

    expect(report.metadata.warnings).toContain('Results are limited to rows matching "insurance".');
  });

  it('emits a savings rate trend on the cash flow report and never divides by zero income', () => {
    const query = normalizeReportQuery({ reportType: 'cash_flow', startDate: '2026-01-01', endDate: '2026-02-28', groupBy: 'month' });
    const report = buildCashFlowReport({
      query,
      rows: [
        row({ id: 'jan-income', date: new Date('2026-01-05T00:00:00.000Z'), transactionType: 'deposit', amountDecimal: new Decimal('1000.00'), signedAmountDecimal: new Decimal('1000.00') }),
        row({ id: 'jan-spend', date: new Date('2026-01-10T00:00:00.000Z'), amountDecimal: new Decimal('600.00'), signedAmountDecimal: new Decimal('-600.00') }),
        row({ id: 'feb-spend', date: new Date('2026-02-10T00:00:00.000Z'), amountDecimal: new Decimal('250.00'), signedAmountDecimal: new Decimal('-250.00') }),
      ],
    });

    const chart = report.charts.find((item) => item.key === 'savingsRateTrend');
    expect(chart).toBeDefined();
    expect(chart?.kind).toBe('line');
    const data = (chart as { data: Array<Record<string, unknown>> }).data;
    expect(data[0]).toMatchObject({ period: '2026-01', savingsRate: 40 });
    const zeroIncomePeriod = data.find((item) => item.period === '2026-02');
    expect(zeroIncomePeriod?.savingsRate).toBe(0);
    expect(Number.isFinite(Number(zeroIncomePeriod?.savingsRate))).toBe(true);
    expect(report.summaryCards.find((item) => item.key === 'savingsRate')?.formattedValue).toBe('15.0%');
  });

  it('produces one benchmark comparison row per benchmark key with a zero variance on an exact match', () => {
    const query = normalizeReportQuery({ reportType: 'benchmarks', startDate: '2026-01-01', endDate: '2026-01-31', groupBy: 'month' });
    const report = buildBenchmarksReport({
      query,
      rows: [
        row({
          id: 'rent',
          amountDecimal: new Decimal('2025.00'),
          signedAmountDecimal: new Decimal('-2025.00'),
          category: category({ id: 'cat-rent', name: 'Rent', groupId: null, groupName: null }),
        }),
      ],
    });

    const table = report.tables.find((item) => item.key === 'benchmarkComparison');
    expect(table?.rows).toHaveLength(10);
    expect(table?.rows.find((item) => item.key === 'housing')).toMatchObject({ yours: '2025.00', benchmark: '2025.00', variance: '0.00' });
    expect(table?.rows.find((item) => item.key === 'food')).toMatchObject({ yours: '0.00', variance: '-770.00' });
    expect(report.charts.map((item) => item.key)).toEqual(['benchmarkComparison', 'benchmarkVariance']);
    expect(report.metadata.warnings.some((item) => item.includes('Bureau of Labor Statistics'))).toBe(true);
  });

  it('accepts the benchmarks report type and still rejects an unknown one', () => {
    expect(normalizeReportQuery({ reportType: 'benchmarks', startDate: '2026-01-01', endDate: '2026-01-31' }).reportType).toBe('benchmarks');
    expect(() => normalizeReportQuery({ reportType: 'nonsense', startDate: '2026-01-01', endDate: '2026-01-31' })).toThrow('reportType is not supported');
  });

  const wealthQuery = (reportType: string) =>
    normalizeReportQuery({ reportType, startDate: '2026-01-01', endDate: '2026-01-31', currencyCode: 'CAD' });

  const allocationContext = {
    totalValue: new Decimal('10000.00'),
    byAssetClass: [
      { assetClass: 'US Stocks', value: new Decimal('6000.00'), percent: new Decimal('60'), targetPercent: new Decimal('50') },
      { assetClass: 'Bonds', value: new Decimal('4000.00'), percent: new Decimal('40'), targetPercent: new Decimal('30') },
    ],
  };

  const contributionRoomContext = {
    accounts: [
      { id: 'tax-1', name: 'TFSA', type: 'TFSA', memberName: 'Ada', contributionsYtd: new Decimal('5000.00'), totalRoomEver: new Decimal('88000.00'), roomRemaining: new Decimal('83000.00'), overContribution: new Decimal('0'), pctUsed: 6, alert: 'ok' as const },
      { id: 'tax-2', name: 'RRSP', type: 'RRSP', memberName: null, contributionsYtd: new Decimal('2000.00'), totalRoomEver: new Decimal('32490.00'), roomRemaining: new Decimal('30490.00'), overContribution: new Decimal('0'), pctUsed: 6, alert: 'ok' as const },
    ],
  };

  const dividendForecastContext = {
    years: 5,
    forecast: [
      { year: 2026, income: new Decimal('120.00') },
      { year: 2027, income: new Decimal('120.00') },
    ],
    byHolding: [
      { symbol: 'ABC', name: 'ABC Fund', annualIncome: new Decimal('80.00') },
      { symbol: 'XYZ', name: 'XYZ Fund', annualIncome: new Decimal('40.00') },
    ],
    basedOn: '2 holdings, live prices + dividend yields',
  };

  const retirementContext = {
    portfolioValue: new Decimal('100000.00'),
    projectionYears: 30,
    scenarios: [
      { label: 'Conservative', returnRate: 0.05, endingBalance: new Decimal('432194.24') },
      { label: 'Base case', returnRate: 0.07, endingBalance: new Decimal('761225.50') },
    ],
    note: 'Deterministic projections.',
  };

  it('builds an allocation and drift report from an investment allocation context', () => {
    const report = buildAllocationReport({ query: wealthQuery('allocation'), rows: [], allocation: allocationContext });

    expect(report.summaryCards.length).toBeGreaterThan(0);
    expect(report.charts.length).toBeGreaterThan(0);
    expect(report.summaryCards.find((item) => item.key === 'totalValue')?.value).toBe('10000.00');
    const drift = report.charts.find((chart) => chart.key === 'allocationDrift');
    expect(drift?.kind).toBe('bar');
    expect(drift && 'reference' in drift ? drift.reference : undefined).toEqual({ value: 0, label: 'On target' });
    expect(drift && 'data' in drift ? drift.data : []).toEqual([
      { assetClass: 'US Stocks', drift: 10 },
      { assetClass: 'Bonds', drift: 10 },
    ]);
  });

  it('builds a contribution room report with stacked contributed and remaining series', () => {
    const report = buildContributionRoomReport({ query: wealthQuery('contribution_room'), rows: [], contributionRoom: contributionRoomContext });

    expect(report.summaryCards.find((item) => item.key === 'totalRoom')?.value).toBe('120490.00');
    expect(report.summaryCards.find((item) => item.key === 'totalContributed')?.value).toBe('7000.00');
    expect(report.summaryCards.find((item) => item.key === 'totalRemaining')?.value).toBe('113490.00');
    const chart = report.charts.find((item) => item.key === 'contributionRoomByType');
    expect(chart && 'series' in chart ? chart.series.map((series) => series.stack) : []).toEqual(['room', 'room']);
    expect(report.tables.find((table) => table.key === 'contributionRoom')?.rows).toHaveLength(2);
  });

  it('builds a dividend forecast report over the default five-year horizon', () => {
    const report = buildDividendForecastReport({ query: wealthQuery('dividend_forecast'), rows: [], dividendForecast: dividendForecastContext });

    expect(report.summaryCards.find((item) => item.key === 'firstYearIncome')?.value).toBe('120.00');
    expect(report.summaryCards.find((item) => item.key === 'horizonIncome')?.value).toBe('240.00');
    expect(report.charts.map((chart) => chart.key)).toEqual(['dividendByYear', 'dividendByHolding']);
    expect(report.metadata.calculationNotes).toContain('2 holdings, live prices + dividend yields');
    expect(report.metadata.calculationNotes).toContain('The forecast horizon is fixed at 5 years and is not derived from the report date range.');
  });

  it('builds a retirement simulation report with one line series per scenario', () => {
    const report = buildRetirementReport({ query: wealthQuery('retirement'), rows: [], retirement: retirementContext });

    expect(report.summaryCards.find((item) => item.key === 'portfolioValue')?.value).toBe('100000.00');
    const chart = report.charts.find((item) => item.key === 'retirementProjection');
    expect(chart?.kind).toBe('line');
    expect(chart && 'series' in chart ? chart.series.map((series) => series.label) : []).toEqual(['Conservative', 'Base case']);
    expect(chart && 'series' in chart ? chart.series.every((series) => series.format === 'currency') : false).toBe(true);
    // 30 projection years plus year zero.
    expect(chart && 'data' in chart ? chart.data.length : 0).toBe(31);
    expect(chart && 'data' in chart ? chart.data[0] : {}).toEqual({ year: '0', conservative: '100000.00', base_case: '100000.00' });
  });

  it('returns wealth-backed reports without throwing when the context is missing', () => {
    const reports = [
      buildAllocationReport({ query: wealthQuery('allocation'), rows: [] }),
      buildContributionRoomReport({ query: wealthQuery('contribution_room'), rows: [] }),
      buildDividendForecastReport({ query: wealthQuery('dividend_forecast'), rows: [] }),
      buildRetirementReport({ query: wealthQuery('retirement'), rows: [] }),
    ];

    for (const report of reports) {
      expect(report.metadata.warnings.length).toBeGreaterThan(0);
      expect(report.charts.length).toBeGreaterThan(0);
    }
  });

  it('warns that inapplicable filters were ignored on wealth-backed reports', () => {
    const filtered = normalizeReportQuery({ reportType: 'allocation', startDate: '2026-01-01', endDate: '2026-01-31', categoryIds: 'cat-food' });
    const report = buildAllocationReport({ query: filtered, rows: [], allocation: allocationContext });

    expect(report.metadata.warnings).toContain('Some active filters do not apply to this report and were ignored.');
    expect(report.metadata.calculationNotes).toContain('This report reads Account and investment holding data. Category, tag, merchant, amount and search filters do not apply to it.');
    expect(buildAllocationReport({ query: wealthQuery('allocation'), rows: [], allocation: allocationContext }).metadata.warnings)
      .not.toContain('Some active filters do not apply to this report and were ignored.');
  });

  it('keeps wealth-backed partition charts free of negative slices', () => {
    const reports = [
      buildAllocationReport({ query: wealthQuery('allocation'), rows: [], allocation: allocationContext }),
      buildDividendForecastReport({ query: wealthQuery('dividend_forecast'), rows: [], dividendForecast: dividendForecastContext }),
      buildContributionRoomReport({ query: wealthQuery('contribution_room'), rows: [], contributionRoom: contributionRoomContext }),
      buildRetirementReport({ query: wealthQuery('retirement'), rows: [], retirement: retirementContext }),
    ];

    for (const report of reports) {
      for (const chart of report.charts) {
        if (!('valueKey' in chart)) continue;
        for (const dataRow of chart.data) {
          expect(Number(dataRow[chart.valueKey])).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('adds the assets and liabilities breakdown to the net worth report', () => {
    const report = buildNetWorthReport({
      query: wealthQuery('net_worth'),
      rows: [],
      wealth: {
        cashValue: new Decimal('1000.00'),
        investmentValue: new Decimal('2500.00'),
        manualAssetValue: new Decimal('750.00'),
        manualLiabilityValue: new Decimal('300.00'),
        accountContributions: [],
        snapshots: [],
        liabilityBreakdown: [
          { key: 'mortgage', label: 'Mortgage', value: new Decimal('200.00') },
          { key: 'creditCard', label: 'Credit cards', value: new Decimal('100.00') },
          { key: 'other', label: 'Other liabilities', value: new Decimal('0') },
        ],
      },
    });

    expect(report.tables.find((table) => table.key === 'assetBreakdown')?.rows).toEqual([
      expect.objectContaining({ id: 'cash', label: 'Cash & bank', value: '1000.00' }),
      expect.objectContaining({ id: 'investments', label: 'Investments', value: '2500.00' }),
      expect.objectContaining({ id: 'manualAssets', label: 'Other assets', value: '750.00' }),
    ]);
    expect(report.tables.find((table) => table.key === 'liabilityBreakdown')?.rows).toHaveLength(3);
    const chart = report.charts.find((item) => item.key === 'assetsVsLiabilities');
    expect(chart?.kind).toBe('groupedBar');
    expect(chart && 'data' in chart ? chart.data : []).toHaveLength(6);
  });

  const prismaCategory = (overrides: Record<string, unknown> = {}) => ({
    id: 'cat-food',
    name: 'Food',
    groupId: 'group-living',
    excludeFromReports: false,
    bucketType: 'needs',
    isTaxDeductible: true,
    group: { id: 'group-living', name: 'Living' },
    ...overrides,
  });

  const fakePrisma = (journals: unknown[]) =>
    ({
      transactionJournal: { findMany: async () => journals },
    }) as unknown as Parameters<typeof fetchStandardReportRows>[1];

  const prismaJournal = (overrides: Record<string, unknown> = {}) => ({
    id: 'journal-1',
    date: new Date('2026-01-10T00:00:00.000Z'),
    description: 'Grocer',
    transactionType: 'withdrawal',
    amountDecimal: new Decimal('100.00'),
    currencyCode: 'CAD',
    isPending: false,
    isHidden: false,
    isDeleted: false,
    isSplit: false,
    isReconciled: false,
    category: prismaCategory(),
    merchant: { id: 'merchant-market', displayName: 'Market' },
    entries: [
      {
        accountId: 'acct-checking',
        amountDecimal: new Decimal('-100.00'),
        account: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false, excludeFromNetWorth: false, isHidden: false, isDeleted: false },
      },
    ],
    tags: [],
    transactionTags: [],
    splits: [],
    ...overrides,
  });

  it('carries bucketType and isTaxDeductible onto both the journal Category and a split Category', async () => {
    const rows = await fetchStandardReportRows(
      { householdId: 'hh-1', startDate: '2026-01-01', endDate: '2026-01-31' },
      fakePrisma([
        prismaJournal({
          isSplit: true,
          splits: [
            {
              id: 'split-savings',
              amountDecimal: new Decimal('100.00'),
              category: prismaCategory({ id: 'cat-rrsp', name: 'RRSP', bucketType: 'savings', isTaxDeductible: false }),
            },
          ],
        }),
      ]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].category).toMatchObject({ id: 'cat-food', bucketType: 'needs', isTaxDeductible: true });
    expect(rows[0].splits[0].category).toMatchObject({ id: 'cat-rrsp', bucketType: 'savings', isTaxDeductible: false });
  });

  it('surfaces the schema defaults as values rather than undefined', async () => {
    const rows = await fetchStandardReportRows(
      { householdId: 'hh-1', startDate: '2026-01-01', endDate: '2026-01-31' },
      fakePrisma([
        prismaJournal({
          isSplit: true,
          category: prismaCategory({ bucketType: 'wants', isTaxDeductible: false }),
          splits: [
            {
              id: 'split-default',
              amountDecimal: new Decimal('100.00'),
              category: prismaCategory({ id: 'cat-home', name: 'Home', bucketType: 'wants', isTaxDeductible: false }),
            },
          ],
        }),
      ]),
    );

    expect(rows[0].category?.bucketType).toBe('wants');
    expect(rows[0].category?.isTaxDeductible).toBe(false);
    expect(rows[0].category?.bucketType).not.toBeUndefined();
    expect(rows[0].category?.isTaxDeductible).not.toBeUndefined();
    expect(rows[0].splits[0].category?.bucketType).toBe('wants');
    expect(rows[0].splits[0].category?.isTaxDeductible).toBe(false);
  });
});
