import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { toCSV, setCsvHeaders } from '../lib/csvExport';
import { buildReportOverview } from '../lib/reportOverview';
import { buildDiagnosticsSummary } from '../lib/reportDiagnostics';
import { summarizeNetWorth, summarizePortfolio } from '../lib/reporting';
import {
  buildJournalAuditReport,
  buildJournalCashflowReport,
  buildJournalGroupedReport,
  buildJournalReportCatalog,
  buildJournalReportDrilldown,
  buildJournalReportFilters,
  buildJournalTagSummary,
  buildJournalTaxSummary,
  fetchJournalReportRows,
  type JournalReportGroupBy,
  type JournalReportMode,
} from '../lib/journalReportingCore';

const router = Router();
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BLS_BENCHMARKS: Record<string, { label: string; monthlyAvg: number; pctOfIncome: number }> = {
  housing: { label: 'Housing', monthlyAvg: 2025, pctOfIncome: 33.0 },
  transportation: { label: 'Transportation', monthlyAvg: 985, pctOfIncome: 16.1 },
  food: { label: 'Food', monthlyAvg: 770, pctOfIncome: 12.6 },
  healthcare: { label: 'Healthcare', monthlyAvg: 470, pctOfIncome: 7.7 },
  entertainment: { label: 'Entertainment', monthlyAvg: 270, pctOfIncome: 4.4 },
  personal: { label: 'Personal Care', monthlyAvg: 75, pctOfIncome: 1.2 },
  education: { label: 'Education', monthlyAvg: 115, pctOfIncome: 1.9 },
  clothing: { label: 'Clothing', monthlyAvg: 130, pctOfIncome: 2.1 },
  utilities: { label: 'Utilities', monthlyAvg: 370, pctOfIncome: 6.0 },
  misc: { label: 'Miscellaneous', monthlyAvg: 175, pctOfIncome: 2.9 },
};

const CATEGORY_MAP: [RegExp, string][] = [
  [/hous|rent|mortg/i, 'housing'],
  [/transport|auto|car|gas|fuel|parking|uber|lyft|rideshare/i, 'transportation'],
  [/food|grocer|restaur|dining|fast.?food|coffee|cafe/i, 'food'],
  [/health|medical|pharma|drug|dental|vision|doctor/i, 'healthcare'],
  [/entertain|netflix|spotify|hulu|subscri|stream|movie|theater/i, 'entertainment'],
  [/personal|hair|salon|gym|fitness/i, 'personal'],
  [/educat|tuition|school|book/i, 'education'],
  [/cloth|apparel|fashion/i, 'clothing'],
  [/util|electric|water|internet|phone|cable/i, 'utilities'],
];

function mapCategory(name: string): string {
  for (const [re, key] of CATEGORY_MAP) {
    if (re.test(name)) return key;
  }
  return 'misc';
}

// ─── GET /api/v1/reports/overview ────────────────────────────────────────────

router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [accounts, holdings, journalRows] = await Promise.all([
      prisma.account.findMany({
        where: { householdId, isHidden: false, excludeFromReports: false },
        select: { id: true, type: true, balance: true, excludeFromNetWorth: true, excludeFromReports: true },
      }),
      prisma.investmentHolding.findMany({
        where: {
          account: { householdId, isHidden: false, type: 'investment' },
        },
        select: { currentPrice: true, shares: true },
      }),
      fetchJournalReportRows({ householdId, start: monthStart, end: monthEnd }),
    ]);

    const cashFlowEvents = journalRows.map((row) => ({
      amount: row.signedAmount,
      type:
        row.transactionType === 'transfer'
          ? 'transfer'
          : row.signedAmount < 0 && (row.reportAccount?.type === 'investment' || row.category?.type === 'investment')
            ? 'investment_buy'
            : row.signedAmount >= 0
              ? 'income'
              : 'expense',
      isTransfer: row.transactionType === 'transfer',
    }));

    const diagnosticsInput = {
      unmatchedTransferGroupIds: [],
      holdingsWithMissingPrices: holdings.filter((h) => h.currentPrice == null).length,
      duplicateTransactions: buildJournalAuditReport(journalRows).unbalancedJournals,
    };

    const overview = buildReportOverview({
      accounts,
      holdings,
      cashFlowEvents,
      diagnostics: diagnosticsInput,
    });
    const diagnostics = buildDiagnosticsSummary(diagnosticsInput);
    const netWorth = summarizeNetWorth(accounts);
    const portfolio = summarizePortfolio(holdings);

    return res.json({
      cashFlow: {
        income: overview.income,
        expense: overview.expense,
        transferTotal: overview.transferTotal,
        savingsRate: overview.currentMonthSavingsRate,
      },
      netWorth: { total: netWorth.netWorth },
      investments: { portfolioValue: portfolio.portfolioValue },
      taxes: { realizedGains: 0, taxDrag: 0 },
      goals: { savingsRate: overview.currentMonthSavingsRate },
      diagnostics: {
        unmatchedTransfers: diagnostics.unmatchedTransfers,
        missingPrices: diagnostics.missingPrices,
        duplicateTransactions: diagnostics.duplicateTransactions,
      },
    });
  } catch (err) {
    req.log.error({ err }, 'reports/overview');
    return res.status(500).json({ error: 'Failed to fetch report overview' });
  }
});

