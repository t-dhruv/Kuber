import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { rollbackCheckpoint } from '../lib/checkpoint.js';

const router = Router();

// GET /api/v1/checkpoints — list recent (non-expired, non-rolled-back)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const items = await prisma.operationCheckpoint.findMany({
      where: {
        householdId: req.householdId!,
        rolledBack: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, type: true, label: true, txnCount: true, createdAt: true, expiresAt: true },
    });
    return res.json(items);
  } catch (err) {
    req.log.error({ err }, 'checkpoints GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/checkpoints/:id/rollback
router.post('/:id/rollback', async (req: AuthRequest, res: Response) => {
  try {
    const result = await rollbackCheckpoint(prisma, req.householdId!, req.params.id);
    return res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Rollback failed';
    return res.status(400).json({ error: msg });
  }
});

export default router;
