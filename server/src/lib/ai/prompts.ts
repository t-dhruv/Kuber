import type { ChatContext, HoldingSummary, MonthlySpend } from './context';

const DISCLAIMER = `\nNote: This is informational only and not professional financial advice.`;

// ─── Chat system prompt ───────────────────────────────────────────────────────

export function chatSystemPrompt(ctx: ChatContext): string {
  const inv = ctx.investments;
  const recentTxLines = ctx.recentTransactions.length > 0
    ? ctx.recentTransactions.map(t =>
        `- ${t.date} | ${t.description} | ${t.amount >= 0 ? '+' : ''}${ctx.currency}${t.amount}${t.category ? ` (${t.category})` : ''}`
      ).join('\n')
    : '- No recent transactions';

  return `You are Kuber, a personal AI financial advisor. You have access to the user's real financial data. Be concise, specific, and reference actual numbers when relevant. Do not be generic.

Format your responses using markdown. Use **bold** for key figures, bullet lists for multiple items, and code blocks for calculations.
${DISCLAIMER}

## Financial Snapshot (${new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })})

**Net Worth:** ${ctx.currency} ${ctx.netWorth.toLocaleString()}
**Accounts:** ${ctx.accounts.map(a => `${a.name} (${a.type}): ${ctx.currency} ${a.balance.toLocaleString()}`).join(' | ')}

**This Month:**
- Income: ${ctx.currency} ${ctx.currentMonth.income.toLocaleString()}
- Expenses: ${ctx.currency} ${ctx.currentMonth.expenses.toLocaleString()}
- Savings Rate: ${ctx.currentMonth.savingsRate}%
- Top Spending: ${ctx.currentMonth.topCategories.slice(0, 5).map(c => `${c.name} ${ctx.currency}${c.spent.toLocaleString()}${c.budget ? ` (budget: ${c.budget})` : ''}`).join(', ')}

**Budgets (selected):**
${ctx.budgets.slice(0, 8).map(b => `- ${b.category}: ${ctx.currency}${b.spent}/${ctx.currency}${b.budgeted} (${ctx.currency}${b.remaining} remaining)`).join('\n')}

**Goals:**
${ctx.goals.map(g => `- ${g.name}: ${g.progressPct}% of ${ctx.currency}${g.target.toLocaleString()}${g.targetDate ? ` by ${g.targetDate}` : ''}`).join('\n')}

**Investments:**
- Total Value: ${ctx.currency} ${inv.totalValue.toLocaleString()} | Gain/Loss: ${ctx.currency} ${inv.gainLoss.toLocaleString()} (${inv.gainLossPct}%)
- Allocation: ${inv.allocation.map(a => `${a.assetClass} ${a.pct}%`).join(', ')}

**Recent Transactions (last 10):**
${recentTxLines}`;
}

// ─── Spending analysis prompt ─────────────────────────────────────────────────

export function spendingAnalysisPrompt(months: MonthlySpend[], currency: string): string {
  const monthSummaries = months.map(m =>
    `**${m.month}:** Income ${currency}${m.totalIncome.toLocaleString()}, Expenses ${currency}${m.totalExpenses.toLocaleString()}\n` +
    m.categories.slice(0, 6).map(c => `  - ${c.name}: ${currency}${c.amount}`).join('\n')
  ).join('\n\n');

  return `Analyze this spending data and provide:
1. Top 3 spending trends or anomalies comparing the months
2. Categories that are growing unexpectedly
3. Savings rate trend
4. 2-3 specific, actionable recommendations

Keep your response under 300 words. Be direct and reference actual numbers.
${DISCLAIMER}

## Spending Data (${currency}):

${monthSummaries}`;
}

// ─── Budget recommendations prompt ───────────────────────────────────────────

export interface BudgetRec {
  categoryId: string;
  categoryName: string;
  currentBudget?: number;
  suggestedAmount: number;
  reasoning: string;
}

