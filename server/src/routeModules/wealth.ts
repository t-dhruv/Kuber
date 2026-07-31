import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getAiClientForHousehold } from '../lib/ai';
import type { AiMessage } from '../lib/ai/types';
import {
  computeTargets,
  bucketTransactions,
  buildBucket,
  buildAlerts,
  computeSavingsCapacity,
} from '../lib/wealthAnalysis';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function getMonthRange(monthParam?: string): { start: Date; end: Date; month: string } {
  let year: number;
  let monthIdx: number; // 0-indexed

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split('-').map(Number);
    year = y;
    monthIdx = m - 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    monthIdx = now.getMonth();
  }

  const start = new Date(year, monthIdx, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
  const month = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;

  return { start, end, month };
}

// ─── Auto-detect income from previous calendar month ─────────────────────────

async function detectPrevMonthIncome(householdId: string): Promise<number | null> {
  const now = new Date();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const incomeTxns = await prisma.transactionJournal.findMany({
    where: {
      householdId,
      date: { gte: prevMonthStart, lte: prevMonthEnd },
      transactionType: 'deposit',
      isHidden: false,
      isDeleted: false,
    },
    select: { amountDecimal: true },
  });

  if (incomeTxns.length === 0) return null;
  return incomeTxns.reduce((sum, t) => sum + Number(t.amountDecimal), 0);
}

// ─── GET /api/v1/wealth/income ────────────────────────────────────────────────

router.get('/income', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const householdId = req.householdId!;

    const [incomePref, updatedAtPref] = await Promise.all([
      prisma.userPreference.findUnique({
        where: { userId_key: { userId, key: 'wealth_monthly_income' } },
      }),
      prisma.userPreference.findUnique({
        where: { userId_key: { userId, key: 'wealth_income_updated_at' } },
      }),
    ]);

    if (incomePref) {
      return res.json({
        monthlyNetIncome: parseFloat(incomePref.value),
        updatedAt: updatedAtPref?.value ?? null,
        autoDetected: false,
      });
    }

    // No manual override — auto-detect from previous month's income transactions
    const detected = await detectPrevMonthIncome(householdId);
    return res.json({
      monthlyNetIncome: detected,
      updatedAt: null,
      autoDetected: detected !== null,
    });
  } catch (err) {
    req.log.error({ err }, 'wealth/income GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PUT /api/v1/wealth/income ────────────────────────────────────────────────

const incomeSchema = z.object({
  monthlyNetIncome: z.number().positive(),
});

router.put('/income', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const parsed = incomeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    const { monthlyNetIncome } = parsed.data;
    const now = new Date().toISOString();

    await Promise.all([
      prisma.userPreference.upsert({
        where: { userId_key: { userId, key: 'wealth_monthly_income' } },
        update: { value: String(monthlyNetIncome) },
        create: { userId, key: 'wealth_monthly_income', value: String(monthlyNetIncome) },
      }),
      prisma.userPreference.upsert({
        where: { userId_key: { userId, key: 'wealth_income_updated_at' } },
        update: { value: now },
        create: { userId, key: 'wealth_income_updated_at', value: now },
      }),
    ]);

    return res.json({ monthlyNetIncome, updatedAt: now });
  } catch (err) {
    req.log.error({ err }, 'wealth/income PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/v1/wealth/category-buckets ─────────────────────────────────────

router.get('/category-buckets', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const categories = await prisma.category.findMany({
      where: { householdId },
      select: { id: true, name: true, icon: true, bucketType: true },
      orderBy: [{ bucketType: 'asc' }, { name: 'asc' }],
    });
    return res.json(categories);
  } catch (err) {
    req.log.error({ err }, 'category-buckets GET error');
    return res.status(500).json({ error: 'Failed to fetch category buckets' });
  }
});

// ─── PUT /api/v1/wealth/category-buckets ─────────────────────────────────────

const updateBucketSchema = z.object({
  categoryId: z.string().min(1),
  bucketType: z.enum(['needs', 'wants', 'savings']),
});

router.put('/category-buckets', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parsed = updateBucketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }
    const { categoryId, bucketType } = parsed.data;

    // Ensure the category belongs to this household
    const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId } });
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: { bucketType },
      select: { id: true, name: true, icon: true, bucketType: true },
    });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, 'category-buckets PUT error');
    return res.status(500).json({ error: 'Failed to update bucket' });
  }
});

