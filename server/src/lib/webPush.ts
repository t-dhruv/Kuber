import webpush from 'web-push';
import { prisma } from './prisma';
import { createModuleLogger } from './logger.js';
const log = createModuleLogger('webPush');

let initialized = false;

function init() {
  if (initialized) return;
  const publicKey  = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT ?? 'mailto:admin@kuber.app';

  if (!publicKey || !privateKey) {
    log.warn('VAPID keys not set — push notifications disabled');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export async function sendPushToHousehold(
  householdId: string,
  title: string,
  body: string,
  url?: string,
): Promise<void> {
  try {
    init();
    if (!initialized) return;

    const subs = await prisma.pushSubscription.findMany({
      where: { householdId },
    });
    if (subs.length === 0) return;

    const payload = JSON.stringify({ title, body, url: url ?? '/' });

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
        } catch (err: unknown) {
          // 410 = subscription expired/unsubscribed — clean it up
          if ((err as { statusCode?: number })?.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            log.warn({ err, subId: sub.id }, 'Push notification failed');
          }
        }
      }),
    );
  } catch (err) {
    log.error({ err }, 'sendPushToHousehold error');
  }
}
