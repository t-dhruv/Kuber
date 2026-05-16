import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/encryption', () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace(/^encrypted:/, '')),
}));

describe('imap config encryption helpers', () => {
  it('encrypts only the password field and marks config as encrypted', async () => {
    const { encrypt } = await import('../../src/lib/encryption');
    const { encryptImapConfig } = await import('../../src/lib/imapConfig');

    const result = encryptImapConfig({
      host: 'imap.example.test',
      port: 993,
      password: 'plain-password',
    });

    expect(encrypt).toHaveBeenCalledWith('plain-password');
    expect(result).toEqual({
      host: 'imap.example.test',
      port: 993,
      password: 'encrypted:plain-password',
      passwordEncrypted: true,
    });
  });

  it('decrypts encrypted configs and removes the storage marker', async () => {
    const { decrypt } = await import('../../src/lib/encryption');
    const { decryptImapConfig } = await import('../../src/lib/imapConfig');

    const result = decryptImapConfig({
      host: 'imap.example.test',
      port: 993,
      password: 'encrypted:plain-password',
      passwordEncrypted: true,
    });

    expect(decrypt).toHaveBeenCalledWith('encrypted:plain-password');
    expect(result).toEqual({
      host: 'imap.example.test',
      port: 993,
      password: 'plain-password',
    });
  });

  it('passes through legacy plaintext configs and removes the storage marker', async () => {
    const { decryptImapConfig } = await import('../../src/lib/imapConfig');

    expect(
      decryptImapConfig({
        host: 'imap.example.test',
        password: 'legacy-password',
        passwordEncrypted: false,
      }),
    ).toEqual({
      host: 'imap.example.test',
      password: 'legacy-password',
    });
  });
});


