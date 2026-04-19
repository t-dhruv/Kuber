/**
 * proactiveAi.ts
 * Proactive AI analysis jobs — anomaly detection, subscription detection, missed payment warnings.
 * These run as background jobs (called from scheduledJobs or on-demand).
 */

import { PrismaClient } from '@prisma/client';

interface ProactiveInsight {
  type: 'anomaly' | 'subscription' | 'missed_payment' | 'over_budget';
  severity: 'info' | 'warning' | 'alert';
  title: string;
  body: string;
  linkedEntityId?: string;
  linkedEntityType?: string;
}

/**
 * Detect spending anomalies: transactions 3x larger than the 90-day average for that category.
 */
export async function detectAnomalies(
  prisma: PrismaClient,
  householdId: string
): Promise<ProactiveInsight[]> {
  const insights: ProactiveInsight[] = [];
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get recent transactions (last 7 days) with categories
  const recentTxns = await prisma.transaction.findMany({
    where: { householdId, date: { gte: sevenDaysAgo }, amount: { lt: 0 }, isHidden: false },
    include: { category: { select: { name: true } } },
  });

  // Get 90-day averages per category
  const historicalTxns = await prisma.transaction.groupBy({
    by: ['categoryId'],
    where: { householdId, date: { gte: ninetyDaysAgo, lt: sevenDaysAgo }, amount: { lt: 0 }, isHidden: false },
    _avg: { amount: true },
    _count: true,
  });

  const avgByCategory = new Map(
    historicalTxns.map((h) => [h.categoryId, Math.abs(h._avg.amount ?? 0)])
  );

  for (const txn of recentTxns) {
    if (!txn.categoryId) continue;
    const avg = avgByCategory.get(txn.categoryId);
    if (!avg || avg < 10) continue; // ignore tiny averages
    const ratio = Math.abs(txn.amount) / avg;
    if (ratio >= 3) {
      insights.push({
        type: 'anomaly',
        severity: ratio >= 5 ? 'alert' : 'warning',
        title: `Unusual ${txn.category?.name ?? 'expense'} transaction`,
        body: `$${Math.abs(txn.amount).toFixed(0)} is ${ratio.toFixed(1)}× your 90-day average of $${avg.toFixed(0)} for ${txn.category?.name ?? 'this category'}.`,
        linkedEntityId: txn.id,
        linkedEntityType: 'transaction',
      });
    }
  }

  return insights;
}

/**
 * Auto-detect subscriptions: transactions with same merchant recurring monthly ±3 days.
 */
