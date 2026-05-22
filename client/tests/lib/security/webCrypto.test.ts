import { describe, expect, it } from 'vitest';
import {
  decryptField,
  deriveWrappingKey,
  encryptField,
  exportRawKey,
  generateDataKey,
  importRawKey,
} from '../../../src/lib/security/webCrypto';

describe('client WebCrypto field encryption', () => {
  it('round-trips an encrypted field with associated data', async () => {
    const key = await generateDataKey();
    const aad = { householdId: 'household-1', model: 'Account', field: 'name', recordId: 'account-1', keyVersion: 1 };

    const encrypted = await encryptField('Checking', key, 'key-1', aad);
    const decrypted = await decryptField(encrypted, key, aad);

    expect(encrypted.alg).toBe('AES-GCM');
    expect(encrypted.kid).toBe('key-1');
    expect(decrypted).toBe('Checking');
  });

  it('exports and imports raw AES keys', async () => {
    const key = await generateDataKey();
    const raw = await exportRawKey(key);
    const imported = await importRawKey(raw);
    const aad = { householdId: 'household-1', model: 'Account', field: 'name', recordId: 'account-1', keyVersion: 1 };

    const encrypted = await encryptField('Savings', imported, 'key-1', aad);
    await expect(decryptField(encrypted, imported, aad)).resolves.toBe('Savings');
  });

  it('derives a wrapping key from a passphrase and salt', async () => {
    const key = await deriveWrappingKey('correct horse battery staple', 'salt-value');
    const raw = await crypto.subtle.exportKey('raw', key);
    expect(raw.byteLength).toBe(32);
  });
});
