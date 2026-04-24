import { createHmac } from 'crypto';
import { prisma } from './prisma';
import { createModuleLogger } from './logger.js';
const logger = createModuleLogger('webhook');

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 2000, 6000];

export type WebhookEvent =
  | 'transaction.created'
  | 'transaction.updated'
  | 'transaction.deleted'
  | 'goal.created'
  | 'goal.updated';

export async function fireWebhooks(
  householdId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: { householdId, isActive: true, events: { has: event } },
  });

  await Promise.allSettled(webhooks.map(wh => fireOne(wh, event, payload)));
}

async function fireOne(
  webhook: { id: string; url: string; secret: string | null },
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify({ event, data: payload });
  const signature = webhook.secret
    ? createHmac('sha256', webhook.secret).update(body).digest('hex')
    : undefined;

  const delivery = await prisma.webhookDelivery.create({
    data: {
      webhookId:     webhook.id,
      event,
      payload:       payload as any,
      lastAttemptAt: new Date(),
    },
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(RETRY_DELAYS_MS[attempt - 1]);

    try {
      const resp = await fetch(webhook.url, {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'X-Kuber-Event':  event,
          ...(signature ? { 'X-Kuber-Signature': `sha256=${signature}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      const responseBody = await resp.text().catch(() => '');

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data:  {
          statusCode:    resp.status,
          responseBody:  responseBody.slice(0, 1000),
          success:       resp.ok,
          attempts:      attempt,
          lastAttemptAt: new Date(),
        },
      });

      if (resp.ok) return;
    } catch (err) {
      logger.warn({ err, webhookId: webhook.id, attempt }, 'Webhook fire failed');
      if (attempt === MAX_ATTEMPTS) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data:  { attempts: attempt, lastAttemptAt: new Date() },
        });
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
