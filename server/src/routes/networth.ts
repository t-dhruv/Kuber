import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { takeNetWorthSnapshot } from '../lib/netWorthJob';
import { summarizeNetWorth } from '../lib/reporting';
import { NOT_DELETED } from '../lib/softDeleteWhere';

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
      where: { householdId, isHidden: false, excludeFromNetWorth: false, ...NOT_DELETED },
      select: { balance: true, type: true, excludeFromNetWorth: true },
    });
    const current = summarizeNetWorth(accounts);

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
          amount: current.netWorth - oldest.netWorth,
          percent:
            oldest.netWorth !== 0
              ? ((current.netWorth - oldest.netWorth) / Math.abs(oldest.netWorth)) * 100
              : 0,
          since: oldest.date.toISOString().split('T')[0],
        }
      : { amount: 0, percent: 0, since: null };

    res.json({
      current: {
        assets: current.assets,
        liabilities: current.liabilities,
        netWorth: current.netWorth,
      },
      history,
      change,
    });
  } catch (err) {
    req.log.error({ err }, 'GET /history error');
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
    req.log.error({ err }, 'POST /snapshot error');
    res.status(500).json({ error: 'Failed to record snapshot' });
  }
});

export default router;
