import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { startBatchAutoCategorize, getBatchJobState, detectRuleSuggestions, suggestCategory } from '../lib/autoCategorize.js';
import { getAiClientForHousehold } from '../lib/ai/index.js';
import { rulesAppliedTotal } from '../lib/metrics.js';
import { logAudit } from '../lib/audit.js';
import { queryJournalsWithRelations } from '../lib/transactionJournalService.js';

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

    const [journals, total, ruleSuggestions] = await Promise.all([
      queryJournalsWithRelations({
        householdId: req.householdId!,
        needsReview: true,
        hasAiSuggestion: true,
        orderBy: 'date',
        orderDirection: 'desc',
        skip,
        limit,
      }, prisma),
      prisma.transactionJournal.count({
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

    const transactions = journals.map(j => ({
      id: j.id,
      description: j.description,
      amount: Number(j.amountDecimal),
      date: j.date,
      aiSuggestedCategoryId: j.aiSuggestedCategoryId,
      aiSuggestedCategoryName: j.aiSuggestedCategoryName,
      aiSuggestionConfidence: j.aiSuggestionConfidence,
      aiSuggestedCategory: j.aiSuggestedCategory,
      account: j.entries[0] ? { name: j.entries[0].account.name } : null,
    }));

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
    icon: z.string().optional().nullable(),
  }).optional(),
});

router.post('/confirm', async (req: AuthRequest, res: Response) => {
  try {
    const parse = confirmSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: parse.error.errors[0]?.message });

    const { transactionId, action, categoryId, createCategory } = parse.data;
    const householdId = req.householdId!;

    const journal = await prisma.transactionJournal.findFirst({
      where: { id: transactionId, householdId, needsReview: true },
      select: {
        id: true,
        description: true,
        aiSuggestedCategoryId: true,
        needsReview: true,
      },
    });
    if (!journal) return res.status(404).json({ error: 'Transaction not found or already reviewed' });

    if (action === 'skip') {
      await prisma.transactionJournal.update({
        where: { id: transactionId },
        data: {
          needsReview: false,
          aiSuggestedCategoryId: null,
          aiSuggestedCategoryName: null,
          aiSuggestionConfidence: null,
        },
      });
      logAudit({
        householdId,
        userId: req.userId!,
        action: 'UPDATE',
        entity: 'TRANSACTION',
        entityId: transactionId,
        after: { action: 'skip', needsReview: false },
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
          icon: createCategory.icon ?? null,
        },
      });
      finalCategoryId = newCat.id;
    }

    if (!finalCategoryId) {
      return res.status(400).json({ error: 'categoryId or createCategory required for approve/reject' });
    }

    // Save learning example when user corrects with a different category
    if (finalCategoryId !== journal.aiSuggestedCategoryId) {
      await prisma.categoryLearningExample.create({
        data: {
          householdId,
          descriptionPattern: journal.description,
          correctCategoryId: finalCategoryId,
        },
      });
    }

    await prisma.transactionJournal.update({
      where: { id: transactionId },
      data: {
        categoryId: finalCategoryId,
        needsReview: false,
        aiSuggestedCategoryId: null,
        aiSuggestedCategoryName: null,
        aiSuggestionConfidence: null,
      },
    });

    logAudit({
      householdId,
      userId: req.userId!,
      action: 'UPDATE',
      entity: 'TRANSACTION',
      entityId: transactionId,
      after: { action: 'approve', categoryId: finalCategoryId },
    });

    return res.json({ ok: true, categoryId: finalCategoryId });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/confirm');
    return res.status(500).json({ error: 'Failed to confirm categorization' });
  }
});

