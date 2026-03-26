import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const liabilitySchema = z.object({
  name: z.string().min(1),
  type: z
    .enum(['mortgage', 'auto_loan', 'student_loan', 'credit_card', 'other'])
    .default('other'),
  originalAmount: z.number(),
  currentBalance: z.number(),
  interestRate: z.number().optional(),
  monthlyPayment: z.number().optional(),
  maturityDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  currency: z.string().default('USD'),
});

const liabilityUpdateSchema = liabilitySchema.partial();

// GET /api/v1/liabilities
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const liabilities = await prisma.manualLiability.findMany({
      where: { householdId: req.householdId! },
      orderBy: { createdAt: 'desc' },
    });
    res.json(liabilities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch liabilities' });
  }
});

// POST /api/v1/liabilities
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = liabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  try {
    const { maturityDate, ...rest } = parsed.data;
    const liability = await prisma.manualLiability.create({
      data: {
        ...rest,
        maturityDate: maturityDate ? new Date(maturityDate) : undefined,
        householdId: req.householdId!,
      },
    });
    res.status(201).json(liability);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create liability' });
  }
});

// PUT /api/v1/liabilities/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = liabilityUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  try {
    const existing = await prisma.manualLiability.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Liability not found' });

    const { maturityDate, ...rest } = parsed.data;
    const liability = await prisma.manualLiability.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        maturityDate: maturityDate ? new Date(maturityDate) : undefined,
      },
    });
    res.json(liability);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update liability' });
  }
});

// DELETE /api/v1/liabilities/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.manualLiability.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Liability not found' });

    await prisma.manualLiability.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete liability' });
  }
});

export default router;
