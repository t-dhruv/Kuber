import { describe, expect, it } from 'vitest';
import { isMfaLoginResponse, mfaMethodLabel, type LoginResponse } from '../../src/hooks/useAuth';

describe('login MFA response helpers', () => {
  it('detects generalized MFA responses', () => {
    const data: LoginResponse = { requireMfa: true, tempToken: 'temp', methods: ['email', 'backup'] };

    expect(isMfaLoginResponse(data)).toBe(true);
  });

  it('labels supported MFA methods', () => {
    expect(mfaMethodLabel('totp')).toBe('Authenticator');
    expect(mfaMethodLabel('email')).toBe('Email');
    expect(mfaMethodLabel('backup')).toBe('Backup');
  });
});
