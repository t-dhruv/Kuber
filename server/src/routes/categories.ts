import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { NOT_DELETED } from '../lib/softDeleteWhere';

const categoryCreateSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  icon: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  bucketType: z.string().optional(),
  isTaxDeductible: z.boolean().optional(),
});

const router = Router();

// GET /api/v1/categories
// Returns a flat array of all categories for the household, suitable for dropdowns.
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const categories = await prisma.category.findMany({
      where: { householdId, ...NOT_DELETED },
      include: { group: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const data = categories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon ?? null,
      type: c.type,
      groupId: c.groupId ?? null,
      groupName: c.group?.name ?? null,
    }));

    return res.json(data);
  } catch (err) {
    req.log.error({ err }, 'categories/GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/categories
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const parse = categoryCreateSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.errors[0]?.message });
    const { name, icon, type, groupId, bucketType, isTaxDeductible } = parse.data;

    const category = await prisma.category.create({
      data: {
        householdId,
        name: name.trim(),
        icon: icon ?? null,
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
      icon: category.icon ?? null,
      type: category.type,
      groupId: category.groupId ?? null,
      groupName: category.group?.name ?? null,
    });
  } catch (err) {
    req.log.error({ err }, 'categories/POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/categories/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, householdId, ...NOT_DELETED },
    });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    if (existing.isSystem) return res.status(403).json({ error: 'Cannot delete system categories' });

    await prisma.category.update({
      where: { id: req.params.id },
      data: { isDeleted: true },
    });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'categories/DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
