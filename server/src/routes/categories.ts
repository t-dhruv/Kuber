import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/v1/categories
// Returns a flat array of all categories for the household, suitable for dropdowns.
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const categories = await prisma.category.findMany({
      where: { householdId },
      include: { group: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const data = categories.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji ?? null,
      type: c.type,
      groupId: c.groupId ?? null,
      groupName: c.group?.name ?? null,
    }));

    return res.json(data);
  } catch (err) {
    console.error('[categories/GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
