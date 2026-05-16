import { describe, expect, it, vi } from 'vitest';

vi.mock('./encryption', () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => {
    if (value === 'broken-ciphertext') throw new Error('cannot decrypt');
    return value.replace(/^encrypted:/, '');
  }),
}));

describe('webhook secret helpers', () => {
  it('trims and encrypts non-empty webhook secrets', async () => {
    const { encrypt } = await import('./encryption');
    const { encryptWebhookSecret } = await import('./webhookSecret');

    expect(encryptWebhookSecret('  super-secret  ')).toBe('encrypted:super-secret');
    expect(encrypt).toHaveBeenCalledWith('super-secret');
  });

  it('stores null for blank or missing webhook secrets', async () => {
    const { encryptWebhookSecret } = await import('./webhookSecret');

    expect(encryptWebhookSecret('   ')).toBeNull();
    expect(encryptWebhookSecret(null)).toBeNull();
    expect(encryptWebhookSecret(undefined)).toBeNull();
  });

  it('decrypts encrypted webhook secrets', async () => {
    const { decrypt } = await import('./encryption');
    const { decryptWebhookSecret } = await import('./webhookSecret');

    expect(decryptWebhookSecret('encrypted:super-secret')).toBe('super-secret');
    expect(decrypt).toHaveBeenCalledWith('encrypted:super-secret');
  });

  it('returns legacy plaintext secret when decrypt fails', async () => {
    const { decryptWebhookSecret } = await import('./webhookSecret');

    expect(decryptWebhookSecret('broken-ciphertext')).toBe('broken-ciphertext');
  });

  it('masks webhook secrets without returning the secret value', async () => {
    const { maskWebhookSecret } = await import('./webhookSecret');

    expect(maskWebhookSecret({ id: 'webhook-1', url: 'https://example.test', secret: 'stored-secret' })).toEqual({
      id: 'webhook-1',
      url: 'https://example.test',
      secretSet: true,
    });
    expect(maskWebhookSecret({ id: 'webhook-2', url: 'https://example.test', secret: null })).toEqual({
      id: 'webhook-2',
      url: 'https://example.test',
      secretSet: false,
    });
  });
});
