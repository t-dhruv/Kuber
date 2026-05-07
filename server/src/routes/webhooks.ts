import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireHouseholdRole } from '../middleware/auth';
import { assertSafeOutboundUrl } from '../lib/safeOutboundUrl';
import { decryptWebhookSecret, encryptWebhookSecret, maskWebhookSecret } from '../lib/webhookSecret';

const router = Router();
const requireHouseholdAdmin = requireHouseholdRole(['owner', 'admin']);

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
router.get('/', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { householdId: req.householdId! },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(webhooks.map(maskWebhookSecret));
  } catch (err) {
    req.log.error({ err }, 'webhooks/GET /');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/webhooks
router.post('/', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = WebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  let safeUrl: string;
  try {
    safeUrl = await assertSafeOutboundUrl(parsed.data.url);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Unsafe webhook URL' });
  }
  try {
    const webhook = await prisma.webhook.create({
      data: {
        householdId: req.householdId!,
        name:     parsed.data.name,
        url:      safeUrl,
        events:   parsed.data.events,
        secret:   encryptWebhookSecret(parsed.data.secret),
        isActive: parsed.data.isActive ?? true,
      },
    });
    return res.status(201).json(maskWebhookSecret(webhook));
  } catch (err) {
    req.log.error({ err }, 'webhooks/POST /');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/webhooks/:id
router.put('/:id', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = WebhookSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  const updateData: {
    name?: string;
    url?: string;
    events?: Array<typeof WebhookSchema._type.events[number]>;
    secret?: string | null;
    isActive?: boolean;
  } = { ...parsed.data };
  if (updateData.url !== undefined) {
    try {
      updateData.url = await assertSafeOutboundUrl(updateData.url);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Unsafe webhook URL' });
    }
  }
  if ('secret' in updateData) {
    updateData.secret = encryptWebhookSecret(updateData.secret);
  }
  try {
    const existing = await prisma.webhook.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Webhook not found' });

    const webhook = await prisma.webhook.update({
      where: { id: req.params.id },
      data: updateData,
    });
    return res.json(maskWebhookSecret(webhook));
  } catch (err) {
    req.log.error({ err }, 'webhooks/PUT /:id');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/v1/webhooks/:id
router.delete('/:id', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
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
router.post('/:id/test', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const hook = await prisma.webhook.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!hook) return res.status(404).json({ error: 'Webhook not found' });
    const safeUrl = await assertSafeOutboundUrl(hook.url);

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

    const secret = decryptWebhookSecret(hook.secret);
    if (secret) {
      const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
      headers['X-Kuber-Signature'] = `sha256=${sig}`;
    }

    const response = await fetch(safeUrl, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });

    return res.json({ status: response.status, ok: response.ok });
  } catch (err: unknown) {
    return res.status(502).json({ error: (err as Error)?.message ?? 'Delivery failed' });
  }
});

// GET /api/v1/webhooks/:id/deliveries
router.get('/:id/deliveries', requireHouseholdAdmin, async (req: AuthRequest, res: Response) => {
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
