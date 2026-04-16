import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { runProactiveChecks } from '../lib/proactiveAi.js';

const router = Router();

// GET /api/v1/notifications — list unread + recent (last 30 days)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId;
    if (!householdId) return res.status(401).json({ error: 'Unauthorized' });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const items = await prisma.notification.findMany({
      where: {
        householdId,
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = items.filter((n) => !n.read).length;
    return res.json({ items, unreadCount });
  } catch (err) {
    req.log.error({ err }, 'notifications GET');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: 'Internal server error', detail: msg });
  }
});

// PUT /api/v1/notifications/:id/read
router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const n = await prisma.notification.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!n) return res.status(404).json({ error: 'Not found' });
    await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
    return res.json({ message: 'Marked as read' });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/notifications/read-all
router.put('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { householdId: req.householdId!, read: false },
      data: { read: true },
    });
    return res.json({ message: 'All marked as read' });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/notifications/clear — delete all read notifications
router.delete('/clear', async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.notification.deleteMany({
      where: { householdId: req.householdId!, read: true },
    });
    return res.json({ deleted: result.count });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/notifications/run-checks — trigger proactive AI analysis on-demand
router.post('/run-checks', async (req: AuthRequest, res: Response) => {
  try {
    const count = await runProactiveChecks(prisma, req.householdId!);
    return res.json({ created: count });
  } catch (err) {
    req.log.error({ err }, 'notifications/run-checks');
    return res.status(500).json({ error: 'Analysis failed' });
  }
});

export default router;
