import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const scheduleSchema = z.object({
  frequency: z.enum(['weekly', 'monthly']),
  enabled: z.boolean(),
});

// GET /api/v1/settings/report-schedule
router.get('/report-schedule', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const schedule = await prisma.reportSchedule.findUnique({ where: { householdId } });
    if (!schedule) {
      return res.json({ householdId, frequency: 'weekly', enabled: false, lastSentAt: null });
    }
    return res.json(schedule);
  } catch (err) {
    console.error('[schedules/report-schedule GET]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/settings/report-schedule
router.put('/report-schedule', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const userId = req.userId!;

    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    const { frequency, enabled } = parsed.data;

    const schedule = await prisma.reportSchedule.upsert({
      where: { householdId },
      update: { frequency, enabled, userId },
      create: { householdId, userId, frequency, enabled },
    });

    return res.json(schedule);
  } catch (err) {
    console.error('[schedules/report-schedule PUT]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
