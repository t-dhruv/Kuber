import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { calculateTfsaRoom, calculateRrspRoom } from '../lib/taxRoomCalculator.js';
import { NOT_DELETED } from '../lib/softDeleteWhere.js';

const router = Router();

const TaxAccountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['TFSA', 'RRSP', 'FHSA', 'RESP', '401k', 'IRA']),
  linkedAccountId: z.string().optional().nullable(),
  memberName: z.string().optional().nullable(),
  birthYear: z.number().int().min(1900).max(2010).optional().nullable(),
  annualRoomCad: z.number().min(0).optional(),
  totalRoomEver: z.number().min(0).optional(),
  contributionsYtd: z.number().min(0).optional(),
  withdrawalsYtd: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
});

async function linkedAccountBelongsToHousehold(linkedAccountId: string | null | undefined, householdId: string) {
  if (!linkedAccountId) return true;
  const account = await prisma.account.findFirst({
    where: { id: linkedAccountId, householdId, ...NOT_DELETED },
  });
  return Boolean(account);
}

// GET /api/v1/tax-accounts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.taxAccount.findMany({
      where: { householdId: req.householdId! },
      orderBy: { createdAt: 'asc' },
    });
    return res.json(accounts);
  } catch (err) {
    req.log.error({ err }, 'tax-accounts GET');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/tax-accounts/household-summary
router.get('/household-summary', async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.taxAccount.findMany({
      where: { householdId: req.householdId! },
    });
    const currentYear = new Date().getFullYear();

    const summary = accounts.map((acc) => {
      let roomRemaining = 0;
      let overContribution = 0;

      if (acc.type === 'TFSA' && acc.birthYear) {
        const calc = calculateTfsaRoom(acc.birthYear, currentYear, acc.contributionsYtd, acc.withdrawalsYtd);
        roomRemaining = calc.roomRemaining;
        overContribution = calc.overContribution;
      } else if (acc.type === 'RRSP') {
        const calc = calculateRrspRoom(currentYear, acc.contributionsYtd, acc.totalRoomEver);
        roomRemaining = calc.roomRemaining;
        overContribution = calc.overContribution;
      } else {
        roomRemaining = Math.max(0, acc.totalRoomEver - acc.contributionsYtd);
      }

      const pctUsed = acc.totalRoomEver > 0 ? (acc.contributionsYtd / acc.totalRoomEver) * 100 : 0;
      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        memberName: acc.memberName,
        contributionsYtd: acc.contributionsYtd,
        roomRemaining,
        overContribution,
        pctUsed: Math.min(100, Math.round(pctUsed)),
        alert: overContribution > 0 ? 'over' : pctUsed > 90 ? 'warning' : 'ok',
      };
    });

    return res.json({ accounts: summary });
  } catch (err) {
    req.log.error({ err }, 'tax-accounts/household-summary');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/tax-accounts
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const parse = TaxAccountSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const householdId = req.householdId!;
    if (!(await linkedAccountBelongsToHousehold(parse.data.linkedAccountId, householdId))) {
      return res.status(400).json({ error: 'Invalid linkedAccountId' });
    }
    const acc = await prisma.taxAccount.create({
      data: { ...parse.data, householdId },
    });
    return res.status(201).json(acc);
  } catch (err) {
    req.log.error({ err }, 'tax-accounts POST');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/tax-accounts/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const parse = TaxAccountSchema.partial().safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.flatten() });
    const existing = await prisma.taxAccount.findFirst({ where: { id: req.params.id, householdId: req.householdId! } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!(await linkedAccountBelongsToHousehold(parse.data.linkedAccountId, req.householdId!))) {
      return res.status(400).json({ error: 'Invalid linkedAccountId' });
    }
    const acc = await prisma.taxAccount.update({ where: { id: req.params.id }, data: parse.data });
    return res.json(acc);
  } catch (err) {
    req.log.error({ err }, 'tax-accounts PUT');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/tax-accounts/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.taxAccount.findFirst({ where: { id: req.params.id, householdId: req.householdId! } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await prisma.taxAccount.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'tax-accounts DELETE');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
