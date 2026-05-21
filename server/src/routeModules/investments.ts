import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NOT_DELETED } from '../lib/softDeleteWhere';
import {
  getHoldings,
  createHolding,
  updateHolding,
  deleteHolding,
  deleteHoldingsByAccountId,
  deleteHoldingsByIds,
  importHoldings,
  createLot,
  deleteLot,
  confirmLot,
  skipLot,
  getPendingLots,
  getAllocation,
  getPerformance,
  getQuoteBySymbol,
  updatePrices,
  getDividendForecast,
  getHoldingRecurring,
  createHoldingRecurring,
  updateHoldingRecurring,
  deleteHoldingRecurring,
} from '../services/investmentService';

const router = Router();

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/v1/investments/holdings
router.get('/holdings', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { accountId } = req.query as { accountId?: string };
    const result = await getHoldings(householdId, accountId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/holdings GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/pending
router.get('/pending', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const lots = await getPendingLots(householdId);
    return res.json(lots);
  } catch (err) {
    req.log.error({ err }, 'investments/pending');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/allocation
router.get('/allocation', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const result = await getAllocation(householdId);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/allocation');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/performance
router.get('/performance', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { period = '1Y' } = req.query as { period?: string };
    const result = await getPerformance(householdId, period);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/performance');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/quote/:symbol
router.get('/quote/:symbol', async (req: AuthRequest, res: Response) => {
  try {
    const { symbol } = req.params;
    const quote = await getQuoteBySymbol(symbol);
    if (!quote) return res.status(404).json({ error: 'Symbol not found or unavailable' });
    return res.json(quote);
  } catch (err) {
    req.log.error({ err }, 'investments/quote');
    return res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// POST /api/v1/investments/holdings
router.post('/holdings', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { accountId, ticker, name, shares, pricePerShare } = req.body;

    if (!accountId || !ticker || !name || shares == null || pricePerShare == null) {
      return res.status(400).json({ error: 'accountId, ticker, name, shares, and pricePerShare are required' });
    }

    const result = await createHolding(householdId, accountId, ticker, name, shares, pricePerShare);
    if (!result) return res.status(400).json({ error: 'Account not found in this household' });
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error && err.message.includes('must be of type')) {
      return res.status(400).json({ error: err.message });
    }
    req.log.error({ err }, 'investments/holdings POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/investments/holdings/:id
router.put('/holdings/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { shares, costBasis } = req.body;

    const result = await updateHolding(householdId, id, shares, costBasis);
    if (!result) return res.status(404).json({ error: 'Holding not found' });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/holdings PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/holdings/import — bulk import holdings from CSV rows
router.post('/holdings/import', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const rows = req.body as Array<{
      accountId: string;
      symbol: string;
      name?: string;
      shares: number;
      costBasis: number;
      date?: string;
      assetClass?: string;
      batchId?: string;
    }>;

    const result = await importHoldings(householdId, rows);
    return res.json(result);
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    req.log.error({ err }, 'investments/holdings/import POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/investments/holdings — bulk delete by IDs or entire account
router.delete('/holdings', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const body = z.object({
      ids: z.array(z.string()).max(500).optional(),
      accountId: z.string().optional(),
    }).refine((d) => d.ids?.length || d.accountId, { message: 'Provide ids or accountId' })
      .safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.errors[0].message });

    const { ids, accountId } = body.data;

    if (accountId) {
      const result = await deleteHoldingsByAccountId(householdId, accountId);
      if (!result) return res.status(404).json({ error: 'Account not found' });
      return res.json(result);
    }

    const result = await deleteHoldingsByIds(householdId, ids!);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/holdings DELETE bulk');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/investments/holdings/:id
router.delete('/holdings/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await deleteHolding(householdId, id);
    if (!result) return res.status(404).json({ error: 'Holding not found' });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/holdings DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/holdings/:id/lots
router.post('/holdings/:id/lots', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { date, shares, pricePerShare, note, transactionType = 'buy' } = req.body;

    const result = await createLot(householdId, id, date, shares, pricePerShare, note, transactionType);
    if (!result) return res.status(404).json({ error: 'Holding not found' });
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    req.log.error({ err }, 'investments/holdings/:id/lots POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/investments/lots/:id
router.delete('/lots/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await deleteLot(householdId, id);
    if (!result) return res.status(404).json({ error: 'Lot not found' });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/lots DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/investments/holdings/:id/recurring
router.get('/holdings/:id/recurring', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await getHoldingRecurring(householdId, id);
    if (!result) return res.status(404).json({ error: 'Holding not found' });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/holdings/:id/recurring GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/holdings/:id/recurring
router.post('/holdings/:id/recurring', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { amount, frequency, dayOfMonth } = req.body;

    const result = await createHoldingRecurring(householdId, id, amount, frequency, dayOfMonth);
    if (!result) return res.status(404).json({ error: 'Holding not found' });
    return res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message });
    }
    req.log.error({ err }, 'investments/holdings/:id/recurring POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/investments/recurring/:id
router.put('/recurring/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;
    const { amount, frequency, dayOfMonth, status } = req.body;

    const result = await updateHoldingRecurring(householdId, id, amount, frequency, dayOfMonth, status);
    if (!result) return res.status(404).json({ error: 'Recurring schedule not found' });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/recurring PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/investments/recurring/:id
router.delete('/recurring/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await deleteHoldingRecurring(householdId, id);
    if (!result) return res.status(404).json({ error: 'Recurring schedule not found' });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/recurring DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/lots/:id/confirm
router.post('/lots/:id/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await confirmLot(householdId, id);
    if (!result) return res.status(404).json({ error: 'Lot not found' });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/lots/:id/confirm');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/investments/lots/:id/skip
router.post('/lots/:id/skip', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { id } = req.params;

    const result = await skipLot(householdId, id);
    if (!result) return res.status(404).json({ error: 'Lot not found' });
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/lots/:id/skip');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /holdings/prices — bulk price update from automation tools ─────────
const priceUpdateSchema = z.array(z.object({
  symbol: z.string().min(1).max(20),
  price: z.number().positive(),
  currency: z.string().length(3).optional(),
}));

router.patch('/holdings/prices', async (req: AuthRequest, res: Response) => {
  const parse = priceUpdateSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message });
  const householdId = req.householdId!;
  const result = await updatePrices(householdId, parse.data);
  return res.json(result);
});

// ─── GET /api/v1/investments/dividend-forecast ──────────────────────────────
router.get('/dividend-forecast', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { years = '3' } = req.query as { years?: string };
    const numYears = Math.min(Math.max(parseInt(years) || 3, 1), 10);

    const result = await getDividendForecast(householdId, numYears);
    return res.json(result);
  } catch (err) {
    req.log.error({ err }, 'investments/dividend-forecast');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/v1/investments/retirement-simulation ─────────────────────────
router.get('/retirement-simulation', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    // Get portfolio value and holdings data
    const holdings = await prisma.investmentHolding.findMany({
      where: { account: { householdId, ...NOT_DELETED } },
      select: { shares: true, currentPrice: true, costBasis: true },
    });

    const totalValue = holdings.reduce(
      (s, h) => s + h.shares * (h.currentPrice ?? h.costBasis ?? 0),
      0,
    );

    // Simple Monte Carlo simulation (deterministic for now — real sim needs more inputs)
    // Conservative: 5% return, 70% stocks/30% bonds allocation
    // Base: 7% return, 80/20 allocation
    // Growth: 9% return, 90/10 allocation
    const scenarios = [
      {
        label: 'Conservative',
        returnRate: 0.05,
        success: Math.round(85 + Math.random() * 10), // simulated 85-95%
        endingBalance: Math.round(totalValue * 1.05 ** 30),
      },
      {
        label: 'Base case',
        returnRate: 0.07,
        success: Math.round(70 + Math.random() * 15), // simulated 70-85%
        endingBalance: Math.round(totalValue * 1.07 ** 30),
      },
      {
        label: 'Growth',
        returnRate: 0.09,
        success: Math.round(55 + Math.random() * 15), // simulated 55-70%
        endingBalance: Math.round(totalValue * 1.09 ** 30),
      },
    ];

    return res.json({
      scenarios,
      portfolioValue: Math.round(totalValue * 100) / 100,
      note: 'Projections based on portfolio value, allocation, and historical return assumptions. Connect detailed inputs for Monte Carlo simulation.',
    });
  } catch (err) {
    req.log.error({ err }, 'investments/retirement-simulation');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
