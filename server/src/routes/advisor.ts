import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function getMonthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

interface FinancialContext {
  monthIncome: number;
  monthExpenses: number;
  netWorth: number;
  topCategory: string;
  totalBudget: number;
  budgetStatus: string;
}

async function getFinancialContext(householdId: string): Promise<FinancialContext> {
  const now = new Date();
  const { start, end } = getMonthBounds(now);

  const [accounts, transactions, budgets] = await Promise.all([
    prisma.account.findMany({
      where: { householdId, isHidden: false, excludeFromNetWorth: false },
      select: { balance: true },
    }),
    prisma.transaction.findMany({
      where: {
        householdId,
        date: { gte: start, lt: end },
        isHidden: false,
      },
      select: { amount: true, categoryId: true },
    }),
    prisma.budget.findMany({
      where: { householdId },
      select: { amount: true },
    }),
  ]);

  const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);
  const monthIncome = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const monthExpenses = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);

  // Find top spending category
  const spendByCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.amount < 0 && t.categoryId) {
      spendByCategory.set(t.categoryId, (spendByCategory.get(t.categoryId) ?? 0) + Math.abs(t.amount));
    }
  }

  let topCategoryId: string | null = null;
  let topCategoryAmount = 0;
  for (const [catId, amt] of spendByCategory.entries()) {
    if (amt > topCategoryAmount) {
      topCategoryAmount = amt;
      topCategoryId = catId;
    }
  }

  let topCategory = 'Uncategorized';
  if (topCategoryId) {
    const cat = await prisma.category.findUnique({
      where: { id: topCategoryId },
      select: { name: true },
    });
    topCategory = cat?.name ?? 'Uncategorized';
  }

  const remaining = totalBudget - monthExpenses;
  const budgetStatus =
    totalBudget === 0
      ? 'No budget set for this month'
      : remaining >= 0
      ? `You have ${formatCurrency(remaining)} left in your budget`
      : `You are ${formatCurrency(Math.abs(remaining))} over budget`;

  return { monthIncome, monthExpenses, netWorth, topCategory, totalBudget, budgetStatus };
}

type AdvisorResponse = { message: string; suggestions: string[] };

const responses: Record<string, (d: FinancialContext) => AdvisorResponse> = {
  spending: (d) => ({
    message: `Your spending this month is ${formatCurrency(d.monthExpenses)}. Your top category is ${d.topCategory}. ${d.budgetStatus}.`,
    suggestions: [
      'Show me spending by category',
      'How can I reduce my spending?',
      'Compare to last month',
    ],
  }),
  budget: (d) => ({
    message: `You've budgeted ${formatCurrency(d.totalBudget)} this month and spent ${formatCurrency(d.monthExpenses)}. You have ${formatCurrency(d.totalBudget - d.monthExpenses)} remaining.`,
    suggestions: [
      'Which categories am I over budget?',
      'Help me create a budget',
      'Show my budget breakdown',
    ],
  }),
  'net worth': (d) => ({
    message: `Your current net worth is ${formatCurrency(d.netWorth)}. This includes all your accounts and liabilities.`,
    suggestions: [
      'How has my net worth changed?',
      'What affects my net worth?',
      'Show my accounts',
    ],
  }),
  save: (d) => ({
    message:
      d.monthIncome > 0
        ? `Based on your income of ${formatCurrency(d.monthIncome)} and expenses of ${formatCurrency(d.monthExpenses)}, you're saving ${formatCurrency(d.monthIncome - d.monthExpenses)} this month (${Math.round(((d.monthIncome - d.monthExpenses) / d.monthIncome) * 100)}% savings rate).`
        : `You have ${formatCurrency(d.monthExpenses)} in expenses this month. Add income transactions to track your savings rate.`,
    suggestions: [
      'How can I save more?',
      'Show my savings goals',
      'What are my biggest expenses?',
    ],
  }),
  default: (d) => ({
    message: `I can help you understand your finances. Your net worth is ${formatCurrency(d.netWorth)} and you've spent ${formatCurrency(d.monthExpenses)} this month. What would you like to know?`,
    suggestions: [
      'How is my budget?',
      'What did I spend on last month?',
      'Show my net worth trend',
      'Am I saving enough?',
    ],
  }),
};

// POST /api/v1/advisor/chat
router.post('/chat', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { message, conversationId } = req.body as { message?: string; conversationId?: string };

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const resolvedConversationId = conversationId ?? randomUUID();
    const lower = message.toLowerCase();

    const context = await getFinancialContext(householdId);

    const matchedKey = Object.keys(responses).find(
      key => key !== 'default' && lower.includes(key)
    );

    const { message: responseMessage, suggestions } = responses[matchedKey ?? 'default'](context);

    return res.json({
      conversationId: resolvedConversationId,
      message: responseMessage,
      suggestions,
    });
  } catch (err) {
    console.error('[advisor/chat]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
