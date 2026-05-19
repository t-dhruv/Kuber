import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import authRouter from '../../src/routes/auth';
import { prisma } from '../../src/lib/prisma';
import { createRefreshToken } from '../../src/lib/token';
import { verify as totpVerify } from 'otplib';
import { toDataURL } from 'qrcode';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userPreference: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../src/lib/token', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/token')>('../../src/lib/token');
  return {
    ...actual,
    createRefreshToken: vi.fn(),
  };
});

vi.mock('../../src/lib/email', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendAccountLockoutEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}));

vi.mock('../../src/lib/default-categories', () => ({
  seedDefaultCategories: vi.fn(),
}));

vi.mock('otplib', () => ({
  generateSecret: vi.fn(() => 'TOTPSECRET'),
  generateURI: vi.fn(() => 'otpauth://totp/Kuber:user@example.com'),
  verify: vi.fn(() => true),
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,qr')),
}));

const passwordHash = bcrypt.hashSync('CorrectPassword123!', 12);

const user = {
  id: 'user-1',
  email: 'user@example.com',
  passwordHash,
  firstName: 'Ada',
  lastName: 'Lovelace',
  avatar: null,
  timezone: 'America/Toronto',
  theme: 'system',
  failedLoginAttempts: 0,
  lockedUntil: null,
  householdMembers: [{ householdId: 'household-1' }],
  totpEnabled: true,
  totpSecret: 'TOTPSECRET',
  backupCodes: [] as string[],
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

function accessToken() {
  return jwt.sign({ userId: 'user-1', householdId: 'household-1', email: 'user@example.com' }, process.env.JWT_SECRET!);
}

function tempToken(rememberMe = false) {
  return jwt.sign({ userId: 'user-1', purpose: '2fa', rememberMe }, process.env.JWT_SECRET!);
}

describe('auth 2FA routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    vi.mocked(createRefreshToken).mockResolvedValue({ rawToken: 'refresh-raw', tokenHash: 'refresh-hash' } as any);
    vi.mocked(totpVerify).mockReturnValue(true as any);
  });

  it('returns a temporary challenge token when login credentials are valid and TOTP is enabled', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);

    const res = await request(makeApp())
      .post('/auth/login')
      .send({ email: 'USER@example.com', password: 'CorrectPassword123!', rememberMe: true });

    expect(res.status).toBe(200);
    expect(res.body.requireTotp).toBe(true);
    expect(jwt.verify(res.body.tempToken, 'test-secret')).toMatchObject({
      userId: 'user-1',
      purpose: '2fa',
      rememberMe: true,
    });
    expect(createRefreshToken).not.toHaveBeenCalled();
  });

  it('starts 2FA setup by storing a pending secret and returning a QR code', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'user@example.com' } as any);
    vi.mocked(prisma.userPreference.upsert).mockResolvedValue({} as any);

    const res = await request(makeApp())
      .post('/auth/2fa/setup')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send();

    expect(res.status).toBe(200);
    expect(toDataURL).toHaveBeenCalledWith('otpauth://totp/Kuber:user@example.com');
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith({
      where: { userId_key: { userId: 'user-1', key: 'totp_pending_secret' } },
      update: { value: 'TOTPSECRET' },
      create: { userId: 'user-1', key: 'totp_pending_secret', value: 'TOTPSECRET' },
    });
    expect(res.body).toEqual({ secret: 'TOTPSECRET', qrCodeDataUrl: 'data:image/png;base64,qr' });
  });

  it('enables 2FA after verifying the pending secret and returns one-time backup codes', async () => {
    vi.mocked(prisma.userPreference.findUnique).mockResolvedValue({
      userId: 'user-1',
      key: 'totp_pending_secret',
      value: 'TOTPSECRET',
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);
    vi.mocked(prisma.userPreference.delete).mockResolvedValue({} as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as any);

    const res = await request(makeApp())
      .post('/auth/2fa/enable')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({ code: '123456' });

    expect(res.status).toBe(200);
    expect(totpVerify).toHaveBeenCalledWith({ token: '123456', secret: 'TOTPSECRET' });
    expect(res.body.backupCodes).toHaveLength(8);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        totpSecret: 'TOTPSECRET',
        totpEnabled: true,
        backupCodes: expect.arrayContaining([expect.any(String)]),
      }),
    });
    expect(prisma.userPreference.delete).toHaveBeenCalledWith({
      where: { userId_key: { userId: 'user-1', key: 'totp_pending_secret' } },
    });
  });

  it('rejects invalid TOTP codes during challenge validation', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
    vi.mocked(totpVerify).mockReturnValue(false as any);

    const res = await request(makeApp())
      .post('/auth/2fa/validate')
      .send({ tempToken: tempToken(), code: '000000' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid TOTP code' });
    expect(createRefreshToken).not.toHaveBeenCalled();
  });

  it('exchanges a valid TOTP challenge for access and refresh tokens', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);

    const res = await request(makeApp())
      .post('/auth/2fa/validate')
      .send({ tempToken: tempToken(true), code: '123456' });

    expect(res.status).toBe(200);
    expect(createRefreshToken).toHaveBeenCalledWith('user-1', undefined, true);
    expect(res.headers['set-cookie'][0]).toContain('refreshToken=refresh-raw');
    expect(res.body.user).toMatchObject({ id: 'user-1', householdId: 'household-1' });
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('uses a backup code once and removes it from the stored list', async () => {
    const backupHash = bcrypt.hashSync('backup-1', 10);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...user,
      backupCodes: ['unused-hash', backupHash, 'later-hash'],
    } as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const res = await request(makeApp())
      .post('/auth/2fa/use-backup')
      .send({ tempToken: tempToken(), backupCode: 'backup-1' });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { backupCodes: ['unused-hash', 'later-hash'] },
    });
    expect(res.body.backupCodesRemaining).toBe(2);
  });

  it('disables 2FA only after confirming the account password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as any);
    vi.mocked(prisma.user.update).mockResolvedValue({} as any);

    const res = await request(makeApp())
      .post('/auth/2fa/disable')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({ password: 'CorrectPassword123!' });

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { totpSecret: null, totpEnabled: false, backupCodes: [] },
    });
    expect(res.body).toEqual({ message: 'Two-factor authentication disabled' });
  });
});


