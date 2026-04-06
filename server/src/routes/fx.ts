import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { getFxRates, getCurrencySnapshot } from '../lib/fxRates.js';

const router = Router();

// GET /api/v1/fx/rates — return all rates relative to USD
router.get('/rates', async (_req: AuthRequest, res: Response) => {
  try {
    const rates = await getFxRates();
    return res.json({ base: 'USD', rates, cachedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(502).json({ error: 'FX rates unavailable' });
  }
});

// GET /api/v1/fx/snapshot?base=CAD — rates for display currencies relative to base
router.get('/snapshot', async (req: AuthRequest, res: Response) => {
  try {
    const base = (req.query.base as string)?.toUpperCase() || 'USD';
    const snapshot = await getCurrencySnapshot(base);
    return res.json({ base, rates: snapshot });
  } catch (err) {
    return res.status(502).json({ error: 'FX rates unavailable' });
  }
});

export default router;
