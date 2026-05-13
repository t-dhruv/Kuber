import { prisma } from './prisma';
import { sendMail } from './email';

const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:3000';

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export async function sendDigestEmail(householdId: string): Promise<void> {
  // Get the household and its member emails
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: {
      members: { include: { user: { select: { email: true, firstName: true } } } },
      reportSchedule: true,
    },
  });

  if (!household) return;

  const recipients = household.members.map((m) => m.user.email);
  if (recipients.length === 0) return;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 1. Net worth change: current vs 30 days ago
  const currentAccounts = await prisma.account.findMany({
    where: { householdId, excludeFromNetWorth: false, isHidden: false },
    select: { balance: true, type: true },
  });

  const currentAssets = currentAccounts.filter((a) => !['credit', 'loan'].includes(a.type)).reduce((s, a) => s + a.balance, 0);
  const currentLiabilities = currentAccounts.filter((a) => ['credit', 'loan'].includes(a.type)).reduce((s, a) => s + Math.abs(a.balance), 0);
  const currentNetWorth = currentAssets - currentLiabilities;

  const snapshotThirtyDaysAgo = await prisma.netWorthSnapshot.findFirst({
    where: {
      householdId,
      date: { lte: thirtyDaysAgo },
    },
    orderBy: { date: 'desc' },
  });

  const priorNetWorth = snapshotThirtyDaysAgo?.netWorth ?? currentNetWorth;
  const netWorthChange = currentNetWorth - priorNetWorth;

  // 2. Top 5 spending categories this month
  const monthTransactions = await prisma.transactionJournal.findMany({
    where: {
      householdId,
      date: { gte: monthStart, lte: now },
      amountDecimal: { lt: 0 },
      isHidden: false,
      isDeleted: false,
    },
    include: { category: { select: { name: true, icon: true } } },
  });

  const categoryMap = new Map<string, { name: string; icon: string | null; total: number }>();
  for (const t of monthTransactions) {
    const key = t.categoryId ?? '__uncategorized__';
    const name = t.category?.name ?? 'Uncategorized';
    const icon = t.category?.icon ?? null;
    const amount = Math.abs(Number(t.amountDecimal));
    const existing = categoryMap.get(key);
    if (existing) {
      existing.total += amount;
    } else {
      categoryMap.set(key, { name, icon, total: amount });
    }
  }
  const topCategories = Array.from(categoryMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // 3. Budget status
  const budgets = await prisma.budget.findMany({
    where: { householdId },
    include: { category: { select: { id: true, name: true, icon: true } } },
  });

  const budgetRows = budgets.map((b) => {
    const catSpending = b.categoryId ? categoryMap.get(b.categoryId) : undefined;
    const actual = catSpending?.total ?? 0;
    const variance = b.amount - actual;
    const isOver = variance < 0;
    return { name: b.category?.name ?? b.name ?? 'Uncategorized', icon: b.category?.icon ?? null, budgeted: b.amount, actual, variance, isOver };
  }).sort((a, b) => a.variance - b.variance); // most over budget first

  // 4. Upcoming recurring bills (next 7 days)
  const upcomingRecurring = await prisma.recurringItem.findMany({
    where: {
      householdId,
      isActive: true,
      nextDate: { gte: now, lte: sevenDaysLater },
    },
    orderBy: { nextDate: 'asc' },
  });

  // Build HTML
  const netWorthChangeColor = netWorthChange >= 0 ? '#2f9e44' : '#e03131';
  const netWorthChangeSign = netWorthChange >= 0 ? '+' : '';

  const topCategoriesRows = topCategories.map((c) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${c.icon ? c.icon + ' ' : ''}${c.name}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600">${fmtCurrency(c.total)}</td>
    </tr>`).join('');

  const budgetStatusRows = budgetRows.map((b) => {
    const color = b.isOver ? '#e03131' : '#2f9e44';
    const label = b.isOver ? 'Over' : 'Under';
    return `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${b.icon ? b.icon + ' ' : ''}${b.name}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right">${fmtCurrency(b.budgeted)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right">${fmtCurrency(b.actual)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;color:${color};font-weight:600">${label} ${fmtCurrency(Math.abs(b.variance))}</td>
    </tr>`;
  }).join('');

  const recurringRows = upcomingRecurring.map((r) => {
    const date = new Date(r.nextDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${r.name}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right">${date}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600">${fmtCurrency(r.amount)}</td>
    </tr>`;
  }).join('');

  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:sans-serif">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

    <!-- Header -->
    <div style="background:#E5622A;padding:24px 32px">
      <h1 style="margin:0;color:#fff;font-size:1.5rem;font-weight:700">Kuber Financial Digest</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:0.875rem">${monthName}</p>
    </div>

    <div style="padding:24px 32px">

      <!-- Net Worth -->
      <h2 style="margin:0 0 12px;font-size:1rem;color:#333;font-weight:600">Net Worth</h2>
      <div style="display:flex;gap:24px;margin-bottom:24px">
        <div style="background:#f8f9fa;border-radius:6px;padding:16px 20px;flex:1">
          <div style="font-size:0.75rem;color:#868e96;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">Current</div>
          <div style="font-size:1.5rem;font-weight:700;color:#212529">${fmtCurrency(currentNetWorth)}</div>
        </div>
        <div style="background:#f8f9fa;border-radius:6px;padding:16px 20px;flex:1">
          <div style="font-size:0.75rem;color:#868e96;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em">30-Day Change</div>
          <div style="font-size:1.5rem;font-weight:700;color:${netWorthChangeColor}">${netWorthChangeSign}${fmtCurrency(netWorthChange)}</div>
        </div>
      </div>

      <!-- Top Spending Categories -->
      <h2 style="margin:0 0 12px;font-size:1rem;color:#333;font-weight:600">Top Spending This Month</h2>
      ${topCategories.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:0.875rem">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;color:#868e96;font-weight:500;border-bottom:2px solid #f0f0f0">Category</th>
            <th style="padding:6px 8px;text-align:right;color:#868e96;font-weight:500;border-bottom:2px solid #f0f0f0">Spent</th>
          </tr>
        </thead>
        <tbody>${topCategoriesRows}</tbody>
      </table>` : `<p style="color:#868e96;font-size:0.875rem;margin-bottom:24px">No spending recorded this month.</p>`}

      <!-- Budget Status -->
      ${budgetRows.length > 0 ? `
      <h2 style="margin:0 0 12px;font-size:1rem;color:#333;font-weight:600">Budget Status</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:0.875rem">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;color:#868e96;font-weight:500;border-bottom:2px solid #f0f0f0">Category</th>
            <th style="padding:6px 8px;text-align:right;color:#868e96;font-weight:500;border-bottom:2px solid #f0f0f0">Budget</th>
            <th style="padding:6px 8px;text-align:right;color:#868e96;font-weight:500;border-bottom:2px solid #f0f0f0">Spent</th>
            <th style="padding:6px 8px;text-align:right;color:#868e96;font-weight:500;border-bottom:2px solid #f0f0f0">Status</th>
          </tr>
        </thead>
        <tbody>${budgetStatusRows}</tbody>
      </table>` : ''}

      <!-- Upcoming Bills -->
      ${upcomingRecurring.length > 0 ? `
      <h2 style="margin:0 0 12px;font-size:1rem;color:#333;font-weight:600">Upcoming Bills (Next 7 Days)</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:0.875rem">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;color:#868e96;font-weight:500;border-bottom:2px solid #f0f0f0">Name</th>
            <th style="padding:6px 8px;text-align:right;color:#868e96;font-weight:500;border-bottom:2px solid #f0f0f0">Date</th>
            <th style="padding:6px 8px;text-align:right;color:#868e96;font-weight:500;border-bottom:2px solid #f0f0f0">Amount</th>
          </tr>
        </thead>
        <tbody>${recurringRows}</tbody>
      </table>` : ''}

    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #f0f0f0;padding:16px 32px;font-size:0.75rem;color:#868e96">
      <p style="margin:0">
        You're receiving this because you enabled digest emails in Kuber.
        To unsubscribe, visit <a href="${CLIENT_URL}/settings" style="color:#E5622A">Settings → Report Digest</a> and disable digest emails.
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `Kuber Financial Digest — ${monthName}\n\nNet Worth: ${fmtCurrency(currentNetWorth)} (${netWorthChangeSign}${fmtCurrency(netWorthChange)} vs 30 days ago)\n\nVisit ${CLIENT_URL} to view your full report.`;

  for (const to of recipients) {
    await sendMail({
      to,
      subject: `Kuber Financial Digest — ${monthName}`,
      html,
      text,
    });
  }
}