// ─── POST /api/v1/wealth/category-buckets/reset ──────────────────────────────

const BUCKET_DEFAULTS: Record<string, 'needs' | 'wants' | 'savings'> = {
  // Needs
  Housing: 'needs', Rent: 'needs', Mortgage: 'needs', Utilities: 'needs',
  Groceries: 'needs', Healthcare: 'needs', Insurance: 'needs', Transportation: 'needs',
  'Phone/Internet': 'needs', Childcare: 'needs', Education: 'needs', Subscriptions: 'needs',
  // Wants
  Dining: 'wants', 'Dining Out': 'wants', Entertainment: 'wants', Shopping: 'wants',
  Travel: 'wants', Hobbies: 'wants', 'Personal Care': 'wants', Gifts: 'wants',
  Clothing: 'wants', 'Streaming Services': 'wants',
  // Savings
  Savings: 'savings', Investments: 'savings', 'Emergency Fund': 'savings',
  Retirement: 'savings', 'Debt Repayment': 'savings',
};

router.post('/category-buckets/reset', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const categories = await prisma.category.findMany({
      where: { householdId },
      select: { id: true, name: true },
    });

    const updates = categories.map((c) => {
      const bucketType = BUCKET_DEFAULTS[c.name] ?? 'wants';
      return prisma.category.update({ where: { id: c.id }, data: { bucketType } });
    });
    await Promise.all(updates);

    return res.json({ message: 'Buckets reset to defaults' });
  } catch (err) {
    req.log.error({ err }, 'category-buckets reset error');
    return res.status(500).json({ error: 'Failed to reset buckets' });
  }
});

// ─── GET /api/v1/wealth/analysis ─────────────────────────────────────────────

