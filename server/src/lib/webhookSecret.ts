import { decrypt, encrypt } from './encryption';

export function encryptWebhookSecret(secret: string | null | undefined): string | null {
  const trimmed = secret?.trim();
  return trimmed ? encrypt(trimmed) : null;
}

export function decryptWebhookSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  try {
    return decrypt(secret);
  } catch {
    return secret;
  }
}

export function maskWebhookSecret<T extends { secret: string | null }>(
  webhook: T,
): Omit<T, 'secret'> & { secretSet: boolean } {
  const { secret, ...safeWebhook } = webhook;
  return {
    ...safeWebhook,
    secretSet: !!secret,
  };
}
