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
});