router.get('/analysis', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const householdId = req.householdId!;

    // 1. Get income — manual override takes priority, else auto-detect from prev month
    const incomePref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: 'wealth_monthly_income' } },
    });
    const income = incomePref
      ? parseFloat(incomePref.value)
      : await detectPrevMonthIncome(householdId);

    // 2. Date range
    const { start, end, month } = getMonthRange(req.query.month as string | undefined);

    // 3. Fetch spending transactions with category bucketType
    const transactions = await prisma.transactionJournal.findMany({
      where: {
        householdId,
        date: { gte: start, lte: end },
        transactionType: 'withdrawal',
        isHidden: false,
        isDeleted: false,
      },
      include: {
        category: {
          select: { id: true, name: true, icon: true, bucketType: true },
        },
      },
    });

    // 4. Sum per bucket and accumulate category totals
    const { bucketTotals, catMap } = bucketTransactions(transactions.map(t => ({
      amount: Number(t.amountDecimal),
      transactionType: t.transactionType,
      categoryId: t.categoryId,
      category: t.category,
    })));

    // 5. Compute targets (0 if no income set)
    const targets = computeTargets(income);

    // 6. Build per-bucket data
    const buckets = {
      needs: buildBucket('needs', targets.needs, bucketTotals, catMap),
      wants: buildBucket('wants', targets.wants, bucketTotals, catMap),
      savings: buildBucket('savings', targets.savings, bucketTotals, catMap),
      uncategorized: buildBucket('uncategorized', 0, bucketTotals, catMap),
    };

    // 7. Build alerts
    const alerts = buildAlerts(income, buckets);

    // 8. Savings capacity
    const savingsCapacity = computeSavingsCapacity(income, bucketTotals);

    // 9. Investment ladder — check goals for context
    const goals = await prisma.goal.findMany({
      where: { householdId },
      select: { id: true, name: true, type: true, targetAmount: true, currentAmount: true },
    });

    const emergencyGoal = goals.find(
      (g) => g.type?.toLowerCase() === 'emergency' || g.name.toLowerCase().includes('emergency'),
    );
    const debtGoals = goals.filter(
      (g) => g.type?.toLowerCase() === 'debt' || g.name.toLowerCase().includes('debt'),
    );

    type LadderStatus = 'complete' | 'inprogress' | 'todo';

    function getGoalStatus(
      goal: { targetAmount: number; currentAmount: number } | undefined,
    ): LadderStatus {
      if (!goal) return 'todo';
      if (goal.currentAmount >= goal.targetAmount) return 'complete';
      return 'inprogress';
    }

    const emergencyStatus = getGoalStatus(emergencyGoal);
    const debtStatus: LadderStatus =
      debtGoals.length === 0
        ? 'todo'
        : debtGoals.every((g) => g.currentAmount >= g.targetAmount)
          ? 'complete'
          : 'inprogress';

    const investmentLadder: Array<{
      step: number;
      label: string;
      description: string;
      status: LadderStatus;
      amount?: number;
    }> = [
      {
        step: 1,
        label: 'Emergency Fund',
        description: 'Build 3–6 months of essential expenses in a liquid savings account.',
        status: emergencyStatus,
        amount: emergencyGoal?.currentAmount,
      },
      {
        step: 2,
        label: 'High-Interest Debt',
        description: 'Pay off high-interest debt (credit cards, payday loans) before investing.',
        status: debtStatus,
      },
      {
        step: 3,
        label: 'Registered / Tax-Advantaged Accounts',
        description:
          'Max out tax-sheltered accounts (TFSA, RRSP, 401k, IRA) to reduce your tax burden.',
        status: 'todo',
      },
      {
        step: 4,
        label: 'Index Fund Investing',
        description:
          'Invest in low-cost broad market index funds for long-term wealth building.',
        status: 'todo',
      },
      {
        step: 5,
        label: 'Real Estate & Alternatives',
        description:
          'Consider real estate, REITs, or other alternative assets for further diversification.',
        status: 'todo',
      },
    ];

    return res.json({
      income,
      month,
      targets,
      actuals: {
        needs: buckets.needs.total,
        wants: buckets.wants.total,
        savings: buckets.savings.total,
      },
      buckets,
      alerts,
      savingsCapacity,
      investmentLadder,
    });
  } catch (err) {
    req.log.error({ err }, 'analysis GET error');
    return res.status(500).json({ error: 'Failed to fetch wealth analysis' });
  }
});

// ─── POST /api/v1/wealth/ai-analysis ─────────────────────────────────────────

