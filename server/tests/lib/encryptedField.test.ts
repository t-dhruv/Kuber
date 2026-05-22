import { describe, expect, it } from 'vitest';
import { encryptedFieldSchema, parseEncryptedField } from '../../src/lib/encryptedField';

describe('encrypted field envelopes', () => {
  it('accepts v1 AES-GCM envelopes', () => {
    const envelope = {
      v: 1,
      alg: 'AES-GCM',
      kid: 'key_1',
      iv: 'base64url-iv',
      ct: 'base64url-ciphertext',
    };

    expect(encryptedFieldSchema.parse(envelope)).toEqual(envelope);
    expect(parseEncryptedField(envelope)).toEqual(envelope);
  });

  it('rejects unsupported algorithms', () => {
    expect(() => encryptedFieldSchema.parse({
      v: 1,
      alg: 'AES-CBC',
      kid: 'key_1',
      iv: 'iv',
      ct: 'ct',
    })).toThrow();
  });

  it('allows null encrypted fields during migration', () => {
    expect(parseEncryptedField(null)).toBeNull();
  });
});