function parseDateRange(startDate: unknown, endDate: unknown): { start: Date; end: Date } | null {
  if (typeof startDate !== 'string' || typeof endDate !== 'string') return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  return { start, end };
}

function parseCsvList(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function getJournalDateRange(req: AuthRequest) {
  return parseDateRange(req.query.startDate ?? req.query.start ?? req.query.from, req.query.endDate ?? req.query.end ?? req.query.to);
}

async function loadJournalRowsForRequest(req: AuthRequest, range?: { start: Date; end: Date }) {
  return fetchJournalReportRows({
    householdId: req.householdId!,
    start: range?.start,
    end: range?.end,
  });
}

router.get('/catalog', async (_req: AuthRequest, res: Response) => {
  return res.json({ reports: buildJournalReportCatalog() });
});

router.get('/audit', async (req: AuthRequest, res: Response) => {
  try {
    const range = getJournalDateRange(req);
    const rows = await loadJournalRowsForRequest(req, range ?? undefined);
    return res.json(buildJournalAuditReport(rows));
  } catch (err) {
    req.log.error({ err }, 'reports/audit');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleJournalGroupedReport(req: AuthRequest, res: Response, mode: JournalReportMode) {
  const groupBy = (req.query.groupBy ?? 'category') as JournalReportGroupBy;
  if (!['category', 'merchant', 'account', 'tag'].includes(groupBy)) {
    return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
  }

  const range = parseDateRange(req.query.startDate, req.query.endDate);
  if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });

  const rows = await loadJournalRowsForRequest(req, range);
  return res.json(buildJournalGroupedReport(rows, {
    ...range,
    ...buildJournalReportFilters(req.query as Record<string, unknown>),
    mode,
    groupBy,
  }));
}

async function handleJournalCompareReport(req: AuthRequest, res: Response, mode: JournalReportMode) {
  const groupBy = (req.query.groupBy ?? 'category') as JournalReportGroupBy;
  if (!['category', 'merchant', 'account', 'tag'].includes(groupBy)) {
    return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
  }
  const range = parseDateRange(req.query.startDate, req.query.endDate);
  if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });

  const durationMs = range.end.getTime() - range.start.getTime() + 86400000;
  const priorEnd = new Date(range.start.getTime() - 86400000);
  const priorStart = new Date(priorEnd.getTime() - durationMs + 86400000);
  const filters = buildJournalReportFilters(req.query as Record<string, unknown>);
  const rows = await fetchJournalReportRows({ householdId: req.householdId!, start: priorStart, end: range.end });
  const current = buildJournalGroupedReport(rows, { ...range, ...filters, mode, groupBy });
  const prior = buildJournalGroupedReport(rows, { start: priorStart, end: priorEnd, ...filters, mode, groupBy });
  const priorById = new Map(prior.items.map((item) => [item.id, item]));
  const allIds = new Set([...current.items.map((item) => item.id), ...prior.items.map((item) => item.id)]);
  const items = Array.from(allIds).map((id) => {
    const cur = current.items.find((item) => item.id === id);
    const old = priorById.get(id);
    const currentAmount = cur?.amount ?? 0;
    const priorAmount = old?.amount ?? 0;
    const delta = Math.round((currentAmount - priorAmount) * 100) / 100;
    return {
      id,
      name: cur?.name ?? old?.name ?? id,
      icon: cur?.icon ?? old?.icon ?? null,
      current: currentAmount,
      prior: priorAmount,
      delta,
      deltaPercent: priorAmount !== 0 ? Math.round((delta / priorAmount) * 10000) / 100 : 0,
    };
  }).sort((a, b) => b.current - a.current);

  return res.json({
    items,
    currentTotal: current.total,
    priorTotal: prior.total,
    totalDelta: Math.round((current.total - prior.total) * 100) / 100,
  });
}