router.post('/ai-analysis', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    // 1. Check cache (< 24 hours)
    const existing = await prisma.wealthAiCache.findUnique({ where: { householdId } });
    const cacheAge = existing
      ? Date.now() - new Date(existing.generatedAt).getTime()
      : Infinity;
    const forceRefresh = req.body?.refresh === true;

    if (existing && cacheAge < 24 * 60 * 60 * 1000 && !forceRefresh) {
      return res.json({
        configured: true,
        analysis: existing.analysis,
        generatedAt: existing.generatedAt.toISOString(),
        cached: true,
      });
    }

    // 2. Check AI configured
    let client;
    try {
      client = await getAiClientForHousehold(householdId, prisma);
    } catch {
      return res.json({
        configured: false,
        message: 'Configure an AI provider in Settings to get personalized wealth coaching.',
      });
    }

    // 3. Get income + current month spending
    const userId = req.userId!;
    const incomePref = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: 'wealth_monthly_income' } },
    });
    const income = incomePref ? parseFloat(incomePref.value) : 0;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [transactions, categories] = await Promise.all([
      prisma.transactionJournal.findMany({
        where: { householdId, date: { gte: monthStart, lte: monthEnd }, transactionType: 'withdrawal', isHidden: false, isDeleted: false },
        include: { category: { select: { id: true, name: true, bucketType: true } } },
      }),
      prisma.category.findMany({
        where: { householdId },
        select: { id: true, name: true, bucketType: true },
      }),
    ]);

    // suppress unused var warning
    void categories;

    const bucketTotals: Record<string, number> = { needs: 0, wants: 0, savings: 0, uncategorized: 0 };
    const bucketCategories: Record<string, Map<string, number>> = {
      needs: new Map(), wants: new Map(), savings: new Map(), uncategorized: new Map(),
    };

    for (const tx of transactions) {
      const bucket = tx.category?.bucketType ?? 'uncategorized';
      const catName = tx.category?.name ?? 'Uncategorized';
      const amt = Math.abs(Number(tx.amountDecimal));
      bucketTotals[bucket] = (bucketTotals[bucket] ?? 0) + amt;
      const map = bucketCategories[bucket]!;
      map.set(catName, (map.get(catName) ?? 0) + amt);
    }

    const targets = { needs: 0.5, wants: 0.3, savings: 0.2 };
    const bucketsResult = (['needs', 'wants', 'savings'] as const).map((b) => {
      const actual = bucketTotals[b] ?? 0;
      const target = income > 0 ? income * targets[b] : 0;
      const topCats = [...(bucketCategories[b]?.entries() ?? [])]
        .sort((a, bv) => bv[1] - a[1])
        .slice(0, 5)
        .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }));
      return {
        bucket: b,
        actual: Math.round(actual * 100) / 100,
        target: Math.round(target * 100) / 100,
        pct: income > 0 ? Math.round((actual / income) * 100) : 0,
        targetPct: Math.round(targets[b] * 100),
        topCategories: topCats,
      };
    });

    const needsBucket   = bucketsResult.find((b) => b.bucket === 'needs')!;
    const wantsBucket   = bucketsResult.find((b) => b.bucket === 'wants')!;
    const savingsBucket = bucketsResult.find((b) => b.bucket === 'savings')!;

    // 4. Build prompt
    function bucketLine(b: typeof needsBucket) {
      const diff = Math.abs(b.actual - b.target);
      const direction = b.actual > b.target ? 'over' : 'under';
      const topCats = b.topCategories
        .map((c) => `${c.name} $${fmt(c.amount)}`)
        .join(', ') || 'none tracked';
      return `Actual $${fmt(b.actual)} (${b.pct}%) — ${direction} by $${fmt(diff)}\n  Top categories: ${topCats}`;
    }

    const prompt = `You are a personal finance coach analyzing a household's 50/30/20 budget adherence.

Monthly take-home income: $${fmt(income)}

50/30/20 Rule Analysis:
- NEEDS (target 50% = $${fmt(needsBucket.target)}): ${bucketLine(needsBucket)}
- WANTS (target 30% = $${fmt(wantsBucket.target)}): ${bucketLine(wantsBucket)}
- SAVINGS (target 20% = $${fmt(savingsBucket.target)}): ${bucketLine(savingsBucket)}

Provide a warm, encouraging but honest analysis with:
1. Overall assessment (2-3 sentences)
2. Top 3 specific, actionable recommendations with estimated monthly savings
3. A simple investment strategy based on their $${fmt(savingsBucket.actual)}/mo savings capacity
4. One motivating insight about their wealth-building trajectory

Keep response under 400 words. Use plain text, no markdown headers.`;

    // 5. Call AI
    const messages: AiMessage[] = [{ role: 'user', content: prompt }];
    const result = await client.complete({ messages, maxTokens: 600, temperature: 0.7 });
    const analysisText = result.content;

    // 6. Upsert cache
    const cached = await prisma.wealthAiCache.upsert({
      where: { householdId },
      create: { householdId, analysis: analysisText },
      update: { analysis: analysisText, generatedAt: new Date() },
    });

    return res.json({
      configured: true,
      analysis: cached.analysis,
      generatedAt: cached.generatedAt.toISOString(),
      cached: false,
    });
  } catch (err) {
    req.log.error({ err }, 'ai-analysis error');
    return res.status(500).json({ error: 'Failed to generate AI analysis' });
  }
});

