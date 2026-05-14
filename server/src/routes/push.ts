import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getVapidPublicKey } from '../lib/webPush';

const router = Router();

// GET /api/v1/push/vapid-public-key
router.get('/vapid-public-key', (_req, res: Response) => {
  const key = getVapidPublicKey();
  if (!key) return res.status(503).json({ error: 'Push notifications not configured' });
  return res.json({ publicKey: key });
});

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth:   z.string().min(1),
  }),
});

// POST /api/v1/push/subscribe
router.post('/subscribe', async (req: AuthRequest, res: Response) => {
  const parsed = SubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  try {
    const { endpoint, keys } = parsed.data;
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.userId! },
      create: {
        householdId: req.householdId!,
        userId: req.userId!,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });
    return res.status(201).json({ id: sub.id });
  } catch (err) {
    req.log.error({ err }, 'push/subscribe');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/push/unsubscribe
router.delete('/unsubscribe', async (req: AuthRequest, res: Response) => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, householdId: req.householdId! },
    });
    return res.json({ message: 'Unsubscribed' });
  } catch (err) {
    req.log.error({ err }, 'push/unsubscribe');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
