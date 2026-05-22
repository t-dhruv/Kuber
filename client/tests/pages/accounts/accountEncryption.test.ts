import { describe, expect, it } from 'vitest';
import { displayAccountLabel } from '../../../src/pages/accounts/lib/accountEncryption';

describe('account encrypted label mapping', () => {
  it('uses plaintext fallback for legacy rows', () => {
    expect(displayAccountLabel({ name: 'Checking', nameEncrypted: null }, null)).toBe('Checking');
  });

  it('shows locked placeholder when encrypted data exists but no key is unlocked', () => {
    expect(displayAccountLabel({
      name: 'Checking',
      nameEncrypted: { v: 1, alg: 'AES-GCM', kid: 'key-1', iv: 'iv', ct: 'ct' },
    }, null)).toBe('Locked account');
  });
});
