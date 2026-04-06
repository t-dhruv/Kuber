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

// POST /api/v1/categories
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { name, emoji, type, groupId, bucketType, isTaxDeductible } = req.body as {
      name?: string;
      emoji?: string;
      type?: string;
      groupId?: string;
      bucketType?: string;
      isTaxDeductible?: boolean;
    };

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: 'type is required (e.g. expense, income)' });
    }

    const category = await prisma.category.create({
      data: {
        householdId,
        name: name.trim(),
        emoji: emoji ?? null,
        type,
        groupId: groupId ?? null,
        bucketType: bucketType ?? 'uncategorized',
        isTaxDeductible: isTaxDeductible ?? false,
        isSystem: false,
      },
      include: { group: { select: { id: true, name: true } } },
    });

    return res.status(201).json({
      id: category.id,
      name: category.name,
      emoji: category.emoji ?? null,
      type: category.type,
      groupId: category.groupId ?? null,
      groupName: category.group?.name ?? null,
    });
  } catch (err) {
    console.error('[categories/POST]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/categories/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, householdId },
    });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    if (existing.isSystem) return res.status(403).json({ error: 'Cannot delete system categories' });

    await prisma.category.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[categories/DELETE]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
