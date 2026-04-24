import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const ENTITY_TYPES = ['account', 'category', 'budget'] as const;

const groupSchema = z.object({
  name:       z.string().min(1).max(100),
  entityType: z.enum(ENTITY_TYPES),
  color:      z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  sortOrder:  z.number().int().min(0).optional().default(0),
});

const assignSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId:   z.string().min(1),
  groupId:    z.string().nullable(),
});

// GET /api/v1/object-groups?entityType=account
router.get('/', async (req: AuthRequest, res: Response) => {
  const entityType = req.query.entityType as string | undefined;
  const groups = await prisma.objectGroup.findMany({
    where: {
      householdId: req.householdId!,
      ...(entityType ? { entityType } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return res.json(groups);
});

// POST /api/v1/object-groups
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const group = await prisma.objectGroup.create({
    data: { householdId: req.householdId!, ...parsed.data },
  });
  return res.status(201).json(group);
});

// PATCH /api/v1/object-groups/assign  ← must come BEFORE /:id
router.patch('/assign', async (req: AuthRequest, res: Response) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { entityType, entityId, groupId } = parsed.data;
  const householdId = req.householdId!;

  if (groupId !== null) {
    const group = await prisma.objectGroup.findFirst({ where: { id: groupId, householdId } });
    if (!group) return res.status(404).json({ error: 'Group not found' });
  }

  const updateData = { groupId: groupId ?? undefined };

  if (entityType === 'account') {
    const entity = await prisma.account.findFirst({ where: { id: entityId, householdId } });
    if (!entity) return res.status(404).json({ error: 'Account not found' });
    await prisma.account.update({ where: { id: entityId }, data: { objectGroupId: groupId ?? null } });
  } else if (entityType === 'category') {
    const entity = await prisma.category.findFirst({ where: { id: entityId, householdId } });
    if (!entity) return res.status(404).json({ error: 'Category not found' });
    await prisma.category.update({ where: { id: entityId }, data: { objectGroupId: groupId ?? null } });
  } else {
    const entity = await prisma.budget.findFirst({ where: { id: entityId, householdId } });
    if (!entity) return res.status(404).json({ error: 'Budget not found' });
    await prisma.budget.update({ where: { id: entityId }, data: { groupId: groupId ?? null } });
  }

  return res.json({ message: 'Assigned' });
});

// PUT /api/v1/object-groups/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const householdId = req.householdId!;
  const parsed = groupSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const existing = await prisma.objectGroup.findFirst({ where: { id: req.params.id, householdId } });
  if (!existing) return res.status(404).json({ error: 'Group not found' });

  const group = await prisma.objectGroup.update({ where: { id: req.params.id }, data: parsed.data });
  return res.json(group);
});

// DELETE /api/v1/object-groups/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const householdId = req.householdId!;
  const existing = await prisma.objectGroup.findFirst({ where: { id: req.params.id, householdId } });
  if (!existing) return res.status(404).json({ error: 'Group not found' });

  await prisma.objectGroup.delete({ where: { id: req.params.id } });
  return res.json({ message: 'Deleted' });
});

export default router;