export function budgetRecommendationPrompt(
  months: MonthlySpend[],
  currentBudgets: Array<{ categoryId: string; category: string; amount: number }>,
  currency: string,
): string {
  const spending = months.map(m =>
    `${m.month}: ` + m.categories.map(c => `${c.name}=${currency}${c.amount}`).join(', ')
  ).join('\n');

  const budgetList = currentBudgets.map(b => `${b.category}: ${currency}${b.amount}`).join('\n');

  return `Based on actual spending data, recommend realistic monthly budgets per category.

Return ONLY a valid JSON array in this exact format (no markdown, no explanation):
[{"categoryName":"Groceries","suggestedAmount":850,"reasoning":"Avg spend over 4 months was $820"},...]

Rules:
- Base suggestions on average actual spending from the data
- Round to nearest $5 or $10
- Only include categories that have spending data
- Keep reasoning under 15 words each

## Actual Spending (${currency}):
${spending}

## Current Budgets:
${budgetList}`;
}

// ─── Investment analysis prompt ───────────────────────────────────────────────

export function investmentAnalysisPrompt(
  holdings: HoldingSummary[],
  totalValue: number,
  currency: string,
): string {
  const holdingsList = holdings
    .sort((a, b) => b.value - a.value)
    .map(h => `- ${h.symbol} (${h.name}): ${h.shares} shares @ ${currency}${h.currentPrice} = ${currency}${h.value.toLocaleString()} | Gain/Loss: ${h.gainLossPct}% | ${h.allocationPct}% of portfolio`)
    .join('\n');

  const allocation = [...new Map(
    holdings.map(h => [h.assetClass, holdings.filter(x => x.assetClass === h.assetClass).reduce((s, x) => s + x.allocationPct, 0)])
  ).entries()].map(([cls, pct]) => `${cls}: ${pct.toFixed(1)}%`).join(', ');

  return `Review this investment portfolio and provide:
1. Asset allocation assessment (is it diversified or concentrated?)
2. Top 2 concentration risks (any single holding > 15%?)
3. Performance highlights (best/worst performers)
4. 2-3 specific rebalancing suggestions if needed

Keep response under 350 words. Reference actual numbers.
${DISCLAIMER}

## Portfolio: ${currency}${totalValue.toLocaleString()} total

**Asset Allocation:** ${allocation}

**Holdings:**
${holdingsList}`;
}

// ─── Financial summary prompt ─────────────────────────────────────────────────

export function financialSummaryPrompt(ctx: ChatContext, period: string): string {
  return `Write a concise narrative financial summary for ${period}.

Structure it as:
1. **Overall Health** (1-2 sentences on net worth / savings rate)
2. **Income & Spending** (key numbers, notable changes)
3. **Budget Performance** (on track / over budget categories)
4. **Goals Progress** (which goals are on track)
5. **Investments** (portfolio value, gain/loss)
6. **Action Items** (top 2-3 things to improve)

Keep it under 400 words. Write in second person ("Your net worth..."). Use actual numbers.
${DISCLAIMER}

## Data:
${JSON.stringify(ctx, null, 2)}`;
}

// ─── Auto-categorize prompt ───────────────────────────────────────────────────

export function categorizeSinglePrompt(
  description: string,
  amount: number,
  categories: Array<{ id: string; name: string; emoji?: string | null; type: string }>,
): string {
  const catList = categories.map(c => `${c.id} | ${c.name} (${c.type})`).join('\n');
  return `Given this transaction, return the best matching category.

Transaction: "${description}" | Amount: ${amount > 0 ? '+' : ''}${amount}

Return ONLY valid JSON (no markdown): {"categoryId":"<id>","confidence":"high|medium|low"}

## Available Categories:
${catList}`;
}

export function categorizeBatchPrompt(
  transactions: Array<{ index: number; description: string; amount: number }>,
  categories: Array<{ id: string; name: string; emoji?: string | null; type: string }>,
): string {
  const txList = transactions.map(t =>
    `${t.index}. "${t.description}" | ${t.amount > 0 ? '+' : ''}${t.amount}`
  ).join('\n');
  const catList = categories.map(c => `${c.id} | ${c.name}`).join('\n');

  return `Categorize these transactions. Return ONLY a valid JSON array (no markdown):
[{"index":1,"categoryId":"<id>","confidence":"high|medium|low"},...]

## Transactions:
${txList}

## Available Categories:
${catList}`;
}