async function handleJournalMonthlyReport(req: AuthRequest, res: Response, mode: JournalReportMode) {
  const groupBy = (req.query.groupBy ?? 'category') as JournalReportGroupBy;
  if (!['category', 'merchant', 'account', 'tag'].includes(groupBy)) {
    return res.status(400).json({ error: 'groupBy must be one of: category, merchant, account, tag' });
  }
  const range = parseDateRange(req.query.startDate, req.query.endDate);
  if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
  const rows = await loadJournalRowsForRequest(req, range);
  const filters = buildJournalReportFilters(req.query as Record<string, unknown>);
  const months: string[] = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  while (cursor <= range.end) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const series = new Map<string, { id: string; name: string; icon: string | null; data: number[] }>();
  for (const month of months) {
    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0, 23, 59, 59, 999);
    const report = buildJournalGroupedReport(rows, { start: monthStart, end: monthEnd, ...filters, mode, groupBy });
    report.items.forEach((item) => {
      const existing = series.get(item.id) ?? { id: item.id, name: item.name, icon: item.icon, data: months.map(() => 0) };
      existing.data[months.indexOf(month)] = item.amount;
      series.set(item.id, existing);
    });
  }
  return res.json({
    months: months.map((month) => {
      const [year, monthNum] = month.split('-').map(Number);
      return `${MONTH_ABBR[monthNum - 1]} ${year}`;
    }),
    series: Array.from(series.values()).sort((a, b) => b.data.reduce((s, v) => s + v, 0) - a.data.reduce((s, v) => s + v, 0)),
  });
}

