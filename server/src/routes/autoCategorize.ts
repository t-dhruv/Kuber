import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { startBatchAutoCategorize, getBatchJobState, detectRuleSuggestions, suggestCategory } from '../lib/autoCategorize.js';
import { getAiClientForHousehold } from '../lib/ai/index.js';
import { rulesAppliedTotal } from '../lib/metrics.js';

const router = Router();

const NOT_CONFIGURED_MSG =
  'AI provider not configured. Go to Settings → Integrations → AI Advisor to set up Claude, OpenAI, Gemini, or Ollama (free, runs locally).';

// POST /api/v1/auto-categorize/batch — start async categorization job, returns jobId immediately
router.post('/batch', async (req: AuthRequest, res: Response) => {
  try {
    const limit = req.body?.limit ? Math.min(parseInt(req.body.limit), 1000) : 1000;
    const result = await startBatchAutoCategorize(prisma, req.householdId!, limit);

    if (result.notConfigured) {
      return res.status(200).json({
        jobId: null,
        total: 0,
        notConfigured: true,
        setupMessage: NOT_CONFIGURED_MSG,
      });
    }

    return res.json({ jobId: result.jobId, total: result.total, notConfigured: false });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/batch');
    return res.status(500).json({ error: 'Batch categorization failed' });
  }
});

// GET /api/v1/auto-categorize/batch/progress/:jobId — poll job progress
router.get('/batch/progress/:jobId', (req: AuthRequest, res: Response) => {
  const state = getBatchJobState(req.params.jobId);
  if (!state) return res.status(404).json({ error: 'Job not found' });
  return res.json(state);
});

// GET /api/v1/auto-categorize/review-queue — paginated list of transactions needing review
router.get('/review-queue', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const skip = (page - 1) * limit;

    const [transactions, total, ruleSuggestions] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          householdId: req.householdId!,
          needsReview: true,
          OR: [
            { aiSuggestedCategoryId: { not: null } },
            { aiSuggestedCategoryName: { not: null } },
          ],
        },
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
        where: {
          householdId: req.householdId!,
          needsReview: true,
          OR: [
            { aiSuggestedCategoryId: { not: null } },
            { aiSuggestedCategoryName: { not: null } },
          ],
        },
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
      where: { id: transactionId, householdId, needsReview: true },
      select: {
        id: true,
        description: true,
        aiSuggestedCategoryId: true,
        needsReview: true,
      },
    });
    if (!txn) return res.status(404).json({ error: 'Transaction not found or already reviewed' });

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
    if (finalCategoryId !== txn.aiSuggestedCategoryId) {
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

// POST /api/v1/auto-categorize/reject-bulk — reject all suggestions (clear AI suggestions, keep uncategorized)
router.post('/reject-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const CAP = 500;
    const toReject = await prisma.transaction.findMany({
      where: {
        householdId,
        needsReview: true,
        aiSuggestedCategoryId: { not: null },
      },
      take: CAP,
      select: { id: true },
    });

    await prisma.$transaction(
      toReject.map((t) =>
        prisma.transaction.update({
          where: { id: t.id },
          data: {
            needsReview: false,
            aiSuggestedCategoryId: null,
            aiSuggestedCategoryName: null,
            aiSuggestionConfidence: null,
          },
        })
      )
    );

    return res.json({ rejected: toReject.length });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/reject-bulk');
    return res.status(500).json({ error: 'Bulk rejection failed' });
  }
});

// POST /api/v1/auto-categorize/skip-bulk — skip all transactions (clear review flag, keep current category)
router.post('/skip-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const CAP = 500;
    const toSkip = await prisma.transaction.findMany({
      where: {
        householdId,
        needsReview: true,
      },
      take: CAP,
      select: { id: true },
    });

    await prisma.$transaction(
      toSkip.map((t) =>
        prisma.transaction.update({
          where: { id: t.id },
          data: {
            needsReview: false,
            aiSuggestedCategoryId: null,
            aiSuggestedCategoryName: null,
            aiSuggestionConfidence: null,
          },
        })
      )
    );

    return res.json({ skipped: toSkip.length });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/skip-bulk');
    return res.status(500).json({ error: 'Bulk skip failed' });
  }
});

// POST /api/v1/auto-categorize/confirm-bulk — approve all suggestions with a matched category
router.post('/confirm-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    const CAP = 500;
    const toApply = await prisma.transaction.findMany({
      where: {
        householdId,
        needsReview: true,
        aiSuggestedCategoryId: { not: null },
      },
      take: CAP,
      select: { id: true, aiSuggestedCategoryId: true },
    });

    await prisma.$transaction(
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

    return res.json({ approved: toApply.length, capped: toApply.length === CAP });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/confirm-bulk');
    return res.status(500).json({ error: 'Bulk approval failed' });
  }
});

// POST /api/v1/auto-categorize/re-run — re-run AI on transactions already in the review queue
router.post('/re-run', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;

    try {
      await getAiClientForHousehold(householdId, prisma);
    } catch {
      return res.status(200).json({ updated: 0, notConfigured: true, setupMessage: NOT_CONFIGURED_MSG });
    }

    const pending = await prisma.transaction.findMany({
      where: { householdId, needsReview: true },
      select: { id: true, description: true, amount: true },
    });

    let updated = 0;
    for (const txn of pending) {
      const suggestion = await suggestCategory(prisma, householdId, txn.description, txn.amount);
      if (suggestion && suggestion.confidence >= 0.5) {
        await prisma.transaction.update({
          where: { id: txn.id },
          data: {
            aiSuggestedCategoryId: suggestion.categoryId ?? null,
            aiSuggestedCategoryName: suggestion.suggestedNewName ?? null,
            aiSuggestionConfidence: suggestion.confidence,
          },
        });
        updated++;
      }
    }

    return res.json({ updated, total: pending.length, notConfigured: false });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/re-run');
    return res.status(500).json({ error: 'Re-run failed' });
  }
});

// GET /api/v1/auto-categorize/status
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const [uncategorizedCount, reviewCount, configured] = await Promise.all([
      prisma.transaction.count({
        where: {
          householdId: req.householdId!,
          categoryId: null,
          isHidden: false,
          OR: [
            { needsReview: false },
            // stale: needsReview but AI fields never populated
            { needsReview: true, aiSuggestedCategoryId: null, aiSuggestedCategoryName: null },
          ],
        },
      }),
      prisma.transaction.count({
        where: {
          householdId: req.householdId!,
          needsReview: true,
          OR: [
            { aiSuggestedCategoryId: { not: null } },
            { aiSuggestedCategoryName: { not: null } },
          ],
        },
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
