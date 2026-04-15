import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const assetSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['real_estate', 'vehicle', 'crypto', 'collectible', 'other']).default('other'),
  currentValue: z.number(),
  purchaseValue: z.number().optional(),
  purchaseDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  currency: z.string().default('USD'),
});

const assetUpdateSchema = assetSchema.partial();

// GET /api/v1/assets
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const assets = await prisma.manualAsset.findMany({
      where: { householdId: req.householdId! },
      include: { _count: { select: { snapshots: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(assets);
  } catch (err) {
    req.log.error({ err }, 'error');
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// GET /api/v1/assets/net-worth-breakdown
router.get('/net-worth-breakdown', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    // Bank/cash accounts (non-investment)
    const bankAccounts = await prisma.account.aggregate({
      where: {
        householdId,
        type: { not: 'investment' },
        isHidden: false,
        excludeFromNetWorth: false,
      },
      _sum: { balance: true },
    });

    // Investment holdings: sum currentPrice * shares for accounts in household
    const investmentAccounts = await prisma.account.findMany({
      where: { householdId, type: 'investment' },
      select: { id: true },
    });
    const investmentAccountIds = investmentAccounts.map((a) => a.id);

    const holdings = await prisma.investmentHolding.findMany({
      where: { accountId: { in: investmentAccountIds } },
      select: { currentPrice: true, shares: true },
    });
    const investmentsTotal = holdings.reduce((sum, h) => sum + h.currentPrice * h.shares, 0);

    // Manual assets
    const manualAssetsAgg = await prisma.manualAsset.aggregate({
      where: { householdId },
      _sum: { currentValue: true },
    });

    // Manual liabilities
    const manualLiabilitiesAgg = await prisma.manualLiability.aggregate({
      where: { householdId },
      _sum: { currentBalance: true },
    });

    const bankAccountsTotal = bankAccounts._sum.balance ?? 0;
    const manualAssetsTotal = manualAssetsAgg._sum.currentValue ?? 0;
    const manualLiabilitiesTotal = manualLiabilitiesAgg._sum.currentBalance ?? 0;

    res.json({
      bankAccounts: bankAccountsTotal,
      investments: investmentsTotal,
      manualAssets: manualAssetsTotal,
      manualLiabilities: manualLiabilitiesTotal,
      total: bankAccountsTotal + investmentsTotal + manualAssetsTotal - manualLiabilitiesTotal,
    });
  } catch (err) {
    req.log.error({ err }, 'error');
    res.status(500).json({ error: 'Failed to fetch net worth breakdown' });
  }
});

// POST /api/v1/assets
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  try {
    const { purchaseDate, ...rest } = parsed.data;
    const asset = await prisma.manualAsset.create({
      data: {
        ...rest,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        householdId: req.householdId!,
        snapshots: {
          create: { value: parsed.data.currentValue },
        },
      },
      include: { _count: { select: { snapshots: true } } },
    });
    res.status(201).json(asset);
  } catch (err) {
    req.log.error({ err }, 'error');
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// PUT /api/v1/assets/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = assetUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  try {
    const existing = await prisma.manualAsset.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Asset not found' });

    const { purchaseDate, ...rest } = parsed.data;
    const valueChanged =
      parsed.data.currentValue !== undefined && parsed.data.currentValue !== existing.currentValue;

    const asset = await prisma.manualAsset.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
        ...(valueChanged && {
          snapshots: { create: { value: parsed.data.currentValue! } },
        }),
      },
      include: { _count: { select: { snapshots: true } } },
    });
    res.json(asset);
  } catch (err) {
    req.log.error({ err }, 'error');
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// DELETE /api/v1/assets/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.manualAsset.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Asset not found' });

    await prisma.manualAsset.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'error');
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

export default router;
