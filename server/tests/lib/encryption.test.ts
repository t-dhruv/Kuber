import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadEncryption() {
  return import('../../src/lib/encryption');
}

describe('encryption', () => {
  it('returns empty strings without requiring a key for empty input', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', '');
    const { decrypt, encrypt } = await loadEncryption();

    expect(encrypt('')).toBe('');
    expect(decrypt('')).toBe('');
  });

  it('round-trips plaintext using AES-GCM without exposing plaintext in ciphertext', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', TEST_KEY);
    const { decrypt, encrypt } = await loadEncryption();

    const ciphertext = encrypt('secret-api-key');

    expect(ciphertext).not.toContain('secret-api-key');
    expect(ciphertext.split(':')).toHaveLength(3);
    expect(decrypt(ciphertext)).toBe('secret-api-key');
  });

  it('uses a fresh IV for each encrypted value', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', TEST_KEY);
    const { encrypt } = await loadEncryption();

    expect(encrypt('same-secret')).not.toBe(encrypt('same-secret'));
  });

  it('rejects missing or incorrectly sized encryption keys', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'short');
    const { encrypt } = await loadEncryption();

    expect(() => encrypt('secret')).toThrow('AI_ENCRYPTION_KEY must be a 64-char hex string');
  });

  it('rejects malformed ciphertext values', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', TEST_KEY);
    const { decrypt } = await loadEncryption();

    expect(() => decrypt('not-valid-ciphertext')).toThrow('Invalid ciphertext format');
  });

  it('rejects tampered ciphertext authentication tags', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', TEST_KEY);
    const { decrypt, encrypt } = await loadEncryption();

    const [iv, authTag, encrypted] = encrypt('secret-api-key').split(':');
    const lastByte = authTag.slice(-2);
    const tamperedAuthTag = `${authTag.slice(0, -2)}${lastByte === '00' ? '01' : '00'}`;

    expect(() => decrypt(`${iv}:${tamperedAuthTag}:${encrypted}`)).toThrow();
  });
});