// GET /api/v1/wealth/breakdown — full asset/liability breakdown with history
router.get('/breakdown', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const LIABILITY_ACCOUNT_TYPES = new Set(['credit_card', 'loan']);
    const isInv = (t: string) => t.toLowerCase().includes('investment');
    const isCash = (t: string) => { const l = t.toLowerCase(); return l === 'checking' || l === 'savings'; };
    const isLiab = (t: string) => LIABILITY_ACCOUNT_TYPES.has(t.toLowerCase());

    const [accounts, manualAssets, manualLiabilities] = await Promise.all([
      prisma.account.findMany({
        where: { householdId, isHidden: false, excludeFromNetWorth: false, isDeleted: false },
        select: {
          id: true, name: true, type: true, balance: true, institution: true,
          investmentHoldings: { select: { shares: true, currentPrice: true } },
        },
      }),
      prisma.manualAsset.findMany({
        where: { householdId, isDeleted: false },
        select: { id: true, name: true, type: true, currentValue: true },
      }),
      prisma.manualLiability.findMany({
        where: { householdId, isDeleted: false },
        select: { id: true, name: true, type: true, currentBalance: true },
      }),
    ]);

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const liquid: { id: string; name: string; type: string; balance: number; institution: string | null }[] = [];
    const investments: { id: string; name: string; type: string; value: number; institution: string | null }[] = [];
    const otherAccounts: { id: string; name: string; type: string; balance: number }[] = [];
    const liabilityAccounts: { id: string; name: string; type: string; balance: number }[] = [];

    for (const a of accounts) {
      if (isLiab(a.type)) { liabilityAccounts.push({ id: a.id, name: a.name, type: a.type, balance: r2(Math.abs(a.balance)) }); continue; }
      if (isInv(a.type)) {
        const value = a.investmentHoldings.length > 0
          ? r2(a.investmentHoldings.reduce((s, h) => s + h.shares * h.currentPrice, 0))
          : a.balance;
        investments.push({ id: a.id, name: a.name, type: a.type, value, institution: a.institution ?? null });
        continue;
      }
      if (isCash(a.type)) { liquid.push({ id: a.id, name: a.name, type: a.type, balance: a.balance, institution: a.institution ?? null }); continue; }
      otherAccounts.push({ id: a.id, name: a.name, type: a.type, balance: a.balance });
    }

    const liquidTotal = r2(liquid.reduce((s, a) => s + a.balance, 0));
    const investmentTotal = r2(investments.reduce((s, a) => s + a.value, 0));
    const otherTotal = r2(otherAccounts.reduce((s, a) => s + a.balance, 0) + manualAssets.reduce((s, a) => s + a.currentValue, 0));
    const liabilitiesTotal = r2(liabilityAccounts.reduce((s, a) => s + a.balance, 0) + manualLiabilities.reduce((s, l) => s + l.currentBalance, 0));
    const totalAssets = r2(liquidTotal + investmentTotal + otherTotal);
    const netWorth = r2(totalAssets - liabilitiesTotal);

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 11);
    cutoff.setDate(1); cutoff.setHours(0, 0, 0, 0);

    const snapshots = await prisma.netWorthSnapshot.findMany({
      where: { householdId, date: { gte: cutoff } },
      orderBy: { date: 'asc' },
      select: { date: true, netWorth: true, cashValue: true, investmentValue: true, otherAssetsValue: true, liabilities: true },
    });

    return res.json({
      netWorth,
      totalAssets,
      liquid: { total: liquidTotal, accounts: liquid },
      investments: { total: investmentTotal, accounts: investments },
      otherAssets: {
        total: otherTotal,
        accounts: otherAccounts,
        manualAssets: manualAssets.map((a) => ({ id: a.id, name: a.name, type: a.type, value: a.currentValue })),
      },
      liabilities: {
        total: liabilitiesTotal,
        accounts: liabilityAccounts,
        manualLiabilities: manualLiabilities.map((l) => ({ id: l.id, name: l.name, type: l.type, balance: l.currentBalance })),
      },
      history: snapshots.map((s) => ({
        date: s.date.toISOString().slice(0, 10),
        netWorth: s.netWorth,
        cashValue: s.cashValue,
        investmentValue: s.investmentValue,
        otherAssetsValue: s.otherAssetsValue,
        liabilities: s.liabilities,
      })),
    });
  } catch (err) {
    req.log.error({ err }, 'wealth/breakdown');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
