import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { logAudit } from '../lib/audit';

const router = Router();

const FREQ_VALUES = ['weekly', 'monthly', 'quarterly', 'yearly'] as const;

const billCreateSchema = z.object({
  name:        z.string().min(1),
  amountMin:   z.number().nonnegative().optional(),
  amountMax:   z.number().nonnegative().optional(),
  currency:    z.string().length(3).optional(),
  startDate:   z.string().datetime(),
  endDate:     z.string().datetime().optional(),
  repeatFreq:  z.enum(FREQ_VALUES),
  skipPeriods: z.number().int().nonnegative().optional(),
  notes:       z.string().optional(),
});

const billUpdateSchema = billCreateSchema.partial();

function formatBill(b: Record<string, unknown>) {
  return {
    ...b,
    amountMin: b.amountMin !== null ? Number(b.amountMin) : null,
    amountMax: b.amountMax !== null ? Number(b.amountMax) : null,
  };
}

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const bills = await prisma.bill.findMany({
      where:   { householdId: req.householdId!, isDeleted: false },
      include: { paidPeriods: { orderBy: { periodKey: 'desc' }, take: 3 } },
      orderBy: { name: 'asc' },
    });
    return res.json(bills.map(formatBill));
  } catch (err) {
    req.log.error({ err }, 'bills/list');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const year      = parseInt(req.query.year  as string) || new Date().getFullYear();
    const month     = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const periodKey = `${year}-${String(month).padStart(2, '0')}`;

    const bills = await prisma.bill.findMany({
      where:   { householdId: req.householdId!, isActive: true, isDeleted: false },
      include: { paidPeriods: { where: { periodKey } } },
    });

    return res.json(bills.map(b => ({
      ...formatBill(b),
      paid: b.paidPeriods.length > 0,
      periodKey,
    })));
  } catch (err) {
    req.log.error({ err }, 'bills/status');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = billCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const d = parsed.data;

    const bill = await prisma.bill.create({
      data: {
        householdId: req.householdId!,
        name:        d.name,
        amountMin:   d.amountMin !== undefined ? d.amountMin : null,
        amountMax:   d.amountMax !== undefined ? d.amountMax : null,
        currency:    d.currency ?? 'USD',
        startDate:   new Date(d.startDate),
        endDate:     d.endDate ? new Date(d.endDate) : null,
        repeatFreq:  d.repeatFreq,
        skipPeriods: d.skipPeriods ?? 0,
        notes:       d.notes ?? null,
      },
    });
    logAudit({ householdId: req.householdId!, userId: req.userId!, action: 'CREATE', entity: 'BILL', entityId: bill.id, after: bill as Record<string, unknown> });
    return res.status(201).json(formatBill(bill));
  } catch (err) {
    req.log.error({ err }, 'bills/create');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.bill.findFirst({ where: { id: req.params.id, householdId: req.householdId!, isDeleted: false } });
    if (!existing) return res.status(404).json({ error: 'Bill not found' });

    const parsed = billUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const d = parsed.data;

    const bill = await prisma.bill.update({
      where: { id: req.params.id },
      data:  {
        ...(d.name        !== undefined && { name:        d.name }),
        ...(d.amountMin   !== undefined && { amountMin:   d.amountMin }),
        ...(d.amountMax   !== undefined && { amountMax:   d.amountMax }),
        ...(d.currency    !== undefined && { currency:    d.currency }),
        ...(d.startDate   !== undefined && { startDate:   new Date(d.startDate) }),
        ...(d.endDate     !== undefined && { endDate:     new Date(d.endDate) }),
        ...(d.repeatFreq  !== undefined && { repeatFreq:  d.repeatFreq }),
        ...(d.skipPeriods !== undefined && { skipPeriods: d.skipPeriods }),
        ...(d.notes       !== undefined && { notes:       d.notes }),
      },
    });
    return res.json(formatBill(bill));
  } catch (err) {
    req.log.error({ err }, 'bills/update');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.bill.findFirst({ where: { id: req.params.id, householdId: req.householdId!, isDeleted: false } });
    if (!existing) return res.status(404).json({ error: 'Bill not found' });

    await prisma.bill.update({ where: { id: req.params.id }, data: { isDeleted: true, isActive: false } });
    logAudit({ householdId: req.householdId!, userId: req.userId!, action: 'DELETE', entity: 'BILL', entityId: req.params.id, before: existing as Record<string, unknown> });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'bills/delete');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
