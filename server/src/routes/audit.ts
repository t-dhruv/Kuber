import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/audit
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { entity, action, startDate, endDate, limit = '50' } = req.query as Record<string, string | undefined>;

    const where: any = { householdId };
    if (entity) where.entity = entity.toUpperCase();
    if (action) where.action = action.toUpperCase();
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, parseInt(limit, 10) || 50),
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    return res.json(logs.map(l => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      changes: l.changes,
      createdAt: l.createdAt.toISOString(),
      user: `${l.user.firstName} ${l.user.lastName}`.trim(),
    })));
  } catch (err) {
    req.log.error({ err }, 'audit/list');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
