import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

const router = Router();

const WebhookSchema = z.object({
  name:     z.string().min(1).max(100),
  url:      z.string().url(),
  events:   z.array(z.enum([
    'transaction.created',
    'transaction.updated',
    'transaction.deleted',
    'goal.created',
    'goal.updated',
  ])).min(1),
  secret:   z.string().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/v1/webhooks
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { householdId: req.householdId! },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(webhooks);
  } catch (err) {
    req.log.error({ err }, 'webhooks/GET /');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/webhooks
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = WebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  try {
    const webhook = await prisma.webhook.create({
      data: {
        householdId: req.householdId!,
        name:     parsed.data.name,
        url:      parsed.data.url,
        events:   parsed.data.events,
        secret:   parsed.data.secret ?? null,
        isActive: parsed.data.isActive ?? true,
      },
    });
    return res.status(201).json(webhook);
  } catch (err) {
    req.log.error({ err }, 'webhooks/POST /');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/webhooks/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = WebhookSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  try {
    const existing = await prisma.webhook.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Webhook not found' });

    const webhook = await prisma.webhook.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    return res.json(webhook);
  } catch (err) {
    req.log.error({ err }, 'webhooks/PUT /:id');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/webhooks/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.webhook.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Webhook not found' });

    await prisma.webhook.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    req.log.error({ err }, 'webhooks/DELETE /:id');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/webhooks/:id/test
// Fires a test ping to the webhook URL
router.post('/:id/test', async (req: AuthRequest, res: Response) => {
  try {
    const hook = await prisma.webhook.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!hook) return res.status(404).json({ error: 'Webhook not found' });

    const body = JSON.stringify({
      event: 'ping',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test delivery from Kuber.' },
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Kuber-Event': 'ping',
      'X-Kuber-Delivery': crypto.randomUUID(),
    };

    if (hook.secret) {
      const sig = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');
      headers['X-Kuber-Signature'] = `sha256=${sig}`;
    }

    const response = await fetch(hook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    return res.json({ status: response.status, ok: response.ok });
  } catch (err: unknown) {
    return res.status(502).json({ error: (err as Error)?.message ?? 'Delivery failed' });
  }
});

// GET /api/v1/webhooks/:id/deliveries
router.get('/:id/deliveries', async (req: AuthRequest, res: Response) => {
  try {
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

    const deliveries = await prisma.webhookDelivery.findMany({
      where:   { webhookId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });
    return res.json(deliveries);
  } catch (err) {
    req.log.error({ err }, 'webhooks/deliveries');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