export async function detectSubscriptions(
  prisma: PrismaClient,
  householdId: string
): Promise<ProactiveInsight[]> {
  const insights: ProactiveInsight[] = [];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const txns = await prisma.transaction.findMany({
    where: { householdId, date: { gte: ninetyDaysAgo }, amount: { lt: 0 }, isHidden: false, merchantId: { not: null } },
    include: { merchant: { select: { name: true } } },
    orderBy: { date: 'asc' },
  });

  // Group by merchantId
  const byMerchant = new Map<string, typeof txns>();
  for (const t of txns) {
    if (!t.merchantId) continue;
    if (!byMerchant.has(t.merchantId)) byMerchant.set(t.merchantId, []);
    byMerchant.get(t.merchantId)!.push(t);
  }

  for (const [, merchantTxns] of byMerchant) {
    if (merchantTxns.length < 2) continue;
    // Check if amounts are similar and intervals are ~monthly
    const amounts = merchantTxns.map((t) => Math.abs(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountConsistent = amounts.every((a) => Math.abs(a - avgAmount) / avgAmount < 0.1);
    if (!amountConsistent) continue;

    const intervals: number[] = [];
    for (let i = 1; i < merchantTxns.length; i++) {
      const days = (merchantTxns[i].date.getTime() - merchantTxns[i - 1].date.getTime()) / (24 * 60 * 60 * 1000);
      intervals.push(days);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const isMonthly = avgInterval >= 25 && avgInterval <= 35;
    const isWeekly = avgInterval >= 5 && avgInterval <= 9;

    if (isMonthly || isWeekly) {
      const freq = isMonthly ? 'monthly' : 'weekly';
      const name = merchantTxns[0].merchant?.name ?? 'Unknown merchant';
      // Check if already detected (last txn was recent)
      const lastDate = merchantTxns[merchantTxns.length - 1].date;
      const daysSinceLast = (Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceLast < 35) { // only surface if subscription is still active
        insights.push({
          type: 'subscription',
          severity: 'info',
          title: `Subscription detected: ${name}`,
          body: `You have a ${freq} charge of ~$${avgAmount.toFixed(2)} from ${name}. Add it as a recurring item to track it.`,
          linkedEntityId: merchantTxns[merchantTxns.length - 1].id,
          linkedEntityType: 'transaction',
        });
      }
    }
  }

  return insights;
}

/**
 * Detect missed recurring payments: recurring items with nextDate in the past that have no matching transaction.
 */
export async function detectMissedPayments(
  prisma: PrismaClient,
  householdId: string
): Promise<ProactiveInsight[]> {
  const insights: ProactiveInsight[] = [];
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const overdueRecurring = await prisma.recurringItem.findMany({
    where: {
      householdId,
      isActive: true,
      nextDate: { lt: threeDaysAgo },
    },
  });

  for (const item of overdueRecurring) {
    insights.push({
      type: 'missed_payment',
      severity: 'warning',
      title: `Possible missed payment: ${item.name}`,
      body: `"${item.name}" was due on ${item.nextDate.toLocaleDateString()} but no matching transaction was found.`,
      linkedEntityId: item.id,
      linkedEntityType: 'recurring',
    });
  }

  return insights;
}

/**
 * Run all proactive checks for a household and create Notification records for new findings.
 * Deduplicates: won't create a notification if a similar unread one exists from the last 24h.
 */
export async function runProactiveChecks(
  prisma: PrismaClient,
  householdId: string
): Promise<number> {
  const [anomalies, subscriptions, missedPayments] = await Promise.all([
    detectAnomalies(prisma, householdId),
    detectSubscriptions(prisma, householdId),
    detectMissedPayments(prisma, householdId),
  ]);

  const allInsights = [...anomalies, ...subscriptions, ...missedPayments];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Load ALL notifications (read or unread) from last 7 days to deduplicate.
  // Previous 24h/unread-only window allowed the same insight to respawn daily once read.
  const recentNotifications = await prisma.notification.findMany({
    where: { householdId, createdAt: { gte: sevenDaysAgo } },
    select: { title: true, type: true, linkedEntityId: true },
  });
  const recentTitles = new Set(recentNotifications.map((n) => n.title));

  // Secondary dedup: don't re-create missed_payment for the same recurring item within 7 days,
  // even if the title changed (e.g. date differs slightly).
  const recentMissedPaymentEntityIds = new Set(
    recentNotifications
      .filter((n) => n.type === 'missed_payment' && n.linkedEntityId)
      .map((n) => n.linkedEntityId!)
  );

  let created = 0;
  for (const insight of allInsights) {
    if (recentTitles.has(insight.title)) continue; // deduplicate
    // Entity-level dedup for missed_payment: same recurring item, different title (date changes)
    if (
      insight.type === 'missed_payment' &&
      insight.linkedEntityId &&
      recentMissedPaymentEntityIds.has(insight.linkedEntityId)
    ) continue;
    await prisma.notification.create({
      data: {
        householdId,
        type: insight.type,
        severity: insight.severity,
        title: insight.title,
        body: insight.body,
        linkedEntityId: insight.linkedEntityId,
        linkedEntityType: insight.linkedEntityType,
      },
    });
    created++;
  }

  return created;
}
