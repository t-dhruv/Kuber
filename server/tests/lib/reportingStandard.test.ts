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
  normalizeReportQuery,
  type StandardReportRow,
} from '../../src/lib/reporting/standard';

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
  category: { id: 'cat-food', name: 'Food', groupId: 'group-living', groupName: 'Living', excludeFromReports: false },
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
            { id: 'split-food', amountDecimal: new Decimal('40.00'), category: { id: 'cat-food', name: 'Food', groupId: null, groupName: null, excludeFromReports: false } },
            { id: 'split-home', amountDecimal: new Decimal('60.00'), category: { id: 'cat-home', name: 'Home', groupId: null, groupName: null, excludeFromReports: false } },
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
            { id: 'split-food', amountDecimal: new Decimal('40.00'), category: { id: 'cat-food', name: 'Food', groupId: 'group-living', groupName: 'Living', excludeFromReports: false } },
            { id: 'split-home', amountDecimal: new Decimal('60.00'), category: { id: 'cat-home', name: 'Home', groupId: 'group-living', groupName: 'Living', excludeFromReports: false } },
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
          category: { id: 'cat-food', name: 'Food', groupId: null, groupName: null, excludeFromReports: false },
          splits: [
            { id: 'split-food', amountDecimal: new Decimal('40.00'), category: { id: 'cat-food', name: 'Food', groupId: null, groupName: null, excludeFromReports: false } },
            { id: 'split-home', amountDecimal: new Decimal('60.00'), category: { id: 'cat-home', name: 'Home', groupId: null, groupName: null, excludeFromReports: false } },
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
        row({ id: 'categorized', category: { id: 'cat-food', name: 'Food', groupId: 'group-living', groupName: 'Living', excludeFromReports: false } }),
        row({
          id: 'split-categorized',
          category: null,
          isSplit: true,
          splits: [{ id: 'split-a', amountDecimal: new Decimal('100.00'), category: { id: 'cat-home', name: 'Home', groupId: null, groupName: null, excludeFromReports: false } }],
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
          category: { id: 'cat-rent', name: 'Rent', groupId: null, groupName: null, excludeFromReports: false },
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
});
