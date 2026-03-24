import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { takeNetWorthSnapshot } from '../lib/netWorthJob';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Range = '1M' | '3M' | '6M' | '1Y' | 'ALL';

function rangeToDate(range: Range): Date | null {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  switch (range) {
    case '1M': now.setDate(now.getDate() - 30);   return now;
    case '3M': now.setDate(now.getDate() - 90);   return now;
    case '6M': now.setDate(now.getDate() - 180);  return now;
    case '1Y': now.setDate(now.getDate() - 365);  return now;
    case 'ALL': return null;
  }
}

// ─── GET /api/v1/networth/history ─────────────────────────────────────────────

router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const rawRange = (req.query.range as string | undefined)?.toUpperCase() ?? '1Y';
    const validRanges: Range[] = ['1M', '3M', '6M', '1Y', 'ALL'];
    const range: Range = validRanges.includes(rawRange as Range) ? (rawRange as Range) : '1Y';

    const since = rangeToDate(range);

    // Fetch snapshots
    const snapshots = await prisma.netWorthSnapshot.findMany({
      where: {
        householdId,
        ...(since ? { date: { gte: since } } : {}),
      },
      orderBy: { date: 'asc' },
    });

    // Compute current net worth from live account balances
    const accounts = await prisma.account.findMany({
      where: { householdId, isHidden: false, excludeFromNetWorth: false },
      select: { balance: true, type: true },
    });

    const currentAssets = accounts
      .filter((a) => !['CREDIT_CARD', 'LOAN'].includes(a.type))
      .reduce((sum, a) => sum + a.balance, 0);

    const currentLiabilities = accounts
      .filter((a) => ['CREDIT_CARD', 'LOAN'].includes(a.type))
      .reduce((sum, a) => sum + Math.abs(a.balance), 0);

    const currentNetWorth = currentAssets - currentLiabilities;

    // Build history array — ISO date strings (YYYY-MM-DD)
    const history = snapshots.map((s) => ({
      date: s.date.toISOString().split('T')[0],
      assets: s.assets,
      liabilities: s.liabilities,
      netWorth: s.netWorth,
    }));

    // Compute change from oldest snapshot
    const oldest = snapshots[0];
    const change = oldest
      ? {
          amount: currentNetWorth - oldest.netWorth,
          percent:
            oldest.netWorth !== 0
              ? ((currentNetWorth - oldest.netWorth) / Math.abs(oldest.netWorth)) * 100
              : 0,
          since: oldest.date.toISOString().split('T')[0],
        }
      : { amount: 0, percent: 0, since: null };

    res.json({
      current: {
        assets: currentAssets,
        liabilities: currentLiabilities,
        netWorth: currentNetWorth,
      },
      history,
      change,
    });
  } catch (err) {
    console.error('[networth] GET /history error:', err);
    res.status(500).json({ error: 'Failed to fetch net worth history' });
  }
});

// ─── POST /api/v1/networth/snapshot ───────────────────────────────────────────

router.post('/snapshot', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    await takeNetWorthSnapshot(householdId);
    res.json({ message: 'Snapshot recorded' });
  } catch (err) {
    console.error('[networth] POST /snapshot error:', err);
    res.status(500).json({ error: 'Failed to record snapshot' });
  }
});

export default router;