router.get('/spending', async (req: AuthRequest, res: Response) => {
  try {
    return await handleJournalGroupedReport(req, res, 'spending');
  } catch (err) {
    req.log.error({ err }, 'reports/spending journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/income', async (req: AuthRequest, res: Response) => {
  try {
    return await handleJournalGroupedReport(req, res, 'income');
  } catch (err) {
    req.log.error({ err }, 'reports/income journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/cashflow', async (req: AuthRequest, res: Response) => {
  try {
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    const rows = await loadJournalRowsForRequest(req, range);
    return res.json(buildJournalCashflowReport(rows, {
      ...range,
      ...buildJournalReportFilters(req.query as Record<string, unknown>),
    }));
  } catch (err) {
    req.log.error({ err }, 'reports/cashflow journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/spending/compare', async (req: AuthRequest, res: Response) => {
  try {
    return await handleJournalCompareReport(req, res, 'spending');
  } catch (err) {
    req.log.error({ err }, 'reports/spending/compare journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/income/compare', async (req: AuthRequest, res: Response) => {
  try {
    return await handleJournalCompareReport(req, res, 'income');
  } catch (err) {
    req.log.error({ err }, 'reports/income/compare journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/spending/monthly', async (req: AuthRequest, res: Response) => {
  try {
    return await handleJournalMonthlyReport(req, res, 'spending');
  } catch (err) {
    req.log.error({ err }, 'reports/spending/monthly journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/income/monthly', async (req: AuthRequest, res: Response) => {
  try {
    return await handleJournalMonthlyReport(req, res, 'income');
  } catch (err) {
    req.log.error({ err }, 'reports/income/monthly journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/trends', async (req: AuthRequest, res: Response) => {
  try {
    const range = getJournalDateRange(req);
    if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    const rows = await loadJournalRowsForRequest(req, range);
    const cashflow = buildJournalCashflowReport(rows, {
      ...range,
      ...buildJournalReportFilters(req.query as Record<string, unknown>),
    });
    return res.json({ trends: cashflow.byMonth, monthly: cashflow.monthly });
  } catch (err) {
    req.log.error({ err }, 'reports/trends journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/benchmarks', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const startDate = (req.query.startDate as string) || new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
    const endDate = (req.query.endDate as string) || now.toISOString().slice(0, 10);
    const range = parseDateRange(startDate, endDate);
    if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    const months = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / (30 * 24 * 3600 * 1000)));
    const rows = await loadJournalRowsForRequest(req, range);
    const spending = buildJournalGroupedReport(rows, {
      ...range,
      mode: 'spending',
      groupBy: 'category',
      ...buildJournalReportFilters(req.query as Record<string, unknown>),
    });
    const actuals: Record<string, number> = {};
    for (const item of spending.items) {
      const key = mapCategory(item.name);
      actuals[key] = (actuals[key] ?? 0) + item.amount;
    }
    return res.json({
      startDate,
      endDate,
      months,
      categories: Object.entries(BLS_BENCHMARKS).map(([key, bls]) => ({
        key,
        label: bls.label,
        blsMonthlyAvg: bls.monthlyAvg,
        blsPctOfIncome: bls.pctOfIncome,
        actualTotal: Math.round((actuals[key] ?? 0) * 100) / 100,
        actualMonthlyAvg: Math.round(((actuals[key] ?? 0) / months) * 100) / 100,
      })),
    });
  } catch (err) {
    req.log.error({ err }, 'reports/benchmarks journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/drill', async (req: AuthRequest, res: Response) => {
  try {
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    const groupBy = (req.query.groupBy ?? 'category') as JournalReportGroupBy;
    const mode = (req.query.mode ?? 'spending') as JournalReportMode;
    const groupId = req.query.groupId as string | undefined;
    if (!groupId) return res.status(400).json({ error: 'groupId is required' });
    if (!['spending', 'income'].includes(mode)) return res.status(400).json({ error: 'mode must be spending or income' });
    if (!['category', 'merchant', 'account', 'tag'].includes(groupBy)) {
      return res.status(400).json({ error: 'groupBy must be category, merchant, account, or tag' });
    }
    const rows = await loadJournalRowsForRequest(req, range);
    return res.json(buildJournalReportDrilldown(rows, {
      ...range,
      ...buildJournalReportFilters(req.query as Record<string, unknown>),
      mode,
      groupBy,
      groupId,
    }));
  } catch (err) {
    req.log.error({ err }, 'reports/drill journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tags', async (req: AuthRequest, res: Response) => {
  try {
    const range = getJournalDateRange(req);
    if (!range) return res.json([]);
    const rows = await loadJournalRowsForRequest(req, range);
    return res.json(buildJournalTagSummary(rows, {
      ...range,
      ...buildJournalReportFilters(req.query as Record<string, unknown>),
    }));
  } catch (err) {
    req.log.error({ err }, 'reports/tags journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/tax-summary', async (req: AuthRequest, res: Response) => {
  try {
    const yearParam = req.query.year;
    const year = yearParam ? parseInt(yearParam as string, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'year must be a valid 4-digit year' });
    }
    const rows = await loadJournalRowsForRequest(req, {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
    });
    return res.json(buildJournalTaxSummary(rows, year, buildJournalReportFilters(req.query as Record<string, unknown>)));
  } catch (err) {
    req.log.error({ err }, 'reports/tax-summary journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/budget-variance', async (req: AuthRequest, res: Response) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ error: 'from and to query params are required (ISO format)' });
    const [budgets, rows] = await Promise.all([
      prisma.budget.findMany({
        where: { householdId: req.householdId! },
        include: { category: { select: { id: true, name: true, icon: true } } },
      }),
      loadJournalRowsForRequest(req, range),
    ]);
    const spending = buildJournalGroupedReport(rows, {
      ...range,
      mode: 'spending',
      groupBy: 'category',
      ...buildJournalReportFilters(req.query as Record<string, unknown>),
    });
    const spendingMap = new Map(spending.items.map((item) => [item.id, item]));
    const budgetMap = new Map(budgets.filter((budget) => budget.categoryId).map((budget) => [budget.categoryId!, budget]));
    const allCategoryIds = new Set([...budgetMap.keys(), ...spendingMap.keys()]);
    const categories = Array.from(allCategoryIds).map((categoryId) => {
      const budget = budgetMap.get(categoryId);
      const actual = spendingMap.get(categoryId);
      const budgeted = Math.round((budget?.amount ?? 0) * 100) / 100;
      const actualAmount = actual?.amount ?? 0;
      const variance = Math.round((budgeted - actualAmount) * 100) / 100;
      return {
        categoryId,
        name: budget?.category?.name ?? actual?.name ?? 'Uncategorized',
        icon: budget?.category?.icon ?? actual?.icon ?? null,
        budgeted,
        actual: actualAmount,
        variance,
        variancePct: budgeted !== 0 ? Math.round((variance / budgeted) * 10000) / 100 : 0,
      };
    }).sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual));
    return res.json({
      categories,
      totals: {
        budgeted: Math.round(categories.reduce((sum, item) => sum + item.budgeted, 0) * 100) / 100,
        actual: Math.round(categories.reduce((sum, item) => sum + item.actual, 0) * 100) / 100,
        variance: Math.round(categories.reduce((sum, item) => sum + item.variance, 0) * 100) / 100,
      },
    });
  } catch (err) {
    req.log.error({ err }, 'reports/budget-variance journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/no-category', async (req: AuthRequest, res: Response) => {
  try {
    const range = getJournalDateRange(req);
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
    const cursor = req.query.cursor as string | undefined;
    const rows = await loadJournalRowsForRequest(req, range ?? undefined);
    const filtered = rows
      .filter((row) => !row.category && row.transactionType !== 'transfer')
      .filter((row) => !parseCsvList(req.query.excludeAccountIds).includes(row.reportAccount?.id ?? ''))
      .sort((a, b) => b.date.getTime() - a.date.getTime() || b.id.localeCompare(a.id));
    const startIndex = cursor ? Math.max(0, filtered.findIndex((row) => row.id === cursor) + 1) : 0;
    const page = filtered.slice(startIndex, startIndex + limit + 1);
    const hasMore = page.length > limit;
    const items = hasMore ? page.slice(0, limit) : page;
    return res.json({
      items: items.map((row) => ({
        id: row.id,
        date: row.date,
        description: row.description,
        amount: row.signedAmount,
        account: { name: row.reportAccount?.name ?? 'Unknown' },
        merchant: { displayName: row.description },
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
      total: filtered.length,
    });
  } catch (err) {
    req.log.error({ err }, 'reports/no-category journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/export/csv', async (req: AuthRequest, res: Response) => {
  try {
    const { type } = req.query as Record<string, string | undefined>;
    if (!type || !['spending', 'income', 'cashflow'].includes(type)) {
      return res.status(400).json({ error: 'type must be one of: spending, income, cashflow' });
    }
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    if (!range) return res.status(400).json({ error: 'startDate and endDate are required (ISO format)' });
    const rows = await loadJournalRowsForRequest(req, range);
    const filename = `report-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    setCsvHeaders(res, filename);
    if (type === 'cashflow') {
      const cashflow = buildJournalCashflowReport(rows, {
        ...range,
        ...buildJournalReportFilters(req.query as Record<string, unknown>),
      });
      return res.send(toCSV(cashflow.byMonth.map((item) => ({
        month: `${item.year}-${String(item.month).padStart(2, '0')}`,
        income: item.income,
        expenses: item.expenses,
        net: item.net,
      })), [
        { key: 'month', header: 'Month' },
        { key: 'income', header: 'Income' },
        { key: 'expenses', header: 'Expenses' },
        { key: 'net', header: 'Net' },
      ]));
    }
    const grouped = buildJournalGroupedReport(rows, {
      ...range,
      ...buildJournalReportFilters(req.query as Record<string, unknown>),
      mode: type as JournalReportMode,
      groupBy: 'category',
    });
    return res.send(toCSV(grouped.items.map((item) => ({
      category: item.name,
      amount: item.amount,
      percentage: item.percent,
    })), [
      { key: 'category', header: 'Category' },
      { key: 'amount', header: 'Amount' },
      { key: 'percentage', header: 'Percentage' },
    ]));
  } catch (err) {
    req.log.error({ err }, 'reports/export/csv journal');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Saved Reports ────────────────────────────────────────────────────────────

const SavedReportSchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
  filters: z.object({
    tab: z.enum([
      'overview',
      'cashflow',
      'savings',
      'spending',
      'income',
      'forecast',
      'tax',
      'variance',
      'benchmarks',
      'networth',
      'assetsliabilities',
      'investmentperformance',
      'allocationdrift',
      'contributionroom',
      'dividendforecast',
      'retirementsimulation',
    ]).optional(),
    datePreset: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    excludeCategoryIds: z.array(z.string()).optional(),
    excludeAccountIds: z.array(z.string()).optional(),
  }),
});

// GET /api/v1/reports/saved
router.get('/saved', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const saved = await prisma.savedReport.findMany({
      where: { householdId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(saved);
  } catch (err) {
    req.log.error({ err }, 'reports/saved GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/reports/saved
router.post('/saved', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parsed = SavedReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const { name, filters } = parsed.data;
    const saved = await prisma.savedReport.create({
      data: { householdId, name, filters },
    });
    return res.status(201).json(saved);
  } catch (err) {
    req.log.error({ err }, 'reports/saved POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/reports/saved/:id
router.delete('/saved/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const existing = await prisma.savedReport.findFirst({ where: { id, householdId } });
    if (!existing) return res.status(404).json({ error: 'Saved report not found' });
    await prisma.savedReport.delete({ where: { id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'reports/saved DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});


export default router;
