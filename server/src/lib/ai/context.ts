import type { PrismaClient } from '@prisma/client';

// ─── Chat Context (full financial snapshot, ~2000 token budget) ──────────────

export interface ChatContext {
  householdName: string;
  currency: string;
  accounts: Array<{ name: string; type: string; balance: number }>;
  netWorth: number;
  currentMonth: {
    income: number;
    expenses: number;
    savingsRate: number;
    topCategories: Array<{ name: string; spent: number; budget?: number }>;
  };
  budgets: Array<{ category: string; budgeted: number; spent: number; remaining: number }>;
  goals: Array<{ name: string; target: number; current: number; progressPct: number; targetDate?: string }>;
  investments: {
    totalValue: number;
    totalCostBasis: number;
    gainLoss: number;
    gainLossPct: number;
    allocation: Array<{ assetClass: string; value: number; pct: number }>;
  };
  recentTransactions: Array<{ date: string; description: string; amount: number; category?: string }>;
}

export async function getChatContext(prisma: PrismaClient, householdId: string): Promise<ChatContext> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [household, accounts, transactions, budgets, goals, holdings, latestTransactions] = await Promise.all([
    prisma.household.findUnique({ where: { id: householdId } }),
    prisma.account.findMany({ where: { householdId, isHidden: false } }),
    prisma.transaction.findMany({
      where: { householdId, date: { gte: monthStart, lte: monthEnd } },
      include: { category: true },
    }),
    prisma.budget.findMany({
      where: { householdId },
      include: { category: true },
    }),
    prisma.goal.findMany({ where: { householdId } }),
    prisma.investmentHolding.findMany({ where: { account: { householdId } } }),
    prisma.transaction.findMany({
      where: { householdId, isHidden: false },
      orderBy: { date: 'desc' },
      take: 10,
      include: { category: true },
    }),
  ]);

  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);

  // Current month income/expenses
  let income = 0; let expenses = 0;
  const categorySpend = new Map<string, { name: string; spent: number }>();
  for (const tx of transactions) {
    if (tx.amount > 0) income += tx.amount;
    else expenses += Math.abs(tx.amount);
    if (tx.category && tx.amount < 0) {
      const prev = categorySpend.get(tx.categoryId!) ?? { name: tx.category.name, spent: 0 };
      categorySpend.set(tx.categoryId!, { name: prev.name, spent: prev.spent + Math.abs(tx.amount) });
    }
  }

  const topCategories = [...categorySpend.values()]
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 8)
    .map(c => {
      const budget = budgets.find(b => b.category?.name === c.name);
      return { name: c.name, spent: Math.round(c.spent * 100) / 100, budget: budget?.amount };
    });

  const budgetRows = budgets.slice(0, 15).map(b => {
    const spent = (b.categoryId ? categorySpend.get(b.categoryId)?.spent : undefined) ?? 0;
    return {
      category: b.category?.name ?? b.categoryId ?? b.name ?? 'Uncategorized',
      budgeted: b.amount,
      spent:    Math.round(spent * 100) / 100,
      remaining: Math.round((b.amount - spent) * 100) / 100,
    };
  });

  const goalRows = goals.map(g => ({
    name:        g.name,
    target:      g.targetAmount,
    current:     g.currentAmount,
    progressPct: g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0,
    targetDate:  g.targetDate?.toISOString().split('T')[0],
  }));

  // Investment summary
  const allocationMap = new Map<string, number>();
  let totalValue = 0; let totalCostBasis = 0;
  for (const h of holdings) {
    const value = h.shares * h.currentPrice;
    totalValue     += value;
    totalCostBasis += h.shares * h.costBasis;
    allocationMap.set(h.assetClass, (allocationMap.get(h.assetClass) ?? 0) + value);
  }
  const allocation = [...allocationMap.entries()].map(([assetClass, value]) => ({
    assetClass,
    value: Math.round(value * 100) / 100,
    pct:   totalValue > 0 ? Math.round((value / totalValue) * 100) : 0,
  }));

  const recentTransactions = latestTransactions.map(t => ({
    date: t.date.toISOString().split('T')[0],
    description: t.description,
    amount: Math.round(t.amount * 100) / 100,
    category: t.category?.name,
  }));

  return {
    householdName: household?.name ?? 'Household',
    currency: household?.currency ?? 'CAD',
    accounts: accounts.map(a => ({ name: a.name, type: a.type, balance: a.balance })),
    netWorth: Math.round(netWorth * 100) / 100,
    currentMonth: {
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      savingsRate: income > 0 ? Math.round(((income - expenses) / income) * 100) : 0,
      topCategories,
    },
    budgets: budgetRows,
    goals: goalRows,
    investments: {
      totalValue:    Math.round(totalValue * 100) / 100,
      totalCostBasis: Math.round(totalCostBasis * 100) / 100,
      gainLoss:      Math.round((totalValue - totalCostBasis) * 100) / 100,
      gainLossPct:   totalCostBasis > 0
        ? Math.round(((totalValue - totalCostBasis) / totalCostBasis) * 100 * 100) / 100
        : 0,
      allocation,
    },
    recentTransactions,
  };
}

