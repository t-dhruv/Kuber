import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/notifications
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const notifications = await prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const data = notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.body,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
      actionUrl: (n.metadata as Record<string, unknown> | null)?.actionUrl as string | null ?? null,
    }));

    return res.json({ data });
  } catch (err) {
    console.error('[notifications/list]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/notifications/count
router.get('/count', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const unread = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    return res.json({ unread });
  } catch (err) {
    console.error('[notifications/count]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/notifications/read-all
router.put('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return res.json({ updated: result.count });
  } catch (err) {
    console.error('[notifications/read-all]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/notifications/:id/read
router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    if (notification.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[notifications/read]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/notifications/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    if (notification.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

    await prisma.notification.delete({ where: { id } });

    return res.json({ success: true });
  } catch (err) {
    console.error('[notifications/delete]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