// POST /api/v1/auto-categorize/reject-bulk — reject all suggestions (clear AI suggestions, keep uncategorized)
// Uses cursor-based pagination to handle large datasets without timeout
router.post('/reject-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const cursor = req.body?.cursor as string | undefined;
    const limit = Math.min(parseInt(req.body?.limit as string) || 500, 500);

    const toReject = await prisma.transactionJournal.findMany({
      where: {
        householdId,
        needsReview: true,
        aiSuggestedCategoryId: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true },
    });

    const hasMore = toReject.length > limit;
    const items = hasMore ? toReject.slice(0, limit) : toReject;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    await prisma.$transaction(
      items.map((t) =>
        prisma.transactionJournal.update({
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

    if (items.length > 0) {
      logAudit({
        householdId,
        userId: req.userId!,
        action: 'UPDATE',
        entity: 'TRANSACTION',
        entityId: 'bulk',
        after: { action: 'reject-bulk', count: items.length },
      });
    }

    return res.json({ rejected: items.length, cursor: nextCursor, hasMore });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/reject-bulk');
    return res.status(500).json({ error: 'Bulk rejection failed' });
  }
});

// POST /api/v1/auto-categorize/skip-bulk — skip all transactions (clear review flag, keep current category)
// Uses cursor-based pagination to handle large datasets without timeout
router.post('/skip-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const cursor = req.body?.cursor as string | undefined;
    const limit = Math.min(parseInt(req.body?.limit as string) || 500, 500);

    const toSkip = await prisma.transactionJournal.findMany({
      where: {
        householdId,
        needsReview: true,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true },
    });

    const hasMore = toSkip.length > limit;
    const items = hasMore ? toSkip.slice(0, limit) : toSkip;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    await prisma.$transaction(
      items.map((t) =>
        prisma.transactionJournal.update({
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

    if (items.length > 0) {
      logAudit({
        householdId,
        userId: req.userId!,
        action: 'UPDATE',
        entity: 'TRANSACTION',
        entityId: 'bulk',
        after: { action: 'skip-bulk', count: items.length },
      });
    }

    return res.json({ skipped: items.length, cursor: nextCursor, hasMore });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/skip-bulk');
    return res.status(500).json({ error: 'Bulk skip failed' });
  }
});

// POST /api/v1/auto-categorize/confirm-bulk — approve all suggestions with a matched category
// Uses cursor-based pagination to handle large datasets without timeout
router.post('/confirm-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const cursor = req.body?.cursor as string | undefined;
    const limit = Math.min(parseInt(req.body?.limit as string) || 500, 500);

    const toApply = await prisma.transactionJournal.findMany({
      where: {
        householdId,
        needsReview: true,
        aiSuggestedCategoryId: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true, aiSuggestedCategoryId: true },
    });

    const hasMore = toApply.length > limit;
    const items = hasMore ? toApply.slice(0, limit) : toApply;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    await prisma.$transaction(
      items.map((t) =>
        prisma.transactionJournal.update({
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

    if (items.length > 0) {
      rulesAppliedTotal.inc({ household_id: householdId });
      logAudit({
        householdId,
        userId: req.userId!,
        action: 'UPDATE',
        entity: 'TRANSACTION',
        entityId: 'bulk',
        after: { action: 'confirm-bulk', count: items.length },
      });
    }

    return res.json({ approved: items.length, cursor: nextCursor, hasMore });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/confirm-bulk');
    return res.status(500).json({ error: 'Bulk approval failed' });
  }
});

// POST /api/v1/auto-categorize/re-run — re-run AI on transactions already in the review queue
// Uses cursor-based pagination to handle large datasets without timeout
router.post('/re-run', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const limit = Math.min(parseInt(req.body?.limit as string) || 50, 200);
    const cursor = req.body?.cursor as string | undefined;

    try {
      await getAiClientForHousehold(householdId, prisma);
    } catch {
      return res.status(200).json({ updated: 0, notConfigured: true, setupMessage: NOT_CONFIGURED_MSG });
    }

    const pending = await prisma.transactionJournal.findMany({
      where: {
        householdId,
        needsReview: true,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true, description: true, amountDecimal: true },
    });

    const hasMore = pending.length > limit;
    const items = hasMore ? pending.slice(0, limit) : pending;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    let updated = 0;
    for (const txn of items) {
      const suggestion = await suggestCategory(prisma, householdId, txn.description, Number(txn.amountDecimal));
      if (suggestion && suggestion.confidence >= 0.5) {
        await prisma.transactionJournal.update({
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

    return res.json({ updated, total: items.length, notConfigured: false, cursor: nextCursor, hasMore });
  } catch (err) {
    req.log.error({ err }, 'auto-categorize/re-run');
    return res.status(500).json({ error: 'Re-run failed' });
  }
});

// GET /api/v1/auto-categorize/status
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const [uncategorizedCount, reviewCount, configured] = await Promise.all([
      prisma.transactionJournal.count({
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
      prisma.transactionJournal.count({
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
