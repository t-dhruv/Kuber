import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { batchAutoCategorize, detectRuleSuggestions } from '../lib/autoCategorize.js';
import { getAiClientForHousehold } from '../lib/ai/index.js';
import { rulesAppliedTotal } from '../lib/metrics.js';

const router = Router();

const NOT_CONFIGURED_MSG =
  'AI provider not configured. Go to Settings → Integrations → AI Advisor to set up Claude, OpenAI, Gemini, or Ollama (free, runs locally).';

// POST /api/v1/auto-categorize/batch — queue uncategorized transactions for review
router.post('/batch', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.body?.limit) || 50, 200);
    const result = await batchAutoCategorize(prisma, req.householdId!, limit);

    if (result.notConfigured) {
      return res.status(200).json({
        queued: 0, skipped: 0,
        notConfigured: true,
        setupMessage: NOT_CONFIGURED_MSG,
      });
    }

    return res.json({ ...result, notConfigured: false });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/batch');
    return res.status(500).json({ error: 'Batch categorization failed' });
  }
});

// GET /api/v1/auto-categorize/review-queue — paginated list of transactions needing review
router.get('/review-queue', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const skip = (page - 1) * limit;

    const [transactions, total, ruleSuggestions] = await Promise.all([
      prisma.transaction.findMany({
        where: { householdId: req.householdId!, needsReview: true },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          description: true,
          amount: true,
          date: true,
          aiSuggestedCategoryId: true,
          aiSuggestedCategoryName: true,
          aiSuggestionConfidence: true,
          aiSuggestedCategory: { select: { id: true, name: true, emoji: true } },
          account: { select: { name: true } },
        },
      }),
      prisma.transaction.count({
        where: { householdId: req.householdId!, needsReview: true },
      }),
      detectRuleSuggestions(prisma, req.householdId!),
    ]);

    return res.json({ transactions, total, page, limit, ruleSuggestions });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/review-queue');
    return res.status(500).json({ error: 'Failed to load review queue' });
  }
});

// POST /api/v1/auto-categorize/confirm — confirm or reject a single suggestion
const confirmSchema = z.object({
  transactionId: z.string().min(1),
  action: z.enum(['approve', 'reject', 'skip']),
  categoryId: z.string().optional(),
  createCategory: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    emoji: z.string().optional().nullable(),
  }).optional(),
});

router.post('/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const parse = confirmSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.errors[0]?.message });

    const { transactionId, action, categoryId, createCategory } = parse.data;
    const householdId = req.householdId!;

    const txn = await prisma.transaction.findFirst({
      where: { id: transactionId, householdId },
      select: {
        id: true,
        description: true,
        aiSuggestedCategoryId: true,
        needsReview: true,
      },
    });
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    if (action === 'skip') {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          needsReview: false,
          aiSuggestedCategoryId: null,
          aiSuggestedCategoryName: null,
          aiSuggestionConfidence: null,
        },
      });
      return res.json({ ok: true });
    }

    let finalCategoryId = categoryId;

    if (createCategory) {
      const newCat = await prisma.category.create({
        data: {
          householdId,
          name: createCategory.name.trim(),
          type: createCategory.type,
          emoji: createCategory.emoji ?? null,
        },
      });
      finalCategoryId = newCat.id;
    }

    if (!finalCategoryId) {
      return res.status(400).json({ error: 'categoryId or createCategory required for approve/reject' });
    }

    // Save learning example when user corrects with a different category
    if (action === 'reject' && finalCategoryId !== txn.aiSuggestedCategoryId) {
      await prisma.categoryLearningExample.create({
        data: {
          householdId,
          descriptionPattern: txn.description,
          correctCategoryId: finalCategoryId,
        },
      });
    }

    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        categoryId: finalCategoryId,
        needsReview: false,
        aiSuggestedCategoryId: null,
        aiSuggestedCategoryName: null,
        aiSuggestionConfidence: null,
      },
    });

    return res.json({ ok: true, categoryId: finalCategoryId });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/confirm');
    return res.status(500).json({ error: 'Failed to confirm categorization' });
  }
});

// POST /api/v1/auto-categorize/confirm-bulk — approve all suggestions with a matched category
router.post('/confirm-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    // Find transactions with a matched AI category
    const toApply = await prisma.transaction.findMany({
      where: {
        householdId,
        needsReview: true,
        aiSuggestedCategoryId: { not: null },
      },
      select: { id: true, aiSuggestedCategoryId: true },
    });

    await Promise.all(
      toApply.map((t) =>
        prisma.transaction.update({
          where: { id: t.id },
          data: {
            categoryId: t.aiSuggestedCategoryId,
            needsReview: false,
            aiSuggestedCategoryId: null,
            aiSuggestedCategoryName: null,
            aiSuggestionConfidence: null,
          },
        })
      )
    );

    if (toApply.length > 0) {
      rulesAppliedTotal.inc({ household_id: householdId });
    }

    return res.json({ approved: toApply.length });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/confirm-bulk');
    return res.status(500).json({ error: 'Bulk approval failed' });
  }
});

// GET /api/v1/auto-categorize/status
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const [uncategorizedCount, reviewCount, configured] = await Promise.all([
      prisma.transaction.count({
        where: { householdId: req.householdId!, categoryId: null, isHidden: false, needsReview: false },
      }),
      prisma.transaction.count({
        where: { householdId: req.householdId!, needsReview: true },
      }),
      getAiClientForHousehold(req.householdId!, prisma).then(() => true).catch(() => false),
    ]);

    return res.json({
      configured,
      uncategorizedCount,
      reviewCount,
      setupMessage: configured ? null : NOT_CONFIGURED_MSG,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