// ─── Spending Context (N months of category aggregates) ──────────────────────

export interface MonthlySpend {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  categories: Array<{ name: string; amount: number }>;
}

export async function getSpendingContext(
  prisma: PrismaClient,
  householdId: string,
  months = 3,
): Promise<MonthlySpend[]> {
  const results: MonthlySpend[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const txns  = await prisma.transaction.findMany({
      where: { householdId, date: { gte: start, lte: end }, isHidden: false },
      include: { category: true },
    });
    const catMap = new Map<string, number>();
    let income = 0; let expenses = 0;
    for (const tx of txns) {
      if (tx.amount > 0) income += tx.amount;
      else {
        expenses += Math.abs(tx.amount);
        if (tx.category) {
          catMap.set(tx.category.name, (catMap.get(tx.category.name) ?? 0) + Math.abs(tx.amount));
        }
      }
    }
    results.push({
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      totalIncome: Math.round(income * 100) / 100,
      totalExpenses: Math.round(expenses * 100) / 100,
      categories: [...catMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })),
    });
  }

  return results;
}

// ─── Categorize Context (just the category list) ─────────────────────────────

export interface CategoryEntry { id: string; name: string; emoji?: string | null; type: string }

export async function getCategorizeContext(
  prisma: PrismaClient,
  householdId: string,
): Promise<CategoryEntry[]> {
  const cats = await prisma.category.findMany({
    where: { householdId },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  return cats.map(c => ({ id: c.id, name: c.name, emoji: c.icon, type: c.type }));
}

// ─── Investment Context ───────────────────────────────────────────────────────

export interface HoldingSummary {
  symbol: string;
  name: string;
  shares: number;
  currentPrice: number;
  costBasis: number;
  value: number;
  gainLoss: number;
  gainLossPct: number;
  assetClass: string;
  allocationPct: number;
}

export async function getInvestmentContext(
  prisma: PrismaClient,
  householdId: string,
): Promise<{ holdings: HoldingSummary[]; totalValue: number; currency: string }> {
  const holdings = await prisma.investmentHolding.findMany({
    where: { account: { householdId } },
    include: { account: true },
  });

  const totalValue = holdings.reduce((s, h) => s + h.shares * h.currentPrice, 0);
  const currency   = holdings[0]?.account?.currency ?? 'CAD';

  return {
    totalValue: Math.round(totalValue * 100) / 100,
    currency,
    holdings: holdings.map(h => {
      const value    = h.shares * h.currentPrice;
      const cost     = h.shares * h.costBasis;
      const gainLoss = value - cost;
      return {
        symbol:       h.symbol,
        name:         h.name,
        shares:       h.shares,
        currentPrice: h.currentPrice,
        costBasis:    h.costBasis,
        value:        Math.round(value * 100) / 100,
        gainLoss:     Math.round(gainLoss * 100) / 100,
        gainLossPct:  cost > 0 ? Math.round((gainLoss / cost) * 100 * 100) / 100 : 0,
        assetClass:   h.assetClass,
        allocationPct: totalValue > 0 ? Math.round((value / totalValue) * 100 * 10) / 10 : 0,
      };
    }),
  };
}

// ─── Budget Recommendation Context ───────────────────────────────────────────

export async function getBudgetContext(
  prisma: PrismaClient,
  householdId: string,
) {
  const spending  = await getSpendingContext(prisma, householdId, 4);
  const budgets   = await prisma.budget.findMany({
    where: { householdId },
    include: { category: true },
  });
  return {
    monthlySpending: spending,
    currentBudgets: budgets.map(b => ({
      categoryId: b.categoryId,
      category:   b.category?.name ?? b.categoryId ?? b.name ?? 'Uncategorized',
      amount:     b.amount,
    })),
  };
}
