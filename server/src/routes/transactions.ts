import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TX_INCLUDE = {
  category: { select: { id: true, name: true, emoji: true } },
  merchant: { select: { name: true, displayName: true } },
  account: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
} as const;

function formatMerchantName(
  merchant: { name: string; displayName: string } | null,
  description: string
): string {
  if (!merchant) return description;
  return merchant.displayName || merchant.name || description;
}

function formatTx(t: any) {
  return {
    id: t.id,
    date: t.date.toISOString(),
    merchantName: formatMerchantName(t.merchant, t.description),
    originalDescription: t.originalDescription,
    amount: t.amount,
    categoryId: t.categoryId ?? null,
    categoryName: t.category?.name ?? null,
    categoryIcon: t.category?.emoji ?? null,
    categoryColor: null,
    accountId: t.accountId,
    accountName: t.account.name,
    isRecurring: t.isRecurring,
    needsReview: t.needsReview,
    isHidden: t.isHidden,
    isSplit: t.isSplit,
    notes: t.notes ?? null,
    tags: (t.tags ?? []).map((tt: any) => ({
      id: tt.tag.id,
      name: tt.tag.name,
      color: tt.tag.color,
    })),
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/transactions
// ---------------------------------------------------------------------------
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    // Pagination
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const skip = (page - 1) * limit;

    // Filters
    const {
      accountId,
      categoryId,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      search,
      isRecurring,
      needsReview,
      sort = 'date',
      order = 'desc',
      tagIds,
    } = req.query as Record<string, string | undefined>;

    // Build where clause
    const where: any = { householdId };

    if (accountId) where.accountId = accountId;
    if (categoryId) where.categoryId = categoryId;

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) where.amount.gte = parseFloat(minAmount);
      if (maxAmount !== undefined) where.amount.lte = parseFloat(maxAmount);
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { originalDescription: { contains: search, mode: 'insensitive' } },
        {
          merchant: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    if (isRecurring !== undefined) {
      where.isRecurring = isRecurring === 'true';
    }

    if (needsReview !== undefined) {
      where.needsReview = needsReview === 'true';
    }

    if (tagIds) {
      const ids = tagIds.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length > 0) {
        where.tags = { some: { tagId: { in: ids } } };
      }
    }

    // Build orderBy
    const allowedSortFields: Record<string, string> = {
      date: 'date',
      amount: 'amount',
      merchantName: 'description', // sort by description as proxy; merchant join sort not supported directly
    };
    const sortField = allowedSortFields[sort] ?? 'date';
    const sortOrder = order === 'asc' ? 'asc' : 'desc';
    const orderBy: any = { [sortField]: sortOrder };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: TX_INCLUDE,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return res.json({
      transactions: transactions.map(formatTx),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('[transactions/list]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/transactions/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    const tx = await prisma.transaction.findFirst({
      where: { id, householdId },
      include: TX_INCLUDE,
    });

    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const base = formatTx(tx);

    // Parse splits from splitDetails JSON if isSplit
    let splits: Array<{
      id: string;
      categoryId: string | null;
      categoryName: string | null;
      amount: number;
      notes: string | null;
    }> = [];

    if (tx.isSplit && tx.splitDetails) {
      const raw = tx.splitDetails as any;
      if (Array.isArray(raw)) {
        splits = raw.map((s: any) => ({
          id: s.id ?? '',
          categoryId: s.categoryId ?? null,
          categoryName: s.categoryName ?? null,
          amount: typeof s.amount === 'number' ? s.amount : 0,
          notes: s.notes ?? null,
        }));
      }
    }

    return res.json({ ...base, splits, attachments: [] });
  } catch (err) {
    console.error('[transactions/get]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions
// ---------------------------------------------------------------------------
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { date, description, amount, accountId, categoryId, notes, tagIds, isRecurring } = req.body;

    // Validation
    if (!date) return res.status(400).json({ error: 'date is required' });
    if (!description) return res.status(400).json({ error: 'description is required' });
    if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount is required' });
    if (amount === 0) return res.status(400).json({ error: 'amount must be non-zero' });
    if (!accountId) return res.status(400).json({ error: 'accountId is required' });

    // IDOR: verify account belongs to household
    const account = await prisma.account.findFirst({ where: { id: accountId, householdId } });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // Validate categoryId if provided
    if (categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId } });
      if (!cat) return res.status(404).json({ error: 'Category not found' });
    }

    // Validate tagIds if provided
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      const foundTags = await prisma.tag.findMany({
        where: { id: { in: tagIds }, householdId },
        select: { id: true },
      });
      if (foundTags.length !== tagIds.length) {
        return res.status(400).json({ error: 'One or more tagIds are invalid' });
      }
    }

    const tx = await prisma.transaction.create({
      data: {
        householdId,
        accountId,
        date: new Date(date),
        description,
        originalDescription: description,
        amount,
        categoryId: categoryId ?? null,
        notes: notes ?? null,
        isRecurring: isRecurring ?? false,
        needsReview: false,
        isHidden: false,
        isSplit: false,
        ...(tagIds && Array.isArray(tagIds) && tagIds.length > 0
          ? { tags: { create: tagIds.map((tagId: string) => ({ tagId })) } }
          : {}),
      },
      include: TX_INCLUDE,
    });

    return res.status(201).json(formatTx(tx));
  } catch (err) {
    console.error('[transactions/create]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/transactions/:id
// ---------------------------------------------------------------------------
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    // IDOR check
    const existing = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    const allowed = ['date', 'description', 'amount', 'categoryId', 'accountId', 'notes', 'isRecurring', 'needsReview', 'isHidden'];
    const data: any = {};

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === 'date') {
          data.date = new Date(req.body.date);
        } else if (field === 'amount' && req.body.amount === 0) {
          return res.status(400).json({ error: 'amount must be non-zero' });
        } else {
          data[field] = req.body[field];
        }
      }
    }

    // If changing accountId, verify it belongs to the household
    if (data.accountId) {
      const account = await prisma.account.findFirst({ where: { id: data.accountId, householdId } });
      if (!account) return res.status(404).json({ error: 'Account not found' });
    }

    // If changing categoryId, verify it belongs to the household
    if (data.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: data.categoryId, householdId } });
      if (!cat) return res.status(404).json({ error: 'Category not found' });
    }

    const tx = await prisma.transaction.update({
      where: { id },
      data,
      include: TX_INCLUDE,
    });

    return res.json(formatTx(tx));
  } catch (err) {
    console.error('[transactions/update]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/transactions/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;

    const existing = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    await prisma.transaction.delete({ where: { id } });

    return res.json({ success: true });
  } catch (err) {
    console.error('[transactions/delete]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/:id/tags
// ---------------------------------------------------------------------------
router.post('/:id/tags', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;
    const { tagIds } = req.body;

    if (!Array.isArray(tagIds) || tagIds.length === 0) {
      return res.status(400).json({ error: 'tagIds must be a non-empty array' });
    }

    // IDOR check
    const tx = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    // Validate tags belong to household
    const validTags = await prisma.tag.findMany({
      where: { id: { in: tagIds }, householdId },
      select: { id: true },
    });
    if (validTags.length !== tagIds.length) {
      return res.status(400).json({ error: 'One or more tagIds are invalid' });
    }

    // Upsert each tag link (createMany + skipDuplicates)
    await prisma.transactionTag.createMany({
      data: tagIds.map((tagId: string) => ({ transactionId: id, tagId })),
      skipDuplicates: true,
    });

    // Return updated tags
    const updated = await prisma.transactionTag.findMany({
      where: { transactionId: id },
      include: { tag: { select: { id: true, name: true, color: true } } },
    });

    return res.json(updated.map(tt => ({ id: tt.tag.id, name: tt.tag.name, color: tt.tag.color })));
  } catch (err) {
    console.error('[transactions/addTags]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/transactions/:id/tags/:tagId
// ---------------------------------------------------------------------------
router.delete('/:id/tags/:tagId', async (req: AuthRequest, res: Response) => {
  try {
    const { id, tagId } = req.params;
    const householdId = req.householdId!;

    // IDOR check
    const tx = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const link = await prisma.transactionTag.findUnique({
      where: { transactionId_tagId: { transactionId: id, tagId } },
    });
    if (!link) return res.status(404).json({ error: 'Tag not found on transaction' });

    await prisma.transactionTag.delete({
      where: { transactionId_tagId: { transactionId: id, tagId } },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('[transactions/removeTag]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/:id/review
// ---------------------------------------------------------------------------
router.post('/:id/review', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const householdId = req.householdId!;
    const { reviewed } = req.body;

    if (typeof reviewed !== 'boolean') {
      return res.status(400).json({ error: 'reviewed must be a boolean' });
    }

    const tx = await prisma.transaction.findFirst({ where: { id, householdId } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const updated = await prisma.transaction.update({
      where: { id },
      data: { needsReview: !reviewed },
      select: { needsReview: true },
    });

    return res.json({ needsReview: updated.needsReview });
  } catch (err) {
    console.error('[transactions/review]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/transactions/bulk
// ---------------------------------------------------------------------------
router.post('/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const { action, ids, categoryId } = req.body;

    if (!action || typeof action !== 'string') {
      return res.status(400).json({ error: 'action is required' });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 transactions per bulk request' });
    }

    // Verify all transactions belong to the household
    const count = await prisma.transaction.count({
      where: { id: { in: ids }, householdId },
    });
    if (count !== ids.length) {
      return res.status(404).json({ error: 'One or more transactions not found' });
    }

    switch (action) {
      case 'recategorize': {
        if (!categoryId || typeof categoryId !== 'string') {
          return res.status(400).json({ error: 'categoryId is required for recategorize action' });
        }
        const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId } });
        if (!cat) return res.status(404).json({ error: 'Category not found' });
        await prisma.transaction.updateMany({
          where: { id: { in: ids }, householdId },
          data: { categoryId },
        });
        break;
      }

      case 'mark-reviewed': {
        await prisma.transaction.updateMany({
          where: { id: { in: ids }, householdId },
          data: { needsReview: false },
        });
        break;
      }

      case 'hide': {
        await prisma.transaction.updateMany({
          where: { id: { in: ids }, householdId },
          data: { isHidden: true },
        });
        break;
      }

      case 'delete': {
        await prisma.transaction.deleteMany({
          where: { id: { in: ids }, householdId },
        });
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    return res.json({ updated: ids.length });
  } catch (err: any) {
    console.error('[transactions/bulk]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
