import crypto from 'crypto';
import { prisma } from './prisma';
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('webhook');

export type WebhookEvent =
  | 'transaction.created'
  | 'transaction.updated'
  | 'transaction.deleted'
  | 'goal.created'
  | 'goal.updated';

export async function fireWebhooks(
  householdId: string,
  event: WebhookEvent,
  payload: unknown,
): Promise<void> {
  try {
    const hooks = await prisma.webhook.findMany({
      where: {
        householdId,
        isActive: true,
        events: { has: event },
      },
    });

    if (hooks.length === 0) return;

    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });

    await Promise.allSettled(
      hooks.map(async (hook) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Kuber-Event': event,
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

        if (!response.ok) {
          log.warn({ hookId: hook.id, url: hook.url, status: response.status }, 'Webhook delivery failed');
        }
      }),
    );
  } catch (err) {
    // Never let webhook errors bubble up to the caller
    log.error({ err }, 'Webhook fire error');
  }
}
