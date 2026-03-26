import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { suggestCategory, batchAutoCategorize } from '../lib/autoCategorize.js';
import { getAiClientForHousehold } from '../lib/ai/index.js';

const router = Router();

const NOT_CONFIGURED_MSG = 'AI provider not configured. Go to Settings → Integrations → AI Advisor to set up Claude, OpenAI, Gemini, or Ollama (free, runs locally).';

// POST /api/v1/auto-categorize/suggest — suggest category for a single transaction
router.post('/suggest', async (req: AuthRequest, res: Response) => {
  try {
    const parse = z.object({
      description: z.string().min(1),
      amount: z.number(),
    }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ error: 'description and amount required' });

    // Check AI configured
    try {
      await getAiClientForHousehold(req.householdId!, prisma);
    } catch {
      return res.status(200).json({ suggestion: null, notConfigured: true, setupMessage: NOT_CONFIGURED_MSG });
    }

    const suggestion = await suggestCategory(prisma, req.householdId!, parse.data.description, parse.data.amount);
    return res.json({ suggestion, notConfigured: false });
  } catch (err) {
    console.error('[auto-categorize/suggest]', err);
    return res.status(500).json({ error: 'Categorization failed' });
  }
});

// POST /api/v1/auto-categorize/batch — auto-categorize all uncategorized transactions
router.post('/batch', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.body?.limit) || 50, 200);
    const result = await batchAutoCategorize(prisma, req.householdId!, limit);

    if (result.notConfigured) {
      return res.status(200).json({
        updated: 0, skipped: 0,
        notConfigured: true,
        setupMessage: NOT_CONFIGURED_MSG,
      });
    }

    return res.json({ ...result, notConfigured: false });
  } catch (err) {
    console.error('[auto-categorize/batch]', err);
    return res.status(500).json({ error: 'Batch categorization failed' });
  }
});

// GET /api/v1/auto-categorize/status — check if AI is configured + count uncategorized
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const [uncategorizedCount, configured] = await Promise.all([
      prisma.transaction.count({
        where: { householdId: req.householdId!, categoryId: null, isHidden: false },
      }),
      getAiClientForHousehold(req.householdId!, prisma).then(() => true).catch(() => false),
    ]);

    return res.json({
      configured,
      uncategorizedCount,
      setupMessage: configured ? null : NOT_CONFIGURED_MSG,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